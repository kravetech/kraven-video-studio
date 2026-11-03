// Generate reproducible sound assets locally; no sampled audio is downloaded.
import { prepareSounds } from './lib/sfx.mjs';
const args = process.argv.slice(2);
if (args.some(arg => !['--force', '--check'].includes(arg))) throw new Error('Usage: pnpm sfx [--check | --force]');
prepareSounds({ force: args.includes('--force'), checkOnly: args.includes('--check') });
console.log(args.includes('--check') ? 'Sound effects verified: whoosh, hit, tick.' : 'Sound effects ready in public/sfx/: whoosh, hit, tick. Existing valid files preserved.');
