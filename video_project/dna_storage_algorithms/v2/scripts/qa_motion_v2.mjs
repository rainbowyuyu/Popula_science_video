#!/usr/bin/env node
/**
 * Motion/continuity QA for the DNA V2 timeline.
 *
 * This is deliberately a numeric, offline check.  It does not render and it
 * does not ask a provider for assets.  Camera samples, anchor handoffs and
 * evidence marks are read from the timeline itself (or from an optional motion
 * sidecar) so a render can be audited before spending time on a full export.
 */

import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (s) => s.slice(1)).replaceAll('/', path.sep));
const V2 = path.resolve(HERE, '..');
const DEFAULT_TIMELINE = path.join(V2, 'src', 'timeline.json');
const DEFAULT_DELIVERY = path.join(V2, 'delivery_v2');
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueAfter = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const timelinePath = path.resolve(valueAfter('--timeline', DEFAULT_TIMELINE));
const defaultMotion = [path.join(V2, 'src', 'motion.json'), path.join(DEFAULT_DELIVERY, 'motion.json'), path.join(DEFAULT_DELIVERY, 'camera-poses.json')].find((p) => fs.existsSync(p)) ?? path.join(V2, 'src', 'motion.json');
const motionPath = path.resolve(valueAfter('--motion', defaultMotion));
const jsonOutput = has('--json');
const DEFAULT_MAX_VELOCITY = 120;
const DEFAULT_MAX_HANDOFF_GAP = 20;
const EPS = 1e-8;

const report = {ok: true, timeline: timelinePath, motion: motionPath, errors: [], warnings: [], checks: {}};
function error(code, message, detail = undefined) { report.ok = false; report.errors.push({code, message, ...(detail === undefined ? {} : {detail})}); }
function warn(code, message, detail = undefined) { report.warnings.push({code, message, ...(detail === undefined ? {} : {detail})}); }
function finiteNumber(x) { return typeof x === 'number' && Number.isFinite(x); }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { error('READ_JSON', `无法读取 JSON：${file}`, String(e?.message ?? e)); return null; } }
function numberField(obj, keys) { for (const k of keys) if (finiteNumber(obj?.[k])) return obj[k]; return undefined; }
function textField(obj, keys) { for (const k of keys) if (typeof obj?.[k] === 'string' && obj[k].trim()) return obj[k].trim(); return ''; }
function asArray(value) { if (Array.isArray(value)) return value; if (value && typeof value === 'object') return Object.values(value); return []; }
function idField(obj, fallback) { return String(obj?.id ?? obj?.shotId ?? obj?.sceneId ?? obj?.name ?? fallback); }
function anchorIds(value) {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (Array.isArray(value)) return [...new Set(value.flatMap(anchorIds))];
  if (value && typeof value === 'object') {
    const id = value.id ?? value.anchorId ?? value.name;
    if (typeof id === 'string' && id.trim()) return [id.trim()];
    return [...new Set(Object.values(value).flatMap(anchorIds))];
  }
  return [];
}
function handoffObject(value) { return value && typeof value === 'object' ? value : {}; }
function handoffTarget(value) { return typeof value === 'string' ? '' : textField(handoffObject(value), ['to', 'target', 'next', 'nextShot', 'shotId', 'id']); }
function shotList(timeline) { for (const k of ['shots', 'scenes', 'shotSpecs', 'sequence']) if (Array.isArray(timeline?.[k])) return timeline[k]; return Array.isArray(timeline) ? timeline : []; }
function normalizeShot(raw, i) {
  const s = raw?.shotSpec && typeof raw.shotSpec === 'object' ? raw.shotSpec : raw;
  return {
    raw, spec: s, index: i, id: idField(s, `shot-${i + 1}`),
    start: numberField(s, ['start', 'startFrame', 'from']), end: numberField(s, ['end', 'endFrame', 'to']),
    camera: s?.camera ?? s?.cameraSpec ?? s?.pose ?? s?.cameraPath ?? (s?.cameraIn && s?.cameraOut ? {in: s.cameraIn, out: s.cameraOut} : undefined),
    anchor: s?.anchor ?? s?.anchors ?? s?.anchorId ?? s?.anchorIds,
    handoff: s?.handoff ?? s?.transition ?? s?.transitionTo ?? s?.transitionOut,
    evidence: s?.evidence ?? s?.evidenceMarks ?? s?.evidenceTags,
    evidenceIds: s?.evidenceIds,
  };
}
function vec3(value) {
  if (Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(finiteNumber)) return value.slice(0, 3);
  if (value && typeof value === 'object' && ['x', 'y', 'z'].every((k) => finiteNumber(value[k]))) return [value.x, value.y, value.z];
  return null;
}
function dist(a, b) { if (!a || !b) return null; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function poseFrom(raw, fallbackFrame) {
  const p = raw?.pose && typeof raw.pose === 'object' ? raw.pose : raw;
  const position = vec3(p?.position ?? p?.pos ?? p?.eye ?? p?.camera);
  const target = vec3(p?.target ?? p?.lookAt ?? p?.focus ?? p?.look);
  const fov = numberField(p, ['fov', 'fovDeg', 'lens', 'zoom']);
  const frame = numberField(raw, ['frame', 'at', 'frameIndex']) ?? fallbackFrame;
  return {frame, position, target, fov};
}
function cameraSamples(camera, shot) {
  if (!camera) return [];
  if (Array.isArray(camera)) return camera.map((p, i) => poseFrom(p, shot.start + Math.round((shot.end - shot.start) * i / Math.max(1, camera.length - 1))));
  if (typeof camera !== 'object') return [];
  if (camera.in || camera.out) return [poseFrom(camera.in, shot.start), poseFrom(camera.out, shot.end)];
  for (const key of ['samples', 'poses', 'keyframes', 'path', 'points']) {
    if (Array.isArray(camera[key])) return camera[key].map((p, i) => poseFrom(p, shot.start + Math.round((shot.end - shot.start) * i / Math.max(1, camera[key].length - 1))));
  }
  if (camera.from || camera.to || camera.start || camera.end) {
    const a = camera.from ?? camera.start, b = camera.to ?? camera.end;
    return [poseFrom(a, shot.start), poseFrom(b, shot.end)];
  }
  const one = poseFrom(camera, shot.start);
  return one.position || one.target || finiteNumber(one.fov) ? [one] : [];
}
function maxVelocity(camera, timeline) {
  return numberField(camera, ['maxVelocity', 'maxSpeed']) ?? numberField(timeline, ['maxCameraVelocity', 'maxPoseVelocity']) ?? DEFAULT_MAX_VELOCITY;
}
function evidenceFor(shot, timeline) {
  if (shot.evidence !== undefined) return asArray(shot.evidence);
  const global = asArray(timeline?.evidence ?? timeline?.evidenceMarks ?? timeline?.evidenceTags);
  if (Array.isArray(shot.evidenceIds)) {
    const wanted = new Set(shot.evidenceIds.map(String));
    return global.filter((m) => wanted.has(String(m?.id ?? m?.markerId ?? '')));
  }
  return global.filter((m) => String(m?.shotId ?? m?.shot ?? m?.sceneId ?? '') === shot.id);
}
function markerFrame(marker, fps) {
  const raw = numberField(marker, ['frame', 'at', 'frameIndex']);
  if (finiteNumber(raw)) return raw;
  const seconds = numberField(marker, ['time', 'seconds', 'timeSeconds']);
  return finiteNumber(seconds) ? seconds * fps : undefined;
}

const timeline = fs.existsSync(timelinePath) ? readJson(timelinePath) : null;
const motion = fs.existsSync(motionPath) ? readJson(motionPath) : null;
if (!timeline) error('TIMELINE_MISSING', `时间线不存在：${timelinePath}`);
else {
  const fps = numberField(timeline, ['fps', 'frameRate']) ?? 30;
  const shots = shotList(timeline).map(normalizeShot).map((s) => ({...s,
    start: finiteNumber(s.start) ? s.start : (finiteNumber(s.spec?.startSec) ? s.spec.startSec * fps : undefined),
    end: finiteNumber(s.end) ? s.end : (finiteNumber(s.spec?.endSec) ? s.spec.endSec * fps : undefined),
  })).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  const motionShots = new Map(asArray(motion?.shots ?? motion?.scenes).map((s) => [idField(s, ''), s]));
  const markerIds = new Set();
  let poseShotCount = 0, sampleCount = 0;
  for (const shot of shots) {
    const anchors = asArray(shot.anchor);
    if (!anchors.length) error('ANCHOR_MISSING', `${shot.id} 缺少 anchors`);
    const localAnchorIds = new Set();
    for (const anchor of anchors) {
      const aid = textField(anchor, ['id', 'anchorId', 'name']);
      if (!aid) error('ANCHOR_ID', `${shot.id} 存在无 id 的 anchor`);
      else if (localAnchorIds.has(aid)) error('ANCHOR_DUPLICATE', `${shot.id} anchor id 重复：${aid}`);
      else localAnchorIds.add(aid);
      const position = vec3(anchor?.position);
      if (!position) error('ANCHOR_POSITION', `${shot.id}/${aid || 'anchor'} 缺少有限 position[x,y,z]`);
      const opacity = anchor?.opacity;
      if (opacity !== undefined && (!finiteNumber(opacity) || opacity < 0 || opacity > 1)) error('ANCHOR_OPACITY', `${shot.id}/${aid || 'anchor'} opacity 不在 0..1`);
    }
    const camera = motionShots.get(shot.id)?.camera ?? motionShots.get(shot.id)?.pose ?? shot.camera;
    const samples = cameraSamples(camera, shot).filter((p) => p.position || p.target || finiteNumber(p.fov));
    if (!samples.length) { warn('POSE_MISSING', `${shot.id} 没有可核验的 camera pose 数值`); }
    else {
      poseShotCount++;
      sampleCount += samples.length;
      const limit = maxVelocity(camera, timeline);
      for (let i = 0; i < samples.length; i++) {
        const p = samples[i];
        for (const key of ['frame', 'fov']) if (p[key] !== undefined && !finiteNumber(p[key])) error('POSE_NONFINITE', `${shot.id} pose.${key} 不是有限数`);
        for (const key of ['position', 'target']) if (p[key] && !p[key].every(finiteNumber)) error('POSE_NONFINITE', `${shot.id} pose.${key} 含非有限数`);
        if (i === 0) continue;
        const prev = samples[i - 1], frameDelta = Math.max(1, Math.abs((p.frame ?? i) - (prev.frame ?? i - 1))), dt = frameDelta / fps;
        const pd = dist(prev.position, p.position) ?? 0, td = dist(prev.target, p.target) ?? 0;
        const fd = finiteNumber(prev.fov) && finiteNumber(p.fov) ? Math.abs(p.fov - prev.fov) : 0;
        const velocity = Math.max(pd, td) / Math.max(dt, 1 / fps);
        if (velocity > limit + EPS) error('POSE_DISCONTINUITY', `${shot.id} 相机 pose 速度超过上限`, {fromFrame: prev.frame, toFrame: p.frame, velocity, maxVelocity: limit, positionDelta: pd, targetDelta: td, fovDelta: fd});
      }
    }
    const markers = evidenceFor(shot, timeline);
    if (!markers.length) error('EVIDENCE_MISSING', `${shot.id} 缺少 evidence marker`);
    const shotMarkerIds = new Set();
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const id = textField(m, ['id', 'markerId', 'label', 'claim']);
      if (!id) error('EVIDENCE_ID', `${shot.id} 的 evidence ${i + 1} 缺少 id/label/claim`);
      else if (shotMarkerIds.has(id)) error('EVIDENCE_DUPLICATE', `${shot.id} evidence marker 重复：${id}`);
      else { shotMarkerIds.add(id); markerIds.add(id); }
      const hasTemporalField = ['frame', 'at', 'frameIndex', 'time', 'seconds', 'timeSeconds'].some((key) => finiteNumber(m?.[key]));
      const frame = markerFrame(m, fps);
      if (hasTemporalField && !finiteNumber(frame)) error('EVIDENCE_FRAME', `${shot.id}/${id || i + 1} 的 frame/time 无效`);
      else if (hasTemporalField && finiteNumber(shot.start) && finiteNumber(shot.end) && (frame < shot.start || frame > shot.end)) error('EVIDENCE_RANGE', `${shot.id}/${id || i + 1} 不在 shot 范围内`, {frame, start: shot.start, end: shot.end});
      if (!textField(m, ['source', 'citation', 'doi', 'claim', 'type', 'kind'])) warn('EVIDENCE_CONTEXT', `${shot.id}/${id || i + 1} 缺少 source/claim/type 上下文`);
    }
  }
  for (let i = 0; i < shots.length - 1; i++) {
    const a = shots[i], b = shots[i + 1];
    const aAnchors = anchorIds(a.anchor), bAnchors = anchorIds(b.anchor), shared = aAnchors.filter((id) => bAnchors.includes(id));
    const h = handoffObject(a.handoff), from = anchorIds(h.fromAnchor ?? h.outAnchor ?? h.from), to = anchorIds(h.toAnchor ?? h.inAnchor ?? h.toAnchorId ?? h.to);
    const mapped = from.some((id) => aAnchors.includes(id)) && to.some((id) => bAnchors.includes(id));
    const transitionMode = typeof a.handoff === 'string' ? a.handoff.trim().toLowerCase() : '';
    // ShotSpec uses a legal transition kind plus matching cameraOut/cameraIn
    // poses as the physical relay. An explicit anchor mapping is stronger;
    // when semantic anchors change, keep that implicit case visible as a warn.
    if (!shared.length && !mapped && !transitionMode) error('ANCHOR_HANDOFF', `${a.id} → ${b.id} 没有连续 anchor 或显式 fromAnchor/toAnchor`, {from: aAnchors, to: bAnchors});
    else if (!shared.length && !mapped) warn('ANCHOR_IMPLICIT', `${a.id} → ${b.id} 依赖 transition kind 与相机接力，未声明 fromAnchor/toAnchor`, {from: aAnchors, to: bAnchors, transition: transitionMode});
    if (a.handoff !== undefined) {
      const target = typeof a.handoff === 'string' ? '' : handoffTarget(a.handoff);
      if (target && target !== b.id) error('HANDOFF_TARGET', `${a.id} handoff 指向 ${target}，预期 ${b.id}`);
    }
    const aSamples = cameraSamples(a.camera, a), bSamples = cameraSamples(b.camera, b);
    const last = aSamples.at(-1), first = bSamples[0];
    if (last?.position && first?.position) {
      const gap = dist(last.position, first.position);
      const allowed = numberField(h, ['maxGap', 'maxPositionGap']) ?? DEFAULT_MAX_HANDOFF_GAP;
      if (gap > allowed + EPS && !mapped) error('CAMERA_HANDOFF_GAP', `${a.id} → ${b.id} 相机位置接力断裂`, {gap, allowed});
    }
  }
  report.checks.camera = {shotsWithPoses: poseShotCount, poseSamples: sampleCount, maxVelocityDefault: DEFAULT_MAX_VELOCITY};
  report.checks.anchors = {shots: shots.length};
  report.checks.evidence = {markers: markerIds.size};
}

if (jsonOutput) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${report.ok ? 'PASS' : 'FAIL'} qa_motion_v2`);
  for (const e of report.errors) console.log(`  ERROR ${e.code}: ${e.message}${e.detail ? ` ${JSON.stringify(e.detail)}` : ''}`);
  for (const w of report.warnings) console.log(`  WARN  ${w.code}: ${w.message}${w.detail ? ` ${JSON.stringify(w.detail)}` : ''}`);
  for (const [key, value] of Object.entries(report.checks)) console.log(`  ${key}: ${JSON.stringify(value)}`);
}
process.exitCode = report.ok ? 0 : 1;
