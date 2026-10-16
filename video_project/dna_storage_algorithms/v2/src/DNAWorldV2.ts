import * as THREE from 'three';
import {CameraRigV2} from './CameraRigV2';
import {CameraPose, ShotSpec, TimelineV2} from './contracts';
import {
  CodaTableV2,
  ConstraintStationV2,
  ConsensusLabV2,
  EncodeLineV2,
  FountainGraphV2,
  HeroLabV2,
  ModelStudioV2,
  SceneModuleV2,
  SequencingFlowV2,
} from './scene/SceneModulesV2';

export type DNAWorldStateV2 = {
  frame: number;
  time: number;
  sceneId: string;
  progress: number;
  previousSceneId?: string;
  elapsed: number;
};

type ModuleEntry = {kind: ShotSpec['kind']; module: SceneModuleV2};

const palette = {bg: 0x071c26, ink: 0x102c3a, cyan: 0x8de6dc, gold: 0xe5b35f};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (t: number) => { const x = clamp(t); return x * x * (3 - 2 * x); };
const poseFrom = (shot: ShotSpec, end: boolean): CameraPose => end ? shot.cameraOut : shot.cameraIn;

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as THREE.Mesh).material;
    if (!material) return;
    for (const item of Array.isArray(material) ? material : [material]) item.dispose();
  });
}

/** Continuous 3D world for the V2 film. It deliberately uses only deterministic
 * geometry so the project remains renderable when external assets are absent. */
export class DNAWorldV2 {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly rig: CameraRigV2;
  private readonly root = new THREE.Group();
  private readonly backdrop = new THREE.Group();
  private readonly anchorParticle = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 14, 10),
    new THREE.MeshBasicMaterial({color: palette.cyan, transparent: true, opacity: 0.95}),
  );
  private readonly splatPoints: THREE.Points;
  private readonly modules: ModuleEntry[];
  private readonly timeline: TimelineV2;

  constructor(canvas: HTMLCanvasElement, timeline: TimelineV2, width = 1920, height = 1080, paperPaths: string[] = []) {
    this.timeline = timeline;
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(palette.bg);
    this.scene.fog = new THREE.FogExp2(palette.bg, 0.028);
    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.05, 100);
    this.rig = new CameraRigV2(this.camera);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xdaf9ff, 0x06131b, 1.5));
    const key = new THREE.DirectionalLight(0xffe4b2, 3.3); key.position.set(-5, 7, 8); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x65dcff, 1.8); fill.position.set(7, 2, -5); this.scene.add(fill);
    this.scene.add(this.root);
    this.root.add(this.backdrop);
    this.backdrop.add(this.makeBackdrop());
    this.root.add(this.anchorParticle);
    this.splatPoints = this.makeSplatPoints();
    this.root.add(this.splatPoints);
    this.modules = [
      {kind: 'hook', module: new HeroLabV2()},
      {kind: 'encode', module: new EncodeLineV2()},
      {kind: 'constraint', module: new ConstraintStationV2()},
      {kind: 'fountain', module: new FountainGraphV2()},
      {kind: 'wet-lab', module: new SequencingFlowV2()},
      {kind: 'decode', module: new ConsensusLabV2()},
      {kind: 'model-assist', module: new ModelStudioV2()},
      {kind: 'return', module: new HeroLabV2()},
      {kind: 'evidence', module: new CodaTableV2(paperPaths.length ? paperPaths : undefined)},
    ];
    this.modules.forEach(({module}) => this.root.add(module));
    // A headless still can capture the first canvas paint before React's
    // frame effect runs. Start from the hook only so that frame 0 never shows
    // every station stacked on top of one another.
    this.modules.forEach(({kind, module}) => {
      module.visible = kind === 'hook';
      module.scale.setScalar(kind === 'hook' ? 1 : 0);
    });
    // Paint a deterministic first frame immediately; this also protects
    // headless stills from capturing the pre-effect canvas while React is
    // mounting the Stage component.
    this.render({frame: 0, time: 0, sceneId: 's01-hook', progress: 0, elapsed: 0});
  }

  private makeBackdrop() {
    const group = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), new THREE.MeshStandardMaterial({color: 0x0d2b36, roughness: 0.88, metalness: 0.06}));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -3.25; group.add(floor);
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2 + i * 1.25, 0.012 + i * 0.003, 8, 120), new THREE.MeshBasicMaterial({color: i % 2 ? 0x285968 : 0xb2ded0, transparent: true, opacity: 0.16 - i * 0.018}));
      ring.rotation.x = Math.PI / 2.2; ring.position.set(i * 0.9 - 2.2, -0.5 + i * 0.12, -3.8 - i * 0.2); group.add(ring);
    }
    return group;
  }

  private makeSplatPoints() {
    const count = 240;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = i * 2.399963;
      const r = 1.2 + (i % 37) * 0.065;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.sin(a * 1.13) * r * 0.42;
      positions[i * 3 + 2] = -1.6 + Math.sin(a) * 0.75;
      const color = new THREE.Color(i % 3 === 0 ? palette.gold : palette.cyan);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({size: 0.035, vertexColors: true, transparent: true, opacity: 0.28, sizeAttenuation: true}));
  }

  private shotAt(time: number) {
    const shots = this.timeline.shots;
    const index = Math.max(0, shots.findIndex((shot) => time >= shot.startSec && time < shot.endSec));
    return {shot: shots[index] ?? shots[shots.length - 1], previous: shots[index - 1]};
  }

  private moduleFor(kind: ShotSpec['kind']) { return this.modules.find((entry) => entry.kind === kind)?.module; }

  render(state: DNAWorldStateV2) {
    const {shot, previous} = this.shotAt(state.time);
    const p = clamp((state.time - shot.startSec) / Math.max(0.001, shot.endSec - shot.startSec));
    const elapsed = state.elapsed ?? state.time - shot.startSec;
    const previousActive = previous && elapsed < 1.35;
    const handoff = previousActive ? smooth(elapsed / 1.35) : 1;
    this.modules.forEach(({kind, module}) => {
      const active = kind === shot.kind;
      const old = previousActive && kind === previous.kind;
      module.visible = active || old;
      module.position.set(0, 0, 0);
      if (active && previousActive) module.position.z = (1 - handoff) * 5.8;
      if (old) module.position.z = -handoff * 5.8;
      // The encode and model-assist layouts span a wider field than the
      // documentary camera's close lens. Keep the same camera move and
      // continuity anchors, but compose those two stations as a readable
      // single shot instead of cropping their outer nodes.
      const compositionScale = kind === 'encode' ? 0.5 : kind === 'model-assist' ? 0.5 : 1.0;
      // Scale is an explicit render gate in addition to Object3D.visible.
      // It keeps the first deterministic paint clean even if a renderer
      // snapshots before the visibility flag is propagated.
      const modulePresence = active ? 1 : old ? (1 - handoff) : 0;
      module.scale.setScalar(compositionScale * modulePresence);
      if (active) module.update({progress: p, time: state.time, emphasis: handoff});
      if (old) module.update({progress: 1, time: state.time, emphasis: 1 - handoff});
    });

    const inPose = poseFrom(shot, false);
    const outPose = poseFrom(shot, true);
    const orbit = shot.kind === 'fountain' ? 1.15 : shot.kind === 'hook' ? 0.65 : 0.38;
    this.rig.apply(inPose, outPose, p, orbit, 0.01 * Math.sin(state.frame * 0.02));
    const anchorQ = smooth(p);
    this.anchorParticle.position.set(
      THREE.MathUtils.lerp(-4.2, 3.9, anchorQ),
      Math.sin(anchorQ * Math.PI * 2 + state.time * 0.25) * 0.58,
      0.42 + Math.cos(anchorQ * Math.PI) * 0.32,
    );
    this.anchorParticle.scale.setScalar(0.8 + 0.5 * Math.sin(anchorQ * Math.PI));
    (this.splatPoints.material as THREE.PointsMaterial).opacity = 0.12 + 0.28 * Math.sin(anchorQ * Math.PI);
    this.splatPoints.rotation.y = 0.04 * state.time + anchorQ * 0.55;
    this.splatPoints.position.x = THREE.MathUtils.lerp(2.6, -1.1, anchorQ);
    this.splatPoints.position.z = -2.2 + Math.sin(anchorQ * Math.PI) * 0.8;
    this.backdrop.rotation.z = 0.008 * Math.sin(state.time * 0.2);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
