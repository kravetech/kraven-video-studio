export function frameRate(value) {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Frame rate must be a number or fraction.');
  const match = String(value).match(/^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/);
  if (!match) throw new Error(`Invalid frame rate: ${value}`);
  const rate = Number(match[1]) / Number(match[2] ?? 1);
  if (!Number.isFinite(rate) || rate < 1 || rate > 240) throw new Error(`Unsupported frame rate: ${value}`);
  return rate;
}

export function outputFrameRate(source, edit = {}) {
  const sourceRate = frameRate(source);
  const requested = edit.fps ?? source;
  const targetRate = frameRate(requested);
  if (Math.abs(sourceRate - targetRate) > 1e-8 && edit.frameRateConversion !== true) {
    throw new Error(`Frame-rate conversion ${source} -> ${requested} requires frameRateConversion: true after review.`);
  }
  return String(requested);
}
