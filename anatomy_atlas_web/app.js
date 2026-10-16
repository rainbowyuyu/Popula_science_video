import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js';

const viewport = document.querySelector('#viewport');
const canvas = document.createElement('canvas');
canvas.id = 'anatomy-canvas';
viewport.prepend(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x071824, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x071824, 0.035);
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
camera.position.set(4.8, 3.55, 10.8);
camera.lookAt(0, 3.55, 0);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 3.55, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 4.3;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * .59;
controls.minPolarAngle = Math.PI * .34;
controls.enablePan = true;

scene.add(new THREE.HemisphereLight(0x9bc5e8, 0x061019, 1.6));
const key = new THREE.DirectionalLight(0xc6f0e4, 4.3); key.position.set(-3, 8, 7); scene.add(key);
const rim = new THREE.DirectionalLight(0x829bff, 3.5); rim.position.set(5, 4, -6); scene.add(rim);
const pink = new THREE.PointLight(0xe68fb9, 1.7, 8); pink.position.set(-2.7, 3.5, 2); scene.add(pink);

const mats = {
  skin: new THREE.MeshStandardMaterial({ color: 0x6f8d9a, roughness: .67, metalness: .05, transparent: true, opacity: .17, side: THREE.DoubleSide }),
  skinFemale: new THREE.MeshStandardMaterial({ color: 0xa5859e, roughness: .65, metalness: .03, transparent: true, opacity: .17, side: THREE.DoubleSide }),
  muscle: new THREE.MeshStandardMaterial({ color: 0xe78eb9, emissive: 0x39182d, emissiveIntensity: .45, roughness: .48, metalness: .08, transparent: true, opacity: .93 }),
  muscleHi: new THREE.MeshStandardMaterial({ color: 0xf4bad7, emissive: 0x642342, emissiveIntensity: .32, roughness: .4, metalness: .08, transparent: true, opacity: .96 }),
  bone: new THREE.MeshStandardMaterial({ color: 0xd2dbcf, emissive: 0x20342f, emissiveIntensity: .2, roughness: .72, metalness: .02, transparent: true, opacity: .82 }),
  organ: new THREE.MeshStandardMaterial({ color: 0xed786d, emissive: 0x3a151a, emissiveIntensity: .28, roughness: .42, transparent: true, opacity: .9 }),
  organAlt: new THREE.MeshStandardMaterial({ color: 0xf1bb72, emissive: 0x442815, emissiveIntensity: .2, roughness: .46, transparent: true, opacity: .9 }),
  vessel: new THREE.MeshStandardMaterial({ color: 0xe56d82, emissive: 0x4a1525, emissiveIntensity: .55, roughness: .42, transparent: true, opacity: .9 }),
  nerve: new THREE.LineBasicMaterial({ color: 0xb7a5ff, transparent: true, opacity: .8 }),
  selected: new THREE.MeshStandardMaterial({ color: 0xc9f16a, emissive: 0x7c9d23, emissiveIntensity: .7, roughness: .32, transparent: true, opacity: .98 }),
};

const layers = { skeleton: new THREE.Group(), muscles: new THREE.Group(), organs: new THREE.Group(), vessels: new THREE.Group(), nerves: new THREE.Group(), skin: new THREE.Group() };
Object.values(layers).forEach(g => scene.add(g));
const body = new THREE.Group(); body.name = '人体模型'; Object.values(layers).forEach(g => body.add(g));
let currentGender = 'male';
let selectedObject = null;

function capsule(parent, name, pos, scale, material, rot = [0, 0, 0], layer = 'muscles') {
  const geometry = new THREE.CapsuleGeometry(.13, 1, 8, 16);
  const mesh = new THREE.Mesh(geometry, material.clone());
  mesh.name = name; mesh.position.set(...pos); mesh.scale.set(...scale); mesh.rotation.set(...rot); mesh.userData = { layer, baseMaterial: material };
  parent.add(mesh); return mesh;
}
function ellipsoid(parent, name, pos, scale, material, layer) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material.clone());
  mesh.name = name; mesh.position.set(...pos); mesh.scale.set(...scale); mesh.userData = { layer, baseMaterial: material };
  parent.add(mesh); return mesh;
}
function boneBetween(parent, name, a, b, radius = .075) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b); const dir = vb.clone().sub(va); const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.08, len, 10), mats.bone.clone());
  mesh.name = name; mesh.position.copy(va.clone().add(vb).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); mesh.userData = { layer: 'skeleton', baseMaterial: mats.bone }; parent.add(mesh); return mesh;
}
function tube(parent, name, points, material, layer = 'vessels') {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .035, 8, false), material.clone());
  mesh.name = name; mesh.userData = { layer, baseMaterial: material }; parent.add(mesh); return mesh;
}

// Soft silhouette keeps anatomical context while allowing internal layers to remain readable.
ellipsoid(layers.skin, '头部轮廓', [0, 6.76, 0], [.4, .49, .36], mats.skin, 'skin');
capsule(layers.skin, '躯干轮廓', [0, 4.13, 0], [1.05, 1.65, .48], mats.skin, [0, 0, 0], 'skin');
capsule(layers.skin, '左臂轮廓', [-1.23, 4.28, 0], [.34, 1.22, .34], mats.skin, [0, 0, -.11], 'skin');
capsule(layers.skin, '右臂轮廓', [1.23, 4.28, 0], [.34, 1.22, .34], mats.skin, [0, 0, .11], 'skin');
capsule(layers.skin, '左腿轮廓', [-.47, 1.65, 0], [.43, 1.84, .41], mats.skin, [0, 0, -.02], 'skin');
capsule(layers.skin, '右腿轮廓', [.47, 1.65, 0], [.43, 1.84, .41], mats.skin, [0, 0, .02], 'skin');

// Skeleton
boneBetween(layers.skeleton, '脊柱', [0, 6.35, 0], [0, 2.85, 0], .09);
boneBetween(layers.skeleton, '左锁骨', [0, 5.58, 0], [-1.25, 5.4, 0], .065); boneBetween(layers.skeleton, '右锁骨', [0, 5.58, 0], [1.25, 5.4, 0], .065);
boneBetween(layers.skeleton, '左肱骨', [-1.18, 5.3, 0], [-1.33, 4.05, 0], .12); boneBetween(layers.skeleton, '右肱骨', [1.18, 5.3, 0], [1.33, 4.05, 0], .12);
boneBetween(layers.skeleton, '左前臂骨', [-1.33, 3.9, 0], [-1.2, 2.9, 0], .07); boneBetween(layers.skeleton, '右前臂骨', [1.33, 3.9, 0], [1.2, 2.9, 0], .07);
boneBetween(layers.skeleton, '左股骨', [-.43, 3.05, 0], [-.5, 1.55, 0], .13); boneBetween(layers.skeleton, '右股骨', [.43, 3.05, 0], [.5, 1.55, 0], .13);
boneBetween(layers.skeleton, '左胫骨', [-.5, 1.35, 0], [-.48, .18, 0], .09); boneBetween(layers.skeleton, '右胫骨', [.5, 1.35, 0], [.48, .18, 0], .09);
ellipsoid(layers.skeleton, '头骨', [0, 6.76, .01], [.38, .46, .27], mats.bone, 'skeleton');
for (let i = 0; i < 7; i++) { const y = 5.25 - i * .28; const width = 1.04 - i * .035; boneBetween(layers.skeleton, `肋骨-${i + 1}`, [-width, y, .02], [width, y, .02], .034); }

// Layered muscle groups: front-facing surfaces are intentionally asymmetric for a scan-like read.
const pectoralL = ellipsoid(layers.muscles, '胸大肌·左', [-.43, 5.07, .37], [.61, .38, .13], mats.muscleHi, 'muscles');
const pectoralR = ellipsoid(layers.muscles, '胸大肌·右', [.43, 5.07, .37], [.61, .38, .13], mats.muscleHi, 'muscles');
const femaleBustL = ellipsoid(layers.muscles, '女性乳房·左', [-.39, 5.02, .47], [.35, .27, .2], mats.organAlt, 'muscles');
const femaleBustR = ellipsoid(layers.muscles, '女性乳房·右', [.39, 5.02, .47], [.35, .27, .2], mats.organAlt, 'muscles');
ellipsoid(layers.muscles, '腹直肌·左', [-.27, 4.26, .39], [.24, .71, .12], mats.muscle, 'muscles'); ellipsoid(layers.muscles, '腹直肌·右', [.27, 4.26, .39], [.24, .71, .12], mats.muscle, 'muscles');
capsule(layers.muscles, '三角肌·左', [-1.1, 5.25, .18], [.32, .4, .27], mats.muscle, [0, 0, -.25], 'muscles'); capsule(layers.muscles, '三角肌·右', [1.1, 5.25, .18], [.32, .4, .27], mats.muscle, [0, 0, .25], 'muscles');
capsule(layers.muscles, '股四头肌·左', [-.43, 2.38, .31], [.35, .84, .24], mats.muscle, [0, 0, -.03], 'muscles'); capsule(layers.muscles, '股四头肌·右', [.43, 2.38, .31], [.35, .84, .24], mats.muscle, [0, 0, .03], 'muscles');
capsule(layers.muscles, '肱二头肌·左', [-1.25, 4.48, .3], [.18, .62, .2], mats.muscle, [0, 0, -.11], 'muscles'); capsule(layers.muscles, '肱二头肌·右', [1.25, 4.48, .3], [.18, .62, .2], mats.muscle, [0, 0, .11], 'muscles');

// Organs and circulation
ellipsoid(layers.organs, '心脏', [0, 4.8, .05], [.28, .42, .24], mats.organ, 'organs'); ellipsoid(layers.organs, '左肺', [-.38, 5.05, 0], [.34, .67, .27], mats.organAlt, 'organs'); ellipsoid(layers.organs, '右肺', [.38, 5.05, 0], [.34, .67, .27], mats.organAlt, 'organs');
ellipsoid(layers.organs, '肝脏', [.32, 4.08, .03], [.72, .35, .3], mats.organAlt, 'organs'); ellipsoid(layers.organs, '胃', [-.36, 3.95, .18], [.3, .45, .25], mats.organ, 'organs');
ellipsoid(layers.organs, '胰腺', [.16, 3.55, .28], [.47, .12, .11], mats.organAlt, 'organs'); ellipsoid(layers.organs, '肾脏·左', [-.47, 3.55, 0], [.19, .32, .18], mats.organ, 'organs'); ellipsoid(layers.organs, '肾脏·右', [.47, 3.55, 0], [.19, .32, .18], mats.organ, 'organs');
const uterus = ellipsoid(layers.organs, '子宫·女性参考', [0, 2.55, .08], [.28, .34, .18], mats.organ, 'organs');
const ovaryL = ellipsoid(layers.organs, '左卵巢·女性参考', [-.34, 2.58, .12], [.1, .1, .1], mats.organAlt, 'organs');
const ovaryR = ellipsoid(layers.organs, '右卵巢·女性参考', [.34, 2.58, .12], [.1, .1, .1], mats.organAlt, 'organs');
const prostate = ellipsoid(layers.organs, '前列腺·男性参考', [0, 2.62, .12], [.14, .11, .12], mats.organ, 'organs');
[femaleBustL, femaleBustR, uterus, ovaryL, ovaryR].forEach(o => { o.userData.gender = 'female'; o.visible = false; });
prostate.userData.gender = 'male'; prostate.visible = true;
tube(layers.vessels, '主动脉', [[0, 6.35, .25], [0, 5.62, .25], [.1, 5.1, .25], [0, 4.55, .25], [0, 3.45, .25]], mats.vessel);
tube(layers.vessels, '左冠状动脉', [[0, 4.95, .3], [-.33, 4.9, .3], [-.48, 4.8, .3]], mats.vessel); tube(layers.vessels, '右冠状动脉', [[0, 4.95, .3], [.34, 4.9, .3], [.5, 4.8, .3]], mats.vessel);
tube(layers.vessels, '左颈动脉', [[0, 6.25, .23], [-.17, 6.8, .24], [-.24, 7.1, .23]], mats.vessel); tube(layers.vessels, '右颈动脉', [[0, 6.25, .23], [.17, 6.8, .24], [.24, 7.1, .23]], mats.vessel);
const nervePath = (points, name) => tube(layers.nerves, name, points, mats.vessel, 'nerves').material.color.set(0xb7a5ff);
nervePath([[0, 6.1, -.25], [-.2, 5.5, -.25], [-.55, 5.05, -.26], [-.95, 4.35, -.24], [-1.06, 3.5, -.24]], '左臂神经'); nervePath([[0, 6.1, -.25], [.2, 5.5, -.25], [.55, 5.05, -.26], [.95, 4.35, -.24], [1.06, 3.5, -.24]], '右臂神经');

// Center body and decorative stage ring
body.scale.set(1, 1, 1); scene.add(body);
const stage = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.48, 96), new THREE.MeshBasicMaterial({ color: 0x6ce6cf, transparent: true, opacity: .18, side: THREE.DoubleSide }));
stage.rotation.x = -Math.PI / 2; stage.position.y = -.04; scene.add(stage);

const structureMap = {
  skeleton: { label: '骨骼层', note: '206块骨骼共同形成支撑框架。切换透明度，可以看到骨骼与肌肉的空间关系。', type: 'SKELETAL SYSTEM', color: 0xd2dbcf },
  muscles: { label: '肌肉层', note: '胸大肌连接锁骨、胸骨与肱骨，负责肩关节的内收和旋转。拖动模型，可观察肌纤维的走向。', type: 'MUSCLE GROUP', color: 0xef9ecd },
  organs: { label: '器官层', note: '心脏、肺、肝脏与胰腺按真实相对位置排布。使用 X-Ray 透视，观察它们与骨架的关系。', type: 'ORGAN SYSTEM', color: 0xf1bb72 },
  vessels: { label: '血管层', note: '主动脉从心脏向下延伸，再分出冠状动脉和颈动脉。红色路径表示血流主干。', type: 'VASCULAR SYSTEM', color: 0xe56d82 },
  nerves: { label: '神经层', note: '神经束从脊髓向四肢延伸，紫色路径帮助定位躯干与上肢之间的信号连接。', type: 'NERVOUS SYSTEM', color: 0xb7a5ff },
};
function setLayerVisibility(name, visible) { if (layers[name]) layers[name].visible = visible; }
function setLayerActive(name) {
  const data = structureMap[name] || structureMap.muscles;
  document.querySelector('#crumb-active').textContent = data.label.replace('层', '');
  document.querySelector('#model-caption-title').textContent = data.label;
  document.querySelector('#structure-note').textContent = data.note;
  document.querySelector('.selected-type').textContent = data.type;
  const selected = document.querySelector('#selected-name'); selected.textContent = name === 'muscles' ? '胸大肌' : data.label;
  document.querySelector('.selection-orb').style.color = `#${data.color.toString(16).padStart(6, '0')}`;
  document.querySelectorAll('.tree-row[data-structure]').forEach(row => row.classList.toggle('selected', row.dataset.structure === name));
}
setLayerActive('muscles');

// Per-structure color override. Each proxy mesh owns a cloned material, so a
// color edit never recolors the rest of a system. The control lives in the
// inspector markup and is reused here rather than duplicated dynamically.
const colorPicker = document.querySelector('#color-picker');
colorPicker?.addEventListener('input', e => {
  const color = e.target.value;
  const groupName = document.querySelector('.tree-row.selected')?.dataset.structure || 'muscles';
  if (selectedObject?.material?.color) selectedObject.material.color.set(color);
  else layers[groupName].traverse(o => { if (o.material?.color) o.material.color.set(color); });
});

function selectObject(object) {
  if (selectedObject && selectedObject.material) selectedObject.material.emissiveIntensity = selectedObject.userData.prevEmission ?? .45;
  selectedObject = object;
  if (selectedObject?.material) { selectedObject.userData.prevEmission = selectedObject.material.emissiveIntensity; selectedObject.material.emissive.setHex(0x7b9422); selectedObject.material.emissiveIntensity = .72; }
  if (object) { const layer = object.userData.layer || 'muscles'; setLayerActive(layer); const clean = object.name.replace(/[·][左右]/, ''); document.querySelector('#selected-name').textContent = clean; if (colorPicker?.value && object.material?.color) colorPicker.value = `#${object.material.color.getHexString()}`; ['x','y','z'].forEach(axis => { const input = document.querySelector(`#pos-${axis}`); if (input) input.value = Number(object.position[axis]).toFixed(2); }); showToast(`已选中 · ${clean}`); }
}
['x','y','z'].forEach(axis => document.querySelector(`#pos-${axis}`)?.addEventListener('input', e => {
  if (selectedObject) selectedObject.position[axis] = Number(e.target.value) || 0;
}));
const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
// OrbitControls owns the drag gesture. Only a short, stationary pointer gesture
// is treated as selection, so orbiting never flashes a random muscle or organ.
let pointerStart = null;
canvas.addEventListener('pointerdown', e => { pointerStart = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', e => {
  if (!pointerStart || Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 6) { pointerStart = null; return; }
  const rect = canvas.getBoundingClientRect(); pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(Object.values(layers).flatMap(g => g.children), true);
  if (hits.length) selectObject(hits[0].object);
  pointerStart = null;
});

function setCameraPreset(name) { const dest = { perspective: [4.8, 3.55, 10.8], front: [0, 3.55, 11.4], side: [11.4, 3.55, .05] }[name]; if (!dest) return; const from = camera.position.clone(), to = new THREE.Vector3(...dest); const start = performance.now(); const duration = 700; function step(t) { const p = Math.min((t - start) / duration, 1); const e = p * p * (3 - 2 * p); camera.position.lerpVectors(from, to, e); camera.lookAt(controls.target); if (p < 1) requestAnimationFrame(step); } requestAnimationFrame(step); document.querySelectorAll('.view-tool').forEach(btn => btn.classList.toggle('active', btn.dataset.view === name)); }
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 1800); }

document.querySelectorAll('.tree-row[data-structure]').forEach(row => {
  row.addEventListener('click', () => { const name = row.dataset.structure; setLayerVisibility(name, true); setLayerActive(name); });
  row.querySelector('.eye')?.addEventListener('click', e => { e.stopPropagation(); const name = row.dataset.structure; const visible = !layers[name].visible; setLayerVisibility(name, visible); row.classList.toggle('hidden-layer', !visible); row.querySelector('.eye').textContent = visible ? '◉' : '○'; showToast(`${structureMap[name]?.label ?? name}已${visible ? '显示' : '隐藏'}`); });
});
document.querySelectorAll('.gender-option').forEach(btn => btn.addEventListener('click', () => {
  currentGender = btn.dataset.gender;
  document.querySelectorAll('.gender-option').forEach(b => b.classList.toggle('active', b === btn));
  layers.skin.traverse(o => { if (o.material) o.material.color.set(currentGender === 'female' ? 0xa5859e : 0x6f8d9a); });
  body.traverse(o => { if (o.userData?.gender) o.visible = o.userData.gender === currentGender; });
  body.scale.x = currentGender === 'female' ? .95 : 1;
  body.scale.z = currentGender === 'female' ? 1.05 : 1;
  const meta = document.querySelector('.model-caption .caption-meta');
  if (meta) meta.textContent = `${currentGender === 'female' ? '女性' : '男性'} · 教学参考 · 分层交互`;
  const modelId = document.querySelector('.model-id');
  if (modelId) modelId.textContent = `MODEL 02—${currentGender === 'female' ? 'F' : 'M'} · LAYERED BODY`;
  showToast(`${currentGender === 'female' ? '女性' : '男性'}教学参考模型已切换`);
}));
document.querySelectorAll('.view-tool').forEach(btn => btn.addEventListener('click', () => setCameraPreset(btn.dataset.view)));
document.querySelector('#opacity-slider').addEventListener('input', e => { const value = Number(e.target.value); document.querySelector('#opacity-value').textContent = `${value}%`; const groupName = document.querySelector('.tree-row.selected')?.dataset.structure || 'muscles'; layers[groupName].traverse(o => { if (o.material) o.material.opacity = value / 100; }); });
document.querySelector('.visibility-toggle')?.addEventListener('click', () => { if (!selectedObject) return; selectedObject.visible = !selectedObject.visible; document.querySelector('.visibility-toggle').classList.toggle('on', selectedObject.visible); showToast(`${selectedObject.name}已${selectedObject.visible ? '显示' : '隐藏'}`); });
document.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => { btn.classList.toggle('active'); showToast(`${btn.dataset.toggle === 'wireframe' ? '线框叠加' : 'X-Ray 透视'}已${btn.classList.contains('active') ? '开启' : '关闭'}`); if (btn.dataset.toggle === 'xray') { const on = btn.classList.contains('active'); Object.values(layers).forEach(g => g.traverse(o => { if (o.material && 'opacity' in o.material) o.material.opacity = on ? Math.min(o.material.opacity, .28) : Math.max(o.material.opacity, .78); })); } if (btn.dataset.toggle === 'wireframe') { const on = btn.classList.contains('active'); Object.values(layers).forEach(g => g.traverse(o => { if (o.material && 'wireframe' in o.material) o.material.wireframe = on; })); } }));
document.querySelectorAll('[data-dock]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('.dock-btn').forEach(b => b.classList.toggle('active', b === btn)); const action = btn.dataset.dock; if (action === 'screenshot') { const link = document.createElement('a'); link.download = 'rainbow-atlas-view.png'; link.href = renderer.domElement.toDataURL('image/png'); link.click(); showToast('视图已导出 PNG'); } else showToast(`${btn.querySelector('small').textContent}模式`); }));
document.querySelector('[data-action="reset-view"]').addEventListener('click', () => setCameraPreset('perspective'));
document.querySelector('[data-action="hide-all"]').addEventListener('click', () => { Object.values(layers).forEach(g => g.visible = false); showToast('已隐藏全部图层 · 点击结构名称恢复'); });
document.querySelector('[data-action="add-note"]').addEventListener('click', () => showToast('标注模式已开启 · 点击模型添加锚点'));
document.querySelector('[data-action="collapse-rail"]').addEventListener('click', () => document.querySelector('.left-rail').classList.toggle('collapsed'));

// Lightweight local search over the proxy anatomy. The production atlas can
// replace this index with atlas.json concepts without changing the UI contract.
const searchInput = document.querySelector('.search-box input');
searchInput?.addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase(); if (!q) return;
  let match = null;
  Object.values(layers).some(group => group.children.some(child => {
    if (child.name.toLowerCase().includes(q)) { match = child; return true; }
    return false;
  }));
  if (match) { setLayerVisibility(match.userData.layer, true); selectObject(match); }
});

function resize() { const w = viewport.clientWidth, h = viewport.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize();
setTimeout(() => document.querySelector('#model-loader').classList.add('hidden'), 700);
const clock = new THREE.Clock();
function animate() { requestAnimationFrame(animate); const t = clock.getElapsedTime(); stage.material.opacity = .12 + Math.sin(t * .8) * .03; pink.intensity = 1.5 + Math.sin(t * .7) * .16; controls.update(); renderer.render(scene, camera); }
animate();
