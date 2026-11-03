import './isolate.mjs';
// All review claims below concern generated synthetic fixtures, never a person.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {analyzeCuts,requireCutQc} from '../scripts/lib/cut-qc.mjs';
import {captionsToSrt} from '../scripts/lib/srt.mjs';
const node=(args)=>spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:8*1024*1024});
export function checkWorkflowMedia(output) {
  const dir=path.join(output,'workflow-regressions');fs.mkdirSync(dir);
  const json=(name,value)=>{const file=path.join(dir,name);fs.writeFileSync(file,JSON.stringify(value,null,2));return file;};
  const generate=(name,filter)=>{
    const file=path.join(dir,name),r=spawnSync('ffmpeg',['-v','error','-n','-f','lavfi','-i',filter,'-ar','48000',file],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);return file;
  };
  const pulse=generate('pulses.wav',"aevalsrc='if(between(t,0.5,0.58)+between(t,1.42,1.5),0.15*sin(2*PI*440*t),0.000001*sin(2*PI*400*t))':s=48000:d=2");
  const pulseCuts=json('pulse.cuts.json',{source:pulse,clips:[{in:0,out:0.5},{in:1.5,out:2}]});
  const risk=analyzeCuts(pulseCuts);assert.equal(risk.status,'needs-review');assert.equal(risk.unresolved.length,2);assert.equal(risk.coverage.analyzed,2);assert.throws(()=>requireCutQc(risk));
  const single=analyzeCuts(json('single.cuts.json',{source:pulse,clips:[{in:0.52,out:1.48}]}));assert.equal(single.coverage.analyzed,2);assert.equal(single.unresolved.length,2);
  const steady=generate('steady.wav','sine=frequency=440:duration=2');
  assert.equal(analyzeCuts(json('steady.cuts.json',{source:steady,clips:[{in:0,out:0.5},{in:1.5,out:2}]})).status,'needs-review');
  const full=analyzeCuts(json('full.cuts.json',{source:steady,clips:[{in:0,out:2}]}));assert.equal(full.status,'pass');assert.equal(full.coverage.sourceBoundaries,2);assert.equal(full.coverage.analyzed,0);
  const short=analyzeCuts(json('short.cuts.json',{source:steady,clips:[{in:0.02,out:2}]}));assert.equal(short.status,'needs-review');assert.equal(short.coverage.inconclusive,1);
  const corrupt=path.join(dir,'corrupt.wav');fs.writeFileSync(corrupt,'not audio');assert.throws(()=>analyzeCuts(json('corrupt.cuts.json',{source:corrupt,clips:[{in:0,out:1}]})),/analysis failed/);
  const missing=json('missing.cuts.json',{source:path.join(dir,'missing.wav'),clips:[{in:0,out:1}]});
  for(const args of [[missing],[pulseCuts,'--margin','not-a-number']]){const r=node(['scripts/check-cut-edges.mjs',...args]);assert.notEqual(r.status,0);assert.doesNotMatch(r.stdout,/PASS/);}
  const review=json('synthetic-listening-review.json',{schemaVersion:1,sourceSha256:risk.source.sha256,cutsSha256:risk.cuts.sha256,settings:Object.fromEntries(Object.entries(risk.settings).reverse()),reviewedBy:'Synthetic test fixture (not owner approval)',reviewedAt:new Date().toISOString(),decisions:risk.unresolved.map(edgeId=>({edgeId,reason:'Synthetic fixture review-path test only.'}))});
  assert.equal(analyzeCuts(pulseCuts,{reviewPath:review}).status,'pass');
  const originalCuts=fs.readFileSync(pulseCuts);fs.writeFileSync(pulseCuts,JSON.stringify({source:pulse,clips:[{in:0,out:0.49},{in:1.5,out:2}]}));assert.throws(()=>analyzeCuts(pulseCuts,{reviewPath:review}),/does not match/);fs.writeFileSync(pulseCuts,originalCuts);
  const bytes=fs.readFileSync(pulse);fs.appendFileSync(pulse,'synthetic hash change');assert.throws(()=>analyzeCuts(pulseCuts,{reviewPath:review}),/does not match/);fs.writeFileSync(pulse,bytes);
  const whisper=json('whisper.json',{transcription:[{text:'One',offsets:{from:800,to:800}},{text:'two',offsets:{from:900,to:950}},{text:'three',offsets:{from:1450,to:1500}}]});
  const captions=path.join(dir,'converted.json'),conversion=node(['scripts/whisper-to-captions.mjs',whisper,captions,'--audio',pulse]);assert.equal(conversion.status,0,conversion.stderr);
  const converted=JSON.parse(fs.readFileSync(captions,'utf8'));assert.equal(converted.review.status,'needs-review');assert.ok(converted.review.timingRepairs.length);assert.equal(converted.timingBounds.source,'audio-probe');assert.doesNotThrow(()=>captionsToSrt(converted.captions,{endMs:2000}));
  const result={missingAndCorruptSourceRefused:true,invalidMarginRefused:true,edgePulseAndSteadyEnergyFlagged:true,singleClipEndpointsAnalyzed:true,sourceBoundariesReportedHonestly:true,shortContextNeedsReview:true,syntheticListeningReviewBoundToSourceCutsSettings:true,changedSourceOrCutsReviewRefused:true,postPauseTimingRepairExportsSrtUnreviewed:true};
  fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(result,null,2));console.log('PASS workflow regressions: fail-closed cut QC, endpoints, review hashes and post-pause caption repairs.');return result;
}
