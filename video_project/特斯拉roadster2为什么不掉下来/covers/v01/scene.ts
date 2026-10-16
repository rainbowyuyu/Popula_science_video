/** Independent cover stage. The frozen video model is imported read-only. */
import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {Car} from '../../source/v05/src/Car';
import {World} from '../../source/v05/src/World';

const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const fract=(x:number)=>x-Math.floor(x);
const canvas=document.createElement('canvas');document.body.appendChild(canvas);
const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setClearColor(0x000000,0);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(29,1,.02,60);
const referenceScene=new T.Scene(),referenceCamera=new T.PerspectiveCamera(38,16/9,.05,160),referenceWorld=new World(referenceScene,referenceCamera,renderer);referenceWorld.update(215.10);const reference=referenceWorld.telemetry;
const referencePosition=new T.Vector3(...reference.position as [number,number,number]),referenceOffset=new T.Vector3(...reference.camera as [number,number,number]).sub(referencePosition),referenceTarget=new T.Vector3(...reference.target as [number,number,number]).sub(referencePosition);referenceWorld.dispose();renderer.setClearColor(0x000000,0);renderer.toneMappingExposure=.96;
const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();
for(const[x,y,z,w,h]of[[-1,5,3,10,2],[1,2,-4,10,1.6],[-5,1,1,3,6]]){const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(4.2,4.0,3.7),side:T.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);room.add(m);}
const env=pmrem.fromScene(room,.025);scene.environment=env.texture;scene.environmentIntensity=.82;room.dispose();
scene.add(new T.HemisphereLight(0xfff7ea,0x6a8794,1.05));
const sun=new T.DirectionalLight(0xfff0db,3.0);sun.position.set(-2,8,5);scene.add(sun);
const cool=new T.DirectionalLight(0xc7edf6,2.2);cool.position.set(5,-2,6);scene.add(cool);
const rim=new T.DirectionalLight(0xe9f1f6,1.5);rim.position.set(-4,3,-6);scene.add(rim);
const pivot=new T.Group(),car=new Car();car.root.position.y=-.65;pivot.add(car.root);scene.add(pivot);

// Each object owns its cutaway material. Do not modify imported/shared assets.
car.root.traverse(o=>{if(o instanceof T.Mesh){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();o.castShadow=false;o.receiveShadow=false;}});
const materialOf=(o:T.Mesh)=>Array.isArray(o.material)?o.material:[o.material];
for(const o of car.shell){
  const glass=/glass|gasket|window_division/.test(o.name),paint=/fender|surface|deck|hood|belt|fascia|outline/.test(o.name);
  for(const m of materialOf(o)){m.transparent=true;m.opacity=glass?.12:paint?(/fascia/.test(o.name)?.58:.28):.85;m.depthWrite=false;if(m instanceof T.MeshPhysicalMaterial){m.color.set(glass?0x869da5:0x8c9ca5);m.roughness=.24;m.metalness=glass?.10:.62;m.clearcoat=.65;m.envMapIntensity=.76;}}
}
car.root.traverse(o=>{if(o instanceof T.Mesh&&/wheel_liner|Underbody_flat_floor|Interior|Seat|seat|dashboard|Steering|display|diffuser|strake/.test(o.name))for(const m of materialOf(o)){m.transparent=true;m.opacity=/Underbody/.test(o.name)?.055:/wheel_liner/.test(o.name)?.16:.05;m.depthWrite=false;}});
const cabin=car.root.getObjectByName('Interior_under_glass');if(cabin)cabin.visible=false;
car.setTankVisible(true);car.setThrustersVisible(true);
car.tank.traverse(o=>{if(o instanceof T.Mesh){for(const m of materialOf(o)){if(o.name==='Pressure_vessel_capsule'){m.transparent=true;m.opacity=.42;m.depthWrite=false;if(m instanceof T.MeshStandardMaterial){m.color.set(0x147b91);m.metalness=.30;m.roughness=.25;}}else if(o.name==='Illustrative_high_pressure_line'&&m instanceof T.MeshStandardMaterial){m.color.set(0xbf8234);m.metalness=.65;m.roughness=.26;m.emissive.set(0x73451c);m.emissiveIntensity=.12;}}}});

// A transparent shell plus a bright centreline makes the actual vessel legible.
const gasMat=new T.MeshBasicMaterial({color:0x2aaac0,transparent:true,opacity:.12,depthWrite:false});
const gas=new T.Mesh(new T.CapsuleGeometry(.168,.76,12,40),gasMat);gas.rotation.x=Math.PI/2;gas.position.set(-.56,.64,0);car.root.add(gas);
const moleculeMat=new T.MeshStandardMaterial({color:0x1b8aa6,roughness:.28,metalness:.12,emissive:0x06495d,emissiveIntensity:.2});
for(let i=0;i<68;i++){const z=(fract(i*.6180339887)-.5)*1.04,cap=Math.max(0,Math.abs(z)-.38),r=Math.sqrt(Math.max(0,.15**2-cap**2))*Math.sqrt(fract(i*.75487766)),a=i*2.399963;const o=new T.Mesh(new T.SphereGeometry(.011,8,6),moleculeMat);o.position.set(-.56+Math.cos(a)*r,.64+Math.sin(a)*r,z);car.root.add(o);}
const trimMat=new T.MeshStandardMaterial({color:0x86aeb5,metalness:.8,roughness:.2});
for(const z of[-.38,.38]){const ring=new T.Mesh(new T.TorusGeometry(.175,.006,8,64),trimMat);ring.position.set(-.56,.64,z);car.root.add(ring);}

const jets=new T.Group();jets.name='Cold_gas_plumes';car.root.add(jets);
const cloudCanvas=document.createElement('canvas');cloudCanvas.width=cloudCanvas.height=128;const ctx=cloudCanvas.getContext('2d')!;const gradient=ctx.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,'rgba(255,255,255,.75)');gradient.addColorStop(.4,'rgba(255,255,255,.35)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);const cloudMap=new T.CanvasTexture(cloudCanvas);
function plume(origin:T.Vector3,seed:number,strength:number){
  const group=new T.Group();group.position.copy(origin);jets.add(group);
  for(let i=0;i<42;i++){const q=(i+.5)/42,a=i*2.39996+seed,r=q*.09;const mat=new T.SpriteMaterial({map:cloudMap,color:0x4aa0b8,transparent:true,opacity:(.16+.12*(1-q))*strength*Math.sin(Math.PI*q)**.4,depthWrite:false});const p=new T.Sprite(mat);p.position.set(Math.cos(a)*r,-.09-q*1.4,Math.sin(a)*r);p.scale.setScalar(.09+q*.19);group.add(p);}
}
plume(car.thrusters.frontLeft,.13,1);plume(car.thrusters.rearLeft,.63,.95);plume(car.thrusters.frontRight,.32,.4);plume(car.thrusters.rearRight,.81,.4);

function bounds(group:T.Object3D){const b=new T.Box3().setFromObject(group),points=[];for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])points.push(V(x,y,z).project(camera));return{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.max(...points.map(p=>p.y)),bottom:Math.min(...points.map(p=>p.y))};}
const project=(p:T.Vector3)=>{const q=p.clone().project(camera);return{x:(q.x+1)/2,y:(1-q.y)/2};};
(window as any).draw=(variant='landscape',width=2400,height=1500)=>{
  renderer.setSize(width,height);camera.aspect=width/height;
  pivot.rotation.set(reference.rotation??-.74,0,variant==='portrait'?-.25:0);
  camera.position.copy(referenceOffset).multiplyScalar(variant==='portrait'?1.37:1.23);camera.lookAt(referenceTarget.x,-.28,referenceTarget.z);camera.fov=variant==='portrait'?29:27;camera.updateProjectionMatrix();camera.updateMatrixWorld();scene.updateMatrixWorld(true);renderer.render(scene,camera);
  return{variant,width,height,referenceFrame:6453,referenceTime:215.10,projection:bounds(pivot),anchors:{com:project(pivot.localToWorld(V(0,0,0))),tank:project(car.root.localToWorld(V(-.56,.64,0))),front:project(car.root.localToWorld(V(2.2,.4,0))),rear:project(car.root.localToWorld(V(-2.2,.6,0)))},officialCAD:false,mechanism:'illustrative'};
};
(window as any).ready=true;
