/** Native licensed WaterPro 3.1.1 (TSL / GPU FFT), not the V6 WebGL adapter.
 * Units are metres; mean sea level is Y=0. A single Three r183 installation is required.
 * The vendor build remains in the existing licensed-source archive (do not redistribute).
 */
import * as THREE from 'three/webgpu';
import {pass} from 'three/tsl';
import {WaterSystem, Sky, getPresetParams, type QualityLevel} from '../work/waterpro-v4/vendor-valid/threejs-water-pro/build/index.js';

export interface NativeWaterV7Options {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  skyTexture?: THREE.Texture;
  quality?: QualityLevel;
  seed?: number;
  /** Defaults true: errors rather than silently claiming a WebGL fallback is WebGPU. */
  requireWebGPU?: boolean;
  /** Use the world floor if it already exists. */
  ownOceanFloor?: boolean;
  /** Enable native underwater postprocessing. Default true. */
  underwater?: boolean;
  /** Enables native full-resolution SSR. Default true. */
  ssr?: boolean;
}

export interface NativeWaterFrameState {
  time: number;
  tick: number;
  backend: 'webgpu' | 'webgl';
  cameraWaterHeight: number;
  submersion: number;
  cameraSubmerged: boolean;
}

/** All stateful stochastic subsystems are disabled for random-access offline frames.
 * FFT + Gerstner displacement, depth shoreline foam, refraction, SSR, native underwater
 * fog and caustics remain enabled. Native persistent wakes/spray are deliberately not
 * advertised as deterministic: WaterPro documents that syncToTick does not reset them.
 */
export async function createNativeWaterV7(options: NativeWaterV7Options) {
  const {renderer, scene, camera} = options;
  const stepSize = 1 / 60;
  const water = await WaterSystem.create(renderer, scene, camera, options.quality ?? 'ultra', {
    deterministic: true,
    // Native 3.1.1 hashes float32 (index + seed*100000); large date-like seeds
    // erase low index bits and produce concentric spectral artefacts. Keep small.
    seed: options.seed ?? 7,
    stepSize,
  });
  if (options.requireWebGPU !== false && water.backend !== 'webgpu') {
    water.dispose();
    throw new Error('NativeWaterV7 requires an actual WebGPU adapter; WaterPro selected WebGL.');
  }

  const preset = getPresetParams('blackFlag');
  // Coastal wind-farm scale: the demo preset is kilometre-scaled and vastly oversized.
  preset.clipmap.baseSize = 128;
  preset.clipmap.levels = 7;
  preset.waves.fft.amplitude = 1.0;
  preset.waves.fft.windSpeed = 11.5;
  preset.waves.fft.windDirection = 0.76;
  preset.waves.fft.animationSpeed = 1;
  preset.waves.fft.choppiness = 1.15;
  preset.waves.fft.spectralSharpness = 1;
  preset.waves.fft.standingWaveRatio = 0.08;
  preset.waves.fft.cascades.waves = {scale: 384, amplitudeScale: 0.16};
  preset.waves.fft.cascades.ripples = {scale: 36, amplitudeScale: 0.028};
  preset.waves.gerstner = {amplitude: 0.72, wavelength: 48, wavelengthSpread: 1.7, directionalSpread: 0.4};
  preset.foam.surface.enabled = false;
  preset.foam.surface.opacity = 0.075;
  preset.foam.surface.coverage = 0.10;
  preset.foam.surface.size = 18;
  preset.foam.waves.enabled = false;
  preset.foam.shoreline.range = 1.8;
  preset.foam.shoreline.size = 6;
  preset.foam.shoreline.opacity = 0.40;
  preset.foam.shoreline.coverage = 0.55;
  preset.color.waterColor = '#164659';
  preset.color.transmissionColor = '#296b70';
  preset.color.absorptionColor = '#0a0302';
  // Poly Haven qwantani_late_afternoon_puresky: HDR solar centroid, Y-up.
  // Native direction is (cos(el)*sin(az), sin(el), cos(el)*cos(az)).
  preset.sky.sun.azimuth = 53.96484375;
  preset.sky.sun.elevation = 19.16015625;
  preset.sky.sun.intensity = 2.7;
  preset.sky.sun.diskColor = '#fff1da';
  preset.lighting.ambient.intensity = 0.40;
  preset.lighting.ambient.skyColor = '#cce3f2';
  preset.lighting.ambient.groundColor = '#1d3540';
  preset.fog.fadeStart = 1600;
  preset.fog.fadeEnd = 13000;
  preset.fog.skyBlendDistance = 12000;
  preset.sparkle.intensity = 0.21;
  preset.sparkle.power = 1536;
  preset.sparkle.fadeDistance = 1900;
  preset.oceanFloor.depth = 52;
  preset.oceanFloor.displacementStrength = 2;
  water.loadPreset(preset);
  water.rebuildGeometry({baseSize: 128, levels: 7});
  water.wake.enabled = false;
  water.foam.waves.enabled = false;
  water.sparkle.enabled = false;
  water.fresnel.refractionStrength = 0.022;
  water.fresnel.normalStrength = 0.35;
  // Explicit linear coefficients. Hex colours undergo sRGB conversion, turning
  // plausible per-metre coefficients into near-zero absorption and milky water.
  water.color.absorptionColor = new THREE.Color(0.075, 0.034, 0.018);
  water.rain.particles.enabled = false;
  water.rain.ripples.enabled = false;
  water.particles.enabled = false;
  if (water.spray) water.spray.enabled = false;
  water.floor.setVisible(options.ownOceanFloor ?? false);
  water.underwater.enabled = options.underwater !== false;
  water.underwater.tintColor = '#d9f5f1';
  water.ssr.enabled = options.ssr !== false;
  water.ssr.maxDistance = 420;
  water.ssr.stepCount = 48;
  water.sunShafts.enabled = true;
  water.sunShafts.intensity = 0.18;
  water.clipPlaneDistance = 0.16;
  water.lighting.sunLight.castShadow = true;
  water.lighting.sunLight.shadow.mapSize.set(4096, 4096);
  water.lighting.sunLight.shadow.bias = -0.00006;
  water.lighting.sunLight.shadow.normalBias = 0.14;

  let sky: Sky | undefined;
  if (options.skyTexture) {
    sky = new Sky({
      equirect: options.skyTexture,
      sunDirection: water.lighting.sun.direction,
      brightness: 0.9,
      reflectionRoughness: 0.055,
      reflectionDistanceBlur: 0.38,
      reflectionBlurDistance: 1800,
    });
    for (const mesh of sky.getMeshes()) scene.add(mesh);
    water.setSky(sky);
  }

  const post = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  post.outputNode = water.postProcessing.buildNode(scenePass, scenePass.getTextureNode('output'));
  let disposed = false;
  let state: NativeWaterFrameState = {time: 0, tick: 0, backend: water.backend, cameraWaterHeight: 0, submersion: 0, cameraSubmerged: false};
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const sampleAt = async (x: number, z: number) => water.getHeightAt(x, z);

  async function update(time: number): Promise<NativeWaterFrameState> {
    if (disposed) throw new Error('NativeWaterV7 was disposed.');
    if (!Number.isFinite(time) || time < 0) throw new Error('Expected finite absolute seconds >= 0.');
    const tick = Math.round(time / stepSize);
    camera.updateMatrixWorld(true);
    // syncToTick alone does not execute the FFT or refresh the surface uniforms.
    // One fixed step at tick-1 evaluates exactly tick. A second same-tick step drains
    // the native one-frame-latent camera-height sampler without advancing phases.
    for (let settle = 0; settle < 2; settle++) {
      water.syncToTick(tick - 1);
      await water.update(stepSize);
    }
    const h = await sampleAt(camera.position.x, camera.position.z);
    const v = clamp((h - camera.position.y + 0.18) / 0.36);
    state = {time: tick * stepSize, tick, backend: water.backend, cameraWaterHeight: h,
      submersion: v * v * (3 - 2 * v), cameraSubmerged: camera.position.y < h};
    return {...state};
  }

  return {
    water,
    sky,
    postProcessing: post,
    get backend() {return water.backend;},
    get state() {return {...state};},
    update,
    updateAtFrame: (frame: number, fps: number) => update(frame / fps),
    /** Await update(t), then call this rather than renderer.render: native underwater is a post pass. */
    render: () => post.render(),
    async renderAt(time: number) {const frame = await update(time); post.render(); return frame;},
    surfaceHeightAt: sampleAt,
    /** Current evaluated frame only. GPU readback, never a fabricated CPU surrogate. */
    async submersionAt(position: THREE.Vector3) {
      const h = await sampleAt(position.x, position.z);
      const v = clamp((h - position.y + 0.18) / 0.36);
      return v * v * (3 - 2 * v);
    },
    resize(width: number, height: number) {water.resize(width, height);},
    dispose() {
      if (disposed) return;
      disposed = true;
      post.dispose();
      water.dispose();
      if (sky) {for (const mesh of sky.getMeshes()) scene.remove(mesh); sky.dispose();}
    },
  };
}

export type NativeWaterV7 = Awaited<ReturnType<typeof createNativeWaterV7>>;
