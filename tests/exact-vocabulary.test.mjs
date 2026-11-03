import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
function verify(t,planned,heard,options={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exact-vocabulary-'));
 t.after(()=>{assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});});
 const edit=path.join(dir,'edit.json'),captions=path.join(dir,'captions.json');
 fs.writeFileSync(edit,JSON.stringify({segments:[{label:'fixture',words:planned}],verify:options}));
 fs.writeFileSync(captions,JSON.stringify({captions:heard.split(' ').map(text=>({text}))}));
 return spawnSync(process.execPath,['scripts/verify-cut.mjs',edit,captions],{encoding:'utf8'});
}
test('configured exact vocabulary rejects fuzzy substitutions and accepts exact spelling',t=>{
 assert.equal(verify(t,'widget','widge').status,0);
 assert.notEqual(verify(t,'widget','widge',{exactWords:['WIDGET']}).status,0);
 assert.equal(verify(t,'widget','widget',{exactWords:['WIDGET']}).status,0);
});
test('explicit reviewed variants remain supported for configured exact words',t=>{
 assert.equal(verify(t,'widget','widge',{exactWords:['widget'],variants:{widget:'widge'}}).status,0);
 assert.notEqual(verify(t,'not','note').status,0);
 assert.notEqual(verify(t,'claude','claud').status,0);
});
test('malformed exact vocabulary fails with a clear error',t=>{
 for(const exactWords of ['widget',[null],[''],['two words']]) {
  const result=verify(t,'widget','widget',{exactWords});
  assert.notEqual(result.status,0);assert.match(result.stderr,/verify.exactWords must be/);
 }
});
