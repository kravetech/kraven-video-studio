// Conservative cut-risk analysis. Energy is not phoneme recognition; explicit
// coverage and human listening remain necessary even when no risk is flagged.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {snapshotFile} from './render-record.mjs';

export const CUT_QC_VERSION = 'cut-edges-v2';
const WINDOW_MS=10,EDGE_MS=40,CONTEXT_MS=400,ABSOLUTE_DB=-45;
const checked=(command,args,binary=false)=>{
  const result=spawnSync(command,args,{encoding:binary?undefined:'utf8',maxBuffer:8*1024*1024});
  if(result.error)throw new Error(`${command} could not run: ${result.error.message}`);
  if(result.status!==0)throw new Error(`${command} analysis failed: ${result.stderr?.toString().slice(-1200)}`);
  return result.stdout;
};
const rms=values=>{
  if(!values.length)throw new Error('Cut analysis returned no audio samples.');
  const mean=values.reduce((sum,value)=>sum+value*value,0)/values.length;
  return 10*Math.log10(Math.max(mean,1e-12));
};
const percentile=values=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*0.2)];
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const validateMargin=value=>{if(!finite(value)||value<=0||value>60)throw new Error('Cut margin must be a finite number greater than 0 and at most 60 dB.');};

export function classifyDiscardedAudio(samples,kind,marginDb=8) {
  validateMargin(marginDb);
  if(!['in','out'].includes(kind)||!Array.isArray(samples)||!samples.length||!samples.every(Number.isFinite))throw new Error('Missing/invalid PCM or edge type during cut analysis.');
  const windows=[];for(let at=0;at+160<=samples.length;at+=160)windows.push(rms(samples.slice(at,at+160)));
  if(windows.length<EDGE_MS/WINDOW_MS)return {status:'inconclusive',reason:'Less than 40 ms of discarded context is available; listen to this boundary.'};
  const count=16000*EDGE_MS/1000,edgeDb=rms(kind==='in'?samples.slice(-count):samples.slice(0,count)),floorDb=percentile(windows);
  const risk=edgeDb>=ABSOLUTE_DB||edgeDb-floorDb>=marginDb;
  return {status:risk?'risk':'clear',edgeDb,floorDb,aboveFloorDb:edgeDb-floorDb,reason:risk?'Discarded edge has substantial energy or contrast; check by ear.':'No energy risk detected in the examined discarded context.'};
}

export function analyzeCuts(cutsPath,{marginDb=8,reviewPath}={}) {
  validateMargin(marginDb);
  const cutList=JSON.parse(readFileSync(cutsPath,'utf8'));
  if(!Array.isArray(cutList.clips)||!cutList.clips.length)throw new Error('Cut list must contain at least one kept clip.');
  const source=snapshotFile(cutList.source),cuts=snapshotFile(cutsPath);
  const probe=JSON.parse(checked('ffprobe',['-v','error','-show_entries','stream=codec_type,duration:format=duration','-of','json',source.path]));
  const audio=probe.streams?.find(stream=>stream.codec_type==='audio');
  const duration=[audio?.duration,probe.format?.duration].map(Number).find(value=>Number.isFinite(value)&&value>0);
  if(!audio||!Number.isFinite(duration)||duration<=0)throw new Error('Cut source needs readable audio with a finite positive duration.');
  const clips=cutList.clips;
  for(const [index,clip] of clips.entries())if(!finite(clip.in)||!finite(clip.out)||clip.in<0||clip.out<=clip.in||clip.out>duration+0.005)throw new Error(`Invalid source range for clip ${index+1}.`);
  const settings={marginDb,windowMs:WINDOW_MS,edgeMs:EDGE_MS,contextMs:CONTEXT_MS,absoluteThresholdDb:ABSOLUTE_DB};
  const edges=[];let masterSec=0;
  for(const [index,clip] of clips.entries()) {
    for(const kind of ['in','out']) {
      const position=clip[kind];
      const edge={id:`clip-${index+1}-${kind}`,clip:index+1,kind,sourceSec:position,masterSec:masterSec+(kind==='out'?clip.out-clip.in:0)};
      const contiguous=kind==='in'?index>0&&Math.abs(clips[index-1].out-position)<0.001:index<clips.length-1&&Math.abs(position-clips[index+1].in)<0.001;
      if(contiguous){edges.push({...edge,status:'contiguous',reason:'No source audio removed at this join.'});continue;}
      if((kind==='in'&&position<=0.001)||(kind==='out'&&duration-position<=0.001)){edges.push({...edge,status:'source-boundary',reason:'No discarded source audio exists beyond the file boundary.'});continue;}
      const from=kind==='in'?Math.max(0,position-CONTEXT_MS/1000):position;
      const to=kind==='in'?position:Math.min(duration,position+CONTEXT_MS/1000);
      const bytes=checked('ffmpeg',['-v','error','-ss',String(from),'-t',String(to-from),'-i',source.path,'-vn','-ac','1','-ar','16000','-f','f32le','-'],true);
      if(bytes.length%4!==0)throw new Error('Invalid PCM output during cut analysis.');
      const samples=Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4));
      edges.push({...edge,...classifyDiscardedAudio(samples,kind,marginDb)});
    }
    masterSec+=clip.out-clip.in;
  }
  const pending=edges.filter(edge=>['risk','inconclusive'].includes(edge.status));
  let review,reviewFingerprint;
  if(reviewPath) {
    reviewFingerprint=snapshotFile(reviewPath);review=JSON.parse(readFileSync(reviewPath,'utf8'));
    const settingsMatch=review.settings&&Object.keys(review.settings).length===Object.keys(settings).length&&Object.entries(settings).every(([key,value])=>review.settings[key]===value);
    if(review.schemaVersion!==1||review.sourceSha256!==source.sha256||review.cutsSha256!==cuts.sha256||!settingsMatch||typeof review.reviewedBy!=='string'||!review.reviewedBy.trim()||!Number.isFinite(Date.parse(review.reviewedAt))||!Array.isArray(review.decisions))throw new Error('Cut listening review does not match these source/cuts/settings or lacks reviewer metadata.');
    const accepted=new Set();
    for(const decision of review.decisions) {
      if(!pending.some(edge=>edge.id===decision.edgeId)||accepted.has(decision.edgeId)||typeof decision.reason!=='string'||!decision.reason.trim())throw new Error('Cut review needs unique current edge IDs and a reason for each listening decision.');
      accepted.add(decision.edgeId);
    }
    for(const edge of pending)if(accepted.has(edge.id))edge.listeningReview={reviewedBy:review.reviewedBy,reason:review.decisions.find(decision=>decision.edgeId===edge.id).reason};
  }
  for(const expected of [source,cuts,...(reviewFingerprint?[reviewFingerprint]:[])]) {
    const current=snapshotFile(expected.path);
    if(current.sha256!==expected.sha256||current.bytes!==expected.bytes)throw new Error('Cut-QC input changed during analysis; run the check again.');
  }
  const unresolved=pending.filter(edge=>!edge.listeningReview);
  return {schemaVersion:1,algorithmVersion:CUT_QC_VERSION,checkedAt:new Date().toISOString(),status:unresolved.length?'needs-review':'pass',source,cuts,settings,
    ...(reviewFingerprint?{review:reviewFingerprint}:{}),edges,coverage:{clips:clips.length,totalEdges:edges.length,analyzed:edges.filter(edge=>['clear','risk'].includes(edge.status)).length,sourceBoundaries:edges.filter(edge=>edge.status==='source-boundary').length,contiguous:edges.filter(edge=>edge.status==='contiguous').length,inconclusive:edges.filter(edge=>edge.status==='inconclusive').length},unresolved:unresolved.map(edge=>edge.id)};
}

export function requireCutQc(result) {
  if(result.status!=='pass')throw new Error(`Cut QC needs listening review/correction at ${result.unresolved.join(', ')}. No intact-word certification is implied by this heuristic.`);
}
