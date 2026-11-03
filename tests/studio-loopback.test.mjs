import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const LOOPBACK='127.0.0.1';
const guard=path.resolve('scripts/lib/studio-loopback.cjs');
const probe=path.resolve('tests/studio-loopback-probe.cjs');
const pipe=process.platform==='win32'?`\\\\.\\pipe\\kraven-${randomUUID()}`:path.join(os.tmpdir(),`kraven-${randomUUID()}.sock`);
const quoted=JSON.stringify;

const listenWith=(preloads,expressions)=>{
  const result=spawnSync(process.execPath,[...preloads.flatMap(file=>['--require',file]),'-e',`require(${quoted(probe)}).run(${quoted(expressions)})`],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
};
const guarded=expressions=>listenWith([probe,guard],expressions);
const unguarded=expressions=>listenWith([probe],expressions);
const assertBoundToLoopback=expressions=>{
  for(const outcome of guarded(expressions)) {
    assert.equal(outcome.error,undefined,outcome.expression);
    assert.equal(outcome.bind.address,LOOPBACK,outcome.expression);
    assert.equal(outcome.address.address,LOOPBACK,outcome.expression);
    assert.ok(outcome.address.port>0,outcome.expression);
  }
};

test('mixed and nested listen options that Node treats as TCP stay on loopback',()=>{
  assertBoundToLoopback([
    "server.listen({port:0,path:null})",
    "server.listen({port:0,path:''})",
    "server.listen({port:0,path:'ignored.sock'})",
    "server.listen({port:0,fd:null})",
    "server.listen({port:0,fd:-1})",
    "server.listen({port:0,path:null,host:'0.0.0.0'})",
    "server.listen({handle:{port:0}})",
    "server.listen({_handle:{port:0}})",
    "server.listen({_handle:null,handle:{port:0}})",
    "server.listen({host:'127.0.0.1',handle:{port:0}})",
    "server.listen({handle:{port:0,path:'ignored.sock',fd:null}})",
    "server.listen({handle:Object.assign(()=>{},{port:0})})",
    "server.listen({port:undefined,path:'ignored.sock'})",
    "server.listen({port:null,path:'ignored.sock'})",
    "server.listen({port:0,_handle:undefined,handle:undefined})",
  ]);
});

test('every port overload stays on loopback',()=>{
  assertBoundToLoopback([
    'server.listen()','server.listen(null)','server.listen(undefined)','server.listen(cb)','server.listen(null,cb)','server.listen(undefined,cb)',
    "server.listen(0)","server.listen('0')","server.listen(' 0 ')","server.listen('0x0')",'server.listen(0,cb)',"server.listen('0',cb)",
    'server.listen(0,511)','server.listen(0,511,cb)',"server.listen('0',511,cb)",'server.listen({port:0})','server.listen({port:0},cb)',"server.listen({port:'0'})",
  ]);
});

test('missing, wildcard and explicit nonlocal hosts move to loopback',()=>{
  const hosts=["''","'::'","'0.0.0.0'","'192.168.1.5'","'10.0.0.1'","'::ffff:0.0.0.0'","'fe80::1'"];
  assertBoundToLoopback(hosts.flatMap(host=>[`server.listen(0,${host})`,`server.listen('0',${host},cb)`,`server.listen(null,${host})`,`server.listen({port:0,host:${host}})`,`server.listen({port:0,path:null,host:${host}})`,`server.listen({handle:{port:0,host:${host}}})`]));
});

test('existing loopback hosts are kept',()=>{
  for(const [host,expected] of [['127.0.0.1','127.0.0.1'],['127.0.0.2','127.0.0.2'],['::1','::1']]) {
    for(const expression of [`server.listen(0,'${host}')`,`server.listen({port:0,host:'${host}'})`,`server.listen({port:0,path:null,host:'${host}'})`]) {
      const [outcome]=guarded([expression]);
      assert.equal(outcome.error,undefined,expression);
      assert.equal(outcome.address.address,expected,expression);
    }
  }
  const [named]=guarded(["server.listen(0,'localhost')"]);
  assert.ok(['127.0.0.1','::1'].includes(named.address.address));
});

test('pipes stay pipes, including with ignored fields',()=>{
  for(const expression of [`server.listen(${quoted(pipe)})`,`server.listen(${quoted(pipe)},cb)`,`server.listen({path:${quoted(pipe)}})`,`server.listen({path:${quoted(pipe)},host:'0.0.0.0'})`,`server.listen({handle:{path:${quoted(pipe)}}})`]) {
    const [outcome]=guarded([expression]);
    assert.equal(outcome.error,undefined,expression);
    assert.equal(outcome.address,pipe,expression);
    assert.equal(outcome.bind.port,-1,expression);
  }
});

test('existing handles are adopted, not rebound',()=>{
  for(const expression of ['server.listen(base)','server.listen(base._handle)','server.listen({_handle:base._handle})','server.listen({handle:base._handle})','server.listen({port:0,host:"0.0.0.0",handle:base._handle})']) {
    const [outcome]=guarded([expression]);
    assert.equal(outcome.error,undefined,expression);
    assert.equal(outcome.bind.adopted,true,expression);
    assert.equal(outcome.address.address,LOOPBACK,expression);
    assert.equal(outcome.address.port,outcome.basePort,expression);
  }
});

test('descriptors reach Node unchanged, even with an ignored port',()=>{
  const expressions=['server.listen({fd:999999})','server.listen({port:0,fd:999999})','server.listen({port:0,host:"0.0.0.0",fd:999999})','server.listen({handle:{fd:999999}})'];
  const results=guarded(expressions);
  assert.deepEqual(results.map(outcome=>outcome.error),unguarded(expressions).map(outcome=>outcome.error));
  for(const outcome of results) {
    assert.equal(outcome.bind.fd,999999,outcome.expression);
    assert.equal(outcome.bind.address,null,outcome.expression);
  }
});

test('forms Node rejects are rejected identically',()=>{
  const expressions=[
    'server.listen({})','server.listen({host:"0.0.0.0"})',"server.listen({path:''})",'server.listen({path:null})',
    'server.listen(true)','server.listen({port:true})','server.listen(-1)','server.listen(65536)',"server.listen('')",'server.listen({port:-1})','server.listen({port:65536})',"server.listen({port:''})",
    'server.listen({handle:5})',"server.listen({handle:'x'})",'server.listen({handle:{}})','server.listen({handle:{handle:{port:0}}})','server.listen({port:0,handle:{}})',
    "server.listen(0,'127.0.0.1');server.listen(0)",
  ];
  const native=unguarded(expressions);
  assert.deepEqual(guarded(expressions).map(({expression,error})=>({expression,error})),native.map(({expression,error})=>({expression,error})));
  assert.ok(native.slice(0,-1).every(outcome=>outcome.error&&!outcome.bind&&outcome.error!=='PROBE_NONLOCAL'));
});

test('callbacks and backlog survive the move to loopback',()=>{
  const cases=[
    ["server.listen(0,'0.0.0.0',7,cb)",7,1],['server.listen(0,7,cb)',7,1],['server.listen(null,7,cb)',7,1],['server.listen(undefined,7,cb)',7,1],
    ['server.listen(cb,7)',7,0],['server.listen(0,cb,7)',7,0],["server.listen(null,'::',7,cb)",7,1],
    ['server.listen({port:0,backlog:7},cb)',7,1],['server.listen({port:0},7,cb)',7,1],['server.listen({port:0,path:null,backlog:7},cb)',7,1],
    ['server.listen({handle:{port:0,backlog:7}},cb)',7,1],['server.listen({handle:{port:0}},7,cb)',7,1],['server.listen(0,cb)',undefined,1],
  ];
  for(const [expression,backlog,callbacks] of cases) {
    const [outcome]=guarded([expression]);
    assert.equal(outcome.error,undefined,expression);
    assert.equal(outcome.address.address,LOOPBACK,expression);
    assert.equal(outcome.callbacks,callbacks,expression);
    if(backlog) assert.equal(outcome.bind.backlog,backlog,expression);
  }
});

test('listen options that affect a wildcard bind stay valid on loopback',()=>{
  assertBoundToLoopback(["server.listen({port:0,host:'::',ipv6Only:true})",'server.listen({port:0,ipv6Only:true})','server.listen({port:0,exclusive:true})',"server.listen({port:0,path:null,exclusive:true,host:'0.0.0.0'})"]);
  const script=`const net=require('node:net');const abort=new AbortController();const server=net.createServer();
  server.once('close',()=>console.log('closed'));server.listen({port:0,signal:abort.signal},()=>{console.log(server.address().address);abort.abort();});`;
  const result=spawnSync(process.execPath,['--require',probe,'--require',guard,'-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/),[LOOPBACK,'closed']);
});

test('the guard refuses to load if Node no longer has a step it wraps',()=>{
  for(const removal of ['delete net.Server.prototype._listen2','delete net._createServerHandle']) {
    const script=`const net=require('node:net');${removal};require(${quoted(guard)});`;
    const result=spawnSync(process.execPath,['-e',script],{encoding:'utf8'});
    assert.notEqual(result.status,0,removal);
    assert.match(result.stderr,/does not support this Node\.js version/);
  }
});

const studioStub=String.raw`
const fs=require('node:fs');const http=require('node:http');const net=require('node:net');const cluster=require('node:cluster');
const {fork}=require('node:child_process');const {Worker,isMainThread,parentPort}=require('node:worker_threads');
const forms=[s=>s.listen(null),s=>s.listen({port:0,path:null,host:'0.0.0.0'}),s=>s.listen({handle:{port:0}})];
const bind=async()=>{const addresses=[];for(const form of forms){const s=net.createServer();addresses.push(await new Promise(resolve=>{s.once('error',e=>resolve(e.code));s.once('listening',()=>resolve(s.address().address));form(s);}));s.close();}return {addresses,headerSize:http.maxHeaderSize,options:process.env.NODE_OPTIONS};};
if(!isMainThread) bind().then(result=>parentPort.postMessage(result));
else if(process.argv[2]==='forked'||cluster.isWorker) bind().then(result=>process.send(result,()=>process.exit(0)));
else (async()=>{
  const from=start=>new Promise((resolve,reject)=>{const child=start();child.once('message',resolve);child.once('error',reject);});
  const results={argv:process.argv.slice(2),main:await bind()};
  results.worker=await from(()=>new Worker(__filename));
  results.forked=await from(()=>fork(__filename,['forked']));
  results.cluster=await from(()=>cluster.fork());
  fs.writeFileSync('result.json',JSON.stringify(results));
  process.exit(0);
})();
`;

test('the launcher delivers the guard through a spaced path to workers, forks and cluster workers',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'Kraven Studio '));
  try {
    for(const file of ['scripts/start-studio.mjs','scripts/lib/render-workspace.mjs','scripts/lib/atomic-file.mjs','scripts/lib/render-guard.ps1','scripts/lib/RenderGuard.cs','scripts/lib/studio-loopback.cjs','src/product.ts','tests/studio-loopback-probe.cjs']) fs.cpSync(file,path.join(root,file));
    const cli=path.join(root,'node_modules/@remotion/cli/remotion-cli.js');
    fs.mkdirSync(path.dirname(cli),{recursive:true});
    fs.writeFileSync(cli,studioStub);
    const existing=`--max-http-header-size=12345 --require "${path.join(root,'tests/studio-loopback-probe.cjs').replaceAll('\\','/')}"`;
    const launched=spawnSync(process.execPath,[path.join(root,'scripts/start-studio.mjs'),'--','--port','3000'],{cwd:root,encoding:'utf8',env:{...process.env,NODE_OPTIONS:existing}});
    assert.equal(launched.status,0,launched.stderr);
    const results=JSON.parse(fs.readFileSync(path.join(root,'result.json'),'utf8'));
    assert.deepEqual(results.argv,['studio','--port','3000']);
    const preload=`--require "${path.join(root,'scripts/lib/studio-loopback.cjs').replaceAll('\\','/')}"`;
    for(const [where,result] of Object.entries(results).filter(([name])=>name!=='argv')) {
      assert.deepEqual(result.addresses,[LOOPBACK,LOOPBACK,LOOPBACK],where);
      assert.equal(result.headerSize,12345,where);
      assert.equal(result.options,`${existing} ${preload}`,where);
    }
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
