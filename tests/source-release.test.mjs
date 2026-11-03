import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {scanSource, sourceDirs, sourceNames} from '../scripts/check-privacy.mjs';
import {validateMetadata} from '../scripts/check-licenses.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-public-check-'));
  // Exact generated directory only; never a caller-supplied path.
  t.after(()=>{
    const parent=path.resolve(os.tmpdir())+path.sep;
    assert.ok(path.resolve(root).startsWith(parent)&&path.basename(root).startsWith('studio-public-check-'));
    assert.ok(!fs.lstatSync(root).isSymbolicLink());
    fs.rmSync(root,{recursive:true,force:true});
  });
  fs.writeFileSync(path.join(root,'README.md'),'Synthetic public source.');
  return root;
}
test('public scan rejects private paths and token-like content without echoing values',t=>{
  const root=fixture(t);
  const secret=['gh','p_', 'a'.repeat(36)].join('');
  fs.writeFileSync(path.join(root,'README.md'),['D:',String.fromCharCode(92),'Private Projects',String.fromCharCode(92),'clip',secret].join(''));
  const result=scanSource(root);
  assert.ok(result.findings.some(f=>f.reason==='personal machine path'));
  assert.ok(result.findings.some(f=>f.reason==='GitHub token'));
  assert.ok(!JSON.stringify(result).includes(secret));
});
const slash=String.fromCharCode(92);
const privatePaths=[
  ['windows drive', ['Q:', 'Client Projects', 'clip'].join(slash)],
  ['windows forward slash', ['q:', 'Client Projects', 'clip'].join('/')],
  ['escaped windows path', ['Q:', 'Client Projects', 'clip'].join(slash.repeat(2))],
  ['network share', slash.repeat(2)+['fileserver', 'client-share', 'clip'].join(slash)],
  ['escaped network share', slash.repeat(4)+['fileserver', 'client-share', 'clip'].join(slash.repeat(2))],
  ['unix home', ['', 'home', 'example-user', 'private', 'clip'].join('/')],
  ['mac home', ['', 'Users', 'example-user', 'private', 'clip'].join('/')],
];
test('public scan rejects generic machine paths without disclosing their contents',t=>{
  const root=fixture(t);
  for(const [label,value] of privatePaths){
    fs.writeFileSync(path.join(root,'README.md'),`Input: ${value}`);
    const result=scanSource(root);
    assert.ok(result.findings.some(f=>f.reason==='personal machine path'),label);
    assert.ok(!JSON.stringify(result).includes(value),label);
  }
});
test('public scan rejects private-context metadata without project-specific names',t=>{
  const root=fixture(t);
  for(const value of ['ai_access: internal','ai_access: restricted','type: ai-memory','type: ai-handoff']){
    fs.writeFileSync(path.join(root,'README.md'),`---\n${value}\n---\nSynthetic context.`);
    assert.ok(scanSource(root).findings.some(f=>f.reason==='private knowledge context'),value);
  }
});
test('public scan retains credential checks and never returns matched values',t=>{
  const root=fixture(t);
  const cases=[
    ['private key',['-----BEGIN ','PRIVATE KEY-----'].join('')],
    ['GitHub token',['github','_pat_','a'.repeat(55)].join('')],
    ['service token',['sk','-ant-','a'.repeat(36)].join('')],
    ['service token',['sk','-proj-','a'.repeat(36)].join('')],
    ['service token',['AK','IA','A'.repeat(16)].join('')],
    ['credential assignment',`api_key = "${'a'.repeat(32)}"`],
  ];
  for(const [reason,value] of cases){
    fs.writeFileSync(path.join(root,'README.md'),value);
    const result=scanSource(root);
    assert.ok(result.findings.some(f=>f.reason===reason),reason);
    assert.ok(!JSON.stringify(result).includes(value),reason);
  }
});
test('public scan allows portable paths, public URLs and copyright/contact attribution',t=>{
  const root=fixture(t);
  fs.writeFileSync(path.join(root,'README.md'),[
    './models/model.bin', 'docs/WORKFLOW.md', 'https://example.invalid/docs',
    'https://example.invalid/home/example-user/docs',
    'const loudness = /I:\\s+(-?[\\d.]+) LUFS/g;',
    slash.repeat(2)+['.','pipe','synthetic'].join(slash),
    'Copyright 2026 Example Author', 'security@example.invalid',
    '---\nai_access: public\ntype: documentation\n---',
  ].join('\n'));
  assert.deepEqual(scanSource(root).findings,[]);
});
test('source packager accepts portable public source and blocks private paths/context',{
  skip:process.platform!=='win32',
},t=>{
  const root=fixture(t),source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  for(const dir of sourceDirs) fs.mkdirSync(path.join(root,dir),{recursive:true});
  for(const name of sourceNames) if(!fs.existsSync(path.join(root,name))) fs.writeFileSync(path.join(root,name),'Synthetic public source.');
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'0.0.0'}));
  for(const name of ['check-privacy.mjs','package-source.ps1']) fs.copyFileSync(path.join(source,'scripts',name),path.join(root,'scripts',name));
  const archive=path.join(root,'out','source.zip');
  const run=()=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts','package-source.ps1'),'-OutputPath',archive],{encoding:'utf8',timeout:30000});
  const original=fs.readFileSync(path.join(root,'README.md'),'utf8');
  const cases=[privatePaths[0][1],privatePaths[3][1],privatePaths[5][1],'---\nai_access: restricted\n---'];
  for(const independent of [false,true]){
    // Simulate content changing after the Node preflight: the packager must
    // independently refuse private content before opening an archive.
    if(independent) fs.writeFileSync(path.join(root,'scripts','check-privacy.mjs'),'process.exitCode=0;');
    for(const value of cases){
      fs.writeFileSync(path.join(root,'README.md'),value);
      const result=run();
      assert.equal(result.error,undefined);
      assert.notEqual(result.status,0);
      assert.ok(!fs.existsSync(archive));
      assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
    }
  }
  fs.copyFileSync(path.join(source,'scripts','check-privacy.mjs'),path.join(root,'scripts','check-privacy.mjs'));
  fs.writeFileSync(path.join(root,'README.md'),original);
  const result=run();
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr);
  assert.ok(fs.existsSync(archive));
  assert.ok(fs.existsSync(archive+'.sha256'));
});
test('public scan rejects media and unrecognized source but excludes local runtime',t=>{
  const root=fixture(t);
  fs.mkdirSync(path.join(root,'examples')); fs.writeFileSync(path.join(root,'examples','private.mp4'),'synthetic');
  fs.writeFileSync(path.join(root,'unexpected.txt'),'synthetic');
  fs.mkdirSync(path.join(root,'workspace')); fs.writeFileSync(path.join(root,'workspace','private.txt'),'local');
  const result=scanSource(root);
  assert.deepEqual(result.findings.map(f=>f.file).sort(),['examples/private.mp4','unexpected.txt']);
});
test('public scan refuses source directory links without reading targets',t=>{
  const root=fixture(t),outside=fixture(t);
  fs.symlinkSync(outside,path.join(root,'src'),process.platform==='win32'?'junction':'dir');
  const result=scanSource(root);
  assert.ok(result.findings.some(f=>f.file==='src'&&f.reason==='source link'));
});
test('public scan catches ignored files that were force-tracked in Git',t=>{
  const root=fixture(t);
  execFileSync('git',['init','--quiet',root]);
  fs.writeFileSync(path.join(root,'.gitignore'),'studio.local.json\n');
  fs.writeFileSync(path.join(root,'studio.local.json'),'{}');
  execFileSync('git',['-C',root,'add','--force','studio.local.json']);
  const result=scanSource(root);
  assert.ok(result.findings.some(f=>f.file==='studio.local.json'));
});
test('license metadata fails closed for new unknowns, missing licenses and duplicates',()=>{
  const entry={name:'synthetic-package',version:'1.0.0',license:'MIT',licenseFiles:[],packageJsonSha256:'0'.repeat(64)};
  validateMetadata([entry]);
  assert.throws(()=>validateMetadata([{...entry,license:'Unknown'}]),/Unreviewed/);
  assert.throws(()=>validateMetadata([{...entry,license:''}]),/Invalid/);
  assert.throws(()=>validateMetadata([{...entry,license:'SEE LICENSE IN LICENSE.md'}]),/Unreviewed/);
  assert.throws(()=>validateMetadata([{...entry,license:'GPL-3.0-only'}]),/Unreviewed/);
  assert.throws(()=>validateMetadata([entry,entry]),/Duplicate/);
  assert.throws(()=>validateMetadata([{...entry,name:'@remotion/transitions',version:'4.0.538',license:'UNLICENSED'}]),/Unreviewed/);
  assert.throws(()=>validateMetadata([{...entry,name:'@remotion/transitions',version:'5.0.0',license:'UNLICENSED'}]),/Unreviewed/);
  const vendor={...entry,name:'@remotion/media',version:'4.0.538',license:'Unknown'};
  const review={remotion:{version:'4.0.538',commit:'fixture'},decisions:[{name:vendor.name,version:vendor.version,declaredLicense:vendor.license,packageJsonSha256:vendor.packageJsonSha256,sourceArtifactDecision:'upstream-download-only',sourceReference:'https://github.com/remotion-dev/remotion/blob/fixture/packages/media/package.json'}]};
  validateMetadata([vendor],review);
  assert.throws(()=>validateMetadata([{...vendor,packageJsonSha256:'1'.repeat(64)}],review),/Unreviewed/);
  assert.throws(()=>validateMetadata([{...vendor,version:'4.0.539'}],review),/Unreviewed/);
  const foreign={...vendor,name:'unrelated-package'};
  assert.throws(()=>validateMetadata([foreign],{...review,decisions:[{...review.decisions[0],name:foreign.name}]}),/Unreviewed/);
});
