import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {normalizeCaptionTimings} from '../src/captions/timing.ts';
import {captionsToSrt} from '../scripts/lib/srt.mjs';
import {classifyDiscardedAudio,analyzeCuts} from '../scripts/lib/cut-qc.mjs';
import {PROFILES} from '../src/profiles.ts';
const word=(text,startMs,endMs)=>({text,startMs,endMs,timestampMs:-1,confidence:null});
const fixture=(t)=>{const dir=fs.mkdtempSync(path.join(tmpdir(),'studio-workflow-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};

test('caption timing repairs zero, duplicate, reversed and trailing words without changing text',()=>{
  for(const input of [
    [word('one',100,100),word('two',300,400)],
    [word('one',100,100),word('two',100,100),word('three',400,500)],
    [word('one',200,300),word('two',100,150),word('three',400,500)],
    [word('one',10,100),word('two',500,500)],
    [word('one',10,700)],
  ]) {
    const original=structuredClone(input),result=normalizeCaptionTimings(input,500);
    assert.deepEqual(input,original);assert.deepEqual(result.captions.map(w=>w.text),input.map(w=>w.text));
    assert.ok(result.repairs.length>0);
    for(let i=0;i<result.captions.length;i++){const w=result.captions[i];assert.ok(w.startMs>=0&&w.endMs>w.startMs&&w.endMs<=500);assert.equal(w.timestampMs,Math.round((w.startMs+w.endMs)/2));if(i)assert.ok(w.startMs>=result.captions[i-1].endMs);}
    assert.doesNotThrow(()=>captionsToSrt(result.captions,{endMs:500}));
  }
});

test('unrepairable and nonfinite caption offsets fail without discarding words',()=>{
  for(const input of [[word('bad',NaN,100)],[word('bad',600,700)],[word('bad',-1,20)]])assert.throws(()=>normalizeCaptionTimings(input,500));
  assert.throws(()=>normalizeCaptionTimings([word('a',0,0),word('b',0,0)],1));
  assert.throws(()=>normalizeCaptionTimings([],500));
});

test('converter logs repairs and leaves output unreviewed; SRT export then succeeds',t=>{
  const dir=fixture(t),input=path.join(dir,'whisper.json'),output=path.join(dir,'captions.json');
  fs.writeFileSync(input,JSON.stringify({transcription:[{text:'Hello',offsets:{from:100,to:100}},{text:'world',offsets:{from:100,to:300}}]}));
  const result=spawnSync(process.execPath,['scripts/whisper-to-captions.mjs',input,output,'--duration-ms','500'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const parsed=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.equal(parsed.review.status,'needs-review');assert.equal(parsed.review.reviewedBy,null);assert.ok(parsed.review.timingRepairs.length);assert.equal(parsed.review.timingHash,undefined);
  assert.doesNotThrow(()=>captionsToSrt(parsed.captions,{endMs:500}));
  const before=fs.readFileSync(input,'utf8');
  assert.notEqual(spawnSync(process.execPath,['scripts/whisper-to-captions.mjs',input,input,'--duration-ms','500'],{encoding:'utf8'}).status,0);assert.equal(fs.readFileSync(input,'utf8'),before);
});

test('cut-risk energy detects steady energy and edge pulses; silence and short context are explicit',()=>{
  const steady=Array.from({length:6400},(_,i)=>0.1*Math.sin(2*Math.PI*440*i/16000));
  const pulse=steady.map((value,i)=>i<640?value:value*0.00001);
  assert.equal(classifyDiscardedAudio(steady,'out').status,'risk');
  assert.equal(classifyDiscardedAudio(pulse,'out').status,'risk');
  assert.equal(classifyDiscardedAudio(new Array(6400).fill(0),'in').status,'clear');
  assert.equal(classifyDiscardedAudio(new Array(320).fill(0),'in').status,'inconclusive');
  for(const margin of [NaN,Infinity,-1,0,61])assert.throws(()=>classifyDiscardedAudio(steady,'out',margin));
  assert.throws(()=>classifyDiscardedAudio([],'out'));
});

test('cut-QC CLI refuses missing source and malformed margins without emitting PASS',t=>{
  const dir=fixture(t),cuts=path.join(dir,'cuts.json');fs.writeFileSync(cuts,JSON.stringify({source:path.join(dir,'missing.wav'),clips:[{in:0,out:1}]}));
  for(const args of [[cuts],[cuts,'--margin','not-a-number'],[cuts,'--margin'],[cuts,'--unknown']]) {
    const r=spawnSync(process.execPath,['scripts/check-cut-edges.mjs',...args],{encoding:'utf8'});assert.notEqual(r.status,0);assert.doesNotMatch(r.stdout,/PASS/);
  }
  assert.throws(()=>analyzeCuts(cuts,{marginDb:NaN}),/finite/);
});

test('caption policy keeps vertical burned text and horizontal SRT-only output',()=>{
  assert.equal(PROFILES['vertical-1080'].burnedCaptions,true);
  assert.equal(PROFILES['horizontal-1080'].burnedCaptions,false);
});
