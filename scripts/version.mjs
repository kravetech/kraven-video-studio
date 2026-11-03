import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const core='(?:0|[1-9][0-9]*)';
const identifier='(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const semver=new RegExp(`^(${core})\\.(${core})\\.(${core})(?:-(${identifier}(?:\\.${identifier})*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$`);
export function parseVersion(value) {
  const m=typeof value==='string'&&value.match(semver);
  if(!m||m[0]!==value) throw Error('Expected strict Semantic Versioning, for example 1.0.0-rc.8.');
  return {core:m.slice(1,4).map(BigInt),pre:m[4]?.split('.')??[],build:m[5]??null};
}
export function compareVersion(a,b) {
  const x=parseVersion(a),y=parseVersion(b);
  for(let i=0;i<3;i++)if(x.core[i]!==y.core[i])return x.core[i]>y.core[i]?1:-1;
  if(!x.pre.length||!y.pre.length)return x.pre.length===y.pre.length?0:x.pre.length?-1:1;
  for(let i=0;i<Math.max(x.pre.length,y.pre.length);i++){
    const l=x.pre[i],r=y.pre[i];if(l===r)continue;if(l===undefined)return -1;if(r===undefined)return 1;
    const ln=/^[0-9]+$/.test(l),rn=/^[0-9]+$/.test(r);
    if(ln&&rn)return BigInt(l)>BigInt(r)?1:-1;
    if(ln!==rn)return ln?-1:1;
    return l>r?1:-1;
  }
  return 0;
}
export function checkVersion(base,{tag}={}) {
  const read=n=>fs.readFileSync(path.join(base,n),'utf8');
  const p=JSON.parse(read('package.json'));parseVersion(p.version);
  if(JSON.parse(read('installer/toolchain.lock.json')).productVersion!==p.version)throw Error('Installer product version differs from package.json.');
  for(const n of ['README.md','INSTALL.md','ARCHITECTURE.md']) {
    if(!read(n).includes(`**${p.version}**`))throw Error('Current version missing in '+n);
  }
  const heading=read('CHANGELOG.md').match(/^##\s+(\S+)/m)?.[1];
  if(heading!==p.version)throw Error('Latest changelog entry must match package.json.');
  if(tag&&tag!==`v${p.version}`)throw Error('Tag must match v'+p.version);
  return p.version;
}
export function versionPlan(base,next) {
  parseVersion(next);
  const read=n=>fs.readFileSync(path.join(base,n),'utf8');
  const p=JSON.parse(read('package.json')),current=p.version;
  if(compareVersion(next,current)<=0)throw Error('New version must have higher SemVer precedence. Published versions are immutable.');
  if(!read('CHANGELOG.md').startsWith('#')||read('CHANGELOG.md').match(/^##\s+(\S+)/m)?.[1]!==next)throw Error('Write the new changelog entry before setting its version.');
  const outputs={};p.version=next;outputs['package.json']=JSON.stringify(p,null,2)+'\n';
  const lock=JSON.parse(read('installer/toolchain.lock.json'));if(lock.productVersion!==current)throw Error('Resolve installer version drift first.');
  lock.productVersion=next;outputs['installer/toolchain.lock.json']=JSON.stringify(lock,null,2)+'\n';
  for(const n of ['README.md','INSTALL.md','ARCHITECTURE.md']){
    const body=read(n),needle=`**${current}**`;if(!body.includes(needle))throw Error('Resolve current-version documentation drift in '+n);
    outputs[n]=body.replace(needle,`**${next}**`);
  }
  return {current,next,outputs};
}
function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--check') {
    const tag=process.env.GITHUB_REF_TYPE==='tag'?process.env.GITHUB_REF_NAME:undefined;
    console.log(`Version checks passed: ${checkVersion(root,{tag})}; no tag or publication created.`);return;
  }
  if(args[0]!=='--set'||![2,3].includes(args.length)||(args[2]&&args[2]!=='--write'))throw Error('Usage: pnpm version:check | pnpm version:set <next-version> [--write]');
  const plan=versionPlan(root,args[1]);
  console.log(`Version plan: ${plan.current} -> ${plan.next}; ${Object.keys(plan.outputs).join(', ')}`);
  if(!args.includes('--write')) {console.log('Plan only. Add --write to update local metadata; Git is never changed.');return;}
  for(const [n,body] of Object.entries(plan.outputs))fs.writeFileSync(path.join(root,n),body);
  checkVersion(root);console.log('Version metadata updated locally. Review the diff; no Git tag, commit, push or publication created.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(error){console.error(error.message);process.exitCode=1;}
