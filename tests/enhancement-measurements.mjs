import './isolate.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {sfxGain} from '../src/audio/standard.ts';

const ffmpeg = args => {
  const result = spawnSync('ffmpeg', ['-v','error',...args], { maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr?.toString() ?? result.error?.message);
  return result.stdout;
};

const pixels = (file, frame, filter) => ffmpeg(['-i',file,'-vf',`select=eq(n\\,${frame}),${filter},format=rgb24`,'-fps_mode','passthrough','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
const difference = (a, b) => {
  assert.equal(a.length, b.length); assert.ok(a.length > 0);
  let sum = 0; for (let i=0; i<a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
};
const pcm = file => {
  const buffer = ffmpeg(['-i',file,'-vn','-ac','1','-ar','48000','-f','f32le','-']);
  return Array.from({length:buffer.length/4}, (_,i) => buffer.readFloatLE(i*4));
};
const rms = (samples, start, end) => {
  const window = samples.slice(Math.round(start * 48000), Math.round(end * 48000));
  return Math.sqrt(window.reduce((sum,value)=>sum+value*value,0)/window.length);
};
const tone = (samples, start, end, frequency) => {
  const first = Math.round(start*48000), count = Math.round((end-start)*48000);
  let real=0, imaginary=0, total=0;
  for(let i=0; i<count; i++) {
    const weight=0.5-0.5*Math.cos(2*Math.PI*i/(count-1));
    const angle=2*Math.PI*frequency*i/48000;
    real+=samples[first+i]*weight*Math.cos(angle);
    imaginary+=samples[first+i]*weight*Math.sin(angle);
    total+=weight;
  }
  return 2*Math.hypot(real,imaginary)/total;
};

export function measureEnhancements({video,master,width,height}) {
  // Caption bands must be blank on the first/last frame of the white card.
  // The deliberately fractional cue starts at 2241 ms -> frame 67 at 30 fps.
  const boundaryWhiteness=[];
  for(const frame of [67,137]) {
    const band=pixels(video,frame,`crop=iw:ih*0.35:0:ih*0.65,scale=128:64`);
    let white=0;
    for(let i=0;i<band.length;i+=3) if(band[i]>245&&band[i+1]>245&&band[i+2]>245) white++;
    const fraction=white/(band.length/3);
    assert.ok(fraction>0.99,`Caption/card boundary at frame ${frame} is not clear: ${fraction}`);
    boundaryWhiteness.push({frame,fraction});
  }
  // Compare the rendered central picture with source and expected 1.15x crop;
  // this region avoids caption/callout overlays.
  const crop=`crop=iw*0.6:ih*0.3:iw*0.2:ih*0.35,scale=128:96`;
  const actual=pixels(video,30,crop), plain=pixels(master,30,crop);
  const sw=Math.round(width*1.15/2)*2, sh=Math.round(height*1.15/2)*2;
  const zoomed=pixels(master,30,`scale=${sw}:${sh},crop=${width}:${height}:(iw-${width})*0.5:(ih-${height})*0.4,${crop}`);
  const plainError=difference(actual,plain), zoomError=difference(actual,zoomed);
  assert.ok(zoomError<plainError*0.7,`Zoom absent/misaligned: expected crop error ${zoomError}, neutral error ${plainError}`);

  const original=pcm(master), rendered=pcm(video);
  const voiceRatio=rms(rendered,3.15,3.65)/rms(original,3.15,3.65);
  assert.ok(voiceRatio>0.9&&voiceRatio<1.1,`Speaker audio changed under the cutaway: ratio ${voiceRatio}`);
  const effects=[];
  for(const [sound,start,end,frequency,atMs] of [['tick',0.705,0.745,2300,700],['whoosh',2.40,2.65,1800,2241],['hit',5.02,5.25,82,5000]]) {
    const base=tone(original,start,end,frequency), mixed=tone(rendered,start,end,frequency);
    assert.ok(mixed>base*5&&mixed>0.0001,`${sound} missing from mix: baseline ${base}, mixed ${mixed}`);
    const cueStart=Math.round(atMs*30/1000)/30;
    const reference=tone(pcm(`public/sfx/${sound}.wav`),start-cueStart,end-cueStart,frequency);
    const expected=reference*sfxGain(sound),gainRatio=mixed/expected;
    assert.ok(gainRatio>0.5&&gainRatio<1.5,`${sound} rendered gain differs from the house standard: ratio ${gainRatio}`);
    effects.push({sound,base,mixed,expectedGain:sfxGain(sound),expectedTone:expected,gainRatio});
  }
  assert.ok(rendered.every(Number.isFinite));
  const peak=rendered.reduce((maximum,value)=>Math.max(maximum,Math.abs(value)),0);
  assert.ok(peak<1,`Clipped audio peak: ${peak}`);
  return {boundaryWhiteness,zoom:{plainError,zoomError},voiceRatio,effects,samplePeak:peak};
}
