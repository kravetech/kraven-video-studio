// Cut-risk QC, including first/last edges. A risk or incomplete analysis needs
// correction/listening review; no energy test certifies phoneme integrity.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {analyzeCuts} from './lib/cut-qc.mjs';
import {ensureSafeOutput} from './lib/guard.mjs';

try {
  const args=process.argv.slice(2),positional=[],options={};let force=false;
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--force'){if(force)throw new Error('Duplicate --force.');force=true;continue;}
    if(['--margin','--out','--review'].includes(arg)) {
      if(Object.hasOwn(options,arg)||!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing/duplicate value for ${arg}.`);
      options[arg]=args[++i];continue;
    }
    if(arg.startsWith('--'))throw new Error(`Unknown cut-QC option: ${arg}`);
    positional.push(arg);
  }
  const [cutsPath,captionsPath]=positional;
  if(!cutsPath||positional.length>2)throw new Error('Usage: pnpm check:cuts <cuts.json> [captions.json] [--margin 8] [--out report.json] [--review listening.json] [--force]');
  const words=captionsPath?JSON.parse(readFileSync(captionsPath,'utf8')).captions:[];
  if(!Array.isArray(words)||words.some(word=>typeof word.text!=='string'||!Number.isFinite(word.startMs)||!Number.isFinite(word.endMs)))throw new Error('Invalid captions supplied for cut context.');
  const result=analyzeCuts(cutsPath,{...(options['--margin']!==undefined?{marginDb:Number(options['--margin'])}:{}),reviewPath:options['--review']});
  const output=options['--out']??(/\.cuts\.json$/i.test(cutsPath)?cutsPath.replace(/\.cuts\.json$/i,'.cut-qc.json'):`${cutsPath}.cut-qc.json`);
  ensureSafeOutput(output,{sources:[cutsPath,result.source.path,captionsPath,options['--review']].filter(Boolean),force});
  mkdirSync(path.dirname(path.resolve(output)),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(`${result.status==='pass'?'PASS':'NEEDS REVIEW'}: ${result.coverage.analyzed}/${result.coverage.totalEdges} edges acoustically analyzed; ${result.coverage.sourceBoundaries} source boundaries; ${result.coverage.contiguous} contiguous edges; ${result.coverage.inconclusive} inconclusive. Energy QC is not phoneme certification.`);
  for(const edge of result.edges.filter(edge=>['risk','inconclusive'].includes(edge.status))) {
    const near=words.filter(word=>word.endMs>=edge.masterSec*1000-700&&word.startMs<=edge.masterSec*1000+700).map(word=>word.text.trim()).join(' ');
    console.log(`${edge.id}: master ${edge.masterSec.toFixed(3)}s, source ${edge.sourceSec.toFixed(3)}s — ${edge.reason}${edge.listeningReview?' [listening decision recorded]':''}${near?` (${near})`:''}`);
  }
  console.log(`Cut QC record: ${output}`);process.exitCode=result.status==='pass'?0:1;
} catch(error) {console.error(`Cut QC failed: ${error.message}`);process.exitCode=2;}
