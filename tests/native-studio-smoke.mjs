import './isolate.mjs';
// Explicit acceptance harness; never run automatically against an existing Studio.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {openBrowser} from '@remotion/renderer';
import net from 'node:net';
import path from 'node:path';

const port=43213,dir=path.resolve('out','native-studio-'+Date.now());mkdirSync(dir,{recursive:true});
await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
let stdout='',stderr='',browser;
const report={port,startedAt:new Date().toISOString(),status:'failed'};
const listenerFile=path.join(dir,'listeners.jsonl');
const observer=path.resolve('tests/studio-bind-probe.cjs').replaceAll('\\','/');
const child=spawn(process.execPath,['scripts/start-studio.mjs','--port',String(port),'--no-open'],{windowsHide:true,stdio:['ignore','pipe','pipe'],
  env:{...process.env,KVS_TEST_LISTENERS:listenerFile,NODE_OPTIONS:[process.env.NODE_OPTIONS,`--require "${observer}"`].filter(Boolean).join(' ')}});
child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try {
  const deadline=Date.now()+60000;let ready=false;
  while(Date.now()<deadline) {
    if(child.exitCode!==null)throw Error('Studio exited: '+stderr);
    try{const r=await fetch(`http://127.0.0.1:${port}/Broll`,{signal:AbortSignal.timeout(1500)});if(r.ok){ready=true;break;}}catch{}
    await wait(250);
  }
  assert.ok(ready,'Studio HTTP listener did not start');
  report.listeners=readFileSync(listenerFile,'utf8').trim().split('\n').map(l=>JSON.parse(l));
  assert.ok(report.listeners.some(l=>l.port===port),'Expected Studio listener was not observed');
  assert.ok(report.listeners.every(l=>['127.0.0.1','::1'].includes(l.address)),'Nonlocal Studio listener');
  browser=await openBrowser('chrome',{logLevel:'error'});
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.goto({url:`http://127.0.0.1:${port}/Broll`,timeout:60000});
  let text='';const uiDeadline=Date.now()+60000;
  while(Date.now()<uiDeadline){text=await page.evaluate(()=>document.body.innerText);if(text.includes('Broll')&&text.includes('VideoCover'))break;await wait(500);}
  assert.ok(text.includes('Broll')&&text.includes('VideoCover'),'Studio composition navigation failed to load');
  await page.evaluate(()=>document.getElementById('render-modal-button-server').click());
  await wait(1000);
  const output=path.join(dir,'studio-broll.mp4');
  await page.evaluate(filename=>{
    const field=[...document.querySelectorAll('input')].find(e=>e.value.endsWith('.mp4'));
    if(!field)throw Error('Studio output field is unavailable');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,filename);
    field.dispatchEvent(new Event('input',{bubbles:true}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
  },path.relative(process.cwd(),output).replaceAll('\\','/'));
  await wait(500);
  await page.evaluate(()=>{
    const button=[...document.querySelectorAll('button')].find(e=>e.innerText.trim().startsWith('Render video'));
    if(!button||button.disabled)throw Error('Studio render action is unavailable: '+document.body.innerText.slice(-2500));button.click();
  });
  const exportDeadline=Date.now()+120000;let decoded=false;
  while(Date.now()<exportDeadline) {
    if(existsSync(output))try{execFileSync('ffmpeg',['-v','error','-i',output,'-f','null','-'],{windowsHide:true,stdio:'pipe',timeout:10000});decoded=true;break;}catch{}
    await wait(500);
  }
  assert.ok(decoded,'Studio UI export did not produce a decodable video');
  report.uiVideoRendered=true;
  const {value:png}=await page._client().send('Page.captureScreenshot',{format:'png'});writeFileSync(path.join(dir,'studio.png'),Buffer.from(png.data,'base64'));
  report.compositionsLoaded=true;report.status='passed';report.job=stdout.match(/Render workspace: (.+)/)?.[1].trim();
}catch(error){report.error=error.message;process.exitCode=1;}
finally {
  if(browser)await browser.close({silent:true});
  const job=stdout.match(/Render workspace: (.+)/)?.[1].trim();
  if(job&&child.exitCode===null) {
    writeFileSync(path.join(job,'cancel.request'),'acceptance stop\n');
    const deadline=Date.now()+15000;while(child.exitCode===null&&Date.now()<deadline)await wait(100);
  }
  report.sessionCacheRemoved=!!job&&!existsSync(job);
  if(child.exitCode===null||!report.sessionCacheRemoved){process.exitCode=1;report.status='failed';}
  if(child.exitCode===null)try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}
  try{await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(2000)});report.stopped=false;process.exitCode=1;}catch{report.stopped=true;}
  report.note='Synthetic Studio session stopped through its cancellation handler. This is not editorial approval.';
  writeFileSync(path.join(dir,'results.json'),JSON.stringify(report,null,2));writeFileSync(path.join(dir,'console.txt'),stdout+'\n'+stderr);
  console.log(JSON.stringify({...report,evidence:dir},null,2));
}
