import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {snapshotFile} from '../scripts/lib/render-record.mjs';
import {checkEditorial,takeForEdit,pacingCandidates} from '../scripts/lib/editorial-review.mjs';

const script=path.resolve('scripts/review-takes.mjs');
const run=(args,env={})=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:{...process.env,...env}});
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'editorial-test-'));
  t.after(()=>{const resolved=path.resolve(dir);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('editorial-test-'))throw new Error('Unsafe test cleanup.');fs.rmSync(resolved,{recursive:true,force:true});});
  const wav=path.join(dir,'source.wav'),pcm=Buffer.alloc(16000*5*2),header=Buffer.alloc(44);
  for(let i=0;i<pcm.length/2;i++)pcm.writeInt16LE(Math.round(3000*Math.sin(2*Math.PI*220*i/16000)),i*2);
  header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVE',8);header.write('fmt ',12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(16000,24);header.writeUInt32LE(32000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);fs.writeFileSync(wav,Buffer.concat([header,pcm]));
  const transcript=path.join(dir,'source.json'),review=path.join(dir,'review.json'),decisions=path.join(dir,'decisions.json');
  const words=[['ito',.2,.4],['ito',.5,.7],['ang',.8,1],['raw',1.1,1.3],['file',1.4,1.6],['ang',1.8,2],['raw',2.1,2.3],['file',2.4,2.6],['now.',4,4.3]];
  json(transcript,{transcription:words.map(([text,a,b])=>({text,offsets:{from:a*1000,to:b*1000}}))});
  const build=(extra=[])=>run([transcript,wav,'--source',wav,'--out',review,...extra]);
  const decide=(change=x=>x)=>{const data=JSON.parse(fs.readFileSync(review));json(decisions,{reviewSha256:snapshotFile(review).sha256,decidedBy:'Synthetic fixture only',decisions:data.candidates.map(c=>change({id:c.id,decision:'keep',reason:'Synthetic regression; no owner approval.'}))});};
  return {dir,wav,transcript,review,decisions,build,decide};
}
test('take review reports single-word repeats, phrases and noisy wordless gaps without deleting anything',t=>{
  const f=fixture(t),before=snapshotFile(f.wav).sha256;
  assert.equal(f.build().status,0);
  const review=JSON.parse(fs.readFileSync(f.review));
  for(const kind of ['word-repeat','restart','gap'])assert.ok(review.candidates.some(c=>c.kind===kind),kind);
  assert.equal(snapshotFile(f.wav).sha256,before);assert.equal(review.schemaVersion,2);
  f.decide();assert.equal(checkEditorial(f.review,f.decisions,{kind:'take'}).status,'pass');
});
test('review outputs protect input collisions, hard links and raw roots even with force',t=>{
  const f=fixture(t),before=snapshotFile(f.wav).sha256;
  assert.notEqual(run([f.transcript,f.wav,'--source',f.wav,'--out',f.wav,'--force']).status,0);
  const alias=path.join(f.dir,'alias.wav');fs.linkSync(f.wav,alias);
  assert.notEqual(run([f.transcript,f.wav,'--source',f.wav,'--out',alias,'--force']).status,0);
  const raw=path.join(f.dir,'raw');fs.mkdirSync(raw);const out=path.join(raw,'review.json');
  assert.notEqual(run([f.transcript,f.wav,'--source',f.wav,'--out',out,'--force'],{KRAVEN_PROTECTED_ROOTS:raw}).status,0);
  assert.equal(fs.existsSync(out),false);assert.equal(snapshotFile(f.wav).sha256,before);
});
test('take review refuses invalid numbers, unknown arguments, invalid ranges and non-16k WAV',t=>{
  const f=fixture(t);
  for(const extra of [['--min-pause-ms','NaN'],['--window-sec','Infinity'],['--ranges','2-1'],['--ranges','0-10'],['--oops','1']]){assert.notEqual(f.build(extra).status,0);assert.equal(fs.existsSync(f.review),false);}
  const bytes=fs.readFileSync(f.wav);bytes.writeUInt32LE(48000,24);bytes.writeUInt32LE(96000,28);fs.writeFileSync(f.wav,bytes);
  assert.notEqual(f.build().status,0);assert.equal(fs.existsSync(f.review),false);
});
test('current review decisions invalidate when transcript or audio changes',t=>{
  const f=fixture(t);assert.equal(f.build().status,0);f.decide();
  const original=fs.readFileSync(f.transcript);fs.appendFileSync(f.transcript,' ');assert.throws(()=>checkEditorial(f.review,f.decisions,{kind:'take'}),/Changed editorial input/);fs.writeFileSync(f.transcript,original);
  fs.appendFileSync(f.wav,'changed');assert.throws(()=>checkEditorial(f.review,f.decisions,{kind:'take'}),/Changed editorial input/);
});
test('every decision needs unique IDs/reasons; pending cases block final use and missing take review blocks assembly',t=>{
  const f=fixture(t);assert.equal(f.build().status,0);f.decide(x=>({...x,decision:'review'}));
  assert.equal(checkEditorial(f.review,f.decisions,{kind:'take'}).status,'needs-review');
  assert.throws(()=>takeForEdit({source:f.wav,segments:[{in:0,out:5}],takeReview:f.review,takeDecisions:f.decisions},{final:true}),/Unresolved/);
  assert.throws(()=>takeForEdit({source:f.wav,segments:[]}),/required before assembly/);
  f.decide();const d=JSON.parse(fs.readFileSync(f.decisions));d.decisions.push(d.decisions[0]);json(f.decisions,d);assert.throws(()=>checkEditorial(f.review,f.decisions,{kind:'take'}),/unique/);
  f.decide(x=>({...x,reason:' '}));assert.throws(()=>checkEditorial(f.review,f.decisions,{kind:'take'}),/reason/);
});
test('selected-range review never emits crossing candidates and refuses uncovered edit ranges',t=>{
  const f=fixture(t);assert.equal(f.build(['--ranges','0-1.7']).status,0);f.decide();
  const r=JSON.parse(fs.readFileSync(f.review));assert.ok(r.candidates.every(c=>c.start>=0&&c.end<=1.7));
  assert.throws(()=>takeForEdit({source:f.wav,segments:[{in:0,out:5}],takeReview:f.review,takeDecisions:f.decisions}),/does not cover/);
});
test('pacing candidates include noisy wordless intervals and sustained visual changes, with intentional beats left for review',()=>{
  const words=[{text:'one',start:.1,end:.7},{text:'two',start:3,end:3.4}],motion=[{time:1,score:40},{time:1.5,score:50},{time:2,score:5}];
  const candidates=pacingCandidates(words,4,motion);
  assert.ok(candidates.some(c=>c.kind==='wordless-gap'&&c.start===.7&&c.end===3));
  assert.ok(candidates.some(c=>c.kind==='visual-change'));
  assert.ok(candidates.every(c=>!c.decision));
});
test('pacing requires visual inspection, rejects unresolved final cases and detects changed video',t=>{
  const f=fixture(t),review={schemaVersion:2,algorithmVersion:'editorial-v2',kind:'pacing',inputs:{video:snapshotFile(f.wav),captions:snapshotFile(f.transcript)},candidates:[{id:'p-001',kind:'wordless-gap',start:1,end:2}]};
  json(f.review,review);
  const d={reviewSha256:snapshotFile(f.review).sha256,decidedBy:'Synthetic fixture',decisions:[{id:'p-001',decision:'keep',reason:'Synthetic intentional beat.'}]};
  json(f.decisions,d);assert.throws(()=>checkEditorial(f.review,f.decisions,{kind:'pacing',final:true}),/visual inspection/);
  d.visualReview={status:'complete',notes:'Synthetic checker fixture.'};json(f.decisions,d);assert.equal(checkEditorial(f.review,f.decisions,{kind:'pacing',final:true}).status,'pass');
  d.decisions[0].decision='review';json(f.decisions,d);assert.throws(()=>checkEditorial(f.review,f.decisions,{kind:'pacing',final:true}),/Unresolved/);
  d.decisions[0].decision='keep';json(f.decisions,d);fs.appendFileSync(f.wav,'changed');assert.throws(()=>checkEditorial(f.review,f.decisions,{kind:'pacing',final:true}),/Changed editorial input/);
});
test('invalid decision checks never create a report or overwrite source inputs',t=>{
  const f=fixture(t);assert.equal(f.build().status,0);f.decide(x=>({...x,reason:''}));
  const report=path.join(f.dir,'report.md');assert.notEqual(run(['--check',f.review,f.decisions,'--report',report]).status,0);assert.equal(fs.existsSync(report),false);
  f.decide();const before=snapshotFile(f.wav).sha256;
  assert.notEqual(run(['--check',f.review,f.decisions,'--report',f.wav,'--force']).status,0);assert.equal(snapshotFile(f.wav).sha256,before);
});
