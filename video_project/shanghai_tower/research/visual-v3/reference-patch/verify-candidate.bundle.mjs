// research/visual-v3/reference-patch/verify-candidate.ts
import fs from "node:fs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import * as T4 from "three";

// research/visual-v3/reference-patch/src/EnvironmentPlayback.ts
import * as T2 from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

// research/visual-v3/reference-patch/src/visual.ts
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

// research/visual-v3/reference-patch/src/EnvironmentPlayback.ts
var PILE_MAGNIFICATION = 80;
var ForceArrow = class {
  constructor(c, radius = 6e-3) {
    this.radius = radius;
    this.mat = new T2.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.12, emissive: c, emissiveIntensity: 0.16 });
    this.shaft = new T2.Mesh(new T2.CylinderGeometry(1, 1, 1, 12), this.mat);
    this.head = new T2.Mesh(new T2.ConeGeometry(1, 1, 20), this.mat);
    this.bead = new T2.Mesh(new T2.SphereGeometry(1, 12, 8), new T2.MeshBasicMaterial({ color: "#fff4d9", toneMapped: false }));
    this.root.add(this.shaft, this.head, this.bead);
  }
  radius;
  root = new T2.Group();
  shaft;
  head;
  bead;
  mat;
  set(a, b, weight = 1, camera, phase = 0) {
    const d = b.clone().sub(a), length = d.length();
    this.root.visible = weight > 1e-3 && length > 1e-4;
    if (!this.root.visible) return;
    this.root.position.copy(a);
    this.root.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    const pixel = camera ? 2 * Math.tan(T2.MathUtils.degToRad(camera.fov) / 2) * camera.position.distanceTo(a) / 1080 : 0, r = Math.min(length * 0.075, Math.max(this.radius, pixel * 2.2)) * Math.max(0.3, weight), h = Math.min(r * 7.6, length * 0.32), body = Math.max(1e-4, length - h);
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
function setReferenceLine(line, points, progress = 1) {
  const count = points.length - 1, limit = count * clamp(progress), shown = Math.min(count, Math.ceil(limit));
  const start = line.geometry.getAttribute("instanceStart"), end = line.geometry.getAttribute("instanceEnd");
  const ds = line.geometry.getAttribute("instanceDistanceStart"), de = line.geometry.getAttribute("instanceDistanceEnd");
  let distance = 0;
  for (let k = 0; k < count; k++) {
    const a = points[k], fullEnd = points[k + 1], b = k === shown - 1 ? a.clone().lerp(fullEnd, clamp(limit - k)) : fullEnd;
    start.setXYZ(k, a.x, a.y, a.z);
    end.setXYZ(k, b.x, b.y, b.z);
    ds.setX(k, distance);
    de.setX(k, distance + a.distanceTo(b));
    distance += a.distanceTo(fullEnd);
  }
  start.data.needsUpdate = true;
  ds.data.needsUpdate = true;
  line.geometry.instanceCount = shown;
  line.visible = shown > 0;
}
function referenceTiming(u) {
  return {
    draw: pulse(12.8, 13.1, 13.75, 14.1, u) + pulse(31.55, 32.2, 33.55, 34.1, u),
    connector: pulse(13.1, 13.2, 13.65, 13.75, u) + pulse(32.2, 32.3, 33.45, 33.55, u),
    marker: pulse(13.2, 13.3, 13.55, 13.65, u) + pulse(32.3, 32.4, 33.35, 33.45, u)
  };
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
  const tex = new T2.DataTexture(bytes, n, n, T2.RGBAFormat);
  tex.wrapS = tex.wrapT = T2.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.needsUpdate = true;
  tex.colorSpace = T2.SRGBColorSpace;
  return tex;
}
var EnvironmentPlayback = class {
  constructor(scene, data2, physics2) {
    this.scene = scene;
    this.physics = physics2;
    if (data2.schema !== "rainbow.shanghai-environment/1") throw new Error("Missing verified environmental response");
    this.data = data2;
    this.pileOrigin.y = -Number(data2.pile.headDepthBelowGrade_m) * 0.01;
    scene.add(this.root);
    this.root.add(this.soil, this.pile, this.wind, this.reference);
    this.texture = earthTexture();
    const earthColors = ["#ac9275", "#afa084", "#959683", "#898e7b", "#a3a18a", "#b1a58d", "#aaa088", "#b9a47f", "#c1ab84", "#ac9c7d", "#b8a684", "#a39472"];
    const layers = data2.pile.soilLayers.map((l, i) => [l.depthRangeBelowGrade_m[0] * 0.01, l.depthRangeBelowGrade_m[1] * 0.01, earthColors[i % earthColors.length]]);
    for (const [top, bottom, c] of layers) {
      const mat = new T2.MeshStandardMaterial({ color: c, map: this.texture, bumpMap: this.texture, bumpScale: 8e-3, roughness: 0.94 });
      const m = new T2.Mesh(new T2.BoxGeometry(1.6, bottom - top, 0.22), mat);
      m.position.set(0, -(top + bottom) / 2, -0.6);
      m.receiveShadow = true;
      this.soil.add(m);
    }
    const count = data2.pile.nodes.length - 1;
    for (let i = 0; i < count; i++) {
      const m = new T2.Mesh(new T2.CylinderGeometry(75e-4, 75e-4, 1, 16), new T2.MeshStandardMaterial({ color: "#c9774f", metalness: 0.12, roughness: 0.46 }));
      this.pileSegments.push(m);
      this.pile.add(m);
    }
    for (let i = 0; i < 7; i++) {
      const a = new ForceArrow("#087b95", 42e-4);
      this.sideArrows.push(a);
      this.pile.add(a.root);
    }
    this.pile.add(this.toeArrow.root, this.loadArrow.root, this.lateralArrow.root);
    const guide = new T2.Line(new T2.BufferGeometry().setFromPoints([this.pileOrigin, this.pileOrigin.clone().add(V(0, -0.52, 0))]), new T2.LineDashedMaterial({ color: "#778984", dashSize: 0.013, gapSize: 0.011, transparent: true, opacity: 0.65 }));
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
        if (o instanceof T2.Mesh) {
          o.material.depthTest = false;
          o.material.transparent = true;
        }
      });
      this.windArrows.push(a);
      this.wind.add(a.root);
      let nearest = 0;
      for (let i = 1; i < loads.windLoads.nodeIds.length; i++) if (Math.abs(loads.windLoads.nodeXYZ_m[i][1] - h) < Math.abs(loads.windLoads.nodeXYZ_m[nearest][1] - h)) nearest = i;
      this.windIndices.push(nearest);
      const target = new T2.Mesh(new T2.RingGeometry(9e-3, 0.015, 24), new T2.MeshBasicMaterial({ color: "#c56b40", side: T2.DoubleSide, depthWrite: false, depthTest: false, toneMapped: false }));
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
    this.referenceDot = new T2.Mesh(new T2.SphereGeometry(0.027, 16, 12), new T2.MeshStandardMaterial({ color: "#107d96", emissive: "#107d96", emissiveIntensity: 0.2 }));
    this.reference.add(this.outline, this.currentReference, this.connector, this.referenceDot);
    physics2.setCoreBending(data2.tmd);
  }
  scene;
  physics;
  root = new T2.Group();
  soil = new T2.Group();
  pile = new T2.Group();
  wind = new T2.Group();
  reference = new T2.Group();
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
  update(s, camera) {
    const u = s.n + s.u, soil = pulse(4.15, 5, 8.8, 9.8, u);
    this.soil.position.y = -4 * (1 - soil);
    this.soil.visible = soil > 1e-5;
    const pw = pulse(6.2, 6.65, 7.95, 8.45, u), load = ramp(6.55, 7.72, u), stages = this.data.pile.stages, index = load * (stages.length - 1), i = Math.min(stages.length - 2, Math.floor(index)), a = stages[i], b = stages[i + 1], f = index - i;
    const point = (k) => {
      const rest2 = this.data.pile.nodes[k].xyz_m;
      return this.pileOrigin.clone().add(V(rest2[0], rest2[1], rest2[2] ?? 0).multiplyScalar(0.01)).add(V(mix(a.u_m[k][0], b.u_m[k][0], f), mix(a.u_m[k][1], b.u_m[k][1], f), 0).multiplyScalar(0.01 * PILE_MAGNIFICATION * pw));
    };
    this.pile.visible = pw > 1e-3;
    this.pile.position.x = 3 * (1 - pw);
    this.pileSegments.forEach((m, k) => {
      const p2 = point(k), q2 = point(k + 1), v = q2.clone().sub(p2);
      m.position.copy(p2).add(q2).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), v.clone().normalize());
      m.scale.y = v.length();
      const force = Math.abs(mix(a.axialForce_N[k], b.axialForce_N[k], f));
      m.material.color.set("#d8caba").lerp(new T2.Color(C.red), clamp(force / 8e6) ** 0.6);
    });
    const head = point(0);
    this.loadArrow.set(head.clone().add(V(0, 0.145 * load, 0)), head, pw * load, camera, s.time * 0.75);
    this.lateralArrow.set(head.clone().add(V(-0.13 * load, 0, 0)), head, pw * load, camera, s.time * 0.75 + 0.3);
    this.sideArrows.forEach((ar, j) => {
      const k = Math.max(1, Math.round((j + 1) / 8 * (this.data.pile.nodes.length - 1))), p2 = point(k), reaction2 = mix(a.sideReactionOnPile_N[k][1], b.sideReactionOnPile_N[k][1], f), len = 0.015 + 0.065 * clamp(Math.abs(reaction2) / 6e5), q2 = p2.clone().add(V(0.012, 0, 7e-3));
      ar.set(q2.clone().add(V(0, -Math.sign(reaction2) * len, 0)), q2, pw * load, camera, s.time * 0.75 + j * 0.17);
    });
    const toe = point(this.data.pile.nodes.length - 1), reaction = mix(a.toeReactionOnPile_N[1], b.toeReactionOnPile_N[1], f);
    this.toeArrow.set(toe.clone().add(V(0, -0.025 - 0.1 * clamp(reaction / 8e6), 0)), toe, pw * load, camera, s.time * 0.75);
    const w = pulse(29.85, 30.5, 33.8, 34.6, u), tm = this.tmd(s);
    this.wind.visible = w > 1e-3;
    const wl = this.data.tmd.windLoads;
    this.windArrows.forEach((ar, j) => {
      const k = this.windIndices[j], xyz = wl.nodeXYZ_m[k], force = wl.baseForce_N[k], rest2 = V(...xyz).multiplyScalar(0.01), p2 = rest2.clone().add(this.physics.displacementAt(rest2)), vector = V(...force).multiplyScalar(tm.windFactor * 5e-6 * w);
      ar.set(p2.clone().sub(vector), p2, w, camera, this.physics.physicalTime(s) * 0.55 + j * 0.12);
      const target = this.windTargets[j];
      target.position.copy(p2);
      target.visible = ar.root.visible;
      target.scale.setScalar(w);
      if (camera) target.quaternion.copy(camera.quaternion);
    });
    const timing = referenceTiming(u);
    this.reference.visible = timing.draw > 0;
    this.reference.position.set(0, 0, 0.4);
    const rest = [], deformed = [];
    for (let k = 0; k <= 100; k++) {
      const p2 = V(-0.3 + 0.115 * k / 100, 5.8 * k / 100, 0);
      rest.push(p2);
      deformed.push(p2.clone().add(this.physics.displacementAt(p2)));
    }
    setReferenceLine(this.outline, rest, timing.draw);
    setReferenceLine(this.currentReference, deformed, timing.draw);
    const p = V(-0.185, 5.8, 0), q = p.clone().add(this.physics.displacementAt(p));
    setReferenceLine(this.connector, [p, q]);
    this.connector.material.linewidth = 3.2 * timing.connector;
    this.connector.visible = timing.connector > 0;
    this.referenceDot.position.copy(q);
    this.referenceDot.scale.setScalar(timing.marker);
    this.referenceDot.visible = timing.marker > 0;
    const aw = Math.max(pulse(18.85, 19.25, 20.75, 21.15, u), pulse(32.95, 33.25, 33.72, 34.1, u));
    this.axialArrows.forEach((ar, j) => {
      const idx = this.axialIndices[Math.floor(j / 2)], axis = this.physics.axes[idx], node = j % 2 ? axis.j : axis.i, p2 = (j % 2 ? axis.b : axis.a).clone().multiplyScalar(0.01), gain = (this.physics.play?.scale ?? 1) * (this.physics.play?.weight ?? 0) * 0.01;
      p2.add(V(this.physics.currentU[node * 3], this.physics.currentU[node * 3 + 1], this.physics.currentU[node * 3 + 2]).multiplyScalar(gain));
      const stress = this.physics.currentStress[idx], member = this.physics.data.members[idx], area = member.A_m2 ?? member.section?.A ?? member.A;
      if (!(area > 0)) throw new Error("Missing actual mega-column section area");
      const axialForce = stress * 1e6 * area, outward = axis.delta.clone().normalize().multiplyScalar(j % 2 ? 1 : -1), length = Math.abs(axialForce) * 37e-10 * aw, outer = p2.clone().addScaledVector(outward, length);
      ar.mat.color.set(stress >= 0 ? "#087d9b" : "#d75d37");
      ar.mat.emissive.copy(ar.mat.color);
      ar.set(stress >= 0 ? p2 : outer, stress >= 0 ? outer : p2, aw, camera, s.time * 0.6 + j * 0.18);
    });
  }
  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof T2.Mesh || o instanceof T2.Line) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.texture.dispose();
  }
};

// research/visual-v3/reference-patch/src/PhysicsPlayback.ts
import * as T3 from "three";
var WIND_MAGNIFICATION = 48;
var STRESS_COLOR_POWER = 0.45;
var CORE_STRESS_COLOR_POWER = 0.45;
var cool = new T3.Color("#087d9b");
var zero = new T3.Color("#c6ccce");
var warm = new T3.Color("#dd4e2b");
var white = new T3.Color("#ffffff");
var tmpColor = new T3.Color();
var bendLow = new T3.Color("#dae2df");
var bendHigh = new T3.Color("#df7949");
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
    geometry.setAttribute("color", new T3.BufferAttribute(bind.colors, 3));
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
        tmpColor.copy(bendLow).lerp(bendHigh, Math.pow(clamp(this.currentBending[m] / 6), CORE_STRESS_COLOR_POWER));
      } else tmpColor.copy(zero).lerp(stress >= 0 ? cool : warm, amount);
      if (m < 0) tmpColor.copy(white);
      else tmpColor.lerp(white, 1 - tint);
      tmpColor.toArray(bind.colors, idx);
    }
    pos.needsUpdate = true;
    geometry.getAttribute("color").needsUpdate = true;
    if (bind.member[0] >= 0) {
      const base2 = material.userData.physicsBaseColor ?? material.color.clone();
      material.userData.physicsBaseColor = base2;
      material.color.copy(base2).lerp(white, tint);
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

// research/visual-v3/reference-patch/verify-candidate.ts
var tl = JSON.parse(fs.readFileSync("src/timeline.json", "utf8"));
var data = JSON.parse(fs.readFileSync("public/physics/response.json", "utf8"));
var environment = JSON.parse(fs.readFileSync("public/physics/environment-response.json", "utf8"));
var sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
var base = sha("src/EnvironmentPlayback.ts");
var physics = new PhysicsPlayback(data, tl);
var env = new EnvironmentPlayback(new T4.Scene(), environment, physics);
var ranges = [];
var begin = -1;
for (let frame = 0; frame < tl.duration; frame++) {
  const s = stateAt(frame, tl), on = referenceTiming(s.n + s.u).draw > 0;
  if (on && begin < 0) begin = frame;
  if (!on && begin >= 0) {
    ranges.push([begin, frame - 1]);
    begin = -1;
  }
}
var frames = /* @__PURE__ */ new Set();
for (const [a, b] of ranges) {
  for (let f = a - 1; f <= b + 1; f += 7) frames.add(f);
  [a - 1, a, a + 1, b - 1, b, b + 1].forEach((f) => frames.add(f));
}
for (const [a, b] of [[13.1, 13.3], [13.55, 13.75], [32.2, 32.4], [33.35, 33.55]]) for (const u of [a, b]) {
  const clip = tl.clips.find((c) => Number(c.id.slice(1)) === Math.floor(u));
  frames.add(Math.round(clip.start + (u - Math.floor(u)) * (clip.end - clip.start)));
}
var ordered = [...frames].sort((a, b) => a - b);
var originalBuffer = env.currentReference.geometry.getAttribute("instanceStart").data;
var snapshot = () => JSON.stringify({ shown: env.reference.visible, outline: Array.from(env.outline.geometry.getAttribute("instanceStart").data.array), outlineEnd: Array.from(env.outline.geometry.getAttribute("instanceEnd").data.array), drawn: env.outline.geometry.instanceCount, displaced: Array.from(env.currentReference.geometry.getAttribute("instanceStart").data.array), connector: Array.from(env.connector.geometry.getAttribute("instanceStart").data.array), width: env.connector.material.linewidth, marker: env.referenceDot.position.toArray(), scale: env.referenceDot.scale.toArray() });
var snapshots = /* @__PURE__ */ new Map();
var maxAnchorError = 0;
var maxVisibleHeightError = 0;
var boundaries = [];
for (const frame of ordered) {
  const s = stateAt(frame, tl), timing = referenceTiming(s.n + s.u);
  physics.update(s);
  env.update(s);
  assert.equal(env.currentReference.geometry.getAttribute("instanceStart").data, originalBuffer);
  assert.deepEqual(env.reference.position.toArray(), [0, 0, 0.4]);
  assert.equal(env.outline.geometry.instanceCount, Math.ceil(timing.draw * 100));
  if (env.connector.visible) assert.equal(timing.draw, 1);
  if (env.referenceDot.visible) {
    assert.equal(timing.draw, 1);
    assert.equal(timing.connector, 1);
  }
  const actualTip = env.referenceDot.position, rest = V(-0.185, 5.8, 0), expectedTip = rest.clone().add(physics.displacementAt(rest));
  const error = actualTip.distanceTo(expectedTip);
  maxAnchorError = Math.max(maxAnchorError, error);
  assert(error < 1e-10);
  if (timing.draw > 0) {
    const n = env.outline.geometry.instanceCount, ends = env.outline.geometry.getAttribute("instanceEnd"), height = ends.getY(n - 1);
    maxVisibleHeightError = Math.max(maxVisibleHeightError, Math.abs(height - 5.8 * timing.draw));
    assert(Math.abs(height - 5.8 * timing.draw) < 1e-6);
  }
  snapshots.set(frame, snapshot());
  if (ranges.some(([a, b]) => [a - 1, a, a + 1, b - 1, b, b + 1].includes(frame))) boundaries.push({ frame, timeSeconds: frame / 30, ...timing, shownSegments: env.outline.geometry.instanceCount, visibleHeight: 5.8 * timing.draw });
}
for (const frame of ordered.slice().sort((a, b) => Math.sin(a * 37) - Math.sin(b * 37))) {
  const s = stateAt(frame, tl);
  physics.update(s);
  env.update(s);
  assert.equal(snapshot(), snapshots.get(frame));
}
assert.equal(sha("src/EnvironmentPlayback.ts"), base);
var result = { status: "passed; candidate not applied", productionSourceSHA256: base, minimumInclusiveFrameRanges: ranges, minimumRangeSeconds: ranges.map(([a, b]) => [a / 30, (b + 1) / 30]), candidateSampleCount: ordered.length, randomAccessDeterministic: true, fixedTrueAnchors: true, bufferIdentityPreserved: true, maxAnchorError, maxVisibleHeightError, boundaries };
fs.writeFileSync("research/visual-v3/reference-patch/candidate-qa.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
