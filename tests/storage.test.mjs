import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync,rmSync,symlinkSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {storageSettings,checkedRoot,installationRoot,createRenderJob,removeRenderJob,inspectJobs,pruneExpiredJobs,assertSpace,cleanupPolicy,automaticCleanup,measureCacheJobs} from '../scripts/lib/render-workspace.mjs';

const install='a'.repeat(24),other='b'.repeat(24);
function fixture(t) {
  const dir=mkdtempSync(path.join(os.tmpdir(),'kvs-storage-test-'));
  t.after(()=>{assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));assert.match(path.basename(dir),/^kvs-storage-test-/);rmSync(dir,{recursive:true,force:true});});
  return dir;
}
function update(job,values){const record={...job.record,...values};writeFileSync(path.join(job.jobDir,'job.json'),JSON.stringify(record));return record;}
function worker(t,body,extra={}) {
  const dir=fixture(t),script=path.join(dir,'worker.mjs'),cache=path.join(dir,'cache');
  const module=pathToFileURL(path.resolve('scripts/lib/render-workspace.mjs')).href;
  writeFileSync(script,`import {launchRenderJob,renderWorkspace} from ${JSON.stringify(module)};\nif(await launchRenderJob(import.meta.url,'fixture'))process.exit(process.exitCode??0);\n${body}`);
  const result=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,KVS_RENDER_CACHE_ROOT:cache,...extra}});
  return {dir,cache,result};
}
test('saved storage, explicit override, legacy fallback and protected media boundaries',t=>{
  const dir=fixture(t),project=path.join(dir,'studio'),cache=path.join(dir,'cache');mkdirSync(project);
  writeFileSync(path.join(project,'studio.local.json'),JSON.stringify({storage:{renderCacheRoot:cache},workspace:{raw:path.join(dir,'raw')}}));
  assert.equal(storageSettings(project,{}).root,cache);
  assert.equal(storageSettings(project,{KVS_RENDER_CACHE_ROOT:path.join(dir,'override')}).root,path.join(dir,'override'));
  assert.throws(()=>storageSettings(project,{KVS_RENDER_CACHE_ROOT:dir}),/overlaps/);
  assert.throws(()=>storageSettings(project,{KVS_RENDER_CACHE_ROOT:path.join(dir,'raw','cache')}),/overlaps/);
  assert.throws(()=>storageSettings(project,{KVS_RENDER_CACHE_ROOT:'relative'}),/absolute/);
  assert.throws(()=>storageSettings(project,{STUDIO_CONFIG:path.join(dir,'missing.json')}),/unavailable/);
  assert.equal(storageSettings(path.join(dir,'legacy'),{}).configured,false);
});
test('cache refuses drive roots, unowned nonempty folders and forged markers',t=>{
  const dir=fixture(t);writeFileSync(path.join(dir,'keep.txt'),'original');
  assert.throws(()=>checkedRoot(dir),/Unowned/);assert.equal(readFileSync(path.join(dir,'keep.txt'),'utf8'),'original');
  assert.throws(()=>checkedRoot(path.parse(dir).root),/dedicated/);
  const root=checkedRoot(path.join(dir,'cache'));writeFileSync(path.join(root,'.kraven-render-cache.json'),'{}');assert.throws(()=>checkedRoot(root),/ownership/);
});
test('ownership token, containment and installation isolation protect other jobs',t=>{
  const root=path.join(fixture(t),'cache');const a=createRenderJob(root,install,'test',import.meta.filename),b=createRenderJob(root,other,'test',import.meta.filename);
  assert.throws(()=>removeRenderJob(root,a.jobDir,'wrong'),/ownership/);
  assert.throws(()=>removeRenderJob(root,path.dirname(a.jobDir),a.record.token),/escapes/);
  removeRenderJob(root,a.jobDir,a.record.token);assert.equal(existsSync(a.jobDir),false);assert.equal(existsSync(b.jobDir),true);
});
test('active, recent, unfinished and unowned jobs survive expiry; terminal expired jobs clean',t=>{
  const root=path.join(fixture(t),'cache'),old=new Date(Date.now()-72*3600000).toISOString();
  const make=()=>createRenderJob(root,install,'test',import.meta.filename);
  const active=make(),recent=make(),unfinished=make(),expired=make(),linkedWorker=make();
  update(active,{status:'failed',finishedAt:old});
  update(recent,{ownerPid:2147483647,status:'failed',finishedAt:new Date().toISOString()});
  update(unfinished,{ownerPid:2147483647,createdAt:old});
  update(expired,{ownerPid:2147483647,status:'failed',finishedAt:old});
  update(linkedWorker,{ownerPid:2147483647,status:'failed',finishedAt:old});
  const unknown=path.join(installationRoot(root,install),'manual-files');mkdirSync(unknown);
  const removed=pruneExpiredJobs(root,install,Date.now(),dir=>dir===linkedWorker.jobDir);
  assert.deepEqual(removed,[expired.jobDir]);for(const j of [active,recent,unfinished,linkedWorker])assert.ok(existsSync(j.jobDir));assert.ok(existsSync(unknown));
});
test('junctions at cache roots and inside owned jobs are refused without touching target',t=>{
  const dir=fixture(t),target=path.join(dir,'original');mkdirSync(target);writeFileSync(path.join(target,'keep'),'media');
  const link=path.join(dir,'link');symlinkSync(target,link,'junction');assert.throws(()=>checkedRoot(link),/Linked/);
  const root=path.join(dir,'cache'),job=createRenderJob(root,install,'test',import.meta.filename);symlinkSync(target,path.join(job.jobDir,'linked'),'junction');
  assert.throws(()=>removeRenderJob(root,job.jobDir,job.record.token),/Linked/);assert.equal(readFileSync(path.join(target,'keep'),'utf8'),'media');
});
test('capacity includes staging copies and fixed headroom',()=>{
  const disk={bsize:1,bavail:12*1024**3};assertSpace('.',1024**3,disk);assert.throws(()=>assertSpace('.',2*1024**3,disk),/Insufficient/);assert.throws(()=>assertSpace('.',0,{bsize:1,bavail:9*1024**3}),/Insufficient/);
});
test('successful worker inherits job temp and cleans only its owned cache',t=>{
  const {cache,result}=worker(t,`import os from 'node:os';import fs from 'node:fs';import path from 'node:path';const w=renderWorkspace();if(os.tmpdir()!==path.join(w.jobDir,'temp'))throw Error('wrong temp');fs.writeFileSync(path.join(os.tmpdir(),'scratch'),'disposable');console.log('TEMP_MATCH');`);
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/TEMP_MATCH/);assert.match(result.stdout,/Render cache removed/);
  const ns=readdirSync(cache).filter(n=>/^[a-f0-9]{24}$/.test(n));assert.equal(ns.length,1);assert.deepEqual(readdirSync(path.join(cache,ns[0])),[]);
});
test('failed worker retains diagnostic cache and propagates failure',t=>{
  const {cache,result}=worker(t,`throw Error('intentional fixture failure');`);assert.notEqual(result.status,0);assert.match(result.stderr,/intentional fixture failure/);
  const ns=readdirSync(cache).find(n=>/^[a-f0-9]{24}$/.test(n)),jobs=inspectJobs(cache,ns);assert.equal(jobs.length,1);assert.equal(jobs[0].record.status,'failed');assert.equal(jobs[0].eligible,false);
});
test('asset staging copies selected files only and rejects escaping destinations',t=>{
  const {result}=worker(t,`import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';const w=renderWorkspace();const source=path.join(w.jobDir,'chosen.bin');fs.writeFileSync(source,'selected');w.stageFile(source,'assets/chosen.bin');assert.equal(fs.readFileSync(path.join(w.publicDir,'assets/chosen.bin'),'utf8'),'selected');assert.deepEqual(fs.readdirSync(w.publicDir),['assets']);assert.throws(()=>w.stageFile(source,'../escape'),/escapes/);`);
  assert.equal(result.status,0,result.stderr);
});
test('forged inherited job cannot bypass ownership',t=>{
  const {result}=worker(t,'',{KVS_RENDER_JOB:path.join(os.tmpdir(),'fake-job'),KVS_RENDER_JOB_TOKEN:'invalid'});assert.notEqual(result.status,0);
});
test('unavailable drive refuses work without fallback', {skip:process.platform!=='win32'},()=>{
  const missing='ZYXWVUTSRQPONMLKJIHGFED'.split('').find(c=>!existsSync(c+':\\'));
  assert.ok(missing);assert.throws(()=>checkedRoot(missing+':\\RenderCache\\Test'),/unavailable/);
});
test('simultaneous workers use separate jobs and both clean successfully',async t=>{
  const dir=fixture(t),cache=path.join(dir,'cache'),script=path.join(dir,'parallel.mjs');
  const module=pathToFileURL(path.resolve('scripts/lib/render-workspace.mjs')).href;
  checkedRoot(cache);
  writeFileSync(script,`import {launchRenderJob} from ${JSON.stringify(module)};if(await launchRenderJob(import.meta.url,'parallel'))process.exit(process.exitCode??0);await new Promise(r=>setTimeout(r,400));`);
  const run=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[script],{env:{...process.env,KVS_RENDER_CACHE_ROOT:cache},windowsHide:true});let output='';p.stdout.on('data',s=>output+=s);p.stderr.on('data',s=>output+=s);p.on('error',reject);p.on('exit',code=>resolve({code,output}));});
  const results=await Promise.all([run(),run()]);for(const r of results)assert.equal(r.code,0,r.output);
  const locations=results.map(r=>r.output.match(/Render workspace: (.+)/)[1]);assert.notEqual(locations[0],locations[1]);for(const p of locations)assert.ok(!existsSync(p.trim()));
});
test('a terminated render worker leaves failed cache and a failing exit code',async t=>{
  const dir=fixture(t),cache=path.join(dir,'cache'),script=path.join(dir,'crash.mjs');
  const module=pathToFileURL(path.resolve('scripts/lib/render-workspace.mjs')).href;
  writeFileSync(script,`import {launchRenderJob} from ${JSON.stringify(module)};if(await launchRenderJob(import.meta.url,'crash'))process.exit(process.exitCode??0);console.log('WORKER_READY');setInterval(()=>{},1000);`);
  const parent=spawn(process.execPath,[script],{env:{...process.env,KVS_RENDER_CACHE_ROOT:cache},windowsHide:true});let output='',errors='';
  const closed=new Promise((resolve,reject)=>{parent.on('error',reject);parent.on('exit',resolve);});
  parent.stderr.on('data',s=>errors+=s);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker did not start: '+errors)),10000);parent.stdout.on('data',s=>{output+=s;if(output.includes('WORKER_READY')){clearTimeout(timer);resolve();}});});
  const jobDir=output.match(/Render workspace: (.+)/)[1].trim();const record=JSON.parse(readFileSync(path.join(jobDir,'job.json'),'utf8'));
  process.kill(record.workerPid,'SIGTERM');const code=await closed;assert.notEqual(code,0);assert.ok(existsSync(jobDir));assert.equal(JSON.parse(readFileSync(path.join(jobDir,'job.json'),'utf8')).status,'failed');
});


test('cleanup defaults and saved policy reject dangerous or mistyped settings',t=>{
  assert.deepEqual(cleanupPolicy(),{autoClean:true,retentionHours:48,cacheWarningGiB:20});
  const dir=fixture(t),project=path.join(dir,'studio');mkdirSync(project);
  writeFileSync(path.join(project,'studio.local.json'),JSON.stringify({storage:{autoClean:false,retentionHours:96,cacheWarningGiB:50}}));
  const settings=storageSettings(project,{});
  assert.equal(settings.autoClean,false);assert.equal(settings.retentionHours,96);assert.equal(settings.cacheWarningGiB,50);
  for(const policy of [{autoClean:'false'},{autoClean:0},{retentionHours:47},{retentionHours:721},{retentionHours:48.5},{retentionHours:null},{cacheWarningGiB:0},{cacheWarningGiB:'20'},{cacheWarningGiB:Infinity}])assert.throws(()=>cleanupPolicy(policy),/storage\./);
});

test('automatic cleanup respects disabled state and custom retention without touching active or other jobs',t=>{
  const root=path.join(fixture(t),'cache'),now=Date.now();
  const settings={root,installationId:install,autoClean:false,retentionHours:96,cacheWarningGiB:1};
  const expired=createRenderJob(root,install,'test',import.meta.filename),recent=createRenderJob(root,install,'test',import.meta.filename),active=createRenderJob(root,install,'test',import.meta.filename),foreign=createRenderJob(root,other,'test',import.meta.filename);
  const terminal=hours=>({ownerPid:2147483647,status:'failed',finishedAt:new Date(now-hours*3600000).toISOString()});
  update(expired,terminal(100));update(recent,terminal(72));update(active,{...terminal(100),ownerPid:process.pid});update(foreign,terminal(100));
  const before=readFileSync(path.join(expired.jobDir,'job.json'));
  assert.deepEqual(automaticCleanup(settings,now,()=>false).removed,[]);
  assert.deepEqual(readFileSync(path.join(expired.jobDir,'job.json')),before);
  assert.deepEqual(automaticCleanup({...settings,autoClean:true},now,()=>false).removed,[expired.jobDir]);
  for(const job of [recent,active,foreign])assert.ok(existsSync(job.jobDir));
  // The same policy becomes eligible only at its configured retention boundary.
  assert.deepEqual(pruneExpiredJobs(root,install,now+24*3600000,()=>false,settings),[recent.jobDir]);
});

test('cache measurement preserves linked and unknown files and reports incomplete recognized jobs',t=>{
  const dir=fixture(t),root=path.join(dir,'cache'),job=createRenderJob(root,install,'test',import.meta.filename);
  writeFileSync(path.join(job.jobDir,'temp','scratch'),'scratch');
  const target=path.join(dir,'durable');mkdirSync(target);writeFileSync(path.join(target,'keep'),'keep');
  const linked=createRenderJob(root,install,'test',import.meta.filename);symlinkSync(target,path.join(linked.jobDir,'foreign'),'junction');
  const unknown=path.join(installationRoot(root,install),'unowned');mkdirSync(unknown);writeFileSync(path.join(unknown,'keep'),'unknown');
  const result=measureCacheJobs(inspectJobs(root,install),{cacheWarningGiB:1});
  assert.equal(result.jobs.find(j=>j.jobDir===job.jobDir).bytes,readFileSync(path.join(job.jobDir,'job.json')).length+7);
  assert.equal(result.usage.unmeasuredJobs,1);assert.equal(result.usage.warningBytes,1024**3);assert.equal(result.usage.overWarning,false);
  assert.equal(readFileSync(path.join(target,'keep'),'utf8'),'keep');assert.equal(readFileSync(path.join(unknown,'keep'),'utf8'),'unknown');
});

test('manual CLI applies saved retention even with auto cleanup off and preview leaves metadata untouched',t=>{
  const dir=fixture(t),root=path.join(dir,'cache'),configPath=path.join(dir,'settings.json');
  writeFileSync(configPath,JSON.stringify({storage:{renderCacheRoot:root,autoClean:false,retentionHours:96,cacheWarningGiB:20}}));
  const env={...process.env,STUDIO_CONFIG:configPath,KVS_RENDER_CACHE_ROOT:root};
  const settings=storageSettings(undefined,env),now=Date.now();
  const expired=createRenderJob(root,settings.installationId,'test',import.meta.filename),recent=createRenderJob(root,settings.installationId,'test',import.meta.filename);
  for(const [job,hours] of [[expired,100],[recent,72]])update(job,{ownerPid:2147483647,status:'failed',finishedAt:new Date(now-hours*3600000).toISOString()});
  const before=readFileSync(path.join(expired.jobDir,'job.json'));
  const run=args=>{const result=spawnSync(process.execPath,['scripts/storage.mjs',...args],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
  const preview=run(['--clean']);assert.equal(preview.policy.autoClean,false);assert.equal(preview.policy.retentionHours,96);assert.deepEqual(preview.removed,[]);assert.deepEqual(readFileSync(path.join(expired.jobDir,'job.json')),before);
  const applied=run(['--clean','--apply']);assert.deepEqual(applied.removed,[expired.jobDir]);assert.ok(existsSync(recent.jobDir));assert.equal(applied.jobs.length,1);assert.equal(applied.jobs[0].eligible,false);
});
