/**
 * Memory-safe V02 renderer.
 *
 * Remotion can render the composition in one pass, but a five-minute Canvas
 * film plus five OffthreadVideo plates eventually grows Chrome's surface
 * cache. Render fixed frame ranges, concatenate the video-only chunks, then
 * add the mastered audio exactly once.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const timeline = JSON.parse(fs.readFileSync(path.join(root, 'src/physics2026/timeline-v03.json'), 'utf8').replace(/^\uFEFF/, ''));
const duration = Number(timeline.duration);
const fps = Number(timeline.fps);
const chunkArg = process.argv.find((arg) => arg.startsWith('--chunk-size='));
const chunkSize = Math.max(300, Number(chunkArg?.slice('--chunk-size='.length) || 1500));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const audioArg = process.argv.find((arg) => arg.startsWith('--audio='));
const audioPath = path.resolve(root, audioArg?.slice('--audio='.length) || 'public/audio-v04/master.wav');
if (!fs.existsSync(audioPath)) throw new Error(`Missing audio file: ${audioPath}`);
const finalPath = path.resolve(root, outputArg?.slice('--output='.length) || 'delivery/physics2026_v05/2026诺贝尔物理学奖_一束蓝光穿过南极冰_v05_自然语速1080p.mp4');
const work = path.join(root, 'tmp/physics2026-v05-chunks');
fs.rmSync(work, {recursive: true, force: true});
fs.mkdirSync(work, {recursive: true});

const chunks = [];
for (let start = 0; start < duration; start += chunkSize) {
  const end = Math.min(duration - 1, start + chunkSize - 1);
  const file = path.join(work, `chunk-${String(start).padStart(5, '0')}-${String(end).padStart(5, '0')}.mp4`);
  console.log(`Rendering frames ${start}-${end}`);
  let completed = false;
  let lastError;
  for (let attempt = 1; attempt <= 3 && !completed; attempt++) {
    try {
      execFileSync(process.execPath, ['scripts/render_physics2026_v03.mjs', `--frames=${start}-${end}`, `--output=${file}`], {cwd: root, stdio: 'inherit'});
      completed = true;
    } catch (error) {
      lastError = error;
      if (attempt < 3) console.warn(`Chunk ${start}-${end} failed; retry ${attempt + 1}/3`);
    }
  }
  if (!completed) throw lastError;
  chunks.push(file);
}

const concatList = path.join(work, 'concat.txt');
fs.writeFileSync(concatList, chunks.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n') + '\n', 'utf8');
const videoOnly = path.join(work, 'video-only.mp4');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', videoOnly], {cwd: root, stdio: 'inherit'});
fs.mkdirSync(path.dirname(finalPath), {recursive: true});
execFileSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y', '-i', videoOnly,
  '-i', audioPath,
  '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
  '-t', String(duration / fps), '-movflags', '+faststart', finalPath,
], {cwd: root, stdio: 'inherit'});
fs.rmSync(work, {recursive: true, force: true});
console.log(finalPath);

