// Generate a reproducible preview without downloading or shipping anyone's media.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { profileFor } from '../src/profiles.ts';

const args = process.argv.slice(2);
const profile = profileFor(args.includes('--profile') ? args[args.indexOf('--profile') + 1] : undefined);
const run = args => {
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
};
mkdirSync('public/samples', { recursive: true });
run(['-v','error','-y','-f','lavfi','-i',`testsrc2=size=${profile.width}x${profile.height}:rate=30:duration=3`,'-f','lavfi','-i','sine=frequency=440:duration=3','-af','volume=4','-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-shortest','public/samples/demo.mp4']);
run(['-v','error','-y','-ss','1','-i','public/samples/demo.mp4','-frames:v','1','public/samples/cover-frame.png']);
run(['-v','error','-y','-ss','1','-i','public/samples/demo.mp4','-frames:v','1','public/samples/thumb-frame.png']);
writeFileSync('public/samples/demo.captions.json', JSON.stringify({
  source: 'Generated tone and test pattern; these words are synthetic labels, not a transcript.',
  review: { status: 'needs-review' },
  captions: ['Synthetic','media','preview'].map((text, index) => ({ text, startMs: 400 + index * 500, endMs: 850 + index * 500, timestampMs: 625 + index * 500, confidence: null })),
}, null, 2));
writeFileSync('public/samples/demo.edit.json', JSON.stringify({ profile: profile.id, callouts: [{ atMs: 200, durationMs: 2000, label: 'PREVIEW', term: 'Synthetic media' }] }, null, 2));
console.log(`Created ${profile.id} synthetic preview. Run pnpm dev and select CaptionedClip. It remains unreviewed.`);
