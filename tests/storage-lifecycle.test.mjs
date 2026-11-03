import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createRenderJob,inspectJobs,recoverAbandonedJobs,pruneExpiredJobs,descendantsUsing} from '../scripts/lib/render-workspace.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
test('startup reservation recovers only after owner death and starts full retention',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'startup-recovery-')),cache=path.join(dir,'cache'),id='c'.repeat(24);
  t.after(()=>{assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});});
  const job=createRenderJob(cache,id,'startup',import.meta.filename);
  assert.deepEqual(recoverAbandonedJobs(cache,id),[]);
  fs.writeFileSync(path.join(job.jobDir,'job.json'),JSON.stringify({...job.record,ownerPid:2147483647}));
  assert.deepEqual(recoverAbandonedJobs(cache,id),[job.jobDir]);
  assert.equal(inspectJobs(cache,id)[0].eligible,false);
});
async function until(predicate,message) {const end=Date.now()+20000;while(Date.now()<end){if(predicate())return;await sleep(100);}throw Error(message);}
async function running(t,{label='fixture',signal=false}={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lifecycle-')),cache=path.join(dir,'cache'),script=path.join(dir,'owner.mjs');
  const mod=pathToFileURL(path.resolve('scripts/lib/render-workspace.mjs')).href;
  fs.writeFileSync(script,`import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {launchRenderJob,renderWorkspace} from ${JSON.stringify(mod)};
    if(!process.env.KVS_RENDER_JOB && ${signal}){const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(path.join(dir,'signal'))})){clearInterval(timer);process.emit('SIGINT');}},50);}
    if(await launchRenderJob(import.meta.url,${JSON.stringify(label)}))process.exit(process.exitCode??1);
    const w=renderWorkspace();
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
    fs.writeFileSync(path.join(w.jobDir,'descendant.pid'),String(child.pid));console.log('READY');setInterval(()=>{},1000);`);
  const owner=spawn(process.execPath,[script],{env:{...process.env,KVS_RENDER_CACHE_ROOT:cache},windowsHide:true});
  let output='';owner.stdout.on('data',s=>output+=s);owner.stderr.on('data',s=>output+=s);
  const closed=new Promise((resolve,reject)=>{owner.once('error',reject);owner.once('exit',resolve);});
  t.after(async()=>{if(owner.exitCode===null)owner.kill();await closed;await sleep(300);assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});});
  await until(()=>output.includes('READY'),'Worker failed to start: '+output);
  const jobDir=output.match(/Render workspace: (.+)/)[1].trim();
  const record=()=>JSON.parse(fs.readFileSync(path.join(jobDir,'job.json'),'utf8'));
  const childPid=Number(fs.readFileSync(path.join(jobDir,'descendant.pid'),'utf8'));
  return {dir,cache,owner,closed,jobDir,record,childPid};
}
test('Studio SIGINT handler stops descendants and removes bulk session files',async t=>{
  const job=await running(t,{label:'studio',signal:true});
  fs.writeFileSync(path.join(job.dir,'signal'),'stop');
  assert.equal(await job.closed,0);
  assert.equal(alive(job.childPid),false);assert.equal(fs.existsSync(job.jobDir),false);
});
test('render cancellation retains failed cache; Studio cancellation cleans',async t=>{
  const job=await running(t);fs.writeFileSync(path.join(job.jobDir,'cancel.request'),'stop');
  assert.notEqual(await job.closed,0);assert.equal(job.record().status,'failed');assert.equal(alive(job.childPid),false);
});
test('killed owner terminates descendants; recovery starts a new retention period',async t=>{
  const job=await running(t),before=job.record();
  assert.equal(descendantsUsing(job.jobDir,before),true);
  assert.deepEqual(recoverAbandonedJobs(job.cache,before.installationId),[]);
  job.owner.kill();await job.closed;
  await until(()=>!alive(job.childPid)&&!alive(before.supervisorPid),'Orphan workers were not stopped');
  const now=Date.now();assert.deepEqual(recoverAbandonedJobs(job.cache,before.installationId,now),[job.jobDir]);
  assert.equal(job.record().status,'abandoned');assert.equal(Date.parse(job.record().finishedAt),now);
  assert.deepEqual(pruneExpiredJobs(job.cache,before.installationId,now+47*3600000),[]);
  assert.deepEqual(pruneExpiredJobs(job.cache,before.installationId,now+49*3600000),[job.jobDir]);
});
test('loss of owner and supervisor closes the job handle and stops grandchildren',async t=>{
  const job=await running(t),record=job.record();
  // Models a closed console or hard process-tree termination, not a normal stop.
  job.owner.kill();process.kill(record.supervisorPid,'SIGKILL');await job.closed;
  await until(()=>!alive(job.childPid)&&!alive(record.workerPid),'Kill-on-close did not contain descendants');
  await until(()=>!alive(record.supervisorPid),'Supervisor remains active');
  assert.deepEqual(recoverAbandonedJobs(job.cache,record.installationId),[job.jobDir]);
  assert.equal(inspectJobs(job.cache,record.installationId)[0].eligible,false);
});
test('unverified legacy crash records and reused live owner PIDs are preserved',async t=>{
  const job=await running(t),record=job.record();job.owner.kill();await job.closed;
  await until(()=>!alive(job.childPid)&&!alive(record.supervisorPid),'Workers did not stop');
  fs.writeFileSync(path.join(job.jobDir,'job.json'),JSON.stringify({...record,ownerPid:process.pid}));
  assert.deepEqual(recoverAbandonedJobs(job.cache,record.installationId),[]);
  fs.writeFileSync(path.join(job.jobDir,'job.json'),JSON.stringify({...record,schema:'kraven-render-job-v2'}));
  assert.deepEqual(recoverAbandonedJobs(job.cache,record.installationId),[]);
  fs.writeFileSync(path.join(job.jobDir,'job.json'),JSON.stringify({...record,schema:'kraven-render-job-v2',status:'failed',finishedAt:new Date(Date.now()-72*3600000).toISOString()}));
  assert.deepEqual(pruneExpiredJobs(job.cache,record.installationId),[]);
  assert.equal(descendantsUsing(job.jobDir,{...record,guardProtocol:'unknown'}),true);
});
test('real Windows console Ctrl+C stops Studio and cleans its session',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'console-stop-')),entry=path.join(dir,'entry.mjs'),ready=path.join(dir,'ready'),report=path.join(dir,'result.json');
  t.after(()=>{assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});});
  const mod=pathToFileURL(path.resolve('scripts/lib/render-workspace.mjs')).href;
  fs.writeFileSync(entry,`import fs from 'node:fs';import {launchRenderJob,renderWorkspace} from ${JSON.stringify(mod)};if(await launchRenderJob(import.meta.url,'studio'))process.exit(process.exitCode??1);fs.writeFileSync(${JSON.stringify(ready)},renderWorkspace().jobDir);setInterval(()=>{},1000);`);
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  const argv=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/console-stop.ps1'),'-Node',process.execPath,'-Entry',entry,'-Ready',ready,'-Report',report];
  const command=`$p=Start-Process -FilePath powershell.exe -WindowStyle Hidden -PassThru -ArgumentList ${quote(argv.map(a=>'"'+a+'"').join(' '))};$p.WaitForExit();exit $p.ExitCode`;
  const result=spawnSync('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,encoding:'utf8',timeout:45000});
  assert.equal(result.status,0,result.stderr);
  const outcome=JSON.parse(fs.readFileSync(report,'utf8'));
  assert.equal(outcome.code,0,outcome.output);assert.match(outcome.output,/Render cache removed/);
  assert.equal(fs.existsSync(fs.readFileSync(ready,'utf8')),false);
});
