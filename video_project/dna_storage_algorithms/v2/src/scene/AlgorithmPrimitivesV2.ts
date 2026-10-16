import * as THREE from 'three';

/** Small, deterministic primitives used by the algorithm scenes.
 * Text is rendered into a texture so labels remain legible while the camera
 * moves through the 3D world. No wall-clock state or random values are used.
 */

export type CardSpec = {
  width: number;
  height: number;
  depth?: number;
  color?: number;
  label?: string | string[];
  labelColor?: string;
  labelBackground?: string;
  labelSize?: number;
};

const fontFamily = '"Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

export function labelTexture(value: string | string[], size = 56, color = '#edf8f4', background = 'rgba(5,25,34,0.88)') {
  const lines = Array.isArray(value) ? value : value.split('\n');
  const canvas = document.createElement('canvas');
  const probe = canvas.getContext('2d');
  if (!probe) throw new Error('Canvas 2D context is unavailable for algorithm labels');
  probe.font = `700 ${size}px ${fontFamily}`;
  const widths = lines.map((line) => probe.measureText(line).width);
  const padX = size * 0.48;
  const padY = size * 0.32;
  const lineHeight = size * 1.22;
  canvas.width = Math.max(8, Math.ceil(Math.max(...widths, size) + padX * 2));
  canvas.height = Math.max(8, Math.ceil(lines.length * lineHeight + padY * 2));
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const radius = Math.min(size * 0.24, canvas.height * 0.18);
  ctx.beginPath();
  ctx.moveTo(radius, 0); ctx.lineTo(canvas.width - radius, 0); ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
  ctx.lineTo(canvas.width, canvas.height - radius); ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
  ctx.lineTo(radius, canvas.height); ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
  ctx.lineTo(0, radius); ctx.quadraticCurveTo(0, 0, radius, 0); ctx.closePath();
  ctx.fillStyle = background; ctx.fill();
  ctx.font = `700 ${size}px ${fontFamily}`;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = color;
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, padY + lineHeight * (i + 0.5)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return {texture, aspect: canvas.width / canvas.height};
}

export function labelPlane(value: string | string[], width: number, height: number, size = 56, color = '#edf8f4', background = 'rgba(5,25,34,0.88)') {
  const {texture} = labelTexture(value, size, color, background);
  // Labels are editorial overlays attached to the object. Keep them readable
  // through the translucent lab rings and glass layers while the camera moves.
  const material = new THREE.MeshBasicMaterial({map: texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false});
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

export function card({width, height, depth = 0.12, color = 0x173b47, label, labelColor = '#edf8f4', labelBackground = 'rgba(7,27,37,0.9)', labelSize = 50}: CardSpec) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({color, roughness: 0.3, metalness: 0.16, transparent: true, opacity: 0.96});
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMaterial);
  group.add(body);
  if (label) {
    const plane = labelPlane(label, width * 0.93, height * 0.78, labelSize, labelColor, labelBackground);
    plane.position.z = depth * 0.52;
    group.add(plane);
  }
  return {group, body};
}

export function setOpacity(root: THREE.Object3D, opacity: number) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.material) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      material.transparent = true;
      material.opacity = opacity;
      material.depthWrite = opacity > 0.72;
    }
  });
}

export function setEmissive(material: THREE.Material, color: number, intensity = 1) {
  const standard = material as THREE.MeshStandardMaterial;
  if ('emissive' in standard) {
    standard.emissive = new THREE.Color(color);
    standard.emissiveIntensity = intensity;
  }
}

export function arrow(from: THREE.Vector3, to: THREE.Vector3, color = 0xe5b35f, opacity = 0.85) {
  const direction = to.clone().sub(from);
  const length = direction.length();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, Math.max(0.01, length - 0.18), 8), new THREE.MeshBasicMaterial({color, transparent: true, opacity}));
  shaft.position.copy(from).add(to).multiplyScalar(0.5);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 8), new THREE.MeshBasicMaterial({color, transparent: true, opacity}));
  head.position.copy(to); head.quaternion.copy(shaft.quaternion);
  const group = new THREE.Group(); group.add(shaft, head);
  return group;
}

export function setLineOpacity(object: THREE.Object3D, opacity: number) {
  object.traverse((child) => {
    const line = child as THREE.Line;
    if (line.material) {
      const material = Array.isArray(line.material) ? line.material : [line.material];
      material.forEach((item) => { item.transparent = true; item.opacity = opacity; });
    }
  });
}
