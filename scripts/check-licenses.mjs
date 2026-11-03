import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const digest=n=>sha(fs.readFileSync(path.join(root,n)));
const inventoryPath='docs/dependency-licenses.json';
export function installedInventory(base) {
  const store=path.join(base,'node_modules/.pnpm');
  if(!fs.existsSync(store)) throw Error('Installed pnpm dependency graph missing. Install frozen dependencies first.');
  const found=new Map();
  function inspect(dir) {
    const manifest=path.join(dir,'package.json');
    if(!fs.existsSync(manifest)||fs.lstatSync(dir).isSymbolicLink()) return;
    const p=JSON.parse(fs.readFileSync(manifest,'utf8'));
    if(!p.name||!p.version) throw Error('Dependency identity missing');
    const license=typeof p.license==='string'?p.license:(p.license?.type||'Unknown');
    const licenseFiles=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()&&/^(?:licen[cs]e|copying|notice)(?:\..+)?$/i.test(e.name)).map(e=>({name:e.name,sha256:sha(fs.readFileSync(path.join(dir,e.name)))})).sort((a,b)=>a.name.localeCompare(b.name,'en'));
    const entry={name:p.name,version:p.version,license,licenseFiles,packageJsonSha256:sha(fs.readFileSync(manifest))};
    const key=p.name+'@'+p.version;
    if(found.has(key)&&JSON.stringify(found.get(key))!==JSON.stringify(entry)) throw Error('Inconsistent package license evidence: '+key);
    found.set(key,entry);
  }
  for(const e of fs.readdirSync(store,{withFileTypes:true})) {
    if(!e.isDirectory()||e.name==='node_modules') continue;
    const deps=path.join(store,e.name,'node_modules');
    if(!fs.existsSync(deps)) continue;
    for(const d of fs.readdirSync(deps,{withFileTypes:true})) {
      if(!d.isDirectory()||d.isSymbolicLink()) continue;
      const dir=path.join(deps,d.name);
      if(d.name.startsWith('@')) {
        for(const s of fs.readdirSync(dir,{withFileTypes:true})) if(s.isDirectory()&&!s.isSymbolicLink()) inspect(path.join(dir,s.name));
      } else inspect(dir);
    }
  }
  const packages=[...found.values()].sort((a,b)=>(a.name+'@'+a.version).localeCompare(b.name+'@'+b.version,'en'));
  if(packages.length<20) throw Error('Dependency inventory unexpectedly incomplete');
  return packages;
}
const reviewedLicenses=new Set(['0BSD','Apache-2.0','BSD-2-Clause','BSD-3-Clause','CC-BY-4.0','ISC','MIT','MPL-2.0','Python-2.0','Unlicense']);
export function validateMetadata(packages,review) {
  if(!Array.isArray(packages)||!packages.length)throw Error('Empty dependency inventory');
  const seen=new Set();
  for(const p of packages){
    const key=p.name+'@'+p.version;
    if(seen.has(key))throw Error('Duplicate dependency: '+key);seen.add(key);
    if(typeof p.license!=='string'||!p.license.trim()||!/^[a-f0-9]{64}$/.test(p.packageJsonSha256??'')||!Array.isArray(p.licenseFiles)||p.licenseFiles.some(f=>!/^[-.\w]+$/.test(f.name)||!/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('Invalid license metadata: '+key);
    if(reviewedLicenses.has(p.license))continue;
    if(p.license==='UNLICENSED')throw Error('Unreviewed UNLICENSED dependency: '+key);
    const decision=review?.decisions?.find(d=>d.name===p.name&&d.version===p.version&&d.declaredLicense===p.license&&d.packageJsonSha256===p.packageJsonSha256);
    if(!decision||!(p.name==='remotion'||p.name.startsWith('@remotion/'))||p.version!==review.remotion.version||decision.sourceArtifactDecision!=='upstream-download-only'||!decision.sourceReference.startsWith('https://github.com/remotion-dev/remotion/blob/'+review.remotion.commit+'/'))throw Error('Unreviewed license metadata: '+key);
    if(p.license==='SEE LICENSE IN LICENSE.md'&&!p.licenseFiles.some(f=>f.name==='LICENSE.md'&&f.sha256===review.remotion.licenseSha256))throw Error('Vendor license file differs: '+key);
  }
}
function main() {
  const args=process.argv.slice(2);
  if(args.some(a=>!['--refresh','--installed'].includes(a))||new Set(args).size!==args.length) throw Error('Usage: pnpm check:licenses [--installed | --refresh]');
  const p=JSON.parse(read('package.json'));
  if(p.license!=='Apache-2.0'||!read('LICENSE').includes('Version 2.0, January 2004')||!read('NOTICE').includes('Kraven')) throw Error('Project license/notice missing or inconsistent');
  for(const n of ['THIRD_PARTY_NOTICES.md','docs/DEPENDENCY-LICENSES.md']) if(!fs.existsSync(path.join(root,n))) throw Error('Missing '+n);
  const lockSha256=digest('pnpm-lock.yaml');
  const review=JSON.parse(read('docs/license-review.json'));
  if(review.schema!==1||review.artifactScope!=='original-source-only'||review.remotion.version!=='4.0.538'||review.remotion.commit!=='5217b0c90623f2decb4575714fac89d3c4b69896'||review.remotion.licenseGitBlobSha1!=='d655e2df830bbe19285e55607aefff636ed93d7b'||review.remotion.licenseSha256!=='bd65083b940f61904f6ef298aade918a7cad72a3e35bc406e36fab365844b673')throw Error('Invalid source-only license review');
  if(p.dependencies['@remotion/transitions']||read('pnpm-lock.yaml').includes('@remotion/transitions@'))throw Error('Unused UNLICENSED transitions dependency must remain excluded.');
  if(args.includes('--refresh')) {
    if(process.platform!=='win32'||process.arch!=='x64') throw Error('Refresh this Windows x64 inventory on Windows x64.');
    const packages=installedInventory(root);validateMetadata(packages,review);
    const inventory={schema:2,platform:'win32-x64',lockSha256,method:'installed package.json and top-level license/notice files; no pnpm store-index dependency',packages};
    fs.writeFileSync(path.join(root,inventoryPath),JSON.stringify(inventory,null,2)+'\n');
    const intro=`# Dependency license inventory\n\nWindows x64 installed dependency metadata, refreshed for ${p.version} on 2026-10-30. Generated with \`pnpm check:licenses --refresh\`; sanitized package names, versions, declared licenses and license-file hashes are in [dependency-licenses.json](dependency-licenses.json), bound to the exact pnpm lockfile. Other-platform optional packages are not inventoried. Metadata and hashes are evidence, not legal clearance.\n\n## Exceptions and redistribution boundary\n\nThe unused UNLICENSED transitions dependency was removed. Retained Remotion packages use vendor terms; packages with missing metadata have explicit, manifest-bound source-artifact decisions in [license-review.json](license-review.json). The installed Remotion license matches the upstream Git blob at commit 5217b0c90623f2decb4575714fac89d3c4b69896. Repository-scope attribution for missing package metadata is an inference from that upstream source, not a new vendor grant. These dependencies are downloaded by the installer and excluded from this original-source artifact. See [LICENSE-REVIEW.md](LICENSE-REVIEW.md). See [upstream license at the pinned version](https://github.com/remotion-dev/remotion/blob/v4.0.538/LICENSE.md) and [licensing guidance](https://www.remotion.dev/docs/license). Do not redistribute a bundled Remotion runtime without resolving the applicable rights and notices.\n\nMPL-2.0 packages, other permissive licenses and native/tool notices retain their own obligations. This source repository contains references and lockfile metadata, not dependency binaries. Downloaded tools, model, fonts and browser are separately described in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md); the npm inventory does not audit those archives. No blanket compatibility or ownership finding is claimed.\n\n| Package | Version | Declared license | Top-level license/notice files |\n| --- | --- | --- | --- |\n`;
    fs.writeFileSync(path.join(root,'docs/DEPENDENCY-LICENSES.md'),intro+packages.map(p=>`| ${p.name} | ${p.version} | ${p.license.replaceAll('|','/')} | ${p.licenseFiles.map(f=>f.name).join(', ')||'none found'} |`).join('\n')+'\n');
  }
  const snapshot=JSON.parse(read(inventoryPath));
  if(snapshot.schema!==2||snapshot.platform!=='win32-x64'||snapshot.lockSha256!==lockSha256) throw Error('License inventory is stale; deliberately refresh and review after a lockfile change.');
  validateMetadata(snapshot.packages,review);
  for(const [name,version] of Object.entries({...p.dependencies,...p.devDependencies})) if(!snapshot.packages.some(d=>d.name===name&&d.version===version)) throw Error('Direct dependency missing from inventory: '+name);
  if(args.includes('--installed')||args.includes('--refresh')) {
    if(process.platform!=='win32'||process.arch!=='x64') throw Error('Installed comparison requires Windows x64.');
    if(JSON.stringify(installedInventory(root))!==JSON.stringify(snapshot.packages)) throw Error('Installed dependency license evidence differs from reviewed snapshot');
  }
  console.log(`Source-only license checks passed: ${snapshot.packages.length} Windows packages; no UNLICENSED dependency. Vendor terms and manifest-bound scope decisions remain explicit; bundled-runtime redistribution is excluded.`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{main();}catch(error){console.error(error.message);process.exitCode=1;}
}
