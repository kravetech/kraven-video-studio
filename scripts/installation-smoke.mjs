import {randomUUID} from 'node:crypto';
import {assertBrollDestination} from './lib/broll-plan.mjs';
import {renderOptions} from './lib/render-options.mjs';
// Generated test media only. Never approves a real transcript or publishes anything.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {launchRenderJob, renderWorkspace} from './lib/render-workspace.mjs';
if (await launchRenderJob(import.meta.url, 'installation-smoke')) process.exit(process.exitCode ?? 0);
const workspace = renderWorkspace();
workspace.stageShared();
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { enableTailwind } from '@remotion/tailwind-v4';

const run = (file, args, full = false) => {
  const result = spawnSync(file, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed: ${result.stderr?.slice(-2000)}`);
  return full ? result : result.stdout;
};
const runId=randomUUID();
const dir=path.resolve('out', 'installation-check-'+runId);
const fixture=path.join(workspace.publicDir, 'samples', '.installation-check-'+runId);
const fixtureUrl='samples/.installation-check-'+runId;
assertBrollDestination(dir);
mkdirSync(dir, { recursive: true });
mkdirSync(fixture, {recursive:true});
run(process.execPath, ['scripts/make-sfx.mjs','--check']);
run('ffmpeg', ['-v','error','-y','-f','lavfi','-i','testsrc2=size=1080x1920:rate=30:duration=5','-f','lavfi','-i','sine=frequency=440:duration=5','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(fixture,'welcome.mp4')]);
run('ffmpeg', ['-v','error','-y','-ss','1','-i',path.join(fixture,'welcome.mp4'),'-frames:v','1',path.join(fixture,'welcome-cover.png')]);
const syntheticCaptions={review:{status:'needs-review',reviewedBy:null,reviewedAt:null},source:'installation-generated synthetic test; no spoken transcript',captions:[{text:' SYNTHETIC',startMs:200,endMs:600,timestampMs:400,confidence:null},{text:' MEDIA',startMs:600,endMs:1000,timestampMs:800,confidence:null},{text:' CHECK',startMs:1000,endMs:1300,timestampMs:1150,confidence:null}]};
writeFileSync(path.join(fixture,'welcome.captions.json'),JSON.stringify(syntheticCaptions,null,2));
writeFileSync(path.join(fixture,'welcome.edit.json'),JSON.stringify({
  callouts:[{atMs:0,durationMs:2200,label:'SETUP CHECK',term:'Synthetic media'}],
  broll:[{atMs:1500,variant:'keyword',primary:'SETUP CHECK',holdMs:1200}],
  zooms:[{atMs:100,durationMs:900,scale:1.1}],
  sfx:[{atMs:500,sound:'tick'},{atMs:1500,sound:'whoosh'},{atMs:3600,sound:'hit'}],
},null,2));
const wave = path.join(dir, 'generated-tone.wav');
run('ffmpeg', ['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=1','-ac','1','-ar','16000',wave]);
const t0 = Date.now();
// A non-speech tone checks decoding/model execution, not speech recognition accuracy.
const inference=run(process.env.WHISPER_CLI, ['-m',process.env.WHISPER_MODEL,'-f',wave,'-l','en','-t','4','-nt','-oj','-of',path.join(dir,'transcription')],true);
const settings=JSON.parse(readFileSync(process.env.STUDIO_CONFIG,'utf8').replace(/^\uFEFF/,''));
if(settings.backend==='Cuda' && !/using CUDA\d* backend/i.test(inference.stderr)) throw new Error('CUDA was selected but GPU execution was not confirmed. Rerun setup with -Backend Cpu, or correct the NVIDIA driver/hardware issue.');
const tx = JSON.parse(readFileSync(path.join(dir,'transcription.json'),'utf8'));
if (!Array.isArray(tx.transcription)) throw new Error('Whisper did not produce the expected JSON structure.');
for (const sound of ['tick','whoosh','hit']) workspace.stageFile(path.resolve('public/sfx', sound+'.wav'), 'sfx/'+sound+'.wav');
const rendererOptions = await renderOptions();
const serveUrl = await workspace.bundle({ entryPoint: path.resolve('src/index.ts'), webpackOverride: enableTailwind });
const checks = [];
for (const [ratio,width,height] of [['9:16',1080,1920],['16:9',1920,1080]]) {
  const inputProps = {variant:'keyword',ratio,primary:'VIDEO STUDIO',holdMs:1200,fps:30};
  const composition = await selectComposition({ ...rendererOptions, serveUrl,id:'Broll',inputProps});
  const file = path.join(dir, ratio === '9:16' ? 'vertical.mp4' : 'horizontal.mp4');
  await renderMedia({ ...rendererOptions, serveUrl,composition,inputProps,codec:'h264',outputLocation:file,concurrency:2});
  const meta = JSON.parse(run('ffprobe',['-v','error','-show_entries','stream=width,height:format=duration','-of','json',file]));
  if (meta.streams[0].width !== width || meta.streams[0].height !== height) throw new Error(`Wrong render dimensions for ${ratio}.`);
  run('ffmpeg',['-v','error','-i',file,'-f','null','-']);
  checks.push({ratio,width,height,file:path.basename(file),decode:'passed'});
}
const previewProps={videoSrc:fixtureUrl+'/welcome.mp4',captionsSrc:fixtureUrl+'/welcome.captions.json',calloutsSrc:fixtureUrl+'/welcome.edit.json',previewUnreviewed:true,fps:30};
const preview=await selectComposition({ ...rendererOptions, serveUrl,id:'CaptionedClip',inputProps:previewProps});
await renderMedia({ ...rendererOptions, serveUrl,composition:preview,inputProps:previewProps,codec:'h264',outputLocation:path.join(dir,'captioned-PREVIEW.mp4'),concurrency:2});
const coverProps={title:'VIDEO STUDIO',frameSrc:fixtureUrl+'/welcome-cover.png',framing:'standard'};
const cover=await selectComposition({ ...rendererOptions, serveUrl,id:'VideoCover',inputProps:coverProps});
await renderStill({ ...rendererOptions, serveUrl,composition:cover,inputProps:coverProps,output:path.join(dir,'cover.jpg'),imageFormat:'jpeg'});
run('ffmpeg',['-v','error','-i',path.join(dir,'captioned-PREVIEW.mp4'),'-f','null','-']);
writeFileSync(path.join(dir,'results.json'), JSON.stringify({checkedAt:new Date().toISOString(),whisper:'model execution passed (synthetic tone; accuracy not measured)',backend:settings.backend,cudaExecution:settings.backend==='Cuda'?'confirmed from Whisper backend log':null,elapsedMs:Date.now()-t0,broll:checks,portraitPreview:'captioned-PREVIEW.mp4',enhancements:{cutaways:1,zooms:1,sounds:['tick','whoosh','hit']},cover:'cover.jpg'},null,2));
console.log(`Installation smoke check passed: Whisper, FFmpeg, B-roll, captioned preview and cover. Results: ${dir}`);
