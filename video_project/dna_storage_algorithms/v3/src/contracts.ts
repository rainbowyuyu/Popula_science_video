/**
 * V2 的内容与镜头契约。
 *
 * 所有时间均以秒为单位，渲染器可按 timeline.fps 转换成帧。
 * 这些类型刻意保持与具体渲染引擎无关，便于 Three.js、Blender 导出
 * 和外部生成素材共用同一份镜头台账。
 */

export type Vec3 = readonly [number, number, number];

export type Projection = 'perspective' | 'orthographic';

export type ShotKind =
  | 'hook'
  | 'encode'
  | 'constraint'
  | 'fountain'
  | 'wet-lab'
  | 'decode'
  | 'model-assist'
  | 'return'
  | 'evidence';

export type TransitionKind =
  | 'camera-dolly'
  | 'orbit-match'
  | 'macro-push'
  | 'particle-bridge'
  | 'data-wipe'
  | 'hold';

export interface AnchorHandoff {
  fromAnchor: string;
  toAnchor: string;
  toShot?: string;
  type?: TransitionKind;
}

export interface CameraPose {
  projection: Projection;
  position: Vec3;
  target: Vec3;
  up?: Vec3;
  fovDeg?: number;
  orthoHeight?: number;
  lensMm?: number;
  rollDeg?: number;
  focusDistance?: number;
  apertureFStop?: number;
  /** 用于连续运镜的节奏提示，单位为秒。 */
  moveDurationSec?: number;
  easing?: 'linear' | 'smoothstep' | 'cubic-in-out' | 'sine-in-out';
}

export interface AnchorState {
  id: string;
  label?: string;
  parentId?: string;
  position: Vec3;
  rotationDeg?: Vec3;
  scale?: number | Vec3;
  opacity?: number;
  visible?: boolean;
  emphasis?: 'background' | 'support' | 'focus' | 'hero';
  /** 透明切层时保留的空间关系，避免放大后跳位。 */
  preserveWorldTransform?: boolean;
}

export type AssetKind =
  | 'three-scene'
  | 'gltf'
  | 'blender-render'
  | 'qwen-video'
  | 'water-surface'
  | 'texture'
  | 'audio'
  | 'paper-scan'
  | 'logo';

export interface AssetManifest {
  id: string;
  kind: AssetKind;
  path: string;
  description: string;
  source?: string;
  license?: string;
  checksumSha256?: string;
  dimensions?: { width: number; height: number; fps?: number };
  optional?: boolean;
  /** 不可用时允许的无缝替代方式。 */
  fallbackId?: string;
}

export interface EvidenceTag {
  id: string;
  label: string;
  kind: 'paper' | 'dataset' | 'algorithm' | 'limitation' | 'visualization';
  claim: string;
  citation?: string;
  year?: number;
  doi?: string;
  confidence: 'primary' | 'secondary' | 'teaching-example';
  onScreen?: boolean;
}

export interface NarrationCue {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  shotId: string;
  visualIntent: string;
  pronunciation?: Record<string, string>;
  evidenceIds?: string[];
}

export interface ShotSpec {
  id: string;
  kind: ShotKind;
  startSec: number;
  endSec: number;
  title: string;
  visualIntent: string;
  cameraIn: CameraPose;
  cameraOut: CameraPose;
  anchors: AnchorState[];
  assetIds: string[];
  narrationCueIds: string[];
  evidenceIds?: string[];
  transitionIn?: TransitionKind;
  transitionOut?: TransitionKind;
  handoff?: AnchorHandoff;
  /** Explicit anchor handoff used by motion QA and camera continuity. */
  fromAnchor?: string;
  toAnchor?: string;
  /** 画面中允许出现的文字范围，防止标题叠成信息板。 */
  textBudget?: { maxLines: number; maxCharsPerLine: number };
}

export interface TimelineV2 {
  version: 2;
  title: string;
  series: string;
  fps: number;
  durationSec: number;
  durationFrames: number;
  assets: AssetManifest[];
  evidence: EvidenceTag[];
  shots: ShotSpec[];
  narration: NarrationCue[];
}
