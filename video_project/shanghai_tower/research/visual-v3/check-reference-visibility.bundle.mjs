// research/visual-v3/check-reference-visibility.ts
import fs from "node:fs";
import * as T2 from "three";

// src/visual.ts
import * as T from "three";
var V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
var clamp = (v) => Math.max(0, Math.min(1, v));
var smooth = (v) => {
  const t = clamp(v);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var mix = (a, b, t) => a + (b - a) * t;
var stateAt = (frame, tl2) => {
  const s = tl2.sections.find((s2) => frame >= s2.start && frame < s2.end) ?? (frame < tl2.sections[0].start ? tl2.sections[0] : tl2.sections.at(-1));
  const clip = tl2.clips.filter((s2) => frame >= s2.start).at(-1) ?? tl2.clips[0];
  return { frame, time: frame / tl2.fps, section: s.id, p: clamp((frame - s.start) / (s.end - s.start)), clip, n: Number(clip.id.slice(1)), u: clamp((frame - clip.start) / (clip.end - clip.start)) };
};
var ramp = (a, b, v) => smooth((v - a) / (b - a));
var pulse = (a, b, c, d, v) => ramp(a, b, v) * (1 - ramp(c, d, v));

// src/CameraPath.ts
var columns = ["x", "y", "z", "r", "az", "el", "shift"];
function flowingCurve(times, values) {
  const slopes = values.slice(1).map((v, i) => (v - values[i]) / (times[i + 1] - times[i]));
  const derivatives = values.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === values.length - 1) return slopes.at(-1);
    const a = slopes[i - 1], b = slopes[i];
    if (a * b <= 0) return 0;
    const ha = times[i] - times[i - 1], hb = times[i + 1] - times[i];
    return 3 * (ha + hb) / ((2 * hb + ha) / a + (hb + 2 * ha) / b);
  });
  return (t) => {
    if (t <= times[0]) return values[0];
    if (t >= times.at(-1)) return values.at(-1);
    const i = times.findIndex((x, j) => j > 0 && t <= x) - 1, h = times[i + 1] - times[i];
    const s = clamp((t - times[i]) / h), d = values[i + 1] - values[i], v0 = derivatives[i] * h, v1 = derivatives[i + 1] * h;
    const a3 = 10 * d - 6 * v0 - 4 * v1, a4 = -15 * d + 8 * v0 + 7 * v1, a5 = 6 * d - 3 * v0 - 3 * v1;
    return values[i] + v0 * s + a3 * s ** 3 + a4 * s ** 4 + a5 * s ** 5;
  };
}
var CameraPath = class {
  constructor(tl2) {
    this.tl = tl2;
    this.rebuild();
  }
  tl;
  keys = [];
  curves = {};
  anchors = {};
  timeAt(u) {
    const n = Math.floor(u), clip = this.tl.clips.find((c) => Number(c.id.slice(1)) === n);
    if (!clip) return u < 1 ? 0 : this.tl.duration / this.tl.fps;
    return mix(clip.start, clip.end, u - n) / this.tl.fps;
  }
  setAnchors(anchors) {
    this.anchors = anchors;
    this.rebuild();
  }
  rebuild() {
    const tmdY = (this.anchors.TMD?.[1] ?? 583.5) * 0.01;
    const poses = [
      { u: 0, y: 3.05, r: 13.2, az: 0.3, el: -0.075, shift: -190 },
      { u: 1.15, y: 3.16, r: 13.6, az: 0.51, el: 0.035 },
      { u: 2, y: 3.38, r: 17.6, az: 0.87, el: 0.2 },
      { u: 3, y: 3.4, r: 16.8, az: 1.17, el: 0.26 },
      { u: 4, y: 2.9, r: 14.2, az: 1.36, el: 0.17 },
      { u: 5, y: -0.18, r: 3.7, az: 1.42, el: 0.2 },
      { u: 6.1, y: -0.46, r: 2.7, az: 1.57, el: 0.08, shift: -235 },
      { u: 7.2, y: -0.57, r: 2.4, az: 1.77, el: 0.08, x: 0.125, z: 0.25 },
      { u: 8.25, y: -0.28, r: 2.3, az: 1.98, el: 0.28 },
      { u: 9.1, y: -0.06, r: 3.2, az: 2.12, el: 0.26 },
      { u: 10.25, y: 1.2, r: 3.1, az: 2.29, el: 0.18 },
      { u: 11.15, y: 1.4, r: 1.55, az: 2.47, el: 0.36, focus: "coreInterior" },
      { u: 12.15, y: 1.7, r: 2.25, az: 2.61, el: 0.22, focus: "coreInterior" },
      { u: 13.3, y: 3, r: 11.7, az: 2.75, el: 0.025 },
      { u: 14.3, y: 2.32, r: 2.9, az: 2.93, el: 0.3, focus: "floorLoad" },
      { u: 15.1, y: 2.3, r: 1.85, az: 3.1, el: 0.34, focus: "outriggerColumn" },
      { u: 16.05, y: 2.37, r: 1.5, az: 3.27, el: 0.53, focus: "floorLoad", shift: -60 },
      { u: 16.78, y: 2.1, r: 2.45, az: 3.36, el: 0.28, focus: "columnBelow" },
      { u: 17.45, y: 2.31, r: 1.55, az: 3.47, el: 0.22, focus: "outriggerMid" },
      { u: 18.3, y: 2.31, r: 1.1, az: 3.6, el: 0.34, focus: "outriggerMid" },
      { u: 19.12, y: 2.31, r: 1.28, az: 3.73, el: 0.27, focus: "outriggerCore" },
      { u: 20.1, y: 2.31, r: 1.72, az: 3.88, el: 0.3, focus: "outriggerMid" },
      { u: 21.1, y: 2.32, r: 1.9, az: 4.02, el: 0.53, focus: "beltMid" },
      { u: 22.05, y: 2.62, r: 3.7, az: 4.13, el: 0.59, shift: -190 },
      { u: 23.25, y: 2.6, r: 2.8, az: 4.28, el: 0.58 },
      { u: 24.2, y: 2.58, r: 2.35, az: 4.43, el: 0.4 },
      { u: 25.3, y: 2.65, r: 2.65, az: 4.58, el: 0.32 },
      { u: 26.3, y: 2.68, r: 3.5, az: 4.73, el: 0.28 },
      { u: 27.3, y: 3.13, r: 14.2, az: 4.89, el: 0.12 },
      { u: 28.7, y: 3.15, r: 13.3, az: 5.03, el: -0.025 },
      { u: 29.6, y: 3.23, r: 13, az: 5.16, el: 0.22, shift: -110 },
      { u: 30.4, y: 3.3, r: 13.4, az: 5.31, el: 0.28 },
      { u: 31.5, y: 3.2, r: 13.3, az: 5.48, el: 0.32 },
      { u: 32.2, y: 2.65, r: 7.4, az: 5.6, el: 0.1 },
      { u: 33.1, y: 2.3, r: 3.25, az: 5.71, el: 0.08 },
      { u: 33.8, y: 4.4, r: 8.8, az: 5.8, el: 0.16 },
      { u: 34.8, y: tmdY + 0.065, r: 2.1, az: 5.94, el: 0.23, shift: -190 },
      { u: 35.5, y: tmdY + 0.06, r: 1.16, az: 6.1, el: 0.29 },
      { u: 36.2, y: tmdY + 0.042, r: 0.86, az: 6.32, el: 0.25, shift: -75 },
      { u: 37.3, y: tmdY - 0.015, r: 0.73, az: 6.6, el: 0.17 },
      { u: 38.2, y: tmdY + 0.07, r: 1.8, az: 6.78, el: 0.28 },
      { u: 39.1, y: 3.15, r: 14.8, az: 6.96, el: 0.13 },
      { u: 40.05, y: 0.7, r: 3.9, az: 7.1, el: 0.22 },
      { u: 41.1, y: 2, r: 3.6, az: 7.26, el: 0.35 },
      { u: 42.3, y: 3.65, r: 4.4, az: 7.43, el: 0.34 },
      { u: 43.3, y: 5.03, r: 5.5, az: 7.61, el: 0.25 },
      { u: 44.3, y: 3.14, r: 13.8, az: 7.78, el: 0.065 },
      { u: 45.5, y: 3.12, r: 13.2, az: 8.02, el: -0.035, shift: -190 },
      { u: 46.7, y: 3.1, r: 13.5, az: 8.27, el: -0.065 },
      { u: 47.8, y: 3.1, r: 14.1, az: 8.49, el: -0.025 },
      { u: 49, y: 3.1, r: 15.2, az: 8.76, el: 0.075 }
    ];
    let shift = -190;
    this.keys = poses.map((p) => {
      if (p.shift !== void 0) shift = p.shift;
      const anchor = p.focus ? this.anchors[p.focus] : void 0;
      return { t: this.timeAt(p.u), x: anchor ? anchor[0] * 0.01 : p.x ?? 0, y: anchor ? anchor[1] * 0.01 : p.y, z: anchor ? anchor[2] * 0.01 : p.z ?? 0, r: p.r, az: p.az, el: p.el, shift, focus: p.focus };
    });
    const times = this.keys.map((k) => k.t);
    for (const col of columns) this.curves[col] = flowingCurve(times, this.keys.map((k) => k[col]));
  }
  at(t) {
    const c = this.curves, plan = pulse(this.timeAt(10.1), this.timeAt(10.82), this.timeAt(11.92), this.timeAt(12.58), t);
    const r = mix(c.r(t), 0.97, plan), az = c.az(t), el = mix(c.el(t), 1.12, plan);
    const target = V(c.x(t), mix(c.y(t), 1.67, plan), c.z(t));
    const position = target.clone().add(V(Math.cos(az) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(az) * Math.cos(el) * r));
    return { position, target, shift: c.shift(t) };
  }
  apply(camera2, t) {
    const p = this.at(t);
    camera2.position.copy(p.position);
    camera2.lookAt(p.target);
    camera2.setViewOffset(1920, 1080, p.shift, 0, 1920, 1080);
    camera2.updateProjectionMatrix();
    camera2.updateMatrixWorld();
  }
};

// research/visual-v3/check-reference-visibility.ts
var tl = JSON.parse(fs.readFileSync("src/timeline.json", "utf8"));
var manifest = JSON.parse(fs.readFileSync("public/models/shanghai-tower-manifest.json", "utf8"));
var camera = new T2.PerspectiveCamera(34, 1920 / 1080, 8e-3, 200);
var path = new CameraPath(tl);
path.setAnchors(manifest.cameraAnchorsThree);
var out = [];
var last = false;
for (let frame = 0; frame < tl.duration; frame++) {
  const s = stateAt(frame, tl), u = s.n + s.u, rw = pulse(12.8, 13.1, 13.75, 14.1, u) + pulse(31.55, 32.2, 33.55, 34.1, u), visible = rw > 1e-3;
  if (visible !== last) {
    const views = [];
    for (const f of [frame - 1, frame, frame + 1]) {
      const q = stateAt(Math.max(0, f), tl), v = q.n + q.u, r = pulse(12.8, 13.1, 13.75, 14.1, v) + pulse(31.55, 32.2, 33.55, 34.1, v);
      path.apply(camera, q.time);
      camera.updateMatrixWorld();
      const pts = Array.from({ length: 101 }, (_, i) => V(-0.3 + 0.115 * i / 100, 5.8 * i / 100, 0.4).project(camera));
      const onscreen = pts.filter((p) => p.z >= -1 && p.z <= 1 && p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1);
      views.push({ frame: f, timeSeconds: f / 30, clip: q.clip.id, u: v, rw: r, visible: r > 1e-3, undeformedReferenceOnscreenSampleCount: onscreen.length, screenExamples: onscreen.filter((_, i) => i % Math.max(1, Math.floor(onscreen.length / 3)) === 0).map((p) => [(p.x + 1) * 960, (1 - p.y) * 540]).slice(0, 4) });
    }
    out.push({ transition: visible ? "appears" : "disappears", frame, window: views });
    last = visible;
  }
}
var result = { scope: "Frozen source visibility threshold + undeformed-reference projection; not encoded-motion review; camera-follow effect is omitted and noted for late wind exit", materialOpacity: 0.88, lineWidthsPixels: [2.8, 3.7, 3.2], transitions: out };
fs.writeFileSync("research/visual-v3/reference-visibility-qa.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
