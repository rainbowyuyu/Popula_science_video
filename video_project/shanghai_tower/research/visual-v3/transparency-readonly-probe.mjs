import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as T from 'three';

// CPU-only inspection of the frozen World.update and CameraPath. No renderer,
// browser, source/public mutation or new asset generation is performed.
const root=process.cwd(),out=path.join(root,'research/visual-v3');
await build({stdin:{contents:"export {World} from './src/World'; export {CameraPath} from './src/CameraPath'; export {PhysicsPlayback} from './src/PhysicsPlayback'; export {stateAt,pulse,channel} from './src/visual';",resolveDir:root,loader:'ts'},outfile:path.join(out,'transparency-readonly-probe.bundle.mjs'),bundle:true,platform:'node',format:'esm',external:['three','three/*'],logLevel:'error'});
const {World,CameraPath,PhysicsPlayback,stateAt,pulse,channel}=await import(pathToFileURL(path.join(out,'transparency-readonly-probe.bundle.mjs')));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const timeline=read('public/timeline.json'),manifest=read('public/models/shanghai-tower-manifest.json'),data=read('public/physics/response.json');
const V=(...x)=>new T.Vector3(...x),scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1920/1080,.008,200);
const physics=new PhysicsPlayback(data,timeline),cameraPath=new CameraPath(timeline);cameraPath.setAnchors(manifest.cameraAnchorsThree);
const world=Object.create(World.prototype);
Object.assign(world,{scene,camera,physics,path:cameraPath,parts:[],tower:new T.Group(),ground:new T.Group(),eddy:new T.Group(),eddyDots:[],platform:new T.Group(),routes:[],panelDirections:new Map(),cut:new T.Plane(V(0,-1,0),100),manifest,anchors:manifest.forceAnchorsThree,tmdAnchors:manifest.tmdAnchorsThree,environment:{update(){}},effects:{tmd(){return {relative:0};},update(){}}});
scene.add(world.tower,world.ground,world.eddy,world.platform);
// Bboxes are conservative envelopes, not a new reconstruction. Geometry is left
// unbound; real physical displacement is used for the camera, and bounds gain a
// 1-unit safety pad in the off-screen test (max nodal movement is only .34735).
for(const info of manifest.parts){
 const box=new T.Box3(V(...info.bboxThree[0]).multiplyScalar(.01),V(...info.bboxThree[1]).multiplyScalar(.01));
 const id=info.id,center=box.getCenter(V()),group=new T.Group(),geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.Float32BufferAttribute([center.x,box.min.y,center.z,center.x,box.max.y,center.z],3));
 const m=new T.MeshStandardMaterial({color:'#ffffff'});m.clippingPlanes=[world.cut,new T.Plane(V(0,-1,0),100)];m.userData.originalColor=m.color.clone();m.userData.originalOpacity=1;
 const mesh=new T.Mesh(geo,m);group.add(mesh);world.tower.add(group);
 world.parts.push({id,role:info.role,zone:Number(/_Z(\d+)/.exec(id)?.[1]??0),root:group,meshes:[mesh],materials:[m],center,offset:V(),restVertices:[new Float32Array(geo.getAttribute('position').array)],box});
}
for(const p of world.parts.filter(p=>/ENVELOPE.*GLASS/.test(p.id)))world.panelDirections.set(p.id.replace(/_GLASS$/,''),V(p.center.x,0,p.center.z).normalize());
const frustum=new T.Frustum(),projection=new T.Matrix4(),previous=new Map(),events=new Map();
let hiddenChecks=0,hiddenIntersections=0;const hiddenExamples=[],maxByKind={};
for(let frame=0;frame<timeline.duration;frame++){
 const state=stateAt(frame,timeline),u=state.n+state.u;world.update(state);
 frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 const reveal=channel([[1,0],[3.4,0],[4.8,1],[21,1],[22.8,.42],[26,.38],[28,0],[34.1,0],[35.2,.85],[38.3,.85],[39.7,0],[49,0]],u),skin=pulse(21.4,22.5,26.3,27.4,u);
 for(const p of world.parts){
  const m=p.materials[0],now={depthWrite:m.depthWrite,castShadow:p.meshes[0].castShadow,opacity:m.opacity},old=previous.get(p.id);
  if(old){for(const type of ['depthWrite','castShadow'])if(old[type]!==now[type]){
   const box=p.box.clone().translate(p.root.position);box.max.y=Math.min(box.max.y,world.cut.constant,m.clippingPlanes[1].constant);
   const visible=!box.isEmpty()&&frustum.intersectsBox(box);
   const key=`${frame}:${type}:${old[type]}:${now[type]}`,event=events.get(key)??{frame,u,time:frame/30,type,from:old[type],to:now[type],count:0,boundsIntersecting:0,examples:[],visibleExamples:[],opacityBefore:old.opacity,opacityAfter:now.opacity};
   event.count++;if(event.examples.length<6)event.examples.push(p.id);if(visible){event.boundsIntersecting++;if(event.visibleExamples.length<12)event.visibleExamples.push(p.id);}
   events.set(key,event);
  }}
  previous.set(p.id,now);
  const outer=/ENVELOPE|SPIRAL_RIBS|GLAZING|FACADE_OUTER|FACADE_RADIAL_TRUSSES/.test(p.id),inner=/INNER_FACADE/.test(p.id);
  if((outer||inner)&&reveal*(1-skin)>=.84){
   const box=p.box.clone().translate(p.root.position).expandByScalar(1);hiddenChecks++;
   if(frustum.intersectsBox(box)){hiddenIntersections++;if(hiddenExamples.length<20)hiddenExamples.push({frame,u,id:p.id});}
  }
 }
}
const report={method:'Frozen World.update, actual CameraPath/physics camera-follow; conservative manifest AABBs, no pixels. Source/public read only.',frames:timeline.duration,hiddenChecks,hiddenIntersections,hiddenExamples,events:[...events.values()],limits:['An AABB intersection is a candidate, not proof that a rendered pixel/shadow is visible.','No shadow-map rasterization, transparent sorting, depth buffer, clipping caps or per-vertex deformation is simulated.','Off-screen test includes an extra 1 world-unit pad per axis, versus .34735 maximum solver nodal movement at48x.']};
fs.writeFileSync(path.join(out,'transparency-readonly-probe.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,events:report.events.filter(x=>x.boundsIntersecting>0).map(x=>({...x,examples:undefined,visibleExamples:x.visibleExamples.slice(0,4)}))},null,2));
