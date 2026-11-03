import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { assertSafeOutput } from './guard.mjs';

export const sounds = {
  whoosh: { seconds: 0.55, filter: 'anoisesrc=d=0.55:c=pink:a=0.6:seed=701,bandpass=f=1400:width_type=h:w=1800,lowpass=f=5000,afade=t=in:d=0.3:curve=exp,afade=t=out:st=0.3:d=0.25:curve=exp' },
  hit: { seconds: 0.35, filter: 'sine=f=82:d=0.35,volume=1.6,afade=t=out:st=0.01:d=0.34:curve=exp[a];anoisesrc=d=0.04:c=brown:a=0.4:seed=702,lowpass=f=900,afade=t=out:d=0.04[b];[a][b]amix=inputs=2:normalize=0' },
  tick: { seconds: 0.05, filter: 'sine=f=2300:d=0.05,afade=t=out:d=0.05:curve=exp[a];sine=f=1150:d=0.05,volume=0.5,afade=t=out:d=0.05:curve=exp[b];[a][b]amix=inputs=2:normalize=0' },
};

export function soundPath(name) {
  if (!Object.hasOwn(sounds, name)) throw new Error(`Unknown sound effect: ${name}`);
  return path.resolve('public/sfx', `${name}.wav`);
}

export function checkSound(name) {
  const file = soundPath(name);
  if (!existsSync(file)) throw new Error(`Missing sound ${name}. Run pnpm sfx before rendering.`);
  const meta = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','stream=codec_name,sample_rate,channels:format=duration','-of','json',file], { encoding:'utf8' }));
  const stream = meta.streams?.[0];
  if (stream?.codec_name !== 'pcm_s16le' || stream.sample_rate !== '48000' || stream.channels !== 1 || Math.abs(Number(meta.format?.duration) - sounds[name].seconds) > 0.002) {
    throw new Error(`Invalid sound asset ${name}. Back up custom audio, then run pnpm sfx --force to regenerate.`);
  }
  return file;
}

export function prepareSounds({ force = false, checkOnly = false } = {}) {
  for (const [name, { filter }] of Object.entries(sounds)) {
    const file = soundPath(name);
    if (checkOnly || (existsSync(file) && !force)) { checkSound(name); continue; }
    assertSafeOutput(file, { force });
    mkdirSync(path.dirname(file), { recursive:true });
    execFileSync('ffmpeg', ['-v','error',force ? '-y' : '-n','-filter_complex',`${filter},aresample=48000,alimiter=limit=0.5[out]`,'-map','[out]','-ac','1','-ar','48000','-c:a','pcm_s16le',file]);
    checkSound(name);
  }
}
