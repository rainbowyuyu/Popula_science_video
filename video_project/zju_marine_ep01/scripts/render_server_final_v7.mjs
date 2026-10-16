/** Linux H100 production renderer. Consumes an immutable, uploaded V7 bundle.
 * No build, upload, authentication change or GPU selection changes are performed.
 * Example:
 * node scripts/render_server_final_v7.mjs --bundle=bundle-final --marker=bundle-final-ready --range=0-11014 --concurrency=2 --output=out-final/marine_energy_episode01_v7_raw.mp4
 * --stills --frames=120,470,4800,10350 renders only PNG QA frames.
 */
import {renderMedia, renderStill, selectComposition, openBrowser, makeCancelSignal} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {performance} from 'node:perf_hooks';

const exec = promisify(execFile);
const EXPECTED_GPU = 'GPU-bb237d96-f75f-846d-2c75-8a02fafe8cda';
const EXPECTED_FRAMES = 11015;
const cli = process.argv.slice(2);
const args = Object.fromEntries(cli.filter(x => x.includes('=')).map(x => {
  const i = x.indexOf('='); return [x.slice(0, i).replace(/^--/, ''), x.slice(i + 1)];
}));
const has = flag => cli.includes(`--${flag}`);
if (has('help')) {
  console.log('V7 Linux WebGPU production: --root=DIR --bundle=DIR --marker=FILE --output=FILE.mp4 --range=START-END --concurrency=2|4 [--stills --frames=120,470] [--overwrite]');
  process.exit(0);
}
if (process.platform !== 'linux') throw Error('Server production rendering requires Linux; this script must not launch locally.');
const root = path.resolve(args.root || '/home/fusion/marine-energy-v7-20261014');
const resolve = value => path.resolve(root, value);
const bundle = resolve(args.bundle || 'bundle-final');
const marker = resolve(args.marker || 'bundle-final-ready');
const output = resolve(args.output || 'out-final/marine_energy_episode01_v7_raw.mp4');
const reportPath = resolve(args.report || `${path.relative(root, output).replace(/\.[^.]+$/, '')}.render-report.json`);
const logPath = reportPath.replace(/\.json$/, '') + '.progress.jsonl';
const stillDir = output.replace(/\.[^.]+$/, '') + '-stills';
const chrome = resolve(args.chrome || 'browsers/chromium-1243/chrome-linux64/chrome');
const concurrency = Number(args.concurrency || 2);
const range = (args.range || '0-11014').split('-').map(Number);
const stillFrames = (args.frames || '120,470,4800,10350').split(',').map(Number);
const stillsOnly = has('stills');
const overwrite = has('overwrite');
if (![2, 4].includes(concurrency)) throw Error('--concurrency must be 2 or 4; a single browser shares these render pages.');
if (range.length !== 2 || range.some(n => !Number.isInteger(n)) || range[0] < 0 || range[1] >= EXPECTED_FRAMES || range[0] > range[1]) {
  throw Error('--range must be an inclusive frame range within 0-11014.');
}
if (stillFrames.some(n => !Number.isInteger(n) || n < 0 || n >= EXPECTED_FRAMES)) throw Error('Invalid still frame.');
for (const file of [marker, path.join(bundle, 'index.html'), chrome]) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw Error(`Required completed input missing: ${file}`);
}
if (!fs.statSync(bundle).isDirectory()) throw Error('Bundle must be an existing local directory.');
const inBundle = p => p === bundle || p.startsWith(bundle + path.sep);
if ([output, reportPath, logPath, stillDir].some(inBundle)) throw Error('Outputs must not mutate the frozen bundle.');
if (!stillsOnly && path.extname(output).toLowerCase() !== '.mp4') throw Error('Production --output must end in .mp4.');
if (!overwrite && (fs.existsSync(reportPath) || (!stillsOnly && fs.existsSync(output)))) throw Error('Output/report already exists; choose a new output or use --overwrite.');
const shaBytes = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function bundleCodeFiles(dir, entries = []) {
  for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir,item.name);
    // Asset content is protected by the existing bundle's ready protocol;
    // hash executable bundle code explicitly to catch accidental rebuilds.
    if (item.isDirectory() && item.name !== 'public') bundleCodeFiles(file,entries);
    else if (item.isFile() && /\.(?:js|mjs|css|html)$/.test(item.name)) entries.push(file);
  }
  return entries.sort();
}
const frozen = {marker: {path: marker, sha256: shaBytes(marker), mtimeMs: fs.statSync(marker).mtimeMs},
  index: {path: path.join(bundle, 'index.html'), sha256: shaBytes(path.join(bundle, 'index.html'))},
  executableFiles:bundleCodeFiles(bundle).map(file=>({path:path.relative(bundle,file),sha256:shaBytes(file)}))};
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.mkdirSync(path.dirname(reportPath), {recursive: true});
fs.mkdirSync(stillDir, {recursive: true});
const lock = path.join(root, '.marine-v7-server-render.lock');
let lockOwned = false;
let browser = null;
let timer = null;
let pendingMonitor = null;
let fatal = null;
let closing = false;
let nativeObserved = false;
let matchedGPUObserved = false;
const {cancelSignal, cancel} = makeCancelSignal();
const startedAt = performance.now();
const report = {
  schema: 'marine-server-production-render-v7', version: 'v7', started: new Date().toISOString(),
  status: 'initializing', root, bundle, frozenInputs: frozen, output, mode: stillsOnly ? 'stills' : 'video',
  requestedRange: range, requestedFrameCount: range[1] - range[0] + 1,
  concurrency, browserCount: 1, expectedGPU: {index: 0, uuid: EXPECTED_GPU},
  renderSettings: {resolution: [1920,1080], fps: 30, codec: 'h264', crf: 17, jpegQuality: 96,
    pixelFormat: 'yuv420p', colorSpace: 'bt709', audio: false, shaderBackendRequired: 'webgpu', waterQuality: 'high'},
  audioNote: 'Silent raw/chunk. Finalize with the current public/audio/episode01-mix-v7.wav; no audio is taken from this file.',
  browser: null, composition: null, progress: null, gpuSamples: [], nativeSamples: [], stills: [],
  browserErrors: [], warnings: [], error: null, verification: null,
};
function save() {
  const tmp = reportPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(report, null, 2));
  fs.renameSync(tmp, reportPath);
}
function log(event, detail = {}) {
  const item = {time: new Date().toISOString(), event, ...detail};
  const line = JSON.stringify(item);
  fs.appendFileSync(logPath, line + '\n');
  console.log(line);
}
function markFatal(error) {
  if (fatal) return;
  fatal = error instanceof Error ? error : new Error(String(error));
  report.error = String(fatal.stack || fatal);
  report.status = 'aborting';
  save(); log('abort', {message: fatal.message}); cancel();
  // Close only the browser created by this invocation. No global process kill.
  if (browser && !closing) {closing = true; browser.close({silent:true}).catch(() => {});}
}
async function gpuSnapshot(stage, requireMapping = false) {
  const info = (await browser.connection.send('SystemInfo.getProcessInfo')).value;
  const pids = new Set(info.processInfo.filter(p => /gpu/i.test(p.type)).map(p => String(p.id)));
  const {stdout: xml} = await exec('nvidia-smi', ['-q','-x'], {encoding:'utf8', timeout:15000, maxBuffer:8*1024*1024});
  const devices = [];
  for (const block of xml.split('<gpu id=').slice(1)) {
    const uuid = block.match(/<uuid>([^<]+)</)?.[1];
    const pci = block.match(/<pci_bus_id>([^<]+)</)?.[1];
    const processes = block.match(/<processes>([\s\S]*?)<\/processes>/)?.[1] || '';
    const own = [];
    for (const process of processes.split('<process_info>').slice(1)) {
      const pid = process.match(/<pid>([^<]+)</)?.[1];
      if (pids.has(pid)) own.push({pid, memory:process.match(/<used_memory>([^<]+)</)?.[1],
        name:process.match(/<process_name>([^<]+)</)?.[1]});
    }
    if (own.length) devices.push({uuid, pci, processes:own});
  }
  const snapshot = {stage, time:new Date().toISOString(), gpuPids:[...pids], devices};
  report.gpuSamples.push(snapshot);
  if (devices.some(d => d.uuid !== EXPECTED_GPU)) throw Error('Browser GPU PID appeared on a GPU other than authorized GPU 0.');
  if (devices.some(d => d.uuid === EXPECTED_GPU)) matchedGPUObserved = true;
  if (requireMapping && !devices.length) throw Error('Unable to verify browser GPU PID against GPU 0; refusing to certify the render.');
  save();
  return snapshot;
}
async function nativeSnapshot(stage) {
  const pages = await browser.pages();
  for (const page of pages) {
    if (page.closed) continue;
    try {
      const data = await page.evaluate(() => {
        const s = window.__marineV7;
        return s ? {backend:s.backend, state:s.state, drawCalls:s.drawCalls} : null;
      });
      if (!data) continue;
      report.nativeSamples.push({stage,time:new Date().toISOString(),pageId:page.id,...data});
      if (data.backend !== 'webgpu' || data.state?.backend !== 'webgpu') throw Error('Scene reported a non-WebGPU water backend.');
      nativeObserved = true;
    } catch (e) {
      // Pages are intentionally recycled by Remotion. A closed target is not
      // backend proof; any explicit wrong backend is a fatal failure.
      if (/non-WebGPU/.test(String(e))) throw e;
      if (!/closed|destroyed|detached|context|session/i.test(String(e))) throw e;
    }
  }
  save();
}
function monitor(stage, requireMapping = false) {
  if (pendingMonitor) return pendingMonitor;
  pendingMonitor = (async () => {
    await gpuSnapshot(stage, requireMapping);
    await nativeSnapshot(stage);
  })().catch(markFatal).finally(() => {pendingMonitor = null;});
  return pendingMonitor;
}
function assertFrozen() {
  if (shaBytes(marker) !== frozen.marker.sha256 || fs.statSync(marker).mtimeMs !== frozen.marker.mtimeMs ||
      shaBytes(frozen.index.path) !== frozen.index.sha256) throw Error('Bundle ready marker or index changed during production.');
  const current = bundleCodeFiles(bundle).map(file=>path.relative(bundle,file));
  if (JSON.stringify(current)!==JSON.stringify(frozen.executableFiles.map(f=>f.path))) throw Error('Bundle executable file list changed during production.');
  for (const f of frozen.executableFiles) if (shaBytes(path.join(bundle,f.path))!==f.sha256) throw Error('Frozen executable bundle changed: '+f.path);
}
async function fileSha(file) {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
const stop = signal => markFatal(Error(`Received ${signal}; incomplete output is not final.`));
const onSigint = () => stop('SIGINT');
const onSigterm = () => stop('SIGTERM');

try {
  const fd = fs.openSync(lock, 'wx');
  fs.writeFileSync(fd, JSON.stringify({pid:process.pid,started:report.started,output,reportPath}));
  fs.closeSync(fd); lockOwned = true;
  process.on('SIGINT', onSigint); process.on('SIGTERM', onSigterm);
  // Check the current device numbering rather than assuming yesterday's GPU 0.
  const {stdout: inventory} = await exec('nvidia-smi', ['--query-gpu=index,uuid,name,memory.free,utilization.gpu','--format=csv,noheader,nounits'], {encoding:'utf8', timeout:15000});
  report.initialGPUInventory = inventory.trim().split('\n').map(line => line.split(',').map(s => s.trim()));
  const zero = report.initialGPUInventory.find(row => row[0] === '0');
  if (!zero || zero[1] !== EXPECTED_GPU) throw Error('Server GPU 0 identity differs from the previously verified device.');
  save(); log('start', {range,concurrency,browserCount:1,expectedGPU:EXPECTED_GPU,bundle,output});
  const chromiumOptions = {gl:'vulkan',enableMultiProcessOnLinux:true};
  browser = await openBrowser('chrome', {browserExecutable:chrome,chromeMode:'chrome-for-testing',chromiumOptions,logLevel:'warn'});
  report.browser = (await browser.connection.send('SystemInfo.getInfo')).value;
  const onBrowserLog = event => {
    if (!['error','warning','warn'].includes(event.type)) return;
    const entry = {time:new Date().toISOString(),type:event.type,text:event.text};
    if (event.type === 'error') report.browserErrors.push(entry); else if (report.warnings.length < 400) report.warnings.push(entry);
    log('browser-' + event.type, {text:event.text});
    if (/device lost|GPUDevice.*lost|out of memory|WebGPU.*(?:failed|error)|validation error/i.test(event.text)) markFatal(Error('GPU/browser failure: ' + event.text));
  };
  const options = {serveUrl:bundle,browserExecutable:chrome,chromeMode:'chrome-for-testing',chromiumOptions,
    timeoutInMilliseconds:300000,inputProps:{audio:false},puppeteerInstance:browser,logLevel:'warn',
    onBrowserLog,cancelSignal};
  const comp = await selectComposition({...options,id:'MarineEnergyEpisode01'});
  report.composition = {id:comp.id,width:comp.width,height:comp.height,fps:comp.fps,durationInFrames:comp.durationInFrames};
  if (comp.width !== 1920 || comp.height !== 1080 || comp.fps !== 30 || comp.durationInFrames !== EXPECTED_FRAMES) throw Error('Bundle composition is not the approved 1920×1080 / 30 fps / 11015-frame V7 film.');
  report.status = 'rendering'; save();
  timer = setInterval(() => {monitor('render-running');}, 10000);
  // A first-frame warm-up verifies actual GPU use before the longer range.
  const frames = stillsOnly ? [...new Set(stillFrames)] : [range[0]];
  for (const frame of frames) {
    const start = performance.now();
    const destination = path.join(stillDir,`frame-${String(frame).padStart(5,'0')}.png`);
    await renderStill({...options,composition:comp,frame,output:destination,imageFormat:'png',overwrite});
    if (pendingMonitor) await pendingMonitor;
    if (fatal) throw fatal;
    await monitor(`still-${frame}`,true);
    if (fatal) throw fatal;
    const item = {frame,seconds:(performance.now()-start)/1000,path:destination,sha256:await fileSha(destination)};
    report.stills.push(item); save(); log('still-complete',item);
  }
  if (!stillsOnly) {
    assertFrozen();
    let lastLog = 0, lastPercent = -1;
    const start = performance.now();
    await renderMedia({...options,composition:comp,codec:'h264',outputLocation:output,overwrite,
      crf:17,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:96,
      concurrency,frameRange:range,muted:true,enforceAudioTrack:false,
      onProgress:p => {
        const now = performance.now(), percent = Math.floor(p.progress*100);
        report.progress = {renderedFrames:p.renderedFrames,encodedFrames:p.encodedFrames,progress:p.progress,
          wallSeconds:(now-start)/1000,stitchStage:p.stitchStage};
        if (now-lastLog >= 10000 || percent >= lastPercent+2 || p.progress===1) {
          lastLog=now;lastPercent=percent;save();log('progress',report.progress);monitor('progress');
        }
      }});
    if (pendingMonitor) await pendingMonitor;
    if (fatal) throw fatal;
    report.range = {inclusive:range,frameCount:range[1]-range[0]+1,seconds:(performance.now()-start)/1000};
    report.range.renderFps = report.range.frameCount/report.range.seconds;
    const {stdout} = await exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8',timeout:60000});
    const probe=JSON.parse(stdout),video=probe.streams.find(s=>s.codec_type==='video'),audio=probe.streams.filter(s=>s.codec_type==='audio');
    const expected=range[1]-range[0]+1;
    report.outputProbe=probe;
    report.verification={frameCount:Number(video?.nb_frames)===expected,resolution:video?.width===1920&&video?.height===1080,
      fps:video?.r_frame_rate==='30/1',silent:audio.length===0,durationDeltaSec:Math.abs(Number(video?.duration)-expected/30)};
    if (!report.verification.frameCount||!report.verification.resolution||!report.verification.fps||!report.verification.silent||report.verification.durationDeltaSec>1/30) throw Error('Encoded frame count, timing, dimensions or silent-output check failed.');
    report.outputSHA256=await fileSha(output);report.outputBytes=fs.statSync(output).size;
  }
  clearInterval(timer);timer=null;
  if (pendingMonitor) await pendingMonitor;
  await gpuSnapshot('render-complete');
  assertFrozen();
  if (fatal) throw fatal;
  if (!matchedGPUObserved) throw Error('No verified browser PID on GPU 0.');
  // Long production must expose the scene backend. Very short still jobs can
  // finish between samples; record that narrower evidence without fabricating it.
  if (!stillsOnly && !nativeObserved) throw Error('No observed native WebGPU scene state during production.');
  report.backendEvidence={nativeWebGPUObserved:nativeObserved,authorizedGPUPidObserved:matchedGPUObserved,
    otherGPUUsed:report.gpuSamples.some(s=>s.devices.some(d=>d.uuid!==EXPECTED_GPU)),
    caveat:stillsOnly&&!nativeObserved?'Still completed between page-state samples; GPU PID verified, scene state unobserved.':null};
  report.status='complete';report.completed=new Date().toISOString();report.wallSeconds=(performance.now()-startedAt)/1000;
  save();log('complete',{output:stillsOnly?stillDir:output,wallSeconds:report.wallSeconds,range:report.range||null,report:reportPath});
} catch (e) {
  report.status='failed';report.error=String((fatal||e)?.stack||fatal||e);report.failedAt=new Date().toISOString();
  report.wallSeconds=(performance.now()-startedAt)/1000;
  save();log('failed',{message:String((fatal||e)?.message||fatal||e),report:reportPath});process.exitCode=1;
} finally {
  clearInterval(timer);
  if (pendingMonitor) await pendingMonitor;
  if (browser&&!closing) {closing=true;await browser.close({silent:true}).catch(e=>{report.closeError=String(e);});}
  process.off('SIGINT',onSigint);process.off('SIGTERM',onSigterm);
  if (lockOwned) {
    const owned=JSON.parse(fs.readFileSync(lock,'utf8'));
    if (owned.pid===process.pid) fs.unlinkSync(lock);
  }
  save();
}
