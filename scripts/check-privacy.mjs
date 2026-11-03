import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

export const sourceDirs = new Set(['src','scripts','examples','presets','installer','tests','docs','.claude','.github']);
export const sourceNames = new Set(['INSTALL.md','README.md','AGENTS.md','CLAUDE.md','ARCHITECTURE.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','SECURITY.md','.gitattributes','.gitignore','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','remotion.config.ts','Install.ps1','Install.cmd','Start-Video-Studio.ps1','Start-Video-Studio.cmd','LICENSE','NOTICE','SOURCE-MANIFEST.json']);
const localDirs = new Set(['node_modules','.studio','workspace','public','out','.git']);
const forbidden = /(^|\/)(node_modules|\.studio|workspace|public|out|\.git)(\/|$)|^docs\/reports\/|^\.claude\/settings(?:\.local)?\.json$|(^|\/)\.env(?:\.|$)|(^|\/)studio\.local\.json$|\.(mp4|mov|mkv|webm|wav|mp3|m4a|srt|bin|gguf|exe|dll|zip|7z|pem|key|pfx|p12|log|sqlite|db)$/i;
const patterns = [
  ['personal machine path', /(?:^|[\s"'`(=])(?:[a-z]:[\\/]|\/(?:Users|home)\/[^/\s]+\/|\\{2,}[a-z0-9_][a-z0-9_.-]*[\\/]+[a-z0-9_$ .-]+[\\/])/im],
  ['private knowledge context', /(?:^|\n)\s*(?:ai_access\s*:\s*(?:internal|restricted)|type\s*:\s*ai-(?:memory|handoff))\s*(?:\r?\n|$)/i],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['GitHub token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['service token', /\b(?:sk-ant-[A-Za-z0-9_-]{30,}|sk-proj-[A-Za-z0-9_-]{30,}|AKIA[0-9A-Z]{16})\b/],
  ['credential assignment', /\b(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_+\/-]{20,}["']/i],
];

export function scanSource(root) {
  root = path.resolve(root);
  if(fs.lstatSync(root).isSymbolicLink()) throw Error('Source root must not be a link.');
  const findings=[]; let files=[];
  const git=path.join(root,'.git');
  if(fs.existsSync(git)) {
    if(!fs.lstatSync(git).isDirectory()||fs.lstatSync(git).isSymbolicLink()) throw Error('Use a standalone source checkout for public review.');
    const result=execFileSync('git',['-C',root,'ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'});
    files=[...new Set(result.split('\0').filter(Boolean))];
  } else {
    function walk(dir) {
      for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
        const full=path.join(dir,e.name),rel=path.relative(root,full).replaceAll('\\','/');
        if(dir===root&&(localDirs.has(e.name)||e.name==='studio.local.json'||e.name.startsWith('.env'))) continue;
        if(rel==='docs/reports'||/^\.claude\/settings(?:\.local)?\.json$/.test(rel)) continue;
        if(e.isSymbolicLink()) {findings.push({file:rel,reason:'source link'});continue;}
        if(e.isDirectory()) walk(full); else files.push(rel);
      }
    }
    walk(root);
  }
  for(const rel of files) {
    if(rel.includes('..')||path.isAbsolute(rel)||forbidden.test(rel)||(!sourceDirs.has(rel.split('/')[0])&&!sourceNames.has(rel))) {
      findings.push({file:rel,reason:'non-public source path'}); continue;
    }
    let link=false,current=root;
    for(const part of rel.split('/')) {
      current=path.join(current,part);
      if(!fs.existsSync(current)) { findings.push({file:rel,reason:'missing tracked source'});link=true;break; }
      if(fs.lstatSync(current).isSymbolicLink()) { findings.push({file:rel,reason:'source link'});link=true;break; }
    }
    if(link) continue;
    const full=path.join(root,rel),size=fs.statSync(full).size;
    if(size>2*1024*1024) { findings.push({file:rel,reason:'unexpected large source'});continue; }
    const bytes=fs.readFileSync(full);
    if(bytes.includes(0)) {findings.push({file:rel,reason:'binary source'});continue;}
    const body=bytes.toString('utf8');
    for(const [reason,regex] of patterns) if(regex.test(body)) findings.push({file:rel,reason});
  }
  return {files:files.length,findings,scope:fs.existsSync(git)?'tracked and unignored files':'source files; local runtime paths excluded'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length>2) throw Error('Usage: node scripts/check-privacy.mjs (no arguments)');
    const result=scanSource(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
    // Never echo matched credential values or file contents.
    for(const f of result.findings) console.error(`${f.file}: ${f.reason}`);
    if(result.findings.length) process.exitCode=1;
    else console.log(`Privacy checks passed: ${result.files} ${result.scope}. No history or external-media scan performed.`);
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
