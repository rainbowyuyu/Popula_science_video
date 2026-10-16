import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const out = path.join(root, 'delivery/nobel2026_v5_1');
const bundleDir = path.join(root, 'tmp/nobel2026-v51-slim-bundle');
fs.mkdirSync(out, {recursive: true});
fs.mkdirSync(bundleDir, {recursive: true});

execFileSync('python', [path.join(root,'scripts/prepare_nobel_v51_fonts.py')], {stdio:'inherit'});
const timeline = JSON.parse(fs.readFileSync(path.join(root, 'src/nobel2026/timeline-v51.json'), 'utf8').replace(/^\uFEFF/,''));
const entryPoint = path.join(root, 'src/index-nobel2026-v51.tsx');
const chrome = path.join(root, 'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
if (!fs.existsSync(entryPoint)) throw new Error(`Missing entry point: ${entryPoint}`);
if (!fs.existsSync(chrome)) throw new Error(`Missing Remotion Chrome: ${chrome}`);

// Stage only this composition's actual inputs, rather than cloning every film's
// public directory. Copies (not links) protect source assets from bundle cleanup.
const publicDir = path.join(root, 'tmp/nobel2026-v51-public');
const filmSource = fs.readFileSync(path.join(root, 'src/nobel2026/FilmV51.tsx'),'utf8');
const audioAsset = filmSource.match(/<Audio src=\{staticFile\('([^']+)'\)/)?.[1];
if (!audioAsset) throw new Error('Cannot resolve V5.1 master audio dependency');
const assets = [audioAsset, 'nobel2026/logo.png', 'nobel2026/fonts/sans.woff2',
  'nobel2026/fonts/serif.woff2', ...['POP_Fig_2.jpg','POP_Fig_3_ENG_01.jpg',
  'POP_Fig_4_ENG_01.jpg','POP_Fig_5_ENG_01.jpg'].map(f=>`nobel2026/${f}`)];
const dependencies = assets.map(asset=>{
  const source=path.join(root,'public',asset), destination=path.join(publicDir,asset);
  if (!fs.existsSync(source)) throw new Error(`Missing V5.1 input: ${asset}`);
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(source,destination);
  return {asset,source,bytes:fs.statSync(source).size,
    sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex')};
});
fs.writeFileSync(path.join(out,'render-dependencies.json'),JSON.stringify({
  composition:'NobelMedicine2026V51',entryPoint,assets:dependencies,
  totalBytes:dependencies.reduce((n,a)=>n+a.bytes,0),
},null,2));

const serveUrl = await bundle({
  entryPoint,
  publicDir,
  outDir: bundleDir,
});
const chromiumOptions = {gl: 'angle'};
const browser = await openBrowser('chrome', {browserExecutable: chrome, chromiumOptions});

const stills = process.argv.includes('stills');
const checks = process.argv.includes('checks');
const beats = process.argv.includes('beats');
const sampleArg = process.argv.find(arg=>arg.startsWith('--sample-frames='));
const sampleFrames = sampleArg ? sampleArg.slice('--sample-frames='.length).split(',').map(Number) : null;
const rangeArg = process.argv.find((arg) => arg.startsWith('--frames='));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const concurrencyArg = process.argv.find((arg) => arg.startsWith('--concurrency='));
const concurrency = Math.max(1, Number(concurrencyArg?.split('=')[1] ?? 1) || 1);
const range = rangeArg ? rangeArg.split('=')[1].split('-').map(Number) : null;
const inputProps = {audio: !stills && !checks && !beats && !sampleFrames};
const base = {
  serveUrl,
  browserExecutable: chrome,
  chromiumOptions,
  inputProps,
  puppeteerInstance: browser,
};

try {
  const composition = await selectComposition({...base, id: 'NobelMedicine2026V51'});

  if (stills || checks || beats || sampleFrames) {
    const folder = path.join(out, sampleFrames ? 'targeted' : beats ? 'beats' : stills ? 'stills' : 'checks');
    fs.mkdirSync(folder, {recursive: true});
    const samples = sampleFrames ? sampleFrames.map(frame=>({frame,label:`frame-${frame}`})) : beats ? timeline.clips.flatMap(c=>[.25,.75].map(q=>({frame:Math.floor(c.start+(c.end-c.start)*q),label:`${c.id}-${Math.round(q*100)}`}))) : checks
      ? timeline.scenes.flatMap((scene) => [0, 12, 36].map((offset) => ({scene, frame: Math.min(timeline.duration - 1, scene.start + offset), label: `${scene.id}-${offset}`})))
      : timeline.scenes.map((scene) => ({scene, frame: Math.floor(scene.start + (scene.end - scene.start) * 0.52), label: scene.id}));
    for (const sample of samples) {
      await renderStill({...base, inputProps: {audio: false}, composition, frame: sample.frame, output: path.join(folder, `${sample.label}.jpg`), imageFormat: 'jpeg', jpegQuality: 95});
      console.log(`still ${sample.label} frame=${sample.frame}`);
    }
  } else {
    const destination = outputArg
      ? path.resolve(outputArg.slice('--output='.length))
      : path.join(out, range ? 'preview-segment.mp4' : '一束蓝光能叫醒一颗神经元_v5_1_完整预览1080p.mp4');
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
    // Remotion's browser audio path can introduce encoder delay and extra
    // resampling. Full films use the exact selected master in one final encode.
    if (!range) {
      const muxed = destination.replace(/\.mp4$/i, '.master-mux.mp4');
      execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-y',
        '-i',destination,'-i',path.join(root,'public',audioAsset),
        '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac',
        '-b:a','320k','-ar','48000','-t',String(composition.durationInFrames/composition.fps),
        '-movflags','+faststart',muxed], {stdio:'inherit'});
      fs.renameSync(muxed,destination);
    }
    console.log(destination);
  }
} finally {
  await browser.close({silent: true});
}



