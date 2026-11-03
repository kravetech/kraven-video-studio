// Every supported test entry starts here before loading test/Remotion modules.
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {storageSettings,launchRenderJob,renderWorkspace} from '../scripts/lib/render-workspace.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),mode=args.shift()||'unit';
if(!process.env.KVS_RENDER_JOB) {
  const settings=storageSettings(project);
  // A sibling, not the live cache: test runs cannot prune or pollute live jobs.
  process.env.KVS_RENDER_CACHE_ROOT=settings.root+'-tests';
  storageSettings(project); // Revalidate the sibling against protected media paths.
  process.env.KVS_RENDER_LOG_ROOT=path.join(process.env.KVS_RENDER_CACHE_ROOT,'diagnostics');
}
if(await launchRenderJob(import.meta.url,'tests'))process.exit(process.exitCode??1);
const {jobDir}=renderWorkspace();
const original=process.env.STUDIO_CONFIG||path.join(project,'studio.local.json');
let config={};try{config=JSON.parse(readFileSync(original,'utf8').replace(/^\uFEFF/,''));}catch(error){if(error.code!=='ENOENT')throw error;}
config.storage={...config.storage,renderCacheRoot:path.join(jobDir,'cache')};
config.workspace={raw:path.join(jobDir,'raw'),edited:path.join(jobDir,'edited'),upload:path.join(jobDir,'upload')};
for(const dir of Object.values(config.workspace))mkdirSync(dir);
const configPath=path.join(jobDir,'studio.test.json');writeFileSync(configPath,JSON.stringify(config));
const env={...process.env,STUDIO_CONFIG:configPath,KVS_TEST_RUN_DIR:jobDir,KVS_RENDER_CACHE_ROOT:config.storage.renderCacheRoot,KVS_RENDER_LOG_ROOT:path.join(jobDir,'logs'),KRAVEN_PROTECTED_ROOTS:config.workspace.raw};
delete env.KVS_RENDER_JOB;delete env.KVS_RENDER_JOB_TOKEN;delete env.NODE_TEST_CONTEXT;
let executable=process.execPath,command;
if(mode==='unit')command=['--test',...readdirSync(path.join(project,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f),...args];
else {
  const entry=mode==='--entry'?args.shift():({media:'tests/media-smoke.mjs',studio:'tests/native-studio-smoke.mjs',storage:'tests/storage.test.mjs',installer:'tests/installer.tests.ps1','storage-installer':'tests/storage.tests.ps1'})[mode];
  if(!entry)throw Error('Unknown test suite.');
  const target=path.resolve(project,entry),relative=path.relative(path.join(project,'tests'),target);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Test entry must be inside tests.');
  if(target.endsWith('.ps1')){executable='powershell.exe';command=['-NoProfile','-ExecutionPolicy','Bypass','-File',target,...args];}
  else command=[target,...args];
}
console.log(`Isolated test run: ${jobDir}`);
const child=spawn(executable,command,{cwd:project,env,stdio:'inherit',windowsHide:true});
process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
