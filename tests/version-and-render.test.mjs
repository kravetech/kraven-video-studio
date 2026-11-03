import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseVersion,compareVersion,checkVersion,versionPlan} from '../scripts/version.mjs';
import {renderPort,renderOptions} from '../scripts/lib/render-options.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-version-test-'));
  t.after(()=>{
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('studio-version-test-'));
    assert.ok(!fs.lstatSync(root).isSymbolicLink());fs.rmSync(root,{recursive:true,force:true});
  });
  fs.mkdirSync(path.join(root,'installer'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'fixture',version:'1.0.0-rc.8'}));
  fs.writeFileSync(path.join(root,'installer/toolchain.lock.json'),JSON.stringify({productVersion:'1.0.0-rc.8'}));
  for(const n of ['README.md','INSTALL.md','ARCHITECTURE.md'])fs.writeFileSync(path.join(root,n),'Current **1.0.0-rc.8**\n');
  fs.writeFileSync(path.join(root,'CHANGELOG.md'),'# Changes\n\n## 1.0.0-rc.8 — synthetic\n');
  return root;
}
test('strict SemVer ordering handles numeric prereleases and rejects misleading identifiers',()=>{
  for(const v of ['1.0.0-rc.8','1.0.0','2.1.3-alpha.1+build.001'])parseVersion(v);
  for(const v of ['v1.0.0','01.0.0','1.0','1.0.0-rc.08','1.0.0-','1.0.0\n'])assert.throws(()=>parseVersion(v));
  assert.equal(compareVersion('1.0.0-rc.9','1.0.0-rc.10'),-1);
  assert.equal(compareVersion('1.0.0-rc.10','1.0.0'),-1);
  assert.equal(compareVersion('1.0.1','1.0.0'),1);
  assert.equal(compareVersion('1.0.0+one','1.0.0+two'),0);
});
test('version gate refuses installer, changelog and tag drift',t=>{
  const root=fixture(t);assert.equal(checkVersion(root,{tag:'v1.0.0-rc.8'}),'1.0.0-rc.8');
  assert.throws(()=>checkVersion(root,{tag:'v1.0.0'}),/Tag/);
  fs.writeFileSync(path.join(root,'installer/toolchain.lock.json'),'{"productVersion":"1.0.0"}');
  assert.throws(()=>checkVersion(root),/Installer/);
  fs.writeFileSync(path.join(root,'installer/toolchain.lock.json'),'{"productVersion":"1.0.0-rc.8"}');
  fs.writeFileSync(path.join(root,'CHANGELOG.md'),'# Changes\n## 1.0.0\n');
  assert.throws(()=>checkVersion(root),/changelog/);
});
test('version setter is a no-write plan until explicitly applied and never creates Git state',t=>{
  const root=fixture(t);
  assert.throws(()=>versionPlan(root,'1.0.0-rc.7'),/higher/);
  assert.throws(()=>versionPlan(root,'1.0.0-rc.9'),/changelog/);
  fs.writeFileSync(path.join(root,'CHANGELOG.md'),'# Changes\n## 1.0.0-rc.9 — synthetic\n');
  fs.mkdirSync(path.join(root,'scripts'));
  fs.copyFileSync(fileURLToPath(new URL('../scripts/version.mjs',import.meta.url)),path.join(root,'scripts/version.mjs'));
  const before=fs.readFileSync(path.join(root,'package.json'),'utf8');
  const planned=spawnSync(process.execPath,['scripts/version.mjs','--set','1.0.0-rc.9'],{cwd:root,encoding:'utf8'});
  assert.equal(planned.status,0,planned.stderr);assert.equal(fs.readFileSync(path.join(root,'package.json'),'utf8'),before);
  const applied=spawnSync(process.execPath,['scripts/version.mjs','--set','1.0.0-rc.9','--write'],{cwd:root,encoding:'utf8'});
  assert.equal(applied.status,0,applied.stderr);assert.equal(checkVersion(root),'1.0.0-rc.9');assert.ok(!fs.existsSync(path.join(root,'.git')));
});
test('render ports exclude Studio and reject invalid environment settings',()=>{
  assert.equal(renderPort({}),42177);assert.equal(renderPort({KRAVEN_RENDER_PORT:'43177'}),43177);
  for(const value of ['3000','0','65536','1.5','abc',''])assert.throws(()=>renderPort({KRAVEN_RENDER_PORT:value}));
});
test('occupied renderer endpoint is refused and the existing server remains running',async t=>{
  const server=net.createServer();
  await new Promise(resolve=>server.listen({host:'127.0.0.1',port:0},resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port;
  await assert.rejects(renderOptions({KRAVEN_RENDER_PORT:String(port)}),/unavailable/);
  assert.ok(server.listening);
});
