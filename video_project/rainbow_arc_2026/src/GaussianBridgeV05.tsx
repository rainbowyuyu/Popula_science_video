import * as THREE from 'three';
import {staticFile} from 'remotion';

/**
 * One row from scripts/sample_gaussian_ply.py.  The optional values are kept
 * optional so the bridge can also consume older samples containing only
 * position and colour.
 */
export type GaussianSampleRow = [
  number,
  number,
  number,
  number,
  number,
  number,
  number?,
  number?,
];

export type GaussianBridgePoint = {
  readonly index: number;
  readonly position: THREE.Vector3;
  readonly color: THREE.Color;
  readonly alpha: number;
  readonly radius: number;
  /** Deterministic point reveal position in [0, 1]. */
  readonly reveal: number;
};

export type GaussianSamplePayload = {
  points?: GaussianSampleRow[];
  meta?: Record<string, unknown>;
};

export interface GaussianBridgeV05Options {
  /** Converts the source PLY coordinate range (~±0.025) to world units. */
  coordinateScale?: number;
  /** Converts the sampled Gaussian radius to a point sprite radius. */
  radiusScale?: number;
  /** The scene-space centre of the bridge. */
  center?: THREE.Vector3;
  /** Uniform scene-space scale applied after coordinateScale. */
  scale?: number;
  /** Maximum alpha multiplier for the cloud. */
  opacity?: number;
  /** Pixel-density factor used by the point-size shader. */
  pointScale?: number;
  /** Optional cap for low-memory preview renders. */
  maxPoints?: number;
  /** Re-centre the sampled point cloud around its centroid. */
  recenter?: boolean;
}

export interface GaussianBridgeV05Update {
  /** Current Remotion frame; no real-time clock is read. */
  frame: number;
  /** The camera used to sort the transparent points back-to-front. */
  camera?: THREE.Camera;
  /** Deterministic reveal progress in [0, 1]. */
  bridgeProgress?: number;
  /** Optional scene-space centre override. */
  center?: THREE.Vector3;
  /** Optional uniform scene-space scale override. */
  scale?: number;
  /** Optional point-cloud alpha override. */
  opacity?: number;
  /** Optional sprite-size override. */
  pointScale?: number;
}

export const DEFAULT_GAUSSIAN_SAMPLE_PATH =
  'assets/lux3d/extracted/3dgs/gaussian-sampled.json';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Stable, frame-independent hash used only for the reveal ordering. */
function stableHash(index: number, x: number, y: number, z: number): number {
  const n = Math.sin(
    index * 12.9898 + x * 78.233 + y * 37.719 + z * 11.131,
  ) * 43758.5453123;
  return n - Math.floor(n);
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normaliseRows(payload: GaussianSamplePayload): GaussianSampleRow[] {
  if (!Array.isArray(payload.points)) return [];
  return payload.points.filter((row): row is GaussianSampleRow =>
    Array.isArray(row) && row.length >= 6 && row.slice(0, 6).every((v) => Number.isFinite(v)),
  );
}

/**
 * Load the existing sampled Lux3D payload.  The original PLY remains the
 * authoritative source; this small JSON is the deterministic render sample
 * already used by the V03/V04 project.
 */
export async function loadGaussianBridgeV05Sample(
  url = staticFile(DEFAULT_GAUSSIAN_SAMPLE_PATH),
): Promise<GaussianSamplePayload> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Gaussian sample HTTP ${response.status}`);
  const payload = (await response.json()) as GaussianSamplePayload;
  if (!Array.isArray(payload.points)) {
    throw new Error('Gaussian sample payload has no points array');
  }
  return payload;
}

/**
 * Convert sampled rows into immutable, scene-ready point records.  This does
 * not alter the source JSON and never uses random/time-dependent state.
 */
export function parseGaussianBridgeV05Points(
  payload: GaussianSamplePayload,
  options: Pick<GaussianBridgeV05Options, 'coordinateScale' | 'radiusScale' | 'maxPoints' | 'recenter'> = {},
): GaussianBridgePoint[] {
  const coordinateScale = finiteOr(options.coordinateScale, 20);
  const radiusScale = finiteOr(options.radiusScale, 110);
  const maxPoints = Math.max(1, Math.floor(finiteOr(options.maxPoints, Number.POSITIVE_INFINITY)));
  const rows = normaliseRows(payload);
  const selected = rows.length > maxPoints
    ? rows.filter((_, index) => index % Math.ceil(rows.length / maxPoints) === 0).slice(0, maxPoints)
    : rows;

  const raw = selected.map((row, index) => {
    const position = new THREE.Vector3(
      finiteOr(row[0], 0) * coordinateScale,
      finiteOr(row[1], 0) * coordinateScale,
      finiteOr(row[2], 0) * coordinateScale,
    );
    const color = new THREE.Color(
      clamp01(finiteOr(row[3], 0.7)),
      clamp01(finiteOr(row[4], 0.9)),
      clamp01(finiteOr(row[5], 0.87)),
    );
    return {
      index,
      position,
      color,
      alpha: Math.max(0.04, Math.min(1, finiteOr(row[6], 0.5))),
      radius: Math.max(0.02, Math.min(2, finiteOr(row[7], 0.002) * radiusScale)),
      reveal: 0,
    };
  });

  if (options.recenter !== false && raw.length) {
    const centroid = raw.reduce((sum, point) => sum.add(point.position), new THREE.Vector3())
      .multiplyScalar(1 / raw.length);
    raw.forEach((point) => point.position.sub(centroid));
  }

  let maxDistance = 0.001;
  raw.forEach((point) => { maxDistance = Math.max(maxDistance, point.position.length()); });
  raw.forEach((point) => {
    const radial = clamp01(point.position.length() / maxDistance);
    const jitter = stableHash(point.index, point.position.x, point.position.y, point.position.z);
    point.reveal = clamp01(radial * 0.82 + jitter * 0.18);
  });
  return raw;
}

type BridgeUniforms = {
  uBridgeProgress: {value: number};
  uOpacity: {value: number};
  uPointScale: {value: number};
  uViewport: {value: THREE.Vector2};
  uFrame: {value: number};
};

type DepthRecord = {index: number; viewZ: number};

/**
 * A real 3D Gaussian point bridge for the existing Three.js world.
 *
 * The object is a normal THREE.Group and can be attached either to the main
 * scene or to `OpticsWorld.dropGroup`.  Every update can receive a camera;
 * points are then stably sorted in camera view space before the transparent
 * sprite buffer is uploaded.  This avoids the old screen-space canvas layer:
 * the cloud now follows the same perspective, depth, parent transform, and
 * camera move as the optical world.
 */
export class GaussianBridgeV05Object extends THREE.Group {
  readonly points: readonly GaussianBridgePoint[];
  readonly cloud: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly material: THREE.ShaderMaterial;

  private readonly geometry: THREE.BufferGeometry;
  private readonly ordered: DepthRecord[];
  private readonly positionArray: Float32Array;
  private readonly colorArray: Float32Array;
  private readonly alphaArray: Float32Array;
  private readonly radiusArray: Float32Array;
  private readonly revealArray: Float32Array;
  private readonly viewport = new THREE.Vector2(1920, 1080);
  private readonly worldPoint = new THREE.Vector3();
  private readonly viewPoint = new THREE.Vector3();
  private readonly options: Required<Pick<GaussianBridgeV05Options, 'opacity' | 'pointScale'>>;

  constructor(points: GaussianBridgePoint[], options: GaussianBridgeV05Options = {}) {
    super();
    this.name = 'lux3d-gaussian-bridge-v05';
    this.points = points;
    this.options = {
      opacity: clamp01(finiteOr(options.opacity, 0.9)),
      pointScale: Math.max(0.001, finiteOr(options.pointScale, 0.14)),
    };
    if (options.center) this.position.copy(options.center);
    this.scale.setScalar(Math.max(0.0001, finiteOr(options.scale, 1)));

    this.positionArray = new Float32Array(points.length * 3);
    this.colorArray = new Float32Array(points.length * 3);
    this.alphaArray = new Float32Array(points.length);
    this.radiusArray = new Float32Array(points.length);
    this.revealArray = new Float32Array(points.length);
    this.ordered = points.map((_, index) => ({index, viewZ: 0}));
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionArray, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colorArray, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaArray, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aRadius', new THREE.BufferAttribute(this.radiusArray, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aReveal', new THREE.BufferAttribute(this.revealArray, 1).setUsage(THREE.DynamicDrawUsage));

    for (let i = 0; i < points.length; i++) this.writePoint(i, points[i]);
    this.geometry.computeBoundingSphere();

    const uniforms: BridgeUniforms = {
      uBridgeProgress: {value: 0},
      uOpacity: {value: this.options.opacity},
      uPointScale: {value: this.options.pointScale},
      uViewport: {value: this.viewport},
      uFrame: {value: 0},
    };
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        attribute vec3 aColor;
        attribute float aAlpha;
        attribute float aRadius;
        attribute float aReveal;
        uniform float uBridgeProgress;
        uniform float uOpacity;
        uniform float uPointScale;
        uniform vec2 uViewport;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float depth = max(0.05, -mvPosition.z);
          float reveal = smoothstep(aReveal - 0.12, aReveal + 0.002, uBridgeProgress);
          vColor = aColor;
          vAlpha = aAlpha * reveal * uOpacity;
          gl_PointSize = max(1.0, aRadius * uPointScale * uViewport.y / depth);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float distanceToCenter = length(gl_PointCoord - vec2(0.5));
          float edge = smoothstep(0.5, 0.08, distanceToCenter);
          float alpha = vAlpha * edge;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexColors: false,
      toneMapped: false,
    });
    this.cloud = new THREE.Points(this.geometry, this.material);
    this.cloud.name = 'lux3d-gaussian-points-v05';
    this.cloud.frustumCulled = false;
    this.add(this.cloud);
  }

  private writePoint(targetIndex: number, point: GaussianBridgePoint): void {
    const p = targetIndex * 3;
    this.positionArray[p] = point.position.x;
    this.positionArray[p + 1] = point.position.y;
    this.positionArray[p + 2] = point.position.z;
    this.colorArray[p] = point.color.r;
    this.colorArray[p + 1] = point.color.g;
    this.colorArray[p + 2] = point.color.b;
    this.alphaArray[targetIndex] = point.alpha;
    this.radiusArray[targetIndex] = point.radius;
    this.revealArray[targetIndex] = point.reveal;
  }

  private sortForCamera(camera: THREE.Camera): void {
    camera.updateMatrixWorld(true);
    this.updateMatrixWorld(true);
    for (const record of this.ordered) {
      const point = this.points[record.index];
      this.worldPoint.copy(point.position).applyMatrix4(this.matrixWorld);
      this.viewPoint.copy(this.worldPoint).applyMatrix4(camera.matrixWorldInverse);
      record.viewZ = this.viewPoint.z;
    }
    // Back-to-front order with the original index as a stable tie-breaker.
    this.ordered.sort((a, b) => a.viewZ - b.viewZ || a.index - b.index);
    for (let targetIndex = 0; targetIndex < this.ordered.length; targetIndex++) {
      this.writePoint(targetIndex, this.points[this.ordered[targetIndex].index]);
    }
    for (const name of ['position', 'aColor', 'aAlpha', 'aRadius', 'aReveal']) {
      const attribute = this.geometry.getAttribute(name);
      attribute.needsUpdate = true;
    }
  }

  setBridgeProgress(progress: number): this {
    this.material.uniforms.uBridgeProgress.value = clamp01(progress);
    return this;
  }

  setCenter(center: THREE.Vector3): this {
    this.position.copy(center);
    return this;
  }

  setScale(scale: number): this {
    this.scale.setScalar(Math.max(0.0001, scale));
    return this;
  }

  setOpacity(opacity: number): this {
    this.material.uniforms.uOpacity.value = clamp01(opacity);
    return this;
  }

  setPointScale(pointScale: number): this {
    this.material.uniforms.uPointScale.value = Math.max(0.001, pointScale);
    return this;
  }

  /** Update all frame-driven uniforms and optionally perform camera sorting. */
  update(update: GaussianBridgeV05Update): this {
    this.material.uniforms.uFrame.value = Number.isFinite(update.frame) ? update.frame : 0;
    if (update.bridgeProgress !== undefined) this.setBridgeProgress(update.bridgeProgress);
    if (update.center) this.setCenter(update.center);
    if (update.scale !== undefined) this.setScale(update.scale);
    if (update.opacity !== undefined) this.setOpacity(update.opacity);
    if (update.pointScale !== undefined) this.setPointScale(update.pointScale);
    if (update.camera) this.sortForCamera(update.camera);
    else this.updateMatrixWorld(true);
    return this;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.remove(this.cloud);
  }
}

export function createGaussianBridgeV05(
  payload: GaussianSamplePayload,
  options: GaussianBridgeV05Options = {},
): GaussianBridgeV05Object {
  return new GaussianBridgeV05Object(parseGaussianBridgeV05Points(payload, options), options);
}

export async function createGaussianBridgeV05FromUrl(
  url = staticFile(DEFAULT_GAUSSIAN_SAMPLE_PATH),
  options: GaussianBridgeV05Options = {},
): Promise<GaussianBridgeV05Object> {
  const payload = await loadGaussianBridgeV05Sample(url);
  return createGaussianBridgeV05(payload, options);
}

