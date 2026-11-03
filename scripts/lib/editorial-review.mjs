// Local editorial evidence, never an automatic judgment of intent or approval.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {snapshotFile} from './render-record.mjs';
import {assertBrollDestination} from './broll-plan.mjs';

export const EDITORIAL_VERSION='editorial-v2';
export const ACTIONS=['keep','shorten','remove-restart','review'];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
export const numberOption=(value,name,min,max)=>{const n=Number(value);if(!finite(n)||n<min||n>max)throw new Error(`${name} must be finite, between ${min} and ${max}.`);return n;};
export function parseArgs(args,flags) {
  const options={},positional=[];
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(!arg.startsWith('--')){positional.push(arg);continue;}
    if(!flags.includes(arg)||Object.hasOwn(options,arg))throw new Error(`Unknown/duplicate option: ${arg}`);
    if(['--force','--check'].includes(arg)){options[arg]=true;continue;}
    if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value: ${arg}`);
    options[arg]=args[++i];
  }
  return {options,positional};
}
function assertDestination(file,sources,force) {
  assertBrollDestination(file,{sources,force});
  if(fs.existsSync(file)) {
    const out=fs.statSync(file);
    if(sources.some(source=>{const st=fs.statSync(source);return st.dev===out.dev&&st.ino===out.ino;}))throw new Error('Output aliases an input file.');
  }
}
export function writeEvidence(file,value,{sources=[],force=false,text=false}={}) {
  assertDestination(file,sources,force);
  fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
  const temporary=`${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary,text?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    assertDestination(file,sources,force);
    fs.renameSync(temporary,file);
  } finally {if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
export function assertCurrent(inputs) {
  if(!inputs||!Object.keys(inputs).length)throw new Error('Missing editorial source fingerprints.');
  for(const [role,expected] of Object.entries(inputs)) {
    if(!expected||!/^[a-f0-9]{64}$/.test(expected.sha256??''))throw new Error(`Invalid editorial fingerprint: ${role}`);
    const current=snapshotFile(expected.path);
    if(current.sha256!==expected.sha256||current.bytes!==expected.bytes)throw new Error(`Changed editorial input: ${role}. Regenerate review and decisions.`);
  }
}
export function wavEnvelope(file) {
  const buf=fs.readFileSync(file);
  if(buf.length<44||buf.toString('ascii',0,4)!=='RIFF'||buf.toString('ascii',8,12)!=='WAVE'||buf.readUInt32LE(4)+8!==buf.length)throw new Error('Expected a complete RIFF WAV.');
  let format,data;
  for(let at=12;at+8<=buf.length;) {
    const size=buf.readUInt32LE(at+4),end=at+8+size,id=buf.toString('ascii',at,at+4);
    if(end>buf.length)throw new Error('Truncated WAV chunk.');
    if(id==='fmt '){if(format||size<16)throw new Error('Invalid WAV format chunk.');format={codec:buf.readUInt16LE(at+8),channels:buf.readUInt16LE(at+10),rate:buf.readUInt32LE(at+12),byteRate:buf.readUInt32LE(at+16),align:buf.readUInt16LE(at+20),bits:buf.readUInt16LE(at+22)};}
    if(id==='data'){if(data)throw new Error('Multiple WAV data chunks are unsupported.');data=buf.subarray(at+8,end);}
    at=end+(size%2);
  }
  if(!format||!data?.length||format.codec!==1||format.channels!==1||format.rate!==16000||format.bits!==16||format.align!==2||format.byteRate!==32000||data.length%2)throw new Error('Take review requires 16 kHz mono PCM signed 16-bit WAV.');
  const env=[];for(let at=0;at+320<=data.length;at+=320){let sum=0;for(let i=at;i<at+320;i+=2){const n=data.readInt16LE(i)/32768;sum+=n*n;}env.push(10*Math.log10(Math.max(sum/160,1e-12)));}
  if(!env.length)throw new Error('Audio is too short to analyze.');
  const smooth=env.map((_,i)=>{let sum=0,count=0;for(let k=Math.max(0,i-5);k<Math.min(env.length,i+5);k++){sum+=10**(env[k]/10);count++;}return 10*Math.log10(sum/count);});
  const speechDb=[...smooth].sort((a,b)=>a-b)[Math.floor(smooth.length*.7)];
  return {duration:data.length/32000,smooth,speechDb,pauseDb:speechDb-9};
}
export function validateWords(words,duration) {
  if(!Array.isArray(words)||!words.length)throw new Error('A nonempty word transcript is required.');
  let previous=-Infinity;
  for(const w of words){if(typeof w.text!=='string'||!w.text.trim()||!finite(w.start)||!finite(w.end)||w.start<0||w.end<w.start||w.end>duration+.05||w.start<previous)throw new Error('Invalid, unordered or out-of-bounds word offsets.');previous=w.start;}
  return words;
}
export function parseRanges(value,duration) {
  const ranges=value?value.split(',').map(part=>{
    const m=part.trim().match(/^(\d+(?:\.\d+)?|\.\d+)\s*-\s*(\d+(?:\.\d+)?|\.\d+)$/);
    if(!m)throw new Error('Ranges must be finite start-end pairs in seconds.');return {from:Number(m[1]),to:Number(m[2])};
  }):[{from:0,to:duration}];
  ranges.sort((a,b)=>a.from-b.from);
  for(let i=0;i<ranges.length;i++)if(ranges[i].to<=ranges[i].from||ranges[i].to>duration+.005||(i&&ranges[i].from<ranges[i-1].to))throw new Error('Ranges must be ordered, nonoverlapping and inside audio duration.');
  return ranges;
}
const norm=text=>text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}']/gu,'');
export function takeCandidates(words,audio,ranges,{minPauseMs=700,windowSec=12}={}) {
  const candidates=[];
  const median=(a,b)=>{const xs=audio.smooth.slice(Math.max(0,Math.round(a*100)),Math.round(b*100)).sort((x,y)=>x-y);return xs.length?xs[Math.floor(xs.length/2)]:null;};
  for(const range of ranges) {
    const selected=words.filter(w=>w.start>=range.from&&w.end<=range.to),pauses=[];
    const context=i=>({before:selected.slice(Math.max(0,i-10),i).map(w=>w.text).join(' '),after:selected.slice(i,i+10).map(w=>w.text).join(' ')});
    // Only between-word context; never extend a candidate outside a selected take.
    for(let t=Math.ceil(range.from*100);t<Math.min(audio.smooth.length,range.to*100);) {
      if(audio.smooth[t]>=audio.pauseDb){t++;continue;}
      const first=t;while(t<audio.smooth.length&&t<range.to*100&&audio.smooth[t]<audio.pauseDb)t++;
      const start=first/100,end=Math.min(t/100,range.to),next=selected.findIndex(w=>w.start>=end-.1);
      if((end-start)*1000>=minPauseMs&&next>0&&end<=selected.at(-1).end)pauses.push({kind:'pause',start,end,durationMs:Math.round((end-start)*1000),levelDb:median(start,end),context:context(next)});
    }
    candidates.push(...pauses);
    for(let i=1;i<selected.length;i++) {
      const start=selected[i-1].end,end=selected[i].start;
      if((end-start)*1000>=minPauseMs&&!pauses.some(p=>Math.min(p.end,end)-Math.max(p.start,start)>.5*(end-start)))candidates.push({kind:'gap',start,end,durationMs:Math.round((end-start)*1000),levelDb:median(start,end),context:context(i),note:'Wordless interval may contain noise, a deliberate beat or missed speech.'});
      for(let j=i-1;j>=0&&selected[i].start-selected[j].start<=windowSec;j--) {
        let n=0;while(j+n<i&&i+n<selected.length&&norm(selected[j+n].text)&&norm(selected[j+n].text)===norm(selected[i+n].text))n++;
        const single=j===i-1&&n===1;
        if(n>=2||single){candidates.push({kind:single?'word-repeat':'restart',start:selected[j].start,end:selected[i+n-1].end,attempt:{start:selected[j].start,end:selected[i-1].end,text:selected.slice(j,i).map(w=>w.text).join(' ')},retake:{start:selected[i].start,text:selected.slice(i,i+n+3).map(w=>w.text).join(' ')},matchedWords:n,context:context(i),note:'Repetition can be intentional; no automatic deletion.'});break;}
      }
    }
  }
  return candidates.sort((a,b)=>a.start-b.start).map((c,i)=>({...c,id:`t-${String(i+1).padStart(3,'0')}`}));
}
export function checkedProcess(command,args) {
  const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:32*1024*1024});
  if(result.error||result.status!==0)throw new Error(`${command} analysis failed: ${result.error?.message??result.stderr?.slice(-1200)}`);
  return result;
}
export function probeDuration(file) {
  const meta=JSON.parse(checkedProcess('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',file]).stdout);
  const duration=Number(meta.format?.duration);
  if(!finite(duration)||duration<=0||!meta.streams?.some(s=>s.codec_type==='video'))throw new Error('Pacing review needs readable video with positive duration.');return duration;
}
export function pacingCandidates(words,duration,motion,{minGapMs=500,motionThreshold=20}={}) {
  const result=[];
  for(let i=0;i<=words.length;i++) {
    const start=i?words[i-1].end:0,end=i<words.length?words[i].start:duration;
    if((end-start)*1000>=minGapMs)result.push({kind:'wordless-gap',start,end,durationMs:Math.round((end-start)*1000),context:{before:words.slice(Math.max(0,i-6),i).map(w=>w.text).join(' '),after:words.slice(i,i+6).map(w=>w.text).join(' ')},maxVisualDifference:Math.max(0,...motion.filter(m=>m.time>=start&&m.time<=end).map(m=>m.score)),note:'Review pacing even when room noise prevents silence detection; tails and dramatic beats may be intentional.'});
  }
  for(let i=0;i<motion.length;) {
    if(motion[i].score<motionThreshold){i++;continue;}
    const first=i;while(i<motion.length&&motion[i].score>=motionThreshold)i++;
    if(i-first>=2){const start=Math.max(0,motion[first].time-.5),end=Math.min(duration,motion[i-1].time);result.push({kind:'visual-change',start,end,maxVisualDifference:Math.max(...motion.slice(first,i).map(m=>m.score)),note:'Large visual change may be camera movement, a screen change or intentional B-roll. Inspect the preview.'});}
  }
  return result.sort((a,b)=>a.start-b.start).map((c,i)=>({...c,id:`p-${String(i+1).padStart(3,'0')}`}));
}
export function checkEditorial(reviewPath,decisionsPath,{kind,source,segments,final=false}={}) {
  const reviewFingerprint=snapshotFile(reviewPath),decisionsFingerprint=snapshotFile(decisionsPath),review=read(reviewPath),d=read(decisionsPath);
  if(review.schemaVersion!==2||review.algorithmVersion!==EDITORIAL_VERSION||review.kind!==kind||!Array.isArray(review.candidates))throw new Error('Regenerate this editorial review with rc.5; earlier review files are retained historical records.');
  if(d.reviewSha256!==reviewFingerprint.sha256||typeof d.decidedBy!=='string'||!d.decidedBy.trim()||!Array.isArray(d.decisions))throw new Error('Editorial decisions need the current review hash and reviewer.');
  const required=kind==='take'?['source','audio','transcript']:['video','captions'];
  if(required.some(role=>!review.inputs?.[role]))throw new Error('Missing required editorial input fingerprints.');
  assertCurrent(review.inputs);
  if(source&&snapshotFile(source).sha256!==review.inputs.source?.sha256)throw new Error('Take review source differs from this edit.');
  if(segments)for(const clip of segments)if(!Array.isArray(review.ranges)||!review.ranges.some(r=>finite(r.from)&&finite(r.to)&&clip.in>=r.from-.001&&clip.out<=r.to+.001))throw new Error('Take review does not cover every selected source range; regenerate it with wider reviewed ranges.');
  const ids=new Set();for(const c of review.candidates){if(typeof c.id!=='string'||ids.has(c.id)||!finite(c.start)||!finite(c.end)||c.end<c.start)throw new Error('Invalid or duplicate editorial candidate.');ids.add(c.id);}
  const seen=new Set();
  for(const decision of d.decisions){if(!ids.has(decision.id)||seen.has(decision.id)||!ACTIONS.includes(decision.decision)||typeof decision.reason!=='string'||!decision.reason.trim())throw new Error('Every decision needs a unique current candidate ID, valid action and reason.');seen.add(decision.id);}
  if(seen.size!==ids.size)throw new Error('Every editorial candidate requires a decision and reason.');
  if(kind==='pacing'&&(d.visualReview?.status!=='complete'||typeof d.visualReview?.notes!=='string'||!d.visualReview.notes.trim()))throw new Error('Final pacing review requires recorded visual inspection of the complete preview.');
  const unresolved=d.decisions.filter(x=>x.decision==='review').map(x=>x.id);
  if(final&&unresolved.length)throw new Error(`Unresolved editorial cases: ${unresolved.join(', ')}. Keep them in preview until reviewed.`);
  assertCurrent({review:reviewFingerprint,decisions:decisionsFingerprint,...review.inputs});
  const inputs=Object.fromEntries(Object.entries(review.inputs).map(([k,v])=>[`${kind}:${k}`,v]));
  inputs[`${kind}:review`]=reviewFingerprint;inputs[`${kind}:decisions`]=decisionsFingerprint;
  return {algorithmVersion:EDITORIAL_VERSION,status:unresolved.length?'needs-review':'pass',kind,unresolved,candidates:review.candidates.length,inputs};
}
export function takeForEdit(edit,{final=false}={}) {
  if(!edit.takeReview||!edit.takeDecisions)throw new Error('Take review is required before assembly. Run pnpm takes:review with --source and record decisions; see docs/EDITORIAL-REVIEW.md.');
  return checkEditorial(edit.takeReview,edit.takeDecisions,{kind:'take',source:edit.source,segments:edit.segments??edit.clips,final});
}
export function decisionReport(reviewPath,decisionsPath) {
  const review=read(reviewPath),d=read(decisionsPath),decisions=new Map(d.decisions.map(x=>[x.id,x]));
  const clean=s=>String(s??'').replaceAll('|','\\|').replace(/[\r\n]/g,' ');
  return ['# Editorial decisions','',`Proposed by ${clean(d.decidedBy)}. This records editorial review, not human final approval.`,'','| ID | Source time | Kind | Action | Reason |','| --- | --- | --- | --- | --- |',...review.candidates.map(c=>`| ${clean(c.id)} | ${c.start.toFixed(2)}–${c.end.toFixed(2)} s | ${clean(c.kind)} | ${clean(decisions.get(c.id)?.decision)} | ${clean(decisions.get(c.id)?.reason)} |`),''].join('\n');
}
