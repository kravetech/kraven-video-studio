import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIO_STANDARD,sfxGain,loudnormFilter,audioChecks} from '../src/audio/standard.ts';

test('speech house profile keeps finished loudness, codec headroom and effects in one contract',()=>{
  assert.equal(AUDIO_STANDARD.targetLufs,-16);
  assert.equal(AUDIO_STANDARD.toleranceLu,1);
  assert.equal(AUDIO_STANDARD.masteringTruePeakDb,-1.5);
  assert.equal(AUDIO_STANDARD.maximumTruePeakDb,-1);
  assert.deepEqual(AUDIO_STANDARD.sfx,{whoosh:3,hit:1,tick:1});
  assert.ok(Object.isFrozen(AUDIO_STANDARD)&&Object.isFrozen(AUDIO_STANDARD.sfx));
});

test('effect defaults are quiet while zero and explicit reviewed gains remain intentional',()=>{
  for(const [sound,gain] of Object.entries(AUDIO_STANDARD.sfx))assert.equal(sfxGain(sound),gain);
  assert.equal(sfxGain('whoosh',0),0);
  assert.equal(sfxGain('hit',0.1),0.1);
  assert.equal(sfxGain('whoosh',3),3);
  assert.equal(AUDIO_STANDARD.maxCueGain,4);
  for(const gain of [NaN,Infinity,-0.01,4.01])assert.throws(()=>sfxGain('tick',gain));
  assert.throws(()=>sfxGain('unknown'));
});

test('finished mix accepts the delivery window and refuses hot, quiet, clipped and invalid audio',()=>{
  for(const lufs of [-17,-16,-15])assert.deepEqual(audioChecks(lufs,-1),{loudness:true,peak:true});
  for(const lufs of [-18,-14,NaN,Infinity])assert.equal(audioChecks(lufs,-2).loudness,false);
  for(const peak of [-0.9,0,NaN,Infinity,-Infinity])assert.equal(audioChecks(-16,peak).peak,false);
});

test('both normalization passes use the same target and reject unusable measurements',()=>{
  const first=loudnormFilter();
  assert.equal(first,'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json');
  const measured={input_i:'-25',input_tp:'-10',input_lra:'3',input_thresh:'-35',target_offset:'0.1',normalization_type:'dynamic'};
  const second=loudnormFilter(measured);
  assert.ok(second.startsWith('loudnorm=I=-16:TP=-1.5:LRA=11:'));
  assert.match(second,/measured_I=-25/);assert.match(second,/linear=true$/);
  for(const value of ['-inf','NaN','not-a-number'])assert.throws(()=>loudnormFilter({...measured,input_i:value}));
});
