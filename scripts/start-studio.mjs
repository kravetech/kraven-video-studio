import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {PRODUCT} from '../src/product.ts';

import {launchRenderJob} from './lib/render-workspace.mjs';
if (await launchRenderJob(import.meta.url, 'studio')) process.exit(process.exitCode ?? 0);

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);if(args[0]==='--')args.shift();
// NODE_OPTIONS reaches Studio's workers and child processes; quoted forward slashes survive spaces on Windows.
const loopback=path.join(root,'scripts/lib/studio-loopback.cjs').replaceAll('\\','/');
const env={...process.env,NODE_OPTIONS:[process.env.NODE_OPTIONS,`--require "${loopback}"`].filter(Boolean).join(' ')};
console.log(`${PRODUCT.name}\n${PRODUCT.tagline}\n`);
console.log('Studio is available on this computer only. Any Network address printed below is not reachable.\n');
const child=spawn(process.execPath,[path.join(root,'node_modules/@remotion/cli/remotion-cli.js'),'studio',...args],{cwd:root,env,stdio:'inherit'});
child.once('error',error=>{console.error(`Studio could not start: ${error.message}`);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.once('exit',code=>{process.exitCode=code??1;});
