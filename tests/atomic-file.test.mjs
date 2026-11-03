import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,renameSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import os from 'node:os';
import {replaceFileSync} from '../scripts/lib/atomic-file.mjs';

function fixture(t) {
  const dir=mkdtempSync(path.join(os.tmpdir(),'kvs-atomic-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));
  const target=path.join(dir,'job.json'),temporary=path.join(dir,'next.json');
  writeFileSync(target,'previous');writeFileSync(temporary,'next');
  return {target,temporary};
}
async function lock(t,target,duration) {
  const script='$f=[IO.File]::Open($env:KVS_TEST_LOCK_TARGET,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{[Console]::WriteLine("LOCKED");[Console]::Out.Flush();Start-Sleep -Milliseconds '+duration+'}finally{$f.Dispose()}';
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,KVS_TEST_LOCK_TARGET:target},windowsHide:true});
  const closed=once(child,'close');let stderr='';child.stderr.on('data',s=>stderr+=s);
  const release=async()=>{if(child.exitCode===null)child.kill();await closed;};
  t.after(release);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('File lock was not acquired: '+stderr)),10000);
    child.stdout.on('data',s=>{if(String(s).includes('LOCKED')){clearTimeout(timer);resolve();}});
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('Lock helper failed: '+stderr));});
  });
  return release;
}
test('atomic replacement retains the previous file when the source is absent',t=>{
  const {target,temporary}=fixture(t);rmSync(temporary);
  assert.throws(()=>replaceFileSync(temporary,target),{code:'ENOENT'});
  assert.equal(readFileSync(target,'utf8'),'previous');
});
test('atomic replacement waits for a transient Windows sharing lock',{skip:process.platform!=='win32'},async t=>{
  const {target,temporary}=fixture(t);const release=await lock(t,target,300);
  try {
    assert.throws(()=>renameSync(temporary,target),e=>['EPERM','EACCES','EBUSY'].includes(e.code));
    replaceFileSync(temporary,target);
    assert.equal(readFileSync(target,'utf8'),'next');assert.equal(existsSync(temporary),false);
  } finally {await release();}
});
test('atomic replacement fails within a bounded wait and preserves both files under a persistent lock',{skip:process.platform!=='win32'},async t=>{
  const {target,temporary}=fixture(t);const release=await lock(t,target,5000);
  try {
    const start=Date.now();assert.throws(()=>replaceFileSync(temporary,target),e=>['EPERM','EACCES','EBUSY'].includes(e.code));
    assert.ok(Date.now()-start<3000);assert.equal(readFileSync(target,'utf8'),'previous');assert.equal(readFileSync(temporary,'utf8'),'next');
  } finally {await release();}
});
