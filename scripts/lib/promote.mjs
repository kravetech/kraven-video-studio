import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256File } from './package.mjs';
import { assertSafeOutput } from './guard.mjs';

// Staging and old/new directory renames stay on the destination volume.
// A lock serializes this CLI; it does not lock out unrelated applications.
export function promoteRelease({ dest, files, manifest, replace = false, sources = [], verify = () => {} }) {
  dest = path.resolve(dest);
  const root = path.dirname(dest);
  const inputFiles = [...files, ...sources];
  for (const file of [...files.map(file => path.join(dest, path.basename(file))), path.join(dest, 'manifest.json')]) {
    assertSafeOutput(file, { sources: inputFiles, force: true });
  }
  mkdirSync(root, { recursive: true });
  const lockPath = dest + '.release.lock';
  const lock = openSync(lockPath, 'wx');
  let stage, previous;
  try {
    if (existsSync(dest)) {
      const existing = readdirSync(dest).filter(name => name !== 'manifest.json');
      const differs = existing.some(name => !manifest.upload[name] || !statSync(path.join(dest, name)).isFile() || sha256File(path.join(dest, name)) !== manifest.upload[name].sha256);
      if (differs && !replace) throw new Error('Upload contains different files. Use --replace only after human approval.');
    }
    stage = mkdtempSync(path.join(root, '.release-stage-'));
    for (const file of files) {
      const name = path.basename(file);
      copyFileSync(file, path.join(stage, name));
      if (sha256File(path.join(stage, name)) !== manifest.upload[name]?.sha256) throw new Error(`Staged hash mismatch: ${name}`);
    }
    verify();
    writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (existsSync(dest)) {
      const archive = path.join(root, '.superseded');
      mkdirSync(archive, { recursive: true });
      previous = path.join(archive, `${path.basename(dest)}-${randomUUID()}`);
      renameSync(dest, previous);
    }
    try { renameSync(stage, dest); stage = undefined; }
    catch (error) {
      if (previous && !existsSync(dest)) renameSync(previous, dest);
      throw error;
    }
    return { dest, previous };
  } finally {
    if (stage && path.dirname(stage) === root && path.basename(stage).startsWith('.release-stage-')) rmSync(stage, { recursive: true, force: true });
    closeSync(lock);
    unlinkSync(lockPath);
  }
}
