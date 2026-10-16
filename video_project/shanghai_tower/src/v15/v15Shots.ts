import type { CinematicShot, V15ShotManifest } from './CinematicShot';
import { validateShotSequence } from './CinematicShot';

/** V15 authoring rate. It deliberately does not depend on src/timeline.json. */
export const V15_FPS = 30;
export const V15_MAIN_DURATION_FRAMES = 6 * 60 * V15_FPS;
export const V15_VERTICAL_DURATION_FRAMES = 90 * V15_FPS;

const shot = (
  id: string,
  startFrame: number,
  endFrame: number,
  position: [number, number, number],
  target: [number, number, number],
  fov: number,
  transition: CinematicShot['transition'],
  aspect: CinematicShot['aspect'],
  extras: Omit<Partial<CinematicShot>, 'id' | 'startFrame' | 'endFrame' | 'camera' | 'transition' | 'aspect'> = {},
): CinematicShot => ({
  id,
  startFrame,
  endFrame,
  camera: { position, target, fov, ...(extras as {focus?: string; roll?: number}) },
  transition,
  aspect,
  ...extras,
});

/**
 * Main 16:9 story. Every boundary is contiguous, so a renderer can scrub the
 * registry without a hidden cut. Coordinates use the established V14 model
 * rig (metres/100, Y-up); they are camera intent and do not alter solver data.
 */
export const V15_MAIN_SHOTS: CinematicShot[] = [
  shot('v15.opening.photo-model', 0, 700, [7.8, 2.92, 11.8], [0, 3.08, 0], 42, 'photo-model', '16:9', {anchor:'tower-crown', chapter:'实景与模型重合', intent:'真实视角锁定楼冠与地面反射'}),
  // Pull the model into a readable architectural scale as the photograph
  // hands off. The earlier 11–14 unit retreat left the exploded members as
  // a tiny strip in a pale sky; these poses keep the full tower legible while
  // preserving the drone-like pullback.
  shot('v15.opening.gaussian-handoff', 700, 1200, [5.2, 3.20, 7.8], [0, 3.16, 0], 36, 'gaussian', '16:9', {anchor:'tower-facade-diagonal', chapter:'高斯点云解构', intent:'点云沿外立面斜线聚散'}),
  shot('v15.super-explode', 1200, 1786, [4.8, 3.74, 7.2], [0, 3.16, 0], 36, 'orbit', '16:9', {anchor:'structural-stack', chapter:'超级拆解', dataMode:'illustrative', intent:'幕墙、楼板、巨柱、伸臂保持层级离开'}),
  shot('v15.foundation.dive', 1786, 2936, [3.4, 1.12, 4.2], [0, -0.18, 0], 39, 'dive', '16:9', {anchor:'pile-cap', chapter:'桩基与软土', dataMode:'solver', intent:'穿过地面剖面，桩基响应按数据驱动'}),
  shot('v15.core.orbit', 2936, 3763, [2.50, 2.80, 3.50], [0, 2.42, 0], 36, 'orbit', '16:9', {anchor:'core', chapter:'核心筒', dataMode:'solver', intent:'从核心筒九格向外推至连接件'}),
  shot('v15.force-flow.orbit', 3763, 5471, [2.15, 2.48, 3.18], [0, 2.42, 0], 35, 'orbit', '16:9', {anchor:'core-megacolumn-outrigger', chapter:'结构受力', dataMode:'solver', intent:'楼板→巨柱→核心筒→基础的力流连续穿越'}),
  shot('v15.skin.glass', 5471, 6490, [7.4, 3.10, 9.2], [0, 3.20, 0], 40, 'orbit', '16:9', {anchor:'windward-facade', chapter:'双层幕墙', dataMode:'illustrative', intent:'幕墙从结构外侧回到安装位置'}),
  shot('v15.wind-water.orbit', 6490, 8301, [11.6, 3.44, 13.8], [0, 3.28, 0], 41, 'orbit', '16:9', {anchor:'windward-facade', chapter:'风场与水面', dataMode:'solver', intent:'风线绕行建筑，水面承担环境转场'}),
  shot('v15.tmd.dive', 8301, 9135, [1.52, 5.83, 1.98], [0, 5.84, 0], 32, 'dive', '16:9', {anchor:'TMD', chapter:'调谐质量阻尼器', dataMode:'solver', intent:'穿入质量块，响应节奏来自环境数据'}),
  shot('v15.assembly.foundation-to-shell', 9135, 10032, [10.8, 2.90, 13.4], [0, 3.20, 0], 43, 'blueprint-3d', '16:9', {anchor:'construction-front', chapter:'基础到幕墙组装', dataMode:'illustrative', intent:'基础→核心筒→巨柱→伸臂→楼板→幕墙回装'}),
  shot('v15.return.workflow', 10032, 10625, [9.4, 4.20, 11.9], [0, 3.25, 0], 44, 'orbit', '16:9', {anchor:'tower-crown', chapter:'整体复原', intent:'镜头随结构回到整栋楼'}),
  shot('v15.outro.workflow', 10625, 10800, [9.4, 4.46, 11.9], [0, 3.25, 0], 44, 'blueprint-3d', '16:9', {anchor:'workflow-linework', chapter:'结构搭建与计算工作流', intent:'论文、公式和工作流连续收束'}),
];

/**
 * A separate 9:16 edit. It is deliberately re-authored for the narrow safe
 * area rather than cropping the main camera. The same physical anchors remain
 * in use, while the camera stays closer and raises its targets for subtitles.
 */
export const V15_VERTICAL_SHOTS: CinematicShot[] = [
  shot('v15v.hook.photo-model', 0, 150, [5.1, 3.16, 8.2], [0, 3.22, 0], 43, 'photo-model', '9:16', {anchor:'tower-crown', chapter:'上海中心从实景进入模型'}),
  shot('v15v.hook.gaussian', 150, 250, [5.6, 3.45, 8.5], [0, 3.25, 0], 41, 'gaussian', '9:16', {anchor:'tower-facade-diagonal', chapter:'高斯式解构', dataMode:'illustrative'}),
  shot('v15v.super-explode', 250, 446, [5.9, 3.70, 8.8], [0, 3.30, 0], 41, 'orbit', '9:16', {anchor:'structural-stack', chapter:'超级拆解', dataMode:'illustrative'}),
  shot('v15v.foundation', 446, 734, [2.45, .98, 3.02], [0, -.12, 0], 37, 'dive', '9:16', {anchor:'pile-cap', chapter:'地下桩基', dataMode:'solver'}),
  shot('v15v.core', 734, 941, [1.92, 2.58, 2.95], [0, 2.42, 0], 34, 'orbit', '9:16', {anchor:'core', chapter:'核心筒', dataMode:'solver'}),
  shot('v15v.force-flow', 941, 1368, [1.72, 2.42, 2.64], [0, 2.42, 0], 34, 'orbit', '9:16', {anchor:'core-megacolumn-outrigger', chapter:'力从哪里走', dataMode:'solver'}),
  shot('v15v.skin', 1368, 1622, [4.8, 3.28, 7.2], [0, 3.28, 0], 40, 'orbit', '9:16', {anchor:'windward-facade', chapter:'幕墙', dataMode:'illustrative'}),
  shot('v15v.wind-water', 1622, 2075, [7.8, 3.58, 9.9], [0, 3.30, 0], 42, 'orbit', '9:16', {anchor:'windward-facade', chapter:'风与水面', dataMode:'solver'}),
  shot('v15v.tmd', 2075, 2284, [1.18, 5.82, 1.62], [0, 5.84, 0], 31, 'dive', '9:16', {anchor:'TMD', chapter:'阻尼器', dataMode:'solver'}),
  shot('v15v.assembly', 2284, 2508, [6.3, 3.02, 9.1], [0, 3.24, 0], 42, 'blueprint-3d', '9:16', {anchor:'construction-front', chapter:'一层一层回装', dataMode:'illustrative'}),
  shot('v15v.return', 2508, 2656, [5.9, 3.70, 8.6], [0, 3.30, 0], 42, 'orbit', '9:16', {anchor:'tower-crown', chapter:'整体复原'}),
  shot('v15v.workflow', 2656, 2700, [5.9, 4.02, 8.2], [0, 3.34, 0], 43, 'blueprint-3d', '9:16', {anchor:'workflow-linework', chapter:'结构搭建与计算工作流'}),
];

validateShotSequence(V15_MAIN_SHOTS, '16:9');
validateShotSequence(V15_VERTICAL_SHOTS, '9:16');

export const V15_MAIN_MANIFEST: V15ShotManifest = {
  version: 'v15', fps: V15_FPS, durationFrames: V15_MAIN_DURATION_FRAMES,
  durationSeconds: V15_MAIN_DURATION_FRAMES / V15_FPS, mainAspect: '16:9', verticalAspect: '9:16', shots: V15_MAIN_SHOTS,
};

export const V15_VERTICAL_MANIFEST: V15ShotManifest = {
  version: 'v15', fps: V15_FPS, durationFrames: V15_VERTICAL_DURATION_FRAMES,
  durationSeconds: V15_VERTICAL_DURATION_FRAMES / V15_FPS, mainAspect: '16:9', verticalAspect: '9:16', shots: V15_VERTICAL_SHOTS,
};

export const V15_SHOTS = {
  main: V15_MAIN_SHOTS,
  vertical: V15_VERTICAL_SHOTS,
  mainManifest: V15_MAIN_MANIFEST,
  verticalManifest: V15_VERTICAL_MANIFEST,
} as const;
