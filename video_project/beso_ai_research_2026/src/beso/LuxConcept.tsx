import React, {useLayoutEffect, useRef, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';

export type LuxConceptProps = {
  /** Seconds, supplied by the parent timeline. Defaults to Remotion time. */
  time?: number;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  /** Deterministic entrance progress. 0 places the entire card offscreen. */
  enter?: number;
  label?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Lux3D concept only: never used for model dimensions or response evidence. */
export const LuxConcept: React.FC<LuxConceptProps> = ({
  time, width = 600, height = 600, left = 0, top = 0,
  enter = 1, label = true, className, style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const seconds = time ?? frame / fps;
  const current = useRef(seconds);
  current.current = seconds;
  const canvas = useRef<HTMLCanvasElement>(null);
  const draw = useRef<((t: number) => void) | null>(null);
  const [handle] = useState(() => delayRender('Load and frame the Lux3D concept asset'));

  useLayoutEffect(() => {
    let alive = true;
    const renderer = new THREE.WebGLRenderer({canvas: canvas.current!, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, .02, 100);
    const environmentGenerator = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = environmentGenerator.fromScene(room, .04);
    scene.environment = environment.texture;
    scene.environmentIntensity = .8;
    environmentGenerator.dispose();
    room.dispose();
    scene.add(new THREE.HemisphereLight('#ecf7ff', '#a4bfca', 2.2));
    const key = new THREE.DirectionalLight('#fff4e2', 3.6);
    key.position.set(-4, 6, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#c9efff', 2.3);
    fill.position.set(5, 3, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight('#b6fbf3', 3.1);
    rim.position.set(2, 4, -5);
    scene.add(rim);
    const pivot = new THREE.Group();
    scene.add(pivot);

    new GLTFLoader().load(staticFile('assets/lux3d.glb'), (gltf) => {
      if (!alive) return;
      const asset = gltf.scene;
      asset.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(asset);
      const center = bounds.getCenter(new THREE.Vector3());
      const dimensions = bounds.getSize(new THREE.Vector3());
      const longest = Math.max(dimensions.x, dimensions.y, dimensions.z);
      if (!Number.isFinite(longest) || longest <= 0) {
        cancelRender(new Error('Lux3D concept asset has invalid bounds'));
        return;
      }
      asset.position.sub(center);
      const normalize = new THREE.Group();
      normalize.add(asset);
      normalize.scale.setScalar(3.2 / longest);
      pivot.add(normalize);
      asset.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of mats) {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.envMapIntensity = 1.05;
            material.roughness = Math.max(.38, material.roughness);
            material.metalness = Math.min(.65, material.metalness);
          }
        }
      });
      // Fit the bounding sphere, including the blade tips, at every orbit angle.
      const radius = dimensions.length() / 2 * (3.2 / longest);
      const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
      const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
      const distance = radius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)) * 1.06;
      draw.current = (t: number) => {
        pivot.rotation.y = -.52 + t * .12;
        pivot.rotation.z = Math.sin(t * .28) * .012;
        const elevation = .19 + Math.sin(t * .14) * .022;
        camera.position.set(distance * .28, distance * elevation, distance * .94);
        camera.lookAt(0, -.03, 0);
        renderer.render(scene, camera);
      };
      draw.current(current.current);
      continueRender(handle);
    }, undefined, (error) => cancelRender(error));

    return () => {
      alive = false;
      draw.current = null;
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of mats) material.dispose();
      });
      environment.dispose();
      renderer.dispose();
    };
  }, [width, height]);

  useLayoutEffect(() => {draw.current?.(seconds);}, [seconds]);
  const arrival = smooth(enter);
  return <div className={className} style={{
    position: 'absolute', width, height, left, top,
    transform: `translate3d(${(1 - arrival) * (1920 + width)}px,${(1 - arrival) * 45}px,0) rotate(${(1 - arrival) * 8}deg)`,
    ...style,
  }}>
    <div style={{position: 'absolute', left: '16%', right: '16%', bottom: '8%', height: '5%', borderRadius: '50%', background: 'rgba(16,64,87,.19)', filter: 'blur(17px)'}} />
    <canvas ref={canvas} width={width} height={height} style={{width, height, position: 'absolute', inset: 0}} />
    {label && <div style={{position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap', padding: '9px 17px', borderRadius: 99, background: 'rgba(245,251,252,.92)', border: '1px solid rgba(69,133,145,.26)', color: '#24566c', font: '500 20px Microsoft YaHei, sans-serif', letterSpacing: 1.2}}><span style={{width: 7, height: 7, background: '#1d9a9f', borderRadius: 8}}/>Lux3D · 概念资产</div>}
  </div>;
};

export default LuxConcept;
