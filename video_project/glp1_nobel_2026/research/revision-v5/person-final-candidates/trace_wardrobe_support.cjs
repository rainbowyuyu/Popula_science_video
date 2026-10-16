var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// <stdin>
var import_node_fs = __toESM(require("node:fs"));
var T3 = __toESM(require("three"));

// src/V5CameraPath.ts
var T2 = __toESM(require("three"), 1);

// src/visual.ts
var T = __toESM(require("three"), 1);
var V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
var clamp = (x) => Math.max(0, Math.min(1, x));
var smooth = (x) => {
  const u = clamp(x);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
function stateAt(frame, tl2) {
  const s = tl2.sections.find((s2) => frame >= s2.start && frame < s2.end) ?? (frame < tl2.sections[0].start ? tl2.sections[0] : tl2.sections[tl2.sections.length - 1]);
  const c = tl2.clips.filter((c2) => c2.start <= frame).at(-1) ?? tl2.clips[0];
  return { frame, time: frame / tl2.fps, section: s.id, progress: clamp((frame - s.start) / (s.end - s.start)), elapsed: (frame - s.start) / tl2.fps, clip: c, clipProgress: clamp((frame - c.start) / (c.end - c.start)) };
}

// src/V5CameraPath.ts
var defaults = {
  meal: { anchor: "mealPerson", distance: 2.7, az: 0.46, el: 0.16 },
  action_meal: { anchor: "mealPerson", distance: 2.6, az: 0.37, el: 0.17 },
  torso: { anchor: "torso", distance: 1.17, az: 0.13, el: 0.06 },
  homecheck: { anchor: "measurement", distance: 2.6, az: 0.3, el: 0.12 },
  stomach: { anchor: "stomach", distance: 0.51, az: 0.16, el: 0.11 },
  gut: { anchor: "small_intestine", distance: 0.54, az: 0.12, el: 0.1 },
  lcell: { anchor: "intestinal", distance: 3e-4, az: 0.13, el: 0.15 },
  pancreas: { anchor: "pancreas", distance: 0.38, az: 0.13, el: 0.12 },
  islet: { anchor: "islet", distance: 45e-5, az: 0.08, el: 0.12 },
  beta: { anchor: "beta", distance: 49e-6, az: 0.05, el: 0.09 },
  receptor: { anchor: "receptor", distance: 39e-9, az: 0.08, el: 0.14 },
  secretion: { anchor: "secretion", distance: 42e-7, az: 0.12, el: 0.08 },
  liver: { anchor: "liver", distance: 0.6, az: -0.13, el: 0.1 },
  lipid_liver: { anchor: "liver", distance: 0.55, az: -0.09, el: 0.1 },
  pressure: { anchor: "artery", distance: 0.085, az: 0.48, el: 0.48 },
  arteriole: { anchor: "arteriole", distance: 45e-4, az: 0.09, el: 0.12 },
  kidney: { anchor: "kidney", distance: 0.55, az: 0.07, el: 0.12 },
  nephron: { anchor: "nephron", distance: 68e-4, az: 0.07, el: 0.12 },
  autonomic: { anchor: "autonomic", distance: 1.12, az: -0.12, el: 0.06 },
  lipoprotein: { anchor: "lipid", distance: 8e-7, az: 0.08, el: 0.12 },
  lipid_wall: { anchor: "lipidWall", distance: 35e-7, az: 0.08, el: 0.2 },
  plaque: { anchor: "plaque", distance: 0.03, az: 0.8, el: 0.42 },
  thrombus: { anchor: "thrombus", distance: 0.014, az: 0.95, el: 0.32 },
  brainheart: { anchor: "brainheart", distance: 1.28, az: 0.14, el: 0.07 },
  drug: { anchor: "drug", distance: 24e-9, az: 0.06, el: 0.13 },
  muscle: { anchor: "personActivity", distance: 3.35, az: 0.2, el: 0.1 },
  muscle_cell: { anchor: "muscleCell", distance: 18e-7, az: 0.1, el: 0.24 },
  clot_detail: { anchor: "clotDetail", distance: 75e-6, az: 0.16, el: 0.46 }
};
var viewOf = (clip) => clip.mechanism === "glucose_absorption" ? "gut" : ["h037", "h042"].includes(clip.id) ? "lipoprotein" : clip.id === "h038" ? "plaque" : clip.id === "h039" ? "lipid_wall" : clip.view ?? "torso";
function opticalEase(t) {
  const x = clamp(t), a = 0.12, area = (u) => u * u * u - 0.5 * u * u * u * u;
  if (x < a) return a * area(x / a) / (1 - a);
  if (x > 1 - a) return 1 - a * area((1 - x) / a) / (1 - a);
  return (x - a * 0.5) / (1 - a);
}
var V5CameraPath = class {
  constructor(anchors2, tl2) {
    this.anchors = anchors2;
    this.tl = tl2;
    anchors2.torso ??= V(0, 1.26, 0.02);
    anchors2.autonomic ??= V(0, 1.4, 0);
    anchors2.brainheart ??= V(0.01, 1.43, 0.018);
    anchors2.muscle ??= V(0.19, 0.86, 0.025);
    const poses = tl2.clips.map((c, i) => this.poseFor(c, i));
    const add = (frame, p) => this.knots.push({ frame, ...p, focus: p.focus.clone() });
    if (!poses.length) throw new Error("V5 requires at least one timeline clip");
    add(0, poses[0]);
    add(tl2.clips[0].start + tl2.clips[0].duration * 0.6, poses[0]);
    let previousArrival = tl2.clips[0].start + tl2.clips[0].duration * 0.6;
    for (let i = 1; i < poses.length; i++) {
      const prev = tl2.clips[i - 1], current = tl2.clips[i], a = poses[i - 1], b = poses[i];
      const same = viewOf(prev) === viewOf(current) && !current.camera;
      const decades = Math.abs(Math.log10(a.distance / b.distance));
      const previouslyRepeated = i > 1 && viewOf(this.tl.clips[i - 2]) === viewOf(prev);
      const nextRepeated = i + 1 < tl2.clips.length && viewOf(this.tl.clips[i + 1]) === viewOf(current);
      const retainDetail = a.distance < 1e-3 || ["cpap_airway", "atrial_stasis"].includes(prev.mechanism ?? "");
      const prevSpoken = prev.duration - (prev.additionalPauseAfterSeconds ?? 0) * tl2.fps;
      const currentSpoken = current.duration - (current.additionalPauseAfterSeconds ?? 0) * tl2.fps;
      const depart = current.id === "h066" ? 0.3 : current.id === "h052" ? 0.3 : current.id === "h074" ? 0.58 : prev.id === "h027" && current.id === "h028" ? 1 : retainDetail ? 0.78 : decades > 3 ? 0.16 : same ? 0.69 : 0.54;
      const settleGap = current.id === "h052" ? Math.min(24, prevSpoken * 0.08) : Math.min(75, prevSpoken * 0.16);
      const start = Math.max(prev.start + prevSpoken * depart, previousArrival + settleGap);
      const arrive = current.id === "h066" ? 0.08 : current.id === "h025" ? 0.28 : current.id === "h026" ? 0.25 : current.id === "h074" ? 0.14 : a.distance < 1e-3 && b.distance >= 3e-3 ? 0.64 : decades > 3 ? 0.36 : same ? 0.28 : 0.43;
      const end = current.start + currentSpoken * arrive, span = end - start;
      add(start, a);
      const shift = a.focus.distanceTo(b.focus), minDistance = Math.min(a.distance, b.distance);
      const lateral = shift > minDistance * 0.3;
      const transit = [a];
      if (lateral) {
        const separateMicroSites = Math.max(a.distance, b.distance) < 0.01 && shift > 0.02;
        const bridge = Math.max(current.id === "h016" && viewOf(prev) === "muscle_cell" ? 1.5 : 0, minDistance, separateMicroSites ? shift * 3.8 : Math.min(shift * 3.8, Math.max(a.distance, b.distance) * 1.65));
        if (a.distance < bridge * 0.65) {
          transit.push({ ...a, distance: bridge }, { ...b, distance: Math.max(bridge, b.distance) });
        } else if (b.distance < bridge * 0.65) {
          transit.push({ ...b, distance: Math.max(bridge, a.distance * 0.52) });
        } else transit.push({ focus: a.focus.clone().lerp(b.focus, 0.46), distance: Math.max(a.distance, b.distance, bridge), az: (a.az + b.az) * 0.5, el: (a.el + b.el) * 0.5 });
      }
      transit.push(b);
      const costs = transit.slice(1).map((p, j) => {
        const q = transit[j];
        return 0.9 + Math.abs(Math.log(p.distance / q.distance)) + 2.8 * p.focus.distanceTo(q.focus) / Math.max(p.distance, q.distance) + 0.65 * Math.abs(p.az - q.az);
      }), cost = costs.reduce((sum, x) => sum + x, 0);
      let elapsed = 0;
      for (let j = 1; j < transit.length; j++) {
        elapsed += costs[j - 1];
        const u = elapsed / cost, turn = smooth(u);
        add(start + span * u, { ...transit[j], az: T2.MathUtils.lerp(a.az, b.az, turn), el: T2.MathUtils.lerp(a.el, b.el, turn) });
      }
      previousArrival = end;
    }
    const last2 = tl2.clips.at(-1);
    add(last2.end, poses.at(-1));
    if (tl2.duration > last2.end + 30) {
      const offset = poses.at(-1).focus.clone().add(V(2.5, 0, 0));
      add(last2.end + Math.min(120, (tl2.duration - last2.end) * 0.6), { ...poses.at(-1), focus: offset, distance: 1.5 });
      add(tl2.duration, { ...poses.at(-1), focus: offset, distance: 1.5 });
    }
    this.knots.sort((a, b) => a.frame - b.frame);
    this.knots = this.knots.filter((k, i, a) => i === 0 || k.frame - a[i - 1].frame > 1e-3);
  }
  anchors;
  tl;
  knots = [];
  poseFor(clip, index) {
    const c = clip, d = { ...defaults[viewOf(clip)], ...c.camera };
    if (viewOf(clip) === "meal" && index > 4 && !c.camera) {
      d.anchor = "mealBowl";
      d.distance = 1.12;
      d.az = 0.25;
      d.el = 0.62;
    }
    if (c.mechanism === "atrial_stasis") {
      d.anchor = "leftAtrium";
      d.distance = 0.19;
      d.az = 0.65;
      d.el = 0.24;
    }
    if (c.mechanism === "sleep_apnea" || c.mechanism === "cpap_airway") {
      d.anchor = "airway";
      d.distance = 0.2;
      d.az = 1.27;
      d.el = 0.125;
    }
    if (c.mechanism === "anticoagulant") {
      d.anchor = "atrialClot";
      d.distance = 0.055;
      d.az = 0.58;
      d.el = 0.32;
    }
    if (c.id === "h039") {
      d.anchor = "foamCell";
      d.distance = 8e-5;
      d.az = 1.05;
      d.el = 0.28;
    }
    if (c.mechanism === "ccb" && viewOf(c) === "arteriole") d.az = 0.65;
    if (viewOf(clip) === "pressure" && (index === 0 || viewOf(this.tl.clips[index - 1]) !== "pressure") && !c.camera) {
      d.anchor = "heart";
      d.distance = 0.64;
    }
    if (viewOf(clip) === "homecheck" && index > 0 && viewOf(this.tl.clips[index - 1]) === "meal" && !c.camera) {
      d.distance = 3.02;
      d.az = 0.28;
      d.el = 0.1;
    }
    if (viewOf(clip) === "lipid_wall" && index > 0 && viewOf(this.tl.clips[index - 1]) === "lipid_wall" && !c.camera) {
      d.anchor = "foamCell";
      d.distance = 8e-5;
      d.az = 1.05;
    }
    if (viewOf(clip) === "lipoprotein" && index > 0 && viewOf(this.tl.clips[index - 1]) === "lipoprotein" && !c.camera) d.distance = 5e-7;
    const focus = this.anchors[d.anchor] ?? this.anchors.torso ?? V(0, 1.25, 0);
    const previous = index > 0 ? viewOf(this.tl.clips[index - 1]) : null;
    const repeated = previous === viewOf(clip);
    return { focus: focus.clone(), distance: d.distance * (repeated ? 1 + 0.025 * Math.sin(index * 0.8) : 1), az: d.az + (repeated ? 0.028 * Math.sin(index * 0.8) : 0), el: d.el };
  }
  sample(frame) {
    let i = this.knots.findIndex((k) => k.frame > frame) - 1;
    if (i < 0) i = frame < this.knots[0].frame ? 0 : Math.max(0, this.knots.length - 2);
    const a = this.knots[i], b = this.knots[Math.min(i + 1, this.knots.length - 1)];
    const t = (frame - a.frame) / Math.max(1, b.frame - a.frame), u = smooth(t);
    const focus = a.focus.clone().lerp(b.focus, u), distance = Math.exp(T2.MathUtils.lerp(Math.log(a.distance), Math.log(b.distance), opticalEase(t)));
    const az = T2.MathUtils.lerp(a.az, b.az, u), el = T2.MathUtils.lerp(a.el, b.el, u);
    const position = focus.clone().add(V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(distance));
    const target = focus.clone().addScaledVector(V(Math.cos(az), 0, -Math.sin(az)), -distance * 0.105);
    return { position, target, focus, distance, az, el };
  }
  apply(frame, camera) {
    const p = this.sample(frame);
    camera.position.copy(p.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(p.target);
    camera.fov = 34;
    camera.near = Math.max(1e-12, p.distance / 500);
    camera.far = Math.max(p.distance * 140, 1e-7);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return p;
  }
};

// <stdin>
var tl = JSON.parse(import_node_fs.default.readFileSync("src/timeline.json", "utf8"));
var evidence = JSON.parse(import_node_fs.default.readFileSync("research/revision-v5/garment-diagnostic/metrics.json", "utf8"));
var anchors = Object.fromEntries(Object.entries(evidence.anchors).map(([k, v]) => [k, new T3.Vector3(...v)]));
var route = new V5CameraPath(anchors, tl);
var closer = (d, a, b) => 1 - smooth(Math.log(Math.max(d, 1e-12) / a) / Math.log(b / a));
var last;
var context = { tl, anchors, cameraPath: route, person: { update: (v) => last = v }, viewWeight(s, views) {
  return Math.max(0, ...tl.clips.flatMap((c, i) => views.includes(viewOf(c)) ? [(i === 0 ? 1 : smooth((s.frame - (c.start - (tl.clips[i - 1]?.duration ?? 120) * 0.38)) / Math.max(45, (tl.clips[i - 1]?.duration ?? 120) * 0.35))) * (1 - smooth((s.frame - c.end) / Math.max(75, (tl.clips[i + 1]?.duration ?? 120) * 0.58)))] : []));
} };
function sample(s) {
  const pose = route.sample(s.frame), d = pose.distance, view = viewOf(s.clip);
  const clipIndex = this.tl.clips.findIndex((c) => c.id === s.clip.id);
  const nextClip = clipIndex >= 0 ? this.tl.clips[clipIndex + 1] : void 0;
  const nextView = nextClip ? viewOf(nextClip) : void 0;
  const outgoingToMacro = !!nextView && ["meal", "action_meal", "torso", "homecheck"].includes(nextView) && ["kidney", "nephron", "arteriole", "pressure", "lcell", "islet", "beta", "receptor", "secretion", "liver", "lipoprotein", "lipid_wall", "plaque", "thrombus", "brainheart", "drug", "muscle_cell", "clot_detail"].includes(view);
  const mealWeight = this.viewWeight(s, ["meal", "action_meal"]);
  const mealPreview = outgoingToMacro && nextView === "meal" ? smooth((s.frame - (s.clip.end - 60)) / 60) : 0;
  const mealRenderWeight = Math.max(mealWeight, mealPreview);
  const measurementWeight = this.viewWeight(s, ["homecheck"]);
  const measurementClip = this.tl.clips.findIndex((c) => viewOf(c) === "homecheck" && s.frame >= c.start - 180 && s.frame <= c.end + 180);
  const diningToMeasurement = measurementClip > 0 && viewOf(this.tl.clips[measurementClip - 1]) === "meal";
  const actionWeight = this.viewWeight(s, ["muscle"]);
  const personWeight = Math.max(mealRenderWeight, actionWeight, measurementWeight);
  const semantic = s.clip;
  const semanticWeight = (names) => Math.max(0, ...this.tl.clips.filter((c) => names.includes(c.mechanism ?? "")).map((c) => smooth((s.frame - c.start + 80) / 140) * (1 - smooth((s.frame - c.end) / 120))));
  const atrialWeight = semanticWeight(["atrial_stasis", "anticoagulant"]);
  const airwayWeight = semanticWeight(["sleep_apnea", "cpap_airway"]);
  const actionOf = (c) => ["meal", "action_meal"].includes(c.view ?? "") ? "eat" : c.view === "muscle" ? /muscle_training/.test(c.mechanism ?? "") ? "sitStand" : /preservation/.test(c.mechanism ?? "") ? "resistance" : /statin/.test(c.mechanism ?? "") ? "stand" : "walk" : "stand";
  const action = actionOf(semantic), personActions = { eat: mealRenderWeight };
  for (const c of this.tl.clips) {
    if (viewOf(c) !== "muscle") continue;
    const a = actionOf(c), enter = smooth((s.frame - c.start + 90) / 135), exit = 1 - smooth((s.frame - c.end + 15) / 120);
    personActions[a] = Math.max(personActions[a] ?? 0, enter * exit * actionWeight);
  }
  const actionTotal = Object.values(personActions).reduce((a, b) => a + b, 0);
  if (actionTotal > 1) for (const a of Object.keys(personActions)) personActions[a] /= actionTotal;
  const slimming = this.tl.clips.filter((c) => c.mechanism === "weight_feedback");
  const adiposity = slimming.length ? 0.68 * (1 - smooth((s.frame - slimming[0].start) / (slimming.at(-1).end - slimming[0].start))) : 0.68;
  const personOpticalBase = 1 - closer(d, 0.18, 0.7);
  const macroPreviewOptical = outgoingToMacro ? d > 0.65 ? 0.52 * smooth((s.frame - (s.clip.end - 75)) / 75) : 0 : 0;
  const measurementOptical = diningToMeasurement ? 1 : 1 - smooth(measurementWeight / 0.03) * closer(d, 0.8, 1.5);
  const mealEntryOptical = Math.min(1, ...this.tl.clips.filter((c) => ["h012", "h030", "h040", "h052"].includes(c.id)).map((c) => {
    const bowl = this.anchors.mealBowl;
    const broadArrival = bowl ? this.cameraPath.knots.find((k) => k.frame >= c.start && k.frame < c.end && k.distance >= 1.5 && k.focus.distanceTo(bowl) < 1e-6) : void 0;
    if (!broadArrival) return 1;
    const entryWindow = smooth((s.frame - c.start + 240) / 60) * (1 - smooth((s.frame - (broadArrival.frame - 30)) / 30));
    return 1 - entryWindow * smooth(mealRenderWeight / 0.03) * closer(d, 0.8, 1.5);
  }));
  const muscleReturnClip = this.tl.clips.find((c) => c.id === "h016");
  const muscleReturnWindow = muscleReturnClip ? smooth((s.frame - muscleReturnClip.start + 250) / 90) * (1 - smooth((s.frame - muscleReturnClip.start - 180) / 90)) : 0;
  const muscleReturnFigure = 1 - muscleReturnWindow * closer(d, 1.2, 2.4);
  const personOptical = Math.max(personOpticalBase, macroPreviewOptical) * measurementOptical * mealEntryOptical * muscleReturnFigure;
  const seatedConflict = Math.max(measurementWeight, ...this.tl.clips.filter((c) => ["h012", "h030", "h040", "h052"].includes(c.id)).map((c) => smooth((s.frame - c.start + 240) / 60) * (1 - smooth((s.frame - c.end) / 90))));
  const organRetireThreshold = 0.5 - 0.46 * smooth(seatedConflict / 0.05);
  const visiblePerson = personWeight * personOptical;
  this.person?.update({ time: s.time, action, actionWeights: personActions, adiposity, weight: 1, seatedWeight: mealRenderWeight > 0 ? mealRenderWeight : void 0, measurementWeight, opacity: personWeight * personOptical, propsOpacity: Math.max(mealRenderWeight, actionWeight) * personOptical, wardrobeOpacity: personWeight * personOptical });
  return { frame: s.frame, clip: s.clip.id, distance: d, opacity: last.wardrobeOpacity };
}
var rows = Array.from({ length: tl.duration }, (_, frame) => sample.call(context, stateAt(frame, tl)));
function ranges(list) {
  const r = [];
  for (const f of list) {
    const last2 = r.at(-1);
    if (last2 && f === last2[1] + 1) last2[1] = f;
    else r.push([f, f]);
  }
  return r;
}
var partial = rows.filter((r) => r.opacity > 0 && r.opacity < 0.998);
var supports = ranges(partial.map((r) => r.frame));
var padded = ranges([...new Set(supports.flatMap(([a, b]) => Array.from({ length: Math.min(tl.duration - 1, b + 30) - Math.max(0, a - 30) + 1 }, (_, i) => Math.max(0, a - 30) + i)))].sort((a, b) => a - b));
var report = { method: "CPU evaluation of the exact extracted V5World person-opacity block, current V5CameraPath and saved same-atlas anchors; no rendering.", totalFrames: tl.duration, partialAlphaFrames: partial.length, rawRanges: supports, paddedRanges: padded, thresholdCrossings: rows.filter((r, i) => i > 0 && r.opacity >= 0.998 !== rows[i - 1].opacity >= 0.998).map((r) => ({ before: rows[r.frame - 1], after: r })), rows };
import_node_fs.default.writeFileSync("research/revision-v5/person-final-candidates/wardrobe-alpha-support.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, rows: void 0 }, null, 2));
