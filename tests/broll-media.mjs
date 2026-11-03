import './isolate.mjs';
import {renderOptions} from '../scripts/lib/render-options.mjs';
// Browser-level contracts for both standalone and embedded cards. Test inputs
// stay beside the generated source; no existing transcript/edit is mutated.
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdirSync,copyFileSync,cpSync,existsSync} from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderStill,openBrowser} from '@remotion/renderer';
import {enableTailwind} from '@remotion/tailwind-v4';
import {spawnSync} from 'node:child_process';

export async function checkBrollMetadata({master,capPath,editPath,output,profile}) {
  const bad=[
    {variant:'stat',primary:'Efficiency',error:/explicit finite number/},
    {variant:'steps',primary:'Ask → Understand → Apply → Verify',error:/1–3 steps/},
    {variant:'aiWorkflow',primary:'Notes',error:/2–3 explicit nodes/},
    {variant:'steps',primary:'Ask → Understand → Apply',holdMs:100,error:/at least 2108/},
  ];
  const edit=JSON.parse(readFileSync(editPath,'utf8'));
  const files=bad.map((cue,i)=>{
    const file=editPath.replace(/\.json$/,`-invalid-${i}.json`);
    const {error,...content}=cue;
    writeFileSync(file,JSON.stringify({...edit,broll:[{atMs:1000,...content}]}));return file;
  });
  const quietEdit=editPath.replace(/\.json$/,'-caption-policy.json');writeFileSync(quietEdit,JSON.stringify({callouts:[],broll:[],zooms:[],sfx:[]}));
  const emptyCaptions=capPath.replace(/\.json$/,'-empty-policy.json');writeFileSync(emptyCaptions,JSON.stringify({review:{status:'needs-review'},captions:[]}));
  const rendererOptions = await renderOptions();
  const stage=path.join(process.env.KVS_TEST_RUN_DIR,`metadata-${profile}`),publicDir=path.join(stage,'public');
  mkdirSync(publicDir,{recursive:true});
  const relative=file=>'fixtures/'+path.basename(file);
  for(const source of [master,capPath,...files,quietEdit,emptyCaptions]) {
    const rel=relative(source);assert.ok(!rel.startsWith('../')&&!path.isAbsolute(rel));
    const target=path.join(publicDir,rel);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(source,target);
  }
  for(const shared of ['brand','sfx'])if(existsSync(path.resolve('public',shared)))cpSync(path.resolve('public',shared),path.join(publicDir,shared),{recursive:true});
  const serveUrl=await bundle({entryPoint:path.resolve('src/index.ts'),publicDir,outDir:path.join(stage,'bundle'),webpackOverride:config=>enableTailwind(config)});
  const browser=await openBrowser('chrome');
  const ratio=profile==='vertical-1080'?'9:16':'16:9';
  let captionPolicy;
  try {
    for(let i=0;i<bad.length;i++) {
      const {error,...props}=bad[i];
      await assert.rejects(selectComposition({ ...rendererOptions, serveUrl,id:'Broll',inputProps:{ratio,...props},puppeteerInstance:browser}),error);
      await assert.rejects(selectComposition({ ...rendererOptions, serveUrl,id:'CaptionedClip',inputProps:{videoSrc:relative(master),captionsSrc:relative(capPath),calloutsSrc:relative(files[i]),previewUnreviewed:false,fps:30},puppeteerInstance:browser}),error);
    }
    const inputProps={ratio,variant:'steps',primary:'Ask → Understand → Apply',startAt:4};
    const composition=await selectComposition({ ...rendererOptions, serveUrl,id:'Broll',inputProps,puppeteerInstance:browser});
    await renderStill({ ...rendererOptions, serveUrl,composition,inputProps,frame:Math.round(2.3*composition.fps),scale:0.5,output:path.join(output,`${profile}-steps-readable.png`),puppeteerInstance:browser});
    const bands=[];
    for(const [name,file] of [['with-transcript',capPath],['empty-transcript',emptyCaptions]]) {
      const props={videoSrc:relative(master),captionsSrc:relative(file),calloutsSrc:relative(quietEdit),previewUnreviewed:true,fps:30};
      const comp=await selectComposition({ ...rendererOptions, serveUrl,id:'CaptionedClip',inputProps:props,puppeteerInstance:browser});
      const png=path.join(output,`${profile}-${name}.png`);
      await renderStill({ ...rendererOptions, serveUrl,composition:comp,inputProps:props,frame:30,scale:0.5,output:png,puppeteerInstance:browser});
      const decoded=spawnSync('ffmpeg',['-v','error','-i',png,'-vf','crop=iw:ih*0.35:0:ih*0.65,format=rgb24','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:8*1024*1024});
      assert.equal(decoded.status,0,decoded.stderr?.toString());bands.push(decoded.stdout);
    }
    assert.equal(bands[0].length,bands[1].length);let delta=0;for(let i=0;i<bands[0].length;i++)delta+=Math.abs(bands[0][i]-bands[1][i]);
    const meanDifference=delta/bands[0].length;
    if(profile==='horizontal-1080')assert.equal(meanDifference,0,'Horizontal burned captions must be absent.');
    else assert.ok(meanDifference>0.1,'Vertical burned captions must be visible.');
    captionPolicy={burnedCaptions:profile==='vertical-1080',captionBandMeanDifference:meanDifference};
  } finally {await browser.close({silent:true});}
  console.log(`PASS ${profile}: four malformed/short cards refused by standalone and embedded metadata; valid three-step hold rendered.`);
  return {standaloneRejections:4,embeddedRejections:4,validStepsHoldRendered:true,captionPolicy};
}
