import { existsSync } from 'node:fs';
import path from 'node:path';
import { assertSafeOutput, physicalPath as physical } from './guard.mjs';
import { assertCardTiming } from '../../src/broll/validation.ts';
import { cssVars } from '../../src/design-system/tokens.generated.ts';
export const cardTiming = { inMs:parseFloat(cssVars['broll-in']), holdMs:parseFloat(cssVars['broll-hold']), outMs:parseFloat(cssVars['broll-out']) };
export const cardClock = Number(cssVars['broll-clock']);
export function assertBrollDestination(file, { sources = [], force = false } = {}) {
  const canonical = physical(file);
  const inputs = [...sources, ...sources.map(physical)];
  assertSafeOutput(file, { sources:inputs, force });
  assertSafeOutput(canonical, { sources:inputs, force });
  if (existsSync(file) && !force) throw new Error(`${file} exists; use --force only after explicit approval to replace B-roll outputs.`);
}
const PROP_KEYS = ['variant','ratio','primary','secondary','beforeLabel','afterLabel','accent','bg','holdMs','startAt','fps'];
export function planBrollBatch(cueFile, { cuesPath, outDir, force = false }) {
  if (!Array.isArray(cueFile?.cues) || cueFile.cues.length === 0) throw new Error('B-roll cues must be a nonempty array.');
  const root = path.resolve(outDir);
  const ids = new Set();
  const renders = cueFile.cues.map(cue => {
    const id = cue?.id;
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(id) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id)) throw new Error(`Unsafe B-roll id: ${String(id)}. Use a safe basename of letters, numbers, underscores or hyphens.`);
    if (ids.has(id.toLowerCase())) throw new Error(`Duplicate B-roll id (case-insensitive): ${id}`);
    ids.add(id.toLowerCase());
    const props = Object.fromEntries(PROP_KEYS.filter(key => cue[key] !== undefined).map(key => [key,cue[key]]));
    props.ratio = cue.ratio ?? cueFile.ratio ?? '9:16';
    if (!['9:16','16:9'].includes(props.ratio)) throw new Error(`Invalid B-roll ratio: ${props.ratio}`);
    if (props.fps !== undefined && (typeof props.fps !== 'number' || !Number.isFinite(props.fps) || props.fps < 1 || props.fps > 240)) throw new Error('B-roll fps must be a finite number from 1 to 240.');
    for (const key of ['beforeLabel','afterLabel','accent','bg']) if (props[key] !== undefined && typeof props[key] !== 'string') throw new Error(`B-roll ${key} must be text.`);
    assertCardTiming(props, cardTiming, cardClock);
    const file = path.resolve(root, `${id}.mp4`);
    if (path.dirname(file) !== root) throw new Error('B-roll output escaped its selected directory.');
    return { id, at:cue.at ?? null, file, props };
  });
  const manifest = path.join(root, 'manifest.json');
  for (const file of [...renders.map(render => render.file),manifest]) {
    if (path.dirname(physical(file)) !== physical(root)) throw new Error('B-roll output link escaped its selected directory.');
    assertBrollDestination(file,{sources:[cuesPath],force});
  }
  return { root, renders, manifest };
}
