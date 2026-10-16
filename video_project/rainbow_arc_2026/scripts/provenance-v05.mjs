#!/usr/bin/env node
/**
 * Build a V05 provenance snapshot without contacting any provider.
 *
 * Usage:
 *   node scripts/provenance-v05.mjs > research/qa/provenance-v05.json
 *   node scripts/provenance-v05.mjs --out research/qa/provenance-v05.json
 *
 * The script only reads local files and environment-variable presence. It
 * never serializes credentials, submits generation work, or overwrites an
 * existing output file.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relPath = (file) => path.relative(ROOT, file).replaceAll(path.sep, '/');
const absPath = (relative) => path.resolve(ROOT, relative);

function readJson(relative) {
  try {
    return JSON.parse(fs.readFileSync(absPath(relative), 'utf8'));
  } catch {
    return null;
  }
}

function fileHash(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function fileRecord(relative, role, extra = {}) {
  const file = absPath(relative);
  if (!fs.existsSync(file)) return {path: relative, role, exists: false, ...extra};
  const stat = fs.statSync(file);
  return {
    path: relative,
    role,
    exists: true,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    sha256: await fileHash(file),
    ...extra,
  };
}

function packageVersions() {
  const pkg = readJson('package.json') ?? {};
  const deps = {...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {})};
  return Object.fromEntries(
    ['remotion', '@remotion/three', 'three', 'react', 'typescript']
      .filter((name) => deps[name])
      .map((name) => [name, deps[name]]),
  );
}

function blenderStatus() {
  const executable = 'D:\\blender\\blender.exe';
  if (!fs.existsSync(executable)) {
    return {status: 'missing', executable};
  }
  try {
    const output = execFileSync(executable, ['--version'], {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    });
    const firstLine = output.split(/\r?\n/).find(Boolean) ?? '';
    const match = firstLine.match(/Blender\s+([0-9.]+)/i);
    return {
      status: 'available',
      executable,
      version: match?.[1] ?? null,
      versionCheck: 'D:\\blender\\blender.exe --version',
    };
  } catch (error) {
    return {
      status: 'error',
      executable,
      errorType: error?.name ?? 'Error',
      errorMessage: 'Blender version probe failed; no command output was retained.',
    };
  }
}

function envPresence(name) {
  return Object.prototype.hasOwnProperty.call(process.env, name) && Boolean(process.env[name]);
}

function qwenStatus(qwenRecord) {
  return {
    provider: 'Alibaba Cloud DashScope',
    status: 'blocked',
    capability: 'wan2.6-i2v',
    credentials: {
      environmentVariables: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
      present: {
        QWEN_API_KEY: envPresence('QWEN_API_KEY'),
        DASHSCOPE_API_KEY: envPresence('DASHSCOPE_API_KEY'),
      },
      serialized: false,
    },
    lastProbe: {
      method: 'GET',
      endpoint: 'https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}',
      taskId: '3c618e99-d361-436b-93eb-40f1fd0539c0',
      statusCode: 401,
      errorCode: 'InvalidApiKey',
      observedOn: '2026-10-11',
      generationSubmitted: false,
      note: 'The environment credential probe was rejected; do not submit a new task until a non-billable probe returns 200.',
    },
    existingAsset: qwenRecord ? {
      model: qwenRecord.model ?? null,
      taskId: qwenRecord.taskId ?? null,
      status: qwenRecord.status ?? null,
      file: qwenRecord.file ?? null,
      seed: qwenRecord.seed ?? null,
      reusedFor: 'atmosphere bridge only; not physical evidence',
    } : null,
  };
}

function lux3dStatus(luxAttempt, luxDelivery) {
  return {
    provider: 'Aholo Lux3D',
    region: luxAttempt?.region ?? luxDelivery?.region ?? 'cn',
    runtime: {
      setupCheck: 'passed',
      interpreter: 'C:/Users/zju/.cache/aholo-lux3d/python-3.13/Scripts/python.exe',
      credentialsSerialized: false,
    },
    existingTask: {
      taskId: luxAttempt?.taskId ?? luxDelivery?.taskId ?? null,
      quoteId: luxAttempt?.quoteId ?? luxDelivery?.quoteId ?? null,
      operation: luxAttempt?.operation ?? luxDelivery?.operation ?? null,
      version: luxAttempt?.version ?? luxDelivery?.version ?? null,
      status: luxAttempt?.status ?? luxDelivery?.status ?? null,
      estimatedCredits: luxAttempt?.estimatedCredits ?? luxDelivery?.estimatedCredits ?? null,
      submittedAt: luxAttempt?.submittedAt ?? luxDelivery?.submittedAt ?? null,
    },
    approval: {
      newGenerationSubmittedByThisSnapshot: false,
      note: 'New Lux3D work requires a fresh quote and the applicable approval mode.',
    },
  };
}

async function buildManifest() {
  const luxAttempt = readJson('work/lux3d-attempt.json');
  const luxDelivery = readJson('public/assets/lux3d/lux3d-delivery.json');
  const qwenRecord = readJson('work/qwen-bridge-v03.json');
  const verification = readJson('research/physics/verification.json');
  const worldGeometry = readJson('research/physics/world-geometry-check.json');
  const packageJson = readJson('package.json') ?? {};
  const opticsSource = await fileRecord('src/optics.ts', 'deterministic optics source');
  const verificationFile = await fileRecord('research/physics/verification.json', 'optics verification report');

  const assets = await Promise.all([
    fileRecord('public/assets/lux3d/lux3d.zip', 'Lux3D source archive'),
    fileRecord('public/assets/lux3d/extracted/mesh/tex_mesh.glb', 'Lux3D mesh output'),
    fileRecord('public/assets/lux3d/extracted/3dgs/gaussian.ply', 'Lux3D Gaussian source'),
    fileRecord('public/assets/lux3d/extracted/3dgs/gaussian-sampled.json', 'deterministic Gaussian preview sample', {
      physicalEvidence: false,
    }),
    fileRecord('public/assets/lux3d/lux3d-delivery.json', 'Lux3D delivery record'),
    fileRecord('public/assets/blender/rainbow_raindrop_v03.blend', 'Blender editable source'),
    fileRecord('public/assets/blender/rainbow_raindrop_v03.glb', 'Blender exported mesh'),
    fileRecord('public/assets/blender/rainbow_raindrop_v03.obj', 'Blender exported OBJ'),
    fileRecord('public/assets/blender/raindrop_v03.png', 'Blender rendered preview'),
    fileRecord('public/assets/qwen/qwen_rainbow_transition_reference.png', 'Qwen atmosphere still', {
      physicalEvidence: false,
    }),
    fileRecord('public/assets/qwen/qwen_rainbow_bridge_v03.mp4', 'Qwen atmosphere bridge video', {
      physicalEvidence: false,
    }),
    fileRecord('public/assets/qwen/qwen_rainbow_transition_reference.json', 'Qwen still provenance'),
    fileRecord('work/qwen-bridge-v03.json', 'Qwen video task record'),
  ]);

  const worldSource = await fileRecord('research/physics/world-geometry-check.json', 'world geometry verification');
  const opticsVerification = {
    verificationVersion: verificationFile.exists ? `sha256:${verificationFile.sha256}` : null,
    implementation: opticsSource,
    report: verificationFile,
    model: verification?.model ?? null,
    passed: verification?.passed ?? false,
    tolerance: verification?.tolerance ?? null,
    sweep: verification?.sweep ?? null,
    angleChecks: verification?.angleChecks ?? null,
    worldGeometry: {
      source: worldSource,
      passed: worldGeometry?.passed ?? false,
      objectCount: worldGeometry?.objectCount ?? null,
      invalidTransforms: worldGeometry?.invalidTransforms ?? null,
      deterministicSeek: worldGeometry?.deterministicSeek ?? null,
      fixedRainPositions: worldGeometry?.fixedRainPositions ?? null,
    },
  };

  return {
    schema: 'rainbow.v05.provenance/v1',
    version: 'V05',
    topic: '彩虹为什么是弧形？',
    sourceVersion: 'V04',
    generatedAt: new Date().toISOString(),
    generationPolicy: {
      localSnapshotOnly: true,
      networkRequests: 0,
      billableTasksSubmitted: 0,
      credentialsSerialized: false,
      existingAssetsPreserved: true,
    },
    tools: {
      claudeOpus: {
        status: 'available',
        model: 'claude-opus-5-5',
        runner: 'C:/Users/zju/.codex/tools/claude/run.mjs',
        transport: 'native',
        offlineTests: {
          command: 'node --test C:/Users/zju/.codex/tools/claude/client.test.mjs C:/Users/zju/.codex/tools/claude/native.test.mjs',
          passed: true,
          testCount: 36,
        },
        outputPolicy: 'preserve response.partial.md, response.md and report.json per run',
      },
      blender: blenderStatus(),
      remotionThree: {
        status: 'available',
        packageVersions: packageVersions(),
        renderEntry: 'scripts/render.mjs',
        composition: 'RainbowArc',
        resolution: [1920, 1080],
        fps: 30,
      },
      lux3d: lux3dStatus(luxAttempt, luxDelivery),
      qwen: qwenStatus(qwenRecord),
      waterPro: {
        status: 'unavailable',
        installed: false,
        evidence: 'docs/tool-audit-v03.md',
        localDocumentation: ['tmp_api_waves.html', 'tmp_api_spray.html', 'tmp_api_foam.html'],
        fallback: 'deterministic Three.js shader/water primitives',
      },
    },
    physics: opticsVerification,
    assets: assets.filter(Boolean),
    sourceFiles: [
      await fileRecord('src/OpticsWorld.ts', 'Three.js optical world'),
      await fileRecord('src/CameraPath.ts', 'frame-driven camera path'),
      await fileRecord('src/GaussianBridge.tsx', 'Gaussian visual bridge'),
      await fileRecord('src/RainbowArcFilm.tsx', 'Remotion composition'),
      await fileRecord('src/timeline.json', 'narration and scene timeline'),
    ],
    acceptance: {
      requiredBeforeV05Delivery: [
        'npm run check',
        'representative stills at every bridge and camera handoff',
        'full ffprobe decode with no black segments',
        'frame-driven motion audit',
        'audio loudness and true-peak report',
      ],
      qwenCondition: 'Do not submit new Qwen work until the credential probe returns HTTP 200.',
      lux3dCondition: 'Refresh quote for actual parameters and obtain the required approval before new generation.',
    },
  };
}

const outArg = process.argv.find((arg) => arg.startsWith('--out='))?.slice('--out='.length);
const manifest = await buildManifest();
const output = JSON.stringify(manifest, null, 2) + '\n';
if (!outArg) {
  process.stdout.write(output);
} else {
  const destination = path.resolve(process.cwd(), outArg);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.writeFileSync(destination, output, {encoding: 'utf8', flag: 'wx'});
  process.stdout.write(`wrote ${relPath(destination)}\n`);
}
