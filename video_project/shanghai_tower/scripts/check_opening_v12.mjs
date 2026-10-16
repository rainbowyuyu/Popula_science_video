import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import crypto from 'node:crypto';
import {build} from 'esbuild';import * as T from 'three';import {loadCameraParts} from './camera_geometry.mjs';
const outdir='tmp/v12-opening-numerical';fs.mkdirSync(outdir,{recursive:true});
await build({entryPoints:{opening:'src/OpeningCamera.ts',camera:'src/CameraPath.ts',inventory:'src/PartsInventory.ts',visual:'src/visual.ts'},outdir,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'error'});
const load=name=>import(pathToFileURL(path.resolve(outdir,name+'.mjs')));
const {openingCameraPose,applyOpeningCameraPose}=await load('opening'),{CameraPath,towerCameraAnchors}=await load('camera'),{PartsInventory}=await load('inventory'),{stateAt}=await load('visual');
const tl=JSON.parse(fs.readFileSync('src/timeline.json','utf8')),manifest=JSON.parse(fs.readFileSync('public/models/shanghai-tower-manifest.json','utf8'));
const geometry=await loadCameraParts(manifest),inventory=new PartsInventory(geometry.parts,tl),route=new CameraPath(tl);
route.setAnchors({...towerCameraAnchors(manifest),...inventory.anchors});
const camera=new T.PerspectiveCamera(34,1920/1080,.008,200),holds=new Set([0,80,108,136,182,240,294,340,415,488,535,616,675,746,820,904,968,1055,1148,1232,1290,1361,1435,1538,1628,1692,1740,1785,1786,1799,1800]);
const snapshots=[],steps=[];let last=null,maxResetError=0,maxQuaternionResetError=0;
function reset(){for(const p of geometry.parts){p.root.position.set(0,0,0);p.offset.set(0,0,0);p.root.quaternion.identity();}}
for(let f=0;f<=1800;f++){
 const s=stateAt(f,tl),cue=s.n+s.u,baseline=route.at(f/30),pose=openingCameraPose(f/30,baseline);applyOpeningCameraPose(camera,pose);
 if(![...pose.position,...pose.target,...camera.quaternion,pose.shift,pose.roll].every(Number.isFinite))throw Error('Nonfinite pose F'+f);
 reset();inventory.apply(cue);
 const radius=pose.position.distanceTo(pose.target);
 if(last)steps.push({frame:f,cameraSpeed:pose.position.distanceTo(last.position)*30/radius,angularDeg:camera.quaternion.angleTo(last.rotation)*180/Math.PI*30,zoomRate:Math.abs(Math.log(radius/last.radius))*30});
 last={position:pose.position.clone(),rotation:camera.quaternion.clone(),radius};
 for(const p of geometry.parts){if(![...p.root.position,...p.root.quaternion].every(Number.isFinite))throw Error('Nonfinite part '+p.id+' F'+f);if(p.root.scale.distanceTo(new T.Vector3(1,1,1))>1e-12)throw Error('Part scale changed: '+p.id);}
 if(f>=1786){
  if(pose!==baseline)throw Error('Opening override continues into accepted tail');
  for(const p of geometry.parts){maxResetError=Math.max(maxResetError,p.root.position.length());maxQuaternionResetError=Math.max(maxQuaternionResetError,p.root.quaternion.angleTo(new T.Quaternion()));}
  if(inventory.sectionFor(cue)!==null)throw Error('Storey cut continues into accepted tail');
  if(inventory.weight(cue)!==0||inventory.materialWeight(cue)!==0)throw Error('Opening material/ownership continues');
 }
 if(holds.has(f)){
  const moved=geometry.parts.filter(p=>p.root.position.length()>1e-6||Math.abs(p.root.quaternion.w)<.999999);
  const section=inventory.sectionFor(cue),sectionBounds=new T.Box3(),screenBounds=new T.Box2(),floorLevels=new Set();
  let survivingVertices=0,planeWorldError=0;
  for(const p of geometry.parts){
   const cut=inventory.sectionFor(cue,p.role);p.root.updateMatrixWorld(true);
   const lower=new T.Plane(new T.Vector3(0,1,0),cut?-cut.minY:100),upper=new T.Plane(new T.Vector3(0,-1,0),cut?cut.maxY:100);
   const transformedLower=lower.clone().applyMatrix4(p.root.matrixWorld),transformedUpper=upper.clone().applyMatrix4(p.root.matrixWorld);
   p.root.traverse(o=>{if(!(o instanceof T.Mesh))return;const a=o.geometry.getAttribute('position');
    for(let i=0;i<a.count;i++){
     const local=new T.Vector3().fromBufferAttribute(a,i),world=local.clone().applyMatrix4(p.root.matrixWorld);
     planeWorldError=Math.max(planeWorldError,Math.abs(lower.distanceToPoint(local)-transformedLower.distanceToPoint(world)),Math.abs(upper.distanceToPoint(local)-transformedUpper.distanceToPoint(world)));
     if(cut&&(local.y<cut.minY-1e-9||local.y>cut.maxY+1e-9))continue;
     if(p.root.visible===false||inventory.opacityFor(p.id,cue)<.01)continue;
     survivingVertices++;sectionBounds.expandByPoint(world);const projected=world.clone().project(camera);
     if(projected.z>=0&&projected.z<=1)screenBounds.expandByPoint(new T.Vector2((projected.x+1)*960,(1-projected.y)*540));
     if(cut&&p.role==='floors')floorLevels.add(Math.round(local.y*100000)/100000);
    }
   });
  }
  if(planeWorldError>1e-8)throw Error('Storey crop fails to travel with rotated parts F'+f);
  if(section&&f>=294&&f<=1628&&(!survivingVertices||floorLevels.size>3))throw Error('Not one visible source floor F'+f+': '+[...floorLevels]);
  const point=v=>{const p=v.clone().project(camera);return {x:(p.x+1)*960,y:(1-p.y)*540,z:p.z};};
  snapshots.push({frame:f,section,survivingVertices,visibleFloorLevels:[...floorLevels],planeWorldError,sectionBounds:{min:sectionBounds.min.toArray(),max:sectionBounds.max.toArray()},screenBounds:{min:screenBounds.min.toArray(),max:screenBounds.max.toArray()},camera:pose.position.toArray(),target:pose.target.toArray(),movedGroups:moved.length,towerBase:point(new T.Vector3()),towerCrown:point(new T.Vector3(0,6.32,0)),marks:inventory.marks(camera,cue),visibleMovedCentres:moved.filter(p=>{const q=p.center.clone().applyQuaternion(p.root.quaternion).add(p.root.position).project(camera);return Math.abs(q.x)<1&&Math.abs(q.y)<1&&q.z>0&&q.z<1;}).length});
 }
}
const sample=(f)=>{reset();const s=stateAt(f,tl);inventory.apply(s.n+s.u);return geometry.parts.map(p=>[...p.root.position,...p.root.quaternion]);};
const reference=sample(1055);sample(1538);const again=sample(1055);if(JSON.stringify(reference)!==JSON.stringify(again))throw Error('Nonsequential seeking changed transforms');
const sources=['src/OpeningCamera.ts','src/CameraPath.ts','src/PartsInventory.ts','src/World.ts','src/Film.tsx','src/timeline.json','public/models/shanghai-tower.glb','scripts/check_opening_v12.mjs'];
const report={sourceSHA256:Object.fromEntries(sources.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),parts:geometry.parts.length,allFinite:true,originalScaleRetained:true,nonSequentialSeekIdentical:true,maxResetError,maxQuaternionResetError,acceptedTailOverrideInactive:maxResetError===0&&maxQuaternionResetError===0,snapshots,motionRanks:Object.fromEntries(['cameraSpeed','angularDeg','zoomRate'].map(key=>[key,[...steps].sort((a,b)=>b[key]-a[key]).slice(0,12)])),scope:'Actual GLB transforms, single-storey clipping, local/world plane covariance and camera projection audit. Motion ranks identify frames to inspect; they do not certify aesthetics or collision freedom.'};
const out='research/qa/v12-opening/numerical.json';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));geometry.dispose();
console.log(JSON.stringify({out,parts:report.parts,tailReset:report.acceptedTailOverrideInactive,maxResetError,seekStable:true,snapshots:snapshots.map(x=>({frame:x.frame,moved:x.movedGroups,inView:x.visibleMovedCentres}))}));
