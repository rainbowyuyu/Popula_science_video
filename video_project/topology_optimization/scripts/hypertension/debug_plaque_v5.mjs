import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import ts from 'typescript';
import * as T from 'three';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const timeline=read('src/hypertension/timeline.json');
const manifest=read('public/hypertension/models/asset-manifest.json');
const design=read('research/hypertension/anatomy-camera-design.json');
const physics=read('public/hypertension/physics.json');
const stem=`hypertension-plaque-debug-${process.pid}-${Date.now()}`;
const temp=path.join(root,'tmp');fs.mkdirSync(temp,{recursive:true});
const generated=[];
const sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
for(const name of ['CameraPath','VascularDetail','World']){
 let source=fs.readFileSync(path.join(root,`src/hypertension/${name}.ts`),'utf8');
 source=source.replace("import timeline from './timeline.json';",`const timeline=${JSON.stringify(timeline)};`)
  .replace("'./CameraPath'",`'./${stem}-CameraPath.mjs'`).replace("'./VascularDetail'",`'./${stem}-VascularDetail.mjs'`);
 const file=path.join(temp,`${stem}-${name}.mjs`);generated.push(file);
 fs.writeFileSync(file,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
try{
 const {HypertensionWorld}=await import(pathToFileURL(path.join(temp,`${stem}-World.mjs`)).href);
 const w=Object.create(HypertensionWorld.prototype);
 const bounds=manifest.groups.bodySurface.bounds,scale=6.85/(bounds[1][1]-bounds[0][1]);
 const worldPoint=(a)=>new T.Vector3(a[0]*scale,(a[1]-bounds[0][1])*scale+.08,a[2]*scale);
 const worldBox=(a)=>new T.Box3(worldPoint(a[0]),worldPoint(a[1]));
 Object.assign(w,{scene:new T.Scene(),camera:new T.PerspectiveCamera(35,16/9,.0001,70),bodyRoot:new T.Group(),introRoot:new T.Group(),measureRoot:new T.Group(),atlasGroups:{},atlasScale:scale,anchors:{},screens:[],signals:[],traces:[],ldlParticles:[],pressureVectors:[],pressureFronts:[],foamCells:[],platelets:[],dummy:new T.Object3D(),flowPhase:new Float64Array(timeline.duration+2),arteriolePhase:new Float64Array(timeline.duration+2),physics,disposed:false,pulseTime:0});
 w.scene.add(w.bodyRoot,w.introRoot,w.measureRoot);
 for(const [name,group] of Object.entries(manifest.groups))w.anchors[name]=worldPoint(group.center);
 w.anchors.body=w.anchors.bodySurface.clone();w.anchors.vessel=new T.Vector3(...design.aorticCutaway.center);
 for(const name of ['key','fill']){const light=new T.DirectionalLight();light.name=name;w.scene.add(light,light.target);}
 let renderCalls=0;w.renderer={render(){renderCalls++;}};
 // Invoke the actual production geometry builders and integrator, not replicas.
 w.buildKidneyDiagram();w.buildSignals();w.buildVessel();w.buildVascularDetails();w.integrateFlow();w.scene.updateMatrixWorld(true);

 const stateAt=(frame)=>{const scene=timeline.scenes.find(s=>frame>=s.start&&frame<s.end),clips=timeline.clips.filter(c=>c.scene===scene.id),clip=clips.filter(c=>frame>=c.start).at(-1)??clips[0];return {scene:scene.id,elapsed:(frame-scene.start)/30,duration:(scene.end-scene.start)/30,progress:(frame-scene.start)/(scene.end-scene.start),time:frame/30,line:clip?.line??0,lineProgress:clip?Math.max(0,Math.min(1,(frame-clip.start)/clip.duration)):0};};
 const out=[];
 for(const frame of [7550,7600,7680,7757,7820,7900,7939,8000]){
  w.render(stateAt(frame));w.scene.updateMatrixWorld(true);w.camera.updateMatrixWorld(true);
  const vessel=w.vessel,camLocal=vessel.root.worldToLocal(w.camera.getWorldPosition(new T.Vector3()));
  const objects=[vessel.mesh,w.plaqueCore,w.plaqueCap,w.plaqueThrombus,w.foamCells[0],w.foamCells[7],w.platelets[0],w.ldlParticles[0]].map(o=>{
   const point=o.getWorldPosition(new T.Vector3()),projection=point.clone().project(w.camera),dir=point.clone().sub(w.camera.position).normalize(),ray=new T.Raycaster(w.camera.position,dir),wallHits=ray.intersectObject(vessel.mesh,false);
   const box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};const pos=o.geometry.attributes.position;
   for(let i=0;i<pos.count;i++){const q=o.localToWorld(new T.Vector3().fromBufferAttribute(pos,i)).project(w.camera),x=(q.x+1)*960,y=(1-q.y)*540;box.minX=Math.min(box.minX,x);box.maxX=Math.max(box.maxX,x);box.minY=Math.min(box.minY,y);box.maxY=Math.max(box.maxY,y);}
   return {name:o.name||'aorta-wall',visible:o.visible,parentVisible:o.parent.visible,positionLocal:o.position.toArray(),world:point.toArray(),cameraSpace:point.clone().applyMatrix4(w.camera.matrixWorldInverse).toArray(),projectionPixels:[(projection.x+1)*960,(1-projection.y)*540],projectedBoundingBox:box,opacity:o.material.opacity,depthWrite:o.material.depthWrite,transparent:o.material.transparent,renderOrder:o.renderOrder,frustumCulled:o.frustumCulled,worldDistance:point.distanceTo(w.camera.position),wallHitsBeforeCenter:wallHits.filter(h=>h.distance<point.distanceTo(w.camera.position)).map(h=>({distance:h.distance,pointLocal:vessel.root.worldToLocal(h.point.clone()).toArray()})),scale:o.scale.toArray(),materialData:o.material.userData};
  });
  out.push({frame,scene:stateAt(frame).scene,cameraLocal:camLocal.toArray(),camera:w.camera.position.toArray(),target:w.cameraPath.at(frame/30).target.toArray(),plaqueVisible:w.plaque.visible,vesselVisible:vessel.root.visible,objects});
 }
 const result={scope:'Actual production render state (no-op GPU) followed by mesh world projection and camera-to-center ray tests against production aortic wall. Ray tests use geometric surfaces, not alpha compositing; transparent renderer sort-depth analysis is reported separately.',sourceHash:sha('src/hypertension/World.ts'),createdAt:new Date().toISOString(),out};
 fs.writeFileSync(path.join(root,'research/hypertension/plaque-v5-debug.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}finally{for(const file of generated)fs.unlinkSync(file);}
