import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {assertCardContent,assertCardTiming,parseCardNumber,MIN_READING_MS} from '../src/broll/validation.ts';
import {planBrollBatch,cardTiming,cardClock} from '../scripts/lib/broll-plan.mjs';
import {assertSafeOutput,PROTECTED_ROOTS} from '../scripts/lib/guard.mjs';

const fixture=fn=>{
  const dir=mkdtempSync(path.join(tmpdir(),'broll-safety-'));
  try {const cuesPath=path.join(dir,'cues.json');writeFileSync(cuesPath,'synthetic input');return fn({dir,cuesPath,outDir:path.join(dir,'output')});}
  finally {rmSync(dir,{recursive:true,force:true});}
};
const good={id:'01-card',variant:'keyword',primary:'CLEAR IDEA'};
const invalid=[
  {variant:'stat',primary:'Efficiency'}, {variant:'stat',primary:'120%'}, {variant:'stat',primary:'50'},
  {variant:'steps',primary:'Ask → Understand → Apply → Verify'},
  {variant:'aiWorkflow',primary:'Notes'}, {variant:'aiWorkflow',primary:'Notes → → Script'},
  {variant:'beforeAfter',primary:'Old'}, {variant:'problemSolution',primary:'Pain → Fix → Extra'},
  {variant:'mythReality',primary:'Myth / '}, {variant:'keyword',primary:' '},
];

test('all shipped B-roll examples preserve content and pass the existing default timing',()=>{
  for(const name of ['broll-cues.example.json','broll-cues-169.example.json'])for(const cue of JSON.parse(readFileSync(path.join('examples',name),'utf8')).cues) {
    assert.doesNotThrow(()=>assertCardContent(cue));
    assert.doesNotThrow(()=>assertCardTiming(cue,cardTiming,cardClock));
  }
});

test('malformed cards refuse missing, extra and invented content',()=>{
  for(const cue of invalid)assert.throws(()=>assertCardContent(cue));
  assert.doesNotThrow(()=>assertCardContent({variant:'steps',primary:'One'}));
  assert.doesNotThrow(()=>assertCardContent({variant:'aiWorkflow',primary:'Notes → Script'}));
});

test('steps cards can continue a list with startAt',()=>{
  assert.doesNotThrow(()=>assertCardContent({variant:'steps',primary:'Audio → Checks → Export',startAt:7}));
  assert.throws(()=>assertCardContent({variant:'keyword',primary:'ONE',startAt:2}));
  assert.throws(()=>assertCardContent({variant:'steps',primary:'One → Two',startAt:0}));
  assert.throws(()=>assertCardContent({variant:'steps',primary:'One → Two',startAt:1.5}));
  assert.throws(()=>assertCardContent({variant:'steps',primary:'One → Two → Three',startAt:98}));
});

test('numeric cards preserve signs/decimals and reject nonnumeric or malformed claims',()=>{
  assert.deepEqual(parseCardNumber('-1,250.50 hours'),{prefix:'',value:-1250.5,suffix:' hours',decimals:2});
  assert.equal(parseCardNumber('₱127').value,127);
  for(const text of ['Efficiency','12,34','1e999','10/20','1.2.3'])assert.equal(parseCardNumber(text),null);
  for(const text of ['0%','39%','100%'])assert.doesNotThrow(()=>assertCardContent({variant:'stat',primary:text}));
});

test('short holds refuse before the final reveal and accept the exact reading-time boundary',()=>{
  const cue={variant:'steps',primary:'Ask → Understand → Apply'};
  const valid=assertCardTiming(cue,cardTiming,cardClock);
  assert.equal(valid.revealEndMs,1908);
  assert.equal(valid.minimumHoldMs,2108);
  assert.equal(MIN_READING_MS,900);
  assert.throws(()=>assertCardTiming({...cue,holdMs:100},cardTiming,cardClock),/at least 2108/);
  assert.throws(()=>assertCardTiming({...cue,holdMs:2107},cardTiming,cardClock),/too short/);
  assert.doesNotThrow(()=>assertCardTiming({...cue,holdMs:2108},cardTiming,cardClock));
  assert.throws(()=>assertCardTiming(cue,cardTiming,cardClock*2),/too short/);
});

test('unsafe IDs and case-insensitive collisions refuse without creating directories',()=>fixture(options=>{
  for(const id of ['../escaped','..\\escaped','/absolute','C:drive','CON','com1','LPT9','trailing.','has space','nested/card'])assert.throws(()=>planBrollBatch({cues:[{...good,id}]},options),/Unsafe/);
  assert.throws(()=>planBrollBatch({cues:[good,{...good,id:'01-CARD'}]},options),/Duplicate/);
  assert.equal(existsSync(options.outDir),false);
}));

test('existing clips and manifest refuse without consent and remain byte-identical',()=>fixture(options=>{
  mkdirSync(options.outDir);
  for(const name of ['01-card.mp4','manifest.json']) {
    const file=path.join(options.outDir,name);writeFileSync(file,'synthetic existing output');
    assert.throws(()=>planBrollBatch({cues:[good]},options),/exists/);
    assert.equal(readFileSync(file,'utf8'),'synthetic existing output');
    assert.doesNotThrow(()=>planBrollBatch({cues:[good]},{...options,force:true}));
    rmSync(file);
  }
}));

test('input collisions and protected raw output refuse even with force',()=>fixture(options=>{
  mkdirSync(options.outDir);
  const source=path.join(options.outDir,'manifest.json');writeFileSync(source,'synthetic source');
  assert.throws(()=>planBrollBatch({cues:[good]},{...options,cuesPath:source,force:true}),/input/);
  assert.throws(()=>planBrollBatch({cues:[good]},{...options,outDir:path.join(PROTECTED_ROOTS[0],'broll'),force:true}),/protected/);
}));

test('junction aliases cannot bypass protected raw paths or escape the chosen directory',()=>fixture(options=>{
  const raw=path.join(options.dir,'raw');mkdirSync(raw);
  const link=path.join(options.dir,'alias');symlinkSync(raw,link,process.platform==='win32'?'junction':'dir');
  const module=pathToFileURL(path.resolve('scripts/lib/broll-plan.mjs')).href;
  const script=`import {planBrollBatch} from ${JSON.stringify(module)}; planBrollBatch(${JSON.stringify({cues:[good]})},${JSON.stringify({...options,outDir:link,force:true})});`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,KRAVEN_PROTECTED_ROOTS:raw}});
  assert.notEqual(r.status,0);assert.match(r.stderr,/protected/);
  mkdirSync(options.outDir);const outside=path.join(options.dir,'outside.mp4');writeFileSync(outside,'synthetic target');
  const aliasFile=path.join(options.outDir,'01-card.mp4');
  // Directory junction also tests escaped leaf paths without requiring file-symlink privileges.
  symlinkSync(raw,path.join(options.outDir,'manifest.json'),process.platform==='win32'?'junction':'dir');
  assert.throws(()=>planBrollBatch({cues:[good]},{...options,force:true}),/escaped/);
  assert.equal(existsSync(aliasFile),false);assert.equal(readFileSync(outside,'utf8'),'synthetic target');
}));

test('configured raw-root aliases and aliased source paths cannot bypass output protection',()=>fixture(options=>{
  const raw=path.join(options.dir,'raw');mkdirSync(raw);
  const alias=path.join(options.dir,'configured-raw');symlinkSync(raw,alias,process.platform==='win32'?'junction':'dir');
  const module=pathToFileURL(path.resolve('scripts/lib/guard.mjs')).href;
  const output=path.join(raw,'must-not-be-written.mp4');
  const script=`import {assertSafeOutput} from ${JSON.stringify(module)}; assertSafeOutput(${JSON.stringify(output)},{force:true});`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,KRAVEN_PROTECTED_ROOTS:alias}});
  assert.notEqual(r.status,0);assert.match(r.stderr,/protected/);assert.equal(existsSync(output),false);
  const source=path.join(raw,'source.mp4');writeFileSync(source,'synthetic source sentinel');
  assert.throws(()=>assertSafeOutput(path.join(alias,'source.mp4'),{sources:[source],force:true}),/input/);
  assert.equal(readFileSync(source,'utf8'),'synthetic source sentinel');
}));

test('CLI validates the entire batch before bundling or writing partial output',()=>fixture(options=>{
  for(const cue of [...invalid,{variant:'steps',primary:'Ask → Understand → Apply',holdMs:100},{...good,id:'../escaped'}]) {
    writeFileSync(options.cuesPath,JSON.stringify({cues:[good,{...cue,id:cue.id??'02-bad'}]}));
    const input=readFileSync(options.cuesPath,'utf8');
    const r=spawnSync(process.execPath,['scripts/render-broll.mjs',options.cuesPath,options.outDir],{encoding:'utf8'});
    assert.notEqual(r.status,0,r.stdout);
    assert.equal(existsSync(options.outDir),false);
    assert.equal(readFileSync(options.cuesPath,'utf8'),input);
  }
}));
