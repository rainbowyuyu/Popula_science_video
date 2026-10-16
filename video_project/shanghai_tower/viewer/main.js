import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';

const canvas=document.querySelector('#scene');
const status=document.querySelector('#status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene=new THREE.Scene();
scene.background=new THREE.Color('#edf0e8');
const camera=new THREE.PerspectiveCamera(36,1,.01,150);
camera.position.set(8.8,4.7,10.2);
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});}
catch(e){status.textContent='当前浏览器无法打开三维视图。请使用支持 WebGL 的浏览器。';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.91;
const controls=new OrbitControls(camera,canvas);
controls.target.set(0,2.9,0);controls.enableDamping=true;controls.dampingFactor=.065;
controls.minDistance=.5;controls.maxDistance=28;controls.maxPolarAngle=Math.PI*.92;
controls.autoRotateSpeed=.45;
const pmrem=new THREE.PMREMGenerator(renderer);
const environment=pmrem.fromScene(new RoomEnvironment(),.04);
scene.environment=environment.texture;scene.environmentIntensity=.65;pmrem.dispose();
scene.add(new THREE.HemisphereLight('#fff6e4','#a5b6b4',2));
const key=new THREE.DirectionalLight('#fff4df',2.7);key.position.set(-6,12,8);scene.add(key);
const rim=new THREE.DirectionalLight('#c8e1ea',2);rim.position.set(7,8,-6);scene.add(rim);
const ground=new THREE.Mesh(new THREE.CircleGeometry(7,96),new THREE.MeshStandardMaterial({color:'#dde5dd',roughness:.9}));
ground.rotation.x=-Math.PI/2;ground.position.y=-.87;scene.add(ground);
const root=new THREE.Group();scene.add(root);
const parts=[],pickables=[];let chosen=null,mode='whole',explosion=0,targetExplosion=0,cameraTween=null;
// Blend complete semantic visibility profiles. Rapid mode changes start from
// the current mixture, so neither material opacity nor camera pose snaps.
const modeWeights={whole:1,skeleton:0,foundation:0,top:0};
const state={loading:true,mode:'whole',parts:0,selected:null};
window.__rainbowViewer=state;
const descriptions={
  raft:'厚筏板把上部结构与桩群连成整体，将荷载向地下传递。',
  piles:'长桩通过桩侧与桩端把荷载交给土体。947根、有效长度52—56米来自公开设计论文，具体排布为教学重建。',
  core:'中央连续的筒壁参与承重和抗侧力，也围合电梯、楼梯等空间。井道细节在模型中简化。',
  megacolumn:'外圈巨型柱与核心筒协同受力。伸臂将两者连接，帮助抵抗侧向作用。',
  outrigger:'伸臂桁架把核心筒和外圈巨柱连接起来，带动两侧柱的轴力一增一减。',
  belt:'环带桁架绕外圈连接柱子，与伸臂共同传递荷载。八组双层环带的高度受公开论文约束。',
  cornercolumn:'四根对角角柱延伸至第五分区，配合八根主巨柱参与受力。',
  floorbeams:'楼板把荷载交给梁，梁再将力送往核心筒与柱子。',
  floors:'层层楼板围绕核心筒展开，楼层高度和数量分组作了教学简化。',
  outerglass:'旋转的外层幕墙包住建筑，圆角轮廓随高度变化。当前扇区是拆解分组。',
  mullions:'外幕墙的分格与支撑在模型中简化，帮助读清扭转曲面。',
  spiralrib:'外轮廓沿高度逐渐收分和旋转，累计总扭转约120°。',
  innerfacade:'内层幕墙围住室内使用空间，与外幕墙之间形成高大的中庭。',
  innerframe:'内层幕墙框架与外层围护之间，保留中庭和公共活动空间。',
  sky_lobby:'垂直分区之间的空中大堂，把高楼里的生活空间连接起来。',
  garden:'中庭与公共空间的位置依公开设计图重建，绿植仅作尺度参照。',
  damper:'悬挂质量块与建筑相互作用，帮助减小风致振动，改善高处的舒适度。',
  damper_cables:'悬挂连接允许质量块相对建筑运动。这里的尺寸和连接形式是教学简化。',
  damper_plate:'固定铜板与移动磁阵形成涡流阻尼，将一部分振动能量消耗掉。',
  damper_magnets:'磁阵随质量块运动，与固定铜板配合产生阻尼作用。',
  damper_support:'顶部承挂框架支撑悬挂质量块。模型表达作用关系，不是竣工详图。',
  crown:'不等高的开放冠部延续旋转外形，最高处达到632米。',
  diaphragm_wall:'地下连续墙围合基坑；公开施工资料记载主楼圆形墙内径121米。',
  basement:'地下室、筏板和上部结构相接，连续传递来自大楼的荷载。',
  soil:'地下土体作剖面表达，便于观察基础；不是地质勘察模型。',
  plaza:'地面仅作建筑与地下基础的空间参照，场地细节经过简化。',
};
const clamp=v=>Math.max(0,Math.min(1,v));
const ease=v=>{v=clamp(v);return v*v*v*(v*(6*v-15)+10);};
function viewOpacity(part,view,base){
  const r=part.role,z=part.zone;
  const shell=['outerglass','mullions','spiralrib','innerfacade','innerframe'].includes(r);
  if(view==='skeleton'){
    if(shell)return base*.04;
    if(['floors','garden','sky_lobby'].includes(r))return base*.30;
  }
  if(view==='foundation'){
    // Keep the load-bearing raft and piles solid. Fade the surrounding site
    // and below-ground enclosure so viewers can follow the connection.
    if(r==='plaza')return Math.min(base,.055);
    if(r==='soil')return Math.min(base,.025);
    if(r==='diaphragm_wall')return Math.min(base,.06);
    if(r==='basement')return Math.min(base,.24);
    if(z===1&&['floors','sky_lobby','garden','floorbeams'].includes(r))return Math.min(base,.10);
    if(shell)return Math.min(base,.04);
  }
  if(view==='top'){
    // The actual TMD is inside the upper occupied/core region. Opening just
    // the crown leaves it hidden behind the Z09 floors and concrete walls.
    // Retain the support, cable, copper plate and magnet assembly as solids.
    if(r.startsWith('damper'))return base;
    if(r==='crown')return Math.min(base,.018);
    if(shell)return Math.min(base,.02);
    if(z>=8){
      if(r==='core')return Math.min(base,.04);
      if(['floors','floorbeams','sky_lobby'].includes(r))return Math.min(base,.025);
      if(r==='garden')return Math.min(base,.01);
      if(['megacolumn','outrigger'].includes(r))return Math.min(base,.14);
    }
  }
  return base;
}
function resize(){const rect=canvas.parentElement.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas.parentElement);resize();
function showSelection(part){
  chosen=part;state.selected=part?.id??null;
  document.querySelector('#partKicker').textContent=part?'已选部件 · 教学重建':'点选模型里的一个部件';
  document.querySelector('#partName').textContent=part?.label??'从一条传力路开始';
  document.querySelector('#partDescription').textContent=part?(descriptions[part.role]??'构件依据公开资料重建，局部形状和尺度为教学近似。'):'楼板接住重量，梁把力交给核心筒和柱子，最后传入地下。';
}
function setView(next){
  mode=next;state.mode=mode;
  const views={whole:{p:[8.8,4.7,10.2],t:[0,2.9,0],label:'完整建筑'},skeleton:{p:[7.8,4.5,9.2],t:[0,2.9,0],label:'主体结构'},foundation:{p:[1.9,.20,2.45],t:[0,-.28,0],label:'桩筏基础'},top:{p:[1.7,6.53,2.0],t:[0,5.85,0],label:'顶部装置'}};
  const v=views[next];document.querySelector('#viewName').textContent=v.label;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===next)));
  targetExplosion=0;document.querySelector('#explode').value='0';document.querySelector('#explodeValue').value='0%';
  cameraTween={start:performance.now(),p0:camera.position.clone(),t0:controls.target.clone(),p1:new THREE.Vector3(...v.p),t1:new THREE.Vector3(...v.t),duration:reduced?0:1250};
  showSelection(null);
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelector('#explode').addEventListener('input',e=>{const value=Number(e.target.value);if(mode==='top'||mode==='foundation')setView('whole');targetExplosion=value/100;e.target.value=String(value);document.querySelector('#explodeValue').value=`${value}%`;});
document.querySelector('#rotate').addEventListener('click',e=>{controls.autoRotate=!controls.autoRotate;e.currentTarget.setAttribute('aria-pressed',String(controls.autoRotate));e.currentTarget.textContent=controls.autoRotate?'停止环绕':'缓慢环绕';});
controls.addEventListener('start',()=>{cameraTween=null;});
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerStart=null;
canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',e=>{
  if(!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>5)return;
  const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);
  const hit=ray.intersectObjects(pickables,false).find(h=>h.object.material.opacity>.15);showSelection(hit?.object.userData.part??null);
});
Promise.all([new GLTFLoader().loadAsync('../public/models/shanghai-tower.glb'),fetch('../public/models/shanghai-tower-manifest.json').then(r=>{if(!r.ok)throw new Error('模型清单加载失败');return r.json();})]).then(([gltf,manifest])=>{
  gltf.scene.updateMatrixWorld(true);
  for(const info of manifest.parts){
    const source=gltf.scene.getObjectByName(info.id);if(!source)throw new Error(`模型部件缺失: ${info.id}`);
    const group=new THREE.Group();group.name=info.id;root.add(group);
    const part={id:info.id,label:info.label_zh??info.id,role:info.role,zone:Number(/_Z(\d+)/.exec(info.id)?.[1]??0),group,meshes:[],center:new THREE.Vector3()};
    source.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld).scale(.01,.01,.01);geometry.computeBoundingSphere();
      const base=Array.isArray(o.material)?o.material[0]:o.material;const material=base.clone();material.userData.baseColor=material.color.clone();material.userData.baseOpacity=material.opacity;
      material.userData.baseEmissive=material.emissive?.clone()??new THREE.Color('#000000');
      if(['outerglass'].includes(part.role)){material.color.set('#8caeb7');material.opacity=.7;material.transparent=true;material.depthWrite=false;material.roughness=.29;material.metalness=.25;material.userData.baseOpacity=.7;material.userData.baseColor=material.color.clone();}
      const mesh=new THREE.Mesh(geometry,material);mesh.userData.part=part;group.add(mesh);part.meshes.push(mesh);pickables.push(mesh);
    });
    if(!part.meshes.length){root.remove(group);continue;}new THREE.Box3().setFromObject(group).getCenter(part.center);parts.push(part);
  }
  state.parts=parts.length;state.loading=false;status.hidden=true;
}).catch(error=>{state.loading=false;state.error=error.message;status.textContent='模型加载失败。请从项目根目录启动本地服务后打开此页。';console.error(error);});
let last=performance.now();
function tick(now){
  requestAnimationFrame(tick);const dt=Math.min((now-last)/1000,.05);last=now;
  explosion=THREE.MathUtils.damp(explosion,targetExplosion,7,dt);
  for(const key of Object.keys(modeWeights))modeWeights[key]=reduced?Number(key===mode):THREE.MathUtils.damp(modeWeights[key],Number(key===mode),5,dt);
  state.visibilityBlend={...modeWeights};
  if(cameraTween){const q=cameraTween.duration?ease((now-cameraTween.start)/cameraTween.duration):1;camera.position.lerpVectors(cameraTween.p0,cameraTween.p1,q);controls.target.lerpVectors(cameraTween.t0,cameraTween.t1,q);if(q>=1)cameraTween=null;}
  for(const part of parts){
    const r=part.role,z=part.zone,c=part.center;const radial=new THREE.Vector3(c.x,0,c.z);if(radial.lengthSq()<.00001)radial.set(1,0,0);radial.normalize();
    let dist=0,lift=0;
    if(['outerglass','mullions','spiralrib'].includes(r)){dist=1.45*explosion;lift=(z-4.5)*.08*explosion;}
    else if(['innerfacade','innerframe'].includes(r)){dist=.20*explosion;lift=(z-1)*.045*explosion;}
    else if(r==='megacolumn'){dist=.28*explosion;lift=(z-1)*.045*explosion;}
    else if(z>0){lift=(z-1)*.045*explosion;}
    else if(r==='crown'){lift=.65*explosion;}
    part.group.position.copy(radial.multiplyScalar(dist));part.group.position.y+=lift;
    for(const mesh of part.meshes){const m=mesh.material;m.color.copy(m.userData.baseColor);
      const opacity=Object.entries(modeWeights).reduce((sum,[view,weight])=>sum+viewOpacity(part,view,m.userData.baseOpacity)*weight,0);
      if(chosen===part){m.color.lerp(new THREE.Color('#bf8d47'),.42);m.emissive.set('#654723');m.emissiveIntensity=.27;}else{m.emissive.copy(m.userData.baseEmissive);m.emissiveIntensity=.07;}
      m.transparent=opacity<.999;m.opacity=opacity;m.depthWrite=opacity>.93;
    }
  }
  controls.update(dt);renderer.render(scene,camera);
}
requestAnimationFrame(tick);
window.addEventListener('pagehide',()=>{resizeObserver.disconnect();controls.dispose();renderer.dispose();environment.dispose();});
