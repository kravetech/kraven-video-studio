import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cutawayActive, cutawayFrames, zoomScaleAt, assertEnhancementTimeline } from '../src/edit/timing.ts';

const timing = { inMs: 700, holdMs: 2200, outMs: 450 };
const linear = value => value;

test('captions suppress on precisely the rendered cutaway frames at integer and fractional rates', () => {
  const cue = { atMs: 2241, holdMs: 1050 };
  for (const fps of [24, 30, 60000 / 1001]) {
    const { from, duration } = cutawayFrames(cue, fps, timing);
    assert.equal(cutawayActive(from - 1, [cue], fps, timing), false);
    assert.equal(cutawayActive(from, [cue], fps, timing), true);
    assert.equal(cutawayActive(from + duration - 1, [cue], fps, timing), true);
    assert.equal(cutawayActive(from + duration, [cue], fps, timing), false);
  }
});

test('short and long zooms reach their requested scale and return to neutral', () => {
  for (const durationMs of [200, 450, 900, 1600]) {
    const cue = { atMs: 200, durationMs, scale: 1.25 };
    assert.equal(zoomScaleAt(199, [cue], linear, linear), 1);
    assert.equal(zoomScaleAt(200, [cue], linear, linear), 1);
    assert.equal(zoomScaleAt(200 + durationMs / 2, [cue], linear, linear), 1.25);
    assert.equal(zoomScaleAt(200 + durationMs, [cue], linear, linear), 1);
    for (let t = 200; t < 200 + durationMs; t += 17) {
      const scale = zoomScaleAt(t, [cue], linear, linear);
      assert.ok(scale >= 1 && scale <= 1.25);
    }
  }
});

test('enhancement timelines reject overlaps and events outside the video', () => {
  const empty = { broll: [], zooms: [], sfx: [] };
  assert.doesNotThrow(() => assertEnhancementTimeline({ ...empty, broll: [{ atMs: 1000, holdMs: 1000 }], sfx: [{ atMs: 1000, sound: 'whoosh' }] }, 30, 180, timing));
  assert.throws(() => assertEnhancementTimeline({ ...empty, broll: [{ atMs: 5000 }] }, 30, 180, timing), /outside/);
  assert.throws(() => assertEnhancementTimeline({ ...empty, broll: [{ atMs: 0 }, { atMs: 1000 }] }, 30, 180, timing), /overlap/);
  assert.throws(() => assertEnhancementTimeline({ ...empty, zooms: [{ atMs: 0, durationMs: 1000, scale: 1.1 }, { atMs: 500, durationMs: 1000, scale: 1.1 }] }, 30, 180, timing), /overlap/);
  assert.throws(() => assertEnhancementTimeline({ ...empty, sfx: [{ atMs: 5900, sound: 'whoosh' }] }, 30, 180, timing), /outside/);
});
