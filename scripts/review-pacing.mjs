import fs from 'node:fs';
import {snapshotFile} from './lib/render-record.mjs';
import {EDITORIAL_VERSION,parseArgs,numberOption,validateWords,pacingCandidates,probeDuration,checkedProcess,assertCurrent,writeEvidence,checkEditorial,decisionReport} from './lib/editorial-review.mjs';

try {
  const {options:o,positional:p}=parseArgs(process.argv.slice(2),['--check','--force','--out','--edit','--report','--min-gap-ms','--motion-threshold']);
  if(o['--check']) {
    if(p.length!==2)throw new Error('Usage: pnpm pacing:review --check <review.json> <decisions.json> [--report file.md]');
    const result=checkEditorial(...p,{kind:'pacing'});
    if(o['--report'])writeEvidence(o['--report'],decisionReport(...p),{sources:[...p,...Object.values(result.inputs).map(x=>x.path)],force:!!o['--force'],text:true});
    console.log(`${result.status.toUpperCase()}: ${result.candidates} candidates; ${result.unresolved.length} unresolved. Final validation requires resolved cases.`);
  } else {
    if(p.length!==2||!o['--out'])throw new Error('Usage: pnpm pacing:review <rendered-video.mp4> <captions.json> --out <review.json> [--edit <edit.json>]');
    const minGapMs=numberOption(o['--min-gap-ms']??500,'min-gap-ms',100,30000),motionThreshold=numberOption(o['--motion-threshold']??20,'motion-threshold',1,255);
    const inputs={video:snapshotFile(p[0]),captions:snapshotFile(p[1]),...(o['--edit']?{edit:snapshotFile(o['--edit'])}:{})};
    const duration=probeDuration(p[0]),file=JSON.parse(fs.readFileSync(p[1],'utf8').replace(/^\uFEFF/,''));
    const words=validateWords(file.captions?.map(w=>({text:w.text,start:w.startMs/1000,end:w.endMs/1000})),duration);
    const scan=checkedProcess('ffmpeg',['-hide_banner','-nostats','-i',p[0],'-an','-vf','fps=2,scale=160:90,format=yuv420p,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG','-f','null','-']);
    const motion=[];let time;
    for(const line of scan.stderr.split(/\r?\n/)){const t=line.match(/pts_time:([\d.]+)/);if(t)time=Number(t[1]);const score=line.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);if(score&&Number.isFinite(time))motion.push({time,score:Number(score[1])});}
    if(duration>=1&&!motion.length)throw new Error('No visual measurements were produced.');
    const settings={minGapMs,motionThreshold,analysisFps:2};
    const review={schemaVersion:2,algorithmVersion:EDITORIAL_VERSION,kind:'pacing',createdAt:new Date().toISOString(),inputs,duration,settings,candidates:pacingCandidates(words,duration,motion,settings),coverage:{visualSamples:motion.length,completeDecode:true},note:'Inspect the whole preview for camera repositioning, readability, intentional pauses and sound balance. Visual differences can be intentional transitions; neither silence nor motion establishes intent. No automatic retiming or approval.'};
    assertCurrent(inputs);writeEvidence(o['--out'],review,{sources:Object.values(inputs).map(x=>x.path),force:!!o['--force']});
    console.log(`${review.candidates.length} final pacing candidates -> ${o['--out']}. Complete visual review and decisions are required.`);
  }
} catch(error){console.error(`Pacing review failed: ${error.message}`);process.exitCode=2;}
