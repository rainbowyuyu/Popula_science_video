import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition, openBrowser} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'output-v21-warm-creek');
const work = path.join(outputRoot, 'work');
fs.mkdirSync(work, {recursive: true});
const emptyPublic = path.join(work, 'empty-public'); fs.mkdirSync(emptyPublic, {recursive: true});
const bundleDir = path.join(work, 'bundle-' + Date.now());
const bundled = await bundle({entryPoint: path.join(root, 'src/index-warm-creek.tsx'), publicDir: emptyPublic, outDir: bundleDir});
const bundlePublic = path.join(bundleDir, 'public');
if (fs.existsSync(bundlePublic)) fs.rmSync(bundlePublic, {recursive: true, force: true});
fs.symlinkSync(path.join(root, 'public'), bundlePublic, 'junction');
const browserPath = path.resolve(root, 'work', 'render-browser-v10', 'chrome-headless-shell.exe');
const browser = await openBrowser('chrome', {browserExecutable: browserPath, chromiumOptions: {gl: 'angle'}});
try {
  const opts = {serveUrl: bundled, browserExecutable: browserPath, chromiumOptions: {gl: 'angle'}, timeoutInMilliseconds: 120000};
  const composition = await selectComposition({...opts, id: 'WarmCreekDemo'});
  const outArg = process.argv.find((x) => x.startsWith('--output='));
  const output = outArg ? outArg.slice('--output='.length) : path.join(outputRoot, 'delivery', '温馨溪流_Opus55风格试片_1080p.mp4');
  fs.mkdirSync(path.dirname(output), {recursive: true});
  await renderMedia({...opts, composition, codec: 'h264', outputLocation: output, crf: 18, pixelFormat: 'yuv420p', colorSpace: 'bt709', concurrency: 2, onProgress: (p) => { if (Math.floor(p.progress * 100) % 5 === 0) process.stdout.write(`\r${Math.floor(p.progress * 100)}%`); }});
  process.stdout.write(`\n${output}\n`);
} finally { await browser.close({silent: true}); }

