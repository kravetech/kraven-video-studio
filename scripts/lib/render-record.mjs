// Local provenance records contain paths; they belong with private working
// packages, never in the public source archive or upload manifest.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { sha256File } from './package.mjs';
import { checkSound } from './sfx.mjs';

export const renderRecordPath = video => video.replace(/\.mp4$/i, '') + ' - render.json';

export function snapshotFile(file) {
  if (typeof file !== 'string' || !file) throw new Error('A readable input file is required.');
  const absolute = path.resolve(file);
  if (!statSync(absolute).isFile()) throw new Error(`Not a file: ${file}`);
  return { path: absolute, sha256: sha256File(absolute), bytes: statSync(absolute).size };
}

export function renderInputs({ master, captions, edit }) {
  const inputs = { master: snapshotFile(master), captions: snapshotFile(captions) };
  if (edit) {
    inputs.edit = snapshotFile(edit);
    const cues = JSON.parse(readFileSync(edit, 'utf8')).sfx ?? [];
    for (const sound of new Set(cues.map(cue => cue.sound))) inputs[`sound:${sound}`] = snapshotFile(checkSound(sound));
  }
  const code = ['src', 'scripts'].flatMap(root => readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && (root === 'src' || entry.name.endsWith('.mjs')))
    .map(entry => path.join(entry.parentPath, entry.name)));
  for (const file of [...code, 'presets/default.tokens.json', 'package.json', 'pnpm-lock.yaml', 'remotion.config.ts', 'tsconfig.json'].sort()) {
    inputs[`code:${path.relative(process.cwd(), file).replaceAll('\\', '/')}`] = snapshotFile(file);
  }
  return inputs;
}

export function assertInputsCurrent(inputs) {
  if (!inputs || !inputs.master || !inputs.captions || Object.keys(inputs).length < 3) throw new Error('Missing render input fingerprints.');
  for (const [role, expected] of Object.entries(inputs)) {
    if (!expected || !/^[a-f0-9]{64}$/.test(expected.sha256 ?? '')) throw new Error(`Invalid input fingerprint: ${role}`);
    const current = snapshotFile(expected.path);
    if (current.sha256 !== expected.sha256 || current.bytes !== expected.bytes) throw new Error(`Changed input: ${role}. Render and validate again.`);
  }
}

export function verifyRenderRecord(video, captions, master) {
  const record = JSON.parse(readFileSync(renderRecordPath(video), 'utf8'));
  if (record.schemaVersion !== 1 || record.complete !== true) throw new Error('A complete render record is required.');
  if (record.output?.sha256 !== sha256File(video)) throw new Error('Video differs from its recorded render.');
  assertInputsCurrent(record.inputs);
  if (snapshotFile(captions).sha256 !== record.inputs.captions.sha256) throw new Error('Supplied captions differ from the render input.');
  if (snapshotFile(master).sha256 !== record.inputs.master.sha256) throw new Error('Project master differs from the render input.');
  return record;
}
