// research/visual-v3/check-frozen-physics.ts
import * as T5 from "three";
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";

// src/PhysicsPlayback.ts
import * as T2 from "three";

// src/visual.ts
import * as T from "three";
var C = { paper: "#f3f1ec", ink: "#18303b", teal: "#27869a", gold: "#bd965a", red: "#ce654a", muted: "#52656e" };
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

// src/PhysicsPlayback.ts
var WIND_MAGNIFICATION = 48;
var STRESS_COLOR_POWER = 0.45;
var CORE_STRESS_COLOR_POWER = 0.45;
var cool = new T2.Color("#087d9b");
var zero = new T2.Color("#c6ccce");
var warm = new T2.Color("#dd4e2b");
var white = new T2.Color("#ffffff");
var tmpColor = new T2.Color();
var bendLow = new T2.Color("#dae2df");
var bendHigh = new T2.Color("#df7949");
var PhysicsPlayback = class {
  constructor(data2, timeline) {
    this.data = data2;
    this.timeline = timeline;
    if (data2.schema !== "rainbow.shanghai-physics/1" || data2.units.length !== "m" || data2.units.stress !== "MPa") throw new Error("Unsupported solver output units/schema");
    const nodeMap = new Map(data2.nodes.map((n, i) => [n.id, i]));
    this.axes = data2.members.map((m, index) => {
      const i = nodeMap.get(m.nodeIds[0]), j = nodeMap.get(m.nodeIds[1]);
      if (i === void 0 || j === void 0) throw new Error("Missing solver node");
      const a = V(...data2.nodes[i].xyz), b = V(...data2.nodes[j].xyz), delta = b.clone().sub(a);
      return { index, i, j, a, b, delta, l2: delta.lengthSq() };
    });
    for (const axis of this.axes) {
      const m = data2.members[axis.index];
      for (const id of m.meshIds) {
        const list = this.byMesh.get(id) ?? [];
        list.push(axis);
        this.byMesh.set(id, list);
      }
      if (/core/i.test(m.role)) this.coreAxes.push(axis);
    }
    if (!this.coreAxes.length) throw new Error("Solver has no core backbone for facade compatibility");
    const g = data2.static.gravity, w = data2.static.windOnly ?? data2.static.windPlusGravity;
    if (!g || !w) throw new Error("Solver missing gravity/wind cases");
    const gStress = g.memberAxialMPa ?? g.axialMPa;
    if (!gStress) throw new Error("Gravity result missing axial stress array");
    this.gravity = { u: g.u, r: g.r, stress: gStress };
    this.gravityLimit = Math.max(0.01, ...gStress.map((v) => Math.abs(v)));
    this.currentU = new Float32Array(data2.nodes.length * 3);
    this.currentR = new Float32Array(data2.nodes.length * 3);
    this.currentStress = new Float32Array(data2.members.length);
    this.currentBending = new Float32Array(data2.members.length);
    const wStress = w.memberAxialMPa ?? w.axialMPa;
    if (!wStress) throw new Error("Wind result missing axial stress array");
    this.wind = { u: w.u.map((v, i) => v.map((x, k) => x - (data2.static.windOnly ? 0 : g.u[i][k]))), r: w.r?.map((v, i) => v.map((x, k) => x - (data2.static.windOnly ? 0 : g.r?.[i]?.[k] ?? 0))), stress: wStress.map((x, i) => x - (data2.static.windOnly ? 0 : gStress[i])) };
    data2.dynamic.nodeIds.forEach((id, i) => this.dynamicNodeIndex.set(id, i));
    data2.dynamic.memberIds.forEach((id, i) => this.dynamicMemberIndex.set(id, i));
    for (let f = 0; f < data2.dynamic.time.length; f++) {
      this.dynamicU.push(data2.nodes.map((n) => data2.dynamic.u[f][this.dynamicNodeIndex.get(n.id)] ?? [0, 0, 0]));
      this.dynamicR.push(data2.nodes.map((n) => data2.dynamic.r?.[f]?.[this.dynamicNodeIndex.get(n.id)] ?? [0, 0, 0]));
      this.dynamicStress.push(data2.members.map((m) => data2.dynamic.axialMPa[f][this.dynamicMemberIndex.get(m.id)] ?? 0));
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
    const wind2 = pulse(12.8, 13.15, 13.75, 14.1, u) + pulse(18.75, 19.15, 20.85, 21.25, u) + pulse(29.05, 29.6, 38.55, 39.1, u);
    if (wind2 > 1e-5) {
      const times = this.data.dynamic.time, t = clamp(this.physicalTime(s) / (times.at(-1) ?? 1)) * (times.at(-1) ?? 0);
      let i = Math.max(0, times.findIndex((x) => x >= t) - 1);
      if (t >= times.at(-1)) i = times.length - 2;
      const j = Math.min(i + 1, times.length - 1);
      this.play = { a: { u: this.dynamicU[i], r: this.dynamicR[i], stress: this.dynamicStress[i] }, b: { u: this.dynamicU[j], r: this.dynamicR[j], stress: this.dynamicStress[j] }, f: clamp((t - times[i]) / (times[j] - times[i])), weight: Math.min(1, wind2), scale: WIND_MAGNIFICATION, stressWeight: pulse(18.8, 19.2, 20.8, 21.2, u) + pulse(31.2, 31.8, 32.75, 32.95, u) + pulse(32.98, 33.15, 33.65, 34, u), kind: "wind" };
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
        tmpColor.copy(bendLow).lerp(bendHigh, Math.pow(clamp(this.currentBending[m] / 6), CORE_STRESS_COLOR_POWER));
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
    const result = V();
    for (let q = 0; q < 3; q++) result.setComponent(q, mix(mix(p.a.u[a.i][q], p.a.u[a.j][q], w), mix(p.b.u[a.i][q], p.b.u[a.j][q], w), p.f) * 0.01 * p.weight * p.scale);
    return result;
  }
};

// src/EnvironmentPlayback.ts
import * as T3 from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
var PILE_MAGNIFICATION = 80;
var TMD_RELATIVE_MAGNIFICATION = 1;
var ForceArrow = class {
  constructor(c, radius = 6e-3) {
    this.radius = radius;
    this.mat = new T3.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.12, emissive: c, emissiveIntensity: 0.16 });
    this.shaft = new T3.Mesh(new T3.CylinderGeometry(1, 1, 1, 12), this.mat);
    this.head = new T3.Mesh(new T3.ConeGeometry(1, 1, 20), this.mat);
    this.bead = new T3.Mesh(new T3.SphereGeometry(1, 12, 8), new T3.MeshBasicMaterial({ color: "#fff4d9", toneMapped: false }));
    this.root.add(this.shaft, this.head, this.bead);
  }
  radius;
  root = new T3.Group();
  shaft;
  head;
  bead;
  mat;
  set(a, b, weight = 1, camera2, phase = 0) {
    const d = b.clone().sub(a), length = d.length();
    this.root.visible = weight > 1e-3 && length > 1e-4;
    if (!this.root.visible) return;
    this.root.position.copy(a);
    this.root.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    const pixel = camera2 ? 2 * Math.tan(T3.MathUtils.degToRad(camera2.fov) / 2) * camera2.position.distanceTo(a) / 1080 : 0, r = Math.min(length * 0.075, Math.max(this.radius, pixel * 2.2)) * Math.max(0.3, weight), h = Math.min(r * 7.6, length * 0.32), body = Math.max(1e-4, length - h);
    this.shaft.scale.set(r, body, r);
    this.shaft.position.y = body / 2;
    this.head.scale.set(r * 2.8, h, r * 2.8);
    this.head.position.y = body + h / 2;
    this.bead.scale.setScalar(r * 1.22);
    this.bead.position.y = body * (phase % 1);
    this.bead.visible = weight > 0.95 && length > r * 12;
  }
};
function wideLine(points, color, width, dashed = false) {
  const mat = new LineMaterial({ color, linewidth: width, worldUnits: false, dashed, dashSize: 0.055, gapSize: 0.033, transparent: true, opacity: 0.88, depthWrite: false });
  mat.resolution.set(1920, 1080);
  mat.toneMapped = false;
  const line = new Line2(new LineGeometry().setPositions(points.flatMap((p) => p.toArray())), mat);
  line.computeLineDistances();
  line.frustumCulled = false;
  return line;
}
function earthTexture() {
  const n = 256, bytes = new Uint8Array(n * n * 4);
  let seed = 98471;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    const v = 170 + ((seed >>> 24) - 128) * 0.21 + 8 * Math.sin(y * 0.38 + Math.sin(x * 0.04));
    const k = (y * n + x) * 4;
    bytes[k] = v;
    bytes[k + 1] = v * 0.91;
    bytes[k + 2] = v * 0.77;
    bytes[k + 3] = 255;
  }
  const tex = new T3.DataTexture(bytes, n, n, T3.RGBAFormat);
  tex.wrapS = tex.wrapT = T3.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.needsUpdate = true;
  tex.colorSpace = T3.SRGBColorSpace;
  return tex;
}
var EnvironmentPlayback = class {
  constructor(scene2, data2, physics2) {
    this.scene = scene2;
    this.physics = physics2;
    if (data2.schema !== "rainbow.shanghai-environment/1") throw new Error("Missing verified environmental response");
    this.data = data2;
    this.pileOrigin.y = -Number(data2.pile.headDepthBelowGrade_m) * 0.01;
    scene2.add(this.root);
    this.root.add(this.soil, this.pile, this.wind, this.reference);
    this.texture = earthTexture();
    const earthColors = ["#ac9275", "#afa084", "#959683", "#898e7b", "#a3a18a", "#b1a58d", "#aaa088", "#b9a47f", "#c1ab84", "#ac9c7d", "#b8a684", "#a39472"];
    const layers = data2.pile.soilLayers.map((l, i) => [l.depthRangeBelowGrade_m[0] * 0.01, l.depthRangeBelowGrade_m[1] * 0.01, earthColors[i % earthColors.length]]);
    for (const [top, bottom, c] of layers) {
      const mat = new T3.MeshStandardMaterial({ color: c, map: this.texture, bumpMap: this.texture, bumpScale: 8e-3, roughness: 0.94 });
      const m = new T3.Mesh(new T3.BoxGeometry(1.6, bottom - top, 0.22), mat);
      m.position.set(0, -(top + bottom) / 2, -0.6);
      m.receiveShadow = true;
      this.soil.add(m);
    }
    const count = data2.pile.nodes.length - 1;
    for (let i = 0; i < count; i++) {
      const m = new T3.Mesh(new T3.CylinderGeometry(75e-4, 75e-4, 1, 16), new T3.MeshStandardMaterial({ color: "#c9774f", metalness: 0.12, roughness: 0.46 }));
      this.pileSegments.push(m);
      this.pile.add(m);
    }
    for (let i = 0; i < 7; i++) {
      const a = new ForceArrow("#087b95", 42e-4);
      this.sideArrows.push(a);
      this.pile.add(a.root);
    }
    this.pile.add(this.toeArrow.root, this.loadArrow.root, this.lateralArrow.root);
    const guide = new T3.Line(new T3.BufferGeometry().setFromPoints([this.pileOrigin, this.pileOrigin.clone().add(V(0, -0.52, 0))]), new T3.LineDashedMaterial({ color: "#778984", dashSize: 0.013, gapSize: 0.011, transparent: true, opacity: 0.65 }));
    guide.computeLineDistances();
    this.pile.add(guide);
    const loads = data2.tmd;
    for (const h of [45, 125, 205, 285, 365, 445, 535]) {
      const a = new ForceArrow("#bf613b", 0.011);
      a.mat.depthTest = false;
      a.mat.depthWrite = false;
      a.mat.transparent = true;
      a.root.children.forEach((o) => {
        o.renderOrder = 31;
        if (o instanceof T3.Mesh) {
          o.material.depthTest = false;
          o.material.transparent = true;
        }
      });
      this.windArrows.push(a);
      this.wind.add(a.root);
      let nearest = 0;
      for (let i = 1; i < loads.windLoads.nodeIds.length; i++) if (Math.abs(loads.windLoads.nodeXYZ_m[i][1] - h) < Math.abs(loads.windLoads.nodeXYZ_m[nearest][1] - h)) nearest = i;
      this.windIndices.push(nearest);
      const target = new T3.Mesh(new T3.RingGeometry(9e-3, 0.015, 24), new T3.MeshBasicMaterial({ color: "#c56b40", side: T3.DoubleSide, depthWrite: false, depthTest: false, toneMapped: false }));
      target.renderOrder = 32;
      this.windTargets.push(target);
      this.wind.add(target);
    }
    for (const side of [-1, 1]) {
      const indices = physics2.data.members.map((m, i) => ({ m, i, a: physics2.axes[i] })).filter((x) => x.m.meshIds.some((id) => id.startsWith("MEGACOL_Z04")) && x.a.a.x * side > 15);
      indices.sort((a, b) => Math.abs((a.a.a.y + a.a.b.y) * 0.5 - 230) - Math.abs((b.a.a.y + b.a.b.y) * 0.5 - 230) || b.a.a.z - a.a.a.z);
      if (indices.length) this.axialIndices.push(indices[0].i);
    }
    for (let i = 0; i < this.axialIndices.length * 2; i++) {
      const a = new ForceArrow(C.red, 9e-3);
      this.axialArrows.push(a);
      this.root.add(a.root);
    }
    const points = [];
    for (let i = 0; i <= 100; i++) points.push(V(-0.3 + 0.115 * i / 100, 5.8 * i / 100, 0));
    this.outline = wideLine(points, "#405b66", 2.8, true);
    this.currentReference = wideLine(points, "#107d96", 3.7);
    this.connector = wideLine([V(), V()], "#b57a32", 3.2, true);
    this.referenceDot = new T3.Mesh(new T3.SphereGeometry(0.027, 16, 12), new T3.MeshStandardMaterial({ color: "#107d96", emissive: "#107d96", emissiveIntensity: 0.2 }));
    this.reference.add(this.outline, this.currentReference, this.connector, this.referenceDot);
    physics2.setCoreBending(data2.tmd);
  }
  scene;
  physics;
  root = new T3.Group();
  soil = new T3.Group();
  pile = new T3.Group();
  wind = new T3.Group();
  reference = new T3.Group();
  pileOrigin = V(0.1248, -0.314, 0.3432);
  pileSegments = [];
  sideArrows = [];
  toeArrow = new ForceArrow("#b28031", 5e-3);
  loadArrow = new ForceArrow("#c24f34", 5e-3);
  lateralArrow = new ForceArrow("#087b95", 45e-4);
  windArrows = [];
  axialArrows = [];
  windTargets = [];
  connector;
  outline;
  currentReference;
  referenceDot;
  texture;
  data;
  axialIndices = [];
  windIndices = [];
  sample(field, time) {
    const d = this.data.tmd, times = d.time, n = times.length - 1, x = clamp(time / times[n]) * n, i = Math.min(n - 1, Math.floor(x));
    const values = d[field];
    if (!values) throw new Error("Missing TMD signal " + field);
    return mix(values[i], values[i + 1], x - i);
  }
  tmd(s) {
    const t = this.physics.physicalTime(s);
    return { relative: this.sample("relativeX_m", t), support: this.sample("supportX_m", t), windFactor: this.sample("windFactor", t), force: this.sample("forceOnSupport_N", t), damping: this.sample("damperForceOnSupport_N", t) };
  }
  update(s, camera2) {
    const u = s.n + s.u, soil = pulse(4.15, 5, 8.8, 9.8, u);
    this.soil.position.y = -4 * (1 - soil);
    this.soil.visible = soil > 1e-5;
    const pw = pulse(6.2, 6.65, 7.95, 8.45, u), load = ramp(6.55, 7.72, u), stages = this.data.pile.stages, index = load * (stages.length - 1), i = Math.min(stages.length - 2, Math.floor(index)), a = stages[i], b = stages[i + 1], f = index - i;
    const point = (k) => {
      const rest = this.data.pile.nodes[k].xyz_m;
      return this.pileOrigin.clone().add(V(rest[0], rest[1], rest[2] ?? 0).multiplyScalar(0.01)).add(V(mix(a.u_m[k][0], b.u_m[k][0], f), mix(a.u_m[k][1], b.u_m[k][1], f), 0).multiplyScalar(0.01 * PILE_MAGNIFICATION * pw));
    };
    this.pile.visible = pw > 1e-3;
    this.pile.position.x = 3 * (1 - pw);
    this.pileSegments.forEach((m, k) => {
      const p2 = point(k), q2 = point(k + 1), v = q2.clone().sub(p2);
      m.position.copy(p2).add(q2).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), v.clone().normalize());
      m.scale.y = v.length();
      const force = Math.abs(mix(a.axialForce_N[k], b.axialForce_N[k], f));
      m.material.color.set("#d8caba").lerp(new T3.Color(C.red), clamp(force / 8e6) ** 0.6);
    });
    const head = point(0);
    this.loadArrow.set(head.clone().add(V(0, 0.145 * load, 0)), head, pw * load, camera2, s.time * 0.75);
    this.lateralArrow.set(head.clone().add(V(-0.13 * load, 0, 0)), head, pw * load, camera2, s.time * 0.75 + 0.3);
    this.sideArrows.forEach((ar, j) => {
      const k = Math.max(1, Math.round((j + 1) / 8 * (this.data.pile.nodes.length - 1))), p2 = point(k), reaction2 = mix(a.sideReactionOnPile_N[k][1], b.sideReactionOnPile_N[k][1], f), len = 0.015 + 0.065 * clamp(Math.abs(reaction2) / 6e5), q2 = p2.clone().add(V(0.012, 0, 7e-3));
      ar.set(q2.clone().add(V(0, -Math.sign(reaction2) * len, 0)), q2, pw * load, camera2, s.time * 0.75 + j * 0.17);
    });
    const toe = point(this.data.pile.nodes.length - 1), reaction = mix(a.toeReactionOnPile_N[1], b.toeReactionOnPile_N[1], f);
    this.toeArrow.set(toe.clone().add(V(0, -0.025 - 0.1 * clamp(reaction / 8e6), 0)), toe, pw * load, camera2, s.time * 0.75);
    const w = pulse(29.85, 30.5, 33.8, 34.6, u), tm = this.tmd(s);
    this.wind.visible = w > 1e-3;
    const wl = this.data.tmd.windLoads;
    this.windArrows.forEach((ar, j) => {
      const k = this.windIndices[j], xyz = wl.nodeXYZ_m[k], force = wl.baseForce_N[k], rest = V(...xyz).multiplyScalar(0.01), p2 = rest.clone().add(this.physics.displacementAt(rest)), vector = V(...force).multiplyScalar(tm.windFactor * 5e-6 * w);
      ar.set(p2.clone().sub(vector), p2, w, camera2, this.physics.physicalTime(s) * 0.55 + j * 0.12);
      const target = this.windTargets[j];
      target.position.copy(p2);
      target.visible = ar.root.visible;
      target.scale.setScalar(w);
      if (camera2) target.quaternion.copy(camera2.quaternion);
    });
    const rw = pulse(12.8, 13.1, 13.75, 14.1, u) + pulse(31.55, 32.2, 33.55, 34.1, u);
    this.reference.visible = rw > 1e-3;
    this.reference.position.z = 0.4;
    const deformed = [];
    for (let k = 0; k <= 100; k++) {
      const p2 = V(-0.3 + 0.115 * k / 100, 5.8 * k / 100, 0);
      p2.add(this.physics.displacementAt(p2));
      deformed.push(p2.x, p2.y, p2.z);
    }
    this.currentReference.geometry.setPositions(deformed);
    const p = V(-0.185, 5.8, 0), q = p.clone().add(this.physics.displacementAt(p));
    this.connector.geometry.setPositions([...p.toArray(), ...q.toArray()]);
    this.connector.computeLineDistances();
    this.referenceDot.position.copy(q);
    const aw = Math.max(pulse(18.85, 19.25, 20.75, 21.15, u), pulse(32.95, 33.25, 33.72, 34.1, u));
    this.axialArrows.forEach((ar, j) => {
      const idx = this.axialIndices[Math.floor(j / 2)], axis = this.physics.axes[idx], node = j % 2 ? axis.j : axis.i, p2 = (j % 2 ? axis.b : axis.a).clone().multiplyScalar(0.01), gain = (this.physics.play?.scale ?? 1) * (this.physics.play?.weight ?? 0) * 0.01;
      p2.add(V(this.physics.currentU[node * 3], this.physics.currentU[node * 3 + 1], this.physics.currentU[node * 3 + 2]).multiplyScalar(gain));
      const stress = this.physics.currentStress[idx], member = this.physics.data.members[idx], area = member.A_m2 ?? member.section?.A ?? member.A;
      if (!(area > 0)) throw new Error("Missing actual mega-column section area");
      const axialForce = stress * 1e6 * area, outward = axis.delta.clone().normalize().multiplyScalar(j % 2 ? 1 : -1), length = Math.abs(axialForce) * 37e-10 * aw, outer = p2.clone().addScaledVector(outward, length);
      ar.mat.color.set(stress >= 0 ? "#087d9b" : "#d75d37");
      ar.mat.emissive.copy(ar.mat.color);
      ar.set(stress >= 0 ? p2 : outer, stress >= 0 ? outer : p2, aw, camera2, s.time * 0.6 + j * 0.18);
    });
  }
  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof T3.Mesh || o instanceof T3.Line) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.texture.dispose();
  }
};

// src/WindVisualization.ts
import * as T4 from "three";
import { Line2 as Line22 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry as LineGeometry2 } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial as LineMaterial2 } from "three/examples/jsm/lines/LineMaterial.js";
var POINTS = 161;
var TAIL = 36;
var TRAVEL = 9.6;
var INK = new T4.Color("#147f99");
var AMBER = new T4.Color("#b17833");
var WindVisualization = class {
  constructor(scene2, physics2) {
    this.scene = scene2;
    this.physics = physics2;
    this.root.name = "analytical-wind-illustration";
    scene2.add(this.root);
    const d = physics2.data.dynamic;
    this.times = [0, ...d.time];
    this.factor = [0, ...d.appliedForceFactors ?? d.time.map(() => 1)];
    this.integral = [0];
    for (let i = 1; i < this.times.length; i++) this.integral.push(this.integral[i - 1] + (this.times[i] - this.times[i - 1]) * (Math.sqrt(Math.abs(this.factor[i - 1])) + Math.sqrt(Math.abs(this.factor[i]))) * 0.5);
    const heights = [0.58, 1.69, 2.82, 4.03, 5.24], offsets = [-0.93, -0.17, 0.17, 0.93];
    for (let row = 0; row < heights.length; row++) for (let lane = 0; lane < offsets.length; lane++) {
      const height = heights[row], offset = offsets[lane], near = Math.abs(offset) < 0.3;
      const color = (near && row === 2 && lane === 2 ? AMBER : INK).clone();
      const radius = 0.78 - 0.255 * height / 6.32, points = [], lengths = [0];
      for (let k = 0; k < POINTS; k++) {
        const x = -TRAVEL / 2 + k / (POINTS - 1) * TRAVEL;
        let lo = Math.abs(offset), hi = 3;
        for (let n = 0; n < 25; n++) {
          const z = (lo + hi) * 0.5, psi = z * (1 - radius * radius / (x * x + z * z));
          if (psi < Math.abs(offset)) lo = z;
          else hi = z;
        }
        points.push(V(x, height, Math.sign(offset) * (lo + hi) * 0.5));
        if (k) lengths.push(lengths[k - 1] + points[k].distanceTo(points[k - 1]));
      }
      const gm = new LineMaterial2({ color: color.getHex(), linewidth: near ? 2 : 1.1, transparent: true, opacity: near ? 0.34 : 0.12, depthWrite: false, worldUnits: false });
      gm.toneMapped = false;
      gm.resolution.set(1920, 1080);
      const guide = new Line22(new LineGeometry2().setPositions(points.flatMap((p) => p.toArray())), gm);
      guide.geometry.getAttribute("instanceStart").data.setUsage(T4.DynamicDrawUsage);
      guide.frustumCulled = false;
      this.root.add(guide);
      const positions = new Float32Array(TAIL * 2 * 3), colors = new Float32Array(TAIL * 2 * 4), indices = [];
      for (let k = 0; k < TAIL - 1; k++) {
        const n = k * 2;
        indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      }
      const geometry = new T4.BufferGeometry();
      geometry.setAttribute("position", new T4.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new T4.BufferAttribute(colors, 4));
      geometry.setIndex(indices);
      const material = new T4.MeshBasicMaterial({ color: "#ffffff", vertexColors: true, side: T4.DoubleSide, transparent: true, depthWrite: false, toneMapped: false });
      const ribbon = new T4.Mesh(geometry, material);
      ribbon.frustumCulled = false;
      this.root.add(ribbon);
      const head = new T4.Mesh(new T4.SphereGeometry(1, 12, 8), new T4.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
      head.frustumCulled = false;
      this.root.add(head);
      this.streams.push({ height, offset, phase: (row * 0.183 + lane * 0.257) % 1, width: near ? 6.4 : 4.1, color, basePoints: points.map((p) => p.clone()), points, lengths, length: lengths.at(-1), guide, ribbon, positions, colors, head });
    }
  }
  scene;
  physics;
  root = new T4.Group();
  streams = [];
  integral = [];
  times = [];
  factor = [];
  pathAt(stream, distance) {
    const d = clamp(distance / stream.length) * stream.length;
    let lo = 0, hi = stream.lengths.length - 1;
    while (hi - lo > 1) {
      const k = lo + hi >> 1;
      if (stream.lengths[k] < d) lo = k;
      else hi = k;
    }
    return stream.points[lo].clone().lerp(stream.points[hi], clamp((d - stream.lengths[lo]) / (stream.lengths[hi] - stream.lengths[lo])));
  }
  travelAt(time) {
    let i = 0;
    while (i < this.times.length - 2 && this.times[i + 1] < time) i++;
    const t = clamp((time - this.times[i]) / (this.times[i + 1] - this.times[i]));
    return mix(this.integral[i], this.integral[i + 1], t);
  }
  updateWake(stream, time, u) {
    const separate = ramp(31, 31.85, u), heightPhase = separate * (stream.height - 0.58) * 1.12;
    const near = Math.abs(stream.offset) < 0.3, amplitude = near ? 0.255 : 0.052;
    stream.lengths[0] = 0;
    for (let k = 0; k < stream.points.length; k++) {
      const rest = stream.basePoints[k], p = stream.points[k];
      p.copy(rest);
      const envelope = ramp(0.82, 1.48, rest.x) * (1 - 0.32 * ramp(3.2, 4.8, rest.x));
      const phase = (rest.x - 0.82) * 3.65 - time * 1.16 - heightPhase;
      const turn = Math.sin(phase) + Math.sign(stream.offset) * 0.13 * Math.sin(phase * 2);
      p.z += envelope * amplitude * turn;
      p.y += envelope * (near ? 0.055 : 9e-3) * Math.cos(phase);
      if (k) stream.lengths[k] = stream.lengths[k - 1] + p.distanceTo(stream.points[k - 1]);
    }
    stream.length = stream.lengths.at(-1);
    const start = stream.guide.geometry.getAttribute("instanceStart"), end = stream.guide.geometry.getAttribute("instanceEnd");
    for (let k = 0; k < stream.points.length - 1; k++) {
      const a = stream.points[k], b = stream.points[k + 1];
      start.setXYZ(k, a.x, a.y, a.z);
      end.setXYZ(k, b.x, b.y, b.z);
    }
    start.data.needsUpdate = true;
  }
  update(state, camera2) {
    const u = state.n + state.u, weight = pulse(28.85, 29.6, 34.05, 35.15, u);
    this.root.visible = weight > 1e-5;
    if (!this.root.visible) return;
    this.root.position.x = -14 * (1 - ramp(28.85, 29.6, u)) + 14 * ramp(34.05, 35.15, u);
    const time = this.physics.physicalTime(state), travel = this.travelAt(time) * 0.091;
    const focus = 1 - 0.62 * pulse(31.45, 31.95, 33.55, 34.15, u);
    const worldPerPixel = (p) => 2 * Math.tan(T4.MathUtils.degToRad(camera2.fov) / 2) * camera2.position.distanceTo(p) / 1080;
    for (const stream of this.streams) {
      this.updateWake(stream, time, u);
      const displacement = this.physics.displacementAt(V(0, stream.height, 0));
      stream.guide.position.copy(displacement);
      stream.guide.material.opacity = (Math.abs(stream.offset) < 0.3 ? 0.34 : 0.12) * focus;
      const phase = (travel + stream.phase) % 1, tailLength = Math.abs(stream.offset) < 0.3 ? 1.52 : 1.1;
      const leading = phase * (stream.length + tailLength);
      const visibility = ramp(0, 0.16, leading) * (1 - ramp(stream.length, stream.length + tailLength, leading));
      for (let k = 0; k < TAIL; k++) {
        const t = k / (TAIL - 1), distance = leading - tailLength * (1 - t), p = this.pathAt(stream, distance).add(displacement);
        const tangent = this.pathAt(stream, Math.min(stream.length, distance + 0.015)).sub(this.pathAt(stream, Math.max(0, distance - 0.015))).normalize();
        const view = camera2.position.clone().sub(p).normalize(), side = new T4.Vector3().crossVectors(tangent, view).normalize();
        const half = worldPerPixel(p) * stream.width * 0.5 * Math.pow(t, 0.58) * focus;
        const alpha = visibility * (distance > 0 && distance < stream.length ? 1 : 0) * Math.pow(t, 0.7) * 0.9;
        for (let e = 0; e < 2; e++) {
          const v = p.clone().addScaledVector(side, (e ? 1 : -1) * half), vi = (k * 2 + e) * 3, ci = (k * 2 + e) * 4;
          stream.positions[vi] = v.x;
          stream.positions[vi + 1] = v.y;
          stream.positions[vi + 2] = v.z;
          stream.colors[ci] = stream.color.r;
          stream.colors[ci + 1] = stream.color.g;
          stream.colors[ci + 2] = stream.color.b;
          stream.colors[ci + 3] = alpha;
        }
      }
      stream.ribbon.geometry.getAttribute("position").needsUpdate = true;
      stream.ribbon.geometry.getAttribute("color").needsUpdate = true;
      const tip = this.pathAt(stream, leading).add(displacement);
      stream.head.position.copy(tip);
      stream.head.scale.setScalar(worldPerPixel(tip) * stream.width * 0.52 * focus);
      stream.head.visible = leading > 0 && leading < stream.length;
      stream.head.material.opacity = visibility * 0.96;
    }
  }
  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof T4.Mesh) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.streams.length = 0;
  }
};

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

// research/visual-v3/check-frozen-physics.ts
var read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
var sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
var frozen = read("research/visual-v3/render-inputs.json");
var data = read("public/physics/response.json");
var envData = read("public/physics/environment-response.json");
var tl = read("src/timeline.json");
var manifest = read("public/models/shanghai-tower-manifest.json");
var auditedFiles = ["src/PhysicsPlayback.ts", "src/EnvironmentPlayback.ts", "src/WindVisualization.ts", "src/World.ts", "src/Film.tsx", "src/CameraPath.ts", "src/timeline.json", "public/physics/response.json", "public/physics/environment-response.json", "public/physics/structural-graph.json"];
var hashes = Object.fromEntries(auditedFiles.map((p) => [p, sha(p)]));
for (const p of auditedFiles) assert.equal(hashes[p], frozen.files[p]);
var scene = new T5.Scene();
var camera = new T5.PerspectiveCamera(34, 1920 / 1080, 8e-3, 200);
var physics = new PhysicsPlayback(data, tl);
var env = new EnvironmentPlayback(scene, envData, physics);
var wind = new WindVisualization(scene, physics);
var path = new CameraPath(tl);
path.setAnchors(manifest.cameraAnchorsThree);
var clips = ["s013", "s019", "s020", "s029", "s030", "s031", "s032", "s033", "s034", "s035", "s036", "s037", "s038", "s039"];
var frames = /* @__PURE__ */ new Set([4171, 6780]);
for (const id of clips) {
  const c = tl.clips.find((c2) => c2.id === id);
  for (const phase of [0.05, 0.25, 0.5, 0.75, 0.95]) frames.add(Math.floor(c.start + (c.end - c.start) * phase));
}
var arrowSamples = 0;
var axisSamples = 0;
var referenceSamples = 0;
var maxAnchorError = 0;
var maxReferenceError = 0;
var maxDirectionError = 0;
var minWakeVelocity = Infinity;
var maxWakeVelocity = -Infinity;
var maxUpstreamDeflection = 0;
var samples = [];
for (const frame of [...frames].sort((a, b) => a - b)) {
  const s = stateAt(frame, tl);
  physics.update(s);
  path.apply(camera, s.time);
  camera.updateMatrixWorld();
  env.update(s, camera);
  wind.update(s, camera);
  const u = s.n + s.u;
  if (env.wind.visible) for (let j = 0; j < env.windArrows.length; j++) {
    const ar = env.windArrows[j];
    if (!ar.root.visible) continue;
    const actualDirection = V(0, 1, 0).applyQuaternion(ar.root.quaternion), k = env.windIndices[j], force = V(...envData.tmd.windLoads.baseForce_N[k]).normalize();
    const d = 1 - actualDirection.dot(force);
    assert(Math.abs(d) < 1e-10);
    maxDirectionError = Math.max(maxDirectionError, Math.abs(d));
    const tip = V(0, ar.head.position.y + ar.head.scale.y * 0.5, 0).applyQuaternion(ar.root.quaternion).add(ar.root.position), rest = V(...envData.tmd.windLoads.nodeXYZ_m[k]).multiplyScalar(0.01), anchor = rest.clone().add(physics.displacementAt(rest)), error = tip.distanceTo(anchor);
    assert(error < 1e-10);
    maxAnchorError = Math.max(maxAnchorError, error);
    arrowSamples++;
  }
  for (let j = 0; j < env.axialArrows.length; j++) {
    const ar = env.axialArrows[j];
    if (!ar.root.visible) continue;
    const idx = env.axialIndices[Math.floor(j / 2)], axis = physics.axes[idx], stress = physics.currentStress[idx], outward = axis.delta.clone().normalize().multiplyScalar(j % 2 ? 1 : -1), direction = V(0, 1, 0).applyQuaternion(ar.root.quaternion);
    assert(direction.dot(outward) * Math.sign(stress) > 0.999999);
    assert.equal(ar.mat.color.getHexString(), stress >= 0 ? "087d9b" : "d75d37");
    axisSamples++;
  }
  if (env.reference.visible) {
    const a = env.outline.geometry.getAttribute("instanceStart"), b = env.currentReference.geometry.getAttribute("instanceStart");
    for (const k of [0, 20, 50, 80, 99]) {
      const p = V(a.getX(k), a.getY(k), a.getZ(k)), q = V(b.getX(k), b.getY(k), b.getZ(k)), expected = physics.displacementAt(p), error = q.sub(p).distanceTo(expected);
      assert(error < 1e-6);
      maxReferenceError = Math.max(maxReferenceError, error);
      referenceSamples++;
    }
  }
  if (wind.root.visible) {
    for (const stream of wind.streams) {
      for (let k = 0; k < stream.points.length; k++) if (stream.basePoints[k].x <= 0.82) maxUpstreamDeflection = Math.max(maxUpstreamDeflection, stream.points[k].distanceTo(stream.basePoints[k]));
      assert(stream.positions.every(Number.isFinite));
    }
    if (s.section === "wind") {
      const next = stateAt(frame + 1, tl), dt = physics.physicalTime(next) - physics.physicalTime(s);
      if (dt > 0) for (const h of [0.58, 1.69, 2.82, 4.03, 5.24]) {
        const phaseDelta = (ramp(31, 31.85, next.n + next.u) - ramp(31, 31.85, u)) * (h - 0.58) * 1.12, v = (1.16 + phaseDelta / dt) / 3.65;
        minWakeVelocity = Math.min(minWakeVelocity, v);
        maxWakeVelocity = Math.max(maxWakeVelocity, v);
        assert(v > 0);
      }
    }
  }
  const tm = env.tmd(s), length = manifest.tmdAnchorsThree.cableLength, ratio = tm.relative / length;
  assert(Math.abs(ratio) < 1);
  const angleDeg = T5.MathUtils.radToDeg(Math.asin(ratio));
  samples.push({ frame, clip: s.clip.id, clipU: s.u, physicalTime: physics.physicalTime(s), windVisible: wind.root.visible, windArrows: env.wind.visible, axialStressMPa: env.axialIndices.map((i) => physics.currentStress[i]), tmdRelativeMetres: tm.relative, tmdAngleDeg: angleDeg });
}
assert.equal(maxUpstreamDeflection, 0);
var phaseContinuity = [];
var c31 = tl.clips.find((c) => c.id === "s031");
for (const u of [31, 31.85]) {
  const frame = c31.start + (u - 31) * (c31.end - c31.start);
  const values = [];
  for (const df of [-1e-3, 0, 1e-3]) {
    const s = stateAt(frame + df, tl);
    physics.update(s);
    path.apply(camera, s.time);
    wind.update(s, camera);
    values.push(wind.streams.filter((x) => Math.abs(x.offset) < 0.3).map((st) => st.points[125].toArray()));
  }
  let jump = 0;
  for (let i = 0; i < values[0].length; i++) jump = Math.max(jump, new T5.Vector3(...values[0][i]).distanceTo(new T5.Vector3(...values[2][i])));
  assert(jump < 1e-4);
  phaseContinuity.push({ u, probeHalfWidthFrames: 1e-3, maxWorldDelta: jump });
}
var maxRelative = Math.max(...envData.tmd.relativeX_m.map(Math.abs));
var L = manifest.tmdAnchorsThree.cableLength;
var columnIndices = data.members.map((m, i) => /megacolumn|corner/i.test(m.role) ? i : -1).filter((i) => i >= 0);
var maxColumnStress = Math.max(...physics.dynamicStress.flatMap((row) => columnIndices.map((i) => Math.abs(row[i]))));
assert(maxColumnStress <= 6);
var coreMax = Math.max(...envData.tmd.coreWindSection.extremeMPa.flat());
assert(coreMax <= 6);
for (const p of auditedFiles) assert.equal(sha(p), hashes[p]);
var report = { date: (/* @__PURE__ */ new Date()).toISOString(), scope: "Frozen-source offline playback sampling, not a new solve and not final encoded-video QA", hashes, allMatchFrozenInputs: true, sampleCount: samples.length, arrowSamples, axisSamples, referenceSamples, maxAnchorError, maxReferenceError, maxDirectionError, maxUpstreamDeflection, minWakeVelocity, maxWakeVelocity, phaseContinuity, columnLegend: { limit: 6, maxAbsoluteMPa: maxColumnStress, colorPower: STRESS_COLOR_POWER, positive: "blue / tension-directed increment", negative: "orange / compression-directed increment" }, coreLegend: { range: [0, 6], maxMPa: coreMax, colorPower: CORE_STRESS_COLOR_POWER, meaning: "unsigned equivalent section normal-stress envelope" }, magnification: { tower: WIND_MAGNIFICATION, tmdRelative: TMD_RELATIVE_MAGNIFICATION }, tmd: { cableLengthMetres: L, maxRelativeMetres: maxRelative, maxAngleDeg: T5.MathUtils.radToDeg(Math.asin(maxRelative / L)), maxPendulumRiseMetres: L - Math.sqrt(L * L - maxRelative * maxRelative), relativeWorldAmplitude: maxRelative * 0.01 }, samples };
fs.writeFileSync("research/visual-v3/frozen-physics-qa.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, samples: void 0, hashes: void 0 }, null, 2));
