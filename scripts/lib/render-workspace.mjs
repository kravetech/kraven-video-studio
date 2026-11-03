import {constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statfsSync, writeFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {replaceFileSync} from './atomic-file.mjs';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MARKER = '.kraven-render-cache.json';
const SCHEMA = 'kraven-render-job-v3';
const GUARD = fileURLToPath(new URL('./render-guard.ps1',import.meta.url));
const JOB_NAME = /^\d{8}-[a-z0-9-]+-[A-Za-z0-9]{6}$/;
export function cleanupPolicy(storage={}) {
  const {autoClean=true, retentionHours=48, cacheWarningGiB=20}=storage;
  if(typeof autoClean!=='boolean') throw Error('storage.autoClean must be Boolean.');
  if(!Number.isInteger(retentionHours)||retentionHours<48||retentionHours>720) throw Error('storage.retentionHours must be an integer from 48 to 720.');
  if(!Number.isInteger(cacheWarningGiB)||cacheWarningGiB<1||cacheWarningGiB>10240) throw Error('storage.cacheWarningGiB must be an integer from 1 to 10240.');
  return {autoClean,retentionHours,cacheWarningGiB};
}
const HEADROOM = 10 * 1024 ** 3;

export function noLinks(filename) {
  for (let current = path.resolve(filename); ; current = path.dirname(current)) {
    try {if(lstatSync(current).isSymbolicLink()) throw Error(`Linked render path refused: ${current}`);}
    catch(error) {if(error.code!=='ENOENT') throw error;}
    if (path.dirname(current) === current) break;
  }
}
function treeWithoutLinks(root) {
  for (const entry of readdirSync(root, {withFileTypes:true})) {
    const file=path.join(root,entry.name);
    if (lstatSync(file).isSymbolicLink()) throw Error(`Linked cache entry refused: ${file}`);
    if(entry.isDirectory()) treeWithoutLinks(file);
  }
}
function inside(parent, child) {
  const rel=path.relative(path.resolve(parent),path.resolve(child));
  return rel==='' || (!path.isAbsolute(rel) && rel!=='..' && !rel.startsWith('..'+path.sep));
}
export function storageSettings(project=PROJECT, env=process.env) {
  const configPath=env.STUDIO_CONFIG || path.join(project,'studio.local.json');
  let config={};
  if(existsSync(configPath)) {
    noLinks(configPath);
    config=JSON.parse(readFileSync(configPath,'utf8').replace(/^\uFEFF/,''));
  } else if(env.STUDIO_CONFIG) throw Error('Configured studio settings file is unavailable.');
  if(config.storage!==undefined && (!config.storage || typeof config.storage!=='object' || Array.isArray(config.storage))) throw Error('Invalid storage configuration.');
  const configured=env.KVS_RENDER_CACHE_ROOT ?? config.storage?.renderCacheRoot;
  if(configured!==undefined && (typeof configured!=='string' || !path.isAbsolute(configured))) throw Error('Render cache must be an absolute dedicated folder.');
  const root=path.resolve(configured || path.join(project,'.studio','render-cache'));
  // Never permit cleanup storage to overlap durable source or media directories.
  const protectedPaths=[path.join(project,'public'),path.join(project,'src'),path.join(project,'out'),path.join(project,'workspace'),
    ...Object.values(config.workspace||{}).filter(v=>typeof v==='string'),
    ...(env.KRAVEN_PROTECTED_ROOTS||'').split(path.delimiter).filter(Boolean)];
  if(root===path.parse(root).root || inside(root,project) || protectedPaths.some(p=>inside(p,root)||inside(root,p))) throw Error('Render cache overlaps protected source/media storage. Choose a separate dedicated folder.');
  return {root, configured:!!configured, ...cleanupPolicy(config.storage), installationId:createHash('sha256').update(path.resolve(project).toLowerCase()).digest('hex').slice(0,24)};
}
export function cacheRoot(project=PROJECT) {return storageSettings(project).root;}

export function checkedRoot(root, {create=true}={}) {
  if(!path.isAbsolute(root) || root===path.parse(root).root) throw Error('A dedicated absolute render-cache folder is required.');
  noLinks(root);
  // An unavailable volume must never fall back to the system temp directory.
  if(!existsSync(path.parse(root).root)) throw Error('Render drive is unavailable. Reconnect it or change the saved render-cache folder.');
  if(!existsSync(root)) {
    if(!create) return null;
    mkdirSync(root,{recursive:true});
  }
  if(!lstatSync(root).isDirectory()) throw Error('Render cache is not a directory.');
  root=realpathSync(root);
  const marker=path.join(root,MARKER); noLinks(marker);
  if(!existsSync(marker)) {
    if(readdirSync(root).length || !create) throw Error('Unowned/nonempty render-cache folder refused. Select an empty dedicated folder.');
    try {writeFileSync(marker,JSON.stringify({schema:'kraven-render-cache-v1'})+'\n',{flag:'wx'});}
    catch(error) {if(error.code!=='EEXIST') throw error;}
  }
  if(JSON.parse(readFileSync(marker,'utf8')).schema!=='kraven-render-cache-v1') throw Error('Invalid render-cache ownership marker.');
  return root;
}
export function installationRoot(root, installationId, {create=true}={}) {
  if(!/^[a-f0-9]{24}$/.test(installationId)) throw Error('Invalid render installation identity.');
  root=checkedRoot(root,{create}); if(!root) return null;
  const dir=path.join(root,installationId); noLinks(dir);
  if(!existsSync(dir)) {if(!create)return null;mkdirSync(dir,{recursive:true});}
  noLinks(dir);
  return dir;
}
export function assertSpace(root, assetBytes=0, disk=statfsSync(root)) {
  if(!Number.isFinite(assetBytes)||assetBytes<0) throw Error('Invalid staged asset size.');
  const available=Number(disk.bavail)*Number(disk.bsize);
  if(available<HEADROOM+2*assetBytes) throw Error('Insufficient render-drive space: reserve 10 GiB headroom plus staging/bundle copies. Free cache or select another folder.');
  return available;
}
function writeJob(dir, record) {
  const target=path.join(dir,'job.json'); noLinks(target);
  const temporary=path.join(dir,`.job-${randomUUID()}.json`);
  writeFileSync(temporary,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  try {replaceFileSync(temporary,target);}
  finally {rmSync(temporary,{force:true});}
}
function readJob(root, jobDir) {
  checkedRoot(root,{create:false});
  const absolute=path.resolve(jobDir), ns=path.dirname(absolute);
  if(path.dirname(ns)!==realpathSync(root)||!/^[a-f0-9]{24}$/.test(path.basename(ns))||!JOB_NAME.test(path.basename(absolute))) throw Error('Render job escapes its installation directory.');
  noLinks(absolute); noLinks(path.join(absolute,'job.json'));
  const r=JSON.parse(readFileSync(path.join(absolute,'job.json'),'utf8'));
  if(![SCHEMA,'kraven-render-job-v2'].includes(r.schema)||r.id!==path.basename(absolute)||r.installationId!==path.basename(ns)||!r.token||!Number.isInteger(r.ownerPid)) throw Error('Invalid render-job ownership record.');
  return r;
}
export function removeRenderJob(root, dir, token) {
  const r=readJob(root,dir); if(r.token!==token)throw Error('Render-job ownership mismatch.');
  treeWithoutLinks(dir);
  // Exact immediate job child, ownership token and all link checks precede deletion.
  rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:250});
}
function alive(pid) {
  if(!Number.isInteger(pid)||pid<=0)return false;
  try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}
}
export function inspectJobs(root, installationId, now=Date.now(), policy={}) {
  const retainMs=cleanupPolicy(policy).retentionHours*3600000;
  const dir=installationRoot(root,installationId,{create:false}); if(!dir)return [];
  return readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&JOB_NAME.test(e.name)).map(e=>{
    const jobDir=path.join(dir,e.name);
    try {
      const record=readJob(root,jobDir),active=alive(record.ownerPid)||alive(record.supervisorPid)||alive(record.workerPid);
      const terminal=['complete','failed','cancelled','abandoned'].includes(record.status);
      const expired=Number.isFinite(Date.parse(record.finishedAt))&&now-Date.parse(record.finishedAt)>=retainMs;
      return {jobDir,record,active,eligible:!active&&terminal&&expired};
    }catch(e){return {jobDir,eligible:false,error:e.message};}
  });
}
export function descendantsUsing(jobDir, record) {
  if(process.platform!=='win32') return true; // Automatic stale cleanup is supported on Windows only.
  if(record?.schema===SCHEMA && record.guardProtocol==='windows-job-v1' && record.guardName===`Local\\KVS-${record.token}`) {
    try {
      const count=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',GUARD,'-Inspect',record.guardName],{encoding:'utf8',windowsHide:true,timeout:15000}).trim();
      return count!=='0';
    } catch {return true;}
  }
  // A process listing cannot prove that an untracked grandchild has exited.
  // Preserve legacy or unrecognized containment metadata, even for old failures.
  return true;
}
export function recoverAbandonedJobs(root,installationId,now=Date.now()) {
  const recovered=[];
  for(const job of inspectJobs(root,installationId,now)) {
    const r=job.record;
    if(job.active||r?.status!=='running'||r.schema!==SCHEMA||r.guardProtocol!=='windows-job-v1'||descendantsUsing(job.jobDir,r))continue;
    // Start retention when abandonment is first proven, not when a long session began.
    r.status='abandoned';r.finishedAt=new Date(now).toISOString();r.recoveredAt=r.finishedAt;
    writeJob(job.jobDir,r);try{saveDiagnostic(r);}catch{}
    recovered.push(job.jobDir);
  }
  return recovered;
}
export function pruneExpiredJobs(root, installationId, now=Date.now(), inUse=descendantsUsing, policy={}) {
  policy=cleanupPolicy(policy);
  recoverAbandonedJobs(root,installationId,now);
  const removed=[];
  for(const job of inspectJobs(root,installationId,now,policy)) {
    if(!job.eligible||inUse(job.jobDir,job.record))continue;
    try {removeRenderJob(root,job.jobDir,job.record.token);removed.push(job.jobDir);}
    catch(e){console.warn(`Keeping cache: ${e.message}`);}
  }
  return removed;
}
// Read-only, best-effort accounting: active workers may change files during measurement.
export function measureCacheJobs(jobs, policy={}) {
  const {cacheWarningGiB}=cleanupPolicy(policy);
  const size=dir=>{
    noLinks(dir);
    return readdirSync(dir,{withFileTypes:true}).reduce((sum,entry)=>{
      const file=path.join(dir,entry.name),stat=lstatSync(file);
      if(stat.isSymbolicLink()) throw Error('Linked cache entry refused.');
      return sum+(stat.isDirectory()?size(file):stat.size);
    },0);
  };
  const measured=jobs.map(({record,...job})=>{
    if(job.error)return {...job,bytes:null,status:record?.status};
    try{return {...job,bytes:size(job.jobDir),status:record?.status};}
    catch{return {...job,bytes:null,status:record?.status,measurementError:'Cache changed or could not be safely measured.'};}
  });
  const measuredBytes=measured.reduce((sum,job)=>sum+(job.bytes??0),0);
  return {jobs:measured,usage:{measuredBytes,unmeasuredJobs:measured.filter(j=>j.bytes===null).length,
    warningBytes:cacheWarningGiB*1024**3,overWarning:measuredBytes>=cacheWarningGiB*1024**3,
    scope:'Recognized jobs in this installation only; unknown folders and other installations excluded.'}};
}
export function automaticCleanup(settings, now=Date.now(), inUse=descendantsUsing) {
  const policy=cleanupPolicy(settings);
  // Disabling automatic cleanup also avoids automatic abandonment metadata changes.
  const removed=policy.autoClean?pruneExpiredJobs(settings.root,settings.installationId,now,inUse,policy):[];
  const {usage}=measureCacheJobs(inspectJobs(settings.root,settings.installationId,now,policy),policy);
  return {removed,usage};
}
export function createRenderJob(root, installationId, label, entry, now=new Date()) {
  const ns=installationRoot(root,installationId);
  if(!/^[a-z0-9-]{1,48}$/.test(label))throw Error('Invalid render label.');
  const dir=mkdtempSync(path.join(ns,`${now.toISOString().slice(0,10).replaceAll('-','')}-${label}-`));
  const record={schema:SCHEMA,id:path.basename(dir),installationId,token:randomUUID(),ownerPid:process.pid,entry:path.resolve(entry),createdAt:now.toISOString(),status:'running'};
  // Reserve the containment identity before any supervisor can start. The guard
  // pins the owner process and refuses resume after owner death, so a crash
  // during startup can also be recovered without an age-only deletion guess.
  if(process.platform==='win32')Object.assign(record,{guardProtocol:'windows-job-v1',guardName:`Local\\KVS-${record.token}`});
  writeJob(dir,record);
  for(const name of ['public','bundle','temp'])mkdirSync(path.join(dir,name));
  return {root,jobDir:dir,record};
}
function saveDiagnostic(record) {
  const dir=process.env.KVS_RENDER_LOG_ROOT||path.join(PROJECT,'.studio','render-logs');noLinks(dir);mkdirSync(dir,{recursive:true});
  writeFileSync(path.join(dir,`${record.id}.json`),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
}
export async function launchRenderJob(moduleUrl,label) {
  const entry=fileURLToPath(moduleUrl);
  if(process.env.KVS_RENDER_JOB) {
    const dir=path.resolve(process.env.KVS_RENDER_JOB),root=path.dirname(path.dirname(dir)),r=readJob(root,dir);
    if(r.token!==process.env.KVS_RENDER_JOB_TOKEN||r.entry!==entry||(r.supervisorPid??r.ownerPid)!==process.ppid)throw Error('Invalid inherited render job. Start from a normal shell.');
    r.workerPid=process.pid;writeJob(dir,r);return false;
  }
  const settings=storageSettings();
  if(!settings.configured)console.warn('Render storage has not been selected. Using local .studio/render-cache; run the installer to choose a non-system drive.');
  const root=checkedRoot(settings.root);installationRoot(root,settings.installationId);
  const cleanup=automaticCleanup({...settings,root});
  if(cleanup.usage.overWarning)console.warn(`Measured render cache exceeds the ${settings.cacheWarningGiB} GiB warning threshold. Active and retained jobs are preserved; inspect with pnpm storage:status. This is not a hard cap.`);
  if(cleanup.usage.unmeasuredJobs)console.warn('Some render-cache jobs could not be safely measured; inspect with pnpm storage:status.');
  assertSpace(root);
  const job=createRenderJob(root,settings.installationId,label,entry),temp=path.join(job.jobDir,'temp');
  const guarded=process.platform==='win32';
  if(guarded) {
    job.record.guardName=`Local\\KVS-${job.record.token}`;writeJob(job.jobDir,job.record);
    writeFileSync(path.join(job.jobDir,'launch.json'),JSON.stringify({executable:process.execPath,arguments:[entry,...process.argv.slice(2)],cwd:process.cwd()}),{flag:'wx'});
  }
  console.log(`Render workspace: ${job.jobDir}`);
  let exitCode=1,interrupted=false;
  try {
    const child=spawn(guarded?'powershell.exe':process.execPath,guarded?['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',GUARD,'-JobDir',job.jobDir]:[entry,...process.argv.slice(2)],{cwd:process.cwd(),stdio:'inherit',windowsHide:true,
      env:{...process.env,TEMP:temp,TMP:temp,TMPDIR:temp,KVS_RENDER_JOB:job.jobDir,KVS_RENDER_JOB_TOKEN:job.record.token}});
    const stop=()=>{
      interrupted=true;
      if(guarded){try{writeFileSync(path.join(job.jobDir,'cancel.request'),'stop\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}}
      else child.kill('SIGTERM');
    };
    const signals=process.platform==='win32'?['SIGINT','SIGTERM','SIGBREAK']:['SIGINT','SIGTERM'];
    for(const signal of signals)process.on(signal,stop);
    try{exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});}
    finally{for(const signal of signals)process.off(signal,stop);}
  } finally {
    const record=readJob(root,job.jobDir);
    let result;
    try{result=JSON.parse(readFileSync(path.join(job.jobDir,'guard-result.json'),'utf8'));}catch{}
    interrupted ||= result?.reason==='cancelled';
    record.status=interrupted&&label==='studio'?'cancelled':exitCode===0&&!interrupted?'complete':'failed';
    record.finishedAt=new Date().toISOString();record.exitCode=exitCode;record.interrupted=interrupted;
    writeJob(job.jobDir,record);
    try{saveDiagnostic(record);}catch(e){console.warn(`Diagnostic log could not be saved: ${e.message}`);}
    if(['complete','cancelled'].includes(record.status)) {
      try{
        if(descendantsUsing(job.jobDir,record))throw Error('a descendant may still be using this job');
        removeRenderJob(root,job.jobDir,record.token);console.log('Render cache removed.');
      }
      catch(e){console.warn(`Output saved; cache cleanup deferred: ${e.message}`);}
    }else console.error(`Failed job cache retained for at least ${settings.retentionHours} hours: ${job.jobDir}`);
  }
  process.exitCode=interrupted&&label==='studio'?0:interrupted?130:exitCode;return true;
}
export function renderWorkspace() {
  if(!process.env.KVS_RENDER_JOB)throw Error('Start rendering through its job launcher.');
  const jobDir=path.resolve(process.env.KVS_RENDER_JOB),root=path.dirname(path.dirname(jobDir)),r=readJob(root,jobDir);
  if(r.token!==process.env.KVS_RENDER_JOB_TOKEN||r.workerPid!==process.pid)throw Error('Render workspace is not owned by this worker.');
  const publicDir=path.join(jobDir,'public'),outDir=path.join(jobDir,'bundle');let stagedBytes=0,bundled;
  const stageFile=(source,relative)=>{
    const target=path.resolve(publicDir,relative);
    if(!relative||path.isAbsolute(relative)||!inside(publicDir,target)||target===publicDir)throw Error('Asset destination escapes the job public directory.');
    noLinks(source);noLinks(target);const stat=lstatSync(source);if(!stat.isFile())throw Error('Asset must be a regular file.');
    assertSpace(root,stat.size);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(source,target,constants.COPYFILE_EXCL);stagedBytes+=stat.size;
    return path.relative(publicDir,target).replaceAll('\\','/');
  };
  const stageShared=()=>{
    const dir=path.join(PROJECT,'public','brand');if(!existsSync(dir))return;noLinks(dir);treeWithoutLinks(dir);
    for(const e of readdirSync(dir,{recursive:true,withFileTypes:true}))if(e.isFile())stageFile(path.join(e.parentPath,e.name),path.join('brand',path.relative(dir,path.join(e.parentPath,e.name))));
  };
  return {jobDir,publicDir,outDir,stageFile,stageShared,bundle:options=>{
    assertSpace(root,stagedBytes);
    bundled??=import('@remotion/bundler').then(({bundle})=>bundle({...options,publicDir,outDir}));return bundled;
  }};
}
