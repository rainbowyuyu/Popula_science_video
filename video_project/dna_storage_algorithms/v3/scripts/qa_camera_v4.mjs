import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

// Numeric camera contract for the isolated V4 path.  This intentionally does
// not replace qa_camera.mjs, which remains the V3 release check.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sourcePath = path.join(root, 'src/CameraPathV4.ts');
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
const {sampleCameraV4, STATIONS_V4, CAMERA_KEYS_V4} = api;
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
fail(STATIONS_V4[0].start === 0 && STATIONS_V4.at(-1).end === 300, 'Station range must cover 0–300 seconds');
for (let i = 1; i < STATIONS_V4.length; i++) {
  fail(STATIONS_V4[i].start === STATIONS_V4[i - 1].end, `Station gap at ${i}`);
}
for (let i = 1; i < CAMERA_KEYS_V4.length; i++) {
  fail(CAMERA_KEYS_V4[i].time > CAMERA_KEYS_V4[i - 1].time, `Unsorted/duplicate key ${i}`);
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
let previous = sampleCameraV4(0);
for (let frame = 0; frame <= 9000; frame++) {
  const t = frame / 30;
  const sample = sampleCameraV4(t);
  const d = distance(sample.position, sample.target);
  stats.minDistance = Math.min(stats.minDistance, d);
  stats.maxDistance = Math.max(stats.maxDistance, d);
  stats.minFov = Math.min(stats.minFov, sample.fov);
  stats.maxFov = Math.max(stats.maxFov, sample.fov);
  stats.minFocusDistance = Math.min(stats.minFocusDistance, sample.focusDistance);
  stats.maxFocusDistance = Math.max(stats.maxFocusDistance, sample.focusDistance);
  stats.maxRollDeg = Math.max(stats.maxRollDeg, Math.abs(sample.rollDeg));
  fail([...sample.position, ...sample.target, sample.fov, sample.focusDistance, sample.rollDeg].every(Number.isFinite), `Nonfinite sample ${t}`);
  fail(d >= 12 && d <= 24, `Look distance ${d} at ${t}`);
  fail(sample.fov >= 38.6 && sample.fov <= 41.2, `FOV ${sample.fov} at ${t}`);
  fail(sample.position[2] >= 12.5 && sample.position[2] <= 19.2, `Camera z ${sample.position[2]} at ${t}`);
  fail(sample.target[2] < sample.position[2] - 11, `Camera orientation at ${t}`);
  if (frame > 0) {
    const speed = 30 * distance(previous.position, sample.position);
    const targetSpeed = 30 * distance(previous.target, sample.target);
    const angularSpeed = Math.acos(Math.max(-1, Math.min(1, dot(view(previous), view(sample))))) * 180 / Math.PI * 30;
    stats.maxSpeed = Math.max(stats.maxSpeed, speed);
    stats.maxTargetSpeed = Math.max(stats.maxTargetSpeed, targetSpeed);
    stats.maxAngularSpeedDeg = Math.max(stats.maxAngularSpeedDeg, angularSpeed);
    fail(speed < 10, `Frame speed ${speed} at ${t}`);
    fail(angularSpeed < 15, `Angular speed ${angularSpeed} at ${t}`);
  }
  previous = sample;
}

const keyTimes = [...new Set([...CAMERA_KEYS_V4.map(k => k.time), ...STATIONS_V4.slice(1).map(s => s.start)])]
  .filter(t => t > 0 && t < 300);
for (const t of keyTimes) {
  const eps = 1e-5;
  const a = sampleCameraV4(t - eps);
  const b = sampleCameraV4(t);
  const c = sampleCameraV4(t + eps);
  const pJump = distance(diff(b.position, a.position, eps), diff(c.position, b.position, eps));
  const tJump = distance(diff(b.target, a.target, eps), diff(c.target, b.target, eps));
  stats.maxPositionDerivativeDiscontinuity = Math.max(stats.maxPositionDerivativeDiscontinuity, pJump);
  stats.maxTargetDerivativeDiscontinuity = Math.max(stats.maxTargetDerivativeDiscontinuity, tJump);
  fail(pJump < 0.02 && tJump < 0.02, `C1 discontinuity at ${t}: ${pJump}/${tJump}`);
  const ae = 1e-3;
  const am2 = sampleCameraV4(t - 2 * ae), am1 = sampleCameraV4(t - ae);
  const ap1 = sampleCameraV4(t + ae), ap2 = sampleCameraV4(t + 2 * ae);
  const acceleration = (p, q, r) => p.map((v, i) => (v - 2 * q[i] + r[i]) / (ae * ae));
  const pa = distance(acceleration(b.position, am1.position, am2.position), acceleration(ap2.position, ap1.position, b.position));
  const ta = distance(acceleration(b.target, am1.target, am2.target), acceleration(ap2.target, ap1.target, b.target));
  stats.maxPositionAccelerationDiscontinuity = Math.max(stats.maxPositionAccelerationDiscontinuity, pa);
  stats.maxTargetAccelerationDiscontinuity = Math.max(stats.maxTargetAccelerationDiscontinuity, ta);
  fail(pa < 0.015 && ta < 0.015, `C2 discontinuity at ${t}: ${pa}/${ta}`);
}
for (const t of [NaN, Infinity, -Infinity, -100, 400]) {
  const s = sampleCameraV4(t);
  fail([...s.position, ...s.target, s.fov, s.focusDistance].every(Number.isFinite), `Invalid input handling ${t}`);
}
for (let frame = 0; frame <= 9000; frame += 137) {
  const expected = JSON.stringify(sampleCameraV4(frame / 30));
  sampleCameraV4(((frame * 7919) % 9001) / 30);
  fail(JSON.stringify(sampleCameraV4(frame / 30)) === expected, `Stateful sampling at ${frame}`);
}

const report = {
  schema: 'rainbow.dna.camera-qa/v4',
  status: failures.length ? 'FAIL' : 'PASS',
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  scope: 'Numeric V4 full-frame camera continuity, orientation, focus and deterministic seeking.',
  stats,
  keyTimes,
  failures,
};
fs.writeFileSync(path.join(root, 'research/camera-qa-v4.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;

