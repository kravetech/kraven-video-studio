import {renderOptions} from './lib/render-options.mjs';
// Validate the entire batch and all destinations before writing any outputs.
import {launchRenderJob, renderWorkspace} from './lib/render-workspace.mjs';
if (await launchRenderJob(import.meta.url, 'broll')) process.exit(process.exitCode ?? 0);
const workspace = renderWorkspace();
workspace.stageShared();
import { renderMedia, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertBrollDestination, planBrollBatch } from './lib/broll-plan.mjs';

const args = process.argv.slice(2);
if (args.some(arg => arg.startsWith('--') && arg !== '--force')) throw new Error('Unknown B-roll option. Only --force is supported.');
const positional = args.filter(arg => arg !== '--force');
const [cuesPath, outArg] = positional;
if (!cuesPath || positional.length > 2) {
  console.error('Usage: pnpm broll <cues.json> [outDir] [--force]');
  process.exit(2);
}
const force = args.includes('--force');
const cueFile = JSON.parse(readFileSync(cuesPath, "utf8"));
const plan = planBrollBatch(cueFile,{cuesPath,outDir:outArg ?? path.join('out',path.basename(cuesPath,'.json')),force});
const rendererOptions = await renderOptions();
const serveUrl = await workspace.bundle({
  entryPoint: path.resolve("src/index.ts"),
  webpackOverride: (config) => enableTailwind(config),
});
// Select every composition first, including schema/metadata validation.
const jobs = [];
for (const render of plan.renders) jobs.push({...render,composition:await selectComposition({ ...rendererOptions, serveUrl,id:'Broll',inputProps:render.props})});
for (const file of [...jobs.map(job=>job.file),plan.manifest]) assertBrollDestination(file,{sources:[cuesPath],force});
mkdirSync(plan.root,{recursive:true});
const manifest = { source: path.resolve(cuesPath), content_id: cueFile.content_id ?? null, renders: [] };
for (const job of jobs) {
  assertBrollDestination(job.file,{sources:[cuesPath],force});
  await renderMedia({ ...rendererOptions,  serveUrl, composition:job.composition, codec:"h264", inputProps:job.props, outputLocation:job.file });
  manifest.renders.push({
    id: job.id,
    at: job.at,
    file: path.basename(job.file),
    durationSec: job.composition.durationInFrames / job.composition.fps,
    props: job.props,
  });
  console.log(`rendered ${job.id} (${job.props.variant}, ${job.props.ratio})`);
}
assertBrollDestination(plan.manifest,{sources:[cuesPath],force});
writeFileSync(plan.manifest, JSON.stringify(manifest, null, 2)+'\n');
console.log(`Done: ${manifest.renders.length} cutaways in ${plan.root}`);
