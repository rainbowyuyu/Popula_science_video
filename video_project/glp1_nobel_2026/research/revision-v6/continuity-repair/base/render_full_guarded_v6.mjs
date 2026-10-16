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
const OLD_SHA = 'dfa2d9a89817f74a5a436b5a4acae48334700ef92f5068676cb65c167f705ccb';
const OLD_MARKER_SHA = 'aa54fc81959c293a87f1a8498851fe03dbccfe57c685c066d91fcb2de7c96f34';
const OLD_PROVENANCE_SHA = '446b4843f67d971041f42d59cfb8a0db8b782c42e5095d6acce8bf7c92b68a34';
const OLD_PLAN_SHA = '475c61b20ea706748b6d5577b422cc54b106b9a4bdda6b3127a395058bed84c0';
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
const outputDir = safe(argument('--output-dir', 'tmp/v6-full-final'), false);
requireValue(outputDir.startsWith(path.join(root, 'tmp') + path.sep), 'Output directory must be under project tmp');
requireValue(outputDir !== path.join(root, 'tmp/bundle'), 'Use an independent bundle directory');
const concurrency = Number(argument('--concurrency', '3'));
requireValue(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 24, 'Concurrency must be 1–24');
const lock = read(lockPath), lockSHA = sha(lockPath), scriptSHA = sha(script);
const timelinePath = safe('src/timeline.json'), masterPath = safe('public/master.wav');
const delivery = safe('delivery/GLP1_V5_1080p.mp4');
const finalMarker = safe('tmp/final-render.json');
const retained = safe('tmp/v5-before-v6-full.mp4');
const archivedMarker = safe('research/revision-v6/base/final-render.json');
const baselinePath = safe('research/revision-v6/base/baseline.json');
const archivedProvenance = safe('research/revision-v6/base/previous-patch-render-provenance.json');
const archivedPlan = safe('research/revision-v6/base/previous-patch-plan.json');
const baselineSHA = sha(baselinePath);
function checkBaseline(label) {
  requireValue(sha(baselinePath)===baselineSHA, label+': baseline manifest changed');
  const baseline=read(baselinePath), prior=read(archivedProvenance), old=read(archivedMarker);
  requireValue(baseline.version==='v6-frozen-delivery-baseline'&&baseline.baseVideoSHA256===OLD_SHA
    &&baseline.baseMarkerSHA256===OLD_MARKER_SHA&&baseline.frames===25621&&baseline.fps===30,
    label+': baseline identity mismatch');
  requireValue(sha(archivedProvenance)===OLD_PROVENANCE_SHA&&sha(archivedPlan)===OLD_PLAN_SHA,
    label+': prior composition archives changed');
  requireValue(prior.state==='complete'&&JSON.stringify(prior.finalRenderMarker)===JSON.stringify(old)
    &&JSON.stringify(prior.plan)===JSON.stringify(read(archivedPlan)),label+': prior composed lineage disagreement');
  const targets=new Map([
    ['tmp/v5-before-v6-full.mp4',OLD_SHA],
    ['research/revision-v6/base/final-render.json',OLD_MARKER_SHA],
    ['research/revision-v6/base/previous-patch-plan.json',OLD_PLAN_SHA],
    ['research/revision-v6/base/previous-patch-render-provenance.json',OLD_PROVENANCE_SHA]
  ]);
  requireValue(Array.isArray(baseline.files)&&baseline.files.length===targets.size,label+': baseline archive list mismatch');
  const seen=new Set();
  for(const record of baseline.files) {
    requireValue(!seen.has(record.archive)&&targets.get(record.archive)===record.sha256,label+': unexpected baseline archive');
    seen.add(record.archive);requireValue(sha(safe(record.archive))===record.sha256,label+': baseline archive hash mismatch');
  }
}
// This workspace deliberately shares node_modules through a junction to the
// neighbouring topology project. Resolve its executable read-only; outputs
// and source snapshots still use the strict project path guard above.
const chrome = fs.realpathSync(path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe'));
const chromeSHA = sha(chrome);
const runningLock = safe('tmp/v6-full-render-running.lock', false);
const silent = path.join(outputDir, 'silent.mp4');
const candidate = path.join(outputDir, 'GLP1_V5_1080p.candidate.mp4');
const candidateMarker = path.join(outputDir, 'candidate-render.json');
const validationFile = path.join(outputDir, 'validation.json');
const files = lock.files;
requireValue(Array.isArray(files) && files.length > 0, 'Source lock must contain files[] with path, sha256 and snapshot');
const expected = new Map();
for (const item of files) {
  requireValue(hex(item.sha256), `Invalid lock hash: ${item.path}`);
  const file = safe(item.path), key = rel(file), hash = item.sha256.toLowerCase();
  requireValue(!expected.has(key), `Duplicate lock entry: ${key}`);
  expected.set(key, hash);
  requireValue(item.snapshot, `Input snapshot missing: ${key}`);
  requireValue(safe(item.snapshot)!==file, `Snapshot must be an independent retained file: ${key}`);
  requireValue(!item.snapshotSHA256||item.snapshotSHA256.toLowerCase()===hash,
    `Snapshot hash must equal its input hash: ${key}`);
}
const sourcePaths = listFiles(path.join(root, 'src')).map(rel);
for (const key of [...sourcePaths, 'package.json', 'package-lock.json', 'docs/story-v5.json', ...listFiles(path.join(root,'public')).map(rel)]) requireValue(expected.has(key), `Unfrozen required input: ${key}`);
const timeline = read(timelinePath), timelineSHA = expected.get('src/timeline.json'), masterSHA = expected.get('public/master.wav');
requireValue(timeline.duration === 25621 && timeline.fps === 30 && lock.frames === 25621 && lock.fps === 30, 'Expected complete 25,621-frame, 30 fps V5 timeline');
if (lock.timelineSHA256) requireValue(lock.timelineSHA256 === timelineSHA, 'Top-level timeline lock disagrees');
if (lock.masterSHA256) requireValue(lock.masterSHA256 === masterSHA, 'Top-level master lock disagrees');
if (lock.storySHA256) requireValue(lock.storySHA256 === expected.get('docs/story-v5.json'), 'Top-level story lock disagrees');
requireValue(expected.get('public/timeline.json')===timelineSHA,'Public and source timelines differ in source lock');
const beforeMarkerSHA = sha(finalMarker), beforeArchivedSHA = sha(archivedMarker);
requireValue(sha(delivery) === OLD_SHA && sha(retained) === OLD_SHA, 'Current and retained videos must both be the frozen dfa2 composition');
requireValue(read(finalMarker).videoSHA256 === OLD_SHA && read(archivedMarker).videoSHA256 === OLD_SHA, 'Current/archive marker does not identify the frozen dfa2 video');
requireValue(beforeMarkerSHA === OLD_MARKER_SHA && beforeArchivedSHA === OLD_MARKER_SHA, 'Current/archive marker differs from the pinned baseline marker');
checkBaseline('preflight');
requireValue(!fs.existsSync(runningLock), `Another full render owns ${rel(runningLock)}`);
requireValue(!fs.existsSync(silent) && !fs.existsSync(candidate) && !fs.existsSync(candidateMarker), 'Refusing to overwrite existing silent/candidate output; select a fresh output directory');
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
    publicAssetCopy: publicBytes, silentEncodedVideo: estimatedEncodedCopyBytes,
    optionalSilentColorArchive: estimatedEncodedCopyBytes, candidateEncodedVideo: estimatedEncodedCopyBytes,
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
    requireValue(sha(safe(item.snapshot)) === item.sha256.toLowerCase(), `${label}: snapshot changed: ${item.snapshot}`);
  }
  const currentPublic = listFiles(path.join(root, 'public')).map(rel);
  requireValue(JSON.stringify(currentPublic) === JSON.stringify(Object.keys(publicHashes)), `${label}: public asset inventory changed`);
  for (const [file, hash] of Object.entries(publicHashes)) requireValue(sha(safe(file)) === hash, `${label}: public asset changed: ${file}`);
  requireValue(sha(delivery) === OLD_SHA && sha(retained) === OLD_SHA, `${label}: existing delivery/retained video changed`);
  requireValue(sha(finalMarker) === beforeMarkerSHA && sha(archivedMarker) === beforeArchivedSHA, `${label}: existing/archive marker changed`);
  checkBaseline(label);
}
function checkBundledPublic(label) {
  const bundledPublic=path.join(outputDir,'bundle/public');
  const inventory=listFiles(bundledPublic).map(file=>'public/'+path.relative(bundledPublic,file).replaceAll(path.sep,'/'));
  requireValue(JSON.stringify(inventory)===JSON.stringify(Object.keys(publicHashes)),`${label}: bundled public inventory differs`);
  for(const [file,hash] of Object.entries(publicHashes))
    requireValue(sha(safe(path.join(bundledPublic,file.slice('public/'.length))))===hash,`${label}: bundled public asset differs: ${file}`);
}
checkInputs('preflight');
const versions=await Promise.all([command('ffmpeg', ['-version']), command('ffprobe', ['-version'])]);
const masterMetadata=await probe(masterPath),masterStream=masterMetadata.streams.find(s=>s.codec_type==='audio');
requireValue(masterMetadata.streams.length===1&&masterStream&&Number(masterStream.sample_rate)===48000
  &&Number(masterStream.channels)===2,'Master must be one stereo 48 kHz audio stream');
const masterDuration=masterStream.duration_ts&&masterStream.time_base
  ?Number(masterStream.duration_ts)*Number(masterStream.time_base.split('/')[0])/Number(masterStream.time_base.split('/')[1])
  :Number(masterStream.duration);
requireValue(Math.abs(masterDuration-timeline.duration/30)<=1/48000,'Locked master must equal the entire timeline; no trim or padding');
requireValue(Math.abs(Number(masterStream.start_time??0))<=1/48000,'Master must start at zero');
console.log(JSON.stringify({mode: validateOnly ? 'read-only-preflight' : 'preflight', sourceLock: rel(lockPath), sourceLockSHA256: lockSHA, runnerSHA256: scriptSHA, sourceFiles: sourcePaths.length, lockedRecords: files.length, publicAssets: Object.keys(publicHashes).length, frames: timeline.duration, fps: 30, concurrency, remotionAudio: false, remotionMuted: true, masterAudioMux: true, silent: rel(silent), candidate: rel(candidate), freeDiskBytes, estimatedPeakAdditionalBytes, diskBudget, freeMemoryBytes, estimatedWorkerMemoryBytes, requestedGPUFlags: HIGH_PERFORMANCE_GPU_FLAGS, deliveryUnchanged: true}));
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
  const before = (await probe(silent)).streams.find(s => s.codec_type === 'video');
  if (['color_space', 'color_transfer', 'color_primaries'].every(key => before[key] === 'bt709') && before.color_range==='tv') return false;
  const corrected = path.join(outputDir, 'color-corrected.mp4');
  requireValue(before.color_space==='bt709'&&['color_transfer','color_primaries'].every(k=>before[k]===undefined||before[k]==='unknown'||before[k]==='bt709'),'Refusing to relabel a different encoded color space');
  await command('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-n', '-i', silent, '-map', '0:v:0', '-an', '-c:v', 'copy', '-color_range','tv','-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0', '-movflags', '+faststart+write_colr', corrected]);
  fs.renameSync(silent,path.join(outputDir,'silent-before-color.mp4'));
  fs.renameSync(corrected, silent); return true;
}

function compareAudioSamples(samplesA, samplesB, lockedMasterSHA) {
  requireValue(Math.abs(samplesA.length - samplesB.length) <= 192,
    'Decoded AAC/master length differs by more than one AAC packet at 8 kHz');
  const n = Math.min(samplesA.length, samplesB.length), windows = [];
  let aa=0,bb=0,ab=0,ee=0;
  for(let offset=0;offset<n;offset+=40000) {
    let wa=0,wb=0,wab=0,we=0;const end=Math.min(n,offset+40000);
    for(let i=offset;i<end;i++){const x=samplesA[i],y=samplesB[i];wa+=x*x;wb+=y*y;wab+=x*y;we+=(x-y)*(x-y);}
    aa+=wa;bb+=wb;ab+=wab;ee+=we;
    if(wb>(end-offset)*1e-10) {
      const correlation=wab/Math.sqrt(wa*wb),normalizedRMSE=Math.sqrt(we/wb);
      windows.push({startSeconds:offset/8000,correlation,normalizedRMSE});
      requireValue(correlation>=.99&&normalizedRMSE<=.10,
        `Zero-lag AAC/master mismatch at ${offset/8000}s: corr=${correlation}, nRMSE=${normalizedRMSE}`);
    }
  }
  requireValue(windows.length>0&&aa>0&&bb>0,'Cannot verify correspondence of an entirely silent master');
  const correlation=ab/Math.sqrt(aa*bb),normalizedRMSE=Math.sqrt(ee/bb),gainDB=10*Math.log10(aa/bb);
  requireValue(correlation>=.995&&normalizedRMSE<=.08&&Math.abs(gainDB)<=.25,
    'Full decoded AAC fails the locked-master zero-lag comparison');
  const lagWindows=[];
  const selected=[...new Set(Array.from({length:Math.min(12,windows.length)},
    (_,i)=>Math.floor(i*(windows.length-1)/Math.max(1,Math.min(12,windows.length)-1))))];
  function score(start,end,lag,stride) {
    let a=0,b=0,c=0;
    for(let i=start;i<end;i+=stride){const x=samplesA[i+lag],y=samplesB[i];a+=x*x;b+=y*y;c+=x*y;}
    return a>0&&b>0?c/Math.sqrt(a*b):-1;
  }
  for(const index of selected) {
    const start=Math.max(800,Math.round(windows[index].startSeconds*8000));
    const end=Math.min(n-800,start+32000);
    if(end-start<4000)continue;
    let bestLag=0,bestScore=score(start,end,0,4);
    for(let lag=-800;lag<=800;lag+=8){const c=score(start,end,lag,4);if(c>bestScore){bestScore=c;bestLag=lag;}}
    const coarseLag=bestLag;
    bestLag=0;bestScore=score(start,end,0,1);
    for(let lag=Math.max(-800,coarseLag-8);lag<=Math.min(800,coarseLag+8);lag++) {
      const c=score(start,end,lag,1);if(c>bestScore){bestScore=c;bestLag=lag;}
    }
    lagWindows.push({startSeconds:start/8000,bestLagSamples:bestLag,bestLagMilliseconds:bestLag/8,correlation:bestScore});
    requireValue(bestLag===0,`Non-zero audio lag at ${start/8000}s: ${bestLag/8} ms; no automatic shifting is allowed`);
  }
  requireValue(lagWindows.length>0,'No usable lag-search windows');
  return {method:'Full-length mono 8 kHz PCM at zero offset, every non-silent 5-second window; independent +/-100 ms lag search over up to 12 distributed windows. No shift, trim or time stretch is applied.',
    masterSHA256:lockedMasterSHA,samplesAAC:samplesA.length,samplesMaster:samplesB.length,correlation,normalizedRMSE,gainDB,
    comparedWindows:windows.length,minimumWindowCorrelation:Math.min(...windows.map(w=>w.correlation)),
    maximumWindowNormalizedRMSE:Math.max(...windows.map(w=>w.normalizedRMSE)),
    windows,lagSearchRangeMilliseconds:[-100,100],lagWindows,zeroLagVerified:true};
}

async function checkAudio() {
  const a = path.join(outputDir, 'candidate-audio.f32'), b = path.join(outputDir, 'master-audio.f32');
  await Promise.all([[candidate, a], [masterPath, b]].map(([input, output]) => command('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-n', '-i', input, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', output])));
  const bytesA = fs.readFileSync(a), bytesB = fs.readFileSync(b);
  const samplesA = new Float32Array(bytesA.buffer, bytesA.byteOffset, bytesA.length / 4), samplesB = new Float32Array(bytesB.buffer, bytesB.byteOffset, bytesB.length / 4);
  return compareAudioSamples(samplesA,samplesB,masterSHA);
}
try {
  const bundled = await bundle({entryPoint: path.join(root, 'src/index.tsx'), publicDir: path.join(root, 'public'), outDir: path.join(outputDir, 'bundle')});
  checkInputs('after-bundle');
  checkBundledPublic('after-bundle');
  gpuHook = preferHighPerformanceGPU();
  gpuSelection.hookApplied = gpuHook.applied;
  const {renderMedia, openBrowser, selectComposition} = require('@remotion/renderer');
  browser = await openBrowser('chrome', {browserExecutable: chrome, chromiumOptions: {gl: 'angle'}});
  await recordActualGPU();
  const opts = {serveUrl: bundled, browserExecutable: chrome, puppeteerInstance: browser, chromiumOptions: {gl: 'angle'}, inputProps: {audio: false, clean: false}};
  const composition = await selectComposition({...opts, id: 'GLP1'});
  requireValue(composition.durationInFrames === 25621 && composition.fps === 30 && composition.width === 1920 && composition.height === 1080, 'Selected composition differs from locked full video');
  let last = -1;
  await renderMedia({...opts, composition, codec: 'h264', outputLocation: silent, crf: 18, pixelFormat: 'yuv420p', colorSpace: 'bt709', muted: true, videoImageFormat: 'jpeg', jpegQuality: 95, concurrency, timeoutInMilliseconds: 120000,
    onProgress: progress => {const percent = Math.floor(progress.progress*100); if (percent !== last) {for (let p=last+1;p<=percent;p++) console.log(`Render ${p}%`); last=percent;}}});
  await browser.close({silent: true}); browser = null;
  checkInputs('after-render');
  const silentBefore = await probe(silent);
  requireValue(silentBefore.streams.filter(s=>s.codec_type==='video').length===1
    &&silentBefore.streams.filter(s=>s.codec_type==='audio').length===0,'Remotion output must contain video only');
  const colorRemuxed = await ensureColor();
  const silentSHA=sha(silent), muxCommand=['-hide_banner','-nostdin','-v','error','-xerror','-n',
    '-i',silent,'-i',masterPath,'-map','0:v:0','-map','1:a:0','-map_metadata','-1',
    '-c:v','copy','-c:a','aac','-b:a','320k','-ar','48000','-af','asetpts=PTS-STARTPTS',
    '-color_range','tv','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
    '-movflags','+faststart+write_colr',candidate];
  checkInputs('before-master-mux');
  await command('ffmpeg',muxCommand);
  requireValue(sha(silent)===silentSHA,'Silent video changed during master mux');
  const videoPayloads=await Promise.all([silent,candidate].map(file=>command('ffmpeg',
    ['-hide_banner','-nostdin','-v','error','-xerror','-i',file,'-map','0:v:0','-c:v','copy','-f','hash','-hash','sha256','-'])));
  requireValue(/^SHA256=[a-f0-9]{64}$/i.test(videoPayloads[0].stdout.trim())
    &&videoPayloads[0].stdout.trim()===videoPayloads[1].stdout.trim(),'Video packet payload changed during master mux');
  const audioMux={method:'Silent full Remotion video plus complete locked WAV encoded once from zero',
    remotionInputProps:{audio:false,clean:false},remotionMuted:true,silent:rel(silent),silentSHA256:silentSHA,
    command:['ffmpeg',...muxCommand],ffmpeg:versions[0].stdout.split(/\r?\n/)[0],
    masterSHA256:masterSHA,masterProbe:masterStream,trimmed:false,padded:false,timeStretched:false,
    videoCodec:'copy',audioCodec:'aac',audioBitrate:'320k',sampleRate:48000,
    videoPayloadSHA256:videoPayloads[0].stdout.trim().replace(/^SHA256=/,''),videoPayloadUnchanged:true};
  save(path.join(outputDir,'audio-mux.json'),audioMux);
  const metadata = await probe(candidate), video = metadata.streams.find(s=>s.codec_type==='video'), audio = metadata.streams.find(s=>s.codec_type==='audio');
  requireValue(metadata.streams.filter(s=>s.codec_type==='video').length===1 && metadata.streams.filter(s=>s.codec_type==='audio').length===1, 'Expected exactly one video and one audio stream');
  requireValue(video.codec_name==='h264' && video.width===1920 && video.height===1080 && video.pix_fmt==='yuv420p', 'Incorrect video format');
  requireValue(video.avg_frame_rate==='30/1' && video.r_frame_rate==='30/1' && Number(video.nb_frames)===25621 && Math.abs(Number(video.start_time??0))<1/30, 'Video metadata frame count/fps/start mismatch');
  requireValue(['color_space','color_transfer','color_primaries'].every(key=>video[key]==='bt709')&&video.color_range==='tv', 'BT709 limited-range verification failed');
  requireValue(audio.codec_name==='aac' && Number(audio.sample_rate)===48000 && Number(audio.channels)===2, 'Expected stereo 48 kHz AAC');
  requireValue(Math.abs(Number(video.duration)-25621/30)<.002 && Math.abs(Number(audio.duration)-25621/30)<=1024/48000 && Math.abs(Number(audio.start_time??0))<=1/48000, 'Video/audio duration or start mismatch');
  console.log('Verify: full video/audio decode');
  const decoded = await command('ffmpeg', ['-hide_banner','-nostdin','-v','error','-xerror','-hwaccel','none','-threads','2','-i',candidate,'-map','0:v:0','-map','0:a:0','-progress','pipe:1','-nostats','-f','null','-']);
  const decodedFrames = Math.max(...[...decoded.stdout.matchAll(/^frame=(\d+)\s*$/gm)].map(x=>Number(x[1])));
  requireValue(decodedFrames===25621 && /progress=end/.test(decoded.stdout), 'Full decode did not complete exactly 25,621 frames');
  console.log('Verify: complete AAC/master correspondence');
  const audioComparison = await checkAudio();
  checkInputs('before-install');
  checkBundledPublic('before-install');
  const videoSHA256=sha(candidate), validation={finishedUTC:new Date().toISOString(),automaticChecksPass:true,fullDecodeSuccess:true,decodedFrames,colorRemuxed,video,audio,audioMux,audioComparison,diskBudget,gpuSelection,subjectiveVisualReviewCompleted:false,subjectiveAudioReviewCompleted:false};
  save(validationFile,validation);
  const marker={finished:new Date().toISOString(),frames:[0,25620],seconds:(Date.now()-start)/1000,outputLocation:delivery,success:true,timelineSHA256:timelineSHA,masterSHA256:masterSHA,videoSHA256,renderMode:'single-complete-silent-remotion-render-with-locked-master-aac-mux',singlePassRender:true,singlePassRenderScope:'All 25,621 picture frames from one silent full render; video packet payload copied unchanged during full locked-master AAC mux',audioMux,concurrency,sourceLock:rel(lockPath),sourceLockSHA256:lockSHA,runner:rel(script),runnerSHA256:scriptSHA,sourceHashes:Object.fromEntries(expected),publicAssetHashes:publicHashes,candidate:rel(candidate),validation:rel(validationFile),validationSHA256:sha(validationFile),previousVideoRetainedAt:rel(retained),previousVideoSHA256:OLD_SHA,previousMarkerArchive:rel(archivedMarker),previousMarkerArchiveSHA256:beforeArchivedSHA,previousProvenanceArchive:rel(archivedProvenance),previousProvenanceSHA256:OLD_PROVENANCE_SHA,previousPlanArchive:rel(archivedPlan),previousPlanSHA256:OLD_PLAN_SHA,baseline:rel(baselinePath),baselineSHA256:baselineSHA};
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


