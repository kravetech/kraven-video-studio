import './isolate.mjs';
// End-to-end synthetic fixtures only. Approval hashes here are test data,
// never consent to use or approve any person's recording.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { textHash, timingHash } from '../src/captions/review.ts';
import { sha256File } from '../scripts/lib/package.mjs';
import { measureEnhancements } from './enhancement-measurements.mjs';
import { checkBrollMetadata } from './broll-media.mjs';
import { checkAudioNormalization } from './audio-media.mjs';
import { checkWorkflowMedia } from './workflow-media.mjs';
import { syntheticTake, syntheticPacing } from './editorial-media.mjs';

const id = randomUUID();
const working = path.join(process.env.KVS_TEST_RUN_DIR, `media-inputs-${id}`);
const output = path.resolve('out', `media-test-${id}`);
mkdirSync(working, { recursive: true }); mkdirSync(output, { recursive: true });
const audioNormalization=checkAudioNormalization(output);
const workflowRegressions=checkWorkflowMedia(output);
const run = (command, args, expected = 0) => {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (expected === 0 && result.status !== 0) throw new Error(`${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  if (expected !== 0) assert.notEqual(result.status, 0, result.stdout);
  return result;
};
const node = (script, args = [], expected = 0) => run(process.execPath, [script, ...args], expected);
const writeJson = (file, object) => writeFileSync(file, JSON.stringify(object, null, 2) + '\n');
const results = [];
const enhanced = process.argv.includes('--enhancements');
const seconds = enhanced ? 7.5 : 3;
if (enhanced) {
  node('scripts/make-sfx.mjs');
  const regeneration = path.join(output, 'asset-regeneration'); mkdirSync(regeneration);
  const generator = path.resolve('scripts/make-sfx.mjs');
  const generate = (args=[], expected=0) => {
    const result=spawnSync(process.execPath,[generator,...args],{cwd:regeneration,encoding:'utf8'});
    if(expected===0) assert.equal(result.status,0,result.stderr); else assert.notEqual(result.status,0);
  };
  generate();
  const effect = path.join(regeneration,'public/sfx/whoosh.wav');
  const before=sha256File(effect);
  generate(); assert.equal(sha256File(effect),before);
  writeFileSync(effect,'corrupt test fixture');
  generate(['--check'],1); generate([],1);
  assert.equal(readFileSync(effect,'utf8'),'corrupt test fixture');
  generate(['--force']); assert.equal(sha256File(effect),before);
  console.log('PASS sound assets: generated without shipped WAVs, preserved on rerun, corruption rejected, deterministic regeneration.');
}
for (const [profile, name, size] of [['vertical-1080','Portrait','1080x1920'], ['horizontal-1080','Landscape','1920x1080']]) {
  console.log(`Testing ${profile}: generated source -> assembly -> render -> validate -> release`);
  const source = path.join(working, `${name}-source.mp4`), master = path.join(working, `${name}-master.mp4`);
  const editPath = path.join(working, `${name}.edit.json`), capPath = path.join(working, `${name}.captions.json`);
  const dir = path.join(output, 'Edited', name); mkdirSync(dir, { recursive: true });
  run('ffmpeg', ['-v','error','-y','-f','lavfi','-i',`testsrc2=size=${size}:rate=30:duration=${seconds}`,'-f','lavfi','-i',`sine=frequency=440:duration=${seconds}`,'-af','loudnorm=I=-14:TP=-1.5:LRA=11','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',source]);
  const words = enhanced ? 'Synthetic media test Keep all words through cutaways and after them' : 'Synthetic media test';
  const edit = { source, profile, title: 'Synthetic pipeline test', pauses: { minMs: 10000 }, segments: [{ label: 'fixture', in: 0, out: seconds, words, zoom: 1, snapIn: [0,0], snapOut: [0,0], tighten: false }], callouts: [{ atMs: 100, durationMs: enhanced?1100:2200, label: 'TEST FIXTURE', term: 'Synthetic media' }], post: { hook: 'Ready to test?', lines: ['Synthetic fixture only.', 'Review every output.'], closing: 'Check before delivery.', hashtags: ['#VideoStudio','#Testing','#Workflow'] } };
  if(enhanced) Object.assign(edit, {
    broll:[{atMs:2241,variant:'keyword',primary:'TIMED CUTAWAY',holdMs:1200,spoken:'Keep all words through cutaways'}],
    zooms:[{atMs:200,durationMs:1600,scale:1.15,spoken:'Synthetic media test'}],
    sfx:[{atMs:700,sound:'tick'},{atMs:2241,sound:'whoosh'},{atMs:5000,sound:'hit'}],
  });
  writeJson(editPath,edit);
  const missingTake=node('scripts/assemble-cut.mjs',[editPath,master],1);
  assert.match(missingTake.stderr,/Take review is required/);
  Object.assign(edit,syntheticTake(source,working,name,words));
  writeJson(editPath, edit);
  node('scripts/assemble-cut.mjs', [editPath, master]);
  const cuts = JSON.parse(readFileSync(master.replace('.mp4','.cuts.json'),'utf8'));
  copyFileSync(master.replace('.mp4','.cuts.json'),path.join(dir,`${name}.cuts.json`));
  copyFileSync(master.replace('.mp4','.edl'),path.join(dir,`${name}.edl`));
  const captions = words.split(' ').map((text,index)=>({text,startMs:300+index*500,endMs:750+index*500,timestampMs:525+index*500,confidence:null}));
  const cap = { captions, source:'Synthetic labels over a tone; no spoken transcript.', review:{ status:'reviewed', reviewedBy:'Synthetic test fixture (not human approval)', textHash:await textHash(captions), timingHash:await timingHash(captions) } };
  writeJson(capPath,cap);
  const brollMetadata = enhanced ? await checkBrollMetadata({master,capPath,editPath,output,profile}) : null;
  const projectPath=path.join(dir,`${name} - project.json`);
  const project={...edit,master,fps:cuts.fps,masterDurationSec:cuts.masterDurationSec,pacingReview:path.join(dir,'pacing-review.json'),pacingDecisions:path.join(dir,'pacing-decisions.json')};
  writeJson(projectPath,project);
  writeFileSync(path.join(dir,`${name} - editing summary.md`),'Synthetic pipeline test only. No editorial acceptance or transcription accuracy claim.\n');
  const video=path.join(dir,`${name}.mp4`);
  node('scripts/render-final.mjs',[master,capPath,'--edit',editPath,'--out',video,'--concurrency','2']);
  let measurements;
  if(enhanced) {
    const [width,height]=size.split('x').map(Number);
    measurements=measureEnhancements({video,master,width,height});
    console.log(`PASS ${profile} rendered effects: aligned card/caption boundaries, zoom crop, continuous audio and all three sound effects.`);
  }
  node('scripts/captions-to-srt.mjs',[capPath,path.join(dir,`${name}.srt`),'--video',video]);
  const cover=path.join(dir,`${name}${profile==='vertical-1080'?'-Cover':'-Thumbnail'}.jpg`);
  node('scripts/make-cover.mjs',[master,'--title','SYNTHETIC TEST','--at','1','--out',cover,...(profile==='horizontal-1080'?['--thumbnail']:[])]);
  if(profile==='vertical-1080') node('scripts/make-post.mjs',[editPath,capPath,'--out',path.join(dir,`${name} - post.txt`)]);
  node('scripts/validate-package.mjs',[dir,'--captions',capPath],1);
  const missingPacing=JSON.parse(readFileSync(path.join(dir,'validation.json'),'utf8'));assert.ok(missingPacing.checks.some(c=>c.name.startsWith('pacing:')&&!c.ok));
  syntheticPacing(video,capPath,editPath,project);
  node('scripts/validate-package.mjs',[dir,'--captions',capPath]);
  const validation=JSON.parse(readFileSync(path.join(dir,'validation.json'),'utf8'));
  assert.equal(validation.result,'pass');
  node('scripts/release.mjs',[dir,'--upload-dir',path.join(output,'For Upload')],1);
  node('scripts/release.mjs',[dir,'--approved-by','Synthetic test fixture','--upload-dir',path.join(output,'For Upload')]);
  const delivered=path.join(output,'For Upload',name,`${name}.mp4`);
  assert.equal(sha256File(delivered),sha256File(video));
  for(const role of ['takeReview','pacingReview']) {
    const missing={...validation};delete missing[role];writeJson(path.join(dir,'validation.json'),missing);
    node('scripts/release.mjs',[dir,'--approved-by','Synthetic test fixture','--upload-dir',path.join(output,`Missing ${role} Upload`)],1);
  }
  writeJson(path.join(dir,'validation.json'),validation);
  const pacingOriginal=readFileSync(project.pacingDecisions,'utf8'),pending=JSON.parse(pacingOriginal);assert.ok(pending.decisions.length);pending.decisions[0].decision='review';writeJson(project.pacingDecisions,pending);
  node('scripts/validate-package.mjs',[dir,'--captions',capPath],1);node('scripts/release.mjs',[dir,'--approved-by','Synthetic test fixture','--upload-dir',path.join(output,'Unresolved Pacing Upload')],1);
  writeFileSync(project.pacingDecisions,pacingOriginal);node('scripts/validate-package.mjs',[dir,'--captions',capPath]);
  const noQc={...validation};delete noQc.cutQc;
  writeJson(path.join(dir,'validation.json'),noQc);
  const noQcRelease=node('scripts/release.mjs',[dir,'--approved-by','Synthetic test fixture','--upload-dir',path.join(output,'Missing QC Upload')],1);
  assert.match(noQcRelease.stderr,/cut QC/i);writeJson(path.join(dir,'validation.json'),validation);
  const packageCuts=path.join(dir,`${name}.cuts.json`),originalCuts=readFileSync(packageCuts,'utf8');
  const changedCuts=JSON.parse(originalCuts);changedCuts.clips[0].in=0.25;writeJson(packageCuts,changedCuts);
  node('scripts/validate-package.mjs',[dir,'--captions',capPath],1);
  const cutFailure=JSON.parse(readFileSync(path.join(dir,'validation.json'),'utf8'));assert.ok(cutFailure.checks.some(check=>check.name.startsWith('cut QC:')&&!check.ok));
  node('scripts/release.mjs',[dir,'--approved-by','Synthetic test fixture','--upload-dir',path.join(output,'Bad Cut Upload')],1);
  writeFileSync(packageCuts,originalCuts);node('scripts/validate-package.mjs',[dir,'--captions',capPath]);
  const harmlessChangedCuts=JSON.parse(originalCuts);harmlessChangedCuts.clips[0].label='Changed cut provenance';writeJson(packageCuts,harmlessChangedCuts);
  node('scripts/validate-package.mjs',[dir,'--captions',capPath],1);
  const provenanceFailure=JSON.parse(readFileSync(path.join(dir,'validation.json'),'utf8'));assert.ok(provenanceFailure.checks.some(check=>check.name.startsWith('cut QC:')&&!check.ok&&/differs from the rendered input/.test(check.detail)));
  node('scripts/release.mjs',[dir,'--approved-by','Synthetic test fixture','--upload-dir',path.join(output,'Changed Cut Provenance Upload')],1);
  writeFileSync(packageCuts,originalCuts);node('scripts/validate-package.mjs',[dir,'--captions',capPath]);
  const manifest=JSON.parse(readFileSync(path.join(output,'For Upload',name,'manifest.json'),'utf8'));
  assert.ok(!JSON.stringify(manifest).includes(working));
  writeJson(capPath,{...cap,captions:captions.map((word,index)=>index?word:{...word,text:'Changed'})});
  node('scripts/release.mjs',[dir,'--approved-by','Synthetic test fixture','--upload-dir',path.join(output,'Other Upload')],1);
  writeJson(capPath,cap);
  if(enhanced) {
    const sound=path.resolve('public/sfx/whoosh.wav');
    const originalSound=readFileSync(sound);
    try {
      const changed=Buffer.from(originalSound); changed[changed.length-1]^=1; writeFileSync(sound,changed);
      node('scripts/release.mjs',[dir,'--approved-by','Synthetic test fixture','--upload-dir',path.join(output,'Changed Sound Upload')],1);
    } finally { writeFileSync(sound,originalSound); }
    assert.match(readFileSync(path.join(dir,`${name}.srt`),'utf8'),/cutaways/i);
    for(const [label,at] of [['zoom',1],['cutaway',3.2],['resumed',4.6]]) run('ffmpeg',['-v','error','-y','-ss',String(at),'-i',video,'-frames:v','1',path.join(dir,`${label}-frame.png`)]);
  }
  run('ffmpeg',['-v','error','-y','-ss','1','-i',video,'-frames:v','1',path.join(dir,'review-frame.png')]);
  results.push({profile,checks:validation.checks.length,package:dir,videoHash:sha256File(video),releaseHashMatch:true,takeReviewAndPacingEnforced:true,unresolvedPacingRejected:true,missingCutQcRejected:true,unsafeChangedCutsRejected:true,changedCutProvenanceRejected:true,missingApprovalRejected:true,changedCaptionsRejected:true, ...(enhanced?{changedSoundRejected:true,measurements,brollMetadata}:{})});
  console.log(`PASS ${profile}: ${validation.checks.length} checks, matching release hashes, refusal checks passed.`);
}
writeJson(path.join(output,'results.json'),{checkedAt:new Date().toISOString(),scope:'Synthetic test media only',audioNormalization,workflowRegressions,results});
console.log(`Media smoke results: ${output}`);
