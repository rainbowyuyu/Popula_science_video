import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from 'typescript';

// Exercise the actual draw functions under the parent fade used by WorldV01.
// A local animation must never make an otherwise hidden parent scene visible.
const sourcePath = 'src/chemistry2026/ChemistryMechanismsV01.ts';
const source = fs.readFileSync(sourcePath, 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
}}).outputText;
const mechanism = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const drawingMethods = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage', 'clearRect']);
const geometryMethods = new Set(['beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'ellipse', 'rect', 'roundRect', 'clip', 'translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform', 'setLineDash']);
const sceneNames = ['award', 'life', 'frank', 'kagan', 'nonlinear', 'soai', 'feedback', 'chance', 'amplification', 'toolsScene', 'coda', 'labGround'];
const cases = [];

function finite(value, label) {
  if (typeof value === 'number') assert(Number.isFinite(value), `Nonfinite ${label}: ${value}`);
  else if (Array.isArray(value)) value.forEach(v => finite(v, label));
}

function canvasProbe(parentAlpha) {
  let state = {globalAlpha: parentAlpha};
  const stack = [];
  let draws = 0, maxAlpha = 0, maxDepth = 0, exceededParent = 0;
  const gradient = (...args) => {
    finite(args, 'gradient geometry');
    return {addColorStop(offset) {
      finite(offset, 'gradient offset');
      assert(offset >= 0 && offset <= 1, `Gradient stop ${offset} outside [0,1]`);
    }};
  };
  const methods = {
    save() {stack.push({...state}); maxDepth = Math.max(maxDepth, stack.length);},
    restore() {assert(stack.length > 0, 'restore() without save()'); state = stack.pop();},
    createLinearGradient: gradient,
    createRadialGradient: gradient,
  };
  const ctx = new Proxy({}, {
    get(_target, key) {
      if (key in methods) return methods[key];
      if (key in state) return state[key];
      assert(drawingMethods.has(key) || geometryMethods.has(key), `Unmodelled Canvas API ${String(key)}`);
      return (...args) => {
        finite(args, String(key));
        if (drawingMethods.has(key)) {
          draws++;
          maxAlpha = Math.max(maxAlpha, state.globalAlpha);
          if (state.globalAlpha > parentAlpha + 1e-12) exceededParent++;
        }
      };
    },
    set(_target, key, value) {
      finite(value, String(key));
      if (key === 'globalAlpha') assert(value >= 0 && value <= 1, `Invalid alpha ${value}`);
      state[key] = value;
      return true;
    },
  });
  return {ctx, result() {
    assert.equal(stack.length, 0, 'Unbalanced save()/restore()');
    assert.equal(state.globalAlpha, parentAlpha, 'Parent alpha not restored');
    assert(draws > 0, 'Scene made no draw calls');
    return {draws, maxAlpha, maxDepth, exceededParent, balanced: true, alphaRestored: true};
  }};
}

for (const parentAlpha of [0, 0.25]) {
  for (const progress of [0, 0.12, 0.26, 0.45, 0.61, 0.75, 0.92, 1]) {
    const elapsed = progress * 30;
    for (const scene of [...sceneNames, 'pyrimidine-substrate', 'pyrimidine-product']) {
      const probe = canvasProbe(parentAlpha);
      if (scene.startsWith('pyrimidine-')) mechanism.pyrimidine(probe.ctx, 600, 550, 1.45, scene.endsWith('product'), progress);
      else mechanism[scene](probe.ctx, elapsed, progress);
      cases.push({scene, parentAlpha, progress, ...probe.result()});
    }
  }
}

const violations = cases.filter(c => c.exceededParent > 0);
const baseline = process.argv.includes('--baseline');
const output = `docs/v01/opacity-regression-v01${baseline ? '-before' : ''}.json`;
const priorPath = 'docs/v01/opacity-regression-v01-before.json';
const prior = !baseline && fs.existsSync(priorPath) ? JSON.parse(fs.readFileSync(priorPath, 'utf8')) : null;
const report = {
  status: violations.length ? 'fail' : 'pass',
  sourcePath,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  regression: 'Scene-local globalAlpha must inherit the parent cross-scene fade; covers the Kagan → nonlinear seam.',
  totalCases: cases.length,
  totalDrawCalls: cases.reduce((sum, c) => sum + c.draws, 0),
  violations: violations.length,
  affectedScenes: [...new Set(violations.map(c => c.scene))],
  allGeometryFinite: true,
  allSaveRestoreBalanced: true,
  baseline: prior ? {status: prior.status, sourceSha256: prior.sourceSha256, violations: prior.violations, affectedScenes: prior.affectedScenes} : undefined,
  scope: 'Canvas proxy executes actual drawing code and checks effective alpha, finite arguments, and balanced save/restore. Does not replace rendered seam viewing.',
  cases,
};
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({...report, cases: undefined}, null, 2));
if (violations.length) process.exitCode = 1;
