import fs from 'node:fs';
import {snapshotFile} from './lib/render-record.mjs';
import {EDITORIAL_VERSION,parseArgs,numberOption,wavEnvelope,validateWords,parseRanges,takeCandidates,assertCurrent,writeEvidence,checkEditorial,decisionReport} from './lib/editorial-review.mjs';

try {
  const {options:o,positional:p}=parseArgs(process.argv.slice(2),['--check','--force','--out','--source','--ranges','--from','--to','--min-pause-ms','--window-sec','--report']);
  if(o['--check']) {
    if(p.length!==2)throw new Error('Usage: pnpm takes:review --check <review.json> <decisions.json> [--report file.md]');
    const result=checkEditorial(p[0],p[1],{kind:'take'});
    if(o['--report'])writeEvidence(o['--report'],decisionReport(...p),{sources:[...p,...Object.values(result.inputs).map(x=>x.path)],force:!!o['--force'],text:true});
    console.log(`${result.status.toUpperCase()}: ${result.candidates} candidates accounted for; ${result.unresolved.length} unresolved. No human approval implied.`);
  } else {
    if(p.length!==2||!o['--out']||!o['--source'])throw new Error('Usage: pnpm takes:review <whisper.json> <16k-mono.wav> --source <raw-video> --out <review.json> [--ranges a-b,c-d] [--min-pause-ms 700]');
    if(o['--ranges']&&(o['--from']||o['--to']))throw new Error('Use ranges or from/to, not both.');
    const minPauseMs=numberOption(o['--min-pause-ms']??700,'min-pause-ms',100,30000),windowSec=numberOption(o['--window-sec']??12,'window-sec',.1,120);
    const inputs={source:snapshotFile(o['--source']),audio:snapshotFile(p[1]),transcript:snapshotFile(p[0])};
    const audio=wavEnvelope(p[1]),transcript=JSON.parse(fs.readFileSync(p[0],'utf8').replace(/^\uFEFF/,''));
    if(!Array.isArray(transcript.transcription))throw new Error('Whisper transcription must be an array.');
    const words=validateWords(transcript.transcription.map(s=>{if(typeof s.text!=='string')throw new Error('Invalid Whisper text.');return {text:s.text.trim(),start:s.offsets?.from/1000,end:s.offsets?.to/1000};}).filter(w=>w.text&&!/^\[.*\]$/.test(w.text)),audio.duration);
    const from=numberOption(o['--from']??0,'from',0,audio.duration),to=numberOption(o['--to']??audio.duration,'to',0,audio.duration);
    const ranges=parseRanges(o['--ranges']??`${from}-${to}`,audio.duration);
    const settings={minPauseMs,windowSec,speechDb:audio.speechDb,pauseDb:audio.pauseDb};
    const review={schemaVersion:2,algorithmVersion:EDITORIAL_VERSION,kind:'take',createdAt:new Date().toISOString(),inputs,ranges,settings,candidates:takeCandidates(words,audio,ranges,settings),note:'Candidates require contextual review. Repetition and silence do not establish intent. Word times may drift; inspect actual audio before choosing cuts.'};
    assertCurrent(inputs);writeEvidence(o['--out'],review,{sources:Object.values(inputs).map(x=>x.path),force:!!o['--force']});
    console.log(`${review.candidates.length} take candidates -> ${o['--out']}. Record decisions; no cuts or approvals were made.`);
  }
} catch(error){console.error(`Take review failed: ${error.message}`);process.exitCode=2;}
