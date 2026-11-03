// Builds a contact sheet of candidate cover frames so a background can be
// chosen. Frames are sampled evenly and labeled 1..N in reading order; the
// matching timestamps (for `pnpm cover --at`) are printed.
//
// Usage: pnpm cover:frames <video> [count=12]
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const [video, countArg] = process.argv.slice(2);
if (!video) {
  console.error("Usage: pnpm cover:frames <video> [count=12]");
  process.exit(1);
}
const count = Number(countArg ?? 12);
const duration = Number(
  execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.resolve(video)])
    .toString()
    .trim(),
);

const name = path.parse(video).name;
const dir = path.resolve("out", "cover-frames", name);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const times = Array.from({ length: count }, (_, i) => +((duration * (i + 0.5)) / count).toFixed(2));
const list = [];
times.forEach((t, i) => {
  const file = path.join(dir, `${String(i + 1).padStart(2, "0")}.png`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", path.resolve(video), "-frames:v", "1", "-vf", "scale=-2:640", file]);
  list.push(`file '${file.replace(/\\/g, "/")}'`);
});
writeFileSync(path.join(dir, "list.txt"), list.join("\n"));
const cols = Math.min(6, count);
const sheet = path.join(dir, "sheet.jpg");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"), "-filter_complex", `tile=${cols}x${Math.ceil(count / cols)}:padding=6:color=0x888888`, "-frames:v", "1", sheet]);

console.log(`Sheet: ${sheet}`);
times.forEach((t, i) => console.log(`${i + 1}\t--at ${t}`));
