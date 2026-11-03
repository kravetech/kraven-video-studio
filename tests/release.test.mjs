import './isolate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { frameRate, outputFrameRate } from '../scripts/lib/frame-rate.mjs';
import { sha256File } from '../scripts/lib/package.mjs';
import { snapshotFile, assertInputsCurrent, verifyRenderRecord, renderRecordPath } from '../scripts/lib/render-record.mjs';
import { promoteRelease } from '../scripts/lib/promote.mjs';
import { reviewState, textHash, timingHash } from '../src/captions/review.ts';
import { captionsToSrt } from '../scripts/lib/srt.mjs';

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-release-test-'));
  t.after(() => {
    const resolved = path.resolve(dir);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith('studio-release-test-'));
    rmSync(resolved, { recursive: true, force: true });
  });
  return dir;
}

test('frame rate preserves source, accepts equivalent rationals, and requires declared conversion', () => {
  assert.equal(outputFrameRate('24000/1001'), '24000/1001');
  assert.equal(outputFrameRate('30/1', { fps: 30 }), '30');
  assert.throws(() => outputFrameRate('30', { fps: '60000/1001' }), /requires/);
  assert.equal(outputFrameRate('30', { fps: 24, frameRateConversion: true }), '24');
  for (const invalid of ['NaN', 'Infinity', '-1', '1/0', '1e309', '30;globalThis.pwned=true', {}, null]) assert.throws(() => frameRate(invalid));
  assert.equal(globalThis.pwned, undefined);
});

test('streamed hashing matches SHA-256 across multiple buffer boundaries', t => {
  const dir = fixture(t);
  const data = Buffer.alloc(3 * 1024 * 1024 + 17, 0x5a);
  const file = path.join(dir, 'large.bin');
  writeFileSync(file, data);
  assert.equal(sha256File(file), createHash('sha256').update(data).digest('hex'));
});

test('render record rejects changed video, captions, master and renderer inputs', t => {
  const dir = fixture(t);
  const files = Object.fromEntries(['master', 'captions', 'code', 'video'].map(role => [role, path.join(dir, role)]));
  for (const [role, file] of Object.entries(files)) writeFileSync(file, role);
  const inputs = Object.fromEntries(['master', 'captions', 'code'].map(role => [role, snapshotFile(files[role])]));
  const record = { schemaVersion: 1, complete: true, inputs, output: snapshotFile(files.video) };
  writeFileSync(renderRecordPath(files.video), JSON.stringify(record));
  assert.doesNotThrow(() => verifyRenderRecord(files.video, files.captions, files.master));
  for (const role of ['master', 'captions', 'code']) {
    writeFileSync(files[role], 'changed');
    assert.throws(() => assertInputsCurrent(inputs), /Changed input/);
    writeFileSync(files[role], role);
  }
  writeFileSync(files.video, 'changed video');
  assert.throws(() => verifyRenderRecord(files.video, files.captions, files.master), /differs/);
});

test('failed staging preserves previous upload and releases its lock', t => {
  const dir = fixture(t), dest = path.join(dir, 'upload', 'Demo');
  mkdirSync(dest, { recursive: true });
  writeFileSync(path.join(dest, 'Demo.mp4'), 'original');
  const input = path.join(dir, 'Demo.mp4');
  writeFileSync(input, 'replacement');
  const manifest = { upload: { 'Demo.mp4': snapshotFile(input), 'missing.srt': { sha256: '0'.repeat(64) } } };
  assert.throws(() => promoteRelease({ dest, files: [input, path.join(dir, 'missing.srt')], manifest, replace: true }));
  assert.equal(readFileSync(path.join(dest, 'Demo.mp4'), 'utf8'), 'original');
  assert.equal(existsSync(dest + '.release.lock'), false);
  assert.ok(!readdirSync(path.dirname(dest)).some(name => name.startsWith('.release-stage-')));
});

test('release refuses replacement without consent and preserves old package after replacement', t => {
  const dir = fixture(t), dest = path.join(dir, 'upload', 'Demo');
  const input = path.join(dir, 'Demo.mp4');
  writeFileSync(input, 'first');
  let manifest = { upload: { 'Demo.mp4': { sha256: sha256File(input), bytes: 5 } } };
  promoteRelease({ dest, files: [input], manifest });
  writeFileSync(input, 'second');
  manifest = { upload: { 'Demo.mp4': { sha256: sha256File(input), bytes: 6 } } };
  assert.throws(() => promoteRelease({ dest, files: [input], manifest }), /--replace/);
  const result = promoteRelease({ dest, files: [input], manifest, replace: true });
  assert.equal(readFileSync(path.join(dest, 'Demo.mp4'), 'utf8'), 'second');
  assert.equal(readFileSync(path.join(result.previous, 'Demo.mp4'), 'utf8'), 'first');
  assert.deepEqual(JSON.parse(readFileSync(path.join(dest, 'manifest.json'), 'utf8')), manifest);
});

test('release lock blocks concurrent promotion without disturbing its owner', t => {
  const dir = fixture(t), dest = path.join(dir, 'Demo');
  writeFileSync(dest + '.release.lock', 'other process');
  assert.throws(() => promoteRelease({ dest, files: [], manifest: { upload: {} } }), /EEXIST/);
  assert.equal(readFileSync(dest + '.release.lock', 'utf8'), 'other process');
});

test('caption remapping refuses unrelated edits and requires sync review for legitimate recuts', async t => {
  const dir = fixture(t);
  const captions = [{ text: 'Example', startMs: 200, endMs: 800, timestampMs: 500 }];
  const original = { source: 'synthetic.mp4', clips: [{ label: 'one', in: 1, out: 2 }] };
  const oldPath = path.join(dir, 'old.json'), newPath = path.join(dir, 'new.json'), capPath = path.join(dir, 'caps.json');
  writeFileSync(oldPath, JSON.stringify(original));
  const approved = { captions, review: { status: 'reviewed', textHash: await textHash(captions), timingHash: await timingHash(captions) } };
  for (const next of [{ ...original, source: 'other.mp4' }, { ...original, clips: [{ label: 'one', in: 10, out: 11 }] }, { ...original, clips: [{ label: 'two', in: 1, out: 2 }] }]) {
    writeFileSync(newPath, JSON.stringify(next)); writeFileSync(capPath, JSON.stringify(approved));
    assert.notEqual(spawnSync(process.execPath, ['scripts/remap-captions.mjs', oldPath, newPath, capPath]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(capPath, 'utf8')), approved);
  }
  writeFileSync(newPath, JSON.stringify({ ...original, clips: [{ label: 'one', in: 0.9, out: 2.1 }] }));
  assert.equal(spawnSync(process.execPath, ['scripts/remap-captions.mjs', oldPath, newPath, capPath]).status, 0);
  assert.equal(await reviewState(JSON.parse(readFileSync(capPath, 'utf8'))), 'timing-changed');
});

test('caption export clamps trailing linger and rejects invalid timing', () => {
  const captions = [{ text: 'End', startMs: 500, endMs: 900 }];
  const result = captionsToSrt(captions, { endMs: 1000 });
  assert.equal(result.lastEndMs, 1000);
  assert.match(result.srt, /00:00:01,000/);
  for (const endMs of [NaN, -1, 400]) assert.throws(() => captionsToSrt(captions, { endMs }));
  assert.throws(() => captionsToSrt([{ text: 'Bad', startMs: 800, endMs: 500 }]));
});

test('validation explicitly fails when measured duration metadata is absent', t => {
  const dir = path.join(fixture(t), 'Demo'); mkdirSync(dir);
  const cap = path.join(dir, 'caps.json');
  writeFileSync(cap, JSON.stringify({ captions: [], review: {} }));
  writeFileSync(path.join(dir, 'Demo - project.json'), JSON.stringify({ profile: 'vertical-1080', fps: 30 }));
  const result = spawnSync(process.execPath, ['scripts/validate-package.mjs', dir, '--captions', cap], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  const validation = JSON.parse(readFileSync(path.join(dir, 'validation.json'), 'utf8'));
  assert.equal(validation.checks.find(check => check.name === 'master: measured duration is required').ok, false);
});
