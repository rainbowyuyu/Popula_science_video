// expanded-impact-current.ts
import * as T8 from "three";

// src/visual.ts
import * as T from "three";
var V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
var clamp = (x) => Math.max(0, Math.min(1, x));
var smooth = (x) => {
  const u = clamp(x);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
function mat(color, opacity2 = 1, roughness = 0.4) {
  const m = new T.MeshStandardMaterial({ color, roughness, metalness: 0.05, transparent: true, opacity: opacity2, depthWrite: opacity2 > 0.9 });
  m.userData.baseOpacity = opacity2;
  return m;
}
function visibility(o, k) {
  o.visible = k > 1e-4;
  o.traverse((n) => {
    if (n instanceof T.Mesh || n instanceof T.Line) {
      const ms = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of ms) {
        if (m.userData.baseOpacity === void 0) m.userData.baseOpacity = m.opacity;
        m.opacity = k * m.userData.baseOpacity;
        m.transparent = true;
        m.depthWrite = m.opacity > 0.96;
      }
    }
  });
}
function stateAt(frame, tl) {
  const s = tl.sections.find((s2) => frame >= s2.start && frame < s2.end) ?? (frame < tl.sections[0].start ? tl.sections[0] : tl.sections[tl.sections.length - 1]);
  const c = tl.clips.filter((c2) => c2.start <= frame).at(-1) ?? tl.clips[0];
  return { frame, time: frame / tl.fps, section: s.id, progress: clamp((frame - s.start) / (s.end - s.start)), elapsed: (frame - s.start) / tl.fps, clip: c, clipProgress: clamp((frame - c.start) / (c.end - c.start)) };
}

// src/V5CameraPath.ts
import * as T2 from "three";
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
  constructor(anchors, tl) {
    this.anchors = anchors;
    this.tl = tl;
    anchors.torso ??= V(0, 1.26, 0.02);
    anchors.autonomic ??= V(0, 1.4, 0);
    anchors.brainheart ??= V(0.01, 1.43, 0.018);
    anchors.muscle ??= V(0.19, 0.86, 0.025);
    const poses = tl.clips.map((c, i) => this.poseFor(c, i));
    const add = (frame, p) => this.knots.push({ frame, ...p, focus: p.focus.clone() });
    if (!poses.length) throw new Error("V5 requires at least one timeline clip");
    add(0, poses[0]);
    add(tl.clips[0].start + tl.clips[0].duration * 0.6, poses[0]);
    let previousArrival = tl.clips[0].start + tl.clips[0].duration * 0.6;
    for (let i = 1; i < poses.length; i++) {
      const prev = tl.clips[i - 1], current = tl.clips[i], a = poses[i - 1], b = poses[i];
      const same = viewOf(prev) === viewOf(current) && !current.camera;
      const decades = Math.abs(Math.log10(a.distance / b.distance));
      const previouslyRepeated = i > 1 && viewOf(this.tl.clips[i - 2]) === viewOf(prev);
      const nextRepeated = i + 1 < tl.clips.length && viewOf(this.tl.clips[i + 1]) === viewOf(current);
      const retainDetail = a.distance < 1e-3 || ["cpap_airway", "atrial_stasis"].includes(prev.mechanism ?? "");
      const prevSpoken = prev.duration - (prev.additionalPauseAfterSeconds ?? 0) * tl.fps;
      const currentSpoken = current.duration - (current.additionalPauseAfterSeconds ?? 0) * tl.fps;
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
        const bridge = Math.max(minDistance, separateMicroSites ? shift * 3.8 : Math.min(shift * 3.8, Math.max(a.distance, b.distance) * 1.65));
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
    const last = tl.clips.at(-1);
    add(last.end, poses.at(-1));
    if (tl.duration > last.end + 30) {
      const offset = poses.at(-1).focus.clone().add(V(2.5, 0, 0));
      add(last.end + Math.min(120, (tl.duration - last.end) * 0.6), { ...poses.at(-1), focus: offset, distance: 1.5 });
      add(tl.duration, { ...poses.at(-1), focus: offset, distance: 1.5 });
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
      d.distance = 75e-6;
      d.az = 0.16;
      d.el = 0.46;
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

// src/V5HandoffContext.ts
import * as T3 from "three";
var spanWeight = (tl, frame, view) => Math.max(0, ...tl.clips.map((c, i) => {
  if (c.view !== view) return 0;
  const a = tl.clips[i - 1]?.duration ?? 150, b = tl.clips[i + 1]?.duration ?? 150;
  return gate(frame, c.start - a * 0.48, c.end + b * 0.72, Math.min(60, a * 0.25));
}));
var closer = (d, near, far) => 1 - smooth(Math.log(Math.max(d, 1e-12) / near) / Math.log(far / near));
var gate = (frame, start, end, ramp2 = 45) => smooth((frame - start) / ramp2) * (1 - smooth((frame - end + ramp2) / ramp2));
var V5HandoffContext = class {
  constructor(tl) {
    this.tl = tl;
    this.root.name = "bounded-cross-scale-optical-handoffs";
    this.root.visible = false;
    this.platelets.name = "resting-platelets-2point5-micrometres";
    this.root.add(this.platelets);
    const centers = [V(-41e-7, 23e-7, -16e-7), V(48e-7, 14e-7, -22e-7), V(12e-7, -13e-7, -27e-7)];
    centers.forEach((point, i) => {
      const platelet = new T3.Group();
      platelet.name = `resting-platelet-context-${i}`;
      platelet.position.copy(point);
      platelet.rotation.set(0.72 + i * 0.13, 0.12 * i, 0.25 * i);
      const surface = new T3.Mesh(new T3.SphereGeometry(125e-8, 32, 20), mat("#a79b9e", 0.68, 0.63));
      surface.scale.set(1, 0.24, 1);
      platelet.add(surface);
      const center = new T3.Mesh(new T3.SphereGeometry(48e-8, 20, 14), mat("#9c8996", 0.36, 0.62));
      center.scale.set(1, 0.38, 1);
      platelet.add(center);
      for (let j = 0; j < 7; j++) {
        const a = j * 2.39996, r = 38e-8 + 18e-8 * (j % 2);
        const granule = new T3.Mesh(new T3.SphereGeometry(115e-9, 12, 8), mat("#887d90", 0.5, 0.58));
        granule.position.set(Math.cos(a) * r, 9e-8, Math.sin(a) * r);
        platelet.add(granule);
      }
      this.platelets.add(platelet);
    });
    const reticle = (name) => {
      const geometry = new T3.RingGeometry(1, 1.055, 64), material2 = new T3.MeshBasicMaterial({ color: "#397f7b", opacity: 0.74, transparent: true, depthWrite: false, depthTest: false, side: T3.DoubleSide });
      const mesh = new T3.Mesh(geometry, material2);
      mesh.name = name;
      mesh.renderOrder = 1900;
      mesh.userData.annotation = true;
      this.root.add(mesh);
      return mesh;
    };
    this.plasmaCue = reticle("same-plasma-location-screen-annotation");
    this.wallCue = reticle("same-wall-location-screen-annotation");
    this.root.userData = { plateletDiameterMetres: 25e-7, plateletThicknessMetres: 6e-7, positionsFixed: true, reticles: "screen-size annotations, not molecular geometry", support: "current semantic timeline spans" };
  }
  tl;
  root = new T3.Group();
  platelets = new T3.Group();
  plasmaCue;
  wallCue;
  plateletLabelPoint = V();
  plateletLabelVisible = false;
  bloodAnchor = V();
  wallAnchor = V();
  bloodWeight = 0;
  bloodExitWeight = 0;
  wallWeight = 0;
  plateletWeight = 0;
  plasmaCueWeight = 0;
  wallCueWeight = 0;
  setAnchors(blood, wall) {
    this.bloodAnchor.copy(blood);
    this.wallAnchor.copy(wall);
    this.platelets.position.copy(blood);
    this.plasmaCue.position.copy(blood);
    this.wallCue.position.copy(wall);
    this.plateletLabelPoint.copy(blood).add(V(-41e-7, 23e-7, -16e-7));
  }
  update(frame, distance, camera) {
    this.bloodWeight = spanWeight(this.tl, frame, "lipoprotein");
    this.bloodExitWeight = this.bloodWeight;
    this.wallWeight = spanWeight(this.tl, frame, "lipid_wall");
    const plasmaWeight = Math.max(this.bloodWeight, this.bloodExitWeight);
    this.root.visible = plasmaWeight > 0 || this.wallWeight > 0;
    this.plateletWeight = plasmaWeight * closer(distance, 18e-6, 9e-5) * (1 - closer(distance, 16e-7, 4e-6));
    visibility(this.platelets, this.plateletWeight);
    this.plateletLabelVisible = false;
    for (const platelet of this.platelets.children) {
      const point = platelet.position.clone().add(this.bloodAnchor), screen = point.clone().project(camera);
      const x = (screen.x + 1) * 960, y = (1 - screen.y) * 540;
      if (x >= 760 && x <= 1700 && y >= 240 && y <= 760) {
        this.plateletLabelPoint.copy(point);
        this.plateletLabelVisible = true;
        break;
      }
    }
    this.plasmaCueWeight = plasmaWeight * closer(distance, 0.06, 0.15) * (1 - closer(distance, 6e-7, 3e-6));
    this.wallCueWeight = this.wallWeight * closer(distance, 3e-3, 0.015) * (1 - closer(distance, 12e-6, 55e-6));
    for (const [cue, weight] of [[this.plasmaCue, this.plasmaCueWeight], [this.wallCue, this.wallCueWeight]]) {
      cue.quaternion.copy(camera.quaternion);
      cue.scale.setScalar(distance * 0.013);
      visibility(cue, weight);
    }
  }
  liverOpacity(original, distance) {
    const local = Math.max(this.bloodWeight, this.bloodExitWeight);
    const cap = 0.02 + 0.98 * (1 - closer(distance, 0.075, 0.3));
    return original * (1 - local + local * cap);
  }
  wallShellOpacity(original, distance) {
    const continuous = 0.22 * (1 - closer(distance, 3e-4, 6e-3));
    return original + (continuous - original) * this.wallWeight;
  }
  wallMarkerReplacement() {
    return this.wallWeight;
  }
  wallLabelWeight() {
    return this.wallWeight;
  }
  plaqueReturnWeight(frame) {
    return 1;
  }
  plaqueLabelWeight(frame, point, camera) {
    const screen = point.clone().project(camera), y = (1 - screen.y) * 540;
    return smooth((810 - y) / 80);
  }
  labels(distance) {
    if (this.plateletWeight > 0.28 && distance > 2e-6 && this.plateletLabelVisible) return [{ text: "\u8840\u5C0F\u677F \xB7 \u5C3A\u5EA6\u53C2\u7167", point: this.plateletLabelPoint.clone(), side: "right", weight: this.plateletWeight }];
    if (this.plasmaCueWeight > 0.35 && distance > 3e-6) return [{ text: "\u540C\u4E00\u5904\u8840\u6D46", point: this.bloodAnchor.clone(), side: "right", weight: this.plasmaCueWeight }];
    if (this.wallCueWeight > 0.25 && distance > 2e-5) return [{ text: "\u540C\u4E00\u5904\u7BA1\u58C1", point: this.wallAnchor.clone(), side: "right", weight: this.wallCueWeight }];
    return [];
  }
};

// src/V5CardioDetail.ts
import * as T5 from "three";

// src/CardioVascularDetail.ts
import * as T4 from "three";
var TAU = Math.PI * 2;
var V2 = (x = 0, y = 0, z = 0) => new T4.Vector3(x, y, z);
var clamp2 = (v) => Math.max(0, Math.min(1, v));
var ease = (v) => {
  const t = clamp2(v);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var lerp = (a, b, t) => a + (b - a) * t;
var phase = (x) => (x % 1 + 1) % 1;
var col = { red: "#ad4944", inner: "#e8afa4", muscle: "#b8756b", adventitia: "#dbc7b4", teal: "#508e91", paleTeal: "#a6c9c5", gold: "#bba06a", cream: "#e8d9b9", ink: "#395b60" };
function material(color, opacity2 = 1, roughness = 0.5) {
  return new T4.MeshStandardMaterial({ color, roughness, metalness: 0.025, transparent: true, opacity: opacity2, depthWrite: opacity2 > 0.7 });
}
function tube(points, radius, mat4, segments = 52) {
  return new T4.Mesh(new T4.TubeGeometry(new T4.CatmullRomCurve3(points), segments, radius, 8, false), mat4);
}
function disposeTree(root) {
  const geometries = /* @__PURE__ */ new Set();
  const materials = /* @__PURE__ */ new Set();
  root.traverse((o) => {
    const mesh = o;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m));
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  root.removeFromParent();
}
function cutawayGeometry(length, inner, outer, nx = 64, nt = 36) {
  const start = Math.PI * 0.915, span = Math.PI * 1.17;
  const positions = [], indices = [];
  for (let surface = 0; surface < 2; surface++) {
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nt; j++) {
      const a = start + span * j / nt, r = surface ? inner : outer;
      positions.push(length * (i / nx - 0.5), Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  const n = (nx + 1) * (nt + 1);
  for (let s = 0; s < 2; s++) for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
    const a = s * n + i * (nt + 1) + j, b = a + 1, c = a + nt + 1, d = c + 1;
    indices.push(...s ? [a, b, c, b, d, c] : [a, c, b, b, c, d]);
  }
  for (const i of [0, nx]) for (let j = 0; j < nt; j++) {
    const a = i * (nt + 1) + j, b = a + 1;
    indices.push(a, b, a + n, b, b + n, a + n);
  }
  for (const j of [0, nt]) for (let i = 0; i < nx; i++) {
    const a = i * (nt + 1) + j, b = a + nt + 1;
    indices.push(a, a + n, b, b, a + n, b + n);
  }
  const geometry = new T4.BufferGeometry();
  geometry.setAttribute("position", new T4.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, base: Float32Array.from(positions), outer, inner, nx, nt, n, length, start, span };
}
var ArterioleDetail = class {
  root = new T4.Group();
  shells = [];
  shellMeshes = [];
  muscleRings = [];
  continuations = [];
  cellMesh;
  plasmaMesh;
  /** Small, phase-locked tracers make the direction of the lumen flow legible
   * without adding a second, unrelated vessel. Their positions use the same
   * cumulative-volume map as the red cells below. */
  flowTracers;
  arrows = [];
  streams = [];
  pulseRings = [];
  fixedMaterials = /* @__PURE__ */ new Map();
  dummy = new T4.Object3D();
  radius = 0.158;
  length = 2.12;
  constructor() {
    this.root.name = "representative-200um-arteriole";
    this.root.scale.setScalar(1e-4 / 0.158);
    this.root.userData = { lumenDiameterMetres: 2e-4, redCellDiameterMetres: 75e-7, representative: true };
    const wallLayers = [
      [0.158, 0.17, col.inner, 0.96],
      [0.172, 0.212, col.muscle, 0.94],
      [0.214, 0.235, col.adventitia, 0.28]
    ];
    for (const [inner, outer, color, opacity2] of wallLayers) {
      const shell = cutawayGeometry(this.length, inner, outer);
      const mat4 = material(color, opacity2, 0.52);
      mat4.side = T4.DoubleSide;
      const mesh = new T4.Mesh(shell.geometry, mat4);
      mesh.name = ["endothelial-lining", "smooth-muscle-wall", "outer-connective-tissue"][this.shells.length];
      this.shells.push(shell);
      this.shellMeshes.push(mesh);
      this.root.add(mesh);
    }
    for (const side of [-1, 1]) for (let layer = 0; layer < wallLayers.length; layer++) {
      const [inner, outer, color] = wallLayers[layer];
      const mat4 = material(color, layer === 2 ? 0.22 : 0.96, 0.57);
      mat4.side = T4.DoubleSide;
      const nx = 30, nt = 48, positions = [], centers = [], indices = [];
      const endX = side * this.length * 0.5;
      for (let surface = 0; surface < 2; surface++) for (let i = 0; i <= nx; i++) {
        const u = i / nx, close = ease(u / 0.82), x = endX + side * u * (side < 0 ? 0.71 : 0.28);
        const cy = side < 0 ? 0.025 * u * u : 0, cz = -0.035 * u * u;
        const taper = side < 0 ? lerp(1, 1.07, ease(u)) : lerp(1, 0.77, ease(u));
        const start = lerp(this.shells[0].start, Math.PI * 0.5, close);
        const span = lerp(this.shells[0].span, TAU, close);
        for (let j = 0; j <= nt; j++) {
          const a = start + span * j / nt, r = (surface ? inner : outer) * taper;
          positions.push(x, cy + Math.cos(a) * r, cz + Math.sin(a) * r);
          centers.push(x, cy, cz);
        }
      }
      const n = (nx + 1) * (nt + 1);
      for (let s = 0; s < 2; s++) for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
        const a = s * n + i * (nt + 1) + j, b = a + 1, c = a + nt + 1, d = c + 1;
        indices.push(...s ? [a, b, c, b, d, c] : [a, c, b, b, c, d]);
      }
      for (const i of [0, nx]) for (let j = 0; j < nt; j++) {
        const a = i * (nt + 1) + j, b = a + 1;
        indices.push(a, b, a + n, b, b + n, a + n);
      }
      for (const j of [0, nt]) for (let i = 0; i < nx; i++) {
        const a = i * (nt + 1) + j, b = a + nt + 1;
        indices.push(a, a + n, b, b, a + n, b + n);
      }
      const geometry = new T4.BufferGeometry();
      geometry.setAttribute("position", new T4.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new T4.Mesh(geometry, mat4);
      mesh.name = `${side < 0 ? "parent" : "daughter"}-continuous-wall-${layer}`;
      this.root.add(mesh);
      this.continuations.push({ mesh, base: Float32Array.from(positions), centers: Float32Array.from(centers), anchorX: endX, referenceRadius: outer });
    }
    const branchMat = material(col.muscle, 0.96, 0.56);
    branchMat.side = T4.DoubleSide;
    const addBranch = (points, radii, anchorX, name) => {
      const curve = new T4.CatmullRomCurve3(points), ns = 44, nt = 24, frames = curve.computeFrenetFrames(ns, false);
      const positions = [], centers = [], indices = [];
      for (let i = 0; i <= ns; i++) {
        const u = i / ns, p = curve.getPointAt(u), radius = lerp(radii[0], radii[1], ease(u));
        for (let j = 0; j <= nt; j++) {
          const a = j / nt * TAU;
          const q = p.clone().addScaledVector(frames.normals[i], Math.cos(a) * radius).addScaledVector(frames.binormals[i], Math.sin(a) * radius);
          positions.push(q.x, q.y, q.z);
          centers.push(p.x, p.y, p.z);
        }
      }
      for (let i = 0; i < ns; i++) for (let j = 0; j < nt; j++) {
        const a = i * (nt + 1) + j, b = a + 1, c = a + nt + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
      const geometry = new T4.BufferGeometry();
      geometry.setAttribute("position", new T4.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new T4.Mesh(geometry, branchMat);
      mesh.name = name;
      this.root.add(mesh);
      this.continuations.push({ mesh, base: Float32Array.from(positions), centers: Float32Array.from(centers), anchorX, referenceRadius: 0.235 });
    };
    for (const side of [-1, 1]) {
      addBranch([V2(-1.57, side * 0.12, -0.045), V2(-1.46, side * 0.27, -0.055), V2(-1.3, side * 0.47, -0.07), V2(-1.12, side * 0.58, -0.1)], [0.089, 0.051], -1.06, `upstream-side-branch-${side}`);
      addBranch([V2(1.28, side * 0.065, -0.031), V2(1.39, side * 0.15, -0.046), V2(1.56, side * 0.29, -0.07), V2(1.78, side * 0.36, -0.105)], [0.127, 0.077], 1.06, `downstream-tapered-branch-${side}`);
    }
    for (let i = 0; i < 14; i++) {
      const x = -1 + i / 13 * 2, ring = new T4.Group();
      ring.position.x = x;
      const muscle = cutawayGeometry(0.053, 0.204, 0.221, 3, 48);
      const bandMat = material(i % 2 ? "#b98076" : "#b5776d", 0.94, 0.64);
      bandMat.side = T4.DoubleSide;
      const band = new T4.Mesh(muscle.geometry, bandMat);
      band.name = "embedded-circumferential-muscle-bundle";
      ring.add(band);
      this.root.add(ring);
      this.muscleRings.push({ root: ring, x, band });
    }
    const cells = new T4.SphereGeometry(5925e-6, 16, 10), cp = cells.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const rr = Math.hypot(cp.getX(i), cp.getZ(i)) / 5925e-6;
      cp.setY(i, cp.getY(i) * (0.24 + 0.32 * Math.min(1, rr * rr)));
    }
    cells.computeVertexNormals();
    this.cellMesh = new T4.InstancedMesh(cells, material("#a94140", 1, 0.4), 58);
    this.cellMesh.name = "red-cells-move-downstream-continuously";
    this.cellMesh.instanceMatrix.setUsage(T4.DynamicDrawUsage);
    this.cellMesh.frustumCulled = false;
    this.root.add(this.cellMesh);
    this.plasmaMesh = new T4.InstancedMesh(new T4.SphereGeometry(42e-4, 7, 5), material("#d9bda6", 0.55, 0.7), 76);
    this.plasmaMesh.instanceMatrix.setUsage(T4.DynamicDrawUsage);
    this.plasmaMesh.frustumCulled = false;
    this.root.add(this.plasmaMesh);
    this.flowTracers = new T4.InstancedMesh(new T4.SphereGeometry(65e-4, 8, 5), material("#77aaa4", 0.66, 0.62), 24);
    this.flowTracers.name = "phase-locked-lumen-flow-tracers";
    this.flowTracers.instanceMatrix.setUsage(T4.DynamicDrawUsage);
    this.flowTracers.frustumCulled = false;
    this.root.add(this.flowTracers);
    for (let j = 0; j < 6; j++) {
      const g = new T4.BufferGeometry().setFromPoints(Array.from({ length: 65 }, () => V2()));
      const l = new T4.Line(g, new T4.LineBasicMaterial({ color: j % 2 ? "#caa68a" : col.paleTeal, transparent: true, opacity: 0.3, depthWrite: false }));
      this.root.add(l);
      this.streams.push(l);
    }
    for (const x of [-0.74, 0.76]) for (let j = 0; j < 5; j++) {
      const a = 0.97 * Math.PI + j / 4 * 1.06 * Math.PI;
      const root = new T4.Group(), arrowMat = material(x < 0 ? "#ad6553" : col.teal, 0.85, 0.42);
      const shaft = new T4.Mesh(new T4.CylinderGeometry(65e-4, 65e-4, 1, 12), arrowMat);
      const tip = new T4.Mesh(new T4.ConeGeometry(0.018, 0.038, 16), arrowMat);
      root.add(shaft, tip);
      root.quaternion.setFromUnitVectors(V2(0, 1, 0), V2(0, Math.cos(a), Math.sin(a)));
      this.root.add(root);
      this.arrows.push({ root, shaft, tip, angle: a, x, upstream: x < 0 });
    }
    for (let i = 0; i < 3; i++) {
      const arc = Array.from({ length: 49 }, (_, j) => {
        const a = Math.PI * 0.9 + Math.PI * 1.2 * j / 48;
        return V2(0, Math.cos(a), Math.sin(a));
      });
      const mesh = tube(arc, 0.015, material("#c69373", 0.16, 0.65), 48);
      this.root.add(mesh);
      this.pulseRings.push({ mesh, offset: i / 3 });
    }
    this.root.traverse((o) => {
      const mesh = o;
      if (!mesh.material) return;
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => this.fixedMaterials.set(m, m.opacity));
    });
    this.update({ time: 0, activation: 0 });
  }
  point(p) {
    this.root.updateWorldMatrix(true, false);
    return this.root.localToWorld(p);
  }
  get focus() {
    return this.point(V2(0.08, 0, 0));
  }
  get branchFocus() {
    return this.point(V2(-1.22, 0.02, -0.03));
  }
  get muscleFocus() {
    return this.point(V2(0.15, -0.15, -0.04));
  }
  get inletFocus() {
    return this.point(V2(-0.74, 0, 0));
  }
  get outletFocus() {
    return this.point(V2(0.76, 0, 0));
  }
  get localExtent() {
    return V2(3.5, 1.65, 0.85);
  }
  update(state) {
    const time = state.time, active = clamp2(state.activation ?? 1), contract = clamp2(state.constriction ?? 0), pressure = clamp2(state.pressure ?? 0.5), detail = clamp2(state.detail ?? 1);
    const beat = clamp2(state.pulse ?? Math.exp(-Math.pow((phase(time * 1.16) - 0.19) / 0.13, 2)));
    this.root.visible = active > 1e-5;
    this.fixedMaterials.forEach((opacity2, mat4) => {
      mat4.opacity = opacity2 * active;
    });
    const lumen = (x) => {
      const envelope = 0.55 + 0.45 * Math.exp(-Math.pow(x / 0.81, 6));
      return this.radius * (1 - contract * 0.39 * envelope) * (1 + 0.023 * beat * (1 - 0.52 * contract));
    };
    const outer = (x, baseRadius) => Math.sqrt(lumen(x) ** 2 + baseRadius ** 2 - this.radius ** 2);
    this.shells.forEach((shell, index) => {
      const attr = shell.geometry.attributes.position;
      for (let i = 0; i < attr.count; i++) {
        const x = shell.base[i * 3], originalRadius = i >= shell.n ? shell.inner : shell.outer;
        const r = outer(x, originalRadius), f = r / originalRadius;
        attr.setXYZ(i, x, shell.base[i * 3 + 1] * f, shell.base[i * 3 + 2] * f);
      }
      attr.needsUpdate = true;
      shell.geometry.computeVertexNormals();
      if (index === 2) this.shellMeshes[index].material.opacity = active * lerp(0.42, 0.14, detail);
    });
    this.muscleRings.forEach((ring) => {
      const r = outer(ring.x, 0.219) / 0.219;
      const localWave = contract * (0.55 + 0.45 * Math.exp(-Math.pow(ring.x / 0.81, 6))) * (0.72 + 0.28 * Math.sin(time * 2.2 - ring.x * 0.9));
      ring.root.scale.set(1 + contract * 0.15, r * (1 - 0.045 * localWave), r * (1 - 0.045 * localWave));
      const bandMaterial = ring.band.material;
      bandMaterial.emissive.set(localWave > 0.02 ? "#8f4d46" : "#000000");
      bandMaterial.emissiveIntensity = 0.04 + 0.1 * localWave;
      bandMaterial.opacity = active * (0.82 + 0.12 * localWave);
    });
    this.continuations.forEach((part) => {
      const attr = part.mesh.geometry.attributes.position;
      for (let i = 0; i < attr.count; i++) {
        const x = part.base[i * 3], cy = part.centers[i * 3 + 1], cz = part.centers[i * 3 + 2];
        const radial = Math.hypot(part.base[i * 3 + 1] - cy, part.base[i * 3 + 2] - cz);
        const endRadius = part.referenceRadius;
        const scale = outer(part.anchorX, endRadius) / endRadius;
        const isWall = part.mesh.name.includes("continuous-wall");
        const u = Math.abs(x - part.anchorX) / (part.anchorX < 0 ? 0.71 : 0.28);
        const taper = part.anchorX < 0 ? lerp(1, 1.07, ease(u)) : lerp(1, 0.77, ease(u));
        const normalizedRadius = radial / (isWall ? taper : 1);
        const f = isWall ? outer(part.anchorX, normalizedRadius) / Math.max(1e-8, normalizedRadius) : scale;
        attr.setXYZ(i, x, cy * scale + (part.base[i * 3 + 1] - cy) * f, cz * scale + (part.base[i * 3 + 2] - cz) * f);
      }
      attr.needsUpdate = true;
      part.mesh.geometry.computeVertexNormals();
      if (part.mesh.name.endsWith("continuous-wall-2")) part.mesh.material.opacity = active * lerp(0.42, 0.14, detail);
    });
    const cumulative = [0], n = 96;
    for (let i = 1; i <= n; i++) {
      const x = this.length * ((i - 0.5) / n - 0.5);
      cumulative.push(cumulative[i - 1] + lumen(x) ** 2 / n);
    }
    const volume = cumulative[n];
    const xAt = (u) => {
      const wanted = u * volume;
      let lo = 0, hi = n;
      while (hi - lo > 1) {
        const mid = lo + hi >> 1;
        if (cumulative[mid] < wanted) lo = mid;
        else hi = mid;
      }
      return this.length * ((lo + (wanted - cumulative[lo]) / Math.max(1e-9, cumulative[hi] - cumulative[lo])) / n - 0.5);
    };
    const particles = (mesh, offset, speed, radial) => {
      for (let i = 0; i < mesh.count; i++) {
        const u = phase(i / mesh.count + (state.flowPhase ?? time * 0.081) * speed / 0.081 + offset), x = xAt(u), a = i * 2.39996323;
        const r = lumen(x) * radial * Math.sqrt(0.07 + 0.89 * phase(i * 0.754877666));
        this.dummy.position.set(x, Math.cos(a) * r, Math.sin(a) * r);
        this.dummy.rotation.set(0.4 * Math.sin(time * 0.4 + i), i * 0.723 + time * 0.3, i * 0.25 + time * 0.17);
        const scale = ease(Math.min(u, 1 - u) / 0.035) * (0.79 + 0.25 * phase(i * 0.618033989));
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    particles(this.cellMesh, 0.09, 0.081, 0.76);
    particles(this.plasmaMesh, 0.31, 0.094, 0.84);
    for (let i = 0; i < this.flowTracers.count; i++) {
      const u = phase(i / this.flowTracers.count + (state.flowPhase ?? time * 0.081) * 0.081 / 0.081 + 0.18);
      const x = xAt(u), a = i * 2.39996323 + 0.34;
      const r = lumen(x) * (0.78 + 0.08 * phase(i * 0.754877666));
      this.dummy.position.set(x, Math.cos(a) * r, Math.sin(a) * r);
      this.dummy.rotation.set(0, 0, Math.atan2(Math.sin(a), Math.cos(a)));
      this.dummy.scale.set(0.75 + 0.25 * Math.sin(Math.PI * u), 0.75, 0.75);
      this.dummy.updateMatrix();
      this.flowTracers.setMatrixAt(i, this.dummy.matrix);
    }
    this.flowTracers.instanceMatrix.needsUpdate = true;
    this.streams.forEach((stream, j) => {
      const attr = stream.geometry.attributes.position, a = j / this.streams.length * TAU + 0.2;
      for (let i = 0; i < attr.count; i++) {
        const u = i / (attr.count - 1), x = this.length * (u - 0.5);
        const sweep = 0.01 * Math.sin(TAU * (u + (state.flowPhase ?? 0) * 0.11) + j * 0.8);
        const r = lumen(x) * (0.46 + sweep);
        attr.setXYZ(i, x, Math.cos(a + sweep) * r, Math.sin(a + sweep) * r);
      }
      attr.needsUpdate = true;
    });
    this.arrows.forEach((arrow) => {
      const magnitude = arrow.upstream ? 0.5 + pressure * 0.22 + contract * 0.45 : 0.4 + pressure * 0.14 - contract * 0.16;
      const len = 0.055 + 0.15 * magnitude + 0.019 * beat, radius = outer(arrow.x, 0.24);
      arrow.root.position.set(arrow.x, Math.cos(arrow.angle) * radius, Math.sin(arrow.angle) * radius);
      arrow.shaft.scale.set(1, len, 1);
      arrow.shaft.position.y = len * 0.5;
      arrow.tip.position.y = len + 0.012;
    });
    this.pulseRings.forEach(({ mesh, offset }) => {
      const u = phase(time * 0.38 + offset), x = -0.93 + u * 1.86, radius = outer(x, 0.253) + 0.012 * Math.sin(Math.PI * u);
      mesh.position.x = x;
      mesh.scale.set(1, radius, radius);
      mesh.material.opacity = active * 0.27 * Math.sin(Math.PI * u) ** 2;
    });
  }
  dispose() {
    disposeTree(this.root);
  }
};

// public/cardio/physics.json
var physics_default = {
  schema: "rainbow.windkessel.v1",
  model: "Two-element Windkessel",
  equation: "C dP/dt = Qin - (P-Pv)/R",
  units: {
    pressure: "mmHg",
    flow: "mL/s",
    R: "mmHg s/mL",
    C: "mL/mmHg"
  },
  assumptions: [
    "Lumped parameters; uniform arterial pressure",
    "Periodic prescribed inflow",
    "R and C are independent conceptual controls",
    "No wave reflection, autoregulation or patient anatomy in solver"
  ],
  display: "\u6559\u5B66\u7B80\u5316\u6A21\u578B \xB7 \u975E\u4E2A\u4F53\u9884\u6D4B",
  anatomyIsSolverGeometry: false,
  cases: {
    baseline: {
      id: "baseline",
      R: 1.02,
      C: 1.65,
      pv: 5,
      heartRate: 72,
      strokeVolume: 70,
      period: 0.8333333333333334,
      samples: [
        {
          phase: 0,
          pressure: 77.6572,
          inflow: 0,
          outflow: 71.2325
        },
        {
          phase: 3333e-6,
          pressure: 77.5458,
          inflow: 9.9835,
          outflow: 71.1233
        },
        {
          phase: 6667e-6,
          pressure: 77.4513,
          inflow: 19.9592,
          outflow: 71.0307
        },
        {
          phase: 0.01,
          pressure: 77.3738,
          inflow: 29.919,
          outflow: 70.9547
        },
        {
          phase: 0.013333,
          pressure: 77.3131,
          inflow: 39.8551,
          outflow: 70.8952
        },
        {
          phase: 0.016667,
          pressure: 77.2692,
          inflow: 49.7596,
          outflow: 70.8522
        },
        {
          phase: 0.02,
          pressure: 77.2421,
          inflow: 59.6247,
          outflow: 70.8256
        },
        {
          phase: 0.023333,
          pressure: 77.2315,
          inflow: 69.4426,
          outflow: 70.8152
        },
        {
          phase: 0.026667,
          pressure: 77.2374,
          inflow: 79.2054,
          outflow: 70.821
        },
        {
          phase: 0.03,
          pressure: 77.2597,
          inflow: 88.9054,
          outflow: 70.8428
        },
        {
          phase: 0.033333,
          pressure: 77.2982,
          inflow: 98.535,
          outflow: 70.8806
        },
        {
          phase: 0.036667,
          pressure: 77.3527,
          inflow: 108.0866,
          outflow: 70.9341
        },
        {
          phase: 0.04,
          pressure: 77.4232,
          inflow: 117.5525,
          outflow: 71.0032
        },
        {
          phase: 0.043333,
          pressure: 77.5094,
          inflow: 126.9252,
          outflow: 71.0877
        },
        {
          phase: 0.046667,
          pressure: 77.6112,
          inflow: 136.1974,
          outflow: 71.1874
        },
        {
          phase: 0.05,
          pressure: 77.7282,
          inflow: 145.3616,
          outflow: 71.3022
        },
        {
          phase: 0.053333,
          pressure: 77.8604,
          inflow: 154.4107,
          outflow: 71.4318
        },
        {
          phase: 0.056667,
          pressure: 78.0075,
          inflow: 163.3374,
          outflow: 71.576
        },
        {
          phase: 0.06,
          pressure: 78.1693,
          inflow: 172.1346,
          outflow: 71.7346
        },
        {
          phase: 0.063333,
          pressure: 78.3455,
          inflow: 180.7955,
          outflow: 71.9074
        },
        {
          phase: 0.066667,
          pressure: 78.5359,
          inflow: 189.3131,
          outflow: 72.094
        },
        {
          phase: 0.07,
          pressure: 78.7401,
          inflow: 197.6807,
          outflow: 72.2942
        },
        {
          phase: 0.073333,
          pressure: 78.9579,
          inflow: 205.8917,
          outflow: 72.5078
        },
        {
          phase: 0.076667,
          pressure: 79.1891,
          inflow: 213.9395,
          outflow: 72.7344
        },
        {
          phase: 0.08,
          pressure: 79.4333,
          inflow: 221.8178,
          outflow: 72.9738
        },
        {
          phase: 0.083333,
          pressure: 79.6902,
          inflow: 229.5203,
          outflow: 73.2256
        },
        {
          phase: 0.086667,
          pressure: 79.9594,
          inflow: 237.041,
          outflow: 73.4896
        },
        {
          phase: 0.09,
          pressure: 80.2407,
          inflow: 244.3738,
          outflow: 73.7654
        },
        {
          phase: 0.093333,
          pressure: 80.5337,
          inflow: 251.5129,
          outflow: 74.0527
        },
        {
          phase: 0.096667,
          pressure: 80.8381,
          inflow: 258.4528,
          outflow: 74.3511
        },
        {
          phase: 0.1,
          pressure: 81.1535,
          inflow: 265.1879,
          outflow: 74.6603
        },
        {
          phase: 0.103333,
          pressure: 81.4795,
          inflow: 271.7129,
          outflow: 74.9799
        },
        {
          phase: 0.106667,
          pressure: 81.8158,
          inflow: 278.0225,
          outflow: 75.3096
        },
        {
          phase: 0.11,
          pressure: 82.1619,
          inflow: 284.1118,
          outflow: 75.6489
        },
        {
          phase: 0.113333,
          pressure: 82.5175,
          inflow: 289.976,
          outflow: 75.9976
        },
        {
          phase: 0.116667,
          pressure: 82.8822,
          inflow: 295.6105,
          outflow: 76.3551
        },
        {
          phase: 0.12,
          pressure: 83.2556,
          inflow: 301.0107,
          outflow: 76.7212
        },
        {
          phase: 0.123333,
          pressure: 83.6373,
          inflow: 306.1723,
          outflow: 77.0954
        },
        {
          phase: 0.126667,
          pressure: 84.0268,
          inflow: 311.0914,
          outflow: 77.4772
        },
        {
          phase: 0.13,
          pressure: 84.4237,
          inflow: 315.764,
          outflow: 77.8664
        },
        {
          phase: 0.133333,
          pressure: 84.8276,
          inflow: 320.1863,
          outflow: 78.2624
        },
        {
          phase: 0.136667,
          pressure: 85.2381,
          inflow: 324.3549,
          outflow: 78.6648
        },
        {
          phase: 0.14,
          pressure: 85.6547,
          inflow: 328.2666,
          outflow: 79.0733
        },
        {
          phase: 0.143333,
          pressure: 86.077,
          inflow: 331.9181,
          outflow: 79.4873
        },
        {
          phase: 0.146667,
          pressure: 86.5045,
          inflow: 335.3065,
          outflow: 79.9064
        },
        {
          phase: 0.15,
          pressure: 86.9368,
          inflow: 338.4293,
          outflow: 80.3302
        },
        {
          phase: 0.153333,
          pressure: 87.3734,
          inflow: 341.2839,
          outflow: 80.7582
        },
        {
          phase: 0.156667,
          pressure: 87.8138,
          inflow: 343.8681,
          outflow: 81.19
        },
        {
          phase: 0.16,
          pressure: 88.2577,
          inflow: 346.1798,
          outflow: 81.6252
        },
        {
          phase: 0.163333,
          pressure: 88.7044,
          inflow: 348.2172,
          outflow: 82.0632
        },
        {
          phase: 0.166667,
          pressure: 89.1537,
          inflow: 349.9787,
          outflow: 82.5036
        },
        {
          phase: 0.17,
          pressure: 89.6049,
          inflow: 351.4628,
          outflow: 82.9459
        },
        {
          phase: 0.173333,
          pressure: 90.0576,
          inflow: 352.6685,
          outflow: 83.3898
        },
        {
          phase: 0.176667,
          pressure: 90.5114,
          inflow: 353.5947,
          outflow: 83.8347
        },
        {
          phase: 0.18,
          pressure: 90.9657,
          inflow: 354.2407,
          outflow: 84.2801
        },
        {
          phase: 0.183333,
          pressure: 91.4202,
          inflow: 354.606,
          outflow: 84.7257
        },
        {
          phase: 0.186667,
          pressure: 91.8743,
          inflow: 354.6903,
          outflow: 85.1708
        },
        {
          phase: 0.19,
          pressure: 92.3275,
          inflow: 354.4936,
          outflow: 85.6152
        },
        {
          phase: 0.193333,
          pressure: 92.7794,
          inflow: 354.016,
          outflow: 86.0582
        },
        {
          phase: 0.196667,
          pressure: 93.2295,
          inflow: 353.2578,
          outflow: 86.4996
        },
        {
          phase: 0.2,
          pressure: 93.6774,
          inflow: 352.2197,
          outflow: 86.9387
        },
        {
          phase: 0.203333,
          pressure: 94.1226,
          inflow: 350.9025,
          outflow: 87.3751
        },
        {
          phase: 0.206667,
          pressure: 94.5646,
          inflow: 349.3073,
          outflow: 87.8084
        },
        {
          phase: 0.21,
          pressure: 95.0029,
          inflow: 347.4353,
          outflow: 88.2381
        },
        {
          phase: 0.213333,
          pressure: 95.4371,
          inflow: 345.288,
          outflow: 88.6639
        },
        {
          phase: 0.216667,
          pressure: 95.8668,
          inflow: 342.867,
          outflow: 89.0851
        },
        {
          phase: 0.22,
          pressure: 96.2915,
          inflow: 340.1744,
          outflow: 89.5014
        },
        {
          phase: 0.223333,
          pressure: 96.7107,
          inflow: 337.2123,
          outflow: 89.9124
        },
        {
          phase: 0.226667,
          pressure: 97.124,
          inflow: 333.9829,
          outflow: 90.3176
        },
        {
          phase: 0.23,
          pressure: 97.531,
          inflow: 330.4889,
          outflow: 90.7166
        },
        {
          phase: 0.233333,
          pressure: 97.9312,
          inflow: 326.733,
          outflow: 91.109
        },
        {
          phase: 0.236667,
          pressure: 98.3242,
          inflow: 322.7182,
          outflow: 91.4943
        },
        {
          phase: 0.24,
          pressure: 98.7095,
          inflow: 318.4476,
          outflow: 91.8721
        },
        {
          phase: 0.243333,
          pressure: 99.0869,
          inflow: 313.9248,
          outflow: 92.2421
        },
        {
          phase: 0.246667,
          pressure: 99.4558,
          inflow: 309.1532,
          outflow: 92.6037
        },
        {
          phase: 0.25,
          pressure: 99.8159,
          inflow: 304.1366,
          outflow: 92.9568
        },
        {
          phase: 0.253333,
          pressure: 100.1667,
          inflow: 298.879,
          outflow: 93.3007
        },
        {
          phase: 0.256667,
          pressure: 100.5079,
          inflow: 293.3846,
          outflow: 93.6352
        },
        {
          phase: 0.26,
          pressure: 100.8392,
          inflow: 287.6577,
          outflow: 93.96
        },
        {
          phase: 0.263333,
          pressure: 101.16,
          inflow: 281.7029,
          outflow: 94.2745
        },
        {
          phase: 0.266667,
          pressure: 101.4701,
          inflow: 275.5248,
          outflow: 94.5785
        },
        {
          phase: 0.27,
          pressure: 101.7691,
          inflow: 269.1284,
          outflow: 94.8717
        },
        {
          phase: 0.273333,
          pressure: 102.0567,
          inflow: 262.5188,
          outflow: 95.1537
        },
        {
          phase: 0.276667,
          pressure: 102.3325,
          inflow: 255.7011,
          outflow: 95.4241
        },
        {
          phase: 0.28,
          pressure: 102.5963,
          inflow: 248.6809,
          outflow: 95.6826
        },
        {
          phase: 0.283333,
          pressure: 102.8476,
          inflow: 241.4636,
          outflow: 95.929
        },
        {
          phase: 0.286667,
          pressure: 103.0862,
          inflow: 234.0549,
          outflow: 96.1629
        },
        {
          phase: 0.29,
          pressure: 103.3118,
          inflow: 226.4608,
          outflow: 96.3841
        },
        {
          phase: 0.293333,
          pressure: 103.5241,
          inflow: 218.6872,
          outflow: 96.5922
        },
        {
          phase: 0.296667,
          pressure: 103.7228,
          inflow: 210.7404,
          outflow: 96.787
        },
        {
          phase: 0.3,
          pressure: 103.9077,
          inflow: 202.6265,
          outflow: 96.9683
        },
        {
          phase: 0.303333,
          pressure: 104.0784,
          inflow: 194.3521,
          outflow: 97.1357
        },
        {
          phase: 0.306667,
          pressure: 104.2349,
          inflow: 185.9237,
          outflow: 97.2891
        },
        {
          phase: 0.31,
          pressure: 104.3768,
          inflow: 177.348,
          outflow: 97.4282
        },
        {
          phase: 0.313333,
          pressure: 104.5039,
          inflow: 168.6317,
          outflow: 97.5529
        },
        {
          phase: 0.316667,
          pressure: 104.6161,
          inflow: 159.7818,
          outflow: 97.6628
        },
        {
          phase: 0.32,
          pressure: 104.713,
          inflow: 150.8053,
          outflow: 97.7579
        },
        {
          phase: 0.323333,
          pressure: 104.7946,
          inflow: 141.7093,
          outflow: 97.8379
        },
        {
          phase: 0.326667,
          pressure: 104.8607,
          inflow: 132.501,
          outflow: 97.9026
        },
        {
          phase: 0.33,
          pressure: 104.9111,
          inflow: 123.1878,
          outflow: 97.952
        },
        {
          phase: 0.333333,
          pressure: 104.9456,
          inflow: 113.7769,
          outflow: 97.9859
        },
        {
          phase: 0.336667,
          pressure: 104.9642,
          inflow: 104.2758,
          outflow: 98.0041
        },
        {
          phase: 0.34,
          pressure: 104.9667,
          inflow: 94.6921,
          outflow: 98.0066
        },
        {
          phase: 0.343333,
          pressure: 104.953,
          inflow: 85.0334,
          outflow: 97.9931
        },
        {
          phase: 0.346667,
          pressure: 104.923,
          inflow: 75.3073,
          outflow: 97.9637
        },
        {
          phase: 0.35,
          pressure: 104.8767,
          inflow: 65.5216,
          outflow: 97.9183
        },
        {
          phase: 0.353333,
          pressure: 104.8139,
          inflow: 55.6839,
          outflow: 97.8568
        },
        {
          phase: 0.356667,
          pressure: 104.7347,
          inflow: 45.8021,
          outflow: 97.7791
        },
        {
          phase: 0.36,
          pressure: 104.6389,
          inflow: 35.884,
          outflow: 97.6852
        },
        {
          phase: 0.363333,
          pressure: 104.5266,
          inflow: 25.9375,
          outflow: 97.5751
        },
        {
          phase: 0.366667,
          pressure: 104.3977,
          inflow: 15.9704,
          outflow: 97.4487
        },
        {
          phase: 0.37,
          pressure: 104.2522,
          inflow: 5.9906,
          outflow: 97.3061
        },
        {
          phase: 0.373333,
          pressure: 104.0916,
          inflow: 0,
          outflow: 97.1486
        },
        {
          phase: 0.376667,
          pressure: 103.9281,
          inflow: 0,
          outflow: 96.9884
        },
        {
          phase: 0.38,
          pressure: 103.765,
          inflow: 0,
          outflow: 96.8284
        },
        {
          phase: 0.383333,
          pressure: 103.6021,
          inflow: 0,
          outflow: 96.6687
        },
        {
          phase: 0.386667,
          pressure: 103.4395,
          inflow: 0,
          outflow: 96.5093
        },
        {
          phase: 0.39,
          pressure: 103.2772,
          inflow: 0,
          outflow: 96.3502
        },
        {
          phase: 0.393333,
          pressure: 103.1151,
          inflow: 0,
          outflow: 96.1913
        },
        {
          phase: 0.396667,
          pressure: 102.9533,
          inflow: 0,
          outflow: 96.0326
        },
        {
          phase: 0.4,
          pressure: 102.7918,
          inflow: 0,
          outflow: 95.8743
        },
        {
          phase: 0.403333,
          pressure: 102.6305,
          inflow: 0,
          outflow: 95.7162
        },
        {
          phase: 0.406667,
          pressure: 102.4695,
          inflow: 0,
          outflow: 95.5583
        },
        {
          phase: 0.41,
          pressure: 102.3087,
          inflow: 0,
          outflow: 95.4007
        },
        {
          phase: 0.413333,
          pressure: 102.1483,
          inflow: 0,
          outflow: 95.2434
        },
        {
          phase: 0.416667,
          pressure: 101.9881,
          inflow: 0,
          outflow: 95.0863
        },
        {
          phase: 0.42,
          pressure: 101.8281,
          inflow: 0,
          outflow: 94.9295
        },
        {
          phase: 0.423333,
          pressure: 101.6684,
          inflow: 0,
          outflow: 94.773
        },
        {
          phase: 0.426667,
          pressure: 101.509,
          inflow: 0,
          outflow: 94.6167
        },
        {
          phase: 0.43,
          pressure: 101.3499,
          inflow: 0,
          outflow: 94.4606
        },
        {
          phase: 0.433333,
          pressure: 101.191,
          inflow: 0,
          outflow: 94.3049
        },
        {
          phase: 0.436667,
          pressure: 101.0323,
          inflow: 0,
          outflow: 94.1493
        },
        {
          phase: 0.44,
          pressure: 100.874,
          inflow: 0,
          outflow: 93.9941
        },
        {
          phase: 0.443333,
          pressure: 100.7159,
          inflow: 0,
          outflow: 93.8391
        },
        {
          phase: 0.446667,
          pressure: 100.558,
          inflow: 0,
          outflow: 93.6843
        },
        {
          phase: 0.45,
          pressure: 100.4004,
          inflow: 0,
          outflow: 93.5298
        },
        {
          phase: 0.453333,
          pressure: 100.2431,
          inflow: 0,
          outflow: 93.3756
        },
        {
          phase: 0.456667,
          pressure: 100.086,
          inflow: 0,
          outflow: 93.2216
        },
        {
          phase: 0.46,
          pressure: 99.9292,
          inflow: 0,
          outflow: 93.0679
        },
        {
          phase: 0.463333,
          pressure: 99.7727,
          inflow: 0,
          outflow: 92.9144
        },
        {
          phase: 0.466667,
          pressure: 99.6164,
          inflow: 0,
          outflow: 92.7611
        },
        {
          phase: 0.47,
          pressure: 99.4603,
          inflow: 0,
          outflow: 92.6082
        },
        {
          phase: 0.473333,
          pressure: 99.3046,
          inflow: 0,
          outflow: 92.4554
        },
        {
          phase: 0.476667,
          pressure: 99.149,
          inflow: 0,
          outflow: 92.303
        },
        {
          phase: 0.48,
          pressure: 98.9938,
          inflow: 0,
          outflow: 92.1508
        },
        {
          phase: 0.483333,
          pressure: 98.8388,
          inflow: 0,
          outflow: 91.9988
        },
        {
          phase: 0.486667,
          pressure: 98.684,
          inflow: 0,
          outflow: 91.8471
        },
        {
          phase: 0.49,
          pressure: 98.5295,
          inflow: 0,
          outflow: 91.6956
        },
        {
          phase: 0.493333,
          pressure: 98.3753,
          inflow: 0,
          outflow: 91.5444
        },
        {
          phase: 0.496667,
          pressure: 98.2213,
          inflow: 0,
          outflow: 91.3934
        },
        {
          phase: 0.5,
          pressure: 98.0675,
          inflow: 0,
          outflow: 91.2427
        },
        {
          phase: 0.503333,
          pressure: 97.9141,
          inflow: 0,
          outflow: 91.0922
        },
        {
          phase: 0.506667,
          pressure: 97.7608,
          inflow: 0,
          outflow: 90.942
        },
        {
          phase: 0.51,
          pressure: 97.6079,
          inflow: 0,
          outflow: 90.792
        },
        {
          phase: 0.513333,
          pressure: 97.4551,
          inflow: 0,
          outflow: 90.6423
        },
        {
          phase: 0.516667,
          pressure: 97.3027,
          inflow: 0,
          outflow: 90.4928
        },
        {
          phase: 0.52,
          pressure: 97.1505,
          inflow: 0,
          outflow: 90.3436
        },
        {
          phase: 0.523333,
          pressure: 96.9985,
          inflow: 0,
          outflow: 90.1946
        },
        {
          phase: 0.526667,
          pressure: 96.8468,
          inflow: 0,
          outflow: 90.0459
        },
        {
          phase: 0.53,
          pressure: 96.6953,
          inflow: 0,
          outflow: 89.8974
        },
        {
          phase: 0.533333,
          pressure: 96.5441,
          inflow: 0,
          outflow: 89.7491
        },
        {
          phase: 0.536667,
          pressure: 96.3931,
          inflow: 0,
          outflow: 89.6011
        },
        {
          phase: 0.54,
          pressure: 96.2424,
          inflow: 0,
          outflow: 89.4533
        },
        {
          phase: 0.543333,
          pressure: 96.0919,
          inflow: 0,
          outflow: 89.3058
        },
        {
          phase: 0.546667,
          pressure: 95.9417,
          inflow: 0,
          outflow: 89.1585
        },
        {
          phase: 0.55,
          pressure: 95.7917,
          inflow: 0,
          outflow: 89.0115
        },
        {
          phase: 0.553333,
          pressure: 95.642,
          inflow: 0,
          outflow: 88.8647
        },
        {
          phase: 0.556667,
          pressure: 95.4925,
          inflow: 0,
          outflow: 88.7182
        },
        {
          phase: 0.56,
          pressure: 95.3433,
          inflow: 0,
          outflow: 88.5718
        },
        {
          phase: 0.563333,
          pressure: 95.1943,
          inflow: 0,
          outflow: 88.4258
        },
        {
          phase: 0.566667,
          pressure: 95.0456,
          inflow: 0,
          outflow: 88.28
        },
        {
          phase: 0.57,
          pressure: 94.8971,
          inflow: 0,
          outflow: 88.1344
        },
        {
          phase: 0.573333,
          pressure: 94.7488,
          inflow: 0,
          outflow: 87.989
        },
        {
          phase: 0.576667,
          pressure: 94.6008,
          inflow: 0,
          outflow: 87.8439
        },
        {
          phase: 0.58,
          pressure: 94.453,
          inflow: 0,
          outflow: 87.6991
        },
        {
          phase: 0.583333,
          pressure: 94.3055,
          inflow: 0,
          outflow: 87.5544
        },
        {
          phase: 0.586667,
          pressure: 94.1582,
          inflow: 0,
          outflow: 87.41
        },
        {
          phase: 0.59,
          pressure: 94.0112,
          inflow: 0,
          outflow: 87.2659
        },
        {
          phase: 0.593333,
          pressure: 93.8644,
          inflow: 0,
          outflow: 87.122
        },
        {
          phase: 0.596667,
          pressure: 93.7179,
          inflow: 0,
          outflow: 86.9783
        },
        {
          phase: 0.6,
          pressure: 93.5716,
          inflow: 0,
          outflow: 86.8349
        },
        {
          phase: 0.603333,
          pressure: 93.4255,
          inflow: 0,
          outflow: 86.6917
        },
        {
          phase: 0.606667,
          pressure: 93.2797,
          inflow: 0,
          outflow: 86.5487
        },
        {
          phase: 0.61,
          pressure: 93.1341,
          inflow: 0,
          outflow: 86.406
        },
        {
          phase: 0.613333,
          pressure: 92.9887,
          inflow: 0,
          outflow: 86.2635
        },
        {
          phase: 0.616667,
          pressure: 92.8436,
          inflow: 0,
          outflow: 86.1212
        },
        {
          phase: 0.62,
          pressure: 92.6988,
          inflow: 0,
          outflow: 85.9792
        },
        {
          phase: 0.623333,
          pressure: 92.5541,
          inflow: 0,
          outflow: 85.8374
        },
        {
          phase: 0.626667,
          pressure: 92.4098,
          inflow: 0,
          outflow: 85.6958
        },
        {
          phase: 0.63,
          pressure: 92.2656,
          inflow: 0,
          outflow: 85.5545
        },
        {
          phase: 0.633333,
          pressure: 92.1217,
          inflow: 0,
          outflow: 85.4134
        },
        {
          phase: 0.636667,
          pressure: 91.978,
          inflow: 0,
          outflow: 85.2726
        },
        {
          phase: 0.64,
          pressure: 91.8346,
          inflow: 0,
          outflow: 85.1319
        },
        {
          phase: 0.643333,
          pressure: 91.6914,
          inflow: 0,
          outflow: 84.9915
        },
        {
          phase: 0.646667,
          pressure: 91.5484,
          inflow: 0,
          outflow: 84.8514
        },
        {
          phase: 0.65,
          pressure: 91.4057,
          inflow: 0,
          outflow: 84.7115
        },
        {
          phase: 0.653333,
          pressure: 91.2632,
          inflow: 0,
          outflow: 84.5718
        },
        {
          phase: 0.656667,
          pressure: 91.1209,
          inflow: 0,
          outflow: 84.4323
        },
        {
          phase: 0.66,
          pressure: 90.9789,
          inflow: 0,
          outflow: 84.293
        },
        {
          phase: 0.663333,
          pressure: 90.8371,
          inflow: 0,
          outflow: 84.154
        },
        {
          phase: 0.666667,
          pressure: 90.6956,
          inflow: 0,
          outflow: 84.0153
        },
        {
          phase: 0.67,
          pressure: 90.5542,
          inflow: 0,
          outflow: 83.8767
        },
        {
          phase: 0.673333,
          pressure: 90.4131,
          inflow: 0,
          outflow: 83.7384
        },
        {
          phase: 0.676667,
          pressure: 90.2723,
          inflow: 0,
          outflow: 83.6003
        },
        {
          phase: 0.68,
          pressure: 90.1317,
          inflow: 0,
          outflow: 83.4624
        },
        {
          phase: 0.683333,
          pressure: 89.9913,
          inflow: 0,
          outflow: 83.3248
        },
        {
          phase: 0.686667,
          pressure: 89.8511,
          inflow: 0,
          outflow: 83.1874
        },
        {
          phase: 0.69,
          pressure: 89.7112,
          inflow: 0,
          outflow: 83.0502
        },
        {
          phase: 0.693333,
          pressure: 89.5715,
          inflow: 0,
          outflow: 82.9132
        },
        {
          phase: 0.696667,
          pressure: 89.432,
          inflow: 0,
          outflow: 82.7765
        },
        {
          phase: 0.7,
          pressure: 89.2928,
          inflow: 0,
          outflow: 82.64
        },
        {
          phase: 0.703333,
          pressure: 89.1538,
          inflow: 0,
          outflow: 82.5037
        },
        {
          phase: 0.706667,
          pressure: 89.015,
          inflow: 0,
          outflow: 82.3676
        },
        {
          phase: 0.71,
          pressure: 88.8764,
          inflow: 0,
          outflow: 82.2318
        },
        {
          phase: 0.713333,
          pressure: 88.7381,
          inflow: 0,
          outflow: 82.0962
        },
        {
          phase: 0.716667,
          pressure: 88.6,
          inflow: 0,
          outflow: 81.9608
        },
        {
          phase: 0.72,
          pressure: 88.4621,
          inflow: 0,
          outflow: 81.8256
        },
        {
          phase: 0.723333,
          pressure: 88.3245,
          inflow: 0,
          outflow: 81.6907
        },
        {
          phase: 0.726667,
          pressure: 88.1871,
          inflow: 0,
          outflow: 81.556
        },
        {
          phase: 0.73,
          pressure: 88.0499,
          inflow: 0,
          outflow: 81.4215
        },
        {
          phase: 0.733333,
          pressure: 87.9129,
          inflow: 0,
          outflow: 81.2872
        },
        {
          phase: 0.736667,
          pressure: 87.7762,
          inflow: 0,
          outflow: 81.1531
        },
        {
          phase: 0.74,
          pressure: 87.6397,
          inflow: 0,
          outflow: 81.0193
        },
        {
          phase: 0.743333,
          pressure: 87.5034,
          inflow: 0,
          outflow: 80.8857
        },
        {
          phase: 0.746667,
          pressure: 87.3674,
          inflow: 0,
          outflow: 80.7523
        },
        {
          phase: 0.75,
          pressure: 87.2315,
          inflow: 0,
          outflow: 80.6191
        },
        {
          phase: 0.753333,
          pressure: 87.0959,
          inflow: 0,
          outflow: 80.4862
        },
        {
          phase: 0.756667,
          pressure: 86.9605,
          inflow: 0,
          outflow: 80.3535
        },
        {
          phase: 0.76,
          pressure: 86.8254,
          inflow: 0,
          outflow: 80.2209
        },
        {
          phase: 0.763333,
          pressure: 86.6904,
          inflow: 0,
          outflow: 80.0886
        },
        {
          phase: 0.766667,
          pressure: 86.5557,
          inflow: 0,
          outflow: 79.9566
        },
        {
          phase: 0.77,
          pressure: 86.4212,
          inflow: 0,
          outflow: 79.8247
        },
        {
          phase: 0.773333,
          pressure: 86.2869,
          inflow: 0,
          outflow: 79.6931
        },
        {
          phase: 0.776667,
          pressure: 86.1529,
          inflow: 0,
          outflow: 79.5616
        },
        {
          phase: 0.78,
          pressure: 86.019,
          inflow: 0,
          outflow: 79.4304
        },
        {
          phase: 0.783333,
          pressure: 85.8854,
          inflow: 0,
          outflow: 79.2994
        },
        {
          phase: 0.786667,
          pressure: 85.752,
          inflow: 0,
          outflow: 79.1687
        },
        {
          phase: 0.79,
          pressure: 85.6189,
          inflow: 0,
          outflow: 79.0381
        },
        {
          phase: 0.793333,
          pressure: 85.4859,
          inflow: 0,
          outflow: 78.9078
        },
        {
          phase: 0.796667,
          pressure: 85.3532,
          inflow: 0,
          outflow: 78.7776
        },
        {
          phase: 0.8,
          pressure: 85.2207,
          inflow: 0,
          outflow: 78.6477
        },
        {
          phase: 0.803333,
          pressure: 85.0884,
          inflow: 0,
          outflow: 78.518
        },
        {
          phase: 0.806667,
          pressure: 84.9563,
          inflow: 0,
          outflow: 78.3885
        },
        {
          phase: 0.81,
          pressure: 84.8244,
          inflow: 0,
          outflow: 78.2593
        },
        {
          phase: 0.813333,
          pressure: 84.6928,
          inflow: 0,
          outflow: 78.1302
        },
        {
          phase: 0.816667,
          pressure: 84.5614,
          inflow: 0,
          outflow: 78.0014
        },
        {
          phase: 0.82,
          pressure: 84.4302,
          inflow: 0,
          outflow: 77.8727
        },
        {
          phase: 0.823333,
          pressure: 84.2992,
          inflow: 0,
          outflow: 77.7443
        },
        {
          phase: 0.826667,
          pressure: 84.1684,
          inflow: 0,
          outflow: 77.6161
        },
        {
          phase: 0.83,
          pressure: 84.0379,
          inflow: 0,
          outflow: 77.4881
        },
        {
          phase: 0.833333,
          pressure: 83.9075,
          inflow: 0,
          outflow: 77.3603
        },
        {
          phase: 0.836667,
          pressure: 83.7774,
          inflow: 0,
          outflow: 77.2327
        },
        {
          phase: 0.84,
          pressure: 83.6475,
          inflow: 0,
          outflow: 77.1054
        },
        {
          phase: 0.843333,
          pressure: 83.5178,
          inflow: 0,
          outflow: 76.9782
        },
        {
          phase: 0.846667,
          pressure: 83.3883,
          inflow: 0,
          outflow: 76.8513
        },
        {
          phase: 0.85,
          pressure: 83.259,
          inflow: 0,
          outflow: 76.7245
        },
        {
          phase: 0.853333,
          pressure: 83.1299,
          inflow: 0,
          outflow: 76.598
        },
        {
          phase: 0.856667,
          pressure: 83.0011,
          inflow: 0,
          outflow: 76.4717
        },
        {
          phase: 0.86,
          pressure: 82.8725,
          inflow: 0,
          outflow: 76.3456
        },
        {
          phase: 0.863333,
          pressure: 82.744,
          inflow: 0,
          outflow: 76.2197
        },
        {
          phase: 0.866667,
          pressure: 82.6158,
          inflow: 0,
          outflow: 76.094
        },
        {
          phase: 0.87,
          pressure: 82.4878,
          inflow: 0,
          outflow: 75.9685
        },
        {
          phase: 0.873333,
          pressure: 82.36,
          inflow: 0,
          outflow: 75.8432
        },
        {
          phase: 0.876667,
          pressure: 82.2325,
          inflow: 0,
          outflow: 75.7181
        },
        {
          phase: 0.88,
          pressure: 82.1051,
          inflow: 0,
          outflow: 75.5932
        },
        {
          phase: 0.883333,
          pressure: 81.9779,
          inflow: 0,
          outflow: 75.4686
        },
        {
          phase: 0.886667,
          pressure: 81.851,
          inflow: 0,
          outflow: 75.3441
        },
        {
          phase: 0.89,
          pressure: 81.7243,
          inflow: 0,
          outflow: 75.2199
        },
        {
          phase: 0.893333,
          pressure: 81.5977,
          inflow: 0,
          outflow: 75.0958
        },
        {
          phase: 0.896667,
          pressure: 81.4714,
          inflow: 0,
          outflow: 74.972
        },
        {
          phase: 0.9,
          pressure: 81.3453,
          inflow: 0,
          outflow: 74.8483
        },
        {
          phase: 0.903333,
          pressure: 81.2194,
          inflow: 0,
          outflow: 74.7249
        },
        {
          phase: 0.906667,
          pressure: 81.0937,
          inflow: 0,
          outflow: 74.6017
        },
        {
          phase: 0.91,
          pressure: 80.9682,
          inflow: 0,
          outflow: 74.4786
        },
        {
          phase: 0.913333,
          pressure: 80.8429,
          inflow: 0,
          outflow: 74.3558
        },
        {
          phase: 0.916667,
          pressure: 80.7179,
          inflow: 0,
          outflow: 74.2332
        },
        {
          phase: 0.92,
          pressure: 80.593,
          inflow: 0,
          outflow: 74.1108
        },
        {
          phase: 0.923333,
          pressure: 80.4683,
          inflow: 0,
          outflow: 73.9886
        },
        {
          phase: 0.926667,
          pressure: 80.3439,
          inflow: 0,
          outflow: 73.8665
        },
        {
          phase: 0.93,
          pressure: 80.2196,
          inflow: 0,
          outflow: 73.7447
        },
        {
          phase: 0.933333,
          pressure: 80.0956,
          inflow: 0,
          outflow: 73.6231
        },
        {
          phase: 0.936667,
          pressure: 79.9717,
          inflow: 0,
          outflow: 73.5017
        },
        {
          phase: 0.94,
          pressure: 79.8481,
          inflow: 0,
          outflow: 73.3805
        },
        {
          phase: 0.943333,
          pressure: 79.7247,
          inflow: 0,
          outflow: 73.2595
        },
        {
          phase: 0.946667,
          pressure: 79.6014,
          inflow: 0,
          outflow: 73.1387
        },
        {
          phase: 0.95,
          pressure: 79.4784,
          inflow: 0,
          outflow: 73.018
        },
        {
          phase: 0.953333,
          pressure: 79.3556,
          inflow: 0,
          outflow: 72.8976
        },
        {
          phase: 0.956667,
          pressure: 79.233,
          inflow: 0,
          outflow: 72.7774
        },
        {
          phase: 0.96,
          pressure: 79.1105,
          inflow: 0,
          outflow: 72.6574
        },
        {
          phase: 0.963333,
          pressure: 78.9883,
          inflow: 0,
          outflow: 72.5376
        },
        {
          phase: 0.966667,
          pressure: 78.8663,
          inflow: 0,
          outflow: 72.4179
        },
        {
          phase: 0.97,
          pressure: 78.7445,
          inflow: 0,
          outflow: 72.2985
        },
        {
          phase: 0.973333,
          pressure: 78.6229,
          inflow: 0,
          outflow: 72.1793
        },
        {
          phase: 0.976667,
          pressure: 78.5015,
          inflow: 0,
          outflow: 72.0603
        },
        {
          phase: 0.98,
          pressure: 78.3802,
          inflow: 0,
          outflow: 71.9414
        },
        {
          phase: 0.983333,
          pressure: 78.2592,
          inflow: 0,
          outflow: 71.8228
        },
        {
          phase: 0.986667,
          pressure: 78.1384,
          inflow: 0,
          outflow: 71.7043
        },
        {
          phase: 0.99,
          pressure: 78.0178,
          inflow: 0,
          outflow: 71.5861
        },
        {
          phase: 0.993333,
          pressure: 77.8974,
          inflow: 0,
          outflow: 71.468
        },
        {
          phase: 0.996667,
          pressure: 77.7772,
          inflow: 0,
          outflow: 71.3502
        },
        {
          phase: 1,
          pressure: 77.6571,
          inflow: 0,
          outflow: 71.2325
        }
      ],
      systolic: 104.97,
      diastolic: 77.23,
      mean: 90.68,
      pulsePressure: 27.74,
      cycleVolumeResidualMl: -0.0012244619817181502
    },
    higher_resistance: {
      id: "higher_resistance",
      R: 1.5,
      C: 1.65,
      pv: 5,
      heartRate: 72,
      strokeVolume: 70,
      period: 0.8333333333333334,
      samples: [
        {
          phase: 0,
          pressure: 117.8679,
          inflow: 0,
          outflow: 75.2453
        },
        {
          phase: 3333e-6,
          pressure: 117.7497,
          inflow: 9.9835,
          outflow: 75.1665
        },
        {
          phase: 6667e-6,
          pressure: 117.6484,
          inflow: 19.9592,
          outflow: 75.0989
        },
        {
          phase: 0.01,
          pressure: 117.564,
          inflow: 29.919,
          outflow: 75.0427
        },
        {
          phase: 0.013333,
          pressure: 117.4965,
          inflow: 39.8551,
          outflow: 74.9976
        },
        {
          phase: 0.016667,
          pressure: 117.4457,
          inflow: 49.7596,
          outflow: 74.9638
        },
        {
          phase: 0.02,
          pressure: 117.4116,
          inflow: 59.6247,
          outflow: 74.941
        },
        {
          phase: 0.023333,
          pressure: 117.3941,
          inflow: 69.4426,
          outflow: 74.9294
        },
        {
          phase: 0.026667,
          pressure: 117.3931,
          inflow: 79.2054,
          outflow: 74.9287
        },
        {
          phase: 0.03,
          pressure: 117.4084,
          inflow: 88.9054,
          outflow: 74.9389
        },
        {
          phase: 0.033333,
          pressure: 117.44,
          inflow: 98.535,
          outflow: 74.96
        },
        {
          phase: 0.036667,
          pressure: 117.4878,
          inflow: 108.0866,
          outflow: 74.9918
        },
        {
          phase: 0.04,
          pressure: 117.5514,
          inflow: 117.5525,
          outflow: 75.0343
        },
        {
          phase: 0.043333,
          pressure: 117.6309,
          inflow: 126.9252,
          outflow: 75.0872
        },
        {
          phase: 0.046667,
          pressure: 117.7259,
          inflow: 136.1974,
          outflow: 75.1506
        },
        {
          phase: 0.05,
          pressure: 117.8363,
          inflow: 145.3616,
          outflow: 75.2242
        },
        {
          phase: 0.053333,
          pressure: 117.962,
          inflow: 154.4107,
          outflow: 75.308
        },
        {
          phase: 0.056667,
          pressure: 118.1026,
          inflow: 163.3374,
          outflow: 75.4017
        },
        {
          phase: 0.06,
          pressure: 118.258,
          inflow: 172.1346,
          outflow: 75.5053
        },
        {
          phase: 0.063333,
          pressure: 118.4279,
          inflow: 180.7955,
          outflow: 75.6186
        },
        {
          phase: 0.066667,
          pressure: 118.612,
          inflow: 189.3131,
          outflow: 75.7413
        },
        {
          phase: 0.07,
          pressure: 118.8102,
          inflow: 197.6807,
          outflow: 75.8734
        },
        {
          phase: 0.073333,
          pressure: 119.0221,
          inflow: 205.8917,
          outflow: 76.0147
        },
        {
          phase: 0.076667,
          pressure: 119.2474,
          inflow: 213.9395,
          outflow: 76.1649
        },
        {
          phase: 0.08,
          pressure: 119.4858,
          inflow: 221.8178,
          outflow: 76.3239
        },
        {
          phase: 0.083333,
          pressure: 119.7371,
          inflow: 229.5203,
          outflow: 76.4914
        },
        {
          phase: 0.086667,
          pressure: 120.001,
          inflow: 237.041,
          outflow: 76.6673
        },
        {
          phase: 0.09,
          pressure: 120.277,
          inflow: 244.3738,
          outflow: 76.8513
        },
        {
          phase: 0.093333,
          pressure: 120.5649,
          inflow: 251.5129,
          outflow: 77.0433
        },
        {
          phase: 0.096667,
          pressure: 120.8643,
          inflow: 258.4528,
          outflow: 77.2429
        },
        {
          phase: 0.1,
          pressure: 121.1749,
          inflow: 265.1879,
          outflow: 77.45
        },
        {
          phase: 0.103333,
          pressure: 121.4963,
          inflow: 271.7129,
          outflow: 77.6642
        },
        {
          phase: 0.106667,
          pressure: 121.8282,
          inflow: 278.0225,
          outflow: 77.8854
        },
        {
          phase: 0.11,
          pressure: 122.1701,
          inflow: 284.1118,
          outflow: 78.1134
        },
        {
          phase: 0.113333,
          pressure: 122.5216,
          inflow: 289.976,
          outflow: 78.3478
        },
        {
          phase: 0.116667,
          pressure: 122.8825,
          inflow: 295.6105,
          outflow: 78.5883
        },
        {
          phase: 0.12,
          pressure: 123.2522,
          inflow: 301.0107,
          outflow: 78.8348
        },
        {
          phase: 0.123333,
          pressure: 123.6304,
          inflow: 306.1723,
          outflow: 79.0869
        },
        {
          phase: 0.126667,
          pressure: 124.0167,
          inflow: 311.0914,
          outflow: 79.3444
        },
        {
          phase: 0.13,
          pressure: 124.4106,
          inflow: 315.764,
          outflow: 79.607
        },
        {
          phase: 0.133333,
          pressure: 124.8117,
          inflow: 320.1863,
          outflow: 79.8744
        },
        {
          phase: 0.136667,
          pressure: 125.2196,
          inflow: 324.3549,
          outflow: 80.1464
        },
        {
          phase: 0.14,
          pressure: 125.6338,
          inflow: 328.2666,
          outflow: 80.4225
        },
        {
          phase: 0.143333,
          pressure: 126.0539,
          inflow: 331.9181,
          outflow: 80.7026
        },
        {
          phase: 0.146667,
          pressure: 126.4795,
          inflow: 335.3065,
          outflow: 80.9863
        },
        {
          phase: 0.15,
          pressure: 126.91,
          inflow: 338.4293,
          outflow: 81.2734
        },
        {
          phase: 0.153333,
          pressure: 127.3452,
          inflow: 341.2839,
          outflow: 81.5634
        },
        {
          phase: 0.156667,
          pressure: 127.7844,
          inflow: 343.8681,
          outflow: 81.8562
        },
        {
          phase: 0.16,
          pressure: 128.2272,
          inflow: 346.1798,
          outflow: 82.1515
        },
        {
          phase: 0.163333,
          pressure: 128.6732,
          inflow: 348.2172,
          outflow: 82.4488
        },
        {
          phase: 0.166667,
          pressure: 129.1219,
          inflow: 349.9787,
          outflow: 82.7479
        },
        {
          phase: 0.17,
          pressure: 129.5728,
          inflow: 351.4628,
          outflow: 83.0485
        },
        {
          phase: 0.173333,
          pressure: 130.0255,
          inflow: 352.6685,
          outflow: 83.3503
        },
        {
          phase: 0.176667,
          pressure: 130.4794,
          inflow: 353.5947,
          outflow: 83.653
        },
        {
          phase: 0.18,
          pressure: 130.9342,
          inflow: 354.2407,
          outflow: 83.9561
        },
        {
          phase: 0.183333,
          pressure: 131.3893,
          inflow: 354.606,
          outflow: 84.2596
        },
        {
          phase: 0.186667,
          pressure: 131.8443,
          inflow: 354.6903,
          outflow: 84.5629
        },
        {
          phase: 0.19,
          pressure: 132.2987,
          inflow: 354.4936,
          outflow: 84.8658
        },
        {
          phase: 0.193333,
          pressure: 132.752,
          inflow: 354.016,
          outflow: 85.168
        },
        {
          phase: 0.196667,
          pressure: 133.2038,
          inflow: 353.2578,
          outflow: 85.4692
        },
        {
          phase: 0.2,
          pressure: 133.6535,
          inflow: 352.2197,
          outflow: 85.769
        },
        {
          phase: 0.203333,
          pressure: 134.1007,
          inflow: 350.9025,
          outflow: 86.0672
        },
        {
          phase: 0.206667,
          pressure: 134.545,
          inflow: 349.3073,
          outflow: 86.3634
        },
        {
          phase: 0.21,
          pressure: 134.9859,
          inflow: 347.4353,
          outflow: 86.6573
        },
        {
          phase: 0.213333,
          pressure: 135.4229,
          inflow: 345.288,
          outflow: 86.9486
        },
        {
          phase: 0.216667,
          pressure: 135.8556,
          inflow: 342.867,
          outflow: 87.2371
        },
        {
          phase: 0.22,
          pressure: 136.2835,
          inflow: 340.1744,
          outflow: 87.5223
        },
        {
          phase: 0.223333,
          pressure: 136.7061,
          inflow: 337.2123,
          outflow: 87.8041
        },
        {
          phase: 0.226667,
          pressure: 137.1231,
          inflow: 333.9829,
          outflow: 88.0821
        },
        {
          phase: 0.23,
          pressure: 137.5339,
          inflow: 330.4889,
          outflow: 88.356
        },
        {
          phase: 0.233333,
          pressure: 137.9382,
          inflow: 326.733,
          outflow: 88.6255
        },
        {
          phase: 0.236667,
          pressure: 138.3355,
          inflow: 322.7182,
          outflow: 88.8903
        },
        {
          phase: 0.24,
          pressure: 138.7254,
          inflow: 318.4476,
          outflow: 89.1502
        },
        {
          phase: 0.243333,
          pressure: 139.1074,
          inflow: 313.9248,
          outflow: 89.4049
        },
        {
          phase: 0.246667,
          pressure: 139.4812,
          inflow: 309.1532,
          outflow: 89.6541
        },
        {
          phase: 0.25,
          pressure: 139.8463,
          inflow: 304.1366,
          outflow: 89.8975
        },
        {
          phase: 0.253333,
          pressure: 140.2024,
          inflow: 298.879,
          outflow: 90.1349
        },
        {
          phase: 0.256667,
          pressure: 140.549,
          inflow: 293.3846,
          outflow: 90.366
        },
        {
          phase: 0.26,
          pressure: 140.8858,
          inflow: 287.6577,
          outflow: 90.5906
        },
        {
          phase: 0.263333,
          pressure: 141.2124,
          inflow: 281.7029,
          outflow: 90.8083
        },
        {
          phase: 0.266667,
          pressure: 141.5285,
          inflow: 275.5248,
          outflow: 91.019
        },
        {
          phase: 0.27,
          pressure: 141.8336,
          inflow: 269.1284,
          outflow: 91.2224
        },
        {
          phase: 0.273333,
          pressure: 142.1274,
          inflow: 262.5188,
          outflow: 91.4182
        },
        {
          phase: 0.276667,
          pressure: 142.4095,
          inflow: 255.7011,
          outflow: 91.6064
        },
        {
          phase: 0.28,
          pressure: 142.6798,
          inflow: 248.6809,
          outflow: 91.7865
        },
        {
          phase: 0.283333,
          pressure: 142.9377,
          inflow: 241.4636,
          outflow: 91.9585
        },
        {
          phase: 0.286667,
          pressure: 143.183,
          inflow: 234.0549,
          outflow: 92.122
        },
        {
          phase: 0.29,
          pressure: 143.4155,
          inflow: 226.4608,
          outflow: 92.277
        },
        {
          phase: 0.293333,
          pressure: 143.6347,
          inflow: 218.6872,
          outflow: 92.4232
        },
        {
          phase: 0.296667,
          pressure: 143.8405,
          inflow: 210.7404,
          outflow: 92.5603
        },
        {
          phase: 0.3,
          pressure: 144.0326,
          inflow: 202.6265,
          outflow: 92.6884
        },
        {
          phase: 0.303333,
          pressure: 144.2106,
          inflow: 194.3521,
          outflow: 92.8071
        },
        {
          phase: 0.306667,
          pressure: 144.3744,
          inflow: 185.9237,
          outflow: 92.9163
        },
        {
          phase: 0.31,
          pressure: 144.5237,
          inflow: 177.348,
          outflow: 93.0158
        },
        {
          phase: 0.313333,
          pressure: 144.6583,
          inflow: 168.6317,
          outflow: 93.1055
        },
        {
          phase: 0.316667,
          pressure: 144.7779,
          inflow: 159.7818,
          outflow: 93.1853
        },
        {
          phase: 0.32,
          pressure: 144.8824,
          inflow: 150.8053,
          outflow: 93.2549
        },
        {
          phase: 0.323333,
          pressure: 144.9716,
          inflow: 141.7093,
          outflow: 93.3144
        },
        {
          phase: 0.326667,
          pressure: 145.0453,
          inflow: 132.501,
          outflow: 93.3635
        },
        {
          phase: 0.33,
          pressure: 145.1033,
          inflow: 123.1878,
          outflow: 93.4022
        },
        {
          phase: 0.333333,
          pressure: 145.1455,
          inflow: 113.7769,
          outflow: 93.4304
        },
        {
          phase: 0.336667,
          pressure: 145.1718,
          inflow: 104.2758,
          outflow: 93.4479
        },
        {
          phase: 0.34,
          pressure: 145.182,
          inflow: 94.6921,
          outflow: 93.4546
        },
        {
          phase: 0.343333,
          pressure: 145.1759,
          inflow: 85.0334,
          outflow: 93.4506
        },
        {
          phase: 0.346667,
          pressure: 145.1536,
          inflow: 75.3073,
          outflow: 93.4357
        },
        {
          phase: 0.35,
          pressure: 145.1149,
          inflow: 65.5216,
          outflow: 93.4099
        },
        {
          phase: 0.353333,
          pressure: 145.0597,
          inflow: 55.6839,
          outflow: 93.3731
        },
        {
          phase: 0.356667,
          pressure: 144.9879,
          inflow: 45.8021,
          outflow: 93.3253
        },
        {
          phase: 0.36,
          pressure: 144.8996,
          inflow: 35.884,
          outflow: 93.2664
        },
        {
          phase: 0.363333,
          pressure: 144.7947,
          inflow: 25.9375,
          outflow: 93.1965
        },
        {
          phase: 0.366667,
          pressure: 144.6732,
          inflow: 15.9704,
          outflow: 93.1155
        },
        {
          phase: 0.37,
          pressure: 144.535,
          inflow: 5.9906,
          outflow: 93.0233
        },
        {
          phase: 0.373333,
          pressure: 144.3815,
          inflow: 0,
          outflow: 92.921
        },
        {
          phase: 0.376667,
          pressure: 144.2252,
          inflow: 0,
          outflow: 92.8168
        },
        {
          phase: 0.38,
          pressure: 144.069,
          inflow: 0,
          outflow: 92.7127
        },
        {
          phase: 0.383333,
          pressure: 143.913,
          inflow: 0,
          outflow: 92.6087
        },
        {
          phase: 0.386667,
          pressure: 143.7572,
          inflow: 0,
          outflow: 92.5048
        },
        {
          phase: 0.39,
          pressure: 143.6016,
          inflow: 0,
          outflow: 92.401
        },
        {
          phase: 0.393333,
          pressure: 143.4461,
          inflow: 0,
          outflow: 92.2974
        },
        {
          phase: 0.396667,
          pressure: 143.2908,
          inflow: 0,
          outflow: 92.1939
        },
        {
          phase: 0.4,
          pressure: 143.1357,
          inflow: 0,
          outflow: 92.0904
        },
        {
          phase: 0.403333,
          pressure: 142.9807,
          inflow: 0,
          outflow: 91.9871
        },
        {
          phase: 0.406667,
          pressure: 142.8259,
          inflow: 0,
          outflow: 91.884
        },
        {
          phase: 0.41,
          pressure: 142.6713,
          inflow: 0,
          outflow: 91.7809
        },
        {
          phase: 0.413333,
          pressure: 142.5169,
          inflow: 0,
          outflow: 91.6779
        },
        {
          phase: 0.416667,
          pressure: 142.3627,
          inflow: 0,
          outflow: 91.5751
        },
        {
          phase: 0.42,
          pressure: 142.2086,
          inflow: 0,
          outflow: 91.4724
        },
        {
          phase: 0.423333,
          pressure: 142.0547,
          inflow: 0,
          outflow: 91.3698
        },
        {
          phase: 0.426667,
          pressure: 141.9009,
          inflow: 0,
          outflow: 91.2673
        },
        {
          phase: 0.43,
          pressure: 141.7474,
          inflow: 0,
          outflow: 91.1649
        },
        {
          phase: 0.433333,
          pressure: 141.594,
          inflow: 0,
          outflow: 91.0627
        },
        {
          phase: 0.436667,
          pressure: 141.4408,
          inflow: 0,
          outflow: 90.9605
        },
        {
          phase: 0.44,
          pressure: 141.2877,
          inflow: 0,
          outflow: 90.8585
        },
        {
          phase: 0.443333,
          pressure: 141.1348,
          inflow: 0,
          outflow: 90.7566
        },
        {
          phase: 0.446667,
          pressure: 140.9821,
          inflow: 0,
          outflow: 90.6548
        },
        {
          phase: 0.45,
          pressure: 140.8296,
          inflow: 0,
          outflow: 90.5531
        },
        {
          phase: 0.453333,
          pressure: 140.6773,
          inflow: 0,
          outflow: 90.4515
        },
        {
          phase: 0.456667,
          pressure: 140.5251,
          inflow: 0,
          outflow: 90.35
        },
        {
          phase: 0.46,
          pressure: 140.373,
          inflow: 0,
          outflow: 90.2487
        },
        {
          phase: 0.463333,
          pressure: 140.2212,
          inflow: 0,
          outflow: 90.1475
        },
        {
          phase: 0.466667,
          pressure: 140.0695,
          inflow: 0,
          outflow: 90.0463
        },
        {
          phase: 0.47,
          pressure: 139.918,
          inflow: 0,
          outflow: 89.9453
        },
        {
          phase: 0.473333,
          pressure: 139.7667,
          inflow: 0,
          outflow: 89.8444
        },
        {
          phase: 0.476667,
          pressure: 139.6155,
          inflow: 0,
          outflow: 89.7437
        },
        {
          phase: 0.48,
          pressure: 139.4645,
          inflow: 0,
          outflow: 89.643
        },
        {
          phase: 0.483333,
          pressure: 139.3137,
          inflow: 0,
          outflow: 89.5424
        },
        {
          phase: 0.486667,
          pressure: 139.163,
          inflow: 0,
          outflow: 89.442
        },
        {
          phase: 0.49,
          pressure: 139.0125,
          inflow: 0,
          outflow: 89.3417
        },
        {
          phase: 0.493333,
          pressure: 138.8622,
          inflow: 0,
          outflow: 89.2415
        },
        {
          phase: 0.496667,
          pressure: 138.712,
          inflow: 0,
          outflow: 89.1414
        },
        {
          phase: 0.5,
          pressure: 138.5621,
          inflow: 0,
          outflow: 89.0414
        },
        {
          phase: 0.503333,
          pressure: 138.4122,
          inflow: 0,
          outflow: 88.9415
        },
        {
          phase: 0.506667,
          pressure: 138.2626,
          inflow: 0,
          outflow: 88.8417
        },
        {
          phase: 0.51,
          pressure: 138.1131,
          inflow: 0,
          outflow: 88.7421
        },
        {
          phase: 0.513333,
          pressure: 137.9638,
          inflow: 0,
          outflow: 88.6425
        },
        {
          phase: 0.516667,
          pressure: 137.8147,
          inflow: 0,
          outflow: 88.5431
        },
        {
          phase: 0.52,
          pressure: 137.6657,
          inflow: 0,
          outflow: 88.4438
        },
        {
          phase: 0.523333,
          pressure: 137.5169,
          inflow: 0,
          outflow: 88.3446
        },
        {
          phase: 0.526667,
          pressure: 137.3682,
          inflow: 0,
          outflow: 88.2455
        },
        {
          phase: 0.53,
          pressure: 137.2197,
          inflow: 0,
          outflow: 88.1465
        },
        {
          phase: 0.533333,
          pressure: 137.0714,
          inflow: 0,
          outflow: 88.0476
        },
        {
          phase: 0.536667,
          pressure: 136.9233,
          inflow: 0,
          outflow: 87.9489
        },
        {
          phase: 0.54,
          pressure: 136.7753,
          inflow: 0,
          outflow: 87.8502
        },
        {
          phase: 0.543333,
          pressure: 136.6275,
          inflow: 0,
          outflow: 87.7517
        },
        {
          phase: 0.546667,
          pressure: 136.4798,
          inflow: 0,
          outflow: 87.6532
        },
        {
          phase: 0.55,
          pressure: 136.3324,
          inflow: 0,
          outflow: 87.5549
        },
        {
          phase: 0.553333,
          pressure: 136.185,
          inflow: 0,
          outflow: 87.4567
        },
        {
          phase: 0.556667,
          pressure: 136.0379,
          inflow: 0,
          outflow: 87.3586
        },
        {
          phase: 0.56,
          pressure: 135.8909,
          inflow: 0,
          outflow: 87.2606
        },
        {
          phase: 0.563333,
          pressure: 135.7441,
          inflow: 0,
          outflow: 87.1627
        },
        {
          phase: 0.566667,
          pressure: 135.5974,
          inflow: 0,
          outflow: 87.065
        },
        {
          phase: 0.57,
          pressure: 135.4509,
          inflow: 0,
          outflow: 86.9673
        },
        {
          phase: 0.573333,
          pressure: 135.3046,
          inflow: 0,
          outflow: 86.8697
        },
        {
          phase: 0.576667,
          pressure: 135.1584,
          inflow: 0,
          outflow: 86.7723
        },
        {
          phase: 0.58,
          pressure: 135.0125,
          inflow: 0,
          outflow: 86.675
        },
        {
          phase: 0.583333,
          pressure: 134.8666,
          inflow: 0,
          outflow: 86.5777
        },
        {
          phase: 0.586667,
          pressure: 134.7209,
          inflow: 0,
          outflow: 86.4806
        },
        {
          phase: 0.59,
          pressure: 134.5754,
          inflow: 0,
          outflow: 86.3836
        },
        {
          phase: 0.593333,
          pressure: 134.4301,
          inflow: 0,
          outflow: 86.2867
        },
        {
          phase: 0.596667,
          pressure: 134.2849,
          inflow: 0,
          outflow: 86.1899
        },
        {
          phase: 0.6,
          pressure: 134.1399,
          inflow: 0,
          outflow: 86.0933
        },
        {
          phase: 0.603333,
          pressure: 133.995,
          inflow: 0,
          outflow: 85.9967
        },
        {
          phase: 0.606667,
          pressure: 133.8503,
          inflow: 0,
          outflow: 85.9002
        },
        {
          phase: 0.61,
          pressure: 133.7058,
          inflow: 0,
          outflow: 85.8039
        },
        {
          phase: 0.613333,
          pressure: 133.5614,
          inflow: 0,
          outflow: 85.7076
        },
        {
          phase: 0.616667,
          pressure: 133.4172,
          inflow: 0,
          outflow: 85.6115
        },
        {
          phase: 0.62,
          pressure: 133.2732,
          inflow: 0,
          outflow: 85.5155
        },
        {
          phase: 0.623333,
          pressure: 133.1293,
          inflow: 0,
          outflow: 85.4195
        },
        {
          phase: 0.626667,
          pressure: 132.9856,
          inflow: 0,
          outflow: 85.3237
        },
        {
          phase: 0.63,
          pressure: 132.842,
          inflow: 0,
          outflow: 85.228
        },
        {
          phase: 0.633333,
          pressure: 132.6986,
          inflow: 0,
          outflow: 85.1324
        },
        {
          phase: 0.636667,
          pressure: 132.5554,
          inflow: 0,
          outflow: 85.0369
        },
        {
          phase: 0.64,
          pressure: 132.4123,
          inflow: 0,
          outflow: 84.9415
        },
        {
          phase: 0.643333,
          pressure: 132.2694,
          inflow: 0,
          outflow: 84.8462
        },
        {
          phase: 0.646667,
          pressure: 132.1266,
          inflow: 0,
          outflow: 84.7511
        },
        {
          phase: 0.65,
          pressure: 131.984,
          inflow: 0,
          outflow: 84.656
        },
        {
          phase: 0.653333,
          pressure: 131.8416,
          inflow: 0,
          outflow: 84.561
        },
        {
          phase: 0.656667,
          pressure: 131.6993,
          inflow: 0,
          outflow: 84.4662
        },
        {
          phase: 0.66,
          pressure: 131.5572,
          inflow: 0,
          outflow: 84.3715
        },
        {
          phase: 0.663333,
          pressure: 131.4152,
          inflow: 0,
          outflow: 84.2768
        },
        {
          phase: 0.666667,
          pressure: 131.2734,
          inflow: 0,
          outflow: 84.1823
        },
        {
          phase: 0.67,
          pressure: 131.1318,
          inflow: 0,
          outflow: 84.0878
        },
        {
          phase: 0.673333,
          pressure: 130.9903,
          inflow: 0,
          outflow: 83.9935
        },
        {
          phase: 0.676667,
          pressure: 130.849,
          inflow: 0,
          outflow: 83.8993
        },
        {
          phase: 0.68,
          pressure: 130.7078,
          inflow: 0,
          outflow: 83.8052
        },
        {
          phase: 0.683333,
          pressure: 130.5668,
          inflow: 0,
          outflow: 83.7112
        },
        {
          phase: 0.686667,
          pressure: 130.4259,
          inflow: 0,
          outflow: 83.6173
        },
        {
          phase: 0.69,
          pressure: 130.2853,
          inflow: 0,
          outflow: 83.5235
        },
        {
          phase: 0.693333,
          pressure: 130.1447,
          inflow: 0,
          outflow: 83.4298
        },
        {
          phase: 0.696667,
          pressure: 130.0043,
          inflow: 0,
          outflow: 83.3362
        },
        {
          phase: 0.7,
          pressure: 129.8641,
          inflow: 0,
          outflow: 83.2428
        },
        {
          phase: 0.703333,
          pressure: 129.7241,
          inflow: 0,
          outflow: 83.1494
        },
        {
          phase: 0.706667,
          pressure: 129.5842,
          inflow: 0,
          outflow: 83.0561
        },
        {
          phase: 0.71,
          pressure: 129.4444,
          inflow: 0,
          outflow: 82.9629
        },
        {
          phase: 0.713333,
          pressure: 129.3048,
          inflow: 0,
          outflow: 82.8699
        },
        {
          phase: 0.716667,
          pressure: 129.1654,
          inflow: 0,
          outflow: 82.7769
        },
        {
          phase: 0.72,
          pressure: 129.0261,
          inflow: 0,
          outflow: 82.6841
        },
        {
          phase: 0.723333,
          pressure: 128.887,
          inflow: 0,
          outflow: 82.5913
        },
        {
          phase: 0.726667,
          pressure: 128.748,
          inflow: 0,
          outflow: 82.4987
        },
        {
          phase: 0.73,
          pressure: 128.6092,
          inflow: 0,
          outflow: 82.4061
        },
        {
          phase: 0.733333,
          pressure: 128.4706,
          inflow: 0,
          outflow: 82.3137
        },
        {
          phase: 0.736667,
          pressure: 128.3321,
          inflow: 0,
          outflow: 82.2214
        },
        {
          phase: 0.74,
          pressure: 128.1937,
          inflow: 0,
          outflow: 82.1292
        },
        {
          phase: 0.743333,
          pressure: 128.0555,
          inflow: 0,
          outflow: 82.037
        },
        {
          phase: 0.746667,
          pressure: 127.9175,
          inflow: 0,
          outflow: 81.945
        },
        {
          phase: 0.75,
          pressure: 127.7796,
          inflow: 0,
          outflow: 81.8531
        },
        {
          phase: 0.753333,
          pressure: 127.6419,
          inflow: 0,
          outflow: 81.7613
        },
        {
          phase: 0.756667,
          pressure: 127.5043,
          inflow: 0,
          outflow: 81.6696
        },
        {
          phase: 0.76,
          pressure: 127.3669,
          inflow: 0,
          outflow: 81.578
        },
        {
          phase: 0.763333,
          pressure: 127.2297,
          inflow: 0,
          outflow: 81.4864
        },
        {
          phase: 0.766667,
          pressure: 127.0926,
          inflow: 0,
          outflow: 81.395
        },
        {
          phase: 0.77,
          pressure: 126.9556,
          inflow: 0,
          outflow: 81.3037
        },
        {
          phase: 0.773333,
          pressure: 126.8188,
          inflow: 0,
          outflow: 81.2125
        },
        {
          phase: 0.776667,
          pressure: 126.6822,
          inflow: 0,
          outflow: 81.1214
        },
        {
          phase: 0.78,
          pressure: 126.5457,
          inflow: 0,
          outflow: 81.0305
        },
        {
          phase: 0.783333,
          pressure: 126.4093,
          inflow: 0,
          outflow: 80.9396
        },
        {
          phase: 0.786667,
          pressure: 126.2732,
          inflow: 0,
          outflow: 80.8488
        },
        {
          phase: 0.79,
          pressure: 126.1371,
          inflow: 0,
          outflow: 80.7581
        },
        {
          phase: 0.793333,
          pressure: 126.0012,
          inflow: 0,
          outflow: 80.6675
        },
        {
          phase: 0.796667,
          pressure: 125.8655,
          inflow: 0,
          outflow: 80.577
        },
        {
          phase: 0.8,
          pressure: 125.7299,
          inflow: 0,
          outflow: 80.4866
        },
        {
          phase: 0.803333,
          pressure: 125.5945,
          inflow: 0,
          outflow: 80.3963
        },
        {
          phase: 0.806667,
          pressure: 125.4592,
          inflow: 0,
          outflow: 80.3062
        },
        {
          phase: 0.81,
          pressure: 125.3241,
          inflow: 0,
          outflow: 80.2161
        },
        {
          phase: 0.813333,
          pressure: 125.1892,
          inflow: 0,
          outflow: 80.1261
        },
        {
          phase: 0.816667,
          pressure: 125.0543,
          inflow: 0,
          outflow: 80.0362
        },
        {
          phase: 0.82,
          pressure: 124.9197,
          inflow: 0,
          outflow: 79.9464
        },
        {
          phase: 0.823333,
          pressure: 124.7852,
          inflow: 0,
          outflow: 79.8568
        },
        {
          phase: 0.826667,
          pressure: 124.6508,
          inflow: 0,
          outflow: 79.7672
        },
        {
          phase: 0.83,
          pressure: 124.5166,
          inflow: 0,
          outflow: 79.6777
        },
        {
          phase: 0.833333,
          pressure: 124.3825,
          inflow: 0,
          outflow: 79.5883
        },
        {
          phase: 0.836667,
          pressure: 124.2486,
          inflow: 0,
          outflow: 79.4991
        },
        {
          phase: 0.84,
          pressure: 124.1148,
          inflow: 0,
          outflow: 79.4099
        },
        {
          phase: 0.843333,
          pressure: 123.9812,
          inflow: 0,
          outflow: 79.3208
        },
        {
          phase: 0.846667,
          pressure: 123.8478,
          inflow: 0,
          outflow: 79.2318
        },
        {
          phase: 0.85,
          pressure: 123.7145,
          inflow: 0,
          outflow: 79.143
        },
        {
          phase: 0.853333,
          pressure: 123.5813,
          inflow: 0,
          outflow: 79.0542
        },
        {
          phase: 0.856667,
          pressure: 123.4483,
          inflow: 0,
          outflow: 78.9655
        },
        {
          phase: 0.86,
          pressure: 123.3154,
          inflow: 0,
          outflow: 78.8769
        },
        {
          phase: 0.863333,
          pressure: 123.1827,
          inflow: 0,
          outflow: 78.7885
        },
        {
          phase: 0.866667,
          pressure: 123.0501,
          inflow: 0,
          outflow: 78.7001
        },
        {
          phase: 0.87,
          pressure: 122.9177,
          inflow: 0,
          outflow: 78.6118
        },
        {
          phase: 0.873333,
          pressure: 122.7855,
          inflow: 0,
          outflow: 78.5236
        },
        {
          phase: 0.876667,
          pressure: 122.6533,
          inflow: 0,
          outflow: 78.4356
        },
        {
          phase: 0.88,
          pressure: 122.5214,
          inflow: 0,
          outflow: 78.3476
        },
        {
          phase: 0.883333,
          pressure: 122.3895,
          inflow: 0,
          outflow: 78.2597
        },
        {
          phase: 0.886667,
          pressure: 122.2579,
          inflow: 0,
          outflow: 78.1719
        },
        {
          phase: 0.89,
          pressure: 122.1263,
          inflow: 0,
          outflow: 78.0842
        },
        {
          phase: 0.893333,
          pressure: 121.995,
          inflow: 0,
          outflow: 77.9966
        },
        {
          phase: 0.896667,
          pressure: 121.8637,
          inflow: 0,
          outflow: 77.9091
        },
        {
          phase: 0.9,
          pressure: 121.7326,
          inflow: 0,
          outflow: 77.8218
        },
        {
          phase: 0.903333,
          pressure: 121.6017,
          inflow: 0,
          outflow: 77.7345
        },
        {
          phase: 0.906667,
          pressure: 121.4709,
          inflow: 0,
          outflow: 77.6473
        },
        {
          phase: 0.91,
          pressure: 121.3403,
          inflow: 0,
          outflow: 77.5602
        },
        {
          phase: 0.913333,
          pressure: 121.2098,
          inflow: 0,
          outflow: 77.4732
        },
        {
          phase: 0.916667,
          pressure: 121.0794,
          inflow: 0,
          outflow: 77.3863
        },
        {
          phase: 0.92,
          pressure: 120.9492,
          inflow: 0,
          outflow: 77.2995
        },
        {
          phase: 0.923333,
          pressure: 120.8191,
          inflow: 0,
          outflow: 77.2128
        },
        {
          phase: 0.926667,
          pressure: 120.6892,
          inflow: 0,
          outflow: 77.1261
        },
        {
          phase: 0.93,
          pressure: 120.5594,
          inflow: 0,
          outflow: 77.0396
        },
        {
          phase: 0.933333,
          pressure: 120.4298,
          inflow: 0,
          outflow: 76.9532
        },
        {
          phase: 0.936667,
          pressure: 120.3003,
          inflow: 0,
          outflow: 76.8669
        },
        {
          phase: 0.94,
          pressure: 120.171,
          inflow: 0,
          outflow: 76.7807
        },
        {
          phase: 0.943333,
          pressure: 120.0418,
          inflow: 0,
          outflow: 76.6946
        },
        {
          phase: 0.946667,
          pressure: 119.9128,
          inflow: 0,
          outflow: 76.6085
        },
        {
          phase: 0.95,
          pressure: 119.7839,
          inflow: 0,
          outflow: 76.5226
        },
        {
          phase: 0.953333,
          pressure: 119.6551,
          inflow: 0,
          outflow: 76.4368
        },
        {
          phase: 0.956667,
          pressure: 119.5265,
          inflow: 0,
          outflow: 76.351
        },
        {
          phase: 0.96,
          pressure: 119.3981,
          inflow: 0,
          outflow: 76.2654
        },
        {
          phase: 0.963333,
          pressure: 119.2697,
          inflow: 0,
          outflow: 76.1798
        },
        {
          phase: 0.966667,
          pressure: 119.1416,
          inflow: 0,
          outflow: 76.0944
        },
        {
          phase: 0.97,
          pressure: 119.0135,
          inflow: 0,
          outflow: 76.009
        },
        {
          phase: 0.973333,
          pressure: 118.8856,
          inflow: 0,
          outflow: 75.9238
        },
        {
          phase: 0.976667,
          pressure: 118.7579,
          inflow: 0,
          outflow: 75.8386
        },
        {
          phase: 0.98,
          pressure: 118.6303,
          inflow: 0,
          outflow: 75.7535
        },
        {
          phase: 0.983333,
          pressure: 118.5028,
          inflow: 0,
          outflow: 75.6686
        },
        {
          phase: 0.986667,
          pressure: 118.3755,
          inflow: 0,
          outflow: 75.5837
        },
        {
          phase: 0.99,
          pressure: 118.2483,
          inflow: 0,
          outflow: 75.4989
        },
        {
          phase: 0.993333,
          pressure: 118.1213,
          inflow: 0,
          outflow: 75.4142
        },
        {
          phase: 0.996667,
          pressure: 117.9944,
          inflow: 0,
          outflow: 75.3296
        },
        {
          phase: 1,
          pressure: 117.8677,
          inflow: 0,
          outflow: 75.2451
        }
      ],
      systolic: 145.18,
      diastolic: 117.39,
      mean: 131,
      pulsePressure: 27.79,
      cycleVolumeResidualMl: -0.0013320552944584563
    },
    stiffer_artery: {
      id: "stiffer_artery",
      R: 1.02,
      C: 0.72,
      pv: 5,
      heartRate: 72,
      strokeVolume: 70,
      period: 0.8333333333333334,
      samples: [
        {
          phase: 0,
          pressure: 62.137,
          inflow: 0,
          outflow: 56.0166
        },
        {
          phase: 3333e-6,
          pressure: 61.9405,
          inflow: 9.9835,
          outflow: 55.824
        },
        {
          phase: 6667e-6,
          pressure: 61.7832,
          inflow: 19.9592,
          outflow: 55.6698
        },
        {
          phase: 0.01,
          pressure: 61.6649,
          inflow: 29.919,
          outflow: 55.5538
        },
        {
          phase: 0.013333,
          pressure: 61.5853,
          inflow: 39.8551,
          outflow: 55.4758
        },
        {
          phase: 0.016667,
          pressure: 61.5443,
          inflow: 49.7596,
          outflow: 55.4356
        },
        {
          phase: 0.02,
          pressure: 61.5415,
          inflow: 59.6247,
          outflow: 55.4328
        },
        {
          phase: 0.023333,
          pressure: 61.5765,
          inflow: 69.4426,
          outflow: 55.4672
        },
        {
          phase: 0.026667,
          pressure: 61.6492,
          inflow: 79.2054,
          outflow: 55.5384
        },
        {
          phase: 0.03,
          pressure: 61.759,
          inflow: 88.9054,
          outflow: 55.6461
        },
        {
          phase: 0.033333,
          pressure: 61.9057,
          inflow: 98.535,
          outflow: 55.7899
        },
        {
          phase: 0.036667,
          pressure: 62.0887,
          inflow: 108.0866,
          outflow: 55.9693
        },
        {
          phase: 0.04,
          pressure: 62.3076,
          inflow: 117.5525,
          outflow: 56.184
        },
        {
          phase: 0.043333,
          pressure: 62.5621,
          inflow: 126.9252,
          outflow: 56.4334
        },
        {
          phase: 0.046667,
          pressure: 62.8514,
          inflow: 136.1974,
          outflow: 56.7171
        },
        {
          phase: 0.05,
          pressure: 63.1751,
          inflow: 145.3616,
          outflow: 57.0345
        },
        {
          phase: 0.053333,
          pressure: 63.5327,
          inflow: 154.4107,
          outflow: 57.385
        },
        {
          phase: 0.056667,
          pressure: 63.9236,
          inflow: 163.3374,
          outflow: 57.7682
        },
        {
          phase: 0.06,
          pressure: 64.3471,
          inflow: 172.1346,
          outflow: 58.1834
        },
        {
          phase: 0.063333,
          pressure: 64.8026,
          inflow: 180.7955,
          outflow: 58.63
        },
        {
          phase: 0.066667,
          pressure: 65.2895,
          inflow: 189.3131,
          outflow: 59.1074
        },
        {
          phase: 0.07,
          pressure: 65.8071,
          inflow: 197.6807,
          outflow: 59.6148
        },
        {
          phase: 0.073333,
          pressure: 66.3546,
          inflow: 205.8917,
          outflow: 60.1516
        },
        {
          phase: 0.076667,
          pressure: 66.9314,
          inflow: 213.9395,
          outflow: 60.717
        },
        {
          phase: 0.08,
          pressure: 67.5366,
          inflow: 221.8178,
          outflow: 61.3104
        },
        {
          phase: 0.083333,
          pressure: 68.1696,
          inflow: 229.5203,
          outflow: 61.931
        },
        {
          phase: 0.086667,
          pressure: 68.8295,
          inflow: 237.041,
          outflow: 62.5779
        },
        {
          phase: 0.09,
          pressure: 69.5155,
          inflow: 244.3738,
          outflow: 63.2505
        },
        {
          phase: 0.093333,
          pressure: 70.2268,
          inflow: 251.5129,
          outflow: 63.9478
        },
        {
          phase: 0.096667,
          pressure: 70.9625,
          inflow: 258.4528,
          outflow: 64.6691
        },
        {
          phase: 0.1,
          pressure: 71.7217,
          inflow: 265.1879,
          outflow: 65.4134
        },
        {
          phase: 0.103333,
          pressure: 72.5036,
          inflow: 271.7129,
          outflow: 66.18
        },
        {
          phase: 0.106667,
          pressure: 73.3073,
          inflow: 278.0225,
          outflow: 66.9679
        },
        {
          phase: 0.11,
          pressure: 74.1318,
          inflow: 284.1118,
          outflow: 67.7763
        },
        {
          phase: 0.113333,
          pressure: 74.9762,
          inflow: 289.976,
          outflow: 68.6042
        },
        {
          phase: 0.116667,
          pressure: 75.8396,
          inflow: 295.6105,
          outflow: 69.4506
        },
        {
          phase: 0.12,
          pressure: 76.721,
          inflow: 301.0107,
          outflow: 70.3147
        },
        {
          phase: 0.123333,
          pressure: 77.6194,
          inflow: 306.1723,
          outflow: 71.1954
        },
        {
          phase: 0.126667,
          pressure: 78.5337,
          inflow: 311.0914,
          outflow: 72.0919
        },
        {
          phase: 0.13,
          pressure: 79.4632,
          inflow: 315.764,
          outflow: 73.0031
        },
        {
          phase: 0.133333,
          pressure: 80.4066,
          inflow: 320.1863,
          outflow: 73.928
        },
        {
          phase: 0.136667,
          pressure: 81.363,
          inflow: 324.3549,
          outflow: 74.8656
        },
        {
          phase: 0.14,
          pressure: 82.3313,
          inflow: 328.2666,
          outflow: 75.815
        },
        {
          phase: 0.143333,
          pressure: 83.3105,
          inflow: 331.9181,
          outflow: 76.775
        },
        {
          phase: 0.146667,
          pressure: 84.2996,
          inflow: 335.3065,
          outflow: 77.7447
        },
        {
          phase: 0.15,
          pressure: 85.2975,
          inflow: 338.4293,
          outflow: 78.7231
        },
        {
          phase: 0.153333,
          pressure: 86.3032,
          inflow: 341.2839,
          outflow: 79.709
        },
        {
          phase: 0.156667,
          pressure: 87.3155,
          inflow: 343.8681,
          outflow: 80.7015
        },
        {
          phase: 0.16,
          pressure: 88.3334,
          inflow: 346.1798,
          outflow: 81.6994
        },
        {
          phase: 0.163333,
          pressure: 89.3559,
          inflow: 348.2172,
          outflow: 82.7019
        },
        {
          phase: 0.166667,
          pressure: 90.3818,
          inflow: 349.9787,
          outflow: 83.7077
        },
        {
          phase: 0.17,
          pressure: 91.4101,
          inflow: 351.4628,
          outflow: 84.7158
        },
        {
          phase: 0.173333,
          pressure: 92.4397,
          inflow: 352.6685,
          outflow: 85.7252
        },
        {
          phase: 0.176667,
          pressure: 93.4695,
          inflow: 353.5947,
          outflow: 86.7348
        },
        {
          phase: 0.18,
          pressure: 94.4984,
          inflow: 354.2407,
          outflow: 87.7436
        },
        {
          phase: 0.183333,
          pressure: 95.5254,
          inflow: 354.606,
          outflow: 88.7504
        },
        {
          phase: 0.186667,
          pressure: 96.5494,
          inflow: 354.6903,
          outflow: 89.7543
        },
        {
          phase: 0.19,
          pressure: 97.5693,
          inflow: 354.4936,
          outflow: 90.7542
        },
        {
          phase: 0.193333,
          pressure: 98.5841,
          inflow: 354.016,
          outflow: 91.7491
        },
        {
          phase: 0.196667,
          pressure: 99.5926,
          inflow: 353.2578,
          outflow: 92.7379
        },
        {
          phase: 0.2,
          pressure: 100.5939,
          inflow: 352.2197,
          outflow: 93.7195
        },
        {
          phase: 0.203333,
          pressure: 101.5869,
          inflow: 350.9025,
          outflow: 94.693
        },
        {
          phase: 0.206667,
          pressure: 102.5705,
          inflow: 349.3073,
          outflow: 95.6574
        },
        {
          phase: 0.21,
          pressure: 103.5437,
          inflow: 347.4353,
          outflow: 96.6115
        },
        {
          phase: 0.213333,
          pressure: 104.5055,
          inflow: 345.288,
          outflow: 97.5544
        },
        {
          phase: 0.216667,
          pressure: 105.4549,
          inflow: 342.867,
          outflow: 98.4852
        },
        {
          phase: 0.22,
          pressure: 106.3909,
          inflow: 340.1744,
          outflow: 99.4028
        },
        {
          phase: 0.223333,
          pressure: 107.3124,
          inflow: 337.2123,
          outflow: 100.3063
        },
        {
          phase: 0.226667,
          pressure: 108.2185,
          inflow: 333.9829,
          outflow: 101.1946
        },
        {
          phase: 0.23,
          pressure: 109.1083,
          inflow: 330.4889,
          outflow: 102.0669
        },
        {
          phase: 0.233333,
          pressure: 109.9807,
          inflow: 326.733,
          outflow: 102.9223
        },
        {
          phase: 0.236667,
          pressure: 110.8349,
          inflow: 322.7182,
          outflow: 103.7597
        },
        {
          phase: 0.24,
          pressure: 111.6699,
          inflow: 318.4476,
          outflow: 104.5783
        },
        {
          phase: 0.243333,
          pressure: 112.4848,
          inflow: 313.9248,
          outflow: 105.3773
        },
        {
          phase: 0.246667,
          pressure: 113.2788,
          inflow: 309.1532,
          outflow: 106.1557
        },
        {
          phase: 0.25,
          pressure: 114.0509,
          inflow: 304.1366,
          outflow: 106.9126
        },
        {
          phase: 0.253333,
          pressure: 114.8003,
          inflow: 298.879,
          outflow: 107.6473
        },
        {
          phase: 0.256667,
          pressure: 115.5262,
          inflow: 293.3846,
          outflow: 108.359
        },
        {
          phase: 0.26,
          pressure: 116.2277,
          inflow: 287.6577,
          outflow: 109.0467
        },
        {
          phase: 0.263333,
          pressure: 116.9041,
          inflow: 281.7029,
          outflow: 109.7099
        },
        {
          phase: 0.266667,
          pressure: 117.5545,
          inflow: 275.5248,
          outflow: 110.3476
        },
        {
          phase: 0.27,
          pressure: 118.1783,
          inflow: 269.1284,
          outflow: 110.9592
        },
        {
          phase: 0.273333,
          pressure: 118.7747,
          inflow: 262.5188,
          outflow: 111.5439
        },
        {
          phase: 0.276667,
          pressure: 119.343,
          inflow: 255.7011,
          outflow: 112.101
        },
        {
          phase: 0.28,
          pressure: 119.8825,
          inflow: 248.6809,
          outflow: 112.6299
        },
        {
          phase: 0.283333,
          pressure: 120.3926,
          inflow: 241.4636,
          outflow: 113.13
        },
        {
          phase: 0.286667,
          pressure: 120.8726,
          inflow: 234.0549,
          outflow: 113.6005
        },
        {
          phase: 0.29,
          pressure: 121.3218,
          inflow: 226.4608,
          outflow: 114.041
        },
        {
          phase: 0.293333,
          pressure: 121.7398,
          inflow: 218.6872,
          outflow: 114.4508
        },
        {
          phase: 0.296667,
          pressure: 122.1259,
          inflow: 210.7404,
          outflow: 114.8293
        },
        {
          phase: 0.3,
          pressure: 122.4797,
          inflow: 202.6265,
          outflow: 115.1762
        },
        {
          phase: 0.303333,
          pressure: 122.8005,
          inflow: 194.3521,
          outflow: 115.4907
        },
        {
          phase: 0.306667,
          pressure: 123.088,
          inflow: 185.9237,
          outflow: 115.7726
        },
        {
          phase: 0.31,
          pressure: 123.3417,
          inflow: 177.348,
          outflow: 116.0213
        },
        {
          phase: 0.313333,
          pressure: 123.5611,
          inflow: 168.6317,
          outflow: 116.2364
        },
        {
          phase: 0.316667,
          pressure: 123.7458,
          inflow: 159.7818,
          outflow: 116.4175
        },
        {
          phase: 0.32,
          pressure: 123.8956,
          inflow: 150.8053,
          outflow: 116.5643
        },
        {
          phase: 0.323333,
          pressure: 124.0099,
          inflow: 141.7093,
          outflow: 116.6764
        },
        {
          phase: 0.326667,
          pressure: 124.0886,
          inflow: 132.501,
          outflow: 116.7536
        },
        {
          phase: 0.33,
          pressure: 124.1314,
          inflow: 123.1878,
          outflow: 116.7954
        },
        {
          phase: 0.333333,
          pressure: 124.1379,
          inflow: 113.7769,
          outflow: 116.8018
        },
        {
          phase: 0.336667,
          pressure: 124.1079,
          inflow: 104.2758,
          outflow: 116.7725
        },
        {
          phase: 0.34,
          pressure: 124.0414,
          inflow: 94.6921,
          outflow: 116.7072
        },
        {
          phase: 0.343333,
          pressure: 123.938,
          inflow: 85.0334,
          outflow: 116.6059
        },
        {
          phase: 0.346667,
          pressure: 123.7977,
          inflow: 75.3073,
          outflow: 116.4684
        },
        {
          phase: 0.35,
          pressure: 123.6204,
          inflow: 65.5216,
          outflow: 116.2945
        },
        {
          phase: 0.353333,
          pressure: 123.4059,
          inflow: 55.6839,
          outflow: 116.0843
        },
        {
          phase: 0.356667,
          pressure: 123.1543,
          inflow: 45.8021,
          outflow: 115.8376
        },
        {
          phase: 0.36,
          pressure: 122.8655,
          inflow: 35.884,
          outflow: 115.5545
        },
        {
          phase: 0.363333,
          pressure: 122.5396,
          inflow: 25.9375,
          outflow: 115.2349
        },
        {
          phase: 0.366667,
          pressure: 122.1765,
          inflow: 15.9704,
          outflow: 114.879
        },
        {
          phase: 0.37,
          pressure: 121.7764,
          inflow: 5.9906,
          outflow: 114.4867
        },
        {
          phase: 0.373333,
          pressure: 121.3425,
          inflow: 0,
          outflow: 114.0613
        },
        {
          phase: 0.376667,
          pressure: 120.9033,
          inflow: 0,
          outflow: 113.6307
        },
        {
          phase: 0.38,
          pressure: 120.4657,
          inflow: 0,
          outflow: 113.2017
        },
        {
          phase: 0.383333,
          pressure: 120.0298,
          inflow: 0,
          outflow: 112.7743
        },
        {
          phase: 0.386667,
          pressure: 119.5955,
          inflow: 0,
          outflow: 112.3486
        },
        {
          phase: 0.39,
          pressure: 119.1629,
          inflow: 0,
          outflow: 111.9244
        },
        {
          phase: 0.393333,
          pressure: 118.7319,
          inflow: 0,
          outflow: 111.5019
        },
        {
          phase: 0.396667,
          pressure: 118.3026,
          inflow: 0,
          outflow: 111.0809
        },
        {
          phase: 0.4,
          pressure: 117.8748,
          inflow: 0,
          outflow: 110.6616
        },
        {
          phase: 0.403333,
          pressure: 117.4487,
          inflow: 0,
          outflow: 110.2438
        },
        {
          phase: 0.406667,
          pressure: 117.0242,
          inflow: 0,
          outflow: 109.8276
        },
        {
          phase: 0.41,
          pressure: 116.6012,
          inflow: 0,
          outflow: 109.413
        },
        {
          phase: 0.413333,
          pressure: 116.1799,
          inflow: 0,
          outflow: 108.9999
        },
        {
          phase: 0.416667,
          pressure: 115.7602,
          inflow: 0,
          outflow: 108.5884
        },
        {
          phase: 0.42,
          pressure: 115.342,
          inflow: 0,
          outflow: 108.1785
        },
        {
          phase: 0.423333,
          pressure: 114.9255,
          inflow: 0,
          outflow: 107.7701
        },
        {
          phase: 0.426667,
          pressure: 114.5105,
          inflow: 0,
          outflow: 107.3632
        },
        {
          phase: 0.43,
          pressure: 114.0971,
          inflow: 0,
          outflow: 106.9579
        },
        {
          phase: 0.433333,
          pressure: 113.6852,
          inflow: 0,
          outflow: 106.5541
        },
        {
          phase: 0.436667,
          pressure: 113.2749,
          inflow: 0,
          outflow: 106.1518
        },
        {
          phase: 0.44,
          pressure: 112.8661,
          inflow: 0,
          outflow: 105.7511
        },
        {
          phase: 0.443333,
          pressure: 112.4589,
          inflow: 0,
          outflow: 105.3519
        },
        {
          phase: 0.446667,
          pressure: 112.0532,
          inflow: 0,
          outflow: 104.9541
        },
        {
          phase: 0.45,
          pressure: 111.6491,
          inflow: 0,
          outflow: 104.5579
        },
        {
          phase: 0.453333,
          pressure: 111.2464,
          inflow: 0,
          outflow: 104.1632
        },
        {
          phase: 0.456667,
          pressure: 110.8453,
          inflow: 0,
          outflow: 103.7699
        },
        {
          phase: 0.46,
          pressure: 110.4457,
          inflow: 0,
          outflow: 103.3782
        },
        {
          phase: 0.463333,
          pressure: 110.0477,
          inflow: 0,
          outflow: 102.9879
        },
        {
          phase: 0.466667,
          pressure: 109.6511,
          inflow: 0,
          outflow: 102.5991
        },
        {
          phase: 0.47,
          pressure: 109.256,
          inflow: 0,
          outflow: 102.2118
        },
        {
          phase: 0.473333,
          pressure: 108.8624,
          inflow: 0,
          outflow: 101.8259
        },
        {
          phase: 0.476667,
          pressure: 108.4703,
          inflow: 0,
          outflow: 101.4415
        },
        {
          phase: 0.48,
          pressure: 108.0797,
          inflow: 0,
          outflow: 101.0585
        },
        {
          phase: 0.483333,
          pressure: 107.6905,
          inflow: 0,
          outflow: 100.677
        },
        {
          phase: 0.486667,
          pressure: 107.3028,
          inflow: 0,
          outflow: 100.2969
        },
        {
          phase: 0.49,
          pressure: 106.9166,
          inflow: 0,
          outflow: 99.9183
        },
        {
          phase: 0.493333,
          pressure: 106.5319,
          inflow: 0,
          outflow: 99.5411
        },
        {
          phase: 0.496667,
          pressure: 106.1486,
          inflow: 0,
          outflow: 99.1653
        },
        {
          phase: 0.5,
          pressure: 105.7667,
          inflow: 0,
          outflow: 98.7909
        },
        {
          phase: 0.503333,
          pressure: 105.3863,
          inflow: 0,
          outflow: 98.4179
        },
        {
          phase: 0.506667,
          pressure: 105.0073,
          inflow: 0,
          outflow: 98.0464
        },
        {
          phase: 0.51,
          pressure: 104.6298,
          inflow: 0,
          outflow: 97.6762
        },
        {
          phase: 0.513333,
          pressure: 104.2536,
          inflow: 0,
          outflow: 97.3075
        },
        {
          phase: 0.516667,
          pressure: 103.8789,
          inflow: 0,
          outflow: 96.9401
        },
        {
          phase: 0.52,
          pressure: 103.5056,
          inflow: 0,
          outflow: 96.5742
        },
        {
          phase: 0.523333,
          pressure: 103.1338,
          inflow: 0,
          outflow: 96.2096
        },
        {
          phase: 0.526667,
          pressure: 102.7633,
          inflow: 0,
          outflow: 95.8463
        },
        {
          phase: 0.53,
          pressure: 102.3942,
          inflow: 0,
          outflow: 95.4845
        },
        {
          phase: 0.533333,
          pressure: 102.0265,
          inflow: 0,
          outflow: 95.124
        },
        {
          phase: 0.536667,
          pressure: 101.6602,
          inflow: 0,
          outflow: 94.7649
        },
        {
          phase: 0.54,
          pressure: 101.2953,
          inflow: 0,
          outflow: 94.4072
        },
        {
          phase: 0.543333,
          pressure: 100.9318,
          inflow: 0,
          outflow: 94.0507
        },
        {
          phase: 0.546667,
          pressure: 100.5696,
          inflow: 0,
          outflow: 93.6957
        },
        {
          phase: 0.55,
          pressure: 100.2088,
          inflow: 0,
          outflow: 93.342
        },
        {
          phase: 0.553333,
          pressure: 99.8494,
          inflow: 0,
          outflow: 92.9896
        },
        {
          phase: 0.556667,
          pressure: 99.4913,
          inflow: 0,
          outflow: 92.6385
        },
        {
          phase: 0.56,
          pressure: 99.1346,
          inflow: 0,
          outflow: 92.2888
        },
        {
          phase: 0.563333,
          pressure: 98.7792,
          inflow: 0,
          outflow: 91.9404
        },
        {
          phase: 0.566667,
          pressure: 98.4251,
          inflow: 0,
          outflow: 91.5933
        },
        {
          phase: 0.57,
          pressure: 98.0724,
          inflow: 0,
          outflow: 91.2475
        },
        {
          phase: 0.573333,
          pressure: 97.7211,
          inflow: 0,
          outflow: 90.903
        },
        {
          phase: 0.576667,
          pressure: 97.371,
          inflow: 0,
          outflow: 90.5598
        },
        {
          phase: 0.58,
          pressure: 97.0223,
          inflow: 0,
          outflow: 90.2179
        },
        {
          phase: 0.583333,
          pressure: 96.6749,
          inflow: 0,
          outflow: 89.8773
        },
        {
          phase: 0.586667,
          pressure: 96.3288,
          inflow: 0,
          outflow: 89.538
        },
        {
          phase: 0.59,
          pressure: 95.984,
          inflow: 0,
          outflow: 89.2
        },
        {
          phase: 0.593333,
          pressure: 95.6405,
          inflow: 0,
          outflow: 88.8633
        },
        {
          phase: 0.596667,
          pressure: 95.2983,
          inflow: 0,
          outflow: 88.5278
        },
        {
          phase: 0.6,
          pressure: 94.9574,
          inflow: 0,
          outflow: 88.1936
        },
        {
          phase: 0.603333,
          pressure: 94.6178,
          inflow: 0,
          outflow: 87.8606
        },
        {
          phase: 0.606667,
          pressure: 94.2795,
          inflow: 0,
          outflow: 87.5289
        },
        {
          phase: 0.61,
          pressure: 93.9425,
          inflow: 0,
          outflow: 87.1985
        },
        {
          phase: 0.613333,
          pressure: 93.6067,
          inflow: 0,
          outflow: 86.8693
        },
        {
          phase: 0.616667,
          pressure: 93.2722,
          inflow: 0,
          outflow: 86.5413
        },
        {
          phase: 0.62,
          pressure: 92.9389,
          inflow: 0,
          outflow: 86.2146
        },
        {
          phase: 0.623333,
          pressure: 92.6069,
          inflow: 0,
          outflow: 85.8891
        },
        {
          phase: 0.626667,
          pressure: 92.2762,
          inflow: 0,
          outflow: 85.5649
        },
        {
          phase: 0.63,
          pressure: 91.9467,
          inflow: 0,
          outflow: 85.2419
        },
        {
          phase: 0.633333,
          pressure: 91.6185,
          inflow: 0,
          outflow: 84.9201
        },
        {
          phase: 0.636667,
          pressure: 91.2915,
          inflow: 0,
          outflow: 84.5995
        },
        {
          phase: 0.64,
          pressure: 90.9657,
          inflow: 0,
          outflow: 84.2801
        },
        {
          phase: 0.643333,
          pressure: 90.6411,
          inflow: 0,
          outflow: 83.9619
        },
        {
          phase: 0.646667,
          pressure: 90.3178,
          inflow: 0,
          outflow: 83.6449
        },
        {
          phase: 0.65,
          pressure: 89.9957,
          inflow: 0,
          outflow: 83.3291
        },
        {
          phase: 0.653333,
          pressure: 89.6749,
          inflow: 0,
          outflow: 83.0146
        },
        {
          phase: 0.656667,
          pressure: 89.3552,
          inflow: 0,
          outflow: 82.7012
        },
        {
          phase: 0.66,
          pressure: 89.0367,
          inflow: 0,
          outflow: 82.3889
        },
        {
          phase: 0.663333,
          pressure: 88.7195,
          inflow: 0,
          outflow: 82.0779
        },
        {
          phase: 0.666667,
          pressure: 88.4034,
          inflow: 0,
          outflow: 81.768
        },
        {
          phase: 0.67,
          pressure: 88.0885,
          inflow: 0,
          outflow: 81.4594
        },
        {
          phase: 0.673333,
          pressure: 87.7749,
          inflow: 0,
          outflow: 81.1518
        },
        {
          phase: 0.676667,
          pressure: 87.4624,
          inflow: 0,
          outflow: 80.8455
        },
        {
          phase: 0.68,
          pressure: 87.1511,
          inflow: 0,
          outflow: 80.5402
        },
        {
          phase: 0.683333,
          pressure: 86.8409,
          inflow: 0,
          outflow: 80.2362
        },
        {
          phase: 0.686667,
          pressure: 86.5319,
          inflow: 0,
          outflow: 79.9333
        },
        {
          phase: 0.69,
          pressure: 86.2241,
          inflow: 0,
          outflow: 79.6315
        },
        {
          phase: 0.693333,
          pressure: 85.9175,
          inflow: 0,
          outflow: 79.3309
        },
        {
          phase: 0.696667,
          pressure: 85.612,
          inflow: 0,
          outflow: 79.0314
        },
        {
          phase: 0.7,
          pressure: 85.3077,
          inflow: 0,
          outflow: 78.733
        },
        {
          phase: 0.703333,
          pressure: 85.0045,
          inflow: 0,
          outflow: 78.4358
        },
        {
          phase: 0.706667,
          pressure: 84.7025,
          inflow: 0,
          outflow: 78.1397
        },
        {
          phase: 0.71,
          pressure: 84.4016,
          inflow: 0,
          outflow: 77.8447
        },
        {
          phase: 0.713333,
          pressure: 84.1018,
          inflow: 0,
          outflow: 77.5508
        },
        {
          phase: 0.716667,
          pressure: 83.8032,
          inflow: 0,
          outflow: 77.258
        },
        {
          phase: 0.72,
          pressure: 83.5057,
          inflow: 0,
          outflow: 76.9664
        },
        {
          phase: 0.723333,
          pressure: 83.2093,
          inflow: 0,
          outflow: 76.6758
        },
        {
          phase: 0.726667,
          pressure: 82.9141,
          inflow: 0,
          outflow: 76.3863
        },
        {
          phase: 0.73,
          pressure: 82.6199,
          inflow: 0,
          outflow: 76.098
        },
        {
          phase: 0.733333,
          pressure: 82.3269,
          inflow: 0,
          outflow: 75.8107
        },
        {
          phase: 0.736667,
          pressure: 82.035,
          inflow: 0,
          outflow: 75.5245
        },
        {
          phase: 0.74,
          pressure: 81.7441,
          inflow: 0,
          outflow: 75.2393
        },
        {
          phase: 0.743333,
          pressure: 81.4544,
          inflow: 0,
          outflow: 74.9553
        },
        {
          phase: 0.746667,
          pressure: 81.1658,
          inflow: 0,
          outflow: 74.6723
        },
        {
          phase: 0.75,
          pressure: 80.8782,
          inflow: 0,
          outflow: 74.3904
        },
        {
          phase: 0.753333,
          pressure: 80.5918,
          inflow: 0,
          outflow: 74.1096
        },
        {
          phase: 0.756667,
          pressure: 80.3064,
          inflow: 0,
          outflow: 73.8298
        },
        {
          phase: 0.76,
          pressure: 80.0221,
          inflow: 0,
          outflow: 73.5511
        },
        {
          phase: 0.763333,
          pressure: 79.7389,
          inflow: 0,
          outflow: 73.2734
        },
        {
          phase: 0.766667,
          pressure: 79.4567,
          inflow: 0,
          outflow: 72.9968
        },
        {
          phase: 0.77,
          pressure: 79.1756,
          inflow: 0,
          outflow: 72.7212
        },
        {
          phase: 0.773333,
          pressure: 78.8956,
          inflow: 0,
          outflow: 72.4467
        },
        {
          phase: 0.776667,
          pressure: 78.6166,
          inflow: 0,
          outflow: 72.1731
        },
        {
          phase: 0.78,
          pressure: 78.3387,
          inflow: 0,
          outflow: 71.9007
        },
        {
          phase: 0.783333,
          pressure: 78.0618,
          inflow: 0,
          outflow: 71.6292
        },
        {
          phase: 0.786667,
          pressure: 77.786,
          inflow: 0,
          outflow: 71.3588
        },
        {
          phase: 0.79,
          pressure: 77.5112,
          inflow: 0,
          outflow: 71.0894
        },
        {
          phase: 0.793333,
          pressure: 77.2375,
          inflow: 0,
          outflow: 70.821
        },
        {
          phase: 0.796667,
          pressure: 76.9648,
          inflow: 0,
          outflow: 70.5537
        },
        {
          phase: 0.8,
          pressure: 76.6931,
          inflow: 0,
          outflow: 70.2873
        },
        {
          phase: 0.803333,
          pressure: 76.4224,
          inflow: 0,
          outflow: 70.022
        },
        {
          phase: 0.806667,
          pressure: 76.1528,
          inflow: 0,
          outflow: 69.7576
        },
        {
          phase: 0.81,
          pressure: 75.8842,
          inflow: 0,
          outflow: 69.4943
        },
        {
          phase: 0.813333,
          pressure: 75.6166,
          inflow: 0,
          outflow: 69.2319
        },
        {
          phase: 0.816667,
          pressure: 75.35,
          inflow: 0,
          outflow: 68.9705
        },
        {
          phase: 0.82,
          pressure: 75.0844,
          inflow: 0,
          outflow: 68.7102
        },
        {
          phase: 0.823333,
          pressure: 74.8198,
          inflow: 0,
          outflow: 68.4508
        },
        {
          phase: 0.826667,
          pressure: 74.5562,
          inflow: 0,
          outflow: 68.1924
        },
        {
          phase: 0.83,
          pressure: 74.2936,
          inflow: 0,
          outflow: 67.9349
        },
        {
          phase: 0.833333,
          pressure: 74.032,
          inflow: 0,
          outflow: 67.6784
        },
        {
          phase: 0.836667,
          pressure: 73.7714,
          inflow: 0,
          outflow: 67.4229
        },
        {
          phase: 0.84,
          pressure: 73.5118,
          inflow: 0,
          outflow: 67.1684
        },
        {
          phase: 0.843333,
          pressure: 73.2531,
          inflow: 0,
          outflow: 66.9148
        },
        {
          phase: 0.846667,
          pressure: 72.9954,
          inflow: 0,
          outflow: 66.6622
        },
        {
          phase: 0.85,
          pressure: 72.7388,
          inflow: 0,
          outflow: 66.4105
        },
        {
          phase: 0.853333,
          pressure: 72.483,
          inflow: 0,
          outflow: 66.1598
        },
        {
          phase: 0.856667,
          pressure: 72.2283,
          inflow: 0,
          outflow: 65.9101
        },
        {
          phase: 0.86,
          pressure: 71.9745,
          inflow: 0,
          outflow: 65.6612
        },
        {
          phase: 0.863333,
          pressure: 71.7216,
          inflow: 0,
          outflow: 65.4133
        },
        {
          phase: 0.866667,
          pressure: 71.4697,
          inflow: 0,
          outflow: 65.1664
        },
        {
          phase: 0.87,
          pressure: 71.2188,
          inflow: 0,
          outflow: 64.9204
        },
        {
          phase: 0.873333,
          pressure: 70.9688,
          inflow: 0,
          outflow: 64.6753
        },
        {
          phase: 0.876667,
          pressure: 70.7197,
          inflow: 0,
          outflow: 64.4311
        },
        {
          phase: 0.88,
          pressure: 70.4716,
          inflow: 0,
          outflow: 64.1879
        },
        {
          phase: 0.883333,
          pressure: 70.2245,
          inflow: 0,
          outflow: 63.9456
        },
        {
          phase: 0.886667,
          pressure: 69.9782,
          inflow: 0,
          outflow: 63.7041
        },
        {
          phase: 0.89,
          pressure: 69.7329,
          inflow: 0,
          outflow: 63.4636
        },
        {
          phase: 0.893333,
          pressure: 69.4885,
          inflow: 0,
          outflow: 63.2241
        },
        {
          phase: 0.896667,
          pressure: 69.2451,
          inflow: 0,
          outflow: 62.9854
        },
        {
          phase: 0.9,
          pressure: 69.0025,
          inflow: 0,
          outflow: 62.7476
        },
        {
          phase: 0.903333,
          pressure: 68.7609,
          inflow: 0,
          outflow: 62.5107
        },
        {
          phase: 0.906667,
          pressure: 68.5202,
          inflow: 0,
          outflow: 62.2747
        },
        {
          phase: 0.91,
          pressure: 68.2804,
          inflow: 0,
          outflow: 62.0396
        },
        {
          phase: 0.913333,
          pressure: 68.0415,
          inflow: 0,
          outflow: 61.8054
        },
        {
          phase: 0.916667,
          pressure: 67.8035,
          inflow: 0,
          outflow: 61.5721
        },
        {
          phase: 0.92,
          pressure: 67.5664,
          inflow: 0,
          outflow: 61.3396
        },
        {
          phase: 0.923333,
          pressure: 67.3302,
          inflow: 0,
          outflow: 61.108
        },
        {
          phase: 0.926667,
          pressure: 67.0949,
          inflow: 0,
          outflow: 60.8773
        },
        {
          phase: 0.93,
          pressure: 66.8605,
          inflow: 0,
          outflow: 60.6475
        },
        {
          phase: 0.933333,
          pressure: 66.6269,
          inflow: 0,
          outflow: 60.4186
        },
        {
          phase: 0.936667,
          pressure: 66.3943,
          inflow: 0,
          outflow: 60.1905
        },
        {
          phase: 0.94,
          pressure: 66.1625,
          inflow: 0,
          outflow: 59.9632
        },
        {
          phase: 0.943333,
          pressure: 65.9316,
          inflow: 0,
          outflow: 59.7369
        },
        {
          phase: 0.946667,
          pressure: 65.7016,
          inflow: 0,
          outflow: 59.5113
        },
        {
          phase: 0.95,
          pressure: 65.4724,
          inflow: 0,
          outflow: 59.2867
        },
        {
          phase: 0.953333,
          pressure: 65.2441,
          inflow: 0,
          outflow: 59.0628
        },
        {
          phase: 0.956667,
          pressure: 65.0167,
          inflow: 0,
          outflow: 58.8399
        },
        {
          phase: 0.96,
          pressure: 64.7901,
          inflow: 0,
          outflow: 58.6177
        },
        {
          phase: 0.963333,
          pressure: 64.5644,
          inflow: 0,
          outflow: 58.3964
        },
        {
          phase: 0.966667,
          pressure: 64.3395,
          inflow: 0,
          outflow: 58.176
        },
        {
          phase: 0.97,
          pressure: 64.1155,
          inflow: 0,
          outflow: 57.9564
        },
        {
          phase: 0.973333,
          pressure: 63.8923,
          inflow: 0,
          outflow: 57.7376
        },
        {
          phase: 0.976667,
          pressure: 63.67,
          inflow: 0,
          outflow: 57.5196
        },
        {
          phase: 0.98,
          pressure: 63.4485,
          inflow: 0,
          outflow: 57.3024
        },
        {
          phase: 0.983333,
          pressure: 63.2278,
          inflow: 0,
          outflow: 57.0861
        },
        {
          phase: 0.986667,
          pressure: 63.008,
          inflow: 0,
          outflow: 56.8706
        },
        {
          phase: 0.99,
          pressure: 62.789,
          inflow: 0,
          outflow: 56.6559
        },
        {
          phase: 0.993333,
          pressure: 62.5708,
          inflow: 0,
          outflow: 56.442
        },
        {
          phase: 0.996667,
          pressure: 62.3535,
          inflow: 0,
          outflow: 56.2289
        },
        {
          phase: 1,
          pressure: 62.137,
          inflow: 0,
          outflow: 56.0166
        }
      ],
      systolic: 124.14,
      diastolic: 61.54,
      mean: 90.68,
      pulsePressure: 62.6,
      cycleVolumeResidualMl: -0.0013033735641971589
    }
  },
  radiusExperiment: {
    assumptions: "Ideal steady laminar rigid cylinder; fixed length and viscosity",
    radiusRatio: [
      1,
      0.9,
      0.8,
      0.7
    ],
    resistanceRatio: [
      1,
      1.5242,
      2.4414,
      4.1649
    ]
  },
  software: {
    numpy: "2.4.4",
    scipy: "1.17.1"
  }
};

// src/V5CardioDetail.ts
var V3 = (x = 0, y = 0, z = 0) => new T5.Vector3(x, y, z);
var clamp3 = (x) => Math.max(0, Math.min(1, x));
var ease2 = (x) => {
  const q = clamp3(x);
  return q * q * q * (q * (q * 6 - 15) + 10);
};
var phase2 = (x) => (x % 1 + 1) % 1;
var TAU2 = Math.PI * 2;
var ramp = (p, a, b) => ease2((p - a) / (b - a));
var C = { wall: "#b7756d", inner: "#dba796", teal: "#377f7d", gold: "#bd9c59", red: "#a94e46", ink: "#466f73", tissue: "#c9af9b" };
function mat2(color, opacity2 = 1, roughness = 0.52) {
  const m = new T5.MeshStandardMaterial({ color, roughness, metalness: 0.025, transparent: true, opacity: opacity2, depthWrite: false, side: T5.DoubleSide });
  m.userData.baseAlpha = opacity2;
  return m;
}
function ball(radius, color, alpha = 1, detail = 20) {
  return new T5.Mesh(new T5.SphereGeometry(radius, detail, Math.max(12, Math.round(detail * 0.65))), mat2(color, alpha));
}
function tube2(points, radius, color, alpha = 1, segments = 72) {
  const unit = Math.max(radius, ...points.map((p) => p.length()), 1e-12), curve = new T5.CatmullRomCurve3(points.map((p) => p.clone().divideScalar(unit)), false, "catmullrom", 0.5);
  const geometry = new T5.TubeGeometry(curve, segments, radius / unit, 12, false);
  geometry.scale(unit, unit, unit);
  return new T5.Mesh(geometry, mat2(color, alpha));
}
function opacity(object, value) {
  object.traverse((o) => {
    if (o instanceof T5.Mesh || o instanceof T5.Line) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.opacity = (m.userData.baseAlpha ?? 1) * clamp3(value);
    }
  });
}
function attach(parent, object, name, position) {
  object.name = name;
  if (position) object.position.copy(position);
  parent.add(object);
  return object;
}
function redCell(radius) {
  const profile = [[0, 0.12], [0.25, 0.17], [0.56, 0.28], [0.84, 0.23], [1, 0], [0.84, -0.23], [0.56, -0.28], [0.25, -0.17], [0, -0.12]];
  return new T5.Mesh(new T5.LatheGeometry(profile.map(([r, y]) => new T5.Vector2(r * radius, y * radius)), 24), mat2(C.red));
}
var CARDIO_SCALE = { arteryLumenDiameter: 0.01, arterioleLumenDiameter: 2e-4, redCellDiameter: 75e-7, vldlDiameter: 5e-8, ldlDiameter: 22e-9, glomerulusDiameter: 2e-4, nephronSegmentExtent: 24e-4 };
var V5CardioDetail = class {
  root = new T5.Group();
  arteryRoot = new T5.Group();
  arterioleRoot = new T5.Group();
  lipidRoot = new T5.Group();
  lipidWallRoot = new T5.Group();
  nephronRoot = new T5.Group();
  arteriole = new ArterioleDetail();
  weights = { artery: 0, arteriole: 0, lipid: 0, nephron: 0, lipidWall: 0 };
  arteryShellWeight = 1;
  arterialPressure = 90;
  shell = [];
  shellBases = [];
  pressureArrows = [];
  flow;
  dummy = new T5.Object3D();
  particle = new T5.Group();
  lipidCore;
  lipidShell;
  lipidProtein;
  cargo = [];
  receptor = new T5.Group();
  receptorArms = [];
  vesicle;
  membrane;
  lipidPath;
  lipidRadius = 25e-9;
  plaqueRoot = new T5.Group();
  plaqueCore;
  plaqueCap;
  thrombus;
  rupture;
  foam = [];
  retained;
  platelets;
  fibrin;
  nephronCurve;
  nephronBlood;
  filtrate;
  renalCells = [];
  transfers;
  corpuscle = new T5.Group();
  tubuleRoot = new T5.Group();
  lastMode = "pressure";
  crossing = [];
  crossingVesicles = [];
  calciumSignals = [];
  urinarySignals = [];
  recruitedReceptors = [];
  constructor() {
    this.root.name = "cardiometabolic-mechanisms-in-physical-metres";
    this.arteryRoot.name = "arterial-wall-10mm-lumen";
    this.arterioleRoot.name = "arteriole-200um-lumen";
    this.lipidRoot.name = "lipoprotein-50nm-to-22nm";
    this.nephronRoot.name = "nephron-segment-2mm";
    this.root.add(this.arteryRoot, this.arterioleRoot, this.lipidRoot, this.nephronRoot, this.lipidWallRoot);
    this.arterioleRoot.add(this.arteriole.root);
    this.lipidWallRoot.name = "LDL-endothelial-transport-and-retention-microscopic-fragment";
    this.arteryRoot.userData = { units: "metres", lumenDiameter: CARDIO_SCALE.arteryLumenDiameter };
    this.arterioleRoot.userData = { units: "metres", lumenDiameter: CARDIO_SCALE.arterioleLumenDiameter };
    this.lipidRoot.userData = { units: "metres", vldlDiameter: 5e-8, ldlDiameter: 22e-9, context: "Membrane fragment; no complete hepatocyte at nanometre scale." };
    this.nephronRoot.userData = { units: "metres", representative: true, context: "Schematic cortical nephron segment, not a patient reconstruction." };
    this.buildArtery();
    this.flow = new T5.InstancedMesh(new T5.SphereGeometry(75e-6, 10, 7), mat2("#337e81", 0.76), 64);
    this.flow.name = "flow-markers-not-blood-cell-size";
    this.flow.frustumCulled = false;
    this.arteryRoot.add(this.flow);
    const lipid = this.buildLipid();
    this.lipidCore = lipid.core;
    this.lipidShell = lipid.shell;
    this.lipidProtein = lipid.protein;
    this.vesicle = lipid.vesicle;
    this.membrane = lipid.membrane;
    this.lipidPath = lipid.path;
    const plaque = this.buildPlaque();
    this.plaqueCore = plaque.core;
    this.plaqueCap = plaque.cap;
    this.thrombus = plaque.thrombus;
    this.rupture = plaque.rupture;
    this.retained = plaque.retained;
    this.platelets = plaque.platelets;
    this.fibrin = plaque.fibrin;
    const renal = this.buildNephron();
    this.nephronCurve = renal.curve;
    this.nephronBlood = renal.blood;
    this.filtrate = renal.filtrate;
    this.transfers = renal.transfers;
    this.buildLipidWall();
    for (let i = 0; i < 12; i++) {
      const signal = new T5.Mesh(new T5.ConeGeometry(5e-6, 18e-6, 12), mat2("#b08d53", 0.88));
      signal.rotation.z = Math.PI;
      signal.name = "calcium-entry-direction-annotation";
      signal.userData.annotation = true;
      this.arterioleRoot.add(signal);
      this.calciumSignals.push(signal);
    }
    for (let i = 0; i < 24; i++) {
      const signal = ball(25e-7, i % 2 ? "#659a96" : "#c09f63", 0.88, 10);
      signal.name = "water-sodium-excretion-direction-marker";
      signal.userData.annotation = true;
      this.nephronRoot.add(signal);
      this.urinarySignals.push(signal);
    }
    this.root.traverse((o) => {
      if (o instanceof T5.Mesh || o instanceof T5.Line) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.userData.baseAlpha === void 0) m.userData.baseAlpha = m.opacity;
          m.userData.frameAlpha = m.opacity;
        }
      }
    });
    this.update(0, "pressure", 0);
  }
  buildArtery() {
    const length = 0.04, nx = 72, nt = 72, start = Math.PI * 0.91, span = Math.PI * 1.18;
    for (const [inner, outer, color, alpha] of [[5e-3, 514e-5, C.inner, 0.87], [514e-5, 575e-5, C.wall, 0.82], [575e-5, 61e-4, C.tissue, 0.32]]) {
      const p = [], ix = [];
      for (let side = 0; side < 2; side++) for (let i = 0; i <= nx; i++) for (let j = 0; j <= nt; j++) {
        const theta = start + span * j / nt, r = side ? inner : outer;
        p.push(length * (i / nx - 0.5), r * Math.cos(theta), r * Math.sin(theta));
      }
      const count = (nx + 1) * (nt + 1);
      for (let side = 0; side < 2; side++) for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
        const a = side * count + i * (nt + 1) + j, b = a + 1, c = a + nt + 1, d = c + 1;
        ix.push(...side ? [a, b, c, b, d, c] : [a, c, b, b, c, d]);
      }
      for (const end of [0, nx]) for (let j = 0; j < nt; j++) {
        const a = end * (nt + 1) + j;
        ix.push(a, a + 1, a + count, a + 1, a + count + 1, a + count);
      }
      for (const j of [0, nt]) for (let i = 0; i < nx; i++) {
        const a = i * (nt + 1) + j, b = a + nt + 1;
        ix.push(a, a + count, b, b, a + count, b + count);
      }
      const geo = new T5.BufferGeometry();
      geo.setAttribute("position", new T5.Float32BufferAttribute(p, 3));
      geo.setIndex(ix);
      geo.computeVertexNormals();
      const mesh = attach(this.arteryRoot, new T5.Mesh(geo, mat2(color, alpha)), ["intima", "media", "adventitia"][this.shell.length]);
      this.shell.push(mesh);
      this.shellBases.push(Float32Array.from(p));
    }
    for (const x of [-0.01, 0, 0.01]) for (let i = 0; i < 5; i++) {
      const angle = Math.PI * (0.98 + i * 0.22), root = new T5.Group(), m = mat2(C.teal, 0.85), shaft = new T5.Mesh(new T5.CylinderGeometry(47e-6, 47e-6, 1, 10), m), tip = new T5.Mesh(new T5.ConeGeometry(15e-5, 35e-5, 14), m);
      root.add(shaft, tip);
      root.quaternion.setFromUnitVectors(V3(0, 1, 0), V3(0, Math.cos(angle), Math.sin(angle)));
      root.name = "pressure-normal-to-wall";
      this.arteryRoot.add(root);
      this.pressureArrows.push({ root, shaft, tip, angle, x });
    }
  }
  buildLipid() {
    const shell = attach(this.particle, ball(25e-9, C.gold, 0.39, 36), "phospholipid-monolayer");
    const core = attach(this.particle, ball(2e-8, "#d3b47b", 0.56, 28), "neutral-lipid-core");
    const heads = new T5.InstancedMesh(new T5.SphereGeometry(66e-11, 8, 6), mat2("#bfa779", 0.78), 196);
    for (let i = 0; i < heads.count; i++) {
      const y = 1 - 2 * (i + 0.5) / heads.count, a = i * 2.399963, r = Math.sqrt(1 - y * y);
      this.dummy.position.set(25e-9 * Math.cos(a) * r, 25e-9 * y, 25e-9 * Math.sin(a) * r);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      heads.setMatrixAt(i, this.dummy.matrix);
    }
    attach(this.particle, heads, "surface-phospholipid-heads");
    const protein = attach(this.particle, tube2(Array.from({ length: 141 }, (_, i) => {
      const a = i / 140 * TAU2 * 0.96, b = 0.26 * Math.sin(a * 2);
      return V3(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)).multiplyScalar(26e-9);
    }), 12e-10, C.teal, 0.93, 140), "retained-apoB100-schematic");
    attach(this.lipidRoot, this.particle, "same-lipoprotein-particle");
    const path = new T5.CatmullRomCurve3([V3(-115e-9, 25e-9, 0), V3(-5e-8, 32e-9, 3e-9), V3(5e-9, 28e-9, 0), V3(85e-9, 15e-9, 0)], false, "catmullrom", 0.5);
    for (let i = 0; i < 24; i++) {
      const mesh = attach(this.lipidRoot, ball(16e-10, "#dec593", 0.84, 10), `fatty-acid-cargo-${i}`);
      this.cargo.push({ mesh, seed: i / 24 });
    }
    const membrane = attach(this.lipidRoot, new T5.Mesh(new T5.BoxGeometry(33e-8, 5e-9, 85e-9, 8, 1, 2), mat2("#caa997", 0.44)), "membrane-fragment-5nm-thick", V3(0, -34e-9, -15e-9));
    for (let j = 0; j < 2; j++) for (let i = 0; i < 31; i++) {
      const bead = ball(11e-10, "#b89786", 0.48, 8);
      bead.position.set((i - 15) * 1e-8, -34e-9 + (j ? 2.5 : -2.5) * 1e-9, 27e-9);
      this.lipidRoot.add(bead);
    }
    this.receptor.position.set(85e-9, -29e-9, 0);
    this.receptor.name = "LDL-receptor-schematic";
    this.lipidRoot.add(this.receptor);
    this.receptor.add(tube2([V3(0, -6e-9, 0), V3(0, 0, 0), V3(0, 1e-8, 0)], 1e-9, C.teal, 0.93, 24));
    for (const sign of [-1, 1]) {
      const arm = new T5.Group();
      arm.position.y = 9e-9;
      arm.add(tube2([V3(), V3(sign * 4e-9, 7e-9, 0), V3(sign * 1e-8, 13e-9, 1e-9)], 1e-9, C.teal, 0.93, 24));
      this.receptor.add(arm);
      this.receptorArms.push(arm);
    }
    for (const x of [-105e-9, -4e-8, 25e-9]) {
      const receptor = this.receptor.clone(true);
      receptor.name = "additional-surface-LDL-receptor";
      receptor.traverse((o) => {
        if (o instanceof T5.Mesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      });
      const particle = this.particle.clone(true);
      particle.scale.setScalar(0.44);
      particle.name = "additional-LDL-22nm";
      particle.traverse((o) => {
        if (o instanceof T5.Mesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      });
      this.lipidRoot.add(receptor, particle);
      this.recruitedReceptors.push({ receptor, particle, x });
    }
    const vesicle = attach(this.lipidRoot, ball(2e-8, "#c89f90", 0.25, 28), "receptor-mediated-endocytic-vesicle", V3(85e-9, -52e-9, 0));
    const under = attach(this.lipidRoot, new T5.Mesh(new T5.PlaneGeometry(42e-8, 12e-8), mat2("#d4bbaa", 0.1)), "cytoplasm-fragment", V3(0, -72e-9, -42e-9));
    under.rotation.x = -Math.PI / 2;
    return { core, shell, protein, vesicle, membrane, path };
  }
  buildPlaque() {
    this.plaqueRoot.position.set(2e-3, -46e-4, -18e-4);
    this.plaqueRoot.rotation.x = -0.18;
    this.plaqueRoot.name = "atheroma-in-arterial-intima";
    this.arteryRoot.add(this.plaqueRoot);
    const core = attach(this.plaqueRoot, ball(85e-5, "#bea269", 0.83, 32), "aggregated-lipid-pool");
    core.scale.set(2, 0.34, 0.65);
    const cap = attach(this.plaqueRoot, ball(9e-4, "#dbb7a5", 0.34, 36), "fibrous-cap", V3(0, 24e-5, 0));
    cap.scale.set(2.1, 0.13, 0.68);
    for (let i = 0; i < 48; i++) {
      const root = new T5.Group(), a = i * 2.39996, x = (i % 12 - 5.5) * 16e-5, y = 15e-5 + 28e-6 * Math.sin(a), z = 42e-5 * Math.sin(a);
      root.position.set(x, y, z);
      const cell = attach(root, ball(1e-5, "#c6ac90", 0.44, 24), "macrophage-20um");
      const vertex = cell.geometry.attributes.position;
      for (let j = 0; j < vertex.count; j++) {
        const vx = vertex.getX(j), vy = vertex.getY(j), vz = vertex.getZ(j), q = 1 + 0.035 * Math.sin(vx * 6e5 + i * 0.37) * 0.5 + 0.022 * Math.cos(vz * 9e5);
        vertex.setXYZ(j, vx * q, vy * q, vz * q);
      }
      cell.geometry.computeVertexNormals();
      const nucleus = attach(root, ball(32e-7, "#a396a0", 0.64, 18), "macrophage-nucleus", V3(-3e-6, 2e-6, -3e-6));
      nucleus.scale.set(1.12, 0.82, 0.68);
      const droplets = new T5.InstancedMesh(new T5.SphereGeometry(18e-7, 18, 12), mat2("#d3ba7d", 0.83), 7);
      for (let j = 0; j < 7; j++) {
        const b = j * 2.4;
        this.dummy.position.set(5e-6 * Math.cos(b), 4e-6 * Math.sin(b), 3e-6 * Math.sin(b * 1.5));
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        droplets.setMatrixAt(j, this.dummy.matrix);
      }
      root.add(droplets);
      this.plaqueRoot.add(root);
      this.foam.push({ root, lipid: droplets, index: i });
    }
    const retained = new T5.InstancedMesh(new T5.SphereGeometry(11e-9, 8, 6), mat2(C.gold, 0.9), 90);
    retained.name = "retained-LDL-22nm-physical-size";
    retained.frustumCulled = false;
    this.plaqueRoot.add(retained);
    const rupture = attach(this.plaqueRoot, tube2([V3(-2e-4, 26e-5, 3e-5), V3(0, 28e-5, 8e-5), V3(24e-5, 24e-5, 2e-5)], 14e-6, "#975c50", 0.9, 24), "cap-rupture");
    const thrombus = new T5.Group();
    thrombus.name = "wall-attached-thrombus";
    this.plaqueRoot.add(thrombus);
    const bulk = attach(thrombus, ball(46e-5, "#96574c", 0.88, 56), "contiguous-platelet-fibrin-clot", V3(0, 64e-5, 0));
    bulk.scale.set(1.1, 0.94, 0.69);
    const bp = bulk.geometry.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), q = 1 + 0.055 * Math.sin(x * 16e3 + y * 17e3) * Math.cos(z * 19e3) + 0.035 * Math.sin(y * 33e3 - z * 15e3);
      bp.setXYZ(i, x * q, y * q, z * q);
    }
    bulk.geometry.computeVertexNormals();
    for (let i = 0; i < 48; i++) {
      const a = i * 2.39996, y = (i / 47) ** 0.7 * 7e-4, rr = 43e-5 * Math.sqrt(1 - i / 52);
      const lump = attach(thrombus, ball(85e-6, "#a96759", 0.2, 20), `thrombus-aggregate-texture-${i}`, V3(rr * Math.cos(a), 28e-5 + y, rr * 0.65 * Math.sin(a)));
      lump.scale.set(1, 0.83, 0.74);
    }
    const platelets = new T5.InstancedMesh(new T5.SphereGeometry(15e-7, 10, 8), mat2("#b78d76", 0.95), 65);
    platelets.name = "platelets-3um-physical-size";
    platelets.frustumCulled = false;
    this.plaqueRoot.add(platelets);
    const fibrin = new T5.Group();
    fibrin.name = "fibrin-network-over-thrombus";
    this.plaqueRoot.add(fibrin);
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39996, p0 = V3(48e-5 * Math.cos(a), 3e-4, 35e-5 * Math.sin(a)), p1 = V3(28e-5 * Math.cos(a + 0.9), 85e-5, 2e-4 * Math.sin(a + 0.9)), p2 = V3(42e-5 * Math.cos(a + 1.8), 33e-5, 32e-5 * Math.sin(a + 1.8));
      fibrin.add(tube2([p0, p1, p2], 3e-7, "#d7c4a9", 0.74, 28));
    }
    return { core, cap, thrombus, rupture, retained, platelets, fibrin };
  }
  buildNephron() {
    this.corpuscle.position.set(-65e-5, 55e-5, 0);
    this.corpuscle.name = "renal-corpuscle";
    this.nephronRoot.add(this.corpuscle);
    const capsule = attach(this.corpuscle, ball(125e-6, "#c8ae92", 0.2, 32), "bowman-capsule");
    capsule.scale.set(1, 0.97, 0.92);
    for (let i = 0; i < 7; i++) {
      const rot = new T5.Euler(0.3 + i * 0.31, i * 0.67, 0.2 * i);
      this.corpuscle.add(tube2(Array.from({ length: 65 }, (_, j) => {
        const a = j / 64 * TAU2;
        return V3(92e-6 * Math.cos(a), 9e-5 * Math.sin(a), 16e-6 * Math.sin(a * 3)).applyEuler(rot);
      }), 7e-6, i % 2 ? C.red : "#bb746c", 0.86, 64));
    }
    this.nephronRoot.add(tube2([V3(-11e-4, 65e-5, 0), V3(-88e-5, 67e-5, 0), V3(-71e-5, 62e-5, 0)], 24e-6, C.red, 0.78));
    const points = [V3(-65e-5, 43e-5, 0), V3(-51e-5, 27e-5, 1e-5), V3(-22e-5, 38e-5, 12e-6), V3(-33e-5, 55e-5, 1e-5), V3(-6e-5, 56e-5, 0), V3(7e-5, 3e-4, 0), V3(-4e-5, -32e-5, 0), V3(8e-5, -7e-4, 0), V3(31e-5, -61e-5, 0), V3(36e-5, -6e-5, 0), V3(4e-4, 33e-5, 0), V3(62e-5, 41e-5, 0), V3(78e-5, 25e-5, 0), V3(1e-3, 29e-5, 0)];
    const curve = new T5.CatmullRomCurve3(points);
    this.tubuleRoot.name = "nephron-tubule-and-collecting-duct";
    this.nephronRoot.add(this.tubuleRoot);
    attach(this.tubuleRoot, new T5.Mesh(new T5.TubeGeometry(curve, 260, 32e-6, 20, false), mat2("#c5b197", 0.24)), "tubular-epithelial-wall");
    attach(this.tubuleRoot, new T5.Mesh(new T5.TubeGeometry(curve, 260, 23e-6, 18, false), mat2("#82b1a6", 0.27)), "tubular-lumen-filtrate");
    this.nephronRoot.add(tube2([V3(1e-3, 7e-4, 0), V3(1e-3, 28e-5, 0), V3(1e-3, -78e-5, 0)], 42e-6, "#739d95", 0.37));
    for (let i = 0; i < 48; i++) {
      const p = curve.getPoint((i + 0.5) / 48), n = V3(0, 0, 1);
      p.addScaledVector(n, 32e-6);
      const nucleus = ball(4e-6, "#9c9b89", 0.63, 10);
      nucleus.position.copy(p);
      this.tubuleRoot.add(nucleus);
    }
    const blood = new T5.CatmullRomCurve3([V3(-57e-5, 63e-5, -65e-6), V3(-21e-5, 75e-5, -55e-6), V3(36e-5, 65e-5, -65e-6), V3(8e-4, 8e-5, -75e-6), V3(61e-5, -63e-5, -65e-6), V3(12e-5, -86e-5, -55e-6), V3(-24e-5, -42e-5, -65e-6)]);
    this.nephronRoot.add(new T5.Mesh(new T5.TubeGeometry(blood, 180, 13e-6, 16, false), mat2("#c99688", 0.31)));
    for (let i = 0; i < 15; i++) {
      const cell = redCell(375e-8);
      cell.name = "renal-blood-cell-not-in-filtrate";
      this.renalCells.push(cell);
      this.nephronRoot.add(cell);
    }
    const filtrate = new T5.InstancedMesh(new T5.SphereGeometry(12e-7, 7, 5), mat2("#709c9a", 0.76), 70);
    filtrate.name = "filtrate-transport-markers-not-molecule-size";
    filtrate.frustumCulled = false;
    this.nephronRoot.add(filtrate);
    const transfers = new T5.InstancedMesh(new T5.SphereGeometry(14e-7, 7, 5), mat2("#93ad99", 0.88), 18);
    transfers.name = "water-sodium-reabsorption-direction-markers";
    transfers.frustumCulled = false;
    this.nephronRoot.add(transfers);
    return { curve, blood, filtrate, transfers };
  }
  buildLipidWall() {
    const patch = (name, y, thickness, color, alpha) => attach(this.lipidWallRoot, new T5.Mesh(new T5.BoxGeometry(12e-7, thickness, 42e-8, 16, 1, 4), mat2(color, alpha)), name, V3(0, y, -7e-8));
    patch("luminal-endothelial-membrane", 125e-9, 5e-9, "#b7897f", 0.41);
    patch("endothelial-cytoplasm-fragment", 0, 245e-9, "#d7afa1", 0.13);
    patch("basal-endothelial-membrane", -125e-9, 5e-9, "#ba9486", 0.3);
    patch("subendothelial-matrix-fragment", -23e-8, 15e-8, "#d5c4a6", 0.12);
    for (let i = 0; i < 18; i++) {
      const y = -165e-9 - i % 5 * 21e-9, z = -1e-7 + i % 4 * 55e-9;
      const points = Array.from({ length: 30 }, (_, j) => {
        const x = -57e-8 + j / 29 * 114e-8;
        return V3(x, y + 8e-9 * Math.sin(j * 0.5 + i), z + 8e-9 * Math.cos(j * 0.5 + i));
      });
      this.lipidWallRoot.add(tube2(points, 16e-10, "#9caaa0", 0.5, 36));
    }
    for (let i = 0; i < 9; i++) {
      const g = new T5.Group();
      g.name = `LDL-22nm-transcytosis-${i}`;
      g.add(ball(11e-9, "#d1b274", 0.73, 20));
      g.add(tube2(Array.from({ length: 49 }, (_, j) => {
        const a = j / 48 * TAU2 * 0.93;
        return V3(Math.cos(a) * 118e-10, 3e-9 * Math.sin(a * 2), Math.sin(a) * 118e-10);
      }), 9e-10, C.teal, 0.86, 48));
      this.lipidWallRoot.add(g);
      this.crossing.push(g);
      const vesicle = attach(this.lipidWallRoot, ball(2e-8, "#ba978b", 0.23, 20), `transport-vesicle-${i}`);
      this.crossingVesicles.push(vesicle);
    }
    this.lipidWallRoot.userData = { units: "metres", particleDiameter: 22e-9, fragmentWidth: 12e-7, representation: "Local endothelial transport and subendothelial retention mechanism; not all entry pathways or an individual scan." };
  }
  /** Sets opacity multipliers without changing positions or physical sizes. */
  setVisibility(weights) {
    this.weights = { ...this.weights, ...weights };
    this.applyVisibility();
  }
  /** Fade the large wall as the lens enters it, preserving the anchored plaque. */
  setArteryShellVisibility(weight) {
    this.arteryShellWeight = clamp3(weight);
    this.applyVisibility();
  }
  applyVisibility() {
    for (const [key, root] of Object.entries({ artery: this.arteryRoot, arteriole: this.arterioleRoot, lipid: this.lipidRoot, nephron: this.nephronRoot, lipidWall: this.lipidWallRoot })) {
      const q = clamp3(this.weights[key]);
      root.visible = q > 1e-6;
      root.traverse((o) => {
        if (o instanceof T5.Mesh || o instanceof T5.Line) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.opacity = (m.userData.frameAlpha ?? m.userData.baseAlpha ?? 1) * q;
      });
    }
    for (const object of [...this.shell, this.flow, ...this.pressureArrows.map((a) => a.root)]) object.traverse((o) => {
      if (o instanceof T5.Mesh || o instanceof T5.Line) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.opacity = (m.userData.frameAlpha ?? m.userData.baseAlpha ?? 1) * this.weights.artery * this.arteryShellWeight;
    });
  }
  updateState(s) {
    this.update(s.time, s.view, s.progress);
  }
  update(time, mode, progress, treatment = "", treatmentProgress = 0) {
    const p = clamp3(progress);
    this.lastMode = mode;
    this.root.traverse((o) => {
      if (o instanceof T5.Mesh || o instanceof T5.Line) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.opacity = m.userData.baseAlpha ?? 1;
    });
    const stiff = mode === "pressure" ? ramp(p, 0.56, 0.93) : 0, base = physics_default.cases.baseline, hard = physics_default.cases.stiffer_artery;
    const sample = (c) => {
      const k = phase2(time / c.period) * (c.samples.length - 1), i = Math.floor(k), q = k - i;
      return c.samples[i].pressure * (1 - q) + c.samples[Math.min(i + 1, c.samples.length - 1)].pressure * q;
    };
    const baselinePressure = sample(base);
    this.arterialPressure = baselinePressure * (1 - stiff) + sample(hard) * stiff;
    const beat = clamp3((baselinePressure - base.diastolic) / (base.systolic - base.diastolic)), expand = 1 + (0.04 * (1 - stiff) + 9e-3 * stiff) * beat;
    this.shell.forEach((mesh, index) => {
      const a = mesh.geometry.attributes.position, b = this.shellBases[index];
      for (let i = 0; i < a.count; i++) {
        a.setXYZ(i, b[i * 3], b[i * 3 + 1] * expand, b[i * 3 + 2] * expand);
      }
      a.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    });
    for (const a of this.pressureArrows) {
      const length = 5e-4 + 9e-4 * beat * (1 + 0.4 * stiff);
      a.root.position.set(a.x, 36e-4 * Math.cos(a.angle) * expand, 36e-4 * Math.sin(a.angle) * expand);
      a.shaft.scale.y = length;
      a.shaft.position.y = length * 0.5;
      a.tip.position.y = length + 14e-5;
      opacity(a.root, mode === "pressure" ? 1 : 0);
    }
    for (let i = 0; i < this.flow.count; i++) {
      const u = phase2(time * 0.065 + i / this.flow.count), angle = i * 2.4, rr = 28e-4 * Math.sqrt(phase2(i * 0.618 + 0.14)), edge = ease2(Math.min(u, 1 - u) / 0.08);
      this.dummy.position.set(-0.02 + 0.04 * u, rr * Math.cos(angle), rr * Math.sin(angle));
      this.dummy.rotation.set(0, 0, Math.PI / 2);
      this.dummy.scale.set(0.55 * edge, 4 * edge, 0.55 * edge);
      this.dummy.updateMatrix();
      this.flow.setMatrixAt(i, this.dummy.matrix);
    }
    this.flow.instanceMatrix.needsUpdate = true;
    opacity(this.flow, mode === "pressure" ? 1 : 0);
    const relax = ["ccb", "arb"].includes(treatment) ? ramp(treatmentProgress, 0.12, 0.78) : 0;
    const contract = mode === "resistance" ? 0.6 * (1 - 0.78 * relax) : mode === "renal" ? 0.3 * ramp(p, 0.2, 0.75) : 0;
    this.arteriole.update({ time, activation: 1, constriction: contract, pressure: 0.25 + 0.65 * contract, pulse: beat, flowPhase: time * 0.041 });
    this.updateLipid(time, mode === "clearance" ? 1 : p, mode === "clearance" ? p : 0);
    this.recruitedReceptors.forEach(({ receptor, particle, x }, i) => {
      const shown = treatment === "statin_receptor" ? ramp(treatmentProgress, 0.13 + i * 0.07, 0.45 + i * 0.07) : 0;
      const uptake = ramp(treatmentProgress, 0.48 + i * 0.055, 0.89 + i * 0.02);
      receptor.position.set(x, -47e-9 + 18e-9 * shown, -5e-9);
      particle.position.set(x - 23e-9 * (1 - uptake), 37e-9 - 88e-9 * uptake, -5e-9);
      particle.rotation.y = time * 0.16 + i;
      opacity(receptor, shown);
      opacity(particle, shown);
    });
    const plaqueP = mode === "plaque" ? p : mode === "thrombus" ? 1 : mode === "lipid_wall" ? 0.28 + 0.45 * p : 0, clotP = mode === "thrombus" ? p : 0;
    this.updatePlaque(time, plaqueP, clotP);
    if (mode === "lipid_wall") {
      opacity(this.plaqueCore, 0);
      opacity(this.plaqueCap, 0);
    }
    this.updateRenal(time, p, mode === "salt", treatment === "diuretic" ? ramp(treatmentProgress, 0.08, 0.74) : 0);
    this.calciumSignals.forEach((signal, i) => {
      const q = phase2(time * 0.16 + i / 12), stop = treatment === "ccb" ? ramp(treatmentProgress, 0.12, 0.75) : 0;
      signal.position.set((i % 6 - 2.5) * 17e-5, 29e-5 - q * 16e-5 * (1 - 0.66 * stop), i < 6 ? -2e-5 : 25e-6);
      opacity(signal, treatment === "ccb" ? ease2(Math.min(q, 1 - q) / 0.14) : 0);
    });
    this.urinarySignals.forEach((signal, i) => {
      const q = phase2(time * 0.12 + i / 24), extra = treatment === "diuretic" ? ramp(treatmentProgress, 0.1, 0.7) : 0;
      signal.position.set(1e-3 + 4e-6 * Math.sin(i * 2.4), 65e-5 - 143e-5 * q, 8e-6 * Math.cos(i * 2.4));
      opacity(signal, mode === "renal" || mode === "salt" ? (0.22 + 0.78 * extra) * ease2(Math.min(q, 1 - q) / 0.07) : 0);
    });
    this.crossing.forEach((g, i) => {
      const q = clamp3((p - i * 0.035) / 0.68), enter = ramp(q, 0.12, 0.75), x = (-0.38 + 0.09 * i) * 1e-6;
      g.position.set(x + 24e-9 * Math.sin(q * Math.PI), 22e-8 - 43e-8 * enter, (i % 3 - 1) * 65e-9 + 12e-8);
      g.rotation.set(0.1, time * 0.13, 0.15);
      const vesicle = this.crossingVesicles[i];
      vesicle.position.copy(g.position);
      opacity(vesicle, ramp(q, 0.1, 0.28) * (1 - ramp(q, 0.67, 0.85)));
    });
    this.root.traverse((o) => {
      if (o instanceof T5.Mesh || o instanceof T5.Line) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.userData.frameAlpha = m.opacity;
    });
    this.applyVisibility();
  }
  updateLipid(time, p, clearance) {
    const idl = ramp(p, 0.24, 0.61), ldl = ramp(p, 0.61, 0.96), size = 1 - 0.28 * idl - 0.28 * ldl, bind = ramp(clearance, 0.05, 0.44), internalize = ramp(clearance, 0.43, 0.91);
    this.lipidRadius = 25e-9 * size;
    this.particle.scale.setScalar(size);
    this.particle.position.copy(this.lipidPath.getPoint(0.03 + 0.93 * ease2(p))).lerp(V3(85e-9, -2e-9, 0), bind);
    this.particle.position.y -= 6e-8 * internalize;
    this.particle.rotation.set(0.16, time * 0.2, 0.08 * Math.sin(time * 0.19));
    opacity(this.lipidCore, 0.86);
    opacity(this.lipidShell, 0.88);
    opacity(this.lipidProtein, 1);
    this.cargo.forEach(({ mesh, seed }, i) => {
      const begin = 0.15 + seed * 0.47, q = clamp3((p - begin) / 0.25), start = this.lipidPath.getPoint(0.03 + 0.93 * ease2(begin)).add(V3(15e-9 * Math.cos(i * 2.4), 5e-9, 15e-9 * Math.sin(i * 2.4))), end = V3(-55e-9 + seed * 1e-7, -28e-9, 18e-9);
      mesh.position.copy(start).lerp(end, ease2(q));
      mesh.position.z += 7e-9 * Math.sin(q * Math.PI);
      opacity(mesh, ramp(p, begin, begin + 0.07) * (1 - ramp(q, 0.73, 1)) * (1 - clearance));
    });
    this.receptor.position.y = -29e-9 - 13e-9 * internalize + 13e-9 * ramp(clearance, 0.83, 1);
    this.receptorArms.forEach((arm, i) => arm.rotation.z = (i ? 1 : -1) * 0.26 * bind * (1 - 0.8 * ramp(clearance, 0.82, 1)));
    this.vesicle.position.set(85e-9, -35e-9 - 24e-9 * internalize, 0);
    opacity(this.vesicle, ramp(clearance, 0.33, 0.69));
    this.vesicle.scale.set(1, 0.75 + 0.25 * internalize, 1);
    opacity(this.membrane, 1 - 0.46 * internalize);
  }
  updatePlaque(time, p, clot) {
    const aggregate = ramp(p, 0.28, 0.94), rupture = ramp(clot, 0.12, 0.39), growth = ramp(clot, 0.31, 0.95);
    opacity(this.plaqueCore, aggregate);
    this.plaqueCore.scale.set(2 * Math.max(2e-3, aggregate), 0.34 * Math.max(2e-3, aggregate), 0.65 * Math.max(2e-3, aggregate));
    opacity(this.plaqueCap, aggregate);
    this.plaqueCap.scale.set(2.1 * Math.max(2e-3, aggregate), 0.13, 0.68 * Math.max(2e-3, aggregate));
    this.foam.forEach(({ root, lipid, index }) => {
      const q = ramp(p, 0.08 + index * 3e-3, 0.44 + index * 3e-3);
      opacity(root, q);
      opacity(lipid, q * ramp(p, 0.24, 0.62));
      lipid.scale.setScalar(0.2 + 0.8 * ramp(p, 0.2, 0.73));
    });
    for (let i = 0; i < this.retained.count; i++) {
      const u = phase2(time * 0.036 + i * 0.618), a = i * 2.39996;
      this.dummy.position.set((phase2(i * 0.73) - 0.5) * 25e-4, 22e-5 + 2e-5 * Math.sin(a), 42e-5 * Math.sin(a));
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.retained.setMatrixAt(i, this.dummy.matrix);
    }
    this.retained.instanceMatrix.needsUpdate = true;
    opacity(this.retained, ramp(p, 0, 0.38));
    opacity(this.rupture, rupture);
    opacity(this.thrombus, growth);
    this.thrombus.scale.set(1, Math.max(2e-3, growth), 1);
    opacity(this.fibrin, growth);
    for (let i = 0; i < this.platelets.count; i++) {
      const u = phase2(time * 0.028 + i / this.platelets.count), q = ramp(clot, 0.1, 0.65), start = V3(-3e-3 + 6e-3 * u, 7e-4 + 2e-4 * Math.sin(i), 45e-5 * Math.sin(i * 2.4)), end = V3(36e-5 * Math.cos(i * 2.4), 32e-5 + 27e-5 * phase2(i * 0.37), 2e-4 * Math.sin(i * 2.4));
      this.dummy.position.copy(start).lerp(end, q);
      this.dummy.rotation.set(0.3, time * 0.07, 0);
      this.dummy.scale.set(1, 0.4, 1);
      this.dummy.updateMatrix();
      this.platelets.setMatrixAt(i, this.dummy.matrix);
    }
    this.platelets.instanceMatrix.needsUpdate = true;
    opacity(this.platelets, rupture);
  }
  updateRenal(time, p, retention, diuresis = 0) {
    this.renalCells.forEach((cell, i) => {
      const u = phase2(time * 0.09 + i / this.renalCells.length);
      cell.position.copy(this.nephronBlood.getPoint(u));
      cell.quaternion.setFromUnitVectors(V3(0, 1, 0), this.nephronBlood.getTangent(u));
    });
    for (let i = 0; i < this.filtrate.count; i++) {
      const u = phase2(time * 0.045 + i / this.filtrate.count);
      this.dummy.position.copy(this.nephronCurve.getPoint(u));
      this.dummy.position.z += 8e-6 * Math.sin(i * 2.4);
      this.dummy.scale.setScalar(1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.filtrate.setMatrixAt(i, this.dummy.matrix);
    }
    this.filtrate.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.transfers.count; i++) {
      const lane = i % 3, u = phase2(time * (retention ? 0.2 : 0.1) + i / this.transfers.count), a = this.nephronCurve.getPoint([0.29, 0.52, 0.76][lane]), b = this.nephronBlood.getPoint([0.34, 0.77, 0.53][lane]);
      this.dummy.position.copy(a).lerp(b, ease2(u));
      this.dummy.scale.setScalar(ease2(Math.min(u, 1 - u) / 0.12));
      this.dummy.updateMatrix();
      this.transfers.setMatrixAt(i, this.dummy.matrix);
    }
    this.transfers.instanceMatrix.needsUpdate = true;
    opacity(this.transfers, (0.6 + 0.4 * ramp(p, 0.16, 0.56)) * (1 - 0.78 * diuresis));
  }
  point(root, p) {
    root.updateWorldMatrix(true, false);
    return root.localToWorld(p);
  }
  getPhysicalState() {
    return { arterialPressureMmHg: this.arterialPressure, pressureSource: "0D two-element Windkessel teaching model", lipoproteinDiameterMetres: 2 * this.lipidRadius, patientSpecific: false };
  }
  getAnchors() {
    return {
      artery: this.point(this.arteryRoot, V3()),
      arteryWall: this.point(this.arteryRoot, V3(0, -48e-4, -14e-4)),
      arteriole: this.arteriole.focus,
      arterioleWall: this.arteriole.muscleFocus,
      lipid: this.point(this.lipidRoot, V3()),
      lipidParticle: this.particle.getWorldPosition(V3()),
      lipidSource: this.point(this.lipidRoot, V3(-95e-9, 25e-9, 0)),
      lipidClearance: this.point(this.lipidRoot, V3(85e-9, -2e-8, 0)),
      lipidWall: this.point(this.lipidWallRoot, V3()),
      lipidWallMembrane: this.point(this.lipidWallRoot, V3(0, 125e-9, 1e-7)),
      lipidWallRetained: this.point(this.lipidWallRoot, V3(0, -22e-8, 1e-7)),
      nephron: this.point(this.nephronRoot, V3(0, 0, 0)),
      glomerulus: this.corpuscle.getWorldPosition(V3()),
      tubule: this.point(this.nephronRoot, V3(37e-5, 6e-5, 0)),
      plaque: this.plaqueRoot.getWorldPosition(V3()),
      thrombus: this.point(this.plaqueRoot, V3(0, 55e-5, 0)),
      foamCell: this.foam[24].root.getWorldPosition(V3())
    };
  }
  getLabels(mode = this.lastMode) {
    const a = this.getAnchors();
    const label = (text, point, side) => ({ text, point, side });
    if (mode === "pressure") return [label("\u5F39\u6027\u7BA1\u58C1", a.arteryWall, "left"), label("\u8840\u6DB2\u63A8\u5411\u7BA1\u58C1", a.artery, "right")];
    if (mode === "resistance") return [label("\u5C0F\u52A8\u8109", a.arteriole, "right"), label("\u5E73\u6ED1\u808C", a.arterioleWall, "left")];
    if (mode === "salt" || mode === "renal" || mode === "nephron") return [label("\u80BE\u5C0F\u7403", a.glomerulus, "left"), label("\u80BE\u5C0F\u7BA1", a.tubule, "right")];
    if (mode === "lipid") return [label(this.lipidRadius > 19e-9 ? "VLDL \xB7 \u8FD0\u8F93\u8102\u80AA" : this.lipidRadius > 12e-9 ? "IDL \xB7 \u4E2D\u95F4\u9897\u7C92" : "LDL \xB7 \u5BCC\u542B\u80C6\u56FA\u9187", a.lipidParticle, "left")];
    if (mode === "clearance") return [label("LDL", a.lipidParticle, "left"), label("LDL \u53D7\u4F53", a.lipidClearance, "right")];
    if (mode === "lipid_wall") return [label("\u5185\u76AE \xB7 \u8840\u7BA1\u5185\u4FA7", a.lipidWallMembrane, "left"), label("LDL \u6EDE\u7559\u5728\u5185\u819C", a.lipidWallRetained, "right")];
    if (mode === "plaque") return [label("\u8102\u8D28\u79EF\u5728\u7BA1\u58C1\u91CC", a.plaque, "right")];
    return [label("\u6591\u5757\u8868\u9762\u7834\u88C2", a.plaque, "left"), label("\u8840\u6813", a.thrombus, "right")];
  }
  getFoamLabels() {
    const cell = this.foam[24];
    return [{ text: "\u6CE1\u6CAB\u7EC6\u80DE", point: cell.root.getWorldPosition(V3()), side: "left" }, { text: "\u7EC6\u80DE\u5185\u8102\u6EF4", point: this.point(cell.root, V3(5e-6, 0, 3e-6)), side: "right" }];
  }
  dispose() {
    const geometries = /* @__PURE__ */ new Set(), materials = /* @__PURE__ */ new Set();
    this.root.traverse((o) => {
      if (o instanceof T5.Mesh || o instanceof T5.Line) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.root.removeFromParent();
  }
};

// src/V5Person.ts
import * as T6 from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// src/V5PersonWeights.json
var V5PersonWeights_default = { source: "Topology-constrained harmonic skin weights (SciPy), refined after Blender bone-heat preview; same atlas vertex order", vertices: 22902, weights: [{ handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 13e-7, handR: 0.9999987 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 461e-7, handR: 0.9999539 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 63633e-7, handR: 0.9936367 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 61e-7, handR: 0.9999939 }, { handR: 1 }, { forearmR: 0.0287362, handR: 0.9712638 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.025974, handR: 0.974026 }, { forearmR: 0.0436827, handR: 0.9563173 }, { forearmR: 0.0404868, handR: 0.9595132 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0305317, handR: 0.9694683 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 5988e-7, handR: 0.9994012 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0442602, handR: 0.9557398 }, { forearmR: 0.0436915, handR: 0.9563085 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0272616, handR: 0.9727384 }, { forearmR: 0.0412491, handR: 0.9587509 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0310781, handR: 0.9689219 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0221233, handR: 0.9778767 }, { forearmR: 0.0405286, handR: 0.9594714 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0186557, handR: 0.9813443 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0125869, handR: 0.9874131 }, { forearmR: 0.0208375, handR: 0.9791625 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0583633, handR: 0.9416367 }, { handR: 1 }, { forearmR: 0.0606187, handR: 0.9393813 }, { forearmR: 0.0790711, handR: 0.9209289 }, { forearmR: 0.0747901, handR: 0.9252099 }, { forearmR: 0.0697609, handR: 0.9302391 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0419349, handR: 0.9580651 }, { forearmR: 0.0287021, handR: 0.9712979 }, { forearmR: 0.0685623, handR: 0.9314377 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 31109e-7, handR: 0.9968891 }, { handR: 1 }, { forearmR: 0.0112996, handR: 0.9887004 }, { handR: 0.9999999 }, { handR: 0.9999999 }, { handR: 0.9999999 }, { handR: 0.9999998 }, { handR: 0.9999999 }, { handR: 0.9999999 }, { handR: 0.9999998 }, { handR: 0.9999999 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 0.9999998 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 0.9999998 }, { handR: 1 }, { handR: 0.9999999 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0131168, handR: 0.9868832 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0640122, handR: 0.9359878 }, { forearmR: 0.084805, handR: 0.915195 }, { forearmR: 0.0610611, handR: 0.9389389 }, { forearmR: 0.1195276, handR: 0.8804724 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0844007, handR: 0.9155993 }, { forearmR: 0.1044627, handR: 0.8955373 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.1316845, handR: 0.8683155 }, { forearmR: 0.1164879, handR: 0.8835121 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.1094837, handR: 0.8905163 }, { forearmR: 0.0789007, handR: 0.9210993 }, { forearmR: 0.0716732, handR: 0.9283268 }, { forearmR: 0.1648695, handR: 0.8351305 }, { forearmR: 0.0967074, handR: 0.9032926 }, { forearmR: 0.0690018, handR: 0.9309982 }, { forearmR: 0.267168, handR: 0.732832 }, { handR: 1 }, { forearmR: 16789e-7, handR: 0.9983211 }, { forearmR: 32056e-7, handR: 0.9967944 }, { forearmR: 0.0332171, handR: 0.9667829 }, { forearmR: 0.1019354, handR: 0.8980646 }, { handR: 0.9999999 }, { handR: 0.9999999 }, { handR: 0.9999998 }, { handR: 0.9999997 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 0.9999998 }, { handR: 0.9999998 }, { handR: 0.9999997 }, { handR: 0.9999999 }, { handR: 1 }, { handR: 1 }, { handR: 0.9999997 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 0.9999999 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0361936, handR: 0.9638064 }, { forearmR: 0.0646312, handR: 0.9353688 }, { handR: 1 }, { forearmR: 0.0826327, handR: 0.9173673 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.1120179, handR: 0.8879821 }, { forearmR: 0.1157415, handR: 0.8842585 }, { forearmR: 0.1371632, handR: 0.8628368 }, { forearmR: 0.154204, handR: 0.845796 }, { forearmR: 0.3321291, handR: 0.6678709 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.3697629, handR: 0.6302371 }, { forearmR: 0.1935326, handR: 0.8064674 }, { forearmR: 0.2143846, handR: 0.7856154 }, { forearmR: 0.2479351, handR: 0.7520649 }, { forearmR: 0.9597577, handR: 0.0402423 }, { forearmR: 0.9282389, handR: 0.0717611 }, { handR: 1 }, { forearmR: 0.9967319, handR: 32681e-7 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0277125, handR: 0.9722875 }, { forearmR: 0.218205, handR: 0.781795 }, { forearmR: 0.4510932, handR: 0.5489068 }, { forearmR: 0.9557607, handR: 0.0442393 }, { forearmR: 0.9419696, handR: 0.0580304 }, { forearmR: 67719e-7, handR: 0.9932281 }, { handR: 1 }, { forearmR: 29334e-7, handR: 0.9970666 }, { forearmR: 0.0499532, handR: 0.9500468 }, { forearmR: 0.0144899, handR: 0.9855101 }, { forearmR: 0.3342551, handR: 0.6657449 }, { forearmR: 0.4034261, handR: 0.5965739 }, { forearmR: 0.9917004, handR: 82996e-7 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 0.387536, handR: 0.612464 }, { forearmR: 0.918775, handR: 0.081225 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { handR: 0.9999998 }, { handR: 0.9999998 }, { handR: 1 }, { handR: 1 }, { handR: 0.9999999 }, { handR: 0.9999998 }, { handR: 0.9999999 }, { handR: 0.9999998 }, { handR: 1 }, { handR: 1 }, { handR: 0.9999998 }, { handR: 0.9999997 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0215518, handR: 0.9784482 }, { forearmR: 0.0106303, handR: 0.9893697 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0442775, handR: 0.9557225 }, { forearmR: 0.1155178, handR: 0.8844822 }, { forearmR: 0.1153546, handR: 0.8846454 }, { forearmR: 0.4352126, handR: 0.5647874 }, { forearmR: 0.2116808, handR: 0.7883192 }, { forearmR: 0.2820975, handR: 0.7179025 }, { handR: 1 }, { forearmR: 0.8869894, handR: 0.1130106 }, { forearmR: 0.435955, handR: 0.564045 }, { forearmR: 0.7849055, handR: 0.2150945 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.9743479, handR: 0.0256521 }, { forearmR: 0.8817024, handR: 0.1182976 }, { handR: 1 }, { handR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 0.2653666, handR: 0.7346334 }, { forearmR: 0.8812042, handR: 0.1187958 }, { forearmR: 0.9997802, handR: 2198e-7 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 0.7559295, handR: 0.2440705 }, { forearmR: 0.8783939, handR: 0.1216061 }, { forearmR: 0.9986746, handR: 13254e-7 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 10136e-7, forearmR: 0.9989864 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 38902e-7, forearmR: 0.9961098 }, { upperR: 1057e-6, forearmR: 0.998943 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 1158e-7, forearmR: 0.9998842 }, { upperR: 0.3398066, forearmR: 0.6601934 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 51e-7, forearmR: 0.9999949 }, { upperR: 0.0106592, forearmR: 0.9893408 }, { upperR: 0.0121762, forearmR: 0.9878238 }, { upperR: 0.013566, forearmR: 0.986434 }, { upperR: 0.3605973, forearmR: 0.6394027 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 3958e-7, forearmR: 0.9996042 }, { upperR: 0.3661573, forearmR: 0.6338427 }, { upperR: 0.127727, forearmR: 0.872273 }, { forearmR: 1 }, { upperR: 7084e-6, forearmR: 0.992916 }, { upperR: 0.0688239, forearmR: 0.9311761 }, { upperR: 0.0603382, forearmR: 0.9396618 }, { upperR: 0.2089568, forearmR: 0.7910432 }, { forearmR: 1 }, { forearmR: 1 }, { handR: 1 }, { handR: 0.9999999 }, { handR: 0.9999998 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 84509e-7, handR: 0.9915491 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.2271953, handR: 0.7728047 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.2899586, handR: 0.7100414 }, { forearmR: 0.4250031, handR: 0.5749969 }, { forearmR: 0.5331027, handR: 0.4668973 }, { forearmR: 1 }, { forearmR: 0.9996673, handR: 3327e-7 }, { handR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { handR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 8422e-7, handR: 0.9991578 }, { forearmR: 34277e-7, handR: 0.9965723 }, { handR: 1 }, { forearmR: 0.2497557, handR: 0.7502443 }, { forearmR: 0.3128928, handR: 0.6871072 }, { upperR: 5e-7, forearmR: 0.9999995 }, { upperR: 0.1764385, forearmR: 0.8235615 }, { upperR: 0.1556371, forearmR: 0.8443629 }, { forearmR: 0.1284446, handR: 0.8715554 }, { forearmR: 0.6800731, handR: 0.3199269 }, { forearmR: 0.8621276, handR: 0.1378724 }, { upperR: 0.2113299, forearmR: 0.7886701 }, { forearmR: 0.9922084, handR: 77916e-7 }, { upperR: 0.2521917, forearmR: 0.7478083 }, { upperR: 0.4114949, forearmR: 0.5885051 }, { forearmR: 0.9789506, handR: 0.0210494 }, { forearmR: 1 }, { upperR: 0.4867128, forearmR: 0.5132872 }, { upperR: 0.6103539, forearmR: 0.3896461 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.5142707, forearmR: 0.4857293 }, { upperR: 0.550363, forearmR: 0.449637 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.2141594, forearmR: 0.7858406 }, { upperR: 0.27969, forearmR: 0.72031 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.0214745, forearmR: 0.9785255 }, { upperR: 0.4138887, forearmR: 0.5861113 }, { upperR: 0.3575568, forearmR: 0.6424432 }, { upperR: 0.764539, forearmR: 0.235461 }, { upperR: 0.8111919, forearmR: 0.1888081 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.1039832, handR: 0.8960168 }, { forearmR: 0.085261, handR: 0.914739 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.298481, handR: 0.701519 }, { handR: 1 }, { forearmR: 0.3357536, handR: 0.6642464 }, { forearmR: 0.5389341, handR: 0.4610659 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 1 }, { handR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.1102844, forearmR: 0.8897156 }, { upperR: 0.1429543, forearmR: 0.8570457 }, { forearmR: 15656e-7, handR: 0.9984344 }, { forearmR: 17963e-7, handR: 0.9982037 }, { forearmR: 0.0117757, handR: 0.9882243 }, { upperR: 0.3159079, forearmR: 0.6840921 }, { forearmR: 0.5430933, handR: 0.4569067 }, { forearmR: 0.5754009, handR: 0.4245991 }, { upperR: 0.863584, forearmR: 0.136416 }, { forearmR: 0.8701911, handR: 0.1298089 }, { forearmR: 1 }, { upperR: 0.8933077, forearmR: 0.1066923 }, { forearmR: 1 }, { upperR: 0.8369365, forearmR: 0.1630635 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.6908412, forearmR: 0.3091588 }, { forearmR: 1 }, { upperR: 0.0162116, forearmR: 0.9837884 }, { upperR: 0.7693358, forearmR: 0.2306642 }, { upperR: 0.9002576, forearmR: 0.0997424 }, { upperR: 0.9926926, forearmR: 73074e-7 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.0341466, forearmR: 0.9658534 }, { upperR: 0.3100586, forearmR: 0.6899414 }, { upperR: 0.9999413, forearmR: 587e-7 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.031014, handR: 0.968986 }, { forearmR: 0.0342053, handR: 0.9657947 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.2639797, handR: 0.7360203 }, { forearmR: 0.6688139, handR: 0.3311861 }, { forearmR: 1 }, { forearmR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 1 }, { handR: 1 }, { forearmR: 1 }, { handR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.1259714, forearmR: 0.8740286 }, { handR: 1 }, { handR: 1 }, { upperR: 0.0991479, forearmR: 0.9008521 }, { forearmR: 28e-7, handR: 0.9999972 }, { upperR: 0.3582704, forearmR: 0.6417296 }, { forearmR: 0.1045477, handR: 0.8954523 }, { upperR: 0.9923582, forearmR: 76418e-7 }, { forearmR: 0.0865727, handR: 0.9134273 }, { forearmR: 0.7036936, handR: 0.2963064 }, { forearmR: 0.5117787, handR: 0.4882213 }, { forearmR: 0.9876078, handR: 0.0123922 }, { upperR: 0.9894978, forearmR: 0.0105022 }, { forearmR: 0.9999675, handR: 325e-7 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.9916838, forearmR: 83162e-7 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.1734324, forearmR: 0.8265676 }, { upperR: 0.573222, forearmR: 0.426778 }, { upperR: 0.1990061, forearmR: 0.8009939 }, { upperR: 0.587814, forearmR: 0.412186 }, { upperR: 0.9775237, forearmR: 0.0224763 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.8054958, forearmR: 0.1945042 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 591e-7, handR: 0.9999409 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.3167762, handR: 0.6832238 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.5901644, handR: 0.4098356 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 1 }, { upperR: 23125e-7, forearmR: 0.9976875 }, { upperR: 0.0939634, forearmR: 0.9060366 }, { upperR: 0.4831517, forearmR: 0.5168483 }, { forearmR: 5e-7, handR: 0.9999995 }, { handR: 1 }, { forearmR: 22746e-7, handR: 0.9977254 }, { forearmR: 4447e-7, handR: 0.9995553 }, { forearmR: 0.0108244, handR: 0.9891756 }, { upperR: 0.644808, forearmR: 0.355192 }, { upperR: 0.8833274, forearmR: 0.1166726 }, { forearmR: 0.077256, handR: 0.922744 }, { upperR: 0.9553803, forearmR: 0.0446197 }, { forearmR: 0.4076369, handR: 0.5923631 }, { upperR: 0.9184191, forearmR: 0.0815809 }, { upperR: 0.9977096, forearmR: 22904e-7 }, { forearmR: 0.6784323, handR: 0.3215677 }, { upperR: 1 }, { upperR: 0.9997766, forearmR: 2234e-7 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.9985895, forearmR: 14105e-7 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 1 }, { upperR: 56489e-7, forearmR: 0.9943511 }, { upperR: 0.0527664, forearmR: 0.9472336 }, { upperR: 0.6521029, forearmR: 0.3478971 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 88e-7, handR: 0.9999912 }, { forearmR: 0.0232817, handR: 0.9767183 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0819356, handR: 0.9180644 }, { forearmR: 0.021227, handR: 0.978773 }, { forearmR: 0.0531051, handR: 0.9468949 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.7363309, handR: 0.2636691 }, { forearmR: 0.9400446, handR: 0.0599554 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { handR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.1404818, forearmR: 0.8595182 }, { upperR: 0.1262038, forearmR: 0.8737962 }, { upperR: 0.3916963, forearmR: 0.6083037 }, { upperR: 0.631549, forearmR: 0.368451 }, { forearmR: 8613e-7, handR: 0.9991387 }, { forearmR: 2263e-7, handR: 0.9997737 }, { forearmR: 0.06273, handR: 0.93727 }, { forearmR: 0.061516, handR: 0.938484 }, { upperR: 0.9105121, forearmR: 0.0894879 }, { upperR: 0.9876067, forearmR: 0.0123933 }, { forearmR: 0.1367099, handR: 0.8632901 }, { upperR: 1 }, { upperR: 0.9996366, forearmR: 3634e-7 }, { forearmR: 0.1278172, handR: 0.8721828 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.9003611, forearmR: 0.0996389 }, { upperR: 0.9935394, forearmR: 64606e-7 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0196579, handR: 0.9803421 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0745299, handR: 0.9254701 }, { handR: 1 }, { forearmR: 0.6706328, handR: 0.3293672 }, { forearmR: 0.6229517, handR: 0.3770483 }, { forearmR: 0.4794108, handR: 0.5205892 }, { forearmR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.9923111, handR: 76889e-7 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 13875e-7, forearmR: 0.9986125 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { upperR: 0.0283582, forearmR: 0.9716418 }, { upperR: 0.37734, forearmR: 0.62266 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { upperR: 0.4283066, forearmR: 0.5716934 }, { upperR: 0.4897114, forearmR: 0.5102886 }, { upperR: 0.5962718, forearmR: 0.4037282 }, { upperR: 0.7264586, forearmR: 0.2735414 }, { upperR: 0.7310492, forearmR: 0.2689508 }, { upperR: 0.839834, forearmR: 0.160166 }, { forearmR: 4433e-7, handR: 0.9995567 }, { forearmR: 58118e-7, handR: 0.9941882 }, { forearmR: 0.0448416, handR: 0.9551584 }, { forearmR: 0.0121509, handR: 0.9878491 }, { forearmR: 0.0418842, handR: 0.9581158 }, { upperR: 0.9880001, forearmR: 0.0119999 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 0.1137979, handR: 0.8862021 }, { forearmR: 0.1473889, handR: 0.8526111 }, { forearmR: 0.4949805, handR: 0.5050195 }, { forearmR: 0.6084157, handR: 0.3915843 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 0.4448334, handR: 0.5551666 }, { forearmR: 0.8242297, handR: 0.1757703 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.8760191 }, { upperR: 0.8507184 }, { upperR: 0.7752734 }, { upperR: 0.8094345 }, { forearmR: 0.9999152, handR: 848e-7 }, { forearmR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.9653638 }, { upperR: 0.8742431 }, { upperR: 1 }, { upperR: 0.8873208 }, { upperR: 0.8804725 }, { upperR: 0.7987602 }, { upperR: 0.7687153 }, { upperR: 0.954224 }, { upperR: 0.799806 }, { upperR: 0.7373499 }, { upperR: 0.7126115 }, { forearmR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.810981 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.8734387 }, { upperR: 1 }, { upperR: 0.8090675 }, { upperR: 0.748902 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.0422912, forearmR: 0.9577088 }, { upperR: 64674e-7, forearmR: 0.9935326 }, { upperR: 0.0658984, forearmR: 0.9341016 }, { upperR: 0.27424, forearmR: 0.72576 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.3419244, forearmR: 0.6580756 }, { upperR: 0.6254177, forearmR: 0.3745823 }, { upperR: 0.7357741, forearmR: 0.2642259 }, { upperR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0288381, handR: 0.9711619 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0640012, handR: 0.9359988 }, { forearmR: 0.081849, handR: 0.918151 }, { forearmR: 0.4680786, handR: 0.5319214 }, { forearmR: 0.4201708, handR: 0.5798292 }, { forearmR: 0.0672191, handR: 0.9327809 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.6847046, handR: 0.3152954 }, { forearmR: 0.9665923, handR: 0.0334077 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 24241e-7, handR: 0.9975759 }, { handR: 1 }, { forearmR: 27499e-7, handR: 0.9972501 }, { handR: 1 }, { forearmR: 23579e-7, handR: 0.9976421 }, { handR: 1 }, { forearmR: 0.0117835, handR: 0.9882165 }, { forearmR: 0.0183218, handR: 0.9816782 }, { upperR: 0.8568266, forearmR: 0.1431734 }, { upperR: 0.7058036, forearmR: 0.2941964 }, { upperR: 0.8900687, forearmR: 0.1099313 }, { upperR: 0.8906118, forearmR: 0.1093882 }, { upperR: 0.9388927, forearmR: 0.0611073 }, { upperR: 0.9985664, forearmR: 14336e-7 }, { upperR: 1 }, { forearmR: 0.0776291, handR: 0.9223709 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 0.069704, handR: 0.930296 }, { forearmR: 0.1169963, handR: 0.8830037 }, { upperR: 1 }, { forearmR: 0.1563408, handR: 0.8436592 }, { forearmR: 0.1043642, handR: 0.8956358 }, { forearmR: 0.4514919, handR: 0.5485081 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.8108811 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.7050479 }, { upperR: 0.7009014 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.8120662 }, { upperR: 0.7777307 }, { upperR: 0.7494761 }, { upperR: 0.7046304 }, { upperR: 0.734566 }, { upperR: 0.6745359 }, { forearmR: 0.9726483, handR: 0.0273517 }, { forearmR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.7398034 }, { upperR: 0.6789935 }, { upperR: 0.6586799 }, { upperR: 0.7038568 }, { upperR: 1 }, { upperR: 0.6740321 }, { upperR: 0.6164162 }, { upperR: 1 }, { upperR: 0.7229917 }, { upperR: 0.6592798 }, { upperR: 0.6266664 }, { forearmR: 1 }, { upperR: 0.7604787 }, { forearmR: 1 }, { upperR: 0.7041147 }, { upperR: 0.645248 }, { upperR: 0.7137195 }, { upperR: 0.6814409 }, { upperR: 0.7573068 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.7959768 }, { upperR: 0.8176744 }, { forearmR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.9245588 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.8581647 }, { upperR: 0.7743465 }, { upperR: 0.7128109 }, { upperR: 0.0192034, forearmR: 0.9807966 }, { upperR: 0.376255, forearmR: 0.623745 }, { upperR: 0.7213451, forearmR: 0.2786549 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.8387169 }, { upperR: 0.2186624, forearmR: 0.7813376 }, { upperR: 1 }, { upperR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 41177e-7, handR: 0.9958823 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 41298e-7, handR: 0.9958702 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 1591e-6, handR: 0.998409 }, { forearmR: 0.062955, handR: 0.937045 }, { forearmR: 15656e-7, handR: 0.9984344 }, { handR: 1 }, { forearmR: 0.3393668, handR: 0.6606332 }, { forearmR: 0.0690584, handR: 0.9309416 }, { forearmR: 56732e-7, handR: 0.9943268 }, { forearmR: 58168e-7, handR: 0.9941832 }, { forearmR: 0.0937199, handR: 0.9062801 }, { forearmR: 0.7608671, handR: 0.2391329 }, { forearmR: 0.2795741, handR: 0.7204259 }, { forearmR: 0.9995121, handR: 4879e-7 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 0.0487571, handR: 0.9512429 }, { forearmR: 38931e-7, handR: 0.9961069 }, { forearmR: 0.4765887, handR: 0.5234113 }, { forearmR: 0.786101, handR: 0.213899 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 5364e-7, handR: 0.9994636 }, { forearmR: 50696e-7, handR: 0.9949304 }, { forearmR: 0.0236251, handR: 0.9763749 }, { upperR: 0.0439774, forearmR: 0.9560226 }, { forearmR: 0.0192597, handR: 0.9807403 }, { forearmR: 0.0934132, handR: 0.9065868 }, { forearmR: 0.1150126, handR: 0.8849874 }, { forearmR: 0.0615053, handR: 0.9384947 }, { forearmR: 0.1392975, handR: 0.8607025 }, { upperR: 0.4595727, forearmR: 0.5404273 }, { upperR: 0.7978334, forearmR: 0.2021666 }, { upperR: 1 }, { upperR: 0.9963012, forearmR: 36988e-7 }, { upperR: 0.9974939, forearmR: 25061e-7 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 0.1485343, handR: 0.8514657 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 0.4843081, handR: 0.5156919 }, { forearmR: 0.1762701, handR: 0.8237299 }, { forearmR: 0.203269, handR: 0.796731 }, { forearmR: 0.5534878, handR: 0.4465122 }, { upperR: 1 }, { upperR: 0.7870407 }, { forearmR: 0.482734, handR: 0.517266 }, { forearmR: 0.9698721, handR: 0.0301279 }, { upperR: 1 }, { upperR: 0.7198704 }, { upperR: 0.7303757 }, { upperR: 0.6364528 }, { upperR: 0.6184053 }, { upperR: 0.6419583 }, { upperR: 0.6074351 }, { forearmR: 0.9146549, handR: 0.0853451 }, { upperR: 1 }, { upperR: 0.6135535 }, { upperR: 0.5531752 }, { forearmR: 0.9821434, handR: 0.0178566 }, { forearmR: 1 }, { upperR: 0.576753 }, { upperR: 0.5870317 }, { upperR: 0.5600641 }, { upperR: 0.5150903 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.6106338 }, { upperR: 0.5870027 }, { upperR: 0.546367 }, { upperR: 0.5656826 }, { upperR: 0.5460022 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.5673225 }, { upperR: 0.5410678 }, { upperR: 0.5768346 }, { upperR: 0.6204787 }, { upperR: 0.581957 }, { upperR: 0.5706777 }, { forearmR: 1 }, { upperR: 0.6166427 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.5984057 }, { upperR: 0.6998869 }, { upperR: 0.533443 }, { upperR: 0.7830204 }, { upperR: 0.0209513, forearmR: 0.9790487 }, { upperR: 0.0643397, forearmR: 0.9356603 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.9072684 }, { upperR: 0.7560929 }, { upperR: 0.0772109, forearmR: 0.9227891 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.8857939 }, { upperR: 0.7909838 }, { upperR: 0.7736319, forearmR: 0.2263681 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 7911e-7, handR: 0.9992089 }, { forearmR: 0.0623667, handR: 0.9376333 }, { forearmR: 0.028566, handR: 0.971434 }, { forearmR: 1 }, { handR: 1 }, { forearmR: 0.4314014, handR: 0.5685986 }, { forearmR: 0.3321751, handR: 0.6678249 }, { forearmR: 0.6565707, handR: 0.3434293 }, { forearmR: 0.9981152, handR: 18848e-7 }, { forearmR: 1 }, { forearmR: 0.3563722, handR: 0.6436278 }, { forearmR: 0.5227204, handR: 0.4772796 }, { forearmR: 1 }, { upperR: 0.0174755, forearmR: 0.9825245 }, { upperR: 0.0156719, forearmR: 0.9843281 }, { upperR: 0.3050106, forearmR: 0.672218 }, { upperR: 0.8477408, forearmR: 0.1522592 }, { forearmR: 0.4083968, handR: 0.5916032 }, { forearmR: 0.4295976, handR: 0.5704024 }, { upperR: 0.8031967, forearmR: 0.1968033 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.7658518 }, { upperR: 0.6789978 }, { upperR: 0.6368114 }, { upperR: 0.6833885 }, { upperR: 0.5997285 }, { forearmR: 0.9293085, handR: 0.0706915 }, { upperR: 0.5811365 }, { upperR: 0.5574842 }, { forearmR: 0.8843533, handR: 0.1156467 }, { forearmR: 0.9116833, handR: 0.0883167 }, { upperR: 0.5144784 }, { upperR: 0.5148445 }, { upperR: 0.4828595 }, { upperR: 0.4797952 }, { upperR: 0.4777695 }, { upperR: 0.4411932 }, { upperR: 0.5167996 }, { upperR: 0.4443345 }, { upperR: 0.5154543 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.5568885 }, { upperR: 0.5328362 }, { forearmR: 1 }, { upperR: 0.560274 }, { upperR: 0.5382754 }, { upperR: 0.5688713 }, { upperR: 0.5841541 }, { upperR: 0.0303748, forearmR: 0.9696252 }, { upperR: 0.0363364, forearmR: 0.9636636 }, { upperR: 0.1233018, forearmR: 0.8766982 }, { upperR: 1 }, { upperR: 0.6267867 }, { upperR: 0.163097, forearmR: 0.836903 }, { upperR: 0.0976081, forearmR: 0.9023919 }, { upperR: 0.7597046, forearmR: 0.2402954 }, { upperR: 0.7540408, forearmR: 0.2459592 }, { upperR: 0.7010708, forearmR: 0.2989292 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.852023 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { handR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 0.9515979, handR: 0.0484021 }, { forearmR: 0.9948258, handR: 51742e-7 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 0.9833143, handR: 0.0166857 }, { forearmR: 0.981845, handR: 0.018155 }, { forearmR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 0.9439085, handR: 0.0560915 }, { forearmR: 0.9564332, handR: 0.0435668 }, { upperR: 0.4603209, forearmR: 0.5396791 }, { upperR: 0.6892974, forearmR: 0.3107026 }, { upperR: 1 }, { upperR: 0.5669545 }, { upperR: 0.510532 }, { forearmR: 0.9437068, handR: 0.0562932 }, { upperR: 0.7937508 }, { upperR: 0.5657815 }, { upperR: 0.5118668 }, { upperR: 0.4735606 }, { upperR: 0.4678474 }, { upperR: 0.4503545 }, { upperR: 0.5121755 }, { upperR: 0.4469312 }, { forearmR: 1 }, { upperR: 0.4180601 }, { upperR: 0.4098022 }, { upperR: 0.427939 }, { upperR: 0.4262272 }, { upperR: 0.4157825 }, { upperR: 0.4025138 }, { upperR: 0.4241987 }, { upperR: 0.4687361 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.0218928, forearmR: 0.9781072 }, { upperR: 0.5300511 }, { upperR: 0.1386394, forearmR: 0.8613606 }, { upperR: 0.1646873, forearmR: 0.8353127 }, { upperR: 0.5645044, forearmR: 0.4354956 }, { upperR: 0.5761833, forearmR: 0.4238167 }, { upperR: 0.7824293, forearmR: 0.2175707 }, { upperR: 0.5947843 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.0345868, forearmR: 0.94231 }, { upperR: 1.0000006 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.6077377 }, { upperR: 0.4725707 }, { forearmR: 1 }, { upperR: 0.1994412, forearmR: 0.8005588 }, { upperR: 0.9297501, forearmR: 0.0702499 }, { upperR: 0.7349607, forearmR: 0.2650393 }, { upperR: 0.4561913 }, { upperR: 0.4245307 }, { forearmR: 0.9999212, handR: 788e-7 }, { forearmR: 0.9908791 }, { upperR: 0.467313 }, { forearmR: 1 }, { upperR: 0.3816058 }, { forearmR: 0.9918384 }, { upperR: 0.3887173 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.3922995 }, { upperR: 0.3950639 }, { forearmR: 1 }, { upperR: 0.4002106 }, { upperR: 0.3902476 }, { upperR: 0.3987847 }, { forearmR: 1 }, { upperR: 0.4501704 }, { upperR: 0.4395036 }, { upperR: 0.0149952, forearmR: 0.9850048 }, { upperR: 0.0606534, forearmR: 0.9393466 }, { upperR: 0.1129175, forearmR: 0.8870825 }, { upperR: 0.0362777, forearmR: 0.9637223 }, { upperR: 0.0714746, forearmR: 0.9285254 }, { upperR: 0.1539599, forearmR: 0.8460401 }, { upperR: 0.5637627, forearmR: 0.4362373 }, { upperR: 0.5101482, forearmR: 0.4898518 }, { upperR: 0.857324, forearmR: 0.142676 }, { upperR: 1 }, { upperR: 0.925319 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.5687185 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.5000293 }, { upperR: 0.5583349 }, { forearmR: 0.9715054 }, { forearmR: 0.9855262 }, { upperR: 0.0476649, forearmR: 0.9157075 }, { upperR: 0.0465316, forearmR: 0.8926012 }, { upperR: 0.0536287, forearmR: 0.9191874 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.8933352 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.6691637 }, { upperR: 0.6607402 }, { upperR: 0.5125631 }, { forearmR: 0.9814884 }, { upperR: 0.9460787, forearmR: 0.0539213 }, { upperR: 1 }, { upperR: 0.9536988 }, { upperR: 0.4610703 }, { upperR: 0.4383671 }, { upperR: 0.402612 }, { forearmR: 0.9725515 }, { upperR: 0.2227283, forearmR: 0.7511489 }, { upperR: 0.5060466, forearmR: 0.4603603 }, { upperR: 0.739823, forearmR: 0.2202792 }, { upperR: 0.7469206, forearmR: 0.2183613 }, { upperR: 0.8217864, forearmR: 0.1096113 }, { upperR: 0.3771594 }, { upperR: 0.3631234 }, { forearmR: 0.9730717 }, { forearmR: 1 }, { upperR: 0.3597833 }, { upperR: 0.3732902 }, { upperR: 0.3531731 }, { forearmR: 0.9725497 }, { forearmR: 1 }, { forearmR: 1 }, { forearmR: 1 }, { upperR: 0.3444814 }, { forearmR: 1 }, { forearmR: 0.98768 }, { upperR: 0.3541144 }, { upperR: 0.3847513 }, { upperR: 0.3706414 }, { upperR: 0.3445881 }, { upperR: 0.3925947 }, { upperR: 0.3871178 }, { upperR: 0.3829753 }, { forearmR: 1 }, { upperR: 0.4602027 }, { upperR: 0.0232892, forearmR: 0.9767108 }, { upperR: 0.0668938, forearmR: 0.9331062 }, { upperR: 0.1222653, forearmR: 0.8777347 }, { upperR: 0.1121454, forearmR: 0.8878546 }, { upperR: 0.5324346, forearmR: 0.4675654 }, { upperR: 0.4148117, forearmR: 0.5851883 }, { upperR: 0.4188702, forearmR: 0.5811298 }, { upperR: 0.5859711, forearmR: 0.4140289 }, { upperR: 0.882428, forearmR: 0.117572 }, { upperR: 0.9294943, forearmR: 0.0705057 }, { upperR: 0.8781664, forearmR: 0.0713375 }, { upperR: 0.8971348 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 1 }, { upperR: 0.8748785 }, { upperR: 0.5153185 }, { upperR: 0.5888952 }, { upperR: 0.4930625 }, { upperR: 0.900173 }, { upperR: 0.9355027 }, { upperR: 0.8998713 }, { upperR: 0.885778 }, { upperR: 0.8715994 }, { upperR: 0.903368 }, { upperR: 0.8128975 }, { upperR: 0.8757746 }, { upperR: 0.7207401 }, { upperR: 0.4447055 }, { upperR: 0.4466219 }, { upperR: 0.4236677 }, { forearmR: 0.9696542 }, { forearmR: 0.9655775 }, { forearmR: 0.9697793 }, { forearmR: 0.9646816 }, { upperR: 0.0515765, forearmR: 0.9033149 }, { upperR: 0.9513224 }, { upperR: 0.8354661, forearmR: 0.0989999 }, { upperR: 0.9264289 }, { upperR: 0.9262679 }, { upperR: 0.8306814 }, { upperR: 0.3777833 }, { upperR: 0.3685508 }, { forearmR: 0.9733809 }, { upperR: 0.3439807 }, { upperR: 0.317202 }, { upperR: 0.3310014 }, { upperR: 0.3121879 }, { forearmR: 0.9736566 }, { upperR: 0.3509472 }, { upperR: 0.3300971 }, { upperR: 0.3390362 }, { upperR: 0.3255616 }, { upperR: 0.2650114 }, { upperR: 0.3427576 }, { forearmR: 0.9680697 }, { upperR: 0.3520057 }, { upperR: 0.2666773 }, { upperR: 0.3167429 }, { forearmR: 0.9795008 }, { upperR: 0.3458318 }, { forearmR: 0.9843834 }, { forearmR: 0.9668079 }, { forearmR: 0.9789424 }, { upperR: 0.3772501 }, { upperR: 0.327138 }, { upperR: 0.0246437, forearmR: 0.9381578 }, { upperR: 0.3054255 }, { upperR: 0.3271458 }, { upperR: 0.3375911 }, { upperR: 0.0590801, forearmR: 0.9049294 }, { upperR: 0.3206803, forearmR: 0.6299281 }, { upperR: 0.3035896 }, { upperR: 0.3573483, forearmR: 0.6316803 }, { upperR: 0.2979003, forearmR: 0.6666247 }, { upperR: 0.4742022, forearmR: 0.4886004 }, { upperR: 0.9341336, forearmR: 4255e-7 }, { upperR: 0.3629886 }, { upperR: 0.8676423 }, { upperR: 0.9546441 }, { upperR: 0.9058306 }, { upperR: 0.8485494 }, { upperR: 0.8775737 }, { upperR: 0.8579954 }, { upperR: 0.8407645 }, { upperR: 0.7838099 }, { upperR: 0.5001337 }, { upperR: 0.4065431 }, { upperR: 0.9447485 }, { upperR: 0.5083875 }, { upperR: 0.8174873 }, { upperR: 0.7968063 }, { upperR: 0.533671 }, { upperR: 0.3699055 }, { upperR: 0.8576734 }, { upperR: 0.8302006 }, { upperR: 0.8454379 }, { upperR: 0.7910049 }, { upperR: 0.8141006 }, { forearmR: 0.9470102 }, { forearmR: 0.9603873 }, { upperR: 0.0322663, forearmR: 0.9126684 }, { upperR: 0.3231225, forearmR: 0.6397438 }, { upperR: 0.7644487 }, { upperR: 0.3366821 }, { upperR: 0.2890345 }, { upperR: 0.3201744 }, { upperR: 8275e-7, forearmR: 0.9419036 }, { upperR: 0.3141543, forearmR: 0.6229699 }, { upperR: 0.1963242, forearmR: 0.7307185 }, { upperR: 0.4759282, forearmR: 0.4607806 }, { upperR: 0.7459848, forearmR: 0.1758864 }, { upperR: 0.7436932, forearmR: 0.1955286 }, { upperR: 0.6682592, forearmR: 0.2442201 }, { upperR: 0.806155, forearmR: 0.072859 }, { upperR: 0.8281143, forearmR: 0.0398884 }, { upperR: 0.8449516, forearmR: 276e-7 }, { upperR: 0.3013905 }, { upperR: 0.3107184 }, { upperR: 0.3177347 }, { upperR: 0.3248071 }, { forearmR: 0.9423748 }, { upperR: 0.781329, forearmR: 0.0849805 }, { upperR: 0.3080974 }, { upperR: 0.301388 }, { upperR: 0.3016531 }, { forearmR: 0.9678465 }, { upperR: 0.2902861 }, { forearmR: 0.9440448 }, { forearmR: 0.9820212 }, { upperR: 0.2681498 }, { forearmR: 0.9687173 }, { upperR: 0.2619986 }, { upperR: 0.3325427 }, { upperR: 0.2413271 }, { forearmR: 0.9636813 }, { forearmR: 0.9643277 }, { upperR: 0.3160058 }, { upperR: 0.3076177 }, { upperR: 15658e-7, forearmR: 0.9497664 }, { upperR: 43569e-7, forearmR: 0.971608 }, { upperR: 0.3103215 }, { upperR: 0.067991, forearmR: 0.9019377 }, { upperR: 0.0728401, forearmR: 0.8672509 }, { upperR: 0.3144138 }, { upperR: 0.3412144, forearmR: 0.5989628 }, { upperR: 0.5933359, forearmR: 0.3024684 }, { upperR: 0.3274337 }, { upperR: 0.8005851, forearmR: 0.0949736 }, { upperR: 0.4587756, forearmR: 0.4719958 }, { upperR: 0.7922023, forearmR: 0.1086762 }, { upperR: 0.8144134 }, { upperR: 0.8545333 }, { upperR: 0.3306729 }, { upperR: 0.3007669 }, { upperR: 0.8808812 }, { upperR: 0.8519284 }, { upperR: 0.899552 }, { upperR: 0.7769236 }, { upperR: 0.7300081 }, { upperR: 0.8220505 }, { upperR: 0.762389 }, { upperR: 0.6959541 }, { upperR: 0.7354919 }, { upperR: 0.5513765 }, { upperR: 0.3547468 }, { upperR: 0.6087379 }, { upperR: 0.6657796 }, { upperR: 0.5195417 }, { upperR: 0.4353903 }, { upperR: 0.5725103 }, { upperR: 0.4823268 }, { upperR: 0.4769109 }, { upperR: 0.7379791 }, { upperR: 0.5489021 }, { upperR: 0.3532054 }, { upperR: 0.3242762 }, { upperR: 0.819181 }, { upperR: 0.7466446 }, { upperR: 0.7934723 }, { upperR: 0.7218223 }, { upperR: 0.6889619 }, { upperR: 0.3116717 }, { upperR: 0.3273726 }, { upperR: 0.2946619 }, { upperR: 0.2786807 }, { upperR: 0.7607769 }, { upperR: 0.7196076 }, { upperR: 0.2750038 }, { forearmR: 0.9242542 }, { forearmR: 0.9248605 }, { upperR: 638e-6, forearmR: 0.9314627 }, { upperR: 0.04196, forearmR: 0.8815826 }, { upperR: 0.6617518 }, { upperR: 0.6172443 }, { upperR: 0.155095, forearmR: 0.7512294 }, { upperR: 0.4792822, forearmR: 0.4199399 }, { upperR: 0.7914311, forearmR: 0.0205897 }, { upperR: 0.7947395 }, { upperR: 0.2886137 }, { upperR: 0.2849273 }, { upperR: 0.2695432 }, { forearmR: 0.9419798 }, { forearmR: 0.9449381 }, { forearmR: 0.9330779 }, { forearmR: 0.9511507 }, { upperR: 0.2646702 }, { forearmR: 0.9562079 }, { upperR: 0.2159766 }, { upperR: 0.0226681, forearmR: 0.9131542 }, { upperR: 50576e-7, forearmR: 0.9436774 }, { upperR: 0.0646695, forearmR: 0.8500402 }, { upperR: 0.2694576, forearmR: 0.6421441 }, { upperR: 0.767797, forearmR: 0.0890479 }, { upperR: 0.7284228, forearmR: 0.1169732 }, { upperR: 0.8023109 }, { upperR: 0.8050915 }, { upperR: 0.8488431 }, { upperR: 0.7177237 }, { upperR: 0.7582708 }, { upperR: 0.520807 }, { upperR: 0.5522482 }, { upperR: 0.6299028 }, { upperR: 0.3001155 }, { upperR: 0.6691863 }, { upperR: 0.2205123 }, { upperR: 0.2515708 }, { upperR: 0.2414042 }, { upperR: 0.6841741 }, { upperR: 0.644854 }, { upperR: 0.2621108 }, { upperR: 0.153602 }, { upperR: 0.2545956 }, { upperR: 0.1714118 }, { upperR: 0.0139076, forearmR: 0.8901511 }, { upperR: 76683e-7, forearmR: 0.9166945 }, { upperR: 0.2067694, forearmR: 0.6799937 }, { upperR: 0.1506551, forearmR: 0.715296 }, { upperR: 0.7734049, forearmR: 0.0510339 }, { upperR: 0.715341 }, { upperR: 0.7439786, forearmR: 1465e-7 }, { upperR: 0.2707964 }, { upperR: 0.2659462 }, { upperR: 0.2220701 }, { upperR: 0.2445505 }, { upperR: 0.1938286 }, { upperR: 2877e-7, forearmR: 0.9221235 }, { upperR: 8333e-7, forearmR: 0.9000052 }, { upperR: 0.5008129, forearmR: 0.3664292 }, { upperR: 0.5943475, forearmR: 0.1907498 }, { upperR: 0.7628836, forearmR: 0.0472249 }, { upperR: 0.2546228 }, { upperR: 0.6557847, forearmR: 0.1669238 }, { upperR: 0.2218446 }, { upperR: 0.2446308 }, { forearmR: 0.9366581 }, { upperR: 0.2208266 }, { upperR: 1286e-7, forearmR: 0.9127488 }, { upperR: 3347e-6, forearmR: 0.9172089 }, { upperR: 0.0650194, forearmR: 0.8402902 }, { upperR: 0.3135771, forearmR: 0.5647406 }, { upperR: 0.6497172, forearmR: 0.1647838 }, { upperR: 0.7508496, forearmR: 0.0493428 }, { upperR: 0.1911708 }, { upperR: 0.2101039 }, { upperR: 0.2491478 }, { upperR: 0.2452089 }, { upperR: 0.1950744 }, { upperR: 0.221027 }, { upperR: 0.7237093 }, { upperR: 0.7747078 }, { upperR: 0.8023476 }, { upperR: 0.8180554 }, { upperR: 0.7925101 }, { upperR: 0.676223 }, { upperR: 0.7731751 }, { upperR: 0.6925763 }, { upperR: 0.644458 }, { upperR: 0.6564973 }, { upperR: 0.2636493 }, { upperR: 0.6687342 }, { upperR: 0.6436169 }, { upperR: 0.6616411 }, { upperR: 0.6071637 }, { upperR: 0.5045706 }, { upperR: 0.3738944 }, { upperR: 0.5089503 }, { upperR: 0.4258331 }, { upperR: 0.5091342 }, { upperR: 0.5799412 }, { upperR: 0.2216536 }, { upperR: 0.1189963 }, { upperR: 0.6809107 }, { upperR: 0.6544471 }, { upperR: 0.5545524 }, { upperR: 0.6289403 }, { upperR: 0.5910175 }, { upperR: 0.6418325 }, { upperR: 0.198012 }, { upperR: 0.2045463 }, { upperR: 0.5403112 }, { upperR: 0.6111374 }, { upperR: 0.2062568 }, { upperR: 0.5707676 }, { upperR: 0.1792561 }, { upperR: 0.1726197 }, { upperR: 0.6209727 }, { upperR: 0.0492523, forearmR: 0.8215952 }, { upperR: 0.1621681, forearmR: 0.6801025 }, { upperR: 0.6847858, forearmR: 0.0208704 }, { upperR: 0.6692027 }, { upperR: 0.6159431 }, { upperR: 0.0520818, forearmR: 0.8339997 }, { upperR: 0.1238879, forearmR: 0.7549117 }, { upperR: 237e-7, forearmR: 0.9155931 }, { upperR: 0.1103147, forearmR: 0.736151 }, { upperR: 0.5149091, forearmR: 0.3055544 }, { upperR: 0.4640381, forearmR: 0.3190192 }, { upperR: 0.712615, forearmR: 4349e-7 }, { upperR: 718e-7, forearmR: 0.9061402 }, { upperR: 12192e-7, forearmR: 0.88526 }, { upperR: 0.0766701, forearmR: 0.7921395 }, { upperR: 0.4472435, forearmR: 0.3737358 }, { upperR: 0.6155623, forearmR: 0.1801162 }, { upperR: 0.5725199, forearmR: 0.1786166 }, { upperR: 0.673399, forearmR: 0.0463532 }, { upperR: 5815e-7, forearmR: 0.8940573 }, { upperR: 0.1921225, forearmR: 0.6604821 }, { upperR: 0.2001246 }, { upperR: 0.2037522 }, { upperR: 2187e-6, forearmR: 0.9135364 }, { upperR: 0.0673009, forearmR: 0.8135783 }, { upperR: 0.0907033, forearmR: 0.7686983 }, { upperR: 0.1148274, forearmR: 0.7784209 }, { upperR: 0.3919412, forearmR: 0.4595108 }, { upperR: 0.3959116, forearmR: 0.4228877 }, { upperR: 0.4702925, forearmR: 0.3467129 }, { upperR: 0.5576517, forearmR: 0.244786 }, { upperR: 0.3524028, forearmR: 0.4309436 }, { upperR: 0.5863891, forearmR: 0.2104038 }, { upperR: 0.7414732, forearmR: 0.0460936 }, { upperR: 0.6740753 }, { upperR: 0.1839034 }, { upperR: 0.7312946, forearmR: 0.0674877 }, { upperR: 0.6876515 }, { upperR: 0.742752 }, { upperR: 0.6594373 }, { upperR: 0.2213272 }, { upperR: 0.1970589 }, { upperR: 0.7536522 }, { upperR: 0.6066007 }, { upperR: 0.2471215 }, { upperR: 0.5745505 }, { upperR: 0.6956853 }, { upperR: 0.6512983 }, { upperR: 0.6087007 }, { upperR: 0.6083963 }, { upperR: 0.5708573 }, { upperR: 0.6552462 }, { upperR: 0.6336699 }, { upperR: 0.6029623 }, { upperR: 0.6111607 }, { upperR: 0.5425684 }, { upperR: 0.587166 }, { upperR: 0.5928829 }, { upperR: 0.2804647 }, { upperR: 0.4939564 }, { upperR: 0.4894939 }, { upperR: 0.4852868 }, { upperR: 0.3215776 }, { upperR: 0.2984045 }, { upperR: 0.2959098 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperR: 0.4127894 }, { upperR: 0.3292793 }, { upperR: 0.3354895 }, { upperR: 0.362316 }, { upperR: 0.3337132 }, { upperR: 0.560404 }, { upperR: 0.5292918 }, { upperR: 0.5159694 }, { upperR: 0.4473516 }, { upperR: 0.4836492 }, { upperR: 0.4577038 }, { upperR: 0.3158946 }, { upperR: 0.4743825 }, { upperR: 0.5231745 }, { upperR: 0.1566996 }, { upperR: 0.5798625 }, { upperR: 0.4938446 }, { upperR: 0.5173675 }, { upperR: 0.4705589 }, { upperR: 0.4605827 }, { upperR: 0.1677765 }, { upperR: 0.496393 }, { upperR: 0.4617261 }, { upperR: 0.4604466, forearmR: 0.3199396 }, { upperR: 0.2057074 }, { upperR: 0.1860439 }, { upperR: 0.0316381, forearmR: 0.8251609 }, { upperR: 0.4099186, forearmR: 0.3706747 }, { upperR: 0.5569115, forearmR: 0.193076 }, { upperR: 0.6342155, forearmR: 1509e-7 }, { upperR: 0.6838582, forearmR: 8544e-7 }, { upperR: 0.4967993, forearmR: 0.3085123 }, { upperR: 0.4250302, forearmR: 0.3857871 }, { upperR: 0.6306011, forearmR: 0.154513 }, { upperR: 0.6600212, forearmR: 94273e-7 }, { upperR: 0.4136347, forearmR: 0.3665302 }, { upperR: 0.5425203, forearmR: 0.2121783 }, { upperR: 0.6363108, forearmR: 0.085797 }, { upperR: 0.5703548, forearmR: 0.2160085 }, { upperR: 0.547109, forearmR: 0.2332815 }, { upperR: 0.5137853, forearmR: 0.232146 }, { upperR: 0.646685, forearmR: 0.083113 }, { upperR: 0.6571552, forearmR: 0.0878432 }, { upperR: 0.147358 }, { upperR: 0.1013082 }, { upperR: 0.6280531, forearmR: 0.1205964 }, { upperR: 0.6307936, forearmR: 0.0717562 }, { upperR: 0.6500437 }, { upperR: 0.1382525 }, { upperR: 0.6226671 }, { upperR: 0.573551 }, { upperR: 0.1784206 }, { upperR: 0.63991 }, { upperR: 0.6372215 }, { upperR: 0.6026248 }, { upperR: 0.5834688 }, { upperR: 0.581065 }, { upperR: 0.5171324 }, { upperR: 0.571552 }, { upperR: 0.5571815 }, { upperR: 0.2731574 }, { upperR: 0.3385469 }, { upperR: 0.4431647 }, { upperR: 0.4343621 }, { upperR: 0.3485679 }, { upperR: 0.3633035 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperR: 0.2500065 }, { upperR: 0.2362737 }, { upperR: 0.4367976 }, { upperR: 0.4615813 }, { upperR: 0.3742425 }, { upperR: 0.3634902 }, { upperR: 0.2812634 }, { upperR: 0.22736 }, { handR: 1201e-7 }, { handR: 98e-6 }, { handR: 758e-7 }, { handR: 152e-6 }, { handR: 1584e-7 }, { upperR: 0.524987 }, { upperR: 0.5225804 }, { upperR: 0.4296506 }, { upperR: 0.219664 }, {}, { handR: 421e-7 }, { handR: 26e-6 }, { handR: 29e-6 }, { handR: 371e-7 }, { handR: 378e-7 }, { handR: 482e-7 }, { upperR: 0.4596867 }, { upperR: 0.4532759 }, { upperR: 0.1374467 }, { handR: 907e-7 }, { handR: 124e-7 }, {}, { handR: 1351e-7 }, { handR: 1651e-7 }, { handR: 487e-7 }, { upperR: 0.5392507 }, { upperR: 0.5251664 }, { upperR: 0.4858139 }, { upperR: 0.1314798 }, { handR: 1787e-7 }, { handR: 1989e-7 }, { handR: 663e-7 }, { handR: 2386e-7 }, { handR: 1972e-7 }, { handR: 2465e-7 }, { handR: 347e-6 }, { upperR: 0.569156 }, { upperR: 0.4969343 }, { upperR: 0.4317781 }, { handR: 783e-7 }, { handR: 253e-7 }, { handR: 391e-7 }, { handR: 1954e-7 }, { handR: 608e-7 }, { handR: 929e-7 }, { handR: 858e-7 }, { handR: 3087e-7 }, { forearmR: 265e-7, handR: 4395e-7 }, { upperR: 0.5028383 }, { upperR: 0.4809742 }, { handR: 271e-7 }, { handR: 403e-6 }, { upperR: 0.4581321 }, { handR: 1247e-7 }, { handR: 434e-7 }, { handR: 1646e-7 }, { handR: 2955e-7 }, { handR: 973e-7 }, { upperR: 0.4885448 }, { upperR: 0.4478907 }, { upperR: 0.433594 }, { upperR: 0.1842023 }, { handR: 268e-7 }, { handR: 364e-7 }, { handR: 944e-7 }, { handR: 395e-7 }, { handR: 2629e-7 }, { handR: 79e-6 }, { handR: 1574e-7 }, { handR: 3449e-7 }, { upperR: 0.4667548 }, { upperR: 0.4644052 }, { upperR: 0.1566565 }, { upperR: 0.1189195 }, { handR: 2523e-7 }, { upperR: 0.5916502 }, { upperR: 0.6699361, forearmR: 4434e-7 }, { upperR: 0.1338286 }, { upperR: 0.0873112 }, { upperR: 0.0950759 }, { upperR: 0.6459601, forearmR: 492e-7 }, { upperR: 0.1556841 }, { upperR: 0.6536727, forearmR: 10938e-7 }, { upperR: 0.5892196 }, { upperR: 0.6167966 }, { upperR: 0.1447459 }, { upperR: 0.1257666 }, { upperR: 0.1950945 }, { upperR: 0.586794 }, { upperR: 0.538634 }, { upperR: 0.5259345 }, { upperR: 0.524504 }, { upperR: 0.524504 }, { upperR: 0.5003085 }, { upperR: 0.513726 }, { upperR: 0.5039009 }, { upperR: 0.479063 }, { upperR: 0.4862349 }, { upperR: 0.2065145 }, { upperR: 0.4211085 }, { upperR: 0.3934992 }, { upperR: 0.1836392 }, { upperR: 0.4400018 }, { upperR: 0.3536349 }, { upperR: 0.2784686 }, { upperR: 0.3053486 }, { upperR: 0.3936365 }, { upperR: 0.2211299 }, { upperR: 0.2314701 }, { upperR: 0.2334666 }, { upperR: 0.255224 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { handR: 681e-7 }, { handR: 425e-7 }, { handR: 313e-7 }, { handR: 963e-7 }, { handR: 726e-7 }, { upperR: 0.3863891 }, { upperR: 0.2970801 }, {}, {}, {}, {}, {}, { handR: 201e-7 }, { handR: 251e-7 }, { handR: 289e-7 }, { handR: 374e-7 }, { handR: 1623e-7 }, { upperR: 0.3505406 }, { upperR: 0.3752678 }, { upperR: 0.295133 }, { upperR: 0.2145057 }, {}, {}, {}, { handR: 125e-7 }, { handR: 1767e-7 }, { handR: 506e-7 }, { handR: 484e-7 }, { handR: 564e-7 }, { forearmR: 15e-7, handR: 2755e-7 }, { handR: 297e-6 }, { handR: 1611e-7 }, { forearmR: 12e-6, handR: 3731e-7 }, { upperR: 0.1806449 }, { upperR: 0.4346759 }, { upperR: 0.2233923 }, { upperR: 0.3693479 }, { upperR: 0.2508539 }, {}, {}, { handR: 2006e-7 }, { handR: 665e-7 }, { handR: 659e-7 }, { handR: 791e-7 }, { handR: 106e-6 }, { forearmR: 61e-6, handR: 3749e-7 }, { forearmR: 547e-7, handR: 4206e-7 }, {}, {}, { forearmR: 188e-7, handR: 4272e-7 }, { forearmR: 167e-7, handR: 1119e-7 }, { forearmR: 8e-7, handR: 1324e-7 }, { upperR: 0.096849 }, {}, { forearmR: 823e-7, handR: 1017e-7 }, { upperR: 0.4279127 }, { upperR: 0.1282834 }, {}, { forearmR: 44e-7, handR: 1341e-7 }, { forearmR: 878e-7, handR: 1066e-7 }, { forearmR: 4031e-7, handR: 2465e-7 }, { forearmR: 1673e-7, handR: 639e-7 }, { upperR: 0.3601204 }, { upperR: 0.3869876 }, { upperR: 0.4768286 }, { upperR: 0.1330358 }, {}, { forearmR: 24e-7, handR: 1428e-7 }, { upperR: 0.4730332 }, { upperR: 0.3764926 }, { upperR: 0.3278195 }, { upperR: 0.3378417 }, { upperR: 0.4138922 }, { upperR: 0.4408929 }, {}, { forearmR: 121e-7, handR: 4682e-7 }, { forearmR: 2216e-7, handR: 3987e-7 }, { forearmR: 8483e-7, handR: 253e-7 }, { forearmR: 6793e-7, handR: 1413e-7 }, { forearmR: 10182e-7, handR: 91e-7 }, { forearmR: 2074e-7, handR: 17e-6 }, { forearmR: 3059e-7, handR: 28e-7 }, { forearmR: 11762e-7 }, { forearmR: 15059e-7 }, { forearmR: 12992e-7 }, { upperR: 0.4862758 }, { upperR: 0.4768286 }, { upperR: 0.5028383 }, {}, {}, { handR: 47e-7 }, { handR: 1318e-7 }, { handR: 125e-6 }, { forearmR: 322e-6, handR: 28e-7 }, { forearmR: 1923e-7, handR: 443e-7 }, { upperR: 0.4842667 }, { upperR: 0.3347901 }, { upperR: 0.4161188 }, { upperR: 0.4211043 }, { upperR: 0.4842667 }, { upperR: 0.4820957 }, { upperR: 0.4372534 }, { upperR: 0.4885448 }, { upperR: 0.1428991 }, { handR: 246e-7 }, { forearmR: 3192e-7, handR: 3238e-7 }, { forearmR: 1412e-7, handR: 579e-7 }, { forearmR: 3723e-7 }, { forearmR: 8203e-7, handR: 1324e-7 }, { upperR: 0.4647329 }, { upperR: 0.4193122 }, { upperR: 0.4974931 }, { upperR: 0.496393 }, { upperR: 0.4357463 }, { upperR: 0.4974931 }, { upperR: 0.1044162 }, { handR: 624e-7 }, { forearmR: 22e-7, handR: 1328e-7 }, { forearmR: 229e-7, handR: 4665e-7 }, { forearmR: 713e-7, handR: 956e-7 }, { forearmR: 13001e-7 }, { forearmR: 10806e-7, handR: 2e-7 }, { upperR: 0.4647329 }, { upperR: 0.4647329 }, { upperR: 0.4667548 }, { upperR: 0.4595503 }, { upperR: 0.4439586 }, { handR: 383e-7 }, { handR: 4274e-7 }, { handR: 1193e-7 }, { forearmR: 6001e-7, handR: 1929e-7 }, { forearmR: 1803e-7, handR: 352e-7 }, { forearmR: 1307e-7, handR: 502e-7 }, { upperR: 0.459437 }, { upperR: 0.4606682 }, { upperR: 0.4499562 }, { upperR: 0.4679691 }, { upperR: 0.4394907 }, { upperR: 0.4496048 }, { handR: 203e-7 }, { handR: 633e-7 }, { handR: 658e-7 }, { handR: 2599e-7 }, { handR: 826e-7 }, { forearmR: 4752e-7, handR: 1787e-7 }, { handR: 903e-7 }, { handR: 1172e-7 }, { handR: 1926e-7 }, { handR: 1061e-7 }, { forearmR: 43e-7, handR: 4513e-7 }, { forearmR: 291e-7, handR: 4474e-7 }, { upperR: 0.5519602 }, { handR: 1353e-7 }, { upperR: 0.547932 }, { upperR: 0.1040174 }, { upperR: 0.5796668 }, { upperR: 0.569055 }, { upperR: 0.0912717 }, { upperR: 0.6029771 }, { upperR: 0.1076516 }, { upperR: 0.5665514 }, { upperR: 0.5602774 }, { upperR: 0.4742143 }, { upperR: 0.5505427 }, { upperR: 0.1454045 }, { upperR: 0.4623656 }, { upperR: 0.5815816 }, { upperR: 0.4910651 }, { upperR: 0.4779085 }, { upperR: 0.5389188 }, { upperR: 0.4834012 }, { upperR: 0.5139928 }, { upperR: 0.5147429 }, { upperR: 0.4762102 }, { upperR: 0.1347239 }, { upperR: 0.0806608 }, { upperR: 0.5638189 }, { upperR: 0.4164048 }, { upperR: 0.1886376 }, { upperR: 0.3326347 }, { upperR: 0.2925863 }, { upperR: 0.2130833 }, { upperR: 0.3422476 }, { upperR: 0.2505553 }, { upperR: 0.203068 }, { upperR: 0.1807237 }, { upperR: 0.1931986 }, { upperR: 0.2822166 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { handR: 401e-7 }, { handR: 49e-6 }, {}, { handR: 172e-7 }, { handR: 223e-7 }, { handR: 893e-7 }, { handR: 957e-7 }, { upperR: 0.1993395 }, {}, {}, {}, { handR: 124e-7 }, { handR: 38e-6 }, { handR: 1368e-7 }, { upperR: 0.1657785 }, { upperR: 0.2549393 }, { upperR: 0.2107833 }, { upperR: 0.3054062 }, { upperR: 0.0781628 }, {}, {}, {}, { handR: 59e-6 }, { forearmR: 1e-7, handR: 903e-7 }, { handR: 348e-7 }, { forearmR: 269e-7, handR: 1764e-7 }, { forearmR: 1335e-7, handR: 139e-6 }, { upperR: 0.1454338 }, { upperR: 0.1998764 }, { upperR: 0.1684714 }, { upperR: 0.1588892 }, { upperR: 0.0823842 }, {}, {}, { forearmR: 171e-7, handR: 722e-7 }, { forearmR: 103e-7, handR: 978e-7 }, { forearmR: 384e-7, handR: 396e-7 }, { upperR: 0.1535414 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, { forearmR: 2964e-7, handR: 194e-7 }, { forearmR: 462e-6, handR: 623e-7 }, { forearmR: 5378e-7, handR: 68e-7 }, { forearmR: 7492e-7, handR: 256e-7 }, {}, {}, {}, {}, { forearmR: 1393e-7, handR: 145e-7 }, { forearmR: 7905e-7 }, { upperR: 0.2067206 }, { upperR: 0.1887923 }, { upperR: 0.2389385 }, { upperR: 0.0454435 }, {}, {}, {}, {}, {}, { forearmR: 10438e-7 }, { forearmR: 12343e-7 }, { forearmR: 3085e-7 }, { forearmR: 2493e-7 }, { upperR: 0.3107597 }, { upperR: 0.3797375 }, { upperR: 0.2425746 }, { upperR: 0.2598338 }, { upperR: 0.0766956 }, {}, {}, { forearmR: 418e-6 }, { forearmR: 21725e-7 }, { upperR: 0.0987351 }, {}, {}, { forearmR: 3575e-7 }, { forearmR: 4452e-7 }, { forearmR: 16192e-7 }, { forearmR: 26127e-7 }, { upperR: 0.1365315 }, {}, { upperR: 0.116164 }, {}, { upperR: 0.4148641 }, { upperR: 0.122263 }, {}, {}, { forearmR: 2979e-7 }, { forearmR: 4398e-7 }, { upperR: 0.4566055 }, { upperR: 0.4548114 }, { upperR: 0.4149673 }, { upperR: 0.3454592 }, { upperR: 0.4239966 }, {}, {}, { forearmR: 14554e-7 }, { upperR: 0.446542 }, { upperR: 0.3924097 }, { upperR: 0.4595503 }, { upperR: 0.4667548 }, { upperR: 0.4607908 }, { upperR: 0.4644052 }, { upperR: 0.0855716 }, { forearmR: 133e-7, handR: 12e-5 }, { upperR: 0.4566055 }, { upperR: 0.4607908 }, { forearmR: 1194e-6 }, { upperR: 0.4360039 }, { upperR: 0.4504106 }, { upperR: 0.446542 }, { upperR: 0.4305486 }, { upperR: 0.4394907 }, { upperR: 0.4151026 }, { forearmR: 7228e-7, handR: 199e-7 }, { forearmR: 1117e-7, handR: 421e-7 }, { forearmR: 2105e-7, handR: 3e-7 }, { upperR: 0.4479628 }, { upperR: 0.448576 }, { upperR: 0.448576 }, { upperR: 0.4468556 }, { handR: 328e-7 }, { handR: 299e-7 }, { forearmR: 422e-7, handR: 3423e-7 }, { forearmR: 13e-6, handR: 104e-6 }, { forearmR: 3232e-7, handR: 1527e-7 }, { upperR: 0.5441006 }, { upperR: 0.4290396 }, { handR: 363e-7 }, { handR: 402e-7 }, { handR: 1403e-7 }, { forearmR: 3676e-7, handR: 708e-7 }, { upperR: 0.5375147 }, { upperR: 0.4383602 }, { upperR: 0.4383855 }, { upperR: 0.3999934 }, { handR: 422e-7 }, { upperR: 0.4337635 }, { upperR: 0.4065312 }, { upperR: 0.5377706 }, { upperR: 0.5003529 }, { upperR: 0.5335636 }, { upperR: 0.519942 }, { upperR: 0.5533469 }, { upperR: 0.3899736 }, { upperR: 0.1240827 }, { upperR: 0.5308089 }, { upperR: 0.4254879 }, { upperR: 0.407465 }, { upperR: 0.5259814 }, { upperR: 0.5245002 }, { upperR: 0.4194908 }, { upperR: 0.4047554 }, { upperR: 0.4176302 }, { upperR: 0.0775969 }, { upperR: 0.5382959 }, { upperR: 0.5187165 }, { upperR: 0.3458066 }, { upperR: 0.3795764 }, {}, { upperR: 0.1348685 }, { upperR: 0.18411 }, { upperR: 0.2401127 }, { upperR: 0.1760554 }, { upperR: 0.2367788 }, { upperR: 0.1941403 }, { upperR: 0.1536047 }, { upperR: 0.2042661 }, { upperR: 0.1723865 }, { upperR: 0.2114343 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperR: 0.1588317 }, { upperR: 0.0870976 }, { upperR: 0.1042533 }, { upperR: 0.1259312 }, { upperR: 0.2063346 }, { upperR: 0.048742 }, { upperR: 0.1764568 }, {}, {}, {}, { handR: 245e-7 }, {}, { handR: 71e-7 }, { handR: 478e-7 }, { handR: 679e-7 }, { handR: 126e-7 }, { handR: 188e-7 }, { upperR: 0.1346306 }, { upperR: 0.1236886 }, { upperR: 0.1237394 }, { upperR: 0.1559985 }, { handR: 52e-7 }, { handR: 997e-7 }, { upperR: 0.1106275 }, { upperR: 0.1045191 }, {}, {}, {}, { forearmR: 1e-7, handR: 1117e-7 }, { upperR: 0.1030701 }, { upperR: 0.1029196 }, { forearmR: 3e-7, handR: 657e-7 }, { forearmR: 726e-7, handR: 651e-7 }, { upperR: 0.1213536 }, { upperR: 0.0847817 }, { upperR: 0.1178738 }, { upperR: 0.1435862 }, { upperR: 0.1514177 }, {}, {}, { forearmR: 618e-7, handR: 106e-7 }, { forearmR: 258e-7, handR: 211e-7 }, { forearmR: 929e-7, handR: 107e-7 }, { forearmR: 401e-6 }, { forearmR: 6099e-7 }, { upperR: 0.1847266 }, { upperR: 0.1503386 }, {}, {}, {}, {}, { forearmR: 1491e-7, handR: 27e-7 }, { forearmR: 926e-7, handR: 28e-7 }, { forearmR: 1385e-7 }, { forearmR: 2165e-7 }, { forearmR: 2987e-7 }, { forearmR: 13036e-7 }, { forearmR: 2519e-7 }, { forearmR: 7038e-7 }, { forearmR: 23626e-7 }, { upperR: 0.0882389, forearmR: 0.0185982 }, { upperR: 0.1597513 }, { upperR: 0.1489151 }, { upperR: 0.057608 }, {}, {}, {}, {}, { forearmR: 5806e-7 }, { upperR: 0.1041031, forearmR: 0.0280383 }, { upperR: 0.1165725, forearmR: 16e-7 }, { upperR: 0.0852528, forearmR: 0.0298309 }, { upperR: 0.2217028 }, { upperR: 0.0696122 }, { upperR: 0.0582463 }, {}, {}, {}, {}, {}, { forearmR: 48088e-7 }, { forearmR: 37541e-7 }, {}, {}, {}, {}, { forearmR: 4325e-6 }, { upperR: 0.1336195, forearmR: 0.0299108 }, { upperR: 0.0937017 }, {}, {}, {}, { forearmR: 6668e-7 }, { forearmR: 7968e-7 }, { forearmR: 12454e-7 }, { forearmR: 26231e-7 }, { forearmR: 67872e-7 }, { upperR: 0.1335441, forearmR: 0.0170881 }, {}, {}, {}, { upperR: 0.4099071 }, { forearmR: 1766e-6 }, { forearmR: 6668e-7 }, { upperR: 0.3055748 }, {}, {}, { upperR: 0.3295172 }, { upperR: 0.0421181 }, {}, {}, {}, { forearmR: 3114e-7 }, { upperR: 0.3702026 }, {}, { upperR: 0.2870974 }, { upperR: 0.444649 }, { forearmR: 2208e-7 }, { forearmR: 9159e-7 }, { upperR: 0.4468556 }, { upperR: 0.4428295 }, { upperR: 0.4479628 }, { upperR: 0.4479628 }, { upperR: 0.4150985 }, { upperR: 0.4428295 }, { upperR: 0.4051358 }, { upperR: 0.4380331 }, { upperR: 0.3985808 }, { upperR: 0.4428295 }, { upperR: 0.4380331 }, { upperR: 0.4364706 }, { upperR: 0.4364706 }, { upperR: 0.4380331 }, { upperR: 0.4383602 }, { upperR: 0.3763645 }, { handR: 149e-7 }, {}, {}, { handR: 268e-7 }, { forearmR: 139e-7, handR: 651e-7 }, { forearmR: 59e-6, handR: 179e-7 }, { forearmR: 979e-7, handR: 82e-7 }, { forearmR: 2814e-7, handR: 77e-7 }, { upperR: 0.4297352 }, { upperR: 0.4364706 }, { upperR: 0.4354232 }, { upperR: 0.3903047 }, { upperR: 0.431417 }, { upperR: 0.4354232 }, { upperR: 0.431417 }, { upperR: 0.4297352 }, { upperR: 0.4297352 }, { upperR: 0.431417 }, { upperR: 0.4276971 }, { upperR: 0.4231776 }, { upperR: 0.3846977 }, { upperR: 0.4354232 }, { upperR: 0.4276971 }, { upperR: 0.4163789 }, { upperR: 0.4163789 }, { upperR: 0.4276971 }, { upperR: 0.4231776 }, { handR: 139e-7 }, { upperR: 0.4163789 }, { upperR: 0.4231776 }, { upperR: 0.4207747 }, { upperR: 0.368728 }, { upperR: 0.4030748 }, { upperR: 0.4207747 }, { upperR: 0.3898174 }, { upperR: 0.0743125 }, { handR: 333e-7 }, { upperR: 0.4434849 }, { upperR: 0.4161042 }, { upperR: 0.3600904 }, { upperR: 0.4161042 }, {}, { upperR: 0.3427172 }, { upperR: 0.3173522 }, { upperR: 0.4474353 }, { upperR: 0.3794744 }, { upperR: 0.4949545 }, { upperR: 0.5067112 }, { upperR: 0.4875239 }, { upperR: 0.498417 }, { upperR: 0.498417 }, { upperR: 0.3456584 }, { upperR: 0.3662655 }, { upperR: 0.3790324 }, { upperR: 0.351057 }, { upperR: 0.0757472 }, { upperR: 0.5187757 }, { upperR: 0.3820385 }, { upperR: 0.361061 }, { upperR: 0.374495 }, { upperR: 0.3932044 }, { upperR: 0.378319 }, { upperR: 0.0729329 }, { upperR: 0.517381 }, { upperR: 0.517381 }, { upperR: 0.5116722 }, { upperR: 0.4777322 }, { upperR: 0.5194913 }, { upperR: 0.3954414 }, { upperR: 0.5259814 }, { upperR: 0.0702033 }, { upperR: 0.0704205 }, { upperR: 0.287815 }, {}, { upperR: 0.0713986 }, { upperR: 0.0975813 }, { upperR: 0.1228192 }, { upperR: 0.1902439 }, { upperR: 0.1379905 }, { upperR: 0.1280403 }, { upperR: 0.1232916 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperR: 0.0664431 }, { upperR: 0.0579021 }, {}, { handR: 205e-7 }, { handR: 526e-7 }, {}, { upperR: 0.0391771 }, { upperR: 0.0854194 }, { upperR: 0.0647834 }, {}, { handR: 118e-7 }, { handR: 231e-7 }, { handR: 97e-7 }, { handR: 47e-7 }, { handR: 52e-6 }, { upperR: 0.0750846 }, {}, {}, { handR: 19e-6 }, {}, { handR: 1032e-7 }, {}, { upperR: 0.115199 }, { upperR: 0.1015377 }, {}, {}, {}, { handR: 171e-7 }, { upperR: 0.0594352 }, {}, {}, {}, { upperR: 0.0664848 }, {}, {}, { forearmR: 107e-7, handR: 113e-7 }, { forearmR: 265e-7, handR: 8e-6 }, { forearmR: 1024e-7, handR: 166e-7 }, { forearmR: 482e-7, handR: 1e-7 }, { forearmR: 2235e-7 }, { forearmR: 2548e-7 }, { forearmR: 553e-7 }, { forearmR: 136e-6 }, {}, { upperR: 0.0551886 }, { upperR: 0.0602939 }, { upperR: 0.0731516 }, { upperR: 0.112001 }, { upperR: 0.0637645 }, {}, { upperR: 0.0882434 }, {}, {}, {}, {}, { forearmR: 3779e-7 }, { upperR: 0.0939455, forearmR: 353e-7 }, { upperR: 0.0460124, forearmR: 54401e-7 }, { upperR: 0.0687388, forearmR: 25778e-7 }, {}, {}, { forearmR: 955e-7 }, { forearmR: 2201e-7 }, { forearmR: 11443e-7 }, { upperR: 0.0171293, forearmR: 0.024479 }, { upperR: 85859e-7, forearmR: 94576e-7 }, { upperR: 0.0672145, forearmR: 0.0177352 }, { upperR: 0.0346543 }, {}, {}, {}, { forearmR: 3809e-7 }, { upperR: 87671e-7, forearmR: 0.0136675 }, {}, { forearmR: 6189e-7 }, { forearmR: 13009e-7 }, { forearmR: 10413e-7 }, { forearmR: 50885e-7 }, {}, {}, { upperR: 0.0245259, forearmR: 0.0337695 }, {}, {}, {}, {}, {}, {}, {}, {}, { forearmR: 27988e-7 }, { forearmR: 94921e-7 }, { upperR: 0.0247304, forearmR: 0.039059 }, {}, {}, {}, {}, {}, { upperR: 0.0172412, forearmR: 0.0347607 }, { upperR: 0.0280322, forearmR: 0.0396664 }, {}, {}, {}, {}, {}, {}, {}, {}, { forearmR: 13736e-7 }, { upperR: 0.0315967 }, { upperR: 0.1029907, forearmR: 0.0100858 }, {}, { forearmR: 4392e-7 }, { forearmR: 14311e-7 }, { forearmR: 22542e-7 }, {}, {}, { upperR: 0.0845503, forearmR: 86735e-7 }, {}, { upperR: 0.0464573 }, {}, {}, { forearmR: 10484e-7 }, {}, {}, {}, {}, { forearmR: 2016e-7 }, { forearmR: 8929e-7 }, { upperR: 0.0422115 }, {}, {}, {}, { forearmR: 1005e-7 }, { forearmR: 6401e-7 }, { upperR: 0.2684141 }, { upperR: 0.0306804 }, { upperR: 0.0486906 }, { upperR: 0.2459924 }, { forearmR: 143e-7, handR: 305e-7 }, {}, { upperR: 0.1395545 }, { upperR: 0.287578 }, { upperR: 0.4161042 }, { upperR: 0.4336952 }, { upperR: 0.4434849 }, { upperR: 0.3784048 }, { upperR: 0.2903764 }, {}, { handR: 5e-6 }, { handR: 594e-7 }, { forearmR: 224e-7, handR: 2e-6 }, { upperR: 0.4336952 }, { upperR: 0.4474353 }, { upperR: 0.2445196 }, {}, { upperR: 0.2265411 }, { upperR: 0.1911194 }, { upperR: 0.2886811 }, { upperR: 0.20756 }, {}, {}, { upperR: 0.4875239 }, {}, { upperR: 0.3203692 }, { upperR: 0.0537599 }, {}, { upperR: 0.125275 }, { upperR: 0.0979495 }, {}, {}, {}, { upperR: 0.1576947 }, { upperR: 0.1285903 }, { upperR: 0.0998487 }, { upperR: 0.1130236 }, { upperR: 0.1273703 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperR: 0.0238755 }, {}, {}, {}, {}, {}, { handR: 112e-7 }, {}, {}, { handR: 245e-7 }, {}, { upperR: 0.0250868 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { handR: 583e-7 }, {}, {}, {}, { upperR: 0.040979, forearmR: 151e-6 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { forearmR: 885e-7 }, {}, {}, { forearmR: 2752e-7 }, {}, {}, {}, { upperR: 46731e-7, forearmR: 7825e-6 }, {}, {}, {}, {}, {}, {}, { forearmR: 262e-6 }, {}, { forearmR: 1814e-7 }, { forearmR: 13766e-7 }, {}, { forearmR: 24294e-7 }, {}, {}, {}, {}, {}, {}, { upperR: 33392e-7, forearmR: 0.0114396 }, {}, {}, {}, {}, { forearmR: 50703e-7 }, {}, { upperR: 25518e-7, forearmR: 0.019505 }, {}, {}, {}, {}, {}, {}, { forearmR: 2218e-6 }, { forearmR: 99332e-7 }, { forearmR: 4343e-6 }, {}, { upperR: 8047e-7, forearmR: 0.013068 }, { upperR: 13128e-7, forearmR: 0.023025 }, {}, { upperR: 27374e-7, forearmR: 0.0291507 }, { upperR: 43434e-7, forearmR: 0.0249859 }, {}, {}, {}, { forearmR: 34553e-7 }, { forearmR: 0.014569 }, { upperR: 1761e-6, forearmR: 0.0209143 }, {}, {}, {}, { forearmR: 50334e-7 }, { upperR: 50072e-7, forearmR: 0.0284891 }, { upperR: 945e-7, forearmR: 0.0147579 }, { upperR: 177e-5, forearmR: 0.0201187 }, { upperR: 53254e-7, forearmR: 0.0265208 }, {}, {}, {}, { forearmR: 71955e-7 }, {}, {}, { upperR: 81566e-7, forearmR: 0.019141 }, {}, {}, {}, {}, {}, {}, {}, {}, { forearmR: 42661e-7 }, {}, {}, {}, { forearmR: 2799e-7 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperR: 0.0262294 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { forearmR: 324e-7, handR: 2003e-7 }, {}, {}, {}, {}, {}, {}, {}, {}, { upperR: 0.0661507 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0695696 }, { upperL: 0.0699672 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0788552 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0745372 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.091123 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.066372 }, { upperL: 0.100788 }, {}, { upperL: 0.0642497 }, {}, { upperL: 0.0782218 }, {}, {}, {}, { upperL: 0.1074794 }, { upperL: 0.0998367 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0656403 }, {}, {}, {}, { upperL: 0.0416638 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { forearmL: 612e-6 }, { forearmL: 518e-6 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0855655 }, {}, {}, {}, {}, { forearmL: 1995e-7, handL: 32e-7 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.1134732 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0435438 }, {}, {}, {}, {}, {}, {}, { upperL: 0.0275953, forearmL: 15011e-7 }, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0794948 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0677906 }, {}, {}, {}, {}, {}, {}, { upperL: 0.0754907 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0613124 }, {}, {}, {}, { upperL: 0.1226531 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0608447 }, {}, {}, {}, { upperL: 0.232187 }, {}, {}, { upperL: 0.1783325 }, { upperL: 0.1688588 }, {}, { upperL: 0.1344289 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0464453 }, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0364409 }, {}, {}, {}, { upperL: 0.0674566 }, { upperL: 0.0869695 }, { upperL: 0.0741624 }, {}, {}, { upperL: 0.0452702 }, {}, { upperL: 0.1444255 }, { upperL: 0.062671 }, {}, {}, {}, { handL: 13e-6 }, { handL: 123e-7 }, { handL: 222e-7 }, {}, { upperL: 0.0707451 }, {}, {}, { upperL: 0.1193439 }, {}, {}, {}, {}, {}, {}, {}, { handL: 305e-7 }, {}, { forearmL: 374e-7, handL: 161e-7 }, {}, {}, {}, {}, {}, { forearmL: 293e-7, handL: 496e-7 }, {}, {}, { forearmL: 2489e-7 }, {}, {}, {}, {}, {}, {}, { upperL: 0.0740507 }, {}, {}, {}, { forearmL: 6393e-7 }, { upperL: 86983e-7, forearmL: 9368e-6 }, { upperL: 0.1353338 }, {}, {}, {}, {}, {}, {}, { upperL: 21083e-7, forearmL: 0.0168398 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0515802 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 38848e-7, forearmL: 0.0121848 }, { upperL: 0.0452594 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { forearmL: 45423e-7 }, {}, {}, {}, {}, {}, {}, { upperL: 0.0322275 }, {}, {}, {}, {}, {}, { upperL: 0.0472195, forearmL: 35398e-7 }, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0423423 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.2271739 }, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.3323599 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { handL: 164e-7 }, {}, {}, {}, {}, {}, {}, { forearmL: 44e-7, handL: 1678e-7 }, {}, {}, { upperL: 0.4170963 }, { upperL: 0.1006521 }, { upperL: 0.2644171 }, { upperL: 0.2707699 }, { upperL: 0.1047955 }, { upperL: 0.149312 }, { upperL: 0.1996659 }, { upperL: 0.1230314 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.076992 }, { upperL: 0.0548901 }, {}, { upperL: 0.207344 }, { upperL: 0.1378393 }, { upperL: 0.1557585 }, {}, {}, {}, {}, {}, { handL: 323e-7 }, { handL: 44e-6 }, { upperL: 0.1177835 }, { upperL: 0.1679542 }, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.0222409 }, { upperL: 0.1078554 }, { upperL: 0.0677667 }, { handL: 82e-7 }, {}, {}, {}, { upperL: 0.0216045 }, { upperL: 0.12934 }, { upperL: 0.0528863 }, { upperL: 0.0424919 }, { upperL: 0.091881 }, {}, {}, {}, { forearmL: 28e-7, handL: 806e-7 }, { forearmL: 166e-6, handL: 117e-7 }, { forearmL: 1202e-7 }, { forearmL: 208e-6 }, { upperL: 0.0210032, forearmL: 16289e-7 }, { upperL: 0.1205115 }, {}, {}, {}, {}, {}, { forearmL: 3097e-7 }, {}, { upperL: 0.0407807, forearmL: 23682e-7 }, { upperL: 0.2971574 }, { upperL: 0.0676851 }, {}, {}, { forearmL: 7626e-7 }, { upperL: 0.2050682 }, {}, {}, {}, { upperL: 0.0658994, forearmL: 8187e-7 }, { upperL: 45027e-7, forearmL: 91428e-7 }, {}, {}, {}, {}, {}, { forearmL: 56543e-7 }, { upperL: 0.0193607, forearmL: 0.0284582 }, {}, {}, { forearmL: 76797e-7 }, { forearmL: 57144e-7 }, { forearmL: 0.012114 }, {}, { upperL: 59035e-7, forearmL: 0.032602 }, {}, {}, {}, {}, {}, { forearmL: 58145e-7 }, { upperL: 20983e-7, forearmL: 0.0259551 }, { forearmL: 0.0106905 }, { upperL: 43442e-7, forearmL: 0.0143238 }, {}, {}, { upperL: 34854e-7, forearmL: 0.0238274 }, { upperL: 0.0220225, forearmL: 0.0355106 }, { upperL: 0.0703442, forearmL: 0.0214409 }, { upperL: 8072e-6, forearmL: 0.0197111 }, {}, {}, {}, {}, {}, {}, { upperL: 0.0818984 }, {}, {}, {}, {}, {}, {}, { forearmL: 15717e-7 }, {}, { upperL: 0.0774678, forearmL: 0.0282876 }, { upperL: 0.0604737 }, { upperL: 0.104034 }, { upperL: 0.0389531 }, {}, { forearmL: 8937e-7 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.186027 }, { upperL: 0.3169372 }, { upperL: 0.0813982 }, {}, {}, { forearmL: 2648e-7 }, { upperL: 0.2302939 }, {}, {}, {}, { upperL: 0.3646325 }, {}, {}, { handL: 216e-7 }, { forearmL: 2044e-7, handL: 303e-7 }, { handL: 978e-7 }, {}, { upperL: 0.4440615 }, { upperL: 0.3300559 }, { upperL: 0.3319207 }, { upperL: 0.4948287 }, { upperL: 0.1097185 }, { upperL: 0.2404114 }, { upperL: 0.0785351 }, { upperL: 0.1868173 }, { upperL: 0.1403397 }, { upperL: 0.1257629 }, { upperL: 0.2811713 }, { upperL: 0.2086127 }, { upperL: 0.12945 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.1050478 }, { upperL: 0.1374378 }, {}, {}, { upperL: 0.135276 }, { upperL: 0.154661 }, {}, { handL: 22e-6 }, { handL: 266e-7 }, {}, {}, { handL: 543e-7 }, { handL: 445e-7 }, { upperL: 0.144534 }, { upperL: 0.1430263 }, { upperL: 0.198172 }, { upperL: 0.2433425 }, {}, {}, {}, {}, { handL: 688e-7 }, { handL: 844e-7 }, { handL: 536e-7 }, { upperL: 0.0850667 }, { upperL: 0.1221009 }, { upperL: 0.2110567 }, {}, {}, {}, { upperL: 0.1356856 }, { upperL: 0.1441847 }, { upperL: 0.096502 }, {}, {}, {}, { forearmL: 426e-7, handL: 755e-7 }, { forearmL: 1228e-7, handL: 461e-7 }, { forearmL: 371e-6 }, { forearmL: 4023e-7 }, { upperL: 0.0602084 }, { upperL: 0.1362962 }, { upperL: 0.08745 }, {}, {}, { forearmL: 255e-7, handL: 1645e-7 }, {}, { forearmL: 1765e-7, handL: 835e-7 }, { forearmL: 6316e-7 }, {}, { forearmL: 5149e-7 }, { upperL: 0.1016614, forearmL: 667e-7 }, { upperL: 0.0901346, forearmL: 1966e-7 }, { upperL: 0.1209133 }, { upperL: 0.1906409 }, {}, {}, {}, {}, {}, { forearmL: 12248e-7 }, { forearmL: 16983e-7 }, { upperL: 0.1931577 }, { upperL: 0.2856717 }, { upperL: 0.0996705 }, {}, {}, { forearmL: 9322e-7 }, { forearmL: 16088e-7 }, { upperL: 0.0765745, forearmL: 0.0272699 }, { upperL: 0.0535502, forearmL: 0.016308 }, { upperL: 0.1539304 }, { upperL: 0.1093043, forearmL: 0.0163241 }, {}, { upperL: 0.0896318, forearmL: 0.026734 }, { upperL: 0.1550624 }, { upperL: 0.0776658 }, { upperL: 0.0879298 }, { forearmL: 27077e-7 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.1411635, forearmL: 0.0169167 }, {}, { upperL: 0.0806909 }, { upperL: 0.115234 }, {}, {}, { forearmL: 13935e-7 }, { upperL: 0.2365693 }, {}, { forearmL: 9132e-7 }, {}, {}, { upperL: 0.0913947 }, {}, { forearmL: 5265e-7 }, {}, {}, { upperL: 0.076798 }, { upperL: 0.3855061 }, { upperL: 0.3746589 }, {}, {}, { upperL: 0.4332381 }, { upperL: 0.4431543 }, { upperL: 0.3919328 }, { upperL: 0.3565757 }, { upperL: 0.3490345 }, { handL: 343e-7 }, {}, {}, { upperL: 0.0810289 }, { forearmL: 1937e-7, handL: 1171e-7 }, { forearmL: 74e-7, handL: 3119e-7 }, {}, { upperL: 0.3380204 }, { upperL: 0.360896 }, { upperL: 0.3733601 }, { upperL: 0.4456612 }, { upperL: 0.4440615 }, { upperL: 0.4456612 }, { upperL: 0.4440615 }, { upperL: 0.4511052 }, { upperL: 0.3813379 }, { upperL: 0.3676838 }, {}, {}, { handL: 1218e-7 }, { forearmL: 15e-7, handL: 218e-6 }, { upperL: 0.3403857 }, { upperL: 0.5149344 }, { upperL: 0.5305874 }, { upperL: 0.3553171 }, { upperL: 0.5149344 }, { upperL: 0.5305874 }, { upperL: 0.5361631 }, { upperL: 0.3579665 }, { upperL: 0.3462902 }, { upperL: 0.3542922 }, { upperL: 0.1607472 }, { upperL: 0.3481721 }, { upperL: 0.1411957 }, { upperL: 0.4114228 }, { upperL: 0.3380367 }, { upperL: 0.4984058 }, { upperL: 0.1505162 }, { upperL: 0.1393615 }, { upperL: 0.1585495 }, { upperL: 0.1994899 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.1740222 }, {}, {}, {}, {}, {}, {}, {}, { handL: 512e-7 }, { handL: 642e-7 }, { upperL: 0.1875534 }, { upperL: 0.2312506 }, { upperL: 0.3078939 }, { upperL: 0.2610202 }, { upperL: 0.2509311 }, {}, {}, {}, { handL: 227e-7 }, {}, { handL: 103e-6 }, { handL: 958e-7 }, { handL: 1262e-7 }, { handL: 13e-5 }, { upperL: 0.2680775 }, { upperL: 0.295406 }, { upperL: 0.2905223 }, { upperL: 0.1801804 }, {}, {}, {}, {}, { upperL: 0.2153943 }, { upperL: 0.2055753 }, { upperL: 0.1323336 }, { upperL: 0.3302272 }, {}, {}, {}, {}, {}, {}, { forearmL: 3217e-7, handL: 233e-7 }, { forearmL: 4242e-7, handL: 86e-7 }, { forearmL: 6066e-7 }, { upperL: 0.2126587 }, { upperL: 0.2020503 }, {}, {}, { forearmL: 911e-6 }, { upperL: 0.2835137 }, { upperL: 0.1824252 }, {}, {}, {}, {}, {}, {}, { forearmL: 3777e-7, handL: 33e-6 }, {}, { forearmL: 811e-6 }, {}, { forearmL: 12257e-7 }, { upperL: 0.1318939 }, {}, {}, {}, {}, {}, {}, { upperL: 0.2251134 }, { upperL: 0.3752911 }, { upperL: 0.0851645 }, {}, {}, {}, { forearmL: 14984e-7 }, { upperL: 0.2156969 }, { upperL: 0.294449 }, {}, { forearmL: 15881e-7 }, { upperL: 0.3209151 }, {}, {}, { upperL: 0.3762524 }, { upperL: 0.3234256 }, {}, {}, { upperL: 0.4027795 }, { upperL: 0.3557559 }, {}, {}, {}, { upperL: 0.1345287 }, {}, {}, { forearmL: 9171e-7 }, { upperL: 0.4440961 }, { upperL: 0.124622 }, { handL: 218e-7 }, { forearmL: 5963e-7, handL: 29e-7 }, { upperL: 0.4451017 }, { upperL: 0.3973366 }, { upperL: 0.4490394 }, { upperL: 0.1474593 }, {}, { upperL: 0.4134997 }, { upperL: 0.4272696 }, { upperL: 0.1403507 }, {}, { upperL: 0.4003332 }, { upperL: 0.4143834 }, { upperL: 0.4503128 }, { upperL: 0.4487039 }, { upperL: 0.4494008 }, { upperL: 0.4503128 }, { upperL: 0.4487039 }, { upperL: 0.1837127 }, {}, { forearmL: 394e-6, handL: 269e-7 }, { upperL: 0.4448824 }, { upperL: 0.3940576 }, { upperL: 0.3963093 }, { upperL: 0.4463264 }, { upperL: 0.447782 }, { upperL: 0.4468872 }, { upperL: 0.3994064 }, { upperL: 0.4465164 }, { upperL: 0.4465164 }, { upperL: 0.4440961 }, { upperL: 0.4463264 }, { upperL: 0.4484869 }, { upperL: 0.4487196 }, { upperL: 0.4487196 }, { upperL: 0.447782 }, { upperL: 0.4493196 }, { upperL: 0.4493196 }, { upperL: 0.447782 }, { upperL: 0.4468872 }, { upperL: 0.4101608 }, { upperL: 0.4493196 }, { upperL: 0.4465164 }, { upperL: 0.4499222 }, { upperL: 0.4468872 }, { upperL: 0.4487039 }, { upperL: 0.4484869 }, { upperL: 0.4494008 }, { upperL: 0.4494008 }, { upperL: 0.4487196 }, { upperL: 0.4493196 }, { upperL: 0.4484869 }, { upperL: 0.4405206 }, {}, {}, { upperL: 0.4471063 }, { upperL: 0.4468097 }, { upperL: 0.4463264 }, { upperL: 0.4448824 }, { upperL: 0.4471166 }, { upperL: 0.4471166 }, { upperL: 0.4448824 }, { upperL: 0.4471063 }, { upperL: 0.4030452 }, { upperL: 0.3980228 }, { upperL: 0.3982078 }, { upperL: 0.4471063 }, { upperL: 0.4501128 }, { upperL: 0.4463264 }, { upperL: 0.4471166 }, { upperL: 0.4471063 }, { upperL: 0.4256115 }, { handL: 533e-7 }, {}, { forearmL: 3058e-7, handL: 924e-7 }, { upperL: 0.4534712 }, { upperL: 0.4113268 }, { upperL: 0.4434342 }, { upperL: 0.4432024 }, { upperL: 0.4478422 }, { upperL: 0.4468097 }, { upperL: 0.4478422 }, { upperL: 0.4431543 }, { upperL: 0.4434342 }, { upperL: 0.4478422 }, { upperL: 0.3938827 }, { upperL: 0.4164485 }, { upperL: 0.4434342 }, { upperL: 0.4432024 }, { handL: 492e-7 }, { handL: 889e-7 }, { upperL: 0.5327905 }, { upperL: 0.4783865 }, { upperL: 0.4626804 }, { upperL: 0.4432024 }, { upperL: 0.4332381 }, { upperL: 0.5207502 }, { upperL: 0.5745977 }, { upperL: 0.4056763 }, { upperL: 0.441492 }, { upperL: 0.3733601 }, { upperL: 0.4667 }, { upperL: 0.6159429 }, { upperL: 0.555039 }, { upperL: 0.5155166 }, { upperL: 0.5149344 }, { upperL: 0.4952358 }, { upperL: 0.4434244 }, { upperL: 0.5226021 }, { upperL: 0.4151635 }, { upperL: 0.5361631 }, { upperL: 0.3736001 }, { upperL: 0.1479064 }, { upperL: 0.5799952 }, { upperL: 0.5876555 }, { upperL: 0.5500885 }, { upperL: 0.5488528 }, { upperL: 0.3614464 }, { upperL: 0.5305874 }, { upperL: 0.5488528 }, { upperL: 0.4010478 }, { upperL: 0.3726452 }, { upperL: 0.5626666 }, { upperL: 0.5625524 }, { upperL: 0.5626666 }, { upperL: 0.5625524 }, { upperL: 0.5788342 }, { upperL: 0.4345092 }, { upperL: 0.6334094 }, { upperL: 0.4115683 }, { upperL: 0.5808847 }, { upperL: 0.5788342 }, { upperL: 0.1591971 }, { upperL: 0.1624965 }, { upperL: 0.5437985 }, { upperL: 0.4818529 }, { upperL: 0.1917315 }, { upperL: 0.2040543 }, { upperL: 0.1617984 }, { upperL: 0.266669 }, { upperL: 0.1678927 }, { upperL: 0.1420206 }, { upperL: 0.1810293 }, { upperL: 0.1699278 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { handL: 458e-7 }, { handL: 639e-7 }, { handL: 824e-7 }, { upperL: 0.3467448 }, { upperL: 0.3373147 }, {}, {}, {}, { upperL: 0.3647381 }, { upperL: 0.3490911 }, { upperL: 0.3824438 }, { handL: 287e-7 }, { handL: 281e-7 }, {}, {}, { handL: 1192e-7 }, { handL: 1481e-7 }, { handL: 1646e-7 }, { handL: 1553e-7 }, { upperL: 0.2653788 }, {}, {}, {}, {}, {}, { forearmL: 251e-7, handL: 1991e-7 }, { upperL: 0.3561603 }, { upperL: 0.4059163 }, {}, {}, {}, { upperL: 0.4401576 }, { upperL: 0.2378115 }, { upperL: 0.3150734 }, { upperL: 0.3302034 }, {}, {}, {}, {}, { forearmL: 75e-7, handL: 2804e-7 }, { forearmL: 5407e-7, handL: 132e-7 }, { upperL: 0.3426942 }, { upperL: 0.1524872 }, {}, { forearmL: 5653e-7, handL: 144e-7 }, { forearmL: 6903e-7 }, {}, { upperL: 0.270098 }, { upperL: 0.1552215 }, { forearmL: 9928e-7 }, { upperL: 0.3832432 }, { upperL: 0.4196801 }, {}, {}, {}, {}, {}, { forearmL: 7468e-7 }, { forearmL: 9577e-7 }, { upperL: 0.1248377 }, { upperL: 0.2293604 }, {}, {}, { upperL: 0.4308115 }, { upperL: 0.4422519 }, { upperL: 0.4422205 }, {}, {}, { forearmL: 9035e-7 }, { forearmL: 11287e-7 }, { upperL: 0.446585 }, { upperL: 0.4242216 }, {}, { upperL: 0.413227 }, {}, { handL: 535e-7 }, { forearmL: 5448e-7, handL: 653e-7 }, { forearmL: 6956e-7 }, { upperL: 0.4465117 }, { upperL: 0.4353161 }, { upperL: 0.4221599 }, { upperL: 0.4522813 }, { upperL: 0.4442052 }, { upperL: 0.4384137 }, { upperL: 0.4432644 }, { upperL: 0.4488854 }, { upperL: 0.4193796 }, { upperL: 0.4483735 }, { upperL: 0.4483735 }, { upperL: 0.446585 }, { upperL: 0.4465117 }, { upperL: 0.446585 }, { upperL: 0.4483735 }, { upperL: 0.4529384 }, { upperL: 0.4522813 }, { upperL: 0.4488854 }, { upperL: 0.4266323 }, { upperL: 0.449585 }, {}, {}, {}, {}, {}, { forearmL: 5011e-7, handL: 593e-7 }, { upperL: 0.4512739 }, { upperL: 0.4512739 }, { upperL: 0.4510282 }, { upperL: 0.4512739 }, { upperL: 0.4510282 }, { upperL: 0.4522449 }, { upperL: 0.4595056 }, { upperL: 0.4536914 }, { upperL: 0.4536914 }, { upperL: 0.4617338 }, { upperL: 0.464718 }, { upperL: 0.4391628 }, { upperL: 0.127401 }, {}, {}, { forearmL: 13e-6, handL: 3475e-7 }, { forearmL: 6e-7, handL: 3302e-7 }, { forearmL: 3615e-7, handL: 1388e-7 }, { upperL: 0.4503128 }, { upperL: 0.4503128 }, {}, {}, { upperL: 0.6306809, forearmL: 243e-7 }, { upperL: 0.5415285 }, { handL: 1468e-7 }, { handL: 155e-6 }, { handL: 1806e-7 }, { handL: 2825e-7 }, { upperL: 0.6190959, forearmL: 34e-7 }, { upperL: 0.536883 }, { upperL: 0.6457354, forearmL: 95789e-7 }, { upperL: 0.5494297 }, { upperL: 0.6501848, forearmL: 51576e-7 }, { upperL: 0.5963941 }, { upperL: 0.5678878 }, { upperL: 0.6144914 }, { upperL: 0.5273695 }, { upperL: 0.1152265 }, { upperL: 0.1379554 }, { upperL: 0.5780168 }, { upperL: 0.1024453 }, { upperL: 0.5934257 }, { upperL: 0.5980367 }, { upperL: 0.6643321 }, { upperL: 0.659098 }, { upperL: 0.5266244 }, { upperL: 0.6183141 }, { upperL: 0.4949842 }, { upperL: 0.5514395 }, { upperL: 0.4601319 }, { upperL: 0.5053053 }, { upperL: 0.4711928 }, { upperL: 0.4287803 }, { upperL: 0.6406046 }, { upperL: 0.4959534 }, { upperL: 0.6206342 }, { upperL: 0.6053091 }, { upperL: 0.6053091 }, { upperL: 0.6102806 }, { upperL: 0.199806 }, { upperL: 0.4527232 }, { upperL: 0.18301 }, { upperL: 0.1966456 }, { upperL: 0.4064342 }, { upperL: 0.2309463 }, { upperL: 0.2470332 }, { upperL: 0.3454617 }, { upperL: 0.3912596 }, { upperL: 0.3473768 }, { upperL: 0.2222555 }, { upperL: 0.2510986 }, { upperL: 0.3491486 }, { upperL: 0.2259178 }, { upperL: 0.3109339 }, { upperL: 0.2302847 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { handL: 604e-7 }, { upperL: 0.3402943 }, {}, {}, {}, {}, { upperL: 0.3945198 }, { upperL: 0.415291 }, { upperL: 0.4003864 }, { upperL: 0.3786052 }, {}, {}, {}, {}, { handL: 1316e-7 }, { handL: 1678e-7 }, { handL: 1869e-7 }, { upperL: 0.3988584 }, { handL: 726e-7 }, {}, {}, {}, { upperL: 0.4803286 }, { upperL: 0.4392168 }, { upperL: 0.3700151 }, {}, { handL: 2064e-7 }, { forearmL: 2e-7, handL: 321e-6 }, {}, { handL: 652e-7 }, { handL: 2121e-7 }, {}, {}, { upperL: 0.4260575 }, { upperL: 0.4983533 }, { upperL: 0.4580841 }, { upperL: 0.1938417 }, { handL: 301e-7 }, {}, {}, {}, {}, { upperL: 0.5008869 }, { upperL: 0.4950459 }, { upperL: 0.4753847 }, { handL: 627e-7 }, {}, { forearmL: 4442e-7, handL: 1335e-7 }, { upperL: 0.4266783 }, { upperL: 0.4254454 }, {}, {}, { forearmL: 302e-7, handL: 3587e-7 }, { forearmL: 2255e-7, handL: 2876e-7 }, { forearmL: 6836e-7, handL: 102e-7 }, { upperL: 0.4629558 }, { upperL: 0.476644 }, { upperL: 0.438653 }, { upperL: 0.4890563 }, {}, {}, { forearmL: 28e-7, handL: 3736e-7 }, { forearmL: 5096e-7, handL: 945e-7 }, { upperL: 0.4553167 }, { upperL: 0.4553167 }, { upperL: 0.43761 }, { upperL: 0.4545508 }, { upperL: 0.4441316 }, { handL: 602e-7 }, {}, { handL: 352e-6 }, { forearmL: 2607e-7, handL: 2155e-7 }, {}, { upperL: 0.4496413 }, { upperL: 0.5421496 }, { upperL: 0.4372986 }, { upperL: 0.4440593 }, { upperL: 0.1663042 }, {}, { handL: 2599e-7 }, {}, { upperL: 0.4422519 }, { upperL: 0.4442052 }, { upperL: 0.4522813 }, {}, {}, {}, { handL: 2323e-7 }, { upperL: 0.5800509 }, { handL: 91e-6 }, { handL: 1116e-7 }, { upperL: 0.643405 }, { upperL: 0.6481056, forearmL: 0.0188025 }, { upperL: 0.639216, forearmL: 3e-7 }, { upperL: 0.6442913, forearmL: 491e-7 }, { upperL: 0.6690461, forearmL: 12507e-7 }, { upperL: 0.5868679, forearmL: 0.1703748 }, { upperL: 0.6463316, forearmL: 74207e-7 }, { upperL: 0.6201796, forearmL: 0.0933993 }, { upperL: 0.6689584, forearmL: 0.0753182 }, { upperL: 0.68939 }, { upperL: 0.655315 }, { upperL: 0.7137027 }, { upperL: 0.7418082 }, { upperL: 0.7332137 }, { upperL: 0.2201191 }, { upperL: 0.5720178 }, { upperL: 0.6232715 }, { upperL: 0.5195593 }, { upperL: 0.5800256 }, { upperL: 0.5143545 }, { upperL: 0.6345712 }, { upperL: 0.6923858 }, { upperL: 0.6031473 }, { upperL: 0.5096722 }, { upperL: 0.2229793 }, { upperL: 0.5708035 }, { upperL: 0.2500394 }, { upperL: 0.4898683 }, { upperL: 0.3113183 }, { upperL: 0.3024412 }, { upperL: 0.3196419 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { handL: 1247e-7 }, { upperL: 0.4506837 }, { upperL: 0.4731664 }, { upperL: 0.4278379 }, { handL: 833e-7 }, {}, { upperL: 0.4745897 }, { upperL: 0.4525292 }, { upperL: 0.4470218 }, { upperL: 0.3357999 }, { handL: 1705e-7 }, { upperL: 0.495994 }, { upperL: 0.4805695 }, { handL: 118e-6 }, {}, { handL: 1452e-7 }, { upperL: 0.5141946 }, { upperL: 0.5033175 }, { upperL: 0.4631297 }, { upperL: 0.5036103 }, { upperL: 0.5473377 }, { upperL: 0.5000663 }, { upperL: 0.5710941 }, {}, { handL: 105e-6 }, {}, { handL: 1308e-7 }, {}, { handL: 2259e-7 }, { upperL: 0.5030293 }, { upperL: 0.228756 }, { upperL: 0.2731873 }, {}, { handL: 2389e-7 }, { upperL: 0.5045481 }, { upperL: 0.5045481 }, { upperL: 0.5308453 }, { upperL: 0.579315 }, { upperL: 0.4931684 }, { upperL: 0.5684379 }, { upperL: 0.5141946 }, { upperL: 0.5912223 }, { handL: 918e-7 }, {}, { handL: 1526e-7 }, { upperL: 0.4890563 }, { upperL: 0.4260575 }, { upperL: 0.5113396 }, { upperL: 0.2255595 }, { handL: 2041e-7 }, { upperL: 0.6193069 }, { upperL: 0.5807883 }, { upperL: 0.1753402 }, { upperL: 0.6152016 }, { upperL: 0.1892879 }, { upperL: 0.2207334 }, { upperL: 0.1870028 }, { upperL: 0.5874568, forearmL: 0.1807673 }, { upperL: 0.7008059, forearmL: 18005e-7 }, { upperL: 0.237419 }, { upperL: 0.4894732, forearmL: 0.2582898 }, { upperL: 0.5792763, forearmL: 0.1420668 }, { upperL: 0.5526822, forearmL: 0.1877726 }, { upperL: 0.6713968, forearmL: 0.0544708 }, { upperL: 0.507836, forearmL: 0.2426343 }, { upperL: 0.600106, forearmL: 0.1807087 }, { upperL: 0.2471852 }, { upperL: 0.259608 }, { upperL: 0.6579459, forearmL: 24e-7 }, { upperL: 0.1913606 }, { upperL: 0.2258004 }, { upperL: 0.2147149 }, { upperL: 0.2252433 }, { upperL: 0.8059552 }, { upperL: 0.7775718 }, { upperL: 0.6305355 }, { upperL: 0.5738123 }, { upperL: 0.6605304 }, { upperL: 0.5782203 }, { upperL: 0.5323292 }, { upperL: 0.6824713 }, { upperL: 0.6692872 }, { upperL: 0.5650959 }, { upperL: 0.2517812 }, { upperL: 0.275166 }, { upperL: 0.4828262 }, { upperL: 0.607457 }, { upperL: 0.449561 }, { upperL: 0.4428333 }, { upperL: 0.5249973 }, { upperL: 0.5149711 }, { upperL: 0.2969473 }, { upperL: 0.3012498 }, { upperL: 0.4477171 }, { upperL: 0.3581092 }, { upperL: 0.5108489 }, { upperL: 0.510959 }, { upperL: 0.4162773 }, { upperL: 0.5631058 }, { upperL: 0.5746733 }, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { upperL: 0.4483685 }, { upperL: 0.450849 }, { upperL: 0.4609107 }, { upperL: 0.3750964 }, { upperL: 0.5500481 }, { upperL: 0.5955895 }, { upperL: 0.5499166 }, { upperL: 0.5854567 }, { upperL: 0.6934624 }, { upperL: 0.2567147 }, { upperL: 0.6588137 }, { upperL: 0.7070432 }, { upperL: 0.7161306 }, { upperL: 0.6551371 }, { upperL: 0.2852278 }, { upperL: 0.2361235 }, { upperL: 0.653517 }, { upperL: 0.2609728 }, { upperL: 0.2436497 }, { upperL: 0.6487589 }, { upperL: 0.6851869 }, { upperL: 0.7058384 }, { upperL: 0.2356219, forearmL: 0.618939 }, { upperL: 0.536309, forearmL: 0.256442 }, { upperL: 0.1398125, forearmL: 0.7064077 }, { upperL: 0.7173245, forearmL: 638e-7 }, { upperL: 0.695345 }, { upperL: 0.0539341, forearmL: 0.7907371 }, { upperL: 0.0155605, forearmL: 0.8637939 }, { upperL: 0.3843615, forearmL: 0.3945474 }, { upperL: 0.7188191, forearmL: 0.0681378 }, { upperL: 0.687077, forearmL: 0.0501651 }, { upperL: 0.2287835 }, { upperL: 3634e-7, forearmL: 0.8842973 }, { upperL: 0.0676862, forearmL: 0.8171956 }, { upperL: 503e-6, forearmL: 0.9073819 }, { upperL: 0.0110158, forearmL: 0.885882 }, { upperL: 0.4178567, forearmL: 0.3940736 }, { upperL: 0.185566, forearmL: 0.6791061 }, { upperL: 0.5367008, forearmL: 0.2657308 }, { upperL: 0.2250292, forearmL: 0.6238865 }, { upperL: 0.4036163, forearmL: 0.3702194 }, { upperL: 0.2168031, forearmL: 0.5950943 }, { upperL: 0.5275933, forearmL: 0.2561058 }, { upperL: 0.2271034 }, { upperL: 38858e-7, forearmL: 0.8681315 }, { upperL: 0.4252557, forearmL: 0.3799516 }, { upperL: 0.2261439 }, { upperL: 0.3637158, forearmL: 0.4580448 }, { upperL: 0.3833562, forearmL: 0.3973731 }, { upperL: 0.5077368, forearmL: 0.2664625 }, { upperL: 0.1028861, forearmL: 0.7686553 }, { upperL: 0.5429299, forearmL: 0.237367 }, { upperL: 0.1266201, forearmL: 0.7394366 }, { upperL: 0.2520703 }, { upperL: 0.6397064, forearmL: 0.0975543 }, { upperL: 0.6741614, forearmL: 0.1071535 }, { upperL: 0.725724, forearmL: 0.0477562 }, { upperL: 0.2424503 }, { upperL: 0.7039274, forearmL: 0.0904699 }, { upperL: 0.8102455, forearmL: 0.0651492 }, { upperL: 0.2636992 }, { upperL: 0.7523876 }, { upperL: 0.2324088 }, { upperL: 0.2728057 }, { upperL: 0.8285537 }, { upperL: 0.8349144 }, { upperL: 0.7119482 }, { upperL: 0.7334601 }, { upperL: 0.7504359 }, { upperL: 0.7090349 }, { upperL: 0.6183955 }, { upperL: 0.6918278 }, { upperL: 0.6315133 }, { upperL: 0.6024656 }, { upperL: 0.6515701 }, { upperL: 0.6389799 }, { upperL: 0.2760553 }, { upperL: 0.3145195 }, { upperL: 0.6410637 }, { upperL: 0.2801323 }, { upperL: 0.6489208 }, { upperL: 0.5807289 }, { upperL: 0.636098 }, { upperL: 0.6533692 }, { upperL: 0.4848345 }, { upperL: 0.7147167 }, { upperL: 0.5026683 }, { upperL: 0.6534063 }, { upperL: 0.6583675 }, { upperL: 0.5762229 }, { upperL: 0.5144724 }, { upperL: 0.6105259 }, { upperL: 0.75133 }, { upperL: 0.755222 }, { upperL: 0.3030033 }, { upperL: 0.7427258 }, { upperL: 0.7233509 }, { upperL: 0.787618 }, { upperL: 0.7172413 }, { upperL: 0.7126153 }, { upperL: 0.7810324 }, { upperL: 0.794071 }, { upperL: 0.805649, forearmL: 0.0176462 }, { upperL: 0.2718587 }, { upperL: 0.2816787 }, { upperL: 0.256337 }, { upperL: 0.7910834, forearmL: 0.0207784 }, { upperL: 0.775393, forearmL: 0.0123043 }, { upperL: 0.2362161 }, { forearmL: 0.9305201 }, { forearmL: 0.9306832 }, { upperL: 0.0256212, forearmL: 0.8572282 }, { upperL: 0.0630587, forearmL: 0.8343147 }, { upperL: 0.0197284, forearmL: 0.9050387 }, { upperL: 306e-7, forearmL: 0.9296845 }, { upperL: 0.219813, forearmL: 0.6657625 }, { upperL: 0.0378141, forearmL: 0.8658791 }, { upperL: 0.5108906, forearmL: 0.3456538 }, { upperL: 0.7576009, forearmL: 0.0710329 }, { forearmL: 0.9315454 }, { forearmL: 0.9304872 }, { upperL: 41714e-7, forearmL: 0.9054229 }, { upperL: 12213e-7, forearmL: 0.9167824 }, { upperL: 0.5036185, forearmL: 0.331245 }, { upperL: 0.5781959, forearmL: 0.2620885 }, { upperL: 0.2697043 }, { forearmL: 0.9255808 }, { forearmL: 0.9250105 }, { forearmL: 0.9164655 }, { upperL: 0.2685876 }, { upperL: 0.2391681 }, { forearmL: 0.9360255 }, { forearmL: 0.9410377 }, { upperL: 4679e-7, forearmL: 0.9091402 }, { forearmL: 0.9034421 }, { forearmL: 0.9300051 }, { upperL: 0.2376505 }, { upperL: 0.2523168 }, { forearmL: 0.9497109 }, { upperL: 12798e-7, forearmL: 0.9085181 }, { forearmL: 0.9043928 }, { upperL: 0.1203074, forearmL: 0.751303 }, { upperL: 0.032015, forearmL: 0.8547829 }, { upperL: 0.0419948, forearmL: 0.8543664 }, { upperL: 1032e-6, forearmL: 0.9262971 }, { upperL: 0.0594018, forearmL: 0.8408838 }, { upperL: 0.0355917, forearmL: 0.8510106 }, { upperL: 0.0487668, forearmL: 0.8703455 }, { upperL: 0.363554, forearmL: 0.4743804 }, { upperL: 0.5130892, forearmL: 0.2782617 }, { upperL: 0.744563, forearmL: 0.101921 }, { upperL: 0.3004783 }, { upperL: 0.8402919 }, { upperL: 0.897365 }, { upperL: 0.7099835 }, { upperL: 0.3474792 }, { upperL: 0.385192 }, { upperL: 0.7798853 }, { upperL: 0.6765826 }, { upperL: 0.6270887 }, { upperL: 0.3240569 }, { upperL: 0.3691445 }, { upperL: 0.8149221 }, { upperL: 0.6217361 }, { upperL: 0.5164511 }, { upperL: 0.7829691 }, { upperL: 0.8173441 }, { upperL: 0.3537076 }, { upperL: 0.3116732 }, { upperL: 0.7722561 }, { upperL: 0.7605829 }, { upperL: 0.2710565 }, { upperL: 0.2968629 }, { upperL: 0.2917292 }, { upperL: 0.2553081 }, { forearmL: 0.9402067 }, { upperL: 0.0203336, forearmL: 0.9045922 }, { upperL: 0.0282731, forearmL: 0.9025366 }, { upperL: 0.305919, forearmL: 0.598575 }, { upperL: 0.0678771, forearmL: 0.8772221 }, { upperL: 0.6128402, forearmL: 0.2733722 }, { upperL: 0.2758367, forearmL: 0.650981 }, { upperL: 0.7912155, forearmL: 0.0720384 }, { upperL: 0.7983276, forearmL: 31756e-7 }, { forearmL: 0.9645614 }, { forearmL: 0.9414248 }, { upperL: 57e-7, forearmL: 0.9346521 }, { upperL: 0.6024804, forearmL: 0.2646772 }, { upperL: 0.2974006 }, { forearmL: 0.9662156 }, { forearmL: 0.9376248 }, { forearmL: 0.9660418 }, { upperL: 0.2882138 }, { upperL: 0.2477868 }, { upperL: 0.2849005 }, { upperL: 0.2388506 }, { forearmL: 0.9669857 }, { forearmL: 0.957676 }, { forearmL: 0.9398775 }, { forearmL: 0.9605561 }, { forearmL: 0.9601589 }, { upperL: 0.277605 }, { upperL: 0.3054951 }, { forearmL: 0.9705732 }, { upperL: 0.0199284, forearmL: 0.9249529 }, { upperL: 0.0531102, forearmL: 0.915548 }, { upperL: 0.0564033, forearmL: 0.8820506 }, { upperL: 0.1812635, forearmL: 0.7587891 }, { upperL: 0.3353935, forearmL: 0.6082776 }, { upperL: 0.3105912 }, { upperL: 0.3028984, forearmL: 0.6507067 }, { upperL: 0.3069046 }, { upperL: 0.3323869 }, { upperL: 0.8356223, forearmL: 58389e-7 }, { upperL: 0.8655107, forearmL: 0.0541072 }, { upperL: 0.7821077 }, { upperL: 0.8599204 }, { upperL: 0.8261293 }, { upperL: 0.8370647 }, { upperL: 0.662861 }, { upperL: 0.7006674 }, { upperL: 0.8595277 }, { upperL: 0.7688084 }, { upperL: 0.7494083 }, { upperL: 0.6572641 }, { upperL: 0.6762941 }, { upperL: 0.5842114 }, { upperL: 0.8207455 }, { upperL: 0.8521733 }, { upperL: 0.8125925 }, { upperL: 0.784542 }, { upperL: 0.3319261 }, { upperL: 0.8714731 }, { upperL: 0.8634194, forearmL: 551e-7 }, { upperL: 0.8871041 }, { upperL: 0.2881261 }, { upperL: 0.2800687 }, { upperL: 0.2881027 }, { forearmL: 0.9823097 }, { forearmL: 0.9422812 }, { forearmL: 0.9535628 }, { upperL: 17511e-7, forearmL: 0.9486616 }, { upperL: 0.0428202, forearmL: 0.9038168 }, { upperL: 0.0562167, forearmL: 0.9002142 }, { upperL: 0.3515473, forearmL: 0.5832351 }, { upperL: 0.4828985, forearmL: 0.4689357 }, { upperL: 0.6500733, forearmL: 0.269211 }, { upperL: 0.3312883 }, { forearmL: 0.9721836 }, { forearmL: 0.9687527 }, { upperL: 0.2299065, forearmL: 0.7113206 }, { upperL: 0.5237024, forearmL: 0.3866743 }, { upperL: 0.8163086, forearmL: 0.0358623 }, { upperL: 0.7864311, forearmL: 0.0931894 }, { upperL: 0.3164472 }, { upperL: 0.3116735 }, { forearmL: 0.9619486 }, { upperL: 0.2920428 }, { forearmL: 0.980302 }, { upperL: 0.3110185 }, { forearmL: 0.9792961 }, { upperL: 0.2580123 }, { forearmL: 0.9810267 }, { forearmL: 0.9895042 }, { forearmL: 0.9780048 }, { forearmL: 0.9649049 }, { forearmL: 0.9658312 }, { upperL: 0.3080308 }, { upperL: 74613e-7, forearmL: 0.9925387 }, { upperL: 0.076216, forearmL: 0.8793818 }, { upperL: 0.0655244, forearmL: 0.9201364 }, { upperL: 0.3698842, forearmL: 0.5905053 }, { upperL: 0.0861286, forearmL: 0.9138714 }, { upperL: 0.3087605 }, { upperL: 0.4963029, forearmL: 0.4844888 }, { upperL: 0.7857786, forearmL: 0.1183386 }, { upperL: 0.3196119 }, { upperL: 0.3228674 }, { upperL: 0.8836902, forearmL: 0.067824 }, { upperL: 0.8668721 }, { upperL: 0.9119506 }, { upperL: 0.8886481 }, { upperL: 0.9092822 }, { upperL: 0.8866538 }, { upperL: 0.8597783 }, { upperL: 0.8312425 }, { upperL: 0.7287746 }, { upperL: 0.912676 }, { upperL: 0.8576651 }, { upperL: 0.4890519 }, { upperL: 1 }, { upperL: 0.7997658 }, { upperL: 0.4845887 }, { upperL: 0.8451546 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.6019661 }, { upperL: 0.5788836 }, { upperL: 0.4660296 }, { upperL: 0.4194102 }, { upperL: 0.9297682 }, { upperL: 0.913644 }, { upperL: 0.8548417 }, { upperL: 0.8713871 }, { upperL: 0.8833359 }, { upperL: 0.9451692 }, { upperL: 0.3649327 }, { upperL: 0.4260115 }, { upperL: 0.3489816 }, { forearmL: 0.9795334 }, { forearmL: 0.9706628 }, { forearmL: 1 }, { upperL: 0.0382302, forearmL: 0.9155792 }, { forearmL: 1 }, { upperL: 90401e-7, forearmL: 0.9909599 }, { upperL: 0.3051789, forearmL: 0.6437104 }, { upperL: 0.8287953, forearmL: 0.057436 }, { upperL: 0.787667, forearmL: 0.212333 }, { upperL: 0.9010518 }, { upperL: 0.9089256 }, { upperL: 0.3646657 }, { upperL: 0.3166298 }, { upperL: 0.062961, forearmL: 0.897263 }, { upperL: 0.2289556, forearmL: 0.7330796 }, { upperL: 0.4832655, forearmL: 0.467182 }, { upperL: 0.6961062, forearmL: 0.2431663 }, { upperL: 0.6745873, forearmL: 0.2483853 }, { upperL: 0.7134037, forearmL: 0.2325054 }, { upperL: 0.8395966, forearmL: 0.0434907 }, { upperL: 0.3118848 }, { forearmL: 1 }, { forearmL: 0.968968 }, { forearmL: 0.9828968 }, { upperL: 0.3712158 }, { upperL: 0.3258438 }, { forearmL: 0.9818587 }, { forearmL: 0.9873177 }, { forearmL: 0.9806905 }, { forearmL: 0.9776066 }, { upperL: 0.3328999 }, { upperL: 0.3416519 }, { upperL: 0.3185468 }, { forearmL: 1 }, { upperL: 0.3210858 }, { upperL: 0.33748 }, { forearmL: 1 }, { forearmL: 0.9838388 }, { upperL: 0.339076 }, { upperL: 0.3267635 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.0316215, forearmL: 0.9421011 }, { upperL: 0.327148 }, { upperL: 0.3571827 }, { upperL: 0.3994192 }, { upperL: 0.4890167, forearmL: 0.481332 }, { upperL: 0.4803421, forearmL: 0.5196579 }, { upperL: 0.8254532, forearmL: 0.1147069 }, { upperL: 0.4546402 }, { upperL: 0.4494514 }, { upperL: 0.9453311 }, { upperL: 0.955265 }, { upperL: 1 }, { upperL: 0.9447331 }, { upperL: 0.9541323 }, { upperL: 1 }, { upperL: 0.937048 }, { upperL: 0.8687838 }, { upperL: 0.8476673 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.5251492 }, { upperL: 0.9359157 }, { upperL: 0.7449657 }, { upperL: 0.5408755 }, { upperL: 0.8384868 }, { upperL: 0.6284764 }, { upperL: 0.5221331 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 0.9785523 }, { forearmL: 0.9820962 }, { forearmL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.6678279 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.4732468 }, { forearmL: 1 }, { upperL: 0.3555923, forearmL: 0.6444077 }, { upperL: 0.6419517, forearmL: 0.3580483 }, { upperL: 0.6957991, forearmL: 0.3042009 }, { upperL: 0.3392802 }, { upperL: 0.3727986 }, { upperL: 0.3177991 }, { forearmL: 0.9999874, handL: 126e-7 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.4527084 }, { forearmL: 0.9312848, handL: 0.0687152 }, { forearmL: 1 }, { upperL: 0.3657493 }, { upperL: 0.3279163 }, { upperL: 0.3374632 }, { upperL: 0.3566686 }, { upperL: 0.359282 }, { forearmL: 1 }, { upperL: 0.3447009 }, { upperL: 0.3788123 }, { upperL: 0.3941923 }, { upperL: 0.3702182 }, { upperL: 0.3737594 }, { upperL: 0.4074384 }, { upperL: 0.025114, forearmL: 0.9643198 }, { upperL: 0.0263943, forearmL: 0.9736057 }, { upperL: 0.019356, forearmL: 0.980644 }, { upperL: 0.1612257, forearmL: 0.8305208 }, { upperL: 0.0998721, forearmL: 0.9001279 }, { upperL: 0.0766715, forearmL: 0.9233285 }, { upperL: 0.1129175, forearmL: 0.8870825 }, { upperL: 0.4070804, forearmL: 0.5929196 }, { upperL: 0.6586484, forearmL: 0.3413516 }, { upperL: 0.4972946 }, { upperL: 0.5326219, forearmL: 0.4673781 }, { upperL: 0.9468868, forearmL: 0.0531132 }, { upperL: 0.653689 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.0240253, forearmL: 0.9759747 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.7272815 }, { upperL: 0.6082825 }, { upperL: 0.5725931 }, { upperL: 0.4094077 }, { forearmL: 0.9612688, handL: 0.0387312 }, { forearmL: 0.9959503, handL: 40497e-7 }, { forearmL: 0.9751481, handL: 0.0248519 }, { upperL: 0.0227971, forearmL: 0.9772029 }, { upperL: 0.4173934, forearmL: 0.5826066 }, { upperL: 0.7895976, forearmL: 0.2104024 }, { upperL: 0.5500266 }, { upperL: 0.5087979 }, { upperL: 0.5046159 }, { upperL: 0.38625 }, { forearmL: 0.8526839, handL: 0.1473161 }, { forearmL: 0.8301197, handL: 0.1698803 }, { forearmL: 1 }, { upperL: 0.3818361 }, { upperL: 0.4409866 }, { upperL: 0.3909988 }, { forearmL: 1 }, { upperL: 0.3737098 }, { upperL: 0.3966052 }, { upperL: 0.386824 }, { forearmL: 1 }, { upperL: 0.3727288 }, { upperL: 0.3928003 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.4851879 }, { upperL: 0.4438294 }, { upperL: 0.4403701 }, { upperL: 0.4892359 }, { upperL: 25958e-7, forearmL: 0.9974042 }, { upperL: 93604e-7, forearmL: 0.9906396 }, { upperL: 0.0108976, forearmL: 0.9891024 }, { upperL: 0.078297, forearmL: 0.921703 }, { upperL: 0.0601809, forearmL: 0.9398191 }, { upperL: 0.5253639 }, { upperL: 0.1139128, forearmL: 0.8860872 }, { upperL: 0.1997316, forearmL: 0.8002684 }, { upperL: 0.5750737, forearmL: 0.4249263 }, { upperL: 0.7156977, forearmL: 0.2843023 }, { upperL: 0.9393662, forearmL: 0.0606338 }, { upperL: 0.9164559, forearmL: 0.0835441 }, { upperL: 0.9524834, forearmL: 0.0475166 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.7868395 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 0.9998723, handL: 1277e-7 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 0.4274474, handL: 0.5725526 }, { forearmL: 0.7871159, handL: 0.2128841 }, { forearmL: 0.9869148, handL: 0.0130852 }, { upperL: 0.2549097, forearmL: 0.7450903 }, { upperL: 0.9986575, forearmL: 13425e-7 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.7307587 }, { upperL: 0.5982163 }, { forearmL: 0.9706291, handL: 0.0293709 }, { upperL: 0.3033906, forearmL: 0.6966094 }, { upperL: 0.8404901, forearmL: 0.1595099 }, { upperL: 0.6128602 }, { upperL: 0.6109112 }, { upperL: 0.561347 }, { upperL: 0.5335606 }, { upperL: 0.4851853 }, { forearmL: 0.9257917, handL: 0.0742083 }, { forearmL: 0.8969086, handL: 0.1030914 }, { upperL: 0.4603743 }, { upperL: 0.4703592 }, { upperL: 0.5285985 }, { forearmL: 0.7968562, handL: 0.2031438 }, { upperL: 0.4289469 }, { forearmL: 0.7955878, handL: 0.2044122 }, { upperL: 0.4302326 }, { upperL: 0.5018323 }, { upperL: 0.4538577 }, { upperL: 0.4207408 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.4290318 }, { forearmL: 1 }, { upperL: 0.4397998 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.444905 }, { forearmL: 1 }, { upperL: 0.0137742, forearmL: 0.9862258 }, { upperL: 0.575472 }, { upperL: 0.089707, forearmL: 0.910293 }, { upperL: 0.0432591, forearmL: 0.9567409 }, { upperL: 0.0906876, forearmL: 0.9093124 }, { upperL: 0.6779057, forearmL: 0.3220943 }, { upperL: 0.6572359, forearmL: 0.3427641 }, { upperL: 0.6171629 }, { upperL: 0.6848809 }, { upperL: 0.7239885, forearmL: 0.2760115 }, { upperL: 0.9999673, forearmL: 327e-7 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 0.9137257, handL: 0.0862743 }, { forearmL: 0.3550634, handL: 0.6449366 }, { forearmL: 0.6273853, handL: 0.3726147 }, { upperL: 0.9970722, forearmL: 29278e-7 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 0.5629889, handL: 0.4370111 }, { forearmL: 0.5017798, handL: 0.4982202 }, { forearmL: 0.0833822, handL: 0.9166178 }, { upperL: 0.6415936, forearmL: 0.3584064 }, { upperL: 0.7475272, forearmL: 0.2524728 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.8042099 }, { upperL: 0.6937644 }, { forearmL: 0.926156, handL: 0.073844 }, { upperL: 1 }, { upperL: 0.6635195 }, { upperL: 0.5338181 }, { forearmL: 0.1625196, handL: 0.8374804 }, { upperL: 0.6222075 }, { upperL: 0.5648216 }, { upperL: 0.4573707 }, { upperL: 0.4421257 }, { forearmL: 0.8642827, handL: 0.1357173 }, { forearmL: 0.8146909, handL: 0.1853091 }, { upperL: 0.450125 }, { upperL: 0.4315681 }, { upperL: 0.5016434 }, { upperL: 0.4548871 }, { upperL: 0.4728136 }, { forearmL: 0.9959057, handL: 40943e-7 }, { forearmL: 1 }, { upperL: 0.5236996 }, { upperL: 0.4652439 }, { upperL: 0.5758701 }, { upperL: 0.5660886 }, { forearmL: 1 }, { upperL: 0.5786661 }, { forearmL: 1 }, { upperL: 0.645286 }, { upperL: 0.6658223 }, { upperL: 0.0150675, forearmL: 0.9849325 }, { upperL: 0.1619082, forearmL: 0.8380918 }, { upperL: 0.1205481, forearmL: 0.8794519 }, { upperL: 0.1829419, forearmL: 0.8170581 }, { upperL: 0.629387, forearmL: 0.370613 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.7769868 }, { upperL: 0.7019462 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.8448109 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 11619e-7, handL: 0.9988381 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 84e-6, handL: 0.999916 }, { forearmL: 3523e-6, handL: 0.996477 }, { forearmL: 73547e-7, handL: 0.9926453 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 14148e-7, handL: 0.9985852 }, { forearmL: 74167e-7, handL: 0.9925833 }, { forearmL: 0.0430236, handL: 0.9569764 }, { forearmL: 0.0213235, handL: 0.9786765 }, { forearmL: 0.018146, handL: 0.981854 }, { forearmL: 1 }, { forearmL: 0.9408765, handL: 0.0591235 }, { forearmL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 2581e-7, handL: 0.9997419 }, { forearmL: 0.0438308, handL: 0.9561692 }, { forearmL: 0.4718215, handL: 0.5281785 }, { forearmL: 0.761555, handL: 0.238445 }, { forearmL: 0.6305832, handL: 0.3694168 }, { forearmL: 1 }, { forearmL: 0.9696825, handL: 0.0303175 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { handL: 1 }, { forearmL: 16245e-7, handL: 0.9983755 }, { forearmL: 451e-6, handL: 0.999549 }, { forearmL: 0.0190145, handL: 0.9809855 }, { forearmL: 0.2931427, handL: 0.7068573 }, { forearmL: 0.1019912, handL: 0.8980088 }, { forearmL: 0.0360069, handL: 0.9639931 }, { forearmL: 0.0354105, handL: 0.9645895 }, { forearmL: 0.3427547, handL: 0.6572453 }, { forearmL: 0.5455084, handL: 0.4544916 }, { upperL: 0.0593989, forearmL: 0.9406011 }, { forearmL: 0.1740095, handL: 0.8259905 }, { upperL: 1 }, { upperL: 0.9949725, forearmL: 50275e-7 }, { forearmL: 0.1172367, handL: 0.8827633 }, { upperL: 0.9052575, forearmL: 0.0947425 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 0.0129275, handL: 0.9870725 }, { forearmL: 0.1243473, handL: 0.8756527 }, { forearmL: 0.5445874, handL: 0.4554126 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.7206362 }, { upperL: 0.7848747 }, { upperL: 0.5890534 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.6581468 }, { upperL: 0.6597378 }, { forearmL: 0.4760901, handL: 0.5239099 }, { upperL: 1 }, { upperL: 0.750774 }, { upperL: 0.6105937 }, { upperL: 0.5125875 }, { upperL: 0.5106044 }, { forearmL: 0.4418795, handL: 0.5581205 }, { upperL: 0.5534195 }, { forearmL: 0.8531373, handL: 0.1468627 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.5835774 }, { upperL: 0.6192903 }, { upperL: 0.5845495 }, { forearmL: 1 }, { upperL: 0.5953544 }, { forearmL: 1 }, { upperL: 0.645409 }, { upperL: 0.652833 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.029124, forearmL: 0.970876 }, { upperL: 29153e-7, forearmL: 0.9970847 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.8550235 }, { upperL: 0.7949403 }, { upperL: 0.7914857 }, { upperL: 0.7174519 }, { upperL: 0.1196373, forearmL: 0.8803627 }, { upperL: 0.035636, forearmL: 0.964364 }, { upperL: 0.1608552, forearmL: 0.8391448 }, { upperL: 0.6925538, forearmL: 0.3074462 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.011536, handL: 0.988464 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 90787e-7, handL: 0.9909213 }, { forearmL: 0.0473487, handL: 0.9526513 }, { forearmL: 0.056317, handL: 0.943683 }, { forearmL: 0.0806133, handL: 0.9193867 }, { forearmL: 71445e-7, handL: 0.9928555 }, { forearmL: 0.6956121, handL: 0.3043879 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.3862504, handL: 0.6137496 }, { forearmL: 0.2837611, handL: 0.7162389 }, { forearmL: 0.7096689, handL: 0.2903311 }, { forearmL: 0.9329967, handL: 0.0670033 }, { forearmL: 0.966637, handL: 0.033363 }, { forearmL: 0.9082881, handL: 0.0917119 }, { forearmL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 1 }, { handL: 1 }, { forearmL: 0.0172269, handL: 0.9827731 }, { forearmL: 545e-7, handL: 0.9999455 }, { forearmL: 3243e-7, handL: 0.9996757 }, { forearmL: 6e-7, handL: 0.9999994 }, { handL: 1 }, { forearmL: 25154e-7, handL: 0.9974846 }, { forearmL: 97878e-7, handL: 0.9902122 }, { forearmL: 8793e-7, handL: 0.9991207 }, { forearmL: 0.087124, handL: 0.912876 }, { upperL: 0.4288611, forearmL: 0.5711389 }, { upperL: 0.443908, forearmL: 0.556092 }, { upperL: 0.7952016, forearmL: 0.2047984 }, { upperL: 0.7356114, forearmL: 0.2643886 }, { upperL: 0.9771252, forearmL: 0.0228748 }, { upperL: 0.9999968, forearmL: 32e-7 }, { upperL: 0.9999055, forearmL: 945e-7 }, { upperL: 0.9780484, forearmL: 0.0219516 }, { upperL: 1 }, { forearmL: 0.0410305, handL: 0.9589695 }, { forearmL: 60302e-7, handL: 0.9939698 }, { forearmL: 0.055834, handL: 0.944166 }, { upperL: 0.9990931, forearmL: 9069e-7 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 0.0869184, handL: 0.9130816 }, { forearmL: 0.124919, handL: 0.875081 }, { forearmL: 0.13624, handL: 0.86376 }, { forearmL: 0.0949113, handL: 0.9050887 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.8138564 }, { upperL: 0.7271493 }, { upperL: 0.7251524 }, { forearmL: 0.5945281, handL: 0.4054719 }, { forearmL: 0.1420584, handL: 0.8579416 }, { forearmL: 0.6963626, handL: 0.3036374 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.8225964 }, { upperL: 0.7584579 }, { upperL: 0.8128485 }, { upperL: 0.6728314 }, { upperL: 0.6064754 }, { upperL: 0.5532011 }, { forearmL: 0.8172829, handL: 0.1827171 }, { upperL: 1 }, { upperL: 0.7658897 }, { upperL: 0.6626757 }, { upperL: 0.6023836 }, { upperL: 0.6208661 }, { upperL: 0.5506332 }, { upperL: 0.6175524 }, { upperL: 0.6605569 }, { upperL: 0.5284983 }, { upperL: 0.5725379 }, { upperL: 0.6950704 }, { forearmL: 1 }, { upperL: 0.7197739 }, { forearmL: 1 }, { upperL: 0.6743632 }, { upperL: 0.7290857 }, { upperL: 0.8016407 }, { upperL: 1 }, { upperL: 0.8096947 }, { upperL: 0.772891 }, { upperL: 0.0577762, forearmL: 0.9422238 }, { upperL: 0.3403363, forearmL: 0.6596637 }, { upperL: 0.3461688, forearmL: 0.6538312 }, { upperL: 0.7806206, forearmL: 0.2193794 }, { upperL: 1 }, { upperL: 0.8832151, forearmL: 0.1167849 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 568e-7, handL: 0.9999432 }, { forearmL: 0.0198589, handL: 0.9801411 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0588475, handL: 0.9411525 }, { handL: 1 }, { forearmL: 0.066276, handL: 0.933724 }, { forearmL: 0.0241061, handL: 0.9758939 }, { forearmL: 0.0615476, handL: 0.9384524 }, { forearmL: 0.4327372, handL: 0.5672628 }, { forearmL: 0.7397411, handL: 0.2602589 }, { handL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { handL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { upperL: 26475e-7, forearmL: 0.9973525 }, { upperL: 0.0429354, forearmL: 0.9570646 }, { handL: 1 }, { handL: 1 }, { upperL: 0.1727514, forearmL: 0.8272486 }, { forearmL: 64632e-7, handL: 0.9935368 }, { upperL: 0.6709397, forearmL: 0.3290603 }, { upperL: 0.839834, forearmL: 0.160166 }, { forearmL: 801e-6, handL: 0.999199 }, { upperL: 0.8242809, forearmL: 0.1757191 }, { upperL: 1 }, { forearmL: 0.0651112, handL: 0.9348888 }, { forearmL: 0.0476779, handL: 0.9523221 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 0.0860491, handL: 0.9139509 }, { forearmL: 0.1253071, handL: 0.8746929 }, { forearmL: 0.077714, handL: 0.922286 }, { forearmL: 0.1296251, handL: 0.8703749 }, { forearmL: 0.4808103, handL: 0.5191897 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 0.4730443, handL: 0.5269557 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.6651001 }, { forearmL: 0.7629678, handL: 0.2370322 }, { forearmL: 0.9993948, handL: 6052e-7 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.8498397 }, { upperL: 0.876837 }, { upperL: 0.7466349 }, { upperL: 0.7025107 }, { upperL: 0.6111992 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.7513301 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.8771762 }, { upperL: 0.8358455 }, { upperL: 0.794074 }, { upperL: 0.7355354 }, { upperL: 0.6751336 }, { upperL: 0.7276796 }, { upperL: 1 }, { upperL: 0.7875676 }, { upperL: 0.6224493 }, { upperL: 1 }, { upperL: 0.8837352 }, { upperL: 0.6648975 }, { upperL: 0.598304 }, { upperL: 1 }, { upperL: 0.8067165 }, { upperL: 0.7812366 }, { upperL: 0.7003355 }, { upperL: 0.7349473 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.8831793 }, { upperL: 1 }, { upperL: 0.9093379 }, { upperL: 0.8491941 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 1 }, { upperL: 0.4515467, forearmL: 0.5484533 }, { upperL: 0.1324687, forearmL: 0.8675313 }, { upperL: 0.0446363, forearmL: 0.9553637 }, { upperL: 0.1803, forearmL: 0.8197 }, { upperL: 0.1507562, forearmL: 0.8492438 }, { upperL: 0.6612945, forearmL: 0.3387055 }, { upperL: 0.9131279, forearmL: 0.0868721 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.0189045, forearmL: 0.9810955 }, { upperL: 0.6749511, forearmL: 0.3250489 }, { upperL: 0.9832617, forearmL: 0.0167383 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 6e-7, handL: 0.9999994 }, { handL: 1 }, { forearmL: 3593e-7, handL: 0.9996407 }, { forearmL: 0.0253882, handL: 0.9746118 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0285389, handL: 0.9714611 }, { forearmL: 0.2740922, handL: 0.7259078 }, { forearmL: 0.5611058, handL: 0.4388942 }, { forearmL: 0.178692, handL: 0.821308 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.5917841, handL: 0.4082159 }, { handL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { handL: 1 }, { forearmL: 1 }, { upperL: 0.041083, forearmL: 0.958917 }, { handL: 1 }, { handL: 1 }, { forearmL: 9403e-7, handL: 0.9990597 }, { forearmL: 15427e-7, handL: 0.9984573 }, { upperL: 0.5326219, forearmL: 0.4673781 }, { forearmL: 2216e-7, handL: 0.9997784 }, { forearmL: 72578e-7, handL: 0.9927422 }, { forearmL: 16986e-7, handL: 0.9983014 }, { forearmL: 56757e-7, handL: 0.9943243 }, { upperL: 0.9846596, forearmL: 0.0153404 }, { upperL: 0.9275933, forearmL: 0.0724067 }, { upperL: 0.9954607, forearmL: 45393e-7 }, { upperL: 0.5225143, forearmL: 0.4774857 }, { upperL: 0.996112, forearmL: 3888e-6 }, { upperL: 1 }, { forearmL: 0.0688215, handL: 0.9311785 }, { forearmL: 0.0868031, handL: 0.9131969 }, { forearmL: 0.1099036, handL: 0.8900964 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 0.1856524, handL: 0.8143476 }, { forearmL: 0.767293, handL: 0.232707 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.8467846 }, { forearmL: 1 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.981161, forearmL: 0.018839 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0301239, handL: 0.9698761 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.3208368, handL: 0.6791632 }, { handL: 1 }, { forearmL: 0.5247935, handL: 0.4752065 }, { forearmL: 0.5005043, handL: 0.4994957 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.0865121, forearmL: 0.9134879 }, { handL: 1 }, { handL: 1 }, { upperL: 0.1894093, forearmL: 0.8105907 }, { upperL: 0.1943968, forearmL: 0.8056032 }, { upperL: 0.5559527, forearmL: 0.4440473 }, { handL: 1 }, { handL: 1 }, { upperL: 0.4444672, forearmL: 0.5555328 }, { forearmL: 57107e-7, handL: 0.9942893 }, { forearmL: 0.0116457, handL: 0.9883543 }, { upperL: 0.9886491, forearmL: 0.0113509 }, { upperL: 0.9507515, forearmL: 0.0492485 }, { upperL: 1 }, { forearmL: 0.6487693, handL: 0.3512307 }, { forearmL: 0.8374875, handL: 0.1625125 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 0.7133993, handL: 0.2866007 }, { forearmL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.9998565, forearmL: 1435e-7 }, { upperL: 1 }, { upperL: 1 }, { forearmL: 1 }, { upperL: 0.1335475, forearmL: 0.8664525 }, { upperL: 0.8126047, forearmL: 0.1873953 }, { forearmL: 1 }, { upperL: 0.0123341, forearmL: 0.9876659 }, { upperL: 0.387688, forearmL: 0.612312 }, { upperL: 0.5887359, forearmL: 0.4112641 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 4399e-6, handL: 0.995601 }, { forearmL: 0.1080123, handL: 0.8919877 }, { forearmL: 0.0237889, handL: 0.9762111 }, { forearmL: 0.2955259, handL: 0.7044741 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.2425682, handL: 0.7574318 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.9998822, handL: 1178e-7 }, { forearmL: 1 }, { upperL: 1773e-7, forearmL: 0.9998227 }, { handL: 1 }, { handL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.1477128, forearmL: 0.8522872 }, { forearmL: 49e-7, handL: 0.9999951 }, { forearmL: 16882e-7, handL: 0.9983118 }, { upperL: 0.1969841, forearmL: 0.8030159 }, { forearmL: 0.0157914, handL: 0.9842086 }, { upperL: 0.3504272, forearmL: 0.6495728 }, { upperL: 0.6474824, forearmL: 0.3525176 }, { forearmL: 56832e-7, handL: 0.9943168 }, { forearmL: 0.7558442, handL: 0.2441558 }, { upperL: 0.8963917, forearmL: 0.1036083 }, { upperL: 0.9717559, forearmL: 0.0282441 }, { upperL: 1 }, { upperL: 0.974215, forearmL: 0.025785 }, { upperL: 1 }, { forearmL: 0.7214496, handL: 0.2785504 }, { forearmL: 0.9910098, handL: 89902e-7 }, { forearmL: 1 }, { upperL: 0.8548315, forearmL: 0.1451685 }, { upperL: 1 }, { forearmL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 1 }, { upperL: 0.9992458, forearmL: 7542e-7 }, { upperL: 0.7824293, forearmL: 0.2175707 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.3789697, forearmL: 0.6210303 }, { upperL: 0.8166742, forearmL: 0.1833258 }, { upperL: 0.7994346, forearmL: 0.2005654 }, { forearmL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.2595353, handL: 0.7404647 }, { handL: 1 }, { forearmL: 0.0263473, handL: 0.9736527 }, { forearmL: 0.1298302, handL: 0.8701698 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.337535, handL: 0.662465 }, { handL: 1 }, { forearmL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { handL: 1 }, { handL: 1 }, { upperL: 0.1772639, forearmL: 0.8227361 }, { forearmL: 0.1374235, handL: 0.8625765 }, { upperL: 0.2322461, forearmL: 0.7677539 }, { forearmL: 0.1497182, handL: 0.8502818 }, { upperL: 0.8248273, forearmL: 0.1751727 }, { upperL: 0.8647952, forearmL: 0.1352048 }, { forearmL: 0.7758456, handL: 0.2241544 }, { upperL: 0.6030513, forearmL: 0.3969487 }, { forearmL: 0.8726427, handL: 0.1273573 }, { forearmL: 1 }, { upperL: 0.59315, forearmL: 0.40685 }, { upperL: 0.5868937, forearmL: 0.4131063 }, { forearmL: 1 }, { upperL: 0.8769571, forearmL: 0.1230429 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.2013283, forearmL: 0.7986717 }, { forearmL: 1 }, { upperL: 0.4747226, forearmL: 0.5252774 }, { upperL: 0.9152281, forearmL: 0.0847719 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 9482e-7, handL: 0.9990518 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0851212, handL: 0.9148788 }, { handL: 1 }, { forearmL: 0.4817349, handL: 0.5182651 }, { forearmL: 0.1069796, handL: 0.8930204 }, { forearmL: 0.2826737, handL: 0.7173263 }, { forearmL: 0.4695759, handL: 0.5304241 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.9780244, handL: 0.0219756 }, { forearmL: 0.9411253, handL: 0.0588747 }, { forearmL: 1 }, { forearmL: 0.9786159, handL: 0.0213841 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { handL: 1 }, { handL: 0.9999999 }, { forearmL: 4784e-7, handL: 0.9995216 }, { forearmL: 1 }, { upperL: 10143e-7, forearmL: 0.9989857 }, { upperL: 692e-7, forearmL: 0.9999308 }, { forearmL: 57e-7, handL: 0.9999943 }, { forearmL: 0.7674367, handL: 0.2325633 }, { forearmL: 0.5904101, handL: 0.4095899 }, { upperL: 0.561532, forearmL: 0.438468 }, { upperL: 0.5271949, forearmL: 0.4728051 }, { forearmL: 0.8555271, handL: 0.1444729 }, { forearmL: 0.9379466, handL: 0.0620534 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.812887, forearmL: 0.187113 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.1021622, forearmL: 0.8978378 }, { upperL: 0.6752996, forearmL: 0.3247004 }, { upperL: 0.4468872, forearmL: 0.5531128 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 0.9999999 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999998 }, { handL: 0.9999998 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999999 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999998 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 67859e-7, handL: 0.9932141 }, { forearmL: 0.0263022, handL: 0.9736978 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0797548, handL: 0.9202452 }, { forearmL: 0.1418105, handL: 0.8581895 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.2847387, handL: 0.7152613 }, { forearmL: 0.2417717, handL: 0.7582283 }, { forearmL: 0.2773463, handL: 0.7226537 }, { forearmL: 0.5842947, handL: 0.4157053 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.4928796, handL: 0.5071204 }, { forearmL: 0.2802157, handL: 0.7197843 }, { handL: 1 }, { handL: 1 }, { forearmL: 1 }, { handL: 1 }, { forearmL: 1 }, { forearmL: 0.9885119, handL: 0.0114881 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 27e-7, forearmL: 0.9999973 }, { forearmL: 37915e-7, handL: 0.9962085 }, { forearmL: 0.2715515, handL: 0.7284485 }, { forearmL: 0.8083773, handL: 0.1916227 }, { forearmL: 0.4161828, handL: 0.5838172 }, { forearmL: 0.7503161, handL: 0.2496839 }, { upperL: 38138e-7, forearmL: 0.9961862 }, { upperL: 0.0101594, forearmL: 0.9898406 }, { forearmL: 0.9778553, handL: 0.0221447 }, { forearmL: 0.9293085, handL: 0.0706915 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.1923939, forearmL: 0.8076061 }, { upperL: 0.0974034, forearmL: 0.9025966 }, { forearmL: 0.9845824, handL: 0.0154176 }, { forearmL: 1 }, { upperL: 0.0320374, forearmL: 0.9679626 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.0394013, forearmL: 0.9605987 }, { upperL: 0.1887006, forearmL: 0.8112994 }, { upperL: 0.1598037, forearmL: 0.8401963 }, { handL: 0.9999997 }, { handL: 0.9999996 }, { handL: 0.9999997 }, { handL: 0.9999996 }, { handL: 0.9999996 }, { handL: 0.9999997 }, { handL: 0.9999997 }, { handL: 0.9999998 }, { handL: 0.9999998 }, { handL: 0.9999997 }, { handL: 1 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999998 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999997 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999997 }, { handL: 0.9999999 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999998 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 0.9999998 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0442686, handL: 0.9557314 }, { forearmL: 0.0951132, handL: 0.9048868 }, { forearmL: 0.0350037, handL: 0.9649963 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.123129, handL: 0.876871 }, { forearmL: 0.123776, handL: 0.876224 }, { forearmL: 0.1035326, handL: 0.8964674 }, { handL: 1 }, { forearmL: 0.1781769, handL: 0.8218231 }, { forearmL: 0.2558672, handL: 0.7441328 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.991589, handL: 8411e-6 }, { forearmL: 0.9182801, handL: 0.0817199 }, { forearmL: 0.2431343, handL: 0.7568657 }, { forearmL: 0.9585769, handL: 0.0414231 }, { forearmL: 0.3183666, handL: 0.6816334 }, { forearmL: 0.9996864, handL: 3136e-7 }, { forearmL: 0.9142861, handL: 0.0857139 }, { forearmL: 1 }, { handL: 1 }, { forearmL: 1 }, { handL: 1 }, { forearmL: 0.0216666, handL: 0.9783334 }, { forearmL: 1 }, { forearmL: 0.9948449, handL: 51551e-7 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 0.2292007, handL: 0.7707993 }, { forearmL: 0.0131337, handL: 0.9868663 }, { forearmL: 0.287322, handL: 0.712678 }, { forearmL: 0.8304433, handL: 0.1695567 }, { forearmL: 0.8631179, handL: 0.1368821 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 0.295683, handL: 0.704317 }, { forearmL: 0.9008802, handL: 0.0991198 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 882e-7, forearmL: 0.9999118 }, { forearmL: 0.9901922, handL: 98078e-7 }, { forearmL: 1 }, { upperL: 1e-7, forearmL: 0.9999999 }, { forearmL: 1 }, { forearmL: 1 }, { forearmL: 1 }, { upperL: 0.0735642, forearmL: 0.9264358 }, { upperL: 64449e-7, forearmL: 0.9935551 }, { upperL: 15411e-7, forearmL: 0.9984589 }, { upperL: 311e-7, forearmL: 0.9999689 }, { upperL: 0.0274054, forearmL: 0.9725946 }, { handL: 0.9999997 }, { handL: 0.9999998 }, { handL: 0.9999996 }, { handL: 0.9999997 }, { handL: 0.9999997 }, { handL: 0.9999997 }, { handL: 0.9999996 }, { handL: 0.9999997 }, { handL: 0.9999996 }, { handL: 0.9999997 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 0.9999998 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999999 }, { handL: 0.9999998 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999996 }, { handL: 0.9999998 }, { handL: 0.9999997 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0362406, handL: 0.9637594 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0796448, handL: 0.9203552 }, { forearmL: 0.051033, handL: 0.948967 }, { handL: 1 }, { forearmL: 0.1086603, handL: 0.8913397 }, { forearmL: 0.1066644, handL: 0.8933356 }, { forearmL: 0.1433485, handL: 0.8566515 }, { forearmL: 0.080171, handL: 0.919829 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0707878, handL: 0.9292122 }, { forearmL: 0.0661438, handL: 0.9338562 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.087111, handL: 0.912889 }, { forearmL: 0.1608849, handL: 0.8391151 }, { forearmL: 0.3286784, handL: 0.6713216 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.5491895, handL: 0.4508105 }, { forearmL: 0.1314467, handL: 0.8685533 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0477238, handL: 0.9522762 }, { forearmL: 29929e-7, handL: 0.9970071 }, { forearmL: 0.0102273, handL: 0.9897727 }, { forearmL: 0.0713045, handL: 0.9286955 }, { forearmL: 0.3326651, handL: 0.6673349 }, { forearmL: 0.2940413, handL: 0.7059587 }, { handL: 1 }, { forearmL: 8816e-7, handL: 0.9991184 }, { handL: 1 }, { handL: 0.9999998 }, { handL: 0.9999998 }, { handL: 0.9999999 }, { handL: 0.9999998 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999998 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0183685, handL: 0.9816315 }, { forearmL: 8832e-7, handL: 0.9991168 }, { forearmL: 0.0283699, handL: 0.9716301 }, { forearmL: 0.0570247, handL: 0.9429753 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0785242, handL: 0.9214758 }, { forearmL: 0.0897757, handL: 0.9102243 }, { handL: 1 }, { forearmL: 0.0489243, handL: 0.9510757 }, { forearmL: 0.0742478, handL: 0.9257522 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0242844, handL: 0.9757156 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0715578, handL: 0.9284422 }, { forearmL: 0.054292, handL: 0.945708 }, { forearmL: 0.0212384, handL: 0.9787616 }, { handL: 1 }, { forearmL: 0.0146385, handL: 0.9853615 }, { forearmL: 0.0375828, handL: 0.9624172 }, { forearmL: 0.0594695, handL: 0.9405305 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0285119, handL: 0.9714881 }, { handL: 1 }, { forearmL: 4689e-7, handL: 0.9995311 }, { forearmL: 0.0392067, handL: 0.9607933 }, { forearmL: 0.0469569, handL: 0.9530431 }, { forearmL: 182e-7, handL: 0.9999818 }, { forearmL: 143e-6, handL: 0.999857 }, { forearmL: 0.0182958, handL: 0.9817042 }, { forearmL: 0.0303414, handL: 0.9696586 }, { forearmL: 0.0358591, handL: 0.9641409 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.047843, handL: 0.952157 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 0.0142974, handL: 0.9857026 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 14911e-7, handL: 0.9985089 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { forearmL: 155e-7, handL: 0.9999845 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 0.9999999 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }, { handL: 1 }] };

// src/V5Person.ts
var bodyWeights = V5PersonWeights_default.weights;
var clamp4 = (x) => Math.max(0, Math.min(1, x));
var axis = V(1, 0, 0);
var baseArm = (side) => ({ s: V(side * 0.174, 1.403, -0.04), e: V(side * 0.225, 1.108, -0.036), w: V(side * 0.25, 0.911, 8e-3) });
function neutralizeBodyGeometry(body) {
  const unique = /* @__PURE__ */ new Set();
  body.traverse((o) => {
    if (o instanceof T6.Mesh) unique.add(o.geometry);
  });
  for (const g of unique) {
    if (g.userData.v5Neutralized) continue;
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = (1 - smooth((Math.abs(x) - 0.038) / 0.039)) * smooth((y - 0.731) / 0.031) * (1 - smooth((y - 0.872) / 0.035)) * smooth((z - 2e-3) / 0.025);
      if (k <= 0) continue;
      const envelope = 0.088 * Math.sqrt(Math.max(0.05, 1 - ((y - 0.925) / 0.193) ** 2 - (x / 0.177) ** 2)) - 7e-3;
      p.setZ(i, z + (envelope - z) * k);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData.v5Neutralized = true;
  }
  body.userData.v5Neutralized = true;
}
function armRig(side, target, handDirection) {
  const { s, e, w } = baseArm(side), a = s.distanceTo(e), b = e.distanceTo(w);
  const d = target.clone().sub(s), length = Math.min(a + b - 4e-3, Math.max(Math.abs(a - b) + 3e-3, d.length()));
  d.normalize();
  const along = (a * a - b * b + length * length) / (2 * length), height = Math.sqrt(Math.max(0, a * a - along * along));
  const pole = V(side * 0.31, -0.95, -0.08);
  pole.addScaledVector(d, -pole.dot(d)).normalize();
  const pe = s.clone().addScaledVector(d, along).addScaledVector(pole, height), pw = s.clone().addScaledVector(d, length);
  return {
    s,
    e,
    w,
    pe,
    pw,
    upper: new T6.Quaternion().setFromUnitVectors(e.clone().sub(s).normalize(), pe.clone().sub(s).normalize()),
    forearm: new T6.Quaternion().setFromUnitVectors(w.clone().sub(e).normalize(), pw.clone().sub(pe).normalize()),
    hand: new T6.Quaternion().setFromUnitVectors(V(side * 0.023, -0.104, 0.042).normalize(), handDirection.clone().normalize())
  };
}
function makeShorts(skin) {
  const source = skin.getAttribute("position"), index = skin.index;
  const bindings = [];
  const clip = (input, height, above) => {
    const result = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length], aIn = above ? a.y >= height : a.y <= height, bIn = above ? b.y >= height : b.y <= height;
      if (aIn) result.push(a);
      if (aIn !== bIn) {
        const k = (height - a.y) / (b.y - a.y);
        result.push({ y: height, weights: a.weights.map((v, j) => v + (b.weights[j] - v) * k) });
      }
    }
    return result;
  };
  for (let i = 0; i < (index?.count ?? source.count); i += 3) {
    const ids = [0, 1, 2].map((j) => index ? index.getX(i + j) : i + j);
    if (ids.some((id) => Math.abs(source.getX(id)) > 0.195)) continue;
    if (ids.some((id) => Object.values(bodyWeights[id] ?? {}).reduce((a, b) => a + b, 0) > 0.2)) continue;
    const polygon = ids.map((id, j) => ({ y: source.getY(id), weights: [+(j === 0), +(j === 1), +(j === 2)] }));
    if (Math.max(...polygon.map((p) => p.y)) < 0.55 || Math.min(...polygon.map((p) => p.y)) > 1.002) continue;
    const cut = clip(clip(polygon, 0.55, true), 1.002, false);
    for (let j = 1; j < cut.length - 1; j++) for (const vertex of [cut[0], cut[j], cut[j + 1]]) bindings.push({ ids, weights: vertex.weights });
  }
  const geometry = new T6.BufferGeometry();
  geometry.setAttribute("position", new T6.Float32BufferAttribute(new Float32Array(bindings.length * 3), 3));
  geometry.setAttribute("normal", new T6.Float32BufferAttribute(new Float32Array(bindings.length * 3), 3));
  return { geometry, bindings };
}
var V5Person = class {
  constructor(body) {
    this.body = body;
    neutralizeBodyGeometry(body);
    this.root.name = "V5 \u2014 same atlas person and daily activities";
    this.root.add(this.wardrobe, this.props);
    this.props.add(this.diningProps, this.activityProps);
    this.diningProps.add(this.chair);
    const unique = /* @__PURE__ */ new Set();
    body.traverse((o) => {
      if (o instanceof T6.Mesh) unique.add(o.geometry);
    });
    for (const geometry of unique) this.cache(geometry, false);
    const source = [...unique][0], sourceP = source.getAttribute("position"), sourceI = source.index;
    const groups = /* @__PURE__ */ new Map();
    for (let i = 0; i < sourceP.count; i++) {
      const key = [sourceP.getX(i), sourceP.getY(i), sourceP.getZ(i)].map((v) => Math.round(v * 1e5)).join(",");
      const list = groups.get(key) ?? [];
      list.push(i);
      groups.set(key, list);
    }
    this.weld = [...groups.values()];
    const representative = new Int32Array(sourceP.count);
    for (const group of this.weld) for (const i of group) representative[i] = group[0];
    const edgeSets = Array.from({ length: sourceP.count }, () => /* @__PURE__ */ new Set());
    if (sourceI) for (let i = 0; i < sourceI.count; i += 3) {
      const ids = [0, 1, 2].map((j) => representative[sourceI.getX(i + j)]);
      for (const a of ids) for (const b of ids) if (a !== b) edgeSets[a].add(b);
    }
    this.adjacency = Array.from({ length: sourceP.count }, (_, i) => [...edgeSets[representative[i]]]);
    const shortsMaterial = new T6.MeshStandardMaterial({ color: "#476c6e", roughness: 0.88, side: T6.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const fitted = makeShorts(source);
    this.clothSkin = source;
    this.clothGeometry = fitted.geometry;
    this.clothBindings = fitted.bindings;
    const shorts = new T6.Mesh(this.clothGeometry, shortsMaterial);
    shorts.name = "skin-attached tailored teaching shorts";
    shorts.castShadow = true;
    shorts.receiveShadow = true;
    this.wardrobe.add(shorts);
    const box = (name, size, p, color) => {
      const m = new T6.Mesh(new RoundedBoxGeometry(size.x, size.y, size.z, 3, 7e-3), mat(color, 1, 0.75));
      m.name = name;
      m.position.copy(p);
      m.castShadow = true;
      m.receiveShadow = true;
      this.chair.add(m);
      return m;
    };
    box("dining chair \u2014 seat", V(0.42, 0.044, 0.4), V(0, 0.314, -0.018), "#b7ae9c");
    box("dining chair \u2014 back", V(0.42, 0.62, 0.035), V(0, 0.645, -0.155), "#b7ae9c");
    for (const x of [-0.17, 0.17]) for (const z of [-0.16, 0.13]) box("dining chair \u2014 legs", V(0.024, 0.292, 0.024), V(x, 0.146, z), "#87918a");
    const steel = new T6.MeshStandardMaterial({ color: "#b4c0ba", metalness: 0.72, roughness: 0.26 });
    const handle = new T6.Mesh(new RoundedBoxGeometry(9e-3, 3e-3, 0.145, 3, 15e-4), steel);
    handle.position.z = -0.072;
    this.utensil.add(handle);
    const scoop = new T6.Mesh(new T6.SphereGeometry(0.015, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), steel);
    scoop.scale.set(0.8, 0.22, 1.4);
    scoop.rotation.x = Math.PI;
    scoop.position.z = -0.163;
    this.utensil.add(scoop);
    this.bite = new T6.Mesh(new T6.SphereGeometry(9e-3, 16, 12), new T6.MeshStandardMaterial({ color: "#e7dfbf", roughness: 0.87 }));
    this.bite.scale.set(0.86, 0.48, 1);
    this.bite.position.set(0, 4e-3, -0.16);
    this.utensil.add(this.bite);
    this.diningProps.add(this.utensil);
    this.metadata = { units: "metres", identity: "same BodyParts3D skin mesh, modified only for neutral external appearance and poses", sourceHeight: 1.719431, pose: "fixed-bone-length IK with topology-constrained harmonic weights; Blender bone-heat calculation refined after preview; no patient-specific rig", clothing: "continuous shorts with two leg openings; no external genital detail", wardrobeFit: "shorts cut from neutralized atlas skin triangles between 0.55 and 1.002 m, ending above the knee; barycentric attachment follows the final posed skin with 0.3 mm normal clearance and polygon depth bias; same garment through meal, exercise and measurement; no body or skeleton scaling", anatomy: "organ/skeleton coordinates are never scaled or deformed; hide static organs while seated, recover standing pose before anatomy handoff", weightChange: "adiposity 0\u20131 is a small schematic skin contour change, not kg prediction; no scaling of skeleton/organs or body height", diningTableOffsetY: -0.225, diningAction: "seated natural spoon-to-food contact and small scoop; no fabricated swallow" };
    this.anchors = { personTorso: V(0, 1.18, 0), personActivity: V(0, 0.88, 0), mealMouth: V(0, 1.084, 0.095), mealPerson: V(0, 0.71, 0.12), mealBowl: V(0.055, 0.809, 0.43), mealHand: V(0.15, 0.81, 0.3), personHip: V(0, 0.91, 0), personFoot: V(0.1, 0.025, 0.06) };
    this.update({ time: 0, action: "stand" });
  }
  body;
  root = new T6.Group();
  wardrobe = new T6.Group();
  props = new T6.Group();
  diningProps = new T6.Group();
  activityProps = new T6.Group();
  anchors = {};
  metadata;
  records = [];
  chair = new T6.Group();
  utensil = new T6.Group();
  bite;
  posed = false;
  lastKey = "";
  lastGeometryGuard = [];
  adjacency = [];
  weld = [];
  clothSkin;
  clothGeometry;
  clothBindings = [];
  cache(geometry, clothing) {
    this.records.push({ geometry, position: Float32Array.from(geometry.getAttribute("position").array), normal: Float32Array.from(geometry.getAttribute("normal").array), clothing });
  }
  alpha(object, k) {
    object.visible = k > 1e-5;
    object.traverse((o) => {
      if (o instanceof T6.Mesh) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.opacity = k;
          m.transparent = k < 1;
          m.depthWrite = true;
        }
      }
    });
  }
  /** Call after the final skin writer (including measurement pose blending).
   * Fixed triangle attachments preserve both leg openings. Sub-millimetre
   * clearance avoids an artificial shell around flexed thighs and the waist. */
  syncWardrobeToSkin() {
    const skinP = this.clothSkin.getAttribute("position"), skinN = this.clothSkin.getAttribute("normal");
    const clothP = this.clothGeometry.getAttribute("position"), clothN = this.clothGeometry.getAttribute("normal");
    const position = V(), normal = V();
    for (let i = 0; i < this.clothBindings.length; i++) {
      const binding = this.clothBindings[i];
      position.set(0, 0, 0);
      normal.set(0, 0, 0);
      for (let j = 0; j < 3; j++) {
        const id = binding.ids[j], weight = binding.weights[j];
        position.x += skinP.getX(id) * weight;
        position.y += skinP.getY(id) * weight;
        position.z += skinP.getZ(id) * weight;
        normal.x += skinN.getX(id) * weight;
        normal.y += skinN.getY(id) * weight;
        normal.z += skinN.getZ(id) * weight;
      }
      normal.normalize();
      position.addScaledVector(normal, 3e-4);
      clothP.setXYZ(i, position.x, position.y, position.z);
      clothN.setXYZ(i, normal.x, normal.y, normal.z);
    }
    clothP.needsUpdate = true;
    clothN.needsUpdate = true;
    this.clothGeometry.computeBoundingSphere();
  }
  resetPose() {
    if (this.posed) for (const r of this.records) {
      r.geometry.getAttribute("position").array.set(r.position);
      r.geometry.getAttribute("normal").array.set(r.normal);
      r.geometry.getAttribute("position").needsUpdate = true;
      r.geometry.getAttribute("normal").needsUpdate = true;
      r.geometry.computeBoundingSphere();
    }
    this.posed = false;
    this.lastKey = "";
    this.lastGeometryGuard = [];
    this.diningProps.visible = false;
    this.activityProps.visible = false;
    this.syncWardrobeToSkin();
  }
  update(state) {
    const time = state.time, action = state.action ?? "stand", weight = clamp4(state.weight ?? 1);
    const actions = state.actionWeights ?? (state.previousAction ? { [state.previousAction]: 1 - clamp4(state.transition ?? 1), [action]: clamp4(state.transition ?? 1) } : { [action]: 1 });
    const eatWeight = clamp4(actions.eat ?? 0) * weight, walkWeight = clamp4(actions.walk ?? 0) * weight, sitWeight = clamp4(actions.sitStand ?? 0) * weight, resistanceWeight = clamp4(actions.resistance ?? 0) * weight;
    const adiposity = clamp4(state.adiposity ?? 0), measurementWeight = clamp4(state.measurementWeight ?? 0);
    let seated = state.seatedWeight !== void 0 ? clamp4(state.seatedWeight) * weight : eatWeight + sitWeight * (0.5 + 0.5 * Math.cos(time * Math.PI / 5)) + 0.16 * resistanceWeight * (0.5 + 0.5 * Math.sin(time * Math.PI / 2.8));
    seated = clamp4(seated);
    const cycle = (time % 9.6 + 9.6) % 9.6 / 9.6;
    const rise = 0.18 * smooth((cycle - 0.21) / 0.27) * (1 - smooth((cycle - 0.62) / 0.28));
    const bowl = V(0.055, 0.809, 0.43), mouth = V(1e-3, 1.084, 0.095);
    const spoonTip = bowl.clone().lerp(mouth, rise);
    spoonTip.x += Math.sin(rise * Math.PI) * 0.045;
    spoonTip.z += Math.sin(rise * Math.PI) * 0.058;
    const spoonDirection = V(-0.19, -0.15, 0.96).lerp(V(-0.34, 0.22, 0.91), rise).normalize();
    const grip = spoonTip.clone().addScaledVector(spoonDirection, -0.162);
    const handDirection = V(-0.2, -0.08, 0.98).lerp(V(-0.3, 0.06, 0.95), rise).normalize();
    const wrist = grip.clone().addScaledVector(handDirection, -0.074).add(V(0, 0.45, 0));
    const left = armRig(1, wrist, handDirection), right = armRig(-1, V(-0.14, 1.2, 0.35), V(0.14, -0.07, 0.98));
    const restingGrip = baseArm(1).w.clone().addScaledVector(V(0.023, -0.104, 0.042).normalize(), 0.074);
    const actualGrip = restingGrip.clone().lerp(grip.clone().add(V(0, 0.45, 0)), eatWeight).add(V(0, -0.45 * seated, 0));
    this.utensil.position.copy(actualGrip);
    this.utensil.quaternion.identity().slerp(new T6.Quaternion().setFromUnitVectors(V(0, 0, -1), spoonDirection), eatWeight);
    this.bite.scale.setScalar((1 - smooth((cycle - 0.84) / 0.055)) * smooth((cycle - 0.19) / 0.06));
    this.bite.scale.multiply(V(0.86, 0.48, 1));
    const walk = walkWeight, phase3 = time * Math.PI * 1.12;
    const motionTime = eatWeight + walkWeight + sitWeight + resistanceWeight > 0 ? time : 0;
    const key = [motionTime, action, weight, seated, eatWeight, walkWeight, sitWeight, resistanceWeight, adiposity, measurementWeight].join("|");
    const guardIndices = [1, 24001, 42001, 66001], bodyPosition = this.records[0].geometry.getAttribute("position").array;
    const externalPoseWrite = guardIndices.some((index, i) => bodyPosition[index] !== this.lastGeometryGuard[i]);
    if (this.lastKey !== key || externalPoseWrite) {
      for (const record of this.records) {
        const p = record.geometry.getAttribute("position");
        for (let i = 0; i < p.count; i++) {
          const original = V().fromArray(record.position, i * 3), result = original.clone();
          const arm = record.clothing ? 0 : clamp4(Object.values(bodyWeights[i] ?? {}).reduce((a, b) => a + b, 0));
          const leg = (1 - smooth((original.y - 0.875) / 0.065)) * (1 - arm);
          const clothingLeg = leg;
          if (seated > 0 && clothingLeg > 0) {
            const thigh = V(original.x, 0.915 + original.z, 0.885 - original.y), shin = V(original.x, original.y + 0.45, original.z + 0.45);
            thigh.lerp(shin, smooth((0.5 - original.y) / 0.1));
            result.lerp(thigh, clothingLeg * seated);
          }
          if (eatWeight > 0 && !record.clothing) {
            const row = bodyWeights[i] ?? {};
            for (const [tag, r] of [["L", left], ["R", right]]) {
              const up = row["upper" + tag] ?? 0, fore = row["forearm" + tag] ?? 0, handWeight = row["hand" + tag] ?? 0;
              if (up > 0) result.addScaledVector(original.clone().sub(r.s).applyQuaternion(r.upper).add(r.s).sub(original), up * eatWeight);
              if (fore > 0) result.addScaledVector(original.clone().sub(r.e).applyQuaternion(r.forearm).add(r.pe).sub(original), fore * eatWeight);
              if (handWeight > 0) result.addScaledVector(original.clone().sub(r.w).applyQuaternion(r.hand).add(r.pw).sub(original), handWeight * eatWeight);
            }
          }
          if (walk > 0) {
            const side = original.x > 0 ? 1 : -1, theta = Math.sin(phase3) * side * 0.19 * walk;
            if (leg > 0) {
              const hip = V(side * 0.086, 0.9, -0.018), moved = original.clone().sub(hip).applyAxisAngle(axis, -theta).add(hip);
              result.addScaledVector(moved.sub(original), leg);
            }
            if (arm > 0 && original.y < 1.405) {
              const shoulder = baseArm(side).s, moved = original.clone().sub(shoulder).applyAxisAngle(axis, theta * 0.66).add(shoulder);
              result.addScaledVector(moved.sub(original), arm);
            }
            result.y += 0.014 * Math.abs(Math.sin(phase3)) * walk;
          }
          if (record.clothing && seated > 0) {
            const hem = 1 - smooth((original.y - 0.735) / 0.125);
            const legSide = Math.sign(original.x) || 1;
            const sideSeparation = smooth((Math.abs(original.x) - 0.01) / 0.06) * hem;
            result.y += 3e-3 * hem * seated;
            result.z += 2e-3 * hem * seated;
            result.x += legSide * 1e-3 * sideSeparation * seated;
            result.x *= 1 + 3e-3 * hem * seated;
          }
          if (adiposity > 0) {
            const abdomen = smooth((original.y - 0.87) / 0.12) * (1 - smooth((original.y - 1.2) / 0.15)) * (1 - smooth((Math.abs(original.x) - 0.16) / 0.04));
            result.x += Math.sign(original.x) * 0.026 * smooth(Math.abs(original.x) / 0.08) * abdomen * adiposity;
            result.z += 0.037 * smooth((original.z + 0.016) / 0.1) * abdomen * adiposity;
            if (record.clothing) {
              const waistband = smooth((original.y - 0.7) / 0.22);
              result.x += Math.sign(original.x) * 6e-3 * waistband * adiposity;
              result.z += 8e-3 * waistband * adiposity;
            }
          }
          result.y -= 0.45 * seated;
          if (record.clothing && measurementWeight > 0) {
            const measured = original.clone(), measurementLeg = 1 - smooth((original.y - 0.875) / 0.065);
            const thigh = V(original.x, 0.915 + original.z, 0.885 - original.y), shin = V(original.x, original.y + 0.45, original.z + 0.45);
            thigh.lerp(shin, smooth((0.5 - original.y) / 0.1));
            measured.lerp(thigh, measurementLeg);
            measured.y -= 0.45;
            const hem = 1 - smooth((original.y - 0.735) / 0.125), legSide = Math.sign(original.x) || 1;
            const sideSeparation = smooth((Math.abs(original.x) - 0.01) / 0.06) * hem;
            measured.y += 3e-3 * hem;
            measured.z += 2e-3 * hem;
            measured.x += legSide * 1e-3 * sideSeparation;
            measured.x *= 1 + 3e-3 * hem;
            result.lerp(measured, measurementWeight);
          }
          result.toArray(p.array, i * 3);
        }
        if (eatWeight > 0 && !record.clothing) {
          const temp = new Float32Array(p.array.length);
          for (let iteration = 0; iteration < 14; iteration++) {
            temp.set(p.array);
            for (const group of this.weld) {
              const i = group[0], y = record.position[i * 3 + 1], row = bodyWeights[i] ?? {}, influence = Object.values(row).reduce((a, b) => a + b, 0);
              const shoulder = smooth((y - 1.19) / 0.09) * (1 - smooth((y - 1.39) / 0.07));
              const elbow = smooth((y - 1.015) / 0.035) * (1 - smooth((y - 1.135) / 0.035));
              const strength = Math.max(shoulder, elbow) * smooth(influence / 0.25) * 0.52 * eatWeight;
              if (strength < 1e-3) continue;
              const neighbors = this.adjacency[i];
              if (!neighbors.length) continue;
              for (let axis2 = 0; axis2 < 3; axis2++) {
                let average = 0;
                for (const j of neighbors) average += p.array[j * 3 + axis2];
                const next = p.array[i * 3 + axis2] + (average / neighbors.length - p.array[i * 3 + axis2]) * strength;
                for (const j of group) temp[j * 3 + axis2] = next;
              }
            }
            p.array.set(temp);
          }
        }
        p.needsUpdate = true;
        record.geometry.computeVertexNormals();
        if (!record.clothing) {
          const normals = record.geometry.getAttribute("normal");
          for (const group of this.weld) {
            const sum = V();
            for (const i of group) sum.add(V().fromBufferAttribute(normals, i));
            sum.normalize();
            for (const i of group) normals.setXYZ(i, sum.x, sum.y, sum.z);
          }
          normals.needsUpdate = true;
        }
        record.geometry.computeBoundingSphere();
      }
      this.lastKey = key;
      this.lastGeometryGuard = guardIndices.map((i) => this.records[0].geometry.getAttribute("position").array[i]);
      this.posed = eatWeight + walkWeight + sitWeight + resistanceWeight + adiposity > 0 || seated > 0 || measurementWeight > 0;
    }
    const propsOpacity = clamp4(state.propsOpacity ?? (state.opacity ?? 1)) * (1 - measurementWeight);
    this.alpha(this.diningProps, propsOpacity * Math.min(1, eatWeight + sitWeight));
    this.alpha(this.utensil, propsOpacity * eatWeight);
    this.chair.position.z = -0.21 * (1 - seated);
    this.alpha(this.wardrobe, clamp4(state.wardrobeOpacity ?? state.opacity ?? 1));
    this.alpha(this.activityProps, 0);
    this.anchors.mealHand.copy(actualGrip);
    this.anchors.mealMouth.set(0, 1.534 - 0.45 * seated, 0.095);
    this.anchors.personTorso.set(0, 1.18 - 0.45 * seated, 0);
    this.anchors.personActivity.set(0, 0.88 - 0.45 * seated, 0.03);
    this.root.userData = { ...this.metadata, action, time, seated, measurementWeight, actionWeights: actions, adiposity, upperArmLength: left.s.distanceTo(left.pe), forearmLength: left.pe.distanceTo(left.pw), spoonTip: spoonTip.toArray(), mouth: mouth.toArray() };
    this.syncWardrobeToSkin();
  }
};

// src/V5Atrium.ts
import * as T7 from "three";
var V5Atrium = class {
  root = new T7.Group();
  center = V();
  dots = [];
  curve;
  clot = new T7.Group();
  weight = 0;
  constructor(heart) {
    const cavity = heart.getObjectByName("FJ2425_Cavity_of_left_atrium");
    if (!cavity) throw Error("Reference left atrial cavity is missing");
    const bounds = new T7.Box3().setFromObject(cavity), size = bounds.getSize(V());
    bounds.getCenter(this.center);
    const points = Array.from({ length: 32 }, (_, i) => {
      const a = i / 32 * 2 * Math.PI;
      return this.center.clone().add(V(size.x * 0.23 * Math.cos(a), size.y * 0.2 * Math.sin(a), size.z * 0.11 * Math.sin(a * 2)));
    });
    this.curve = new T7.CatmullRomCurve3(points, true);
    const wall = heart.getObjectByName("FJ2438_Wall_of_left_atrium");
    wall?.traverse((o) => {
      if (o instanceof T7.Mesh) {
        const clone = new T7.Mesh(o.geometry, mat("#b37268", 0.3, 0.57));
        clone.matrix.copy(o.matrixWorld);
        clone.matrixAutoUpdate = false;
        this.root.add(clone);
      }
    });
    for (let i = 0; i < 18; i++) {
      const dot = new T7.Mesh(new T7.SphereGeometry(55e-5, 12, 8), mat("#6e9990", 0.85));
      dot.userData.annotation = true;
      dot.name = "atrial-flow-reference-marker";
      this.root.add(dot);
      this.dots.push(dot);
    }
    this.clot.position.copy(this.center).add(V(size.x * 0.14, -size.y * 0.16, 0));
    for (let i = 0; i < 9; i++) {
      const cell = new T7.Mesh(new T7.SphereGeometry(9e-4, 16, 12), mat("#b57c67", 0.85));
      cell.position.set(Math.cos(i * 2.4) * 15e-4, i % 3 * 5e-4, Math.sin(i * 2.4) * 8e-4);
      this.clot.add(cell);
    }
    this.root.add(this.clot);
    this.root.userData = { source: "BodyParts3D FJ2425 cavity / FJ2438 wall", units: "metres", cavityBounds: [bounds.min.toArray(), bounds.max.toArray()], representation: "qualitative flow markers; illustrative clot, not a patient scan or CFD" };
  }
  getAnchors() {
    return { leftAtrium: this.center.clone(), atrialClot: this.clot.position.clone() };
  }
  update(time, weight, progress) {
    this.weight = weight;
    visibility(this.root, weight);
    this.dots.forEach((d, i) => {
      const q = ((time * 0.035 + i / 18) % 1 + 1) % 1;
      d.position.copy(this.curve.getPoint(q));
    });
    visibility(this.clot, weight * smooth(progress / 0.55));
  }
  labels() {
    return this.weight > 0.3 ? [{ text: "\u5DE6\u5FC3\u623F", point: this.center.clone(), side: "right", weight: this.weight }, { text: "\u8840\u6D41\u6DE4\u6EDE \xB7 \u673A\u5236\u793A\u610F", point: this.clot.position.clone(), side: "left", weight: this.weight }] : [];
  }
};

// expanded-impact-current.ts
var closer2 = (d, near, far) => 1 - smooth(Math.log(Math.max(d, 1e-12) / near) / Math.log(far / near));
function anteriorInterior(object, reference, inset) {
  object.updateWorldMatrix(true, true);
  const bounds = new T8.Box3().setFromObject(object);
  const ray = new T8.Ray(V(reference.x, reference.y, bounds.max.z + 0.05), V(0, 0, -1));
  const hits = [], a = V(), b = V(), c = V(), hit = V();
  object.traverse((node) => {
    if (!(node instanceof T8.Mesh)) return;
    const positions = node.geometry.getAttribute("position"), indices = node.geometry.index;
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      a.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(node.matrixWorld);
      b.fromBufferAttribute(positions, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(node.matrixWorld);
      c.fromBufferAttribute(positions, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(node.matrixWorld);
      if (ray.intersectTriangle(a, b, c, false, hit)) hits.push(hit.z);
    }
  });
  const crossings = hits.sort((a2, b2) => b2 - a2).filter((z, i, all) => i === 0 || Math.abs(z - all[i - 1]) > 1e-7);
  if (crossings.length < 2 || crossings[0] - crossings[1] < inset * 2) throw new Error("Atlas teaching patch has insufficient tissue clearance");
  return V(reference.x, reference.y, crossings[0] - inset);
}
var Audit = class {
  constructor(anchors, tl, cameraPath) {
    this.anchors = anchors;
    this.tl = tl;
    this.cameraPath = cameraPath;
    this.handoff = new V5HandoffContext(tl);
    this.handoff.setAnchors(anchors.lipid, anchors.lipidWall);
    for (const name of ["body", "stomach", "esophagus", "small_intestine", "pancreas", "liver", "brain", "heart", "aorta", "veins", "pancreatic_ducts", "brainstem", "pancreatic_arteries", "portal_tributaries", "leftKidney", "rightKidney", "adrenals", "thighMuscles"]) {
      const g = new T8.Group();
      g.name = name;
      this.organs[name] = g;
    }
    this.bloodContext.name = "bloodContext";
    this.plasmaField.name = "plasmaField";
    for (const name of ["drugBridgeRBC", "drugBridgeProtein"]) {
      const g = new T8.Group();
      g.name = name;
      this.drugPlasmaBridge.add(g);
    }
  }
  anchors;
  tl;
  cameraPath;
  weightFrame = -1;
  weightCache = /* @__PURE__ */ new Map();
  weights = {};
  camera = new T8.PerspectiveCamera(34, 1920 / 1080);
  organs = {};
  alphas = {};
  personState = {};
  nerveWeight = 0;
  captures = {};
  routeState = {};
  bloodContext = new T8.Group();
  plasmaField = new T8.Group();
  drugPlasmaBridge = new T8.Group();
  person = { update: (s) => {
    this.personState = s;
  } };
  routes = { update: (time, s) => {
    this.routeState = s;
  } };
  handoff;
  setOpacity(o, k) {
    this.alphas[o.name] = k;
  }
  capture(o, k) {
    this.captures[o.name] = k;
  }
  viewWeight(s, views) {
    if (this.weightFrame !== s.frame) {
      this.weightFrame = s.frame;
      this.weightCache.clear();
    }
    for (const view of views) {
      if (this.weightCache.has(view)) continue;
      let weight = 0;
      this.tl.clips.forEach((clip, i) => {
        if (view !== viewOf(clip)) return;
        const before = this.tl.clips[i - 1], after = this.tl.clips[i + 1];
        const start = clip.start - (before?.duration ?? 120) * 0.38, end = clip.end + (after?.duration ?? 120) * 0.58;
        const enter = i === 0 ? 1 : smooth((s.frame - start) / Math.max(45, (before?.duration ?? 120) * 0.35));
        const exit = 1 - smooth((s.frame - clip.end) / Math.max(75, end - clip.end));
        weight = Math.max(weight, enter * exit);
      });
      this.weightCache.set(view, weight);
    }
    return Math.max(0, ...views.map((view) => this.weightCache.get(view) ?? 0));
  }
  update(s) {
    this.lastState = s;
    const pose = this.cameraPath.apply(s.frame, this.camera), d = pose.distance, view = viewOf(s.clip);
    const clipIndex = this.tl.clips.findIndex((c) => c.id === s.clip.id);
    const nextClip = clipIndex >= 0 ? this.tl.clips[clipIndex + 1] : void 0;
    const nextView = nextClip ? viewOf(nextClip) : void 0;
    const outgoingToMacro = !!nextView && ["meal", "action_meal", "torso", "homecheck"].includes(nextView) && ["kidney", "nephron", "arteriole", "pressure", "lcell", "islet", "beta", "receptor", "secretion", "liver", "lipoprotein", "lipid_wall", "plaque", "thrombus", "brainheart", "drug", "muscle_cell", "clot_detail"].includes(view);
    const macroExit = outgoingToMacro ? 1 - smooth((s.frame - (s.clip.end - 90)) / 120) : 1;
    this.handoff.update(s.frame, d, this.camera);
    const near = (a, r = 1) => {
      const p = this.anchors[a];
      return p ? 1 - smooth(pose.focus.distanceTo(p) / Math.max(d * r, 1e-9)) : 0;
    };
    const pancreasFamily = this.viewWeight(s, ["pancreas", "islet", "beta", "receptor", "secretion"]);
    const gutFamily = this.viewWeight(s, ["gut", "lcell"]);
    const drugLead = Math.max(0, ...this.tl.clips.filter((c) => viewOf(c) === "drug").map((c) => smooth((s.frame - c.start + 480) / 120) * (1 - smooth((s.frame - c.start) / 90)))) * closer2(d, 8e-3, 0.06) * near("drug", 2);
    const drugFamily = Math.max(this.viewWeight(s, ["drug"]), drugLead);
    const arteryFamily = this.viewWeight(s, ["pressure", "plaque", "lipid_wall", "thrombus", "clot_detail"]);
    const arterioleFamily = this.viewWeight(s, ["arteriole"]);
    const lipidFamily = this.viewWeight(s, ["lipoprotein"]);
    const wallFamily = this.viewWeight(s, ["lipid_wall"]);
    const renalFamily = this.viewWeight(s, ["kidney", "nephron"]);
    const neural = this.viewWeight(s, ["autonomic"]);
    const wp = pancreasFamily * Math.max(near("islet", 5), near("beta", 5), near("receptor", 5), near("secretion", 5)), wg = gutFamily * near("intestinal", 5);
    const islet = wp * closer2(d, 7e-4, 0.015) * (1 - closer2(d, 3e-5, 11e-5));
    const beta = wp * closer2(d, 9e-5, 4e-4) * (1 - closer2(d, 6e-8, 15e-7));
    const receptor = pancreasFamily * near("receptor", 5) * closer2(d, 15e-8, 8e-6);
    const gut = wg * closer2(d, 6e-4, 4e-3);
    const drug = drugFamily * near("drug", 5) * closer2(d, 15e-8, 15e-6);
    const artery = arteryFamily * Math.max(near("artery", 4), wallFamily * near("foamCell", 5)) * closer2(d, 0.08, 0.35);
    const arteriole = arterioleFamily * near("arteriole", 4) * closer2(d, 7e-3, 0.045);
    const lipid = lipidFamily * near("lipid", 5) * closer2(d, 12e-7, 25e-6);
    const lipidWall = wallFamily * near("lipidWall", 5) * closer2(d, 4e-6, 15e-6);
    const nephron = renalFamily * near("nephron", 4) * closer2(d, 5e-3, 0.04) * macroExit;
    this.weights = { gut, islet, beta, receptor, drug, artery, arteriole, lipid, lipidWall, nephron };
    const muscleFamily = this.viewWeight(s, ["muscle_cell"]), clotFamily = this.viewWeight(s, ["clot_detail"]);
    const customMicro = Math.max(muscleFamily * near("muscleCell", 5), clotFamily * Math.max(near("clotDetail", 5), near("atrialClot", 5))) * closer2(d, 6e-4, 0.05);
    const localMicro = Math.max(customMicro, wp, wg, drugFamily * near("drug", 5), lipidFamily * near("lipid", 5), arterioleFamily * near("arteriole", 4), renalFamily * near("nephron", 4)) * closer2(d, 6e-4, 0.12);
    const anatomy = 1 - closer2(d, 8e-3, 0.1);
    const focus = { meal: [], action_meal: [], torso: ["heart", "liver", "pancreas", "small_intestine"], homecheck: ["heart", "aorta", "leftKidney", "rightKidney"], stomach: ["stomach", "esophagus"], gut: ["small_intestine", "stomach"], lcell: ["small_intestine"], pancreas: ["pancreas", "small_intestine"], islet: ["pancreas"], beta: ["pancreas"], receptor: ["pancreas"], secretion: ["pancreas"], liver: ["liver", "pancreas"], lipid_liver: ["liver", "veins"], pressure: ["heart", "aorta"], arteriole: ["aorta", "heart"], kidney: ["leftKidney", "rightKidney", "aorta", "adrenals"], nephron: ["leftKidney", "rightKidney"], autonomic: ["brainstem", "aorta", "heart", "leftKidney", "rightKidney"], lipoprotein: ["liver", "veins"], lipid_wall: ["aorta"], plaque: ["aorta", "heart"], thrombus: ["aorta", "heart"], brainheart: ["heart", "brain", "aorta"], drug: ["liver", "veins"], muscle: ["thighMuscles"], muscle_cell: ["thighMuscles"], clot_detail: ["aorta"] };
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
    const personOpticalBase = 1 - closer2(d, 0.18, 0.7);
    const macroPreviewOptical = outgoingToMacro ? d > 0.65 ? 0.52 * smooth((s.frame - (s.clip.end - 75)) / 75) : 0 : 0;
    const measurementOptical = diningToMeasurement ? 1 : 1 - smooth(measurementWeight / 0.03) * closer2(d, 0.8, 1.5);
    const personOptical = Math.max(personOpticalBase, macroPreviewOptical) * measurementOptical;
    const visiblePerson = personWeight * personOptical;
    this.person?.update({ time: s.time, action, actionWeights: personActions, adiposity, weight: 1, seatedWeight: mealRenderWeight > 0 ? mealRenderWeight : void 0, measurementWeight, opacity: personWeight * personOptical, propsOpacity: Math.max(mealRenderWeight, actionWeight) * personOptical, wardrobeOpacity: personWeight * personOptical });
    const sympathetic = view === "autonomic" && /交感|升压/.test(s.clip.text);
    this.nerveWeight = neural * (1 - localMicro) * (sympathetic ? 0 : 1);
    for (const [name, o] of Object.entries(this.organs)) {
      const relevant = Object.keys(focus).filter((v) => focus[v].includes(name));
      const emphasis = this.viewWeight(s, relevant);
      let alpha = name === "body" ? personWeight + (1 - personWeight) * 0.065 : (0.1 + 0.88 * emphasis) * (1 - 0.999 * smooth(visiblePerson / 0.06));
      if (name !== "body") o.position.y = 0;
      if (name === "brain") alpha *= 1 - 0.9 * neural;
      if (name === "brainstem") alpha = Math.max(alpha, 0.95 * neural);
      if (name === "pancreatic_ducts") alpha = 0;
      if (name === "thighMuscles") alpha = muscleFamily * anatomy * (1 - customMicro);
      if (name === "esophagus" && neural > 0.1) alpha *= 0.3;
      alpha *= name === "body" ? Math.pow(anatomy, 2) * personOptical : anatomy;
      if (["pancreas", "small_intestine", "liver", "veins", "aorta", "leftKidney", "rightKidney"].includes(name)) alpha *= 1 - localMicro * 0.78;
      if (name === "aorta") alpha *= (1 - artery * 0.88) * (1 - 0.95 * atrialWeight * closer2(d, 0.025, 0.7));
      if (name === "heart") alpha *= 1 - 0.97 * atrialWeight * closer2(d, 0.025, 0.7);
      if (name === "heart") alpha *= 1 - 0.96 * Math.max(arterioleFamily, renalFamily) * closer2(d, 0.16, 0.6);
      if (name === "aorta") alpha *= 1 - 0.93 * arterioleFamily * near("arteriole", 6) * closer2(d, 0.016, 0.12);
      if (airwayWeight > 0) alpha *= 1 - airwayWeight * (name === "body" ? 0.97 : 0.94);
      if (name !== "body") alpha *= 1 - 0.999 * Math.max(artery, arteriole, nephron, lipidWall);
      if (name === "liver") alpha = this.handoff.liverOpacity(alpha, d);
      this.setOpacity(o, clamp(alpha));
      o.traverse((node) => {
        if (node.userData.duplicateBrainstem) node.visible = false;
      });
    }
    this.capture(this.bloodContext, Math.max(drugFamily * near("drug", 5), lipidFamily * near("lipid", 5)) * closer2(d, 3e-4, 6e-3) * (1 - closer2(d, 1e-7, 1e-6)));
    if (lipidFamily > drugFamily) this.bloodContext.position.copy(this.anchors.lipid);
    else this.bloodContext.position.copy(this.anchors.drug);
    this.plasmaField.position.copy(this.bloodContext.position);
    this.capture(this.plasmaField, Math.max(drugFamily * near("drug", 5), lipidFamily * near("lipid", 5)) * closer2(d, 4e-3, 0.03) * (1 - closer2(d, 12e-6, 8e-5)));
    this.drugPlasmaBridge.position.copy(this.anchors.drug);
    const drugBridgeWeight = drugFamily * near("drug", 5);
    this.capture(this.drugPlasmaBridge.children[0], drugBridgeWeight * closer2(d, 35e-6, 18e-5) * (1 - closer2(d, 2e-6, 1e-5)));
    this.capture(this.drugPlasmaBridge.children[1], drugBridgeWeight * closer2(d, 3e-6, 2e-5) * (1 - closer2(d, 4e-8, 12e-8)));
    const routeOptical = 1 - closer2(d, 0.018, 0.12);
    this.routes?.update(s.time, { blood: (1 - personWeight) * (1 - localMicro) * routeOptical * Math.max(this.viewWeight(s, ["gut", "pancreas", "liver", "pressure", "kidney", "lipid_liver", "brainheart"]), 0.25), nerve: this.nerveWeight * (1 - personWeight) * routeOptical, showLumenMarkers: true });
    const foodAlpha = this.viewWeight(s, ["stomach"]) * (1 - localMicro);
    return { frame: s.frame, clip: s.clip.id, view, scalars: { d, macroExit, pancreasFamily, gutFamily, drugFamily, arteryFamily, arterioleFamily, lipidFamily, wallFamily, renalFamily, neural, wp, wg, islet, beta, receptor, gut, drug, artery, arteriole, lipid, lipidWall, nephron, muscleFamily, clotFamily, customMicro, localMicro, anatomy, mealWeight, mealPreview, mealRenderWeight, measurementWeight, actionWeight, personWeight, atrialWeight, airwayWeight, adiposity, personOpticalBase, macroPreviewOptical, personOptical, visiblePerson, drugLead, measurementOptical, foodAlpha, routeOptical, nerveWeight: this.nerveWeight }, booleans: { outgoingToMacro, diningToMeasurement }, organs: { ...this.alphas }, person: { opacity: this.personState.opacity, propsOpacity: this.personState.propsOpacity, wardrobeOpacity: this.personState.wardrobeOpacity }, drugGates: { ...this.captures }, route: { ...this.routeState }, bloodPosition: this.bloodContext.position.toArray(), camera: { position: pose.position.toArray(), target: pose.target.toArray(), focus: pose.focus.toArray(), distance: pose.distance, az: pose.az, el: pose.el } };
  }
};
export {
  Audit,
  V5Atrium,
  V5CameraPath,
  V5CardioDetail,
  V5Person,
  anteriorInterior,
  smooth,
  stateAt,
  viewOf
};
