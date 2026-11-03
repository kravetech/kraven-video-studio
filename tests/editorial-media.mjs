import './isolate.mjs';
// Generates decisions only for artificial patterns/tones, never owner media.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {snapshotFile} from '../scripts/lib/render-record.mjs';
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2));
const node=(script,args)=>{const r=spawnSync(process.execPath,[script,...args],{encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stdout+r.stderr);};
function decisions(review,out,pacing=false) {
  const data=JSON.parse(fs.readFileSync(review));
  json(out,{reviewSha256:snapshotFile(review).sha256,decidedBy:'Synthetic fixture; not owner approval',decisions:data.candidates.map(c=>({id:c.id,decision:'keep',reason:'Deliberate generated regression fixture; this does not approve any real footage.'})),...(pacing?{visualReview:{status:'complete',notes:'Synthetic color-pattern fixture inspected by automated caption/card/crop checks. No real editorial approval.'}}:{})});
}
export function syntheticTake(source,working,name,words) {
  const audio=path.join(working,`${name}-review.wav`),transcript=path.join(working,`${name}-whisper.json`),review=path.join(working,`${name}-take-review.json`),decisionFile=path.join(working,`${name}-take-decisions.json`);
  const decode=spawnSync('ffmpeg',['-v','error','-n','-i',source,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',audio],{encoding:'utf8'});assert.equal(decode.status,0,decode.stderr);
  json(transcript,{transcription:words.split(' ').map((text,i)=>({text,offsets:{from:300+i*500,to:750+i*500}}))});
  node('scripts/review-takes.mjs',[transcript,audio,'--source',source,'--out',review]);decisions(review,decisionFile);
  return {takeReview:review,takeDecisions:decisionFile};
}
export function syntheticPacing(video,captions,edit,project) {
  node('scripts/review-pacing.mjs',[video,captions,'--edit',edit,'--out',project.pacingReview]);
  decisions(project.pacingReview,project.pacingDecisions,true);
  node('scripts/review-pacing.mjs',['--check',project.pacingReview,project.pacingDecisions,'--report',path.join(path.dirname(project.pacingReview),'pacing-decisions.md')]);
}
