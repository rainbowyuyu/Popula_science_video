import * as THREE from 'three';
import teachingData from './teaching-data-v2.json';
import {arrow, card, labelPlane, setLineOpacity, setOpacity} from './AlgorithmPrimitivesV2';

export type ModuleContext = {progress: number; time: number; emphasis?: number};

const C = {
  ink: 0x102c3a,
  blue: 0x47b4cb,
  cyan: 0x92e8dc,
  gold: 0xe5b35f,
  coral: 0xe87568,
  purple: 0xa68fe8,
  green: 0x5fc48f,
  pale: 0xeef4ef,
  glass: 0xb4e8e5,
  red: 0xff6c69,
};

const solid = (color: number, roughness = 0.42, metalness = 0.08) =>
  new THREE.MeshStandardMaterial({color, roughness, metalness, envMapIntensity: 1.15});
const glow = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({color, transparent: opacity < 1, opacity, depthWrite: opacity > 0.75});
const line = (points: THREE.Vector3[], color: number, opacity = 0.8) =>
  new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({color, transparent: opacity < 1, opacity}),
  );
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export abstract class SceneModuleV2 extends THREE.Group {
  readonly anchors = new Map<string, THREE.Object3D>();
  abstract update(ctx: ModuleContext): void;
  protected anchor(id: string, object: THREE.Object3D) {
    this.anchors.set(id, object);
    return object;
  }
}

export class HeroLabV2 extends SceneModuleV2 {
  private readonly blocks: THREE.Mesh[] = [];
  private readonly droplet: THREE.Mesh;
  constructor() {
    super();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6.8, 96), solid(0x102b37, 0.9));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.8;
    this.add(floor);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.5, 0.12), solid(C.pale, 0.34, 0.14));
    screen.position.set(-2.9, 0.7, -0.55);
    this.add(screen);
    for (let i = 0; i < 20; i++) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(0.33, 0.33, 0.33),
        solid([C.blue, C.cyan, C.gold, C.coral][i % 4], 0.25, 0.12),
      );
      block.position.set(-4.45 + (i % 10) * 0.43, 1.3 - Math.floor(i / 10) * 0.48, -0.32);
      this.add(block);
      this.blocks.push(block);
    }
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.25, 64), solid(C.ink, 0.22, 0.35));
    disk.rotation.x = Math.PI / 2;
    disk.position.set(0.3, -0.25, 0.1);
    this.add(disk);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.05, 16, 64), glow(C.cyan, 0.8));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(disk.position);
    this.add(ring);
    this.droplet = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 32, 20),
      new THREE.MeshPhysicalMaterial({color: C.glass, roughness: 0.08, transmission: 0.7, transparent: true, opacity: 0.78, thickness: 0.6}),
    );
    this.droplet.position.set(3.5, 0.2, 0.2);
    this.add(this.droplet);
    this.anchor('file', screen);
    this.anchor('droplet', this.droplet);
  }
  update({progress, time}: ModuleContext) {
    const q = smooth(progress);
    this.blocks.forEach((b, i) => {
      b.position.x = -4.45 + (i % 10) * 0.43 + q * 2.0;
      b.position.y = 1.3 - Math.floor(i / 10) * 0.48 + Math.sin(time * 1.2 + i) * 0.025;
    });
    this.droplet.scale.setScalar(0.78 + 0.28 * q);
    this.droplet.position.x = lerp(3.5, 1.8, q);
  }
}

export class EncodeLineV2 extends SceneModuleV2 {
  private readonly bases: THREE.Mesh[] = [];
  private readonly bits: THREE.Mesh[] = [];
  private readonly bitGroups: THREE.Group[] = [];
  private readonly baseLabels: THREE.Mesh[] = [];
  private readonly bitLabels: THREE.Mesh[] = [];
  private readonly helix = new THREE.Group();
  private readonly pairs = ['00', '01', '10', '11', '01', '00', '11', '10'];
  private readonly basesText = ['A', 'T', 'C', 'G', 'T', 'A', 'G', 'C'];
  constructor() {
    super();
    this.add(this.helix);
    for (let i = 0; i < this.pairs.length; i++) {
      const pair = card({width: 0.78, height: 0.48, color: i % 2 ? C.blue : C.coral, label: this.pairs[i], labelSize: 38, labelBackground: 'rgba(8,27,35,0.86)'});
      pair.group.position.set(-3.6 + i * 1.02, 1.88, 0.08);
      this.add(pair.group); this.bits.push(pair.body); this.bitGroups.push(pair.group);
      const map = labelPlane(`${this.basesText[i]}`, 0.42, 0.42, 42, '#f5fbf8', 'rgba(10,49,57,0.92)');
      map.position.set(-3.6 + i * 1.02, 1.05, 0.16); this.add(map); this.bitLabels.push(map);
    }
    for (let i = 0; i < 16; i++) {
      const t = i / 15 * Math.PI * 2.8;
      const x = -0.35 + t * 0.46;
      const a = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 10), solid([C.blue, C.cyan, C.gold, C.coral][i % 4], 0.18, 0.08));
      const b = a.clone();
      a.position.set(x, Math.sin(t) * 0.7, Math.cos(t) * 0.35);
      b.position.set(x, -Math.sin(t) * 0.7, -Math.cos(t) * 0.35);
      this.helix.add(a, b, line([a.position.clone(), b.position.clone()], C.gold, 0.55));
      this.bases.push(a, b);
      const letter = this.basesText[Math.floor(i / 2) % this.basesText.length];
      const label = labelPlane(letter, 0.34, 0.3, 32, '#0a2832', 'rgba(238,248,244,0.94)');
      label.position.set(x, Math.sin(t) * 0.7 + 0.22, 0.42); this.helix.add(label); this.baseLabels.push(label);
    }
    this.helix.add(line(Array.from({length: 100}, (_, i) => { const t = i / 99 * Math.PI * 2.8; return new THREE.Vector3(-0.35 + t * 0.46, Math.sin(t) * 0.7, Math.cos(t) * 0.35); }), C.cyan, 0.9));
    this.helix.add(line(Array.from({length: 100}, (_, i) => { const t = i / 99 * Math.PI * 2.8; return new THREE.Vector3(-0.35 + t * 0.46, -Math.sin(t) * 0.7, -Math.cos(t) * 0.35); }), C.coral, 0.9));
    const caption = labelPlane('两位一组 → A / T / C / G → 双螺旋', 3.8, 0.42, 30, '#d7eee8', 'rgba(6,28,37,0.7)');
    caption.position.set(0.9, -1.25, 0.45); this.add(caption);
    const content = new THREE.Group();
    [...this.children].forEach((child) => content.add(child));
    content.scale.setScalar(0.78);
    this.add(content);
    this.anchor('address', this.bits[4]);
    this.anchor('helix', this.helix);
  }
  update({progress, time}: ModuleContext) {
    const q = smooth(progress);
    this.bitGroups.forEach((group, i) => { group.position.x = -3.6 + i * 1.02 + q * 1.0; group.rotation.y = time * 0.15 + i * 0.04; });
    this.bitLabels.forEach((label, i) => { label.position.x = -3.6 + i * 1.02 + q * 1.0; (label.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.58 * smooth(q * 1.4); });
    this.helix.position.x = lerp(1.0, -0.35, q);
    this.helix.rotation.y = 0.18 * Math.sin(time * 0.35) + q * 0.6;
    this.bases.forEach((b, i) => b.scale.setScalar(0.58 + 0.42 * smooth(q + i * 0.012)));
    this.baseLabels.forEach((label, i) => { label.scale.setScalar(0.7 + 0.3 * smooth(q + i * 0.015)); });
  }
}

export class ConstraintStationV2 extends SceneModuleV2 {
  private readonly candidates: THREE.Mesh[] = [];
  private readonly candidateMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly candidateBadMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly scanner: THREE.Mesh;
  constructor() {
    super();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(8.8, 3.9, 0.12), new THREE.MeshPhysicalMaterial({color: C.glass, transmission: 0.32, transparent: true, opacity: 0.2, roughness: 0.16}));
    glass.position.z = -0.6;
    this.add(glass);
    for (let i = 0; i < 34; i++) {
      const good = solid([C.blue, C.cyan, C.gold][i % 3], 0.35);
      const bad = solid(C.coral, 0.35);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.09), i % 5 === 0 ? bad : good);
      m.position.set(-4.1 + (i % 17) * 0.49, 0.65 - Math.floor(i / 17) * 0.5, 0.15);
      this.add(m); this.candidates.push(m); this.candidateMaterials.push(good); this.candidateBadMaterials.push(bad);
    }
    this.scanner = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.9, 0.1), glow(C.gold, 0.9));
    this.scanner.position.set(-4.2, 0, 0.32); this.add(this.scanner);
    for (const [y, color] of [[-1.35, C.cyan], [-1.85, C.gold]] as const) {
      this.add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.09, 0.05), glow(0xcbd8d2, 0.65))).position.set(-2.2, y, 0.3);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.07), glow(color, 0.92));
      bar.position.set(-2.7, y, 0.35); this.add(bar);
    }
    this.anchor('candidate-strip', this.candidates[8]);
    this.anchor('gc-meter', this.scanner);
  }
  update({progress, time}: ModuleContext) {
    const q = smooth(progress);
    this.scanner.position.x = -4.2 + 7.8 * q;
    this.candidates.forEach((m, i) => {
      const bad = i % 5 === 0;
      m.position.x = -4.1 + (i % 17) * 0.49 + (bad ? -0.7 * smooth(q * 1.5) : 0);
      // Reuse constructor-owned materials. Creating a new material for every
      // candidate on every frame leaks thousands of GPU resources.
      m.material = bad && q > 0.46 ? this.candidateBadMaterials[i] : this.candidateMaterials[i];
      m.rotation.z = bad ? 0.18 * Math.sin(time * 1.6 + i) : 0;
    });
  }
}

export class FountainGraphV2 extends SceneModuleV2 {
  private readonly droplets: THREE.Group[] = [];
  private readonly sources: THREE.Group[] = [];
  private readonly equations: THREE.Group[] = [];
  private readonly relationLines: THREE.Object3D[] = [];
  private readonly recovered: THREE.Group;
  constructor() {
    super();
    const sourceValues = (teachingData as any).fountain.source as string[];
    const equationValues = (teachingData as any).fountain.equations as string[];
    sourceValues.forEach((value, i) => {
      const item = card({width: 1.18, height: 0.62, color: i === 1 ? C.coral : [C.blue, C.cyan, C.gold][i], label: i === 1 ? 'B · 丢片' : `块 ${value}`, labelSize: i === 1 ? 34 : 38, labelBackground: i === 1 ? 'rgba(82,31,40,0.9)' : 'rgba(7,27,37,0.9)'});
      item.group.position.set(-3.45, 1.35 - i * 1.35, 0.2); this.add(item.group); this.sources.push(item.group);
    });
    equationValues.forEach((value, i) => {
      const item = card({width: 1.65, height: 0.68, color: i === 0 ? C.purple : C.ink, label: value, labelSize: 40, labelBackground: 'rgba(21,31,55,0.92)'});
      item.group.position.set(0.05, 1.35 - i * 1.35, 0.2); this.add(item.group); this.equations.push(item.group); this.droplets.push(item.group);
    });
    const xor = labelPlane('⊕ 关系', 1.0, 0.38, 30, '#f2dca7', 'rgba(76,44,81,0.78)'); xor.position.set(-1.65, 1.92, 0.3); this.add(xor);
    for (let i = 0; i < 3; i++) {
      const fromA = new THREE.Vector3(-2.85, 1.35 - i * 1.35, 0.25);
      const fromB = new THREE.Vector3(-2.85, 1.35 - ((i + 1) % 3) * 1.35, 0.25);
      const to = new THREE.Vector3(-0.78, 1.35 - i * 1.35, 0.25);
      const l1 = arrow(fromA, to, C.gold, 0.76); const l2 = arrow(fromB, to, C.cyan, 0.58);
      this.add(l1, l2); this.relationLines.push(l1, l2);
    }
    const recover = card({width: 1.6, height: 0.68, color: C.green, label: 'B = A ⊕ (A ⊕ B)', labelSize: 26, labelBackground: 'rgba(18,72,61,0.92)'});
    recover.group.position.set(3.2, -1.35, 0.38); this.add(recover.group); this.recovered = recover.group; setOpacity(this.recovered, 0);
    const content = new THREE.Group();
    [...this.children].forEach((child) => content.add(child));
    content.scale.setScalar(0.72);
    this.add(content);
    this.anchor('droplet-network', this.equations[0]);
    this.anchor('recovered-block', this.recovered);
  }
  update({progress, time}: ModuleContext) {
    const q = smooth(progress);
    this.sources.forEach((g, i) => { g.position.z = 0.18 + 0.03 * Math.sin(time * 0.45 + i); });
    const missingOut = smooth((q - 0.44) / 0.18);
    this.sources[1].position.x = lerp(-3.45, -5.35, missingOut);
    setOpacity(this.sources[1], 1 - 0.72 * missingOut);
    this.equations.forEach((g, i) => { g.position.z = 0.2 + 0.04 * Math.sin(time * 0.5 + i); setOpacity(g, 0.12 + 0.88 * smooth((q - 0.12 - i * 0.08) / 0.35)); });
    this.relationLines.forEach((g, i) => setLineOpacity(g, 0.12 + 0.78 * smooth((q - 0.12 - i * 0.035) / 0.32)));
    const recoveredQ = smooth((q - 0.63) / 0.27);
    this.recovered.position.x = lerp(3.2, -3.45, recoveredQ);
    this.recovered.position.y = lerp(-1.35, 0, recoveredQ);
    setOpacity(this.recovered, recoveredQ);
    this.rotation.z = 0.018 * Math.sin(time * 0.35) + q * 0.055;
  }
}

export class SequencingFlowV2 extends SceneModuleV2 {
  private readonly reads: THREE.Group[] = [];
  constructor() {
    super();
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.82, 1.3, 48), solid(C.ink, 0.24, 0.28)); nozzle.rotation.z = Math.PI / 2; nozzle.position.set(-3.6, 0.2, 0); this.add(nozzle);
    for (let r = 0; r < 6; r++) {
      const g = new THREE.Group(); g.position.set(-2.7, 1.4 - r * 0.58, 0.1);
      for (let i = 0; i < 22; i++) { const bad = i === 6 + r || (i === 14 && r % 2 === 0); const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10), solid(bad ? C.red : [C.blue, C.cyan, C.gold, C.coral][(i + r) % 4], 0.22)); m.position.x = i * 0.34; g.add(m); if (i > 0) g.add(line([new THREE.Vector3((i - 1) * 0.34, 0, 0), new THREE.Vector3(i * 0.34, 0, 0)], C.ink, 0.22)); }
      this.add(g); this.reads.push(g);
    }
    const liquid = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.35, 0.5), new THREE.MeshPhysicalMaterial({color: C.glass, transmission: 0.78, transparent: true, opacity: 0.43, roughness: 0.06})); liquid.position.set(0, -2.25, -0.15); this.add(liquid);
    this.anchor('sequencing', nozzle); this.anchor('error-read', this.reads[2]);
  }
  update({progress, time}: ModuleContext) { const q = smooth(progress); this.reads.forEach((g, i) => { g.position.x = -2.7 + 0.95 * q; g.position.z = 0.1 + Math.sin(time * 0.7 + i) * 0.035; g.rotation.z = (i % 2 ? -1 : 1) * 0.012 * q; }); }
}

export class ConsensusLabV2 extends SceneModuleV2 {
  private readonly cells: THREE.Mesh[] = [];
  private readonly consensus: THREE.Mesh[] = [];
  private readonly pathDots: THREE.Mesh[] = [];
  private readonly readLetters: THREE.Mesh[] = [];
  private readonly voteBars: THREE.Mesh[] = [];
  private readonly matrixData = (teachingData as any).smithWaterman;
  constructor() {
    super();
    const bucket = new THREE.Mesh(new THREE.BoxGeometry(8.7, 4.4, 0.12), new THREE.MeshPhysicalMaterial({color: C.glass, transmission: 0.4, transparent: true, opacity: 0.17, roughness: 0.14})); bucket.position.set(0, 0.05, -0.45); this.add(bucket);
    const title = labelPlane('局部比对：从读段到共识', 3.4, 0.4, 32, '#d7eee8', 'rgba(7,30,39,0.74)'); title.position.set(-2.65, 2.33, 0.3); this.add(title);
    const matrix = this.matrixData.matrix as number[][];
    const x0 = -0.15, y0 = 1.48, dx = 0.47, dy = 0.43;
    for (let y = 0; y < matrix.length; y++) for (let x = 0; x < matrix[y].length; x++) {
      const value = matrix[y][x];
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.34, 0.08), glow(value >= 6 ? C.gold : value >= 2 ? C.blue : C.ink, 0.17));
      m.position.set(x0 + x * dx, y0 - y * dy, 0.14); this.add(m); this.cells.push(m);
      const label = labelPlane(String(value), 0.30, 0.25, 22, '#e8f5f0', 'rgba(9,30,40,0.7)'); label.position.set(m.position.x, m.position.y, 0.21); this.add(label);
    }
    const path = this.matrixData.path as number[][];
    path.forEach(([y, x], i) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), glow(C.coral, 0.96)); dot.position.set(x0 + x * dx, y0 - y * dy, 0.32); this.add(dot); this.pathDots.push(dot);
      if (i > 0) this.add(line([this.pathDots[i - 1].position.clone(), dot.position.clone()], C.coral, 0.78));
    });
    const ref = String(this.matrixData.reference), query = String(this.matrixData.query);
    const reads = (this.matrixData.reads as {sequence: string; weight: string}[]);
    const readX = -4.15, readY = 0.7;
    [ref, query, ...reads.slice(2).map((r) => r.sequence)].forEach((sequence, row) => {
      [...sequence].forEach((letter, col) => {
        const label = labelPlane(letter, 0.39, 0.32, 26, '#0a2832', row === 0 ? 'rgba(224,239,234,0.9)' : row === 1 ? 'rgba(146,232,220,0.86)' : 'rgba(71,180,203,0.72)');
        label.position.set(readX + col * 0.42, readY - row * 0.43, 0.22); this.add(label); this.readLetters.push(label);
      });
    });
    const readTitle = labelPlane('读段', 0.75, 0.3, 25, '#d8eee8', 'rgba(7,30,39,0.78)'); readTitle.position.set(-4.05, 1.16, 0.3); this.add(readTitle);
    const consensusText = String(this.matrixData.consensus);
    [...consensusText].forEach((letter, i) => {
      const chip = labelPlane(letter, 0.43, 0.36, 30, '#082a2b', 'rgba(95,196,143,0.92)'); chip.position.set(-1.4 + i * 0.52, -1.53, 0.28); this.add(chip); this.consensus.push(chip);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.06), glow(i === 3 ? C.gold : C.green, 0.7)); bar.position.set(-1.4 + i * 0.52, -1.05, 0.18); this.add(bar); this.voteBars.push(bar);
    });
    const rule = labelPlane('质量加权投票  →  GATTAC', 3.1, 0.38, 29, '#e7f6ef', 'rgba(16,60,53,0.82)'); rule.position.set(1.9, -1.48, 0.3); this.add(rule);
    const content = new THREE.Group();
    [...this.children].forEach((child) => content.add(child));
    // The consensus camera is a deliberate macro close-up. Keep the complete
    // read stack and matrix inside that lens instead of letting the left rows
    // disappear at the frame edge.
    content.scale.setScalar(0.46);
    content.position.y = 0.42;
    this.add(content);
    this.anchor('alignment-grid', this.pathDots[2]); this.anchor('consensus-column', this.consensus[3]);
  }
  update({progress}: ModuleContext) {
    const q = smooth(progress);
    this.cells.forEach((m) => { (m.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.26 * q; });
    this.pathDots.forEach((dot, i) => { const p = smooth((q - i * 0.1) / 0.32); dot.scale.setScalar(0.35 + 0.85 * p); (dot.material as THREE.MeshBasicMaterial).opacity = p; });
    this.readLetters.forEach((letter, i) => { letter.scale.setScalar(0.74 + 0.26 * smooth(q * 1.25 - i * 0.012)); });
    this.consensus.forEach((m, i) => { const p = smooth((q - 0.52 - i * 0.045) / 0.28); m.scale.setScalar(0.7 + 0.3 * p); setOpacity(m, 0.2 + 0.8 * p); });
    this.voteBars.forEach((bar, i) => { bar.scale.y = 0.2 + (0.8 + (i === 3 ? 0.15 : 0)) * smooth((q - 0.45 - i * 0.035) / 0.32); });
  }
}

export class ModelStudioV2 extends SceneModuleV2 {
  private readonly nodes: THREE.Mesh[] = [];
  private readonly tokens: THREE.Mesh[] = [];
  private readonly nodeGroups: THREE.Group[] = [];
  private readonly nodeLabels: THREE.Mesh[] = [];
  private readonly route: THREE.Object3D[] = [];
  private readonly tokenLabels: THREE.Mesh[] = [];
  constructor() {
    super();
    const stages = [
      {x: -4.05, label: ['k-mer', 'GAT / TAC'], color: C.blue},
      {x: -2.45, label: ['BPE', 'GAT · TAC'], color: C.cyan},
      {x: -0.82, label: ['候选评分', '结构化'], color: C.gold},
      {x: 0.82, label: ['约束检查', 'GC / 地址'], color: C.coral},
      {x: 2.45, label: ['检索', '文献 / 工具'], color: C.purple},
      {x: 4.05, label: ['读回', '观察结果'], color: C.green},
    ];
    stages.forEach((stage, i) => {
      const item = card({width: 1.25, height: 0.72, color: stage.color, label: stage.label, labelSize: 27, labelBackground: 'rgba(6,28,38,0.88)'});
      item.group.position.set(stage.x, 0.72, 0.2); this.add(item.group); this.nodes.push(item.body); this.nodeGroups.push(item.group);
      const subtitle = labelPlane(i === 0 ? '切成窗口' : i === 1 ? '保留短词' : i === 2 ? '候选排序' : i === 3 ? '不通过就退回' : i === 4 ? '调用资料' : '回到文件', 1.42, 0.3, 23, '#cce7df', 'rgba(5,24,33,0.68)'); subtitle.position.set(stage.x, -0.02, 0.3); this.add(subtitle); this.nodeLabels.push(subtitle);
      if (i < stages.length - 1) { const link = arrow(new THREE.Vector3(stage.x + 0.7, 0.72, 0.25), new THREE.Vector3(stages[i + 1].x - 0.7, 0.72, 0.25), C.gold, 0.7); this.add(link); this.route.push(link); }
    });
    const tokenValues = ['GAT', 'TAC', 'GGA', 'CTA', 'ATC', 'GAT'];
    tokenValues.forEach((value, i) => {
      const token = labelPlane(value, 0.7, 0.42, 31, '#082b34', i % 2 ? 'rgba(146,232,220,0.92)' : 'rgba(71,180,203,0.92)'); token.position.set(-3.3 + i * 1.32, -1.15, 0.3); this.add(token); this.tokenLabels.push(token);
    });
    const ribbon = labelPlane('短词 token / k-mer 只是中间表示，最终仍由编码器与测序读回校验', 6.8, 0.42, 27, '#d7eee8', 'rgba(7,29,39,0.78)'); ribbon.position.set(0, -1.72, 0.28); this.add(ribbon);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.028, 10, 64, Math.PI * 1.55), glow(C.green, 0.78)); loop.rotation.z = Math.PI * 0.08; loop.position.set(3.0, -1.78, 0.22); this.add(loop);
    const note = labelPlane('模型辅助筛选与编排，不替代合成、测序和解码', 3.1, 0.38, 26, '#e5f4ed', 'rgba(20,65,57,0.82)'); note.position.set(1.75, -2.28, 0.3); this.add(note);
    const content = new THREE.Group();
    [...this.children].forEach((child) => content.add(child));
    content.scale.setScalar(0.74);
    content.position.y = 0.38;
    this.add(content);
    // Keep legacy anchors meaningful for the handoff contract.
    this.anchor('candidate-score', this.nodeGroups[2]); this.anchor('tokens', this.tokenLabels[2]); this.anchor('tool-loop', loop);
  }
  update({progress, time}: ModuleContext) {
    const q = smooth(progress);
    this.nodeGroups.forEach((group, i) => { const p = smooth((q - i * 0.1) / 0.36); group.scale.setScalar(0.72 + 0.28 * p); setOpacity(group, 0.25 + 0.75 * p); group.rotation.z = Math.sin(time * 0.35 + i) * 0.012; });
    this.nodeLabels.forEach((label, i) => { const p = smooth((q - i * 0.1) / 0.36); (label.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.82 * p; });
    this.route.forEach((link, i) => setOpacity(link, 0.12 + 0.8 * smooth((q - 0.08 - i * 0.08) / 0.3)));
    this.tokenLabels.forEach((token, i) => { const p = smooth((q - 0.38 - i * 0.07) / 0.3); token.position.y = lerp(-1.9, -1.15, p); (token.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.84 * p; });
    this.rotation.z = 0.012 * Math.sin(time * 0.27);
  }
}

export class CodaTableV2 extends SceneModuleV2 {
  private readonly baseY = new Map<THREE.Object3D, number>();
  private readonly paperPages: THREE.Object3D[] = [];
  constructor(pagePaths = ['papers/goldman-2013-page.png', 'papers/dna-fountain-preprint-01.png', 'papers/nucleotide-transformer-2024-01.png']) {
    super();
    // The React evidence overlay owns the raster pages in the bundled render.
    // Keep the Three.js paper anchors for continuity, but avoid a second set
    // of oversized backing boards showing through the overlay.
    const domEvidence = pagePaths.some((path) => path.startsWith('/public/'));
    const table = new THREE.Mesh(new THREE.BoxGeometry(12, 0.24, 5.6), solid(0x1c3741, 0.48, 0.18)); table.position.y = -2.5; this.add(table);
    [-2.6, -0.4, 1.8].forEach((x, i) => {
      // These are rasterized first pages from the cited sources. A light box
      // behind each page keeps physical depth while the front face remains
      // legible as a real document rather than a metadata card.
      // `pagePaths` may already be a Remotion staticFile URL (for example
      // `/papers/goldman-2013-page.png`). Prefix only the legacy relative
      // form; otherwise the browser resolves the asset against the literal
      // `public` host and the evidence page disappears in headless renders.
      const pagePath = pagePaths[i] ?? '';
      const textureUrl = pagePath.startsWith('/') || pagePath.includes('://') ? pagePath : `/${pagePath}`;
      const texture = new THREE.TextureLoader().load(textureUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const backing = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.25, 0.05), new THREE.MeshStandardMaterial({color: [0xf7f3e8, 0xf0eadc, 0xe9f0ec][i], roughness: 0.72}));
      backing.position.set(x, -0.3 + (i % 2) * 0.18, 0.08 + i * 0.03);
      backing.rotation.z = [-0.06, 0.035, -0.018][i];
      if (!domEvidence) this.add(backing); this.baseY.set(backing, backing.position.y);
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(2.65, 3.2), new THREE.MeshBasicMaterial({map: texture, color: 0xffffff, transparent: true, opacity: 0.98, side: THREE.DoubleSide}));
      paper.position.set(x, -0.3 + (i % 2) * 0.18, 0.115 + i * 0.03);
      paper.rotation.z = [-0.06, 0.035, -0.018][i];
      if (!domEvidence) this.add(paper); this.baseY.set(paper, paper.position.y); this.paperPages.push(paper);
    });
    const formula = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 8, 64), glow(C.gold, 0.72)); formula.rotation.x = Math.PI / 2; formula.position.set(4.2, 0.25, 0.2); this.add(formula); this.anchor('papers', this.paperPages[0]); this.anchor('formulas', formula);
  }
  update({progress, time}: ModuleContext) {
    const q = smooth(progress);
    this.children.forEach((o, i) => {
      const base = this.baseY.get(o);
      if (base !== undefined) o.position.y = base + 0.02 * Math.sin(time * 0.3 + i) * q;
    });
    this.position.y = (1 - q) * 0.4;
  }
}
