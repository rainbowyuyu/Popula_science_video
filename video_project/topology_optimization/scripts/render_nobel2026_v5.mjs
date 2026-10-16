import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const out = path.join(root, 'delivery/nobel2026_v5');
const bundleDir = path.join(root, 'tmp/nobel2026-v5-bundle');
fs.mkdirSync(out, {recursive: true});
fs.mkdirSync(bundleDir, {recursive: true});

const timeline = JSON.parse(fs.readFileSync(path.join(root, 'src/nobel2026/timeline-v5.json'), 'utf8'));
const entryPoint = path.join(root, 'src/index-nobel2026-v5.tsx');
const chrome = path.join(root, 'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
if (!fs.existsSync(entryPoint)) throw new Error(`Missing entry point: ${entryPoint}`);
if (!fs.existsSync(chrome)) throw new Error(`Missing Remotion Chrome: ${chrome}`);

const serveUrl = await bundle({
  entryPoint,
  publicDir: path.join(root, 'public'),
  outDir: bundleDir,
});
const chromiumOptions = {gl: 'angle'};
const browser = await openBrowser('chrome', {browserExecutable: chrome, chromiumOptions});

const stills = process.argv.includes('stills');
const checks = process.argv.includes('checks');
const rangeArg = process.argv.find((arg) => arg.startsWith('--frames='));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const concurrencyArg = process.argv.find((arg) => arg.startsWith('--concurrency='));
const concurrency = Math.max(1, Number(concurrencyArg?.split('=')[1] ?? 1) || 1);
const range = rangeArg ? rangeArg.split('=')[1].split('-').map(Number) : null;
const inputProps = {audio: !stills && !checks};
const base = {
  serveUrl,
  browserExecutable: chrome,
  chromiumOptions,
  inputProps,
  puppeteerInstance: browser,
};

try {
  const composition = await selectComposition({...base, id: 'NobelMedicine2026V5'});

  if (stills || checks) {
    const folder = path.join(out, stills ? 'stills' : 'checks');
    fs.mkdirSync(folder, {recursive: true});
    const samples = checks
      ? timeline.scenes.flatMap((scene) => [0, 12, 36].map((offset) => ({scene, frame: Math.min(timeline.duration - 1, scene.start + offset), label: `${scene.id}-${offset}`})))
      : timeline.scenes.map((scene) => ({scene, frame: Math.floor(scene.start + (scene.end - scene.start) * 0.52), label: scene.id}));
    for (const sample of samples) {
      await renderStill({...base, inputProps: {audio: false}, composition, frame: sample.frame, output: path.join(folder, `${sample.label}.jpg`), imageFormat: 'jpeg', jpegQuality: 95});
      console.log(`still ${sample.label} frame=${sample.frame}`);
    }
  } else {
    const destination = outputArg
      ? path.resolve(outputArg.slice('--output='.length))
      : path.join(out, range ? 'preview-segment.mp4' : '一束蓝光能叫醒一颗神经元_v5_完整预览1080p.mp4');
    const options = {
      ...base,
      composition,
      codec: 'h264',
      outputLocation: destination,
      crf: 18,
      videoImageFormat: 'jpeg',
      jpegQuality: 94,
      concurrency,
      timeoutInMilliseconds: 120000,
      ...(range ? {frameRange: range} : {}),
      onProgress: (progress) => {
        const bucket = Math.floor(progress.progress * 20);
        if (bucket !== options._lastBucket) {
          options._lastBucket = bucket;
          console.log(`Render ${bucket * 5}% (${progress.renderedFrames ?? 0} frames)`);
        }
      },
    };
    await renderMedia(options);
    console.log(destination);
  }
} finally {
  await browser.close({silent: true});
}


