import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureSafeOutput } from './lib/guard.mjs';

const [input, base, language = 'tl'] = process.argv.slice(2);
if (!input || !base || input === '--help') {
  console.log('Usage: pnpm transcribe <video> <output-base> [language=tl]. Start through Start-Video-Studio.cmd.');
  process.exit(input === '--help' ? 0 : 2);
}
if (!process.env.WHISPER_CLI || !process.env.WHISPER_MODEL) throw new Error('Launch through Start-Video-Studio.cmd to load the installed tools.');
if (!existsSync(input)) throw new Error(`Input not found: ${input}`);
for (const suffix of ['.wav','.json','.captions.json']) ensureSafeOutput(base + suffix, { sources: [input] });
mkdirSync(path.dirname(path.resolve(base)), { recursive: true });
const run = (file, args) => { const result = spawnSync(file, args, { stdio: 'inherit' }); if (result.error) throw result.error; if (result.status !== 0) process.exit(result.status ?? 1); };
run('ffmpeg', ['-v','error','-y','-i',input,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',base + '.wav']);
run(process.env.WHISPER_CLI, ['-m',process.env.WHISPER_MODEL,'-f',base + '.wav','-l',language,'-mc','0','-nfa','-dtw','large.v3','-ml','1','-sow','-oj','-of',base]);
run(process.execPath, ['scripts/whisper-to-captions.mjs',base + '.json',base + '.captions.json','--audio',base + '.wav']);
console.log(`Transcript requires human correction and approval: ${base}.captions.json`);
