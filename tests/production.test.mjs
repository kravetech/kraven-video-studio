import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { reviewState, textHash, timingHash } from '../src/captions/review.ts';
import { assertSafeOutput, PROTECTED_ROOTS } from '../scripts/lib/guard.mjs';
import { frameRate } from '../scripts/lib/frame-rate.mjs';

test('missing words and changed negation fail cut verification', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'video-studio-production-'));
  try {
    const edit=path.join(dir,'edit.json'), caps=path.join(dir,'caps.json');
    writeFileSync(edit,JSON.stringify({segments:[{label:'instruction',words:'do not deploy'}]}));
    for(const words of [['do','deploy'],['do','now','deploy']]) {
      writeFileSync(caps,JSON.stringify({captions:words.map(text=>({text}))}));
      const result=spawnSync(process.execPath,['scripts/verify-cut.mjs',edit,caps],{encoding:'utf8'});
      assert.notEqual(result.status,0,result.stdout);
    }
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('approval becomes stale after text or timing changes', async () => {
  const captions=[{text:'Original',startMs:0,endMs:500}];
  const review={status:'reviewed',textHash:await textHash(captions),timingHash:await timingHash(captions)};
  assert.equal(await reviewState({review,captions}),'approved');
  assert.equal(await reviewState({review,captions:[{...captions[0],text:'Changed'}]}),'text-changed');
  assert.equal(await reviewState({review,captions:[{...captions[0],endMs:600}]}),'timing-changed');
});

test('raw roots and source/output collisions are protected', () => {
  const source=path.join(tmpdir(),'source.mp4');
  assert.throws(()=>assertSafeOutput(source,{sources:[source],force:true}));
  const raw=path.join(PROTECTED_ROOTS[0],'recording.mp4');
  assert.throws(()=>assertSafeOutput(raw,{force:true}));
});

test('frame rates accept fractions and reject executable text', () => {
  assert.equal(frameRate('60000/1001'),60000/1001);
  for(const value of ['1/0','0','241','process.exit(0)','30;console.log(1)',null]) assert.throws(()=>frameRate(value));
});

test('post generator uses configurable defaults without a forced personal invite', async () => {
  const dir=mkdtempSync(path.join(tmpdir(),'video-studio-post-'));
  try {
    const captions=[{text:'Example',startMs:0,endMs:500}];
    const review={status:'reviewed',textHash:await textHash(captions),timingHash:await timingHash(captions)};
    const cap=path.join(dir,'caps.json'), edit=path.join(dir,'edit.json'), out=path.join(dir,'post.txt');
    writeFileSync(cap,JSON.stringify({review,captions}));
    writeFileSync(edit,JSON.stringify({post:{hook:'Ready to test?',lines:['Synthetic example.','Review the output.'],closing:'Check before delivery.',hashtags:['#VideoStudio','#Testing','#Workflow']}}));
    const result=spawnSync(process.execPath,['scripts/make-post.mjs',edit,cap,'--out',out],{encoding:'utf8',env:{...process.env,STUDIO_CONFIG:''}});
    assert.equal(result.status,0,result.stderr);
    const text=readFileSync(out,'utf8');
    assert.ok(text.includes('#VideoStudio'));
    assert.ok(!text.includes('discord.com'));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
