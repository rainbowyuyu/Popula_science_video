import fs from 'node:fs';
import * as T from 'three';
import {applyV05Camera, V05_HANDOFF_ANCHORS, V05_MASTER_SECONDS, V05_MAX_TRANSLATION_MPS, V05_MAX_YAW_DEGREES_PER_SECOND} from '../src/CameraPathV05';
import {timeline, stateAt} from '../src/Timeline';

const camera = new T.PerspectiveCamera(45, 1920 / 1080, .025, 220);
let maxTranslation = 0, maxRotation = 0, maxFov = 0, invalid = 0, empty = 0, maxTranslationFrame = 0;
let previousPosition: T.Vector3 | null = null, previousQuaternion: T.Quaternion | null = null, previousFov: number | null = null;
const handoffs = V05_HANDOFF_ANCHORS.map((a) => ({id: a.id, seconds: a.seconds, frame: Math.round(a.seconds / V05_MASTER_SECONDS * timeline.duration)}));
for (let frame = 0; frame < timeline.duration; frame += 1) {
  const state = stateAt(frame);
  if (!state.scene) empty += 1;
  const sample = applyV05Camera(camera, frame, {totalFrames: timeline.duration});
  if (![...camera.position.toArray(), ...camera.quaternion.toArray(), camera.fov].every(Number.isFinite)) invalid += 1;
  if (previousPosition) { const d = camera.position.distanceTo(previousPosition); if (d > maxTranslation) { maxTranslation = d; maxTranslationFrame = frame; } }
  if (previousQuaternion) maxRotation = Math.max(maxRotation, T.MathUtils.radToDeg(camera.quaternion.angleTo(previousQuaternion)));
  if (previousFov !== null) maxFov = Math.max(maxFov, Math.abs(camera.fov - previousFov));
  previousPosition = camera.position.clone(); previousQuaternion = camera.quaternion.clone(); previousFov = camera.fov;
  void sample;
}
const report = {passed: invalid === 0 && empty === 0 && maxTranslation <= 0.13 && maxRotation <= V05_MAX_YAW_DEGREES_PER_SECOND / timeline.fps * 1.05, frames: timeline.duration, seconds: timeline.duration / timeline.fps, invalid, empty, maxTranslationPerFrame: maxTranslation, maxTranslationFrame, maxRotationDegreesPerFrame: maxRotation, maxFovDeltaPerFrame: maxFov, handoffs, captionMaxChars: Math.max(...timeline.captions.map((c) => c.text.length))};
fs.mkdirSync('research/qa', {recursive: true});
fs.writeFileSync('research/qa/v05-motion-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
