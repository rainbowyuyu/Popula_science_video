import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const v2 = path.join(project, 'v2');
const delivery = path.join(v2, 'delivery');
fs.mkdirSync(delivery, {recursive: true});
const timeline = JSON.parse(fs.readFileSync(path.join(v2, 'src', 'timeline.json'), 'utf8'));
// Keep the V2 static tree self-contained so a clean render cannot accidentally
// pick up the legacy project's audio or media files.
const bundlePath = await bundle({entryPoint: path.join(v2, 'src', 'index.tsx'), publicDir: path.join(v2, 'public'), outDir: path.join(v2, 'tmp-bundle')});
const wantsAudio = process.argv.includes('--audio');
const audioPath = path.join(v2, 'public', 'audio', 'master.wav');
if (wantsAudio && !fs.existsSync(audioPath)) {
  throw new Error(`V2 audio is missing: ${audioPath}. Run v2/scripts/mix_v2.py after voice generation.`);
}
const chrome = path.join(project, 'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser = await openBrowser('chrome', {browserExecutable: chrome, chromiumOptions: {gl: 'angle'}});
const options = {serveUrl: bundlePath, browserExecutable: chrome, chromiumOptions: {gl: 'angle'}, inputProps: {audio: wantsAudio}, puppeteerInstance: browser};
const composition = await selectComposition({...options, id: 'DNAStorageAlgorithmsV2'});
// Three.js paper textures are loaded asynchronously by TextureLoader. Give
// the browser a short settling window before the first still/video frame so
// evidence pages are decoded instead of capturing their backing boards.
await new Promise((resolve) => setTimeout(resolve, 1200));
if (process.argv.includes('--stills')) {
  for (const shot of timeline.shots) {
    const frame = Math.floor(((shot.startSec + shot.endSec) / 2) * timeline.fps);
    await renderStill({...options, composition, frame, output: path.join(delivery, `${shot.id}.jpg`), imageFormat: 'jpeg', jpegQuality: 92});
    console.log(`still ${shot.id} ${frame}`);
  }
} else {
  const range = process.argv.find((arg) => arg.startsWith('--frames='));
  const frameRange = range ? range.slice(9).split('-').map(Number) : undefined;
  const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
  const output = outputArg ? path.resolve(project, outputArg.slice('--output='.length)) : path.join(delivery, 'DNA存储与生信算法_V2_1080p.mp4');
  await renderMedia({
    ...options,
    composition,
    codec: 'h264',
    outputLocation: output,
    crf: 18,
    videoImageFormat: 'jpeg',
    jpegQuality: 92,
    concurrency: 4,
    timeoutInMilliseconds: 90000,
    ...(frameRange ? {frameRange} : {}),
    onProgress: (p) => { if (Math.floor(p.progress * 20) !== Math.floor((p.progress - 0.0001) * 20)) console.log(`render ${Math.floor(p.progress * 100)}%`); },
  });
  console.log(output);
}
await browser.close({silent: true});
