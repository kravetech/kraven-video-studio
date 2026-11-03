import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const config=JSON.parse(readFileSync(process.env.STUDIO_CONFIG,'utf8').replace(/^\uFEFF/,''));
const tools=config.tools;
const checks=[['Node',tools.node,['--version']],['pnpm',tools.node,[tools.pnpm,'--version']],['FFmpeg',tools.ffmpeg,['-version']],['FFprobe',path.join(path.dirname(tools.ffmpeg),'ffprobe.exe'),['-version']],['Claude Code',tools.claude,['--version']],['Whisper',tools.whisper,['--help']]];
if(tools.python)checks.push(['Python',tools.python,['--version']]);
if(tools.autoEditor)checks.push(['auto-editor',tools.autoEditor,['--version']]);
for(const [name,file,args] of checks){
 const result=spawnSync(file,args,{encoding:'utf8',maxBuffer:8*1024*1024});
 if(result.error||result.status!==0)throw new Error(`${name} is not runnable: ${result.error?.message??result.stderr.slice(-1500)}`);
 const version=name==='Whisper'?'executable responding':(result.stdout||result.stderr).trim().split(/\r?\n/)[0];
 console.log(`  OK ${name}: ${version}`);
}
