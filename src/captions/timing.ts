type Word = {text:string;startMs:number;endMs:number;timestampMs?:number;confidence?:number|null};
export type TimingRepair = {index:number;text:string;before:{startMs:number;endMs:number};after:{startMs:number;endMs:number};reason:string};

// Preserve word order/text, distribute duplicate/out-of-order starts within the
// next anchor, then bound each end to its next word/media end. All repairs are
// estimates recorded for human sync review, never approval of that timing.
export function normalizeCaptionTimings(input:Word[],durationMs:number) {
  const bound=Math.floor(durationMs);
  if(!Number.isFinite(bound)||bound<=0||!Array.isArray(input)||!input.length)throw new Error('Positive media duration and transcript words are required.');
  if(bound<input.length)throw new Error('Insufficient media duration for the transcript; review the source/timings.');
  const captions=input.map(word=>({...word}));
  for(const word of captions)if(typeof word.text!=='string'||!word.text.trim()||!Number.isFinite(word.startMs)||!Number.isFinite(word.endMs)||word.startMs<0||word.endMs<0||word.startMs>bound)throw new Error('Invalid transcript offsets; check the source or supply the correct audio duration.');
  const desired=captions.map(word=>Math.min(bound,Math.round(word.startMs)));
  for(let i=1;i<desired.length;i++)desired[i]=Math.max(desired[i],desired[i-1]);
  let previous=-1;
  for(let first=0;first<captions.length;) {
    let last=first+1;while(last<captions.length&&desired[last]===desired[first])last++;
    const next=last<captions.length?desired[last]:bound;
    let start=Math.max(desired[first],previous+1);
    if(start>=next)start=Math.max(previous+1,next-(last-first)*120);
    const room=next-start,count=last-first;
    if(room<count)throw new Error('No safe timing interval for repeated/end words; provide corrected offsets or the actual audio.');
    const step=Math.min(120,room/count);
    for(let i=first;i<last;i++){captions[i].startMs=start+Math.floor((i-first)*step);previous=captions[i].startMs;}
    first=last;
  }
  const repairs:TimingRepair[]=[];
  for(let i=0;i<captions.length;i++) {
    const word=captions[i],ceiling=captions[i+1]?.startMs??bound;
    const original=input[i];
    let end=Math.round(original.endMs);
    if(end<=word.startMs)end=word.startMs+Math.min(120,ceiling-word.startMs);
    word.endMs=Math.min(ceiling,bound,Math.max(word.startMs+1,end));
    if(word.endMs<=word.startMs||word.startMs<0||word.endMs>bound)throw new Error('Caption timing cannot be repaired safely; manual synchronization is required.');
    word.timestampMs=Math.round((word.startMs+word.endMs)/2);
    if(word.startMs!==original.startMs||word.endMs!==original.endMs)repairs.push({index:i,text:word.text,before:{startMs:original.startMs,endMs:original.endMs},after:{startMs:word.startMs,endMs:word.endMs},reason:'Bounded positive timing/order repair; human synchronization review required.'});
  }
  return {captions,repairs};
}
