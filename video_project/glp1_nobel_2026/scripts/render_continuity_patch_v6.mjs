import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import {spawn} from 'node:child_process';

// Independent picture-only repair renderer. It never installs delivery files,
// changes the full-render marker, or infers approval from a missing source lock.
// Prepare the accepted candidate and its complete snapshot lock first, then:
// node scripts/render_continuity_patch_v6.mjs --validate-only --source-lock=...
// node scripts/render_continuity_patch_v6.mjs --render --source-lock=...
const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');
const require = createRequire(import.meta.url);
const BASE_VIDEO_SHA = 'c9f90b7b6c2f79a9238d38e82c752394c4faf1419eed40b36b30e4e2b164e8a4';
const BASE_MARKER_SHA = '306581ac194f30a340c454e07e03068c19bef14f8d887171c4c459f925d04d17';
const BASE_LOCK_SHA = 'a3b8069c8328526ef57580fe373f6c591fa118b9a160a73f6e2765d4fdd550c6';
const TIMELINE_SHA = 'e976021ce9b1a665ca54206e73898587efb33c6f91865eb22bb8b7ad0c71dfb0';
const MASTER_SHA = 'dec0de170d5796dadad56323e11041195049e3c0e4c365e4ed50f17fa15b1146';
const RANGES = Object.freeze([[12000, 12249], [20250, 20749]]);
const CHANGED_INPUTS = Object.freeze(['src/V5HandoffContext.ts', 'src/V5World.ts']);
const GPU_FLAGS = ['--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu'];
const fail = (ok, message) => {if (!ok) throw new Error(message);};
const hex = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const rel = file => path.relative(root, file).replaceAll(path.sep, '/');
const save = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
function safe(value, exists = true) {
  fail(typeof value === 'string' && value.length, 'Expected a project path');
  const file = path.resolve(root, value);
  fail(file.startsWith(root + path.sep), `Path leaves project: ${value}`);
  for (let p = file; p !== root; p = path.dirname(p)) {
    if (!fs.existsSync(p)) continue;
    fail(!fs.lstatSync(p).isSymbolicLink(), `Linked path refused: ${p}`);
    fail(fs.realpathSync(p).startsWith(root + path.sep), `Resolved path leaves project: ${p}`);
  }
  if (exists) fail(fs.existsSync(file), `Missing: ${value}`);
  return file;
}
function list(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = safe(path.join(directory, entry.name));
    return entry.isDirectory() ? list(file) : [file];
  }).sort();
}
function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', data => {stdout += data;});
    child.stderr.on('data', data => {stderr = (stderr + data).slice(-100000);});
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve({stdout, stderr}) : reject(new Error(`${executable} failed (${code}): ${stderr.slice(-8000)}`)));
  });
}
const argv = process.argv.slice(2);
for (const arg of argv) fail(['--render', '--validate-only', '--describe-plan'].includes(arg) || ['--source-lock=', '--output-dir=', '--concurrency='].some(p => arg.startsWith(p)), `Unknown argument: ${arg}`);
function argument(name, fallback) {
  const found = argv.filter(x => x.startsWith(name + '='));
  fail(found.length <= 1, `Duplicate ${name}`);
  return found[0]?.slice(name.length + 1) ?? fallback;
}
const modes = argv.filter(x => ['--render', '--validate-only', '--describe-plan'].includes(x));
fail(modes.length <= 1, 'Choose exactly one mode');
const mode = modes[0] ?? '--describe-plan';
const outputDir = safe(argument('--output-dir', 'tmp/v6-continuity-patches'), false);
fail(outputDir.startsWith(path.join(root, 'tmp') + path.sep), 'Output must be an isolated directory under tmp');
fail(!['tmp/bundle', 'tmp/v6-full-final'].includes(rel(outputDir)), 'Protected existing render directory');
const interfacePlan = {
  version: 'v6-continuity-silent-patches', baseVideoSHA256: BASE_VIDEO_SHA, baseMarkerSHA256: BASE_MARKER_SHA,
  timelineSHA256: TIMELINE_SHA, masterSHA256: MASTER_SHA, fps: 30, width: 1920, height: 1080,
  patches: RANGES.map(([start, end]) => ({frames: [start, end], frameCount: end - start + 1,
    video: rel(path.join(outputDir, `segment-${start}-${end}.mp4`)), marker: rel(path.join(outputDir, `segment-${start}-${end}.json`))})),
  encoding: {codec: 'h264', crf: 18, pixelFormat: 'yuv420p', colorSpace: 'bt709', videoImageFormat: 'jpeg', jpegQuality: 95},
  inputProps: {audio: false, clean: false}, muted: true, requiredGPU: 'NVIDIA GeForce RTX 5060',
  sourceLockRequired: true, outputStartsAtPTS: 0, installation: 'never; separate reviewed IDR composer owns installation'
};
if (mode === '--describe-plan') {console.log(JSON.stringify(interfacePlan, null, 2)); process.exit(0);}
const lockPath = safe(argument('--source-lock'));
const lock = read(lockPath), lockSHA = sha(lockPath), runnerSHA = sha(script);
fail(lockPath !== safe('research/revision-v6/final-source-lock.json'), 'Use a new patch source lock, not the base full-render lock');
const concurrency = Number(argument('--concurrency', '3'));
fail(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 8, 'Concurrency must be 1–8');
const baseVideo = safe('delivery/GLP1_V5_1080p.mp4'), baseMarkerPath = safe('tmp/final-render.json');
const baseLockPath = safe('research/revision-v6/final-source-lock.json');
const baseMarker = read(baseMarkerPath), baseLock = read(baseLockPath);
const timelinePath = safe('src/timeline.json'), masterPath = safe('public/master.wav');
const sourcePaths = [...list(safe('src')), ...list(safe('public')), safe('package.json'), safe('package-lock.json'), safe('docs/story-v5.json')].map(rel).sort();
const expected = new Map();
fail(Array.isArray(lock.files) && lock.files.length, 'Source lock must contain complete files[] and snapshots');
for (const item of lock.files) {
  const file = safe(item.path), key = rel(file);
  fail(hex(item.sha256) && !expected.has(key), `Invalid/duplicate source hash: ${key}`);
  fail(item.snapshot && safe(item.snapshot) !== file, `Missing independent snapshot: ${key}`);
  fail(!item.snapshotSHA256 || item.snapshotSHA256 === item.sha256, `Snapshot hash disagreement: ${key}`);
  expected.set(key, item.sha256);
}
for (const key of sourcePaths) fail(expected.has(key), `Unfrozen source/public input: ${key}`);
const sourceHashes = Object.fromEntries(expected);
fail(expected.get('src/timeline.json') === TIMELINE_SHA && expected.get('public/timeline.json') === TIMELINE_SHA && expected.get('public/master.wav') === MASTER_SHA, 'Patch source lock changes timeline or master');
fail(lock.frames === 25621 && lock.fps === 30, 'Patch source lock must describe all 25,621 frames at 30fps');
for (const [key, value] of [['timelineSHA256', TIMELINE_SHA], ['masterSHA256', MASTER_SHA]]) fail(!lock[key] || lock[key] === value, `Top-level ${key} disagrees`);
const baseSources = Object.fromEntries(baseLock.files.map(x => [x.path.replaceAll('\\', '/'), x.sha256]));
const sourceChanges = [...expected].filter(([p, h]) => baseSources[p] !== h).map(([p, h]) => ({path: p, beforeSHA256: baseSources[p] ?? null, afterSHA256: h}));
fail(JSON.stringify(sourceChanges.map(x => x.path).sort()) === JSON.stringify(CHANGED_INPUTS), 'This repair requires exactly the accepted V5World and V5HandoffContext changes');
fail(expected.size === 268 && Object.keys(baseSources).length === 268, 'Expected the complete 268-input source inventory');
fail(JSON.stringify([...expected.keys()].sort()) === JSON.stringify(Object.keys(baseSources).sort()), 'Patch lock source inventory must equal the c9 base inventory');
// The workspace has a known read-only node_modules junction. Resolve only the
// executable through it; output and source paths continue using safe().
const chrome = fs.realpathSync(path.join(root, 'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe'));
const chromeSHA = sha(chrome);
function checkInputs(label) {
  fail(sha(script) === runnerSHA && sha(lockPath) === lockSHA, `${label}: runner/source lock changed`);
  fail(sha(baseVideo) === BASE_VIDEO_SHA && sha(baseMarkerPath) === BASE_MARKER_SHA && sha(baseLockPath) === BASE_LOCK_SHA, `${label}: c9 baseline changed`);
  fail(baseMarker.success === true && baseMarker.videoSHA256 === BASE_VIDEO_SHA && baseMarker.timelineSHA256 === TIMELINE_SHA && baseMarker.masterSHA256 === MASTER_SHA, `${label}: c9 marker identity mismatch`);
  fail(baseMarker.sourceLockSHA256 === BASE_LOCK_SHA, `${label}: base source-lock ancestry mismatch`);
  fail(JSON.stringify(baseMarker.sourceHashes) === JSON.stringify(baseSources), `${label}: base marker/source lock maps disagree`);
  fail(sha(timelinePath) === TIMELINE_SHA && sha(masterPath) === MASTER_SHA, `${label}: timeline/master changed`);
  fail(sha(chrome) === chromeSHA, `${label}: Chromium executable changed`);
  const currentPaths = [...list(safe('src')), ...list(safe('public')), safe('package.json'), safe('package-lock.json'), safe('docs/story-v5.json')].map(rel).sort();
  fail(JSON.stringify(currentPaths) === JSON.stringify(sourcePaths), `${label}: source/public inventory changed`);
  for (const item of lock.files) {
    fail(sha(safe(item.path)) === item.sha256 && sha(safe(item.snapshot)) === item.sha256, `${label}: source or snapshot changed: ${item.path}`);
  }
}
const timeline = read(timelinePath);
fail(timeline.duration === 25621 && timeline.fps === 30, 'Unexpected composition timeline');
fail(!fs.existsSync(outputDir) || fs.readdirSync(outputDir).length === 0, 'Output directory must be fresh or empty; no overwrites');
const runningLock = safe('tmp/v6-continuity-patches-running.lock', false);
fail(!fs.existsSync(runningLock), 'Another continuity patch renderer owns the running lock');
const tempDir = path.join(outputDir, 'remotion-temp');
fail(process.platform === 'win32' && path.parse(tempDir).root.toLowerCase() === 'd:\\', 'This renderer requires D-drive TEMP on Windows');
const publicBytes = list(safe('public')).reduce((n, p) => n + fs.statSync(p).size, 0);
const disk = fs.statfsSync(root), freeBytes = Number(disk.bavail) * Number(disk.bsize);
const estimatedPeakBytes = publicBytes + 750 * 512 * 1024 + 2 * 1024 ** 3;
fail(freeBytes > estimatedPeakBytes, 'Insufficient D-drive space for bundle, JPEGs, patch video and remux headroom');
checkInputs('preflight');
if (mode === '--validate-only') {
  console.log(JSON.stringify({validated: true, noFilesWritten: true, ...interfacePlan, sourceLock: rel(lockPath), sourceLockSHA256: lockSHA, sourceChanges, concurrency, tempDir, freeBytes, estimatedPeakBytes}, null, 2));
  process.exit(0);
}
fs.mkdirSync(outputDir, {recursive: true});
save(runningLock, {pid: process.pid, startedUTC: new Date().toISOString(), outputDir: rel(outputDir), sourceLockSHA256: lockSHA});
let browser, launcher, originalLauncher;
const oldEnv = {TEMP: process.env.TEMP, TMP: process.env.TMP};
const startedUTC = new Date().toISOString();
async function probe(file, count = false) {
  return JSON.parse((await command('ffprobe', ['-v', 'error', ...(count ? ['-count_frames'] : []), '-show_streams', '-show_format', '-of', 'json', file])).stdout);
}
async function ensureColor(file) {
  const before = (await probe(file)).streams.find(s => s.codec_type === 'video');
  if (before.color_space === 'bt709' && before.color_transfer === 'bt709' && before.color_primaries === 'bt709' && before.color_range === 'tv') return {repaired: false, streamCopy: false};
  const corrected = file.replace(/\.mp4$/, '.bt709.mp4');
  await command('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-n', '-i', file, '-map', '0:v:0', '-an', '-c:v', 'copy', '-color_range', 'tv', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0', '-movflags', '+faststart+write_colr', corrected]);
  const retained = file.replace(/\.mp4$/, '.before-color.mp4');
  fail(!fs.existsSync(retained), 'Unexpected existing color archive');
  fs.renameSync(file, retained); fs.renameSync(corrected, file);
  return {repaired: true, streamCopy: true, retained: rel(retained), retainedSHA256: sha(retained)};
}
try {
  fs.mkdirSync(tempDir);
  process.env.TEMP = tempDir; process.env.TMP = tempDir;
  fail(fs.realpathSync(os.tmpdir()) === fs.realpathSync(tempDir), 'Remotion TEMP did not move to the D-drive output directory');
  save(path.join(outputDir, 'render-plan.json'), {...interfacePlan, sourceLock: rel(lockPath), sourceLockSHA256: lockSHA, sourceChanges, runner: rel(script), runnerSHA256: runnerSHA, concurrency, tempDir});
  fs.copyFileSync(baseMarkerPath, path.join(outputDir, 'base-final-render.json'), fs.constants.COPYFILE_EXCL);
  fail(sha(path.join(outputDir, 'base-final-render.json')) === BASE_MARKER_SHA, 'Archived c9 marker differs');
  const {bundle} = await import('@remotion/bundler');
  const bundleDir = path.join(outputDir, 'bundle');
  const serveUrl = await bundle({entryPoint: safe('src/index.tsx'), publicDir: safe('public'), outDir: bundleDir});
  checkInputs('after-bundle');
  for (const p of list(safe('public'))) fail(sha(path.join(bundleDir, rel(p))) === sha(p), `Bundled public file differs: ${rel(p)}`);
  launcher = require(path.join(path.dirname(require.resolve('@remotion/renderer')), 'browser/Launcher.js'));
  originalLauncher = launcher.launchChrome;
  fail(typeof originalLauncher === 'function', 'Remotion Chrome launcher not found');
  launcher.launchChrome = options => originalLauncher({...options, args: [...(options.args ?? []).filter(x => !x.startsWith('--use-angle=') && !GPU_FLAGS.includes(x)), ...GPU_FLAGS]});
  const {renderMedia, openBrowser, selectComposition} = require('@remotion/renderer');
  browser = await openBrowser('chrome', {browserExecutable: chrome, chromiumOptions: {gl: 'angle'}});
  let timer;
  const gpuResponse = await Promise.race([browser.connection.send('SystemInfo.getInfo'), new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('GPU inspection timed out')), 15000);})]).finally(() => clearTimeout(timer));
  const gpu = (gpuResponse.value ?? gpuResponse).gpu;
  save(path.join(outputDir, 'gpu-adapter.json'), {requestedFlags: GPU_FLAGS, actualGPU: gpu, required: 'NVIDIA GeForce RTX 5060'});
  fail(/NVIDIA.*RTX 5060/i.test(gpu?.auxAttributes?.glRenderer ?? ''), 'Active WebGL renderer is not the required RTX 5060');
  const opts = {serveUrl, browserExecutable: chrome, puppeteerInstance: browser, chromiumOptions: {gl: 'angle'}, inputProps: {audio: false, clean: false}};
  const composition = await selectComposition({...opts, id: 'GLP1'});
  fail(composition.durationInFrames === 25621 && composition.fps === 30 && composition.width === 1920 && composition.height === 1080, 'Selected composition differs from the c9 format');
  const baseProbe = (await probe(baseVideo)).streams.find(s => s.codec_type === 'video');
  const completed = [];
  for (const [start, end] of RANGES) {
    checkInputs(`before-${start}`);
    const video = path.join(outputDir, `segment-${start}-${end}.mp4`), markerPath = path.join(outputDir, `segment-${start}-${end}.json`);
    const log = path.join(outputDir, `segment-${start}-${end}.log`), began = Date.now();
    fs.writeFileSync(log, '', {flag: 'wx'});
    let last = -1;
    await renderMedia({...opts, composition, codec: 'h264', crf: 18, pixelFormat: 'yuv420p', colorSpace: 'bt709', muted: true, videoImageFormat: 'jpeg', jpegQuality: 95, outputLocation: video, frameRange: [start, end], concurrency, timeoutInMilliseconds: 120000,
      onProgress: p => {const pc = Math.floor(p.progress * 100); if (pc !== last) {last = pc; const line = `${new Date().toISOString()} ${start}-${end} ${pc}%`; console.log(line); fs.appendFileSync(log, line + '\n');}}});
    const colorRepair = await ensureColor(video);
    const info = await probe(video, true), streams = info.streams, v = streams.find(s => s.codec_type === 'video');
    fail(streams.length === 1 && v, 'Patch must contain exactly one video stream and no audio');
    for (const key of ['codec_name', 'profile', 'level', 'width', 'height', 'pix_fmt', 'has_b_frames', 'r_frame_rate', 'color_space', 'color_transfer', 'color_primaries', 'color_range']) fail(v[key] === baseProbe[key], `Patch/base codec mismatch ${key}: ${v[key]} vs ${baseProbe[key]}`);
    fail(v.codec_name === 'h264' && v.width === 1920 && v.height === 1080 && v.pix_fmt === 'yuv420p' && v.r_frame_rate === '30/1' && Number(v.nb_read_frames) === end - start + 1, 'Patch frame count or format mismatch');
    fail(Number(v.start_time) === 0 && Number(info.format.start_time) === 0, 'Patch must start at PTS zero');
    fail(v.color_space === 'bt709' && v.color_transfer === 'bt709' && v.color_primaries === 'bt709' && v.color_range === 'tv', 'Patch must use BT709 limited range');
    await command('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-i', video, '-map', '0:v:0', '-f', 'null', '-']);
    checkInputs(`after-${start}`);
    const marker = {finished: new Date().toISOString(), frames: [start, end], frameCount: end - start + 1, fps: 30, width: 1920, height: 1080, seconds: (Date.now() - began) / 1000, outputLocation: video, success: true, silent: true, audioIncluded: false, audioStreamCount: 0,
      inputProps: {audio: false, clean: false}, muted: true, timelineSHA256: TIMELINE_SHA, masterSHA256: MASTER_SHA, videoSHA256: sha(video), sourceLock: rel(lockPath), sourceLockSHA256: lockSHA, sourceHashes, sourceChanges,
      baseVideo: rel(baseVideo), baseVideoSHA256: BASE_VIDEO_SHA, baseMarker: rel(path.join(outputDir, 'base-final-render.json')), baseMarkerSHA256: BASE_MARKER_SHA, originalBaseMarker: rel(baseMarkerPath), baseSourceLock: rel(baseLockPath), baseSourceLockSHA256: BASE_LOCK_SHA,
      runner: rel(script), runnerSHA256: runnerSHA, renderPlan: rel(path.join(outputDir, 'render-plan.json')), renderPlanSHA256: sha(path.join(outputDir, 'render-plan.json')), renderMode: 'remotion-v6-continuity-silent-patch', encoding: interfacePlan.encoding,
      videoProbe: v, fullDecodeSuccess: true, startsAtPTSZero: true, colorRepair, gpuAdapter: rel(path.join(outputDir, 'gpu-adapter.json')), gpuAdapterSHA256: sha(path.join(outputDir, 'gpu-adapter.json')), activeGLRenderer: gpu.auxAttributes.glRenderer, temporaryDirectory: tempDir, chromeSHA256: chromeSHA, concurrency};
    save(markerPath, marker); completed.push({frames: [start, end], video: rel(video), videoSHA256: marker.videoSHA256, marker: rel(markerPath), markerSHA256: sha(markerPath)});
    console.log(JSON.stringify({completed: [start, end], videoSHA256: marker.videoSHA256}));
  }
  checkInputs('complete');
  save(path.join(outputDir, 'patches-complete.json'), {success: true, startedUTC, finishedUTC: new Date().toISOString(), baseVideoSHA256: BASE_VIDEO_SHA, baseMarkerSHA256: BASE_MARKER_SHA, sourceLock: rel(lockPath), sourceLockSHA256: lockSHA, patches: completed, deliveryModified: false});
} catch (error) {
  save(path.join(outputDir, 'failure.json'), {failedUTC: new Date().toISOString(), error: String(error.stack ?? error), sourceLockSHA256: lockSHA, baseVideoSHA256: BASE_VIDEO_SHA});
  throw error;
} finally {
  try {if (browser) await browser.close({silent: true});}
  finally {
    if (launcher && originalLauncher) launcher.launchChrome = originalLauncher;
    for (const key of ['TEMP', 'TMP']) {if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];}
    if (fs.existsSync(runningLock) && read(runningLock).pid === process.pid) fs.unlinkSync(runningLock);
  }
}
