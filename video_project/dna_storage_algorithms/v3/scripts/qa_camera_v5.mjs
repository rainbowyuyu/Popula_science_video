import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

// Numeric camera contract for the isolated V5 path.  This intentionally does
// not replace qa_camera.mjs, which remains the V3 release check.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sourcePath = path.join(root, 'src/CameraPathV5.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022},
  reportDiagnostics: true,
});
const diagnostics = (compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: x => x,
  getCurrentDirectory: () => root,
  getNewLine: () => '\n',
}));
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const {sampleCameraV5, STATIONS_V5, CAMERA_KEYS_V5, FOCUS_WINDOWS_V5} = api;
const failures = [];
const fail = (condition, message) => { if (!condition && failures.length < 100) failures.push(message); };
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const diff = (a, b, dt) => a.map((v, i) => (v - b[i]) / dt);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const unit = a => {
  const d = Math.hypot(...a);
  return a.map(v => v / Math.max(d, 1e-9));
};
const view = s => unit(s.target.map((v, i) => v - s.position[i]));

fail(!/\b(?:Date\.now|Math\.random|performance\.now|requestAnimationFrame)\s*\(/.test(source), 'Nondeterministic camera source');
fail(STATIONS_V5[0].start === 0 && STATIONS_V5.at(-1).end === 300, 'Station range must cover 0–300 seconds');
for (let i = 1; i < STATIONS_V5.length; i++) {
  fail(STATIONS_V5[i].start === STATIONS_V5[i - 1].end, `Station gap at ${i}`);
}
for (let i = 1; i < CAMERA_KEYS_V5.length; i++) {
  fail(CAMERA_KEYS_V5[i].time > CAMERA_KEYS_V5[i - 1].time, `Unsorted/duplicate key ${i}`);
}

const stats = {
  samples: 9001,
  minDistance: Infinity,
  maxDistance: 0,
  minFov: Infinity,
  maxFov: -Infinity,
  minFocusDistance: Infinity,
  maxFocusDistance: 0,
  maxSpeed: 0,
  maxTargetSpeed: 0,
  maxAngularSpeedDeg: 0,
  maxRollDeg: 0,
  maxPositionDerivativeDiscontinuity: 0,
  maxTargetDerivativeDiscontinuity: 0,
  maxPositionAccelerationDiscontinuity: 0,
  maxTargetAccelerationDiscontinuity: 0,
};
let previous = sampleCameraV5(0);
for (let frame = 0; frame <= 9000; frame++) {
  const t = frame / 30;
  const sample = sampleCameraV5(t);
  const d = distance(sample.position, sample.target);
  stats.minDistance = Math.min(stats.minDistance, d);
  stats.maxDistance = Math.max(stats.maxDistance, d);
  stats.minFov = Math.min(stats.minFov, sample.fov);
  stats.maxFov = Math.max(stats.maxFov, sample.fov);
  stats.minFocusDistance = Math.min(stats.minFocusDistance, sample.focusDistance);
  stats.maxFocusDistance = Math.max(stats.maxFocusDistance, sample.focusDistance);
  stats.maxRollDeg = Math.max(stats.maxRollDeg, Math.abs(sample.rollDeg));
  fail([...sample.position, ...sample.target, sample.fov, sample.focusDistance, sample.rollDeg].every(Number.isFinite), `Nonfinite sample ${t}`);
  fail(d >= 4 && d <= 24, `Look distance ${d} at ${t}`);
  fail(sample.fov >= 37 && sample.fov <= 44, `FOV ${sample.fov} at ${t}`);
  fail(sample.position[2] >= 4.5 && sample.position[2] <= 19.2, `Camera z ${sample.position[2]} at ${t}`);
  fail(sample.target[2] < sample.position[2] - 3.5, `Camera orientation at ${t}`);
  if (frame > 0) {
    const speed = 30 * distance(previous.position, sample.position);
    const targetSpeed = 30 * distance(previous.target, sample.target);
    const angularSpeed = Math.acos(Math.max(-1, Math.min(1, dot(view(previous), view(sample))))) * 180 / Math.PI * 30;
    stats.maxSpeed = Math.max(stats.maxSpeed, speed);
    stats.maxTargetSpeed = Math.max(stats.maxTargetSpeed, targetSpeed);
    stats.maxAngularSpeedDeg = Math.max(stats.maxAngularSpeedDeg, angularSpeed);
    fail(speed < 10, `Frame speed ${speed} at ${t}`);
    fail(targetSpeed < 8, `Target speed ${targetSpeed} at ${t}`);
    fail(angularSpeed < 20, `Angular speed ${angularSpeed} at ${t}`);
  }
  previous = sample;
}

const keyTimes = [...new Set([...CAMERA_KEYS_V5.map(k => k.time), ...STATIONS_V5.slice(1).map(s => s.start)])]
  .filter(t => t > 0 && t < 300);
for (const t of keyTimes) {
  const eps = 1e-5;
  const a = sampleCameraV5(t - eps);
  const b = sampleCameraV5(t);
  const c = sampleCameraV5(t + eps);
  const pJump = distance(diff(b.position, a.position, eps), diff(c.position, b.position, eps));
  const tJump = distance(diff(b.target, a.target, eps), diff(c.target, b.target, eps));
  stats.maxPositionDerivativeDiscontinuity = Math.max(stats.maxPositionDerivativeDiscontinuity, pJump);
  stats.maxTargetDerivativeDiscontinuity = Math.max(stats.maxTargetDerivativeDiscontinuity, tJump);
  fail(pJump < 0.02 && tJump < 0.02, `C1 discontinuity at ${t}: ${pJump}/${tJump}`);
  const ae = 1e-3;
  const am2 = sampleCameraV5(t - 2 * ae), am1 = sampleCameraV5(t - ae);
  const ap1 = sampleCameraV5(t + ae), ap2 = sampleCameraV5(t + 2 * ae);
  const acceleration = (p, q, r) => p.map((v, i) => (v - 2 * q[i] + r[i]) / (ae * ae));
  const pa = distance(acceleration(b.position, am1.position, am2.position), acceleration(ap2.position, ap1.position, b.position));
  const ta = distance(acceleration(b.target, am1.target, am2.target), acceleration(ap2.target, ap1.target, b.target));
  stats.maxPositionAccelerationDiscontinuity = Math.max(stats.maxPositionAccelerationDiscontinuity, pa);
  stats.maxTargetAccelerationDiscontinuity = Math.max(stats.maxTargetAccelerationDiscontinuity, ta);
  fail(pa < 0.015 && ta < 0.015, `C2 discontinuity at ${t}: ${pa}/${ta}`);
}
for (const t of [NaN, Infinity, -Infinity, -100, 400]) {
  const s = sampleCameraV5(t);
  fail([...s.position, ...s.target, s.fov, s.focusDistance].every(Number.isFinite), `Invalid input handling ${t}`);
}
for (let frame = 0; frame <= 9000; frame += 137) {
  const expected = JSON.stringify(sampleCameraV5(frame / 30));
  sampleCameraV5(((frame * 7919) % 9001) / 30);
  fail(JSON.stringify(sampleCameraV5(frame / 30)) === expected, `Stateful sampling at ${frame}`);
}

const focusProjection=[];
const camera=new THREE.PerspectiveCamera(40,16/9,.05,250);
for(const [id,window] of Object.entries(FOCUS_WINDOWS_V5)) {
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minCoverage=Infinity,maxCoverage=0;
 for(let t=window.start;t<=window.end+.001;t+=.1) {
  const s=sampleCameraV5(t);camera.fov=s.fov;camera.position.set(...s.position);camera.lookAt(...s.target);camera.rotateZ(THREE.MathUtils.degToRad(s.rollDeg));camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  let loX=Infinity,hiX=-Infinity,loY=Infinity,hiY=-Infinity;
  for(const x of [window.min[0],window.max[0]])for(const y of [window.min[1],window.max[1]])for(const z of [window.min[2],window.max[2]]) {
   const p=new THREE.Vector3(x+STATIONS_V5[window.station].origin[0],y,z).project(camera);loX=Math.min(loX,p.x);hiX=Math.max(hiX,p.x);loY=Math.min(loY,p.y);hiY=Math.max(hiY,p.y);
  }
  minX=Math.min(minX,loX);maxX=Math.max(maxX,hiX);minY=Math.min(minY,loY);maxY=Math.max(maxY,hiY);minCoverage=Math.min(minCoverage,(hiY-loY)/2);maxCoverage=Math.max(maxCoverage,(hiY-loY)/2);
 }
 const safe=minX>=-.94&&maxX<=.94&&minY>=-.78&&maxY<=.88;
 focusProjection.push({id,intent:window.intent,minX,maxX,minY,maxY,minCoverage,maxCoverage,safe});
 fail(safe,`Unsafe focus envelope ${id}: ${JSON.stringify({minX,maxX,minY,maxY})}`);
}
const report = {
  schema: 'rainbow.dna.camera-qa/v5',
  status: failures.length ? 'FAIL' : 'PASS',
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  scope: 'Numeric V5 full-frame camera continuity, orientation, focus and deterministic seeking.',
  stats,
  focusProjection,
  keyTimes,
  failures,
};
fs.writeFileSync(path.join(root, 'research/camera-qa-v5.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;

