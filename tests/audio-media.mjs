import './isolate.mjs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {AUDIO_STANDARD,loudnormFilter,audioChecks} from '../src/audio/standard.ts';

const ffmpeg=args=>{
  const r=spawnSync('ffmpeg',['-hide_banner',...args],{encoding:'utf8',maxBuffer:8*1024*1024});
  assert.equal(r.status,0,r.stderr);return r.stderr;
};
const measure=file=>{
  const log=ffmpeg(['-i',file,'-af',loudnormFilter(),'-f','null','-']);
  return JSON.parse(log.slice(log.lastIndexOf('{'),log.lastIndexOf('}')+1));
};
export function checkAudioNormalization(output) {
  const rows=[];
  for(const [name,gain] of [['quiet',0.1],['loud',2]]) {
    const source=path.join(output,`audio-${name}-source.wav`),dest=path.join(output,`audio-${name}-normalized.wav`);
    ffmpeg(['-v','error','-n','-f','lavfi','-i','sine=frequency=440:duration=3','-af',`volume=${gain}`,'-ar','48000',source]);
    const analysis=measure(source);
    ffmpeg(['-v','error','-n','-i',source,'-af',loudnormFilter(analysis),'-ar',String(AUDIO_STANDARD.sampleRate),'-c:a','pcm_f32le',dest]);
    const after=measure(dest),lufs=Number(after.input_i),peak=Number(after.input_tp);
    assert.ok(Math.abs(lufs-AUDIO_STANDARD.targetLufs)<0.2,`${name} normalization produced ${lufs}`);
    assert.deepEqual(audioChecks(lufs,peak),{loudness:true,peak:true});
    rows.push({name,inputLufs:Number(analysis.input_i),normalizedLufs:lufs,truePeakDb:peak});
  }
  writeFileSync(path.join(output,'audio-normalization.json'),JSON.stringify({standard:AUDIO_STANDARD,results:rows},null,2));
  console.log('PASS audio standard: quiet and loud sources normalize to the same -16 LUFS delivery target.');
  return rows;
}
