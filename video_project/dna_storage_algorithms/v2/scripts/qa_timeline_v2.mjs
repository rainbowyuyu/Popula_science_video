#!/usr/bin/env node
/**
 * Deterministic timeline QA for the DNA V2 film.
 *
 * The checker intentionally has no project dependencies and never reaches the
 * network.  It accepts the stable timeline contract (timeline.scenes or
 * timeline.shots) while keeping aliases for early V2 drafts.  It reports
 * missing data rather than silently inventing defaults.
 */

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (s) => s.slice(1)).replaceAll('/', path.sep));
const V2 = path.resolve(HERE, '..');
const DEFAULT_TIMELINE = path.join(V2, 'src', 'timeline.json');
const DEFAULT_DELIVERY = path.join(V2, 'delivery_v2');
const TOTAL_FRAMES = 9000;
const EPS = 1e-6;

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueAfter = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const jsonOutput = has('--json');
const strictDelivery = has('--strict-delivery');
const timelinePath = path.resolve(valueAfter('--timeline', DEFAULT_TIMELINE));
const deliveryPath = path.resolve(valueAfter('--delivery', DEFAULT_DELIVERY));

const report = {
  ok: true,
  timeline: timelinePath,
  delivery: deliveryPath,
  errors: [],
  warnings: [],
  checks: {},
};

function error(code, message, detail = undefined) {
  report.ok = false;
  report.errors.push({code, message, ...(detail === undefined ? {} : {detail})});
}
function warn(code, message, detail = undefined) {
  report.warnings.push({code, message, ...(detail === undefined ? {} : {detail})});
}
function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
function integer(value) {
  return Number.isInteger(value);
}
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    error('READ_JSON', `无法读取 JSON：${file}`, String(e?.message ?? e));
    return null;
  }
}
function numberField(obj, keys) {
  for (const key of keys) {
    if (obj && finiteNumber(obj[key])) return obj[key];
  }
  return undefined;
}
function idField(obj, fallback = '') {
  if (!obj || typeof obj !== 'object') return fallback;
  return String(obj.id ?? obj.shotId ?? obj.sceneId ?? obj.name ?? fallback);
}
function textField(obj, keys) {
  for (const key of keys) if (typeof obj?.[key] === 'string' && obj[key].trim()) return obj[key].trim();
  return '';
}
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}
function shotList(timeline) {
  for (const key of ['shots', 'scenes', 'shotSpecs', 'sequence']) {
    if (Array.isArray(timeline?.[key])) return timeline[key];
  }
  if (Array.isArray(timeline)) return timeline;
  return [];
}
function timelineFrames(timeline) {
  const explicit = numberField(timeline, ['durationFrames', 'totalFrames', 'duration']);
  if (finiteNumber(timeline?.durationSeconds) && !finiteNumber(timeline?.durationFrames)) {
    const fps = numberField(timeline, ['fps', 'frameRate']) ?? 30;
    return Math.round(timeline.durationSeconds * fps);
  }
  return explicit ?? TOTAL_FRAMES;
}
function normalizeShot(raw, index) {
  const nested = raw?.shotSpec && typeof raw.shotSpec === 'object' ? raw.shotSpec : raw;
  const start = numberField(nested, ['start', 'startFrame', 'from']);
  const end = numberField(nested, ['end', 'endFrame', 'to']);
  const camera = nested?.camera ?? nested?.cameraSpec ?? nested?.pose ?? nested?.cameraPath ?? (nested?.cameraIn && nested?.cameraOut ? {in: nested.cameraIn, out: nested.cameraOut} : undefined);
  const anchor = nested?.anchor ?? nested?.anchors ?? nested?.anchorId ?? nested?.anchorIds;
  const handoff = nested?.handoff ?? nested?.transition ?? nested?.transitionTo ?? nested?.transitionOut;
  const captions = nested?.captions ?? nested?.captionIds ?? nested?.subtitleIds;
  const evidence = nested?.evidence ?? nested?.evidenceMarks ?? nested?.evidenceTags;
  return {raw, nested, index, id: idField(nested, `shot-${index + 1}`), start, end, startSec: nested?.startSec, endSec: nested?.endSec, camera, anchor, handoff, captions, evidence};
}
function anchorIds(value) {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (Array.isArray(value)) return value.flatMap(anchorIds);
  if (value && typeof value === 'object') {
    const id = value.id ?? value.anchorId ?? value.name;
    if (typeof id === 'string' && id.trim()) return [id.trim()];
    return [...new Set(Object.values(value).flatMap(anchorIds))];
  }
  return [];
}
function handoffTarget(value) {
  if (typeof value === 'string') return LEGAL_HANDOFF_MODES.has(value.trim().toLowerCase()) ? '' : value.trim();
  if (value && typeof value === 'object') return textField(value, ['to', 'target', 'next', 'nextShot', 'shotId', 'id']);
  return '';
}
function handoffMode(value) {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (!value || typeof value !== 'object') return '';
  return textField(value, ['mode', 'type', 'style', 'kind']).toLowerCase();
}
const ILLEGAL_HANDOFF_MODES = new Set(['cut', 'hard-cut', 'hardcut', 'fade', 'dissolve', 'pop', 'teleport', 'jump']);
const LEGAL_HANDOFF_MODES = new Set(['track', 'tracking', 'dolly', 'push', 'pull', 'arc', 'orbit', 'through', 'occlusion', 'occlude', 'bridge', 'match', 'continuous', 'camera', 'zoom', 'wipe', 'slide', 'pan', 'tilt', 'custom', 'camera-dolly', 'orbit-match', 'macro-push', 'particle-bridge', 'data-wipe', 'hold']);

function frameValue(obj, keys, fps) {
  const frames = numberField(obj, keys);
  if (finiteNumber(frames)) return frames;
  const seconds = numberField(obj, keys.map((key) => key.replace(/Frame$/i, 'Sec')));
  return finiteNumber(seconds) ? seconds * fps : undefined;
}

function inspectAudio(timeline) {
  const expectedFrames = timelineFrames(timeline);
  const fps = numberField(timeline, ['fps', 'frameRate']) ?? 30;
  const expectedSeconds = expectedFrames / fps;
  const declared = timeline?.audio ?? timeline?.audioTrack ?? timeline?.sound;
  const declaredDuration = numberField(declared, ['durationFrames', 'frames', 'durationSec', 'durationSeconds', 'seconds', 'duration']);
  if (finiteNumber(declaredDuration)) {
    const explicitlySeconds = finiteNumber(declared?.durationSec) || finiteNumber(declared?.durationSeconds) || finiteNumber(declared?.seconds);
    const declaredSeconds = explicitlySeconds ? declaredDuration : (declaredDuration > expectedFrames * 1.1 ? declaredDuration : declaredDuration / fps);
    const delta = Math.abs(declaredSeconds - expectedSeconds);
    if (delta > 1 / fps + EPS) error('AUDIO_DECLARED_LENGTH', `时间线声明的音频长度与 ${expectedFrames} 帧不一致`, {declared: declaredDuration, expectedSeconds, delta});
    report.checks.audioDeclared = {durationSeconds: declaredSeconds, expectedSeconds, delta};
  }
  // A render pipeline may publish a small audio manifest before the encoded
  // media is copied into delivery_v2.  Use it as a deterministic fallback.
  if (fs.existsSync(deliveryPath)) {
    for (const name of ['audio-manifest.json', 'audio-mix-manifest.json', 'audio.json']) {
      const file = path.join(deliveryPath, name);
      if (!fs.existsSync(file)) continue;
      const manifest = readJson(file);
      const seconds = numberField(manifest, ['durationSeconds', 'durationSec', 'seconds']);
      if (finiteNumber(seconds)) {
        const delta = Math.abs(seconds - expectedSeconds);
        report.checks.audioManifest = {file, seconds, expectedSeconds, delta};
        if (delta > 1 / fps + 0.03) error('AUDIO_MANIFEST_LENGTH', `音频 manifest 长度偏离时间线：${file}`, report.checks.audioManifest);
        break;
      }
    }
  }
  const candidates = [];
  if (declared && typeof declared === 'object') {
    const p = textField(declared, ['path', 'file', 'src', 'audioPath']);
    if (p) candidates.push(path.resolve(path.dirname(timelinePath), p));
  }
  if (fs.existsSync(deliveryPath)) {
    for (const name of fs.readdirSync(deliveryPath)) {
      if (/\.(wav|mp3|m4a|aac|flac|ogg|mp4|webm)$/i.test(name)) candidates.push(path.join(deliveryPath, name));
    }
  }
  const unique = [...new Set(candidates.filter((p) => fs.existsSync(p)))];
  let measured = null;
  for (const file of unique) {
    const d = mediaDuration(file);
    if (finiteNumber(d)) { measured = {file, seconds: d}; break; }
  }
  if (!measured) {
    const message = `delivery_v2 未找到可测量的音频/视频音轨：${deliveryPath}`;
    if (strictDelivery) error('AUDIO_MISSING', message); else warn('AUDIO_MISSING', message);
  } else {
    const delta = Math.abs(measured.seconds - expectedSeconds);
    measured.expectedSeconds = expectedSeconds;
    measured.delta = delta;
    report.checks.audioMeasured = measured;
    if (delta > 1 / fps + 0.03) error('AUDIO_LENGTH', `音轨长度偏离时间线超过一帧：${measured.file}`, measured);
  }
}
function wavDuration(file) {
  const b = fs.readFileSync(file);
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
  const byteRate = b.readUInt32LE(28);
  const dataOffset = b.indexOf(Buffer.from('data'));
  if (!byteRate || dataOffset < 0 || dataOffset + 8 > b.length) return null;
  return b.readUInt32LE(dataOffset + 4) / byteRate;
}
function mediaDuration(file) {
  try {
    if (/\.wav$/i.test(file)) return wavDuration(file);
    const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], {encoding: 'utf8', windowsHide: true});
    if (p.status === 0 && finiteNumber(Number.parseFloat(p.stdout.trim()))) return Number.parseFloat(p.stdout.trim());
  } catch { /* optional ffprobe */ }
  return null;
}

const timeline = fs.existsSync(timelinePath) ? readJson(timelinePath) : null;
if (!timeline) {
  error('TIMELINE_MISSING', `时间线不存在：${timelinePath}`);
} else {
  const fps = numberField(timeline, ['fps', 'frameRate']);
  if (!finiteNumber(fps) || fps <= 0) error('FPS', '时间线缺少正数 fps/frameRate');
  const total = timelineFrames(timeline);
  if (total !== TOTAL_FRAMES) error('TOTAL_FRAMES', `V2 要求覆盖 0..${TOTAL_FRAMES}，当前 duration=${total}`);
  if (finiteNumber(timeline.durationSec) && Math.abs(timeline.durationSec * fps - total) > EPS) error('DURATION_MISMATCH', 'durationSec × fps 与 durationFrames 不一致', {durationSec: timeline.durationSec, fps, durationFrames: total});
  const rawShots = shotList(timeline);
  if (!rawShots.length) error('SHOTS_MISSING', '时间线缺少 shots/scenes 数组');
  const shots = rawShots.map(normalizeShot).map((s) => ({...s, start: finiteNumber(s.start) ? s.start : (finiteNumber(s.startSec) ? s.startSec * fps : undefined), end: finiteNumber(s.end) ? s.end : (finiteNumber(s.endSec) ? s.endSec * fps : undefined)}));
  const sorted = [...shots].sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  const seen = new Set();
  for (const s of shots) {
    if (seen.has(s.id)) error('SHOT_ID_DUPLICATE', `Shot id 重复：${s.id}`);
    seen.add(s.id);
    if (!finiteNumber(s.start) || !finiteNumber(s.end)) error('SHOT_RANGE', `${s.id} 缺少 start/end 帧`);
    else if (!integer(s.start) || !integer(s.end) || s.start < 0 || s.end > total || s.start >= s.end) error('SHOT_RANGE', `${s.id} 的帧范围无效`, {start: s.start, end: s.end});
    const missing = [];
    const n = s.nested ?? {};
    const required = [
      ['kind', n.kind], ['title', n.title], ['visualIntent', n.visualIntent],
      ['cameraIn', n.cameraIn], ['cameraOut', n.cameraOut], ['anchors', n.anchors],
      ['assetIds', n.assetIds], ['narrationCueIds', n.narrationCueIds],
    ];
    for (const [key, value] of required) if (value === undefined || value === null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0)) missing.push(key);
    if (s.handoff === undefined && s.id !== sorted.at(-1)?.id) missing.push('transitionOut/handoff');
    if (missing.length) error('SHOTSPEC_REQUIRED', `${s.id} 缺少 ShotSpec 字段：${missing.join(', ')}`);
    for (const transitionKey of ['transitionIn', 'transitionOut']) {
      const transition = n[transitionKey];
      if (transition === undefined) continue;
      const mode = handoffMode(transition);
      if (ILLEGAL_HANDOFF_MODES.has(mode)) error('HANDOFF_ILLEGAL', `${s.id}.${transitionKey} 使用禁止的硬切/淡化：${mode}`);
      else if (mode && !LEGAL_HANDOFF_MODES.has(mode)) warn('HANDOFF_MODE_UNKNOWN', `${s.id}.${transitionKey} 未登记：${mode}`);
    }
  }
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i], next = sorted[i + 1];
    if (i === 0 && s.start !== 0) error('COVERAGE_START', `首个 shot 未从 0 开始：${s.id}`);
    if (next) {
      if (s.end > next.start) error('SHOT_OVERLAP', `Shot 重叠：${s.id} → ${next.id}`, {end: s.end, nextStart: next.start});
      if (s.end < next.start) error('SHOT_GAP', `Shot 有空档：${s.id} → ${next.id}`, {end: s.end, nextStart: next.start});
      if (s.handoff !== undefined) {
        const target = handoffTarget(s.handoff);
        if (target && target !== next.id) error('HANDOFF_TARGET', `${s.id} handoff 未指向相邻 shot ${next.id}`, {target});
        const mode = handoffMode(s.handoff);
        if (ILLEGAL_HANDOFF_MODES.has(mode)) error('HANDOFF_ILLEGAL', `${s.id} 使用禁止的硬切/淡化 handoff：${mode}`);
        else if (mode && !LEGAL_HANDOFF_MODES.has(mode)) warn('HANDOFF_MODE_UNKNOWN', `${s.id} handoff mode 未登记：${mode}`);
      }
    } else if (s.end !== total) error('COVERAGE_END', `末个 shot 未结束于 ${total}：${s.id}`, {end: s.end});
  }
  const captions = asArray(timeline.captions ?? timeline.subtitles ?? timeline.subtitleWindows ?? timeline.narration);
  const shotIds = new Set(shots.map((s) => s.id));
  const evidenceIds = new Set(asArray(timeline.evidence).map((e) => String(e?.id ?? '')));
  for (const s of shots) {
    for (const id of asArray(s.nested?.evidenceIds)) if (!evidenceIds.has(String(id))) error('EVIDENCE_REF', `${s.id} 引用了不存在的 evidence：${id}`);
  }
  for (let i = 0; i < captions.length; i++) {
    const c = captions[i];
    const start = frameValue(c, ['start', 'startFrame', 'from'], fps);
    const end = frameValue(c, ['end', 'endFrame', 'to'], fps);
    if (!finiteNumber(start) || !finiteNumber(end) || start < 0 || end > total || start >= end) error('CAPTION_WINDOW', `字幕 ${i + 1} 窗口无效`, {start, end});
    // The final evidence hold intentionally has no spoken line: its five
    // seconds are reserved for reading the papers and formulas. Keep it in
    // the cue ledger for timing, but do not force a blank subtitle on screen.
    const silentTerminal = c?.audio === 'silent' && i === captions.length - 1 && end === total;
    if (!textField(c, ['text', 'spoken', 'caption']) && !silentTerminal) error('CAPTION_TEXT', `字幕 ${i + 1} 缺少 text`);
    const shotId = textField(c, ['shotId', 'sceneId']);
    if (shotId && !shotIds.has(shotId)) error('CAPTION_SHOT_REF', `字幕 ${i + 1} 引用了不存在的 shot：${shotId}`);
    if (finiteNumber(start) && finiteNumber(end)) {
      const owner = sorted.find((s) => start >= s.start && end <= s.end);
      if (!owner) error('CAPTION_CROSS_SHOT', `字幕 ${i + 1} 横跨 shot 边界`, {start, end});
      if (shotId && owner && owner.id !== shotId) error('CAPTION_SHOT_MISMATCH', `字幕 ${i + 1} 的 shotId 与帧范围不一致`, {shotId, owner: owner.id});
    }
    const prev = captions[i - 1];
    const ps = frameValue(prev, ['start', 'startFrame', 'from'], fps);
    const pe = frameValue(prev, ['end', 'endFrame', 'to'], fps);
    if (finiteNumber(ps) && finiteNumber(pe) && start < pe) error('CAPTION_OVERLAP', `字幕 ${i} 与字幕 ${i + 1} 重叠`);
  }
  report.checks.shots = {count: shots.length, first: sorted[0]?.id, last: sorted.at(-1)?.id, totalFrames: total};
  report.checks.captions = {count: captions.length};
  inspectAudio(timeline);
}

if (jsonOutput) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${report.ok ? 'PASS' : 'FAIL'} qa_timeline_v2`);
  for (const e of report.errors) console.log(`  ERROR ${e.code}: ${e.message}${e.detail ? ` ${JSON.stringify(e.detail)}` : ''}`);
  for (const w of report.warnings) console.log(`  WARN  ${w.code}: ${w.message}${w.detail ? ` ${JSON.stringify(w.detail)}` : ''}`);
  for (const [key, value] of Object.entries(report.checks)) console.log(`  ${key}: ${JSON.stringify(value)}`);
}
process.exitCode = report.ok ? 0 : 1;
