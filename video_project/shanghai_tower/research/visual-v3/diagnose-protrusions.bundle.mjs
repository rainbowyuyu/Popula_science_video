// research/visual-v3/diagnose-protrusions.ts
import fs from "node:fs";
import * as T3 from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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

// src/PhysicsPlayback.ts
import * as T2 from "three";
var WIND_MAGNIFICATION = 48;
var STRESS_COLOR_POWER = 0.45;
var cool = new T2.Color("#087d9b");
var zero = new T2.Color("#c6ccce");
var warm = new T2.Color("#dd4e2b");
var white = new T2.Color("#ffffff");
var tmpColor = new T2.Color();
var bendLow = new T2.Color("#dae2df");
var bendHigh = new T2.Color("#df7949");
var PhysicsPlayback = class {
  constructor(data, timeline) {
    this.data = data;
    this.timeline = timeline;
    if (data.schema !== "rainbow.shanghai-physics/1" || data.units.length !== "m" || data.units.stress !== "MPa") throw new Error("Unsupported solver output units/schema");
    const nodeMap = new Map(data.nodes.map((n, i) => [n.id, i]));
    this.axes = data.members.map((m, index) => {
      const i = nodeMap.get(m.nodeIds[0]), j = nodeMap.get(m.nodeIds[1]);
      if (i === void 0 || j === void 0) throw new Error("Missing solver node");
      const a = V(...data.nodes[i].xyz), b = V(...data.nodes[j].xyz), delta = b.clone().sub(a);
      return { index, i, j, a, b, delta, l2: delta.lengthSq() };
    });
    for (const axis of this.axes) {
      const m = data.members[axis.index];
      for (const id of m.meshIds) {
        const list = this.byMesh.get(id) ?? [];
        list.push(axis);
        this.byMesh.set(id, list);
      }
      if (/core/i.test(m.role)) this.coreAxes.push(axis);
    }
    if (!this.coreAxes.length) throw new Error("Solver has no core backbone for facade compatibility");
    const g = data.static.gravity, w = data.static.windOnly ?? data.static.windPlusGravity;
    if (!g || !w) throw new Error("Solver missing gravity/wind cases");
    const gStress = g.memberAxialMPa ?? g.axialMPa;
    if (!gStress) throw new Error("Gravity result missing axial stress array");
    this.gravity = { u: g.u, r: g.r, stress: gStress };
    this.gravityLimit = Math.max(0.01, ...gStress.map((v) => Math.abs(v)));
    this.currentU = new Float32Array(data.nodes.length * 3);
    this.currentR = new Float32Array(data.nodes.length * 3);
    this.currentStress = new Float32Array(data.members.length);
    this.currentBending = new Float32Array(data.members.length);
    const wStress = w.memberAxialMPa ?? w.axialMPa;
    if (!wStress) throw new Error("Wind result missing axial stress array");
    this.wind = { u: w.u.map((v, i) => v.map((x, k) => x - (data.static.windOnly ? 0 : g.u[i][k]))), r: w.r?.map((v, i) => v.map((x, k) => x - (data.static.windOnly ? 0 : g.r?.[i]?.[k] ?? 0))), stress: wStress.map((x, i) => x - (data.static.windOnly ? 0 : gStress[i])) };
    data.dynamic.nodeIds.forEach((id, i) => this.dynamicNodeIndex.set(id, i));
    data.dynamic.memberIds.forEach((id, i) => this.dynamicMemberIndex.set(id, i));
    for (let f = 0; f < data.dynamic.time.length; f++) {
      this.dynamicU.push(data.nodes.map((n) => data.dynamic.u[f][this.dynamicNodeIndex.get(n.id)] ?? [0, 0, 0]));
      this.dynamicR.push(data.nodes.map((n) => data.dynamic.r?.[f]?.[this.dynamicNodeIndex.get(n.id)] ?? [0, 0, 0]));
      this.dynamicStress.push(data.members.map((m) => data.dynamic.axialMPa[f][this.dynamicMemberIndex.get(m.id)] ?? 0));
    }
    const stresses = this.dynamicStress.flat().map(Math.abs).filter(Number.isFinite).sort((a, b) => a - b);
    this.stressLimit = 6;
  }
  data;
  timeline;
  axes = [];
  byMesh = /* @__PURE__ */ new Map();
  coreAxes = [];
  bindings = /* @__PURE__ */ new WeakMap();
  dynamicNodeIndex = /* @__PURE__ */ new Map();
  dynamicMemberIndex = /* @__PURE__ */ new Map();
  dynamicU = [];
  dynamicR = [];
  dynamicStress = [];
  gravity;
  wind;
  stressLimit = 1;
  gravityLimit = 1;
  play;
  coreBending;
  coreSectionIndex = /* @__PURE__ */ new Map();
  currentBending;
  bendingMode = false;
  currentU;
  currentR;
  currentStress;
  setCoreBending(tmd) {
    this.coreBending = tmd.coreWindSection;
    if (!this.coreBending) throw new Error("Missing computed core bending stress");
    const ids = new Map(this.coreBending.memberIds.map((id, i) => [id, i]));
    this.data.members.forEach((m, i) => {
      const k = ids.get(String(m.id));
      if (k !== void 0) this.coreSectionIndex.set(i, k);
    });
  }
  bind(id, geometry) {
    const vertices = geometry.getAttribute("position"), n = vertices.count, bind = { i: new Int32Array(n), j: new Int32Array(n), w: new Float32Array(n), offset: new Float32Array(n * 3), member: new Int32Array(n), colors: new Float32Array(n * 3) };
    const own = this.byMesh.get(id), axes = own?.length ? own : this.coreAxes, point = V();
    for (let k = 0; k < n; k++) {
      point.set(vertices.getX(k) * 100, vertices.getY(k) * 100, vertices.getZ(k) * 100);
      let best = Infinity, chosen = axes[0], weight = 0;
      for (const axis of axes) {
        const dx = point.x - axis.a.x, dy = point.y - axis.a.y, dz = point.z - axis.a.z;
        const w = clamp((dx * axis.delta.x + dy * axis.delta.y + dz * axis.delta.z) / axis.l2), distance = (dx - axis.delta.x * w) ** 2 + (dy - axis.delta.y * w) ** 2 + (dz - axis.delta.z * w) ** 2;
        if (distance < best) {
          best = distance;
          chosen = axis;
          weight = w;
        }
      }
      bind.i[k] = chosen.i;
      bind.j[k] = chosen.j;
      bind.w[k] = weight;
      bind.member[k] = own?.length ? chosen.index : -1;
      for (let q = 0; q < 3; q++) bind.offset[k * 3 + q] = point.getComponent(q) - mix(chosen.a.getComponent(q), chosen.b.getComponent(q), weight);
    }
    bind.colors.fill(1);
    this.bindings.set(geometry, bind);
    geometry.setAttribute("color", new T2.BufferAttribute(bind.colors, 3));
    return bind;
  }
  physicalTime(s) {
    const section = this.timeline?.sections.find((c) => c.id === "wind"), end = this.timeline?.sections.find((c) => c.id === "damper");
    if (section && end && s.frame >= section.start && s.frame < end.end) {
      return clamp((s.frame - section.start) / (end.end - section.start)) * (this.data.dynamic.time.at(-1) ?? 59);
    }
    const clip = s.section === "frame" ? "s019" : "s013", start = (this.timeline?.clips.find((c) => c.id === clip)?.start ?? 0) / (this.timeline?.fps ?? 30);
    return Math.max(0, s.time - start);
  }
  update(s) {
    const u = s.n + s.u;
    const gravity = pulse(15.7, 16.05, 16.8, 17.2, u);
    this.bendingMode = u >= 31.2 && u <= 32.96;
    const wind = pulse(12.8, 13.15, 13.75, 14.1, u) + pulse(18.75, 19.15, 20.85, 21.25, u) + pulse(29.05, 29.6, 38.55, 39.1, u);
    if (wind > 1e-5) {
      const times = this.data.dynamic.time, t = clamp(this.physicalTime(s) / (times.at(-1) ?? 1)) * (times.at(-1) ?? 0);
      let i = Math.max(0, times.findIndex((x) => x >= t) - 1);
      if (t >= times.at(-1)) i = times.length - 2;
      const j = Math.min(i + 1, times.length - 1);
      this.play = { a: { u: this.dynamicU[i], r: this.dynamicR[i], stress: this.dynamicStress[i] }, b: { u: this.dynamicU[j], r: this.dynamicR[j], stress: this.dynamicStress[j] }, f: clamp((t - times[i]) / (times[j] - times[i])), weight: Math.min(1, wind), scale: WIND_MAGNIFICATION, stressWeight: pulse(18.8, 19.2, 20.8, 21.2, u) + pulse(31.2, 31.8, 32.75, 32.95, u) + pulse(32.98, 33.15, 33.65, 34, u), kind: "wind" };
    } else this.play = { a: this.gravity, b: this.gravity, f: 0, weight: gravity, scale: 1, stressWeight: gravity, kind: gravity > 1e-5 ? "gravity" : "none" };
    const p = this.play;
    if (p.weight > 1e-5) {
      for (let i = 0; i < this.data.nodes.length; i++) for (let q = 0; q < 3; q++) {
        this.currentU[i * 3 + q] = mix(p.a.u[i][q], p.b.u[i][q], p.f);
        this.currentR[i * 3 + q] = mix(p.a.r?.[i]?.[q] ?? 0, p.b.r?.[i]?.[q] ?? 0, p.f);
      }
      for (let i = 0; i < this.currentStress.length; i++) this.currentStress[i] = mix(p.a.stress[i], p.b.stress[i], p.f);
    }
    if (this.bendingMode && this.coreBending) {
      const b = this.coreBending, t = Math.min(b.time.at(-1), this.physicalTime(s)), i = Math.min(b.time.length - 2, Math.floor(t)), f = clamp(t - i);
      for (const [member, k] of this.coreSectionIndex) this.currentBending[member] = mix(b.extremeMPa[i][k], b.extremeMPa[i + 1][k], f);
    }
  }
  deform(geometry, rest, material) {
    const bind = this.bindings.get(geometry), p = this.play;
    if (!bind || !p) return;
    const pos = geometry.getAttribute("position");
    if (p.weight < 1e-5) {
      if (geometry.userData.physicsActive) {
        pos.array.set(rest);
        pos.needsUpdate = true;
        bind.colors.fill(1);
        geometry.getAttribute("color").needsUpdate = true;
      }
      geometry.userData.physicsActive = false;
      return;
    }
    geometry.userData.physicsActive = true;
    const boundMember = bind.member[0], role = this.data.members[boundMember]?.role ?? "", eligible = p.kind === "gravity" || (this.bendingMode ? role === "core" : /megacolumn|corner/i.test(role));
    const tint = eligible ? Math.min(1, p.stressWeight) : 0, gain = p.weight * p.scale * 0.01;
    const stressBound = p.kind === "gravity" ? this.gravityLimit : this.stressLimit, U = this.currentU, R = this.currentR;
    for (let k = 0; k < pos.count; k++) {
      const i = bind.i[k] * 3, j = bind.j[k] * 3, w = bind.w[k], idx = k * 3;
      const ux = mix(U[i], U[j], w), uy = mix(U[i + 1], U[j + 1], w), uz = mix(U[i + 2], U[j + 2], w), rx = mix(R[i], R[j], w), ry = mix(R[i + 1], R[j + 1], w), rz = mix(R[i + 2], R[j + 2], w);
      const ox = bind.offset[idx], oy = bind.offset[idx + 1], oz = bind.offset[idx + 2];
      pos.setXYZ(k, rest[idx] + gain * (ux + ry * oz - rz * oy), rest[idx + 1] + gain * (uy + rz * ox - rx * oz), rest[idx + 2] + gain * (uz + rx * oy - ry * ox));
      const m = bind.member[k], stress = m < 0 ? 0 : this.currentStress[m], amount = Math.pow(clamp(Math.abs(stress) / stressBound), STRESS_COLOR_POWER);
      if (this.bendingMode && this.coreSectionIndex.has(m)) {
        tmpColor.copy(bendLow).lerp(bendHigh, clamp(this.currentBending[m] / 6));
      } else tmpColor.copy(zero).lerp(stress >= 0 ? cool : warm, amount);
      if (m < 0) tmpColor.copy(white);
      else tmpColor.lerp(white, 1 - tint);
      tmpColor.toArray(bind.colors, idx);
    }
    pos.needsUpdate = true;
    geometry.getAttribute("color").needsUpdate = true;
    if (bind.member[0] >= 0) {
      const base = material.userData.physicsBaseColor ?? material.color.clone();
      material.userData.physicsBaseColor = base;
      material.color.copy(base).lerp(white, tint);
      material.vertexColors = true;
    } else material.vertexColors = false;
  }
  displacementAt(point) {
    const p = this.play;
    if (!p || p.weight < 1e-5) return V();
    const metres = point.clone().multiplyScalar(100);
    let best = Infinity, a = this.coreAxes[0], w = 0;
    for (const axis of this.coreAxes) {
      const f = clamp(metres.clone().sub(axis.a).dot(axis.delta) / axis.l2), d = metres.distanceToSquared(axis.a.clone().addScaledVector(axis.delta, f));
      if (d < best) {
        a = axis;
        w = f;
        best = d;
      }
    }
    const result2 = V();
    for (let q = 0; q < 3; q++) result2.setComponent(q, mix(mix(p.a.u[a.i][q], p.a.u[a.j][q], w), mix(p.b.u[a.i][q], p.b.u[a.j][q], w), p.f) * 0.01 * p.weight * p.scale);
    return result2;
  }
};

// research/visual-v3/diagnose-protrusions.ts
var read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
var tl = read("src/timeline.json");
var manifest = read("public/models/shanghai-tower-manifest.json");
var bytes = fs.readFileSync("public/models/shanghai-tower.glb");
var gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
gltf.scene.updateMatrixWorld(true);
var physics = new PhysicsPlayback(read("public/physics/response.json"), tl);
var camera = new T3.PerspectiveCamera(34, 1920 / 1080, 5e-3, 200);
var path = new CameraPath(tl);
path.setAnchors(manifest.cameraAnchorsThree);
var meshes = [];
var bounds = [];
for (const info of manifest.parts.filter((p) => p.role === "facadesupport" || p.role === "floorbeams")) {
  const source = gltf.scene.getObjectByName(info.id);
  source.traverse((o) => {
    if (!(o instanceof T3.Mesh)) return;
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld).scale(0.01, 0.01, 0.01);
    const mesh = new T3.Mesh(geometry, o.material.clone());
    mesh.name = info.id;
    mesh.userData.role = info.role;
    meshes.push(mesh);
    geometry.computeBoundingBox();
    const p = geometry.getAttribute("position"), n = geometry.getAttribute("normal");
    let maxRadius = 0, maxNormalError = 0;
    for (let i = 0; i < p.count; i++) {
      maxRadius = Math.max(maxRadius, Math.hypot(p.getX(i), p.getZ(i)));
      maxNormalError = Math.max(maxNormalError, Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1));
    }
    bounds.push({ id: info.id, role: info.role, vertices: p.count, finitePositions: Array.from(p.array).every(Number.isFinite), normalUnitError: maxNormalError, maxRadiusMetres: maxRadius * 100, box: { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() }, sourceMaterialOpacity: mesh.material.opacity });
  });
}
var result = { date: (/* @__PURE__ */ new Date()).toISOString(), scope: "Read-only GLB and pre-fix World classification diagnostic; raycasts restricted to suspect facade-support meshes, not a full occlusion render; no production edits", bounds, frames: [] };
for (const frame of [2350, 3900]) {
  const s = stateAt(frame, tl), u = s.n + s.u;
  physics.update(s);
  path.apply(camera, s.time);
  camera.updateMatrixWorld(true);
  const corePlan = pulse(10.1, 10.82, 11.92, 12.58, u), coreSection = pulse(9.98, 10.55, 11.99, 12.62, u), cut = coreSection > 0 ? mix(6.8, 1.73701, coreSection) : 100;
  const classifications = manifest.parts.filter((p) => p.role === "facadesupport" || p.id === "FLOOR_BEAMS_Z03").map((p) => {
    const id = p.id, slab = /FLOORS|FLOOR_INSPECTION/.test(id), beam = /FLOOR_BEAMS/.test(id), col = /MEGACOL|CORNER/.test(id), truss = /OUTRIGGER|BELT|CONNECTION_PLATES/.test(id) || ["outrigger", "belt"].includes(p.role), shell = /ENVELOPE|SPIRAL_RIBS|GLAZING|FACADE_OUTER/.test(id), transparentByCore = slab || beam || col || truss || p.role === "garden" || p.role === "sky_lobby" || p.role === "floorbeams";
    return { id, role: p.role, shell, truss, beam, transparentByCore, corePlanMultiplier: transparentByCore ? 1 - 0.985 * corePlan : 1, castShadow: !/ENVELOPE|FACADE|GLASS/.test(id) };
  });
  const points = frame === 2350 ? [[420, 473], [529, 488], [463, 299], [765, 80], [304, 682], [1646, 885]] : [[700, 315], [776, 349], [1590, 305], [1822, 414], [1134, 288]];
  const ray = new T3.Raycaster(), hits = [];
  for (const [x, y] of points) {
    let found = [];
    for (let dx = -4; dx <= 4; dx += 2) for (let dy = -4; dy <= 4; dy += 2) {
      ray.setFromCamera(new T3.Vector2((x + dx) / 1920 * 2 - 1, 1 - (y + dy) / 1080 * 2), camera);
      for (const h of ray.intersectObjects(meshes.filter((m) => m.userData.role === "facadesupport"), false)) {
        if (h.point.y > cut + 1e-5) continue;
        found.push({ id: h.object.name, point: h.point.toArray(), faceIndex: h.faceIndex, pixel: [x + dx, y + dy] });
      }
    }
    hits.push({ requestedPixel: [x, y], hitCount: found.length, firstHits: found.slice(0, 3) });
  }
  result.frames.push({ frame, clip: s.clip.id, u, corePlan, cut, solverPlayback: physics.play?.kind, solverWeight: physics.play?.weight, camera: camera.position.toArray(), classifications, pixelHits: hits });
}
fs.writeFileSync("research/visual-v3/protrusion-diagnostic.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify({ bounds: bounds.filter((p) => p.role === "facadesupport"), frames: result.frames }, null, 2));
