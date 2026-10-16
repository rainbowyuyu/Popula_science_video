import {bundle} from '@remotion/bundler';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {renderMedia, openBrowser, selectComposition}=require('@remotion/renderer');
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const timelinePath = path.join(root, 'src', 'timeline.json');
const masterPath = path.join(root, 'public', 'master.wav');
const planPath = path.join(root, 'research/revision-v5/h070-bridge-repair/patch-plan.json');
const tmpPath = path.join(root, 'tmp');
const workPath = path.join(tmpPath,'v5-h070-bridge-repair');
fs.mkdirSync(workPath,{recursive:true});
const gpuFlags=['--use-angle=d3d11','--force_high_performance_gpu','--enable-gpu'];
const launcher=require(path.join(path.dirname(require.resolve('@remotion/renderer')),'browser/Launcher.js'));
const originalLauncher=launcher.launchChrome;
launcher.launchChrome=options=>originalLauncher({...options,args:[...(options.args??[]).filter(x=>!x.startsWith('--use-angle=')&&!gpuFlags.includes(x)),...gpuFlags]});
const fullMarkerPath = path.join(tmpPath, 'final-render.json');
const chromePath = path.join(root, 'node_modules', '.remotion', 'chrome-headless-shell', 'win64',
  'chrome-headless-shell-win64', 'chrome-headless-shell.exe');

const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail = message => { throw new Error(message); };
const requireValue = (condition, message) => { if (!condition) fail(message); };
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const rel = file => path.relative(root, file).replaceAll(path.sep, '/');
const absolute = value => path.resolve(root, value);
const fullMarkerExisted = fs.existsSync(fullMarkerPath);
const fullMarkerSHA256 = fullMarkerExisted ? sha(fullMarkerPath) : null;

function checkFullMarker(label) {
  requireValue(fs.existsSync(fullMarkerPath) === fullMarkerExisted, `${label}: full render marker existence changed`);
  if (fullMarkerExisted) requireValue(sha(fullMarkerPath) === fullMarkerSHA256, `${label}: full render marker changed`);
}

function safeProjectPath(value, {mustExist = true} = {}) {
  const file = absolute(value);
  requireValue(file !== root && file.startsWith(root + path.sep), `Path leaves project: ${value}`);
  requireValue(!file.split(path.sep).some(part => part === '.git' || part === 'node_modules' && file !== chromePath),
    `Protected dependency/repository path: ${value}`);
  for (let current = file; current !== root; current = path.dirname(current)) {
    if (!fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    requireValue(!stat.isSymbolicLink() && !(stat.fileAttributes & 0x400), `Symlink/reparse path refused: ${current}`);
    const resolved = fs.realpathSync(current);
    requireValue(resolved === root || resolved.startsWith(root + path.sep), `Resolved path leaves project: ${current}`);
  }
  if (mustExist) requireValue(fs.existsSync(file), `Missing path: ${value}`);
  return file;
}

function declaredPath(value, label) {
  requireValue(typeof value === 'string' && value.length > 0, `${label} must be a path`);
  return safeProjectPath(value, {mustExist: false});
}

function probeColor(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=color_space,color_transfer,color_primaries,color_range', '-of', 'json', file],
    {encoding: 'utf8', windowsHide: true});
  requireValue(result.status === 0, `ffprobe failed for ${file}: ${result.stderr || ''}`);
  const stream = JSON.parse(result.stdout).streams?.[0];
  requireValue(stream, `ffprobe returned no video stream for ${file}`);
  return stream;
}

function requireSilent(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries',
    'stream=index', '-of', 'json', file], {encoding: 'utf8', windowsHide: true});
  requireValue(result.status === 0, `ffprobe audio probe failed for ${file}: ${result.stderr || ''}`);
  requireValue((JSON.parse(result.stdout).streams || []).length === 0, `Silent patch unexpectedly contains audio: ${file}`);
}

function probeVideo(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,pix_fmt', '-of', 'json', file],
    {encoding: 'utf8', windowsHide: true});
  requireValue(result.status === 0, `ffprobe video probe failed for ${file}: ${result.stderr || ''}`);
  const stream = JSON.parse(result.stdout).streams?.[0];
  requireValue(stream, `ffprobe returned no video stream for ${file}`);
  return stream;
}

function repairColor(file) {
  let probe = probeColor(file);
  if (probe.color_space === 'bt709' && probe.color_transfer === 'bt709' && probe.color_primaries === 'bt709') {
    return {file, probe, repaired: false, streamCopy: false};
  }
  const corrected = file.replace(/\.mp4$/i, '.color.mp4');
  requireValue(!fs.existsSync(corrected), `Refusing to overwrite color repair candidate: ${corrected}`);
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-y', '-i', file,
    '-map', '0', '-c', 'copy', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1',
    '-movflags', '+faststart+write_colr', corrected], {encoding: 'utf8', windowsHide: true});
  requireValue(result.status === 0, `BT709 stream-copy repair failed for ${file}: ${result.stderr || ''}`);
  probe = probeColor(corrected);
  requireValue(probe.color_space === 'bt709' && probe.color_transfer === 'bt709' && probe.color_primaries === 'bt709',
    `BT709 metadata verification failed for ${corrected}`);
  fs.rmSync(file);
  fs.renameSync(corrected, file);
  return {file, probe, repaired: true, streamCopy: true};
}

function normalizeRange(patch, index) {
  const range = patch.frameRange ?? [patch.start, patch.end];
  requireValue(Array.isArray(range) && range.length === 2 && range.every(Number.isInteger),
    `Patch ${index + 1} must specify an integer frameRange/start/end`);
  const [start, end] = range;
  requireValue(start >= 0 && end >= start, `Patch ${index + 1} has an invalid frame range`);
  return [start, end];
}

function patchSources(plan, patch) {
  const merged = {...(plan.sourceHashes || {}), ...(patch.sourceHashes || {})};
  for (const [source, expected] of Object.entries(merged)) {
    const file = safeProjectPath(source);
    requireValue(hex(expected), `Invalid SHA-256 for ${source}`);
    requireValue(sha(file) === expected.toLowerCase(), `Source hash mismatch: ${source}`);
  }
  return patch.sourceHashes;
}

function checkLocks(lock, label) {
  checkFullMarker(label);
  requireValue(sha(planPath) === lock.planSHA256, `${label}: patch plan changed`);
  requireValue(sha(timelinePath) === lock.timelineSHA256, `${label}: timeline changed`);
  requireValue(sha(masterPath) === lock.masterSHA256, `${label}: master changed`);
  for (const [source, expected] of Object.entries(lock.sourceHashes)) {
    requireValue(sha(safeProjectPath(source)) === expected.toLowerCase(), `${label}: source changed: ${source}`);
  }
}

function logLine(log, line) {
  fs.appendFileSync(log, `${new Date().toISOString()} ${line}\n`, 'utf8');
  console.log(line);
}

const plan = read(planPath);
requireValue(plan.version === 'v5-local-patches', 'Unsupported or missing patch plan version');
requireValue(Array.isArray(plan.patches) && plan.patches.length > 0, 'Patch plan has no patches');
requireValue(plan.fps === 30 && plan.width === 1920 && plan.height === 1080,
  'Patch plan must declare fps=30, width=1920 and height=1080');
requireValue(hex(plan.timelineSHA256) && hex(plan.masterSHA256), 'Patch plan must lock timelineSHA256 and masterSHA256');
requireValue(hex(plan.baseVideoSHA256), 'Patch plan must lock baseVideoSHA256');
requireValue(plan.baseVideoSHA256 === 'dfa2d9a89817f74a5a436b5a4acae48334700ef92f5068676cb65c167f705ccb',
  'This repair requires the reviewed dfa2 base composition');
requireValue(!plan.baseSourceHashes && !plan.baseSourceSnapshots && plan.baseComposition,
  'A composed base must retain nested composition provenance, not a single source map');
for (const [pathKey, hashKey] of [['provenancePath', 'provenanceSHA256'], ['planPath', 'planSHA256']]) {
  const file = safeProjectPath(plan.baseComposition[pathKey]);
  requireValue(hex(plan.baseComposition[hashKey]) && sha(file) === plan.baseComposition[hashKey],
    `Base composition ancestry mismatch: ${pathKey}`);
}
requireValue(sha(fullMarkerPath) === plan.baseComposition.markerSHA256,
  'Base composition marker mismatch');
const planSHA256 = sha(planPath);
requireValue(sha(timelinePath) === plan.timelineSHA256.toLowerCase(), 'Patch plan timeline SHA mismatch');
requireValue(sha(masterPath) === plan.masterSHA256.toLowerCase(), 'Patch plan master SHA mismatch');

const patches = plan.patches.map((patch, index) => {
  const [start, end] = normalizeRange(patch, index);
  const defaultOutput = path.join(tmpPath, `segment-${start}-${end}.mp4`);
  const output = patch.video ?? patch.output ?? rel(defaultOutput);
  const outputPath = declaredPath(output, `Patch ${index + 1} output`);
  requireValue(outputPath === defaultOutput, `Patch ${index + 1} output must be tmp/segment-${start}-${end}.mp4`);
  const markerValue = patch.marker ?? patch.markerPath;
  const markerPath = declaredPath(markerValue, `Patch ${index + 1} marker`);
  requireValue(markerPath !== fullMarkerPath, 'Patch marker may not overwrite tmp/final-render.json');
  requireValue(markerPath !== outputPath, 'Patch marker may not overwrite the segment video');
  requireValue(markerPath.startsWith(path.join(root, 'research', 'revision-v5') + path.sep) ||
    markerPath.startsWith(tmpPath + path.sep), 'Patch marker must stay under research/revision-v5 or tmp');
  const logValue = patch.log ?? patch.logPath ?? rel(path.join(tmpPath, `segment-${start}-${end}.log`));
  const logPath = declaredPath(logValue, `Patch ${index + 1} log`);
  requireValue(logPath.startsWith(tmpPath + path.sep) && logPath.endsWith('.log'),
    'Patch log must be a .log file under tmp');
  requireValue(logPath !== fullMarkerPath && logPath !== outputPath && logPath !== markerPath,
    'Patch output, marker and log paths must be distinct');
  requireValue(!fs.existsSync(outputPath), `Refusing to overwrite existing segment: ${outputPath}`);
  requireValue(!fs.existsSync(markerPath), `Refusing to overwrite existing marker: ${markerPath}`);
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.mkdirSync(path.dirname(markerPath), {recursive: true});
  fs.mkdirSync(path.dirname(logPath), {recursive: true});
  requireValue(!fs.existsSync(logPath), `Refusing to overwrite existing log: ${logPath}`);
  fs.writeFileSync(logPath, '', 'utf8');
  requireValue(patch.sourceHashes && Object.keys(patch.sourceHashes).length > 0,
    `Patch ${index + 1} must provide non-empty sourceHashes`);
  return {patch, index, start, end, outputPath, markerPath, logPath};
});

for (let i = 1; i < patches.length; i += 1) {
  requireValue(patches[i - 1].end < patches[i].start, 'Patch frame ranges overlap or are unordered');
}

const sourceHashes = {};
for (const item of patches) {
  item.sourceHashes = patchSources(plan, item.patch);
  for (const [source, expected] of Object.entries(item.sourceHashes)) {
    if (sourceHashes[source] && sourceHashes[source] !== expected.toLowerCase()) fail(`Conflicting source lock: ${source}`);
    sourceHashes[source] = expected.toLowerCase();
  }
}
const lock = {planSHA256, timelineSHA256: plan.timelineSHA256.toLowerCase(), masterSHA256: plan.masterSHA256.toLowerCase(), sourceHashes};
checkLocks(lock, 'Initial lock');

const silent = process.argv.includes('--silent');
requireValue(silent, 'This batch renderer requires --silent to keep each segment video-only');
const concurrencyArg = process.argv.find(arg => arg.startsWith('--concurrency='));
const concurrency = Number(concurrencyArg?.split('=')[1] ?? 2);
requireValue(Number.isInteger(concurrency) && concurrency > 0, 'Invalid --concurrency value');

const timeline = read(timelinePath);
const totalFrames = timeline.durationFrames ?? timeline.duration;
for (const item of patches) requireValue(item.end < totalFrames, `Patch ${item.start}-${item.end} exceeds timeline`);

const bundlePath = await bundle({entryPoint: path.join(root, 'src', 'index.tsx'), publicDir: path.join(root, 'public'), outDir: path.join(workPath, 'bundle')});
const browser = await openBrowser('chrome', {browserExecutable: chromePath, chromiumOptions: {gl: 'angle'}});
const gpuResponse=await browser.connection.send('SystemInfo.getInfo');
fs.writeFileSync(path.join(workPath,'gpu-adapter.json'),JSON.stringify(gpuResponse.value??gpuResponse,null,2));
const opts = {serveUrl: bundlePath, browserExecutable: chromePath, chromiumOptions: {gl: 'angle'},
  inputProps: {audio: false, clean: false}, concurrency};

try {
  const composition = await selectComposition({...opts, puppeteerInstance: browser, id: 'GLP1'});
  for (const item of patches) {
    checkLocks(lock, `Before ${item.start}-${item.end}`);
    const started = Date.now();
    logLine(item.logPath, `START frameRange=${item.start}-${item.end} planSHA256=${lock.planSHA256}`);
    let last = -1;
    try {
      await renderMedia({
      ...opts,
      puppeteerInstance: browser,
      composition,
      codec: 'h264',
      outputLocation: item.outputPath,
      crf: 18,
      pixelFormat: 'yuv420p',
      colorSpace: 'bt709',
      videoImageFormat: 'jpeg',
      jpegQuality: 95,
      timeoutInMilliseconds: 120000,
      frameRange: [item.start, item.end],
      onProgress: progress => {
        const percent = Math.floor(progress.progress * 100);
        if (percent !== last) { last = percent; logLine(item.logPath, `Render ${percent}%`); }
      },
      });
      const repair = repairColor(item.outputPath);
      requireSilent(item.outputPath);
      const video = probeVideo(item.outputPath);
      requireValue(Number(video.width) === 1920 && Number(video.height) === 1080 && video.pix_fmt === 'yuv420p' &&
        video.r_frame_rate === '30/1' && Number(video.nb_read_frames) === item.end - item.start + 1,
        `Segment probe does not match the requested frame range: ${item.start}-${item.end}`);
      checkLocks(lock, `After ${item.start}-${item.end}`);
      const probe = probeColor(item.outputPath);
      const marker = {
      finished: new Date().toISOString(),
      frames: [item.start, item.end],
      seconds: (Date.now() - started) / 1000,
      outputLocation: item.outputPath,
      success: true,
      silent: true,
      audioIncluded: false,
      audioStreamCount: 0,
      timelineSHA256: lock.timelineSHA256,
      masterSHA256: lock.masterSHA256,
      planSHA256: lock.planSHA256,
      sourceHashes: item.sourceHashes,
      videoSHA256: sha(item.outputPath),
      color: {color_space: probe.color_space, color_transfer: probe.color_transfer, color_primaries: probe.color_primaries, color_range: probe.color_range},
      videoProbe: video,
      colorRepair: repair,
      renderMode: 'remotion-batch-local-patch',
      };
      fs.writeFileSync(item.markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
      logLine(item.logPath, `COMPLETE videoSHA256=${marker.videoSHA256} marker=${rel(item.markerPath)} elapsedSeconds=${marker.seconds}`);
    } catch (error) {
      logLine(item.logPath, `FAILED frameRange=${item.start}-${item.end} error=${error?.stack || error}`);
      throw error;
    }
  }
} finally {
  await browser.close({silent: true});
  launcher.launchChrome=originalLauncher;
}

