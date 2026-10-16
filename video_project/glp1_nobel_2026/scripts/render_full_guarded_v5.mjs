import {bundle} from '@remotion/bundler';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import {spawn} from 'node:child_process';

// Use the CommonJS renderer so its Chromium launch goes through this process's
// Launcher export. This hook changes no dependency files or system settings.
const require = createRequire(import.meta.url);
const HIGH_PERFORMANCE_GPU_FLAGS = Object.freeze([
  '--use-angle=d3d11', '--force_high_performance_gpu', '--enable-gpu'
]);
function preferHighPerformanceGPU() {
  if (process.platform !== 'win32') return {applied: false, restore() {}};
  const rendererRoot = path.dirname(require.resolve('@remotion/renderer'));
  const launcher = require(path.join(rendererRoot, 'browser/Launcher.js'));
  if (typeof launcher.launchChrome !== 'function') throw new Error('Installed Remotion does not expose the verified Chromium launcher');
  const original = launcher.launchChrome;
  const hooked = options => original({...options, args: [
    ...(options.args ?? []).filter(arg => !arg.startsWith('--use-angle=') && !HIGH_PERFORMANCE_GPU_FLAGS.includes(arg)),
    ...HIGH_PERFORMANCE_GPU_FLAGS
  ]});
  launcher.launchChrome = hooked;
  return {applied: true, restore() {if (launcher.launchChrome === hooked) launcher.launchChrome = original;}};
}

// Single full-length render. Candidate files are isolated; the delivery and
// its marker change only after verification. --validate-only never writes.
const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');
const OLD_SHA = 'cd708646f4815878d84f422bd4e3bb2a072178d8ffc760d96c556b3902d7ee21';
const requireValue = (value, message) => { if (!value) throw new Error(message); };
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const rel = file => path.relative(root, file).replaceAll(path.sep, '/');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const argv = process.argv.slice(2);
for (const arg of argv) requireValue(arg === '--validate-only' || ['--source-lock=', '--output-dir=', '--concurrency='].some(p => arg.startsWith(p)), `Unknown argument: ${arg}`);
function argument(name, fallback) {
  const found = argv.filter(a => a.startsWith(name + '='));
  requireValue(found.length <= 1, `Duplicate ${name}`);
  const value = found[0]?.slice(name.length + 1) ?? fallback;
  requireValue(value, `Required: ${name}=<path>`); return value;
}
function safe(value, exists = true) {
  requireValue(typeof value === 'string' && value.length > 0, 'Invalid path');
  const file = path.resolve(root, value);
  requireValue(file.startsWith(root + path.sep), `Path leaves project: ${value}`);
  for (let p = file; p !== root; p = path.dirname(p)) {
    if (!fs.existsSync(p)) continue;
    requireValue(!fs.lstatSync(p).isSymbolicLink(), `Linked path refused: ${p}`);
    const resolved = fs.realpathSync(p);
    requireValue(resolved.startsWith(root + path.sep), `Resolved path leaves project: ${p}`);
  }
  if (exists) requireValue(fs.existsSync(file), `Missing: ${value}`);
  return file;
}
function listFiles(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = safe(path.join(directory, entry.name));
    return entry.isDirectory() ? listFiles(file) : [file];
  }).sort();
}
function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-100000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve({stdout, stderr}) : reject(new Error(`${executable} failed (${code}): ${stderr.slice(-5000)}`)));
  });
}
const validateOnly = argv.includes('--validate-only');
const lockPath = safe(argument('--source-lock'));
const outputDir = safe(argument('--output-dir', 'tmp/v5-full-transparency-final'), false);
requireValue(outputDir.startsWith(path.join(root, 'tmp') + path.sep), 'Output directory must be under project tmp');
requireValue(outputDir !== path.join(root, 'tmp/bundle'), 'Use an independent bundle directory');
const concurrency = Number(argument('--concurrency', '3'));
requireValue(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 24, 'Concurrency must be 1–24');
const lock = read(lockPath), lockSHA = sha(lockPath), scriptSHA = sha(script);
const timelinePath = safe('src/timeline.json'), masterPath = safe('public/master.wav');
const delivery = safe('delivery/GLP1_V5_1080p.mp4');
const finalMarker = safe('tmp/final-render.json');
const retained = safe('tmp/v5-before-transparency-fix.mp4');
const archivedMarker = safe('research/revision-v5/transparency-repair/base/final-render.json');
// This workspace deliberately shares node_modules through a junction to the
// neighbouring topology project. Resolve its executable read-only; outputs
// and source snapshots still use the strict project path guard above.
const chrome = fs.realpathSync(path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe'));
const chromeSHA = sha(chrome);
const runningLock = safe('tmp/v5-full-render-running.lock', false);
const candidate = path.join(outputDir, 'GLP1_V5_1080p.candidate.mp4');
const candidateMarker = path.join(outputDir, 'candidate-render.json');
const validationFile = path.join(outputDir, 'validation.json');
const files = lock.files;
requireValue(Array.isArray(files) && files.length > 0, 'Source lock must contain files[] with path, sha256 and snapshot');
const expected = new Map();
for (const item of files) {
  requireValue(hex(item.sha256), `Invalid lock hash: ${item.path}`);
  const file = safe(item.path), key = rel(file), hash = item.sha256.toLowerCase();
  requireValue(!expected.has(key) || expected.get(key) === hash, `Conflicting lock entries: ${key}`);
  expected.set(key, hash);
  if (key.startsWith('src/') && key !== 'src/timeline.json') requireValue(item.snapshot, `Source snapshot missing: ${key}`);
}
const sourcePaths = listFiles(path.join(root, 'src')).map(rel);
for (const key of [...sourcePaths, 'package.json', 'package-lock.json', 'public/master.wav']) requireValue(expected.has(key), `Unfrozen required source: ${key}`);
const timeline = read(timelinePath), timelineSHA = expected.get('src/timeline.json'), masterSHA = expected.get('public/master.wav');
requireValue(timeline.duration === 25621 && timeline.fps === 30 && lock.frames === 25621 && lock.fps === 30, 'Expected complete 25,621-frame, 30 fps V5 timeline');
if (lock.timelineSHA256) requireValue(lock.timelineSHA256 === timelineSHA, 'Top-level timeline lock disagrees');
if (lock.masterSHA256) requireValue(lock.masterSHA256 === masterSHA, 'Top-level master lock disagrees');
const beforeMarkerSHA = sha(finalMarker), beforeArchivedSHA = sha(archivedMarker);
requireValue(sha(delivery) === OLD_SHA && sha(retained) === OLD_SHA, 'Current and retained videos must both be original cd708646 candidate');
requireValue(read(finalMarker).videoSHA256 === OLD_SHA && read(archivedMarker).videoSHA256 === OLD_SHA, 'Current/archive marker does not identify the retained cd708646 video');
requireValue(beforeMarkerSHA === beforeArchivedSHA, 'Current marker differs from archived baseline marker');
requireValue(!fs.existsSync(runningLock), `Another full render owns ${rel(runningLock)}`);
requireValue(!fs.existsSync(candidate) && !fs.existsSync(candidateMarker), 'Refusing to overwrite an existing candidate; select a fresh output directory');
requireValue(!fs.existsSync(outputDir)||fs.readdirSync(outputDir).length===0,'Output directory must be fresh or empty');
// Public assets are read by the bundle too. Track the full initial inventory,
// independent of whether the supplied source lock also lists every image/GLB.
const publicHashes = Object.fromEntries(listFiles(path.join(root, 'public')).map(file => [rel(file), sha(file)]));
const publicBytes = Object.keys(publicHashes).reduce((sum,file)=>sum+fs.statSync(path.join(root,file)).size,0);
// Remotion render-media creates its workingDir under os.tmpdir(), whereas
// our bundle, candidate, installation stage and decoded audit audio live on
// the project output volume. Keep the original allowance and add explicit
// temporary-media headroom; do not charge all render JPEGs to the project.
function diskAt(file) {
  let existing = file;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const resolved = fs.realpathSync(existing), disk = fs.statfsSync(resolved);
  return {path: file, existingPath: resolved, volumeRoot: path.parse(resolved).root,
    device: fs.statSync(resolved).dev, freeBytes: Number(disk.bavail)*Number(disk.bsize)};
}
const actualTempDirectory = fs.realpathSync(os.tmpdir());
const temporaryDisk = diskAt(actualTempDirectory), outputDisk = diskAt(outputDir);
const estimatedFrameBytes = timeline.duration*512*1024;
const estimatedTemporaryMediaBytes = 1024**3;
const estimatedEncodedCopyBytes = Math.max(1024**3, 2*fs.statSync(delivery).size);
const estimatedDecodedAuditBytes = 2*Math.ceil((timeline.duration/30+.065)*8000)*4;
const diskAllocations = [
  {...temporaryDisk, role: 'remotion-working-directory', components: {
    renderedJPEGFrames: estimatedFrameBytes,
    temporaryDecodedAudioAndEncodingHeadroom: estimatedTemporaryMediaBytes}},
  {...outputDisk, role: 'project-output-and-installation', components: {
    publicAssetCopy: publicBytes, candidateEncodedVideo: estimatedEncodedCopyBytes,
    installationOrColorRemuxCopy: estimatedEncodedCopyBytes,
    decodedAuditAudio: estimatedDecodedAuditBytes, outputHeadroom: 1024**3}}
];
const diskVolumes = [];
for (const allocation of diskAllocations) {
  allocation.estimatedPeakAdditionalBytes = Object.values(allocation.components).reduce((sum, bytes)=>sum+bytes,0);
  let volume = diskVolumes.find(item=>item.device===allocation.device);
  if (!volume) {
    volume = {device: allocation.device, volumeRoot: allocation.volumeRoot,
      freeBytes: allocation.freeBytes, estimatedPeakAdditionalBytes: 0, allocations: []};
    diskVolumes.push(volume);
  }
  volume.freeBytes = Math.min(volume.freeBytes, allocation.freeBytes);
  volume.estimatedPeakAdditionalBytes += allocation.estimatedPeakAdditionalBytes;
  volume.allocations.push(allocation);
}
const diskBudget = {actualTempDirectory, outputDirectory: outputDir,
  sameVolume: temporaryDisk.device===outputDisk.device, volumes: diskVolumes};
const freeDiskBytes = outputDisk.freeBytes;
const estimatedPeakAdditionalBytes = diskVolumes.reduce((sum, volume)=>sum+volume.estimatedPeakAdditionalBytes,0);
for (const volume of diskVolumes) requireValue(volume.freeBytes >= volume.estimatedPeakAdditionalBytes,
  `Insufficient disk on ${volume.volumeRoot}: need ${(volume.estimatedPeakAdditionalBytes/1024**3).toFixed(2)} GiB additional, have ${(volume.freeBytes/1024**3).toFixed(2)} GiB; diskBudget=${JSON.stringify(diskBudget)}`);
const freeMemoryBytes = os.freemem(), estimatedWorkerMemoryBytes=(2+concurrency*.8)*1024**3;
requireValue(freeMemoryBytes>=estimatedWorkerMemoryBytes, `Insufficient free RAM for concurrency ${concurrency}; reduce concurrency`);
function checkInputs(label) {
  requireValue(sha(script) === scriptSHA && sha(lockPath) === lockSHA, `${label}: runner or source lock changed`);
  requireValue(sha(chrome) === chromeSHA, `${label}: Chromium executable changed`);
  requireValue(JSON.stringify(listFiles(path.join(root, 'src')).map(rel)) === JSON.stringify(sourcePaths), `${label}: src inventory changed`);
  for (const item of files) {
    requireValue(sha(safe(item.path)) === item.sha256.toLowerCase(), `${label}: source changed: ${item.path}`);
    if (item.snapshot) requireValue(sha(safe(item.snapshot)) === (item.snapshotSHA256 ?? item.sha256).toLowerCase(), `${label}: snapshot changed: ${item.snapshot}`);
  }
  const currentPublic = listFiles(path.join(root, 'public')).map(rel);
  requireValue(JSON.stringify(currentPublic) === JSON.stringify(Object.keys(publicHashes)), `${label}: public asset inventory changed`);
  for (const [file, hash] of Object.entries(publicHashes)) requireValue(sha(safe(file)) === hash, `${label}: public asset changed: ${file}`);
  requireValue(sha(delivery) === OLD_SHA && sha(retained) === OLD_SHA, `${label}: existing delivery/retained video changed`);
  requireValue(sha(finalMarker) === beforeMarkerSHA && sha(archivedMarker) === beforeArchivedSHA, `${label}: existing/archive marker changed`);
}
checkInputs('preflight');
await Promise.all([command('ffmpeg', ['-version']), command('ffprobe', ['-version'])]);
console.log(JSON.stringify({mode: validateOnly ? 'read-only-preflight' : 'preflight', sourceLock: rel(lockPath), sourceLockSHA256: lockSHA, runnerSHA256: scriptSHA, sourceFiles: sourcePaths.length, lockedRecords: files.length, publicAssets: Object.keys(publicHashes).length, frames: timeline.duration, fps: 30, concurrency, audio: true, candidate: rel(candidate), freeDiskBytes, estimatedPeakAdditionalBytes, diskBudget, freeMemoryBytes, estimatedWorkerMemoryBytes, requestedGPUFlags: HIGH_PERFORMANCE_GPU_FLAGS, deliveryUnchanged: true}));
if (validateOnly) process.exit(0);

function save(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'}); }
const lockFd = fs.openSync(runningLock, 'wx');
fs.writeFileSync(lockFd, JSON.stringify({pid: process.pid, startedUTC: new Date().toISOString(), sourceLockSHA256: lockSHA, outputDir: rel(outputDir)}));
fs.closeSync(lockFd);
fs.mkdirSync(outputDir, {recursive: true});
let browser, installStarted = false, videoInstalled = false, markerInstalled = false;
let gpuHook;
const gpuSelection = {requestedFlags: HIGH_PERFORMANCE_GPU_FLAGS, processLocalHook: true,
  hookApplied: false, adapterCaptureStatus: 'not-started', actualGPU: null};
const start = Date.now();
async function recordActualGPU() {
  let timeout;
  try {
    requireValue(typeof browser?.connection?.send === 'function', 'Browser CDP connection is unavailable');
    const response = await Promise.race([
      browser.connection.send('SystemInfo.getInfo'),
      new Promise((_, reject) => {timeout = setTimeout(() => reject(new Error('SystemInfo.getInfo timed out')), 15000);})
    ]);
    const info = response?.value ?? response;
    requireValue(info?.gpu, 'SystemInfo.getInfo returned no GPU data');
    gpuSelection.actualGPU = info.gpu;
    gpuSelection.adapterCaptureStatus = 'captured';
  } catch (error) {
    gpuSelection.adapterCaptureStatus = 'unavailable';
    gpuSelection.adapterCaptureError = String(error.message ?? error);
  } finally {if (timeout) clearTimeout(timeout);}
  save(path.join(outputDir, 'gpu-adapter.json'), gpuSelection);
  console.log(JSON.stringify({stage: 'gpu-adapter', ...gpuSelection}));
}
async function probe(file) {
  const result = await command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  return JSON.parse(result.stdout);
}
async function ensureColor() {
  const before = (await probe(candidate)).streams.find(s => s.codec_type === 'video');
  if (['color_space', 'color_transfer', 'color_primaries'].every(key => before[key] === 'bt709')) return false;
  const corrected = path.join(outputDir, 'color-corrected.mp4');
  await command('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-n', '-i', candidate, '-map', '0', '-c', 'copy', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1', '-movflags', '+faststart+write_colr', corrected]);
  fs.renameSync(corrected, candidate); return true;
}
async function checkAudio() {
  const a = path.join(outputDir, 'candidate-audio.f32'), b = path.join(outputDir, 'master-audio.f32');
  await Promise.all([[candidate, a], [masterPath, b]].map(([input, output]) => command('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-n', '-i', input, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', output])));
  const bytesA = fs.readFileSync(a), bytesB = fs.readFileSync(b);
  const samplesA = new Float32Array(bytesA.buffer, bytesA.byteOffset, bytesA.length / 4), samplesB = new Float32Array(bytesB.buffer, bytesB.byteOffset, bytesB.length / 4);
  requireValue(Math.abs(samplesA.length - samplesB.length) <= 512, 'Decoded AAC/master sample duration differs by more than 64 ms');
  const n = Math.min(samplesA.length, samplesB.length), windows = [];
  let aa = 0, bb = 0, ab = 0, ee = 0;
  for (let offset = 0; offset < n; offset += 40000) {
    let wa = 0, wb = 0, wab = 0, we = 0; const end = Math.min(n, offset + 40000);
    for (let i = offset; i < end; i++) { const x = samplesA[i], y = samplesB[i]; wa += x*x; wb += y*y; wab += x*y; we += (x-y)*(x-y); }
    aa += wa; bb += wb; ab += wab; ee += we;
    if (wb > (end-offset)*1e-10) {
      const correlation = wab / Math.sqrt(wa*wb), normalizedRMSE = Math.sqrt(we/wb);
      windows.push({startSeconds: offset/8000, correlation, normalizedRMSE});
      requireValue(correlation >= .92 && normalizedRMSE <= .40, `AAC differs from master in window at ${offset/8000}s: corr=${correlation}, nRMSE=${normalizedRMSE}`);
    }
  }
  const correlation = ab/Math.sqrt(aa*bb), normalizedRMSE = Math.sqrt(ee/bb), gainDB = 10*Math.log10(aa/bb);
  requireValue(correlation >= .97 && normalizedRMSE <= .23 && Math.abs(gainDB) <= .75, 'Full decoded AAC does not sufficiently match locked master');
  return {method: 'Full-length decoded mono 8 kHz PCM, aligned sample comparison plus every non-silent 5-second window; AAC is lossy and not expected to hash-match WAV', masterSHA256: masterSHA, samplesAAC: samplesA.length, samplesMaster: samplesB.length, correlation, normalizedRMSE, gainDB, comparedWindows: windows.length, minimumWindowCorrelation: Math.min(...windows.map(w=>w.correlation)), maximumWindowNormalizedRMSE: Math.max(...windows.map(w=>w.normalizedRMSE))};
}
try {
  const bundled = await bundle({entryPoint: path.join(root, 'src/index.tsx'), publicDir: path.join(root, 'public'), outDir: path.join(outputDir, 'bundle')});
  checkInputs('after-bundle');
  requireValue(sha(path.join(outputDir, 'bundle/public/master.wav')) === masterSHA, 'Bundled master differs from lock');
  gpuHook = preferHighPerformanceGPU();
  gpuSelection.hookApplied = gpuHook.applied;
  const {renderMedia, openBrowser, selectComposition} = require('@remotion/renderer');
  browser = await openBrowser('chrome', {browserExecutable: chrome, chromiumOptions: {gl: 'angle'}});
  await recordActualGPU();
  const opts = {serveUrl: bundled, browserExecutable: chrome, puppeteerInstance: browser, chromiumOptions: {gl: 'angle'}, inputProps: {audio: true, clean: false}};
  const composition = await selectComposition({...opts, id: 'GLP1'});
  requireValue(composition.durationInFrames === 25621 && composition.fps === 30 && composition.width === 1920 && composition.height === 1080, 'Selected composition differs from locked full video');
  let last = -1;
  await renderMedia({...opts, composition, codec: 'h264', outputLocation: candidate, crf: 18, pixelFormat: 'yuv420p', colorSpace: 'bt709', audioCodec: 'aac', audioBitrate: '320k', sampleRate: 48000, videoImageFormat: 'jpeg', jpegQuality: 95, concurrency, timeoutInMilliseconds: 120000,
    onProgress: progress => {const percent = Math.floor(progress.progress*100); if (percent !== last) {for (let p=last+1;p<=percent;p++) console.log(`Render ${p}%`); last=percent;}}});
  await browser.close({silent: true}); browser = null;
  checkInputs('after-render');
  const colorRemuxed = await ensureColor();
  const metadata = await probe(candidate), video = metadata.streams.find(s=>s.codec_type==='video'), audio = metadata.streams.find(s=>s.codec_type==='audio');
  requireValue(metadata.streams.filter(s=>s.codec_type==='video').length===1 && metadata.streams.filter(s=>s.codec_type==='audio').length===1, 'Expected exactly one video and one audio stream');
  requireValue(video.codec_name==='h264' && video.width===1920 && video.height===1080 && video.pix_fmt==='yuv420p', 'Incorrect video format');
  requireValue(video.avg_frame_rate==='30/1' && Number(video.nb_frames)===25621, 'Video metadata frame count/fps mismatch');
  requireValue(['color_space','color_transfer','color_primaries'].every(key=>video[key]==='bt709'), 'BT709 verification failed');
  requireValue(audio.codec_name==='aac' && Number(audio.sample_rate)===48000 && Number(audio.channels)===2, 'Expected stereo 48 kHz AAC');
  requireValue(Math.abs(Number(video.duration)-25621/30)<.002 && Math.abs(Number(audio.duration)-25621/30)<.065, 'Video/audio duration mismatch');
  console.log('Verify: full video/audio decode');
  const decoded = await command('ffmpeg', ['-hide_banner','-nostdin','-v','error','-xerror','-hwaccel','none','-threads','2','-i',candidate,'-map','0:v:0','-map','0:a:0','-progress','pipe:1','-nostats','-f','null','-']);
  const decodedFrames = Math.max(...[...decoded.stdout.matchAll(/^frame=(\d+)\s*$/gm)].map(x=>Number(x[1])));
  requireValue(decodedFrames===25621 && /progress=end/.test(decoded.stdout), 'Full decode did not complete exactly 25,621 frames');
  console.log('Verify: complete AAC/master correspondence');
  const audioComparison = await checkAudio();
  checkInputs('before-install');
  requireValue(sha(path.join(outputDir,'bundle/public/master.wav'))===masterSHA, 'Bundled master changed during render');
  const videoSHA256=sha(candidate), validation={finishedUTC:new Date().toISOString(),automaticChecksPass:true,fullDecodeSuccess:true,decodedFrames,colorRemuxed,video,audio,audioComparison,diskBudget,gpuSelection,subjectiveVisualReviewCompleted:false,subjectiveAudioReviewCompleted:false};
  save(validationFile,validation);
  const marker={finished:new Date().toISOString(),frames:[0,25620],seconds:(Date.now()-start)/1000,outputLocation:delivery,success:true,timelineSHA256:timelineSHA,masterSHA256:masterSHA,videoSHA256,renderMode:'single-complete-remotion-render',singlePassRender:true,concurrency,sourceLock:rel(lockPath),sourceLockSHA256:lockSHA,runner:rel(script),runnerSHA256:scriptSHA,sourceHashes:Object.fromEntries(expected),publicAssetHashes:publicHashes,candidate:rel(candidate),validation:rel(validationFile),validationSHA256:sha(validationFile),previousVideoRetainedAt:rel(retained),previousVideoSHA256:OLD_SHA,previousMarkerArchive:rel(archivedMarker),previousMarkerArchiveSHA256:beforeArchivedSHA};
  save(candidateMarker,{...marker,outputLocation:candidate,installed:false});
  const videoStage=path.join(root,'delivery/.GLP1_V5_1080p.installing.mp4'),markerStage=path.join(root,'tmp/.final-render.installing.json');
  requireValue(!fs.existsSync(videoStage)&&!fs.existsSync(markerStage),'Stale installation staging files exist');
  fs.copyFileSync(candidate,videoStage,fs.constants.COPYFILE_EXCL);
  requireValue(sha(videoStage)===videoSHA256,'Installation staging copy failed hash verification');
  save(markerStage,marker);
  checkInputs('install-commit');
  installStarted=true;
  fs.renameSync(videoStage,delivery);videoInstalled=true;
  fs.renameSync(markerStage,finalMarker);markerInstalled=true;
  requireValue(sha(delivery)===videoSHA256&&read(finalMarker).videoSHA256===videoSHA256,'Installed pair verification failed');
  save(path.join(outputDir,'installed.json'),{installedUTC:new Date().toISOString(),video:rel(delivery),videoSHA256,marker:rel(finalMarker),markerSHA256:sha(finalMarker),retainedVideo:rel(retained),retainedVideoSHA256:sha(retained)});
  console.log(JSON.stringify({installed:true,video:rel(delivery),videoSHA256,decodedFrames,sourceLockSHA256:lockSHA,validation:rel(validationFile)}));
} catch (error) {
  // If the two-file installation cannot complete, restore the exact retained
  // pair. Candidate evidence stays available; an unverified film is not final.
  if (installStarted && (videoInstalled || markerInstalled)) {
    try {
      const restoreVideo=path.join(root,'delivery/.GLP1_V5_1080p.restoring.mp4'),restoreMarker=path.join(root,'tmp/.final-render.restoring.json');
      requireValue(sha(retained)===OLD_SHA&&sha(archivedMarker)===beforeArchivedSHA,'Rollback archive changed');
      fs.copyFileSync(retained,restoreVideo,fs.constants.COPYFILE_EXCL);fs.renameSync(restoreVideo,delivery);
      fs.copyFileSync(archivedMarker,restoreMarker,fs.constants.COPYFILE_EXCL);fs.renameSync(restoreMarker,finalMarker);
      requireValue(sha(delivery)===OLD_SHA&&sha(finalMarker)===beforeMarkerSHA,'Rollback pair failed verification');
    } catch (rollbackError) { error.message += `; ROLLBACK FAILED: ${rollbackError.message}`; }
  }
  fs.writeFileSync(path.join(outputDir,'failure.json'),JSON.stringify({failedUTC:new Date().toISOString(),error:String(error.stack??error),videoInstalled,markerInstalled,sourceLockSHA256:lockSHA},null,2));
  throw error;
} finally {
  if(browser)await browser.close({silent:true});
  gpuHook?.restore();
  if(fs.existsSync(runningLock)&&read(runningLock).pid===process.pid)fs.unlinkSync(runningLock);
}
