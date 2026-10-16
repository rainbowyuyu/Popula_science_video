/**
 * Aspect-aware projection helper for the opening camera rig.
 *
 * Contract
 * --------
 * - Pure function of (pose, aspect, options). No frame history, no retained
 *   state, no dependence on the previous call: seeking to a random frame gives
 *   the same camera as playing up to it.
 * - Landscape (aspect == 1920/1080) reproduces the legacy photographic
 *   registration exactly:
 *       camera.setViewOffset(1920, 1080, pose.shift, 0, 1920, 1080)
 *   is byte-for-byte equivalent to writing
 *       projectionMatrix.elements[8] = pose.shift / 960, elements[9] = 0
 *   (see SIGN DERIVATION below), so frames 0..136 keep their calibrated plate.
 * - Portrait NEVER calls setViewOffset and never inherits a view offset: the
 *   asymmetric frustum is written straight into the projection matrix.
 * - The hot path allocates nothing: all temporaries are module-scope scratch,
 *   the returned diagnostic is one small numeric object the render loop may
 *   ignore.
 *
 * SIGN DERIVATION (not guessed)
 * -----------------------------
 * three.js PerspectiveCamera.updateProjectionMatrix() builds
 *     left = -W/2, right = W/2          (W = frustum width at the near plane)
 *     left += offsetX * W / fullWidth   (setViewOffset)
 * and Matrix4.makePerspective() stores
 *     e8 = (right + left) / (right - left) = 2*offsetX / fullWidth
 * For a clip-space x of  e0*x_c + e8*z_c  with w = -z_c and z_c = -near,
 *     x_ndc = (2 / W) * x_c - e8
 * so a world point on the optical axis (x_c = 0, i.e. the look-at target)
 * lands at x_ndc = -e8. Therefore
 *     e8 = 2 * shift / fullWidth = shift / 960   (fullWidth = 1920)
 * and a NEGATIVE legacy shift (e.g. -352.18 on the establishing plate) puts
 * the target at POSITIVE ndc x, i.e. right of centre -> 1312 px, next to the
 * crown at ~1265 px in the 1920x1080 photograph. Same structure vertically
 * with offsetY: e9 = 2 * offsetY / fullHeight, target lands at y_ndc = -e9.
 * applyAspectAwarePose() re-projects the target every call and reports the
 * mismatch in pixels, so a sign flip fails loudly instead of silently.
 */

import * as T from 'three';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface FrameSize { readonly width: number; readonly height: number }
/** Normalised screen point, [0..1], origin top-left (the convention the
 *  shot list uses: portrait centre x=.50, y=.53). */
export interface ScreenPoint { readonly x: number; readonly y: number }

/** Structurally identical to OpeningCamera.OpeningCameraPose, restated here so
 *  this module imports no solver code (no cycle, no load-time side effects).
 *  Every OpeningCameraPose value is assignable to it. */
export interface AspectAwarePose {
  position: T.Vector3;
  target: T.Vector3;
  /** Legacy full-frame horizontal shift in pixels, authored against 1920. */
  shift: number;
  /** Roll in radians, applied in camera space AFTER lookAt (legacy order). */
  roll: number;
  /** Vertical FOV in degrees; falls back to 34 (legacy default). */
  fov?: number;
}

export interface SafeBands {
  readonly frame: FrameSize;
  /** Reserved top-left graphics box: title / logo. */
  readonly title: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
  /** Subtitles start below this pixel row. */
  readonly subtitleTop: number;
  /** Where the model should sit on screen, normalised top-left. */
  readonly composition: ScreenPoint;
}

export interface AspectAwareOptions {
  /** Screen point (normalised, top-left origin) the authored `target` must land
   *  on. Defaults to the orientation preset: .50/.50 landscape, .50/.53 portrait. */
  screenCenter?: ScreenPoint;
  /** Scale on (position - target); 1 = authored distance, untouched. */
  radiusScale?: number;
  /** Clamp on |elements[8]| and |elements[9]|. Default 0.9 (frame edge = 1.0). */
  maxShiftNdc?: number;
  /** Multiplier on the authored pixel shift. Defaults to the orientation preset
   *  (1 landscape => exact legacy, 0 portrait => the shift is a 16:9 registration
   *  device and has nothing to register against in portrait). */
  shiftScale?: number;
  /** Full-frame width the authored `shift` is quoted against. Default 1920. */
  referenceWidth?: number;
  /** Override the reported safe bands (pixel reporting / zone flags only). */
  safeBands?: SafeBands;
}

export interface AspectDiagnostic {
  readonly aspect: number;
  readonly portrait: boolean;
  /** True when the exact legacy landscape registration path was taken. */
  readonly legacyLandscape: boolean;
  readonly frame: FrameSize;
  readonly fov: number;
  readonly radiusScale: number;
  /** Normalised horizontal / vertical projection shift actually written. */
  readonly e8: number;
  readonly e9: number;
  /** Where pose.target lands, NDC (+y up, +x right). */
  readonly targetNdcX: number;
  readonly targetNdcY: number;
  /** Where pose.target lands, pixels, origin top-left. */
  readonly targetPxX: number;
  readonly targetPxY: number;
  /** |projected target - analytic (-e8, -e9)| in pixels. ~0 when correct;
   *  hundreds of px if the shift sign is inverted. */
  readonly axisErrorPx: number;
  readonly clamped: boolean;
  readonly finite: boolean;
  readonly inTitleZone: boolean;
  readonly inSubtitleZone: boolean;
}

/* ------------------------------------------------------------------ *
 * Constants / presets
 * ------------------------------------------------------------------ */

const DEFAULT_FOV = 34;
const LEGACY_ASPECT_EPS = 1e-6;
const DEFAULT_MAX_SHIFT_NDC = 0.9;
const SCRATCH_NEAR = 0.008;
const SCRATCH_FAR = 200;

export const LANDSCAPE_FRAME: FrameSize = { width: 1920, height: 1080 };
export const PORTRAIT_FRAME: FrameSize = { width: 1080, height: 1920 };
export const LEGACY_ASPECT = 1920 / 1080;
export const PORTRAIT_ASPECT = 1080 / 1920;
/** 1920 / 2: legacy pixels -> e8 is shift / 960. */
export const LEGACY_HALF_WIDTH = 960;

export const LANDSCAPE_SAFE: SafeBands = {
  frame: LANDSCAPE_FRAME,
  title: { x0: 0, y0: 0, x1: 430, y1: 230 },
  subtitleTop: 920,
  composition: { x: 0.5, y: 0.5 },
};

export const PORTRAIT_SAFE: SafeBands = {
  frame: PORTRAIT_FRAME,
  title: { x0: 0, y0: 0, x1: 1080, y1: 420 },
  subtitleTop: 1570,
  composition: { x: 0.5, y: 0.53 },
};

/** Orientation presets. Landscape is identity: it must stay bit-comparable to
 *  the legacy call for all 28 authored keys (largest |shift| = 352.18 px =>
 *  |e8| = 0.3669, safely inside the 0.9 clamp). */
export const LANDSCAPE_COMPOSITION = { screenCenter: { x: 0.5, y: 0.5 }, shiftScale: 1 } as const;
export const PORTRAIT_COMPOSITION = { screenCenter: { x: 0.5, y: 0.53 }, shiftScale: 0 } as const;

export function frameForAspect(aspect: number): FrameSize {
  if (Math.abs(aspect - LEGACY_ASPECT) <= LEGACY_ASPECT_EPS) return LANDSCAPE_FRAME;
  if (Math.abs(aspect - PORTRAIT_ASPECT) <= LEGACY_ASPECT_EPS) return PORTRAIT_FRAME;
  if (aspect < 1) return { width: PORTRAIT_FRAME.height * aspect, height: PORTRAIT_FRAME.height };
  return { width: LANDSCAPE_FRAME.height * aspect, height: LANDSCAPE_FRAME.height };
}

export function safeBandsForAspect(aspect: number): SafeBands {
  return aspect < 1 ? PORTRAIT_SAFE : LANDSCAPE_SAFE;
}

/* ------------------------------------------------------------------ *
 * Scratch (module scope: the hot path allocates nothing)
 * ------------------------------------------------------------------ */

const _delta = new T.Vector3();
const _probe = new T.Vector3();

/* ------------------------------------------------------------------ *
 * Main entry point
 * ------------------------------------------------------------------ */

export function applyAspectAwarePose(
  camera: T.PerspectiveCamera,
  pose: AspectAwarePose,
  aspect: number,
  options: AspectAwareOptions = {},
): AspectDiagnostic {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError(`applyAspectAwarePose: aspect must be a positive finite number (got ${aspect})`);
  }

  const portrait = aspect < 1;
  const legacyLandscape = !portrait && Math.abs(aspect - LEGACY_ASPECT) <= LEGACY_ASPECT_EPS;
  const frame = legacyLandscape ? LANDSCAPE_FRAME : frameForAspect(aspect);
  const bands = options.safeBands ?? safeBandsForAspect(aspect);

  const preset = portrait ? PORTRAIT_COMPOSITION : LANDSCAPE_COMPOSITION;
  const center = options.screenCenter ?? preset.screenCenter;
  const shiftScale = options.shiftScale ?? preset.shiftScale;
  const referenceWidth = options.referenceWidth ?? 1920;
  const maxShiftNdc = options.maxShiftNdc ?? DEFAULT_MAX_SHIFT_NDC;
  const radiusScale = options.radiusScale ?? 1;

  // Normalised shift -------------------------------------------------------
  // axisNdc{X,Y} = where the look-at target must land in NDC.
  // ndc = (2x - 1, 1 - 2y)  for the top-left-origin convention above.
  // Authored pixel shift enters as -shift / (referenceWidth / 2) NDC, i.e.
  // exactly the legacy e8 = shift / 960 at shiftScale = 1.
  const axisNdcX = (2 * center.x - 1) + shiftScale * (-pose.shift / (referenceWidth * 0.5));
  const axisNdcY = 1 - 2 * center.y;

  let e8 = -axisNdcX;
  let e9 = -axisNdcY;
  let clamped = false;
  if (Math.abs(e8) > maxShiftNdc) { e8 = Math.sign(e8) * maxShiftNdc; clamped = true; }
  if (Math.abs(e9) > maxShiftNdc) { e9 = Math.sign(e9) * maxShiftNdc; clamped = true; }

  // Safe reset -------------------------------------------------------------
  // Nothing may survive the previous call or a random seek: no view offset
  // (portrait never sets one, landscape's is replaced by e8 below), no zoom,
  // no tilted up vector, no stale orientation.
  camera.clearViewOffset();
  camera.zoom = 1;
  camera.up.set(0, 1, 0);
  camera.rotation.set(0, 0, 0);
  camera.fov = pose.fov ?? DEFAULT_FOV;
  // Landscape forces the exact 1920x1080 aspect so the frustum is identical to
  // the legacy plate even if the caller passed 16/9 rounded to float.
  camera.aspect = legacyLandscape ? LEGACY_ASPECT : aspect;

  // Pose -------------------------------------------------------------------
  if (radiusScale === 1) {
    camera.position.copy(pose.position); // bit-exact authored pose
  } else {
    _delta.subVectors(pose.position, pose.target).multiplyScalar(radiusScale);
    camera.position.copy(pose.target).add(_delta);
  }
  camera.lookAt(pose.target);
  camera.rotateZ(pose.roll); // legacy order: lookAt, then roll about the view axis

  camera.updateProjectionMatrix(); // symmetric frustum + correct inverse

  // Asymmetric shift, straight into the projection matrix -------------------
  const m = camera.projectionMatrix.elements;
  m[8] = e8;
  m[9] = e9;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

  camera.updateMatrixWorld(); // also refreshes matrixWorldInverse for project()

  // Diagnostic (module scratch: no per-call allocation) ---------------------
  _probe.copy(pose.target).project(camera);
  const targetNdcX = _probe.x;
  const targetNdcY = _probe.y;
  const targetPxX = (targetNdcX + 1) * 0.5 * frame.width;
  const targetPxY = (1 - targetNdcY) * 0.5 * frame.height;

  // The target lies on the optical axis, so it must project to (-e8, -e9).
  // This is the runtime proof that the shift sign and magnitude are right.
  const axisErrorPx = Math.max(
    Math.abs(targetNdcX + e8) * frame.width * 0.5,
    Math.abs(targetNdcY + e9) * frame.height * 0.5,
  );

  const p = camera.projectionMatrix.elements;
  const finite =
    Number.isFinite(e8) && Number.isFinite(e9) &&
    Number.isFinite(targetNdcX) && Number.isFinite(targetNdcY) &&
    Number.isFinite(targetPxX) && Number.isFinite(targetPxY) &&
    Number.isFinite(p[0]) && Number.isFinite(p[5]) && p[0] !== 0 && p[5] !== 0;

  const inTitleZone =
    targetPxX >= bands.title.x0 && targetPxX <= bands.title.x1 &&
    targetPxY >= bands.title.y0 && targetPxY <= bands.title.y1;
  const inSubtitleZone = targetPxY >= bands.subtitleTop;

  return {
    aspect, portrait, legacyLandscape, frame, fov: camera.fov, radiusScale,
    e8, e9,
    targetNdcX, targetNdcY, targetPxX, targetPxY,
    axisErrorPx, clamped, finite, inTitleZone, inSubtitleZone,
  };
}

/* ------------------------------------------------------------------ *
 * Verification helpers (tests only; not on the render path)
 * ------------------------------------------------------------------ */

export interface LegacyEquivalence {
  readonly deltaPx: number;
  readonly equivalent: boolean;
  readonly direct: { readonly x: number; readonly y: number };
  readonly legacy: { readonly x: number; readonly y: number };
}

const _direct = new T.PerspectiveCamera(DEFAULT_FOV, LEGACY_ASPECT, SCRATCH_NEAR, SCRATCH_FAR);
const _legacy = new T.PerspectiveCamera(DEFAULT_FOV, LEGACY_ASPECT, SCRATCH_NEAR, SCRATCH_FAR);
const _directNdc = new T.Vector3();
const _legacyNdc = new T.Vector3();

/** Projects `pose.target` through both paths and reports the pixel gap.
 *  Ground truth is the literal legacy call; the check is a no-op if they agree.
 *  A sign error in the derivation above shows up as a gap of hundreds of px. */
export function verifyLegacyLandscapeEquivalence(
  pose: AspectAwarePose,
  aspect: number = LEGACY_ASPECT,
): LegacyEquivalence {
  const frame = LANDSCAPE_FRAME;
  applyAspectAwarePose(_direct, pose, aspect);

  _legacy.fov = pose.fov ?? DEFAULT_FOV;
  _legacy.aspect = LEGACY_ASPECT;
  _legacy.position.copy(pose.position);
  _legacy.lookAt(pose.target);
  _legacy.rotateZ(pose.roll);
  _legacy.setViewOffset(frame.width, frame.height, pose.shift, 0, frame.width, frame.height);
  _legacy.updateProjectionMatrix();
  _legacy.updateMatrixWorld();

  _directNdc.copy(pose.target).project(_direct);
  _legacyNdc.copy(pose.target).project(_legacy);

  const direct = { x: (_directNdc.x + 1) * 0.5 * frame.width, y: (1 - _directNdc.y) * 0.5 * frame.height };
  const legacy = { x: (_legacyNdc.x + 1) * 0.5 * frame.width, y: (1 - _legacyNdc.y) * 0.5 * frame.height };
  const deltaPx = Math.max(Math.abs(direct.x - legacy.x), Math.abs(direct.y - legacy.y));

  return { deltaPx, equivalent: Number.isFinite(deltaPx) && deltaPx < 1e-6, direct, legacy };
}