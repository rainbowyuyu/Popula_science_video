import fs from 'node:fs';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const out='research/qa-v19-motion/fish';
await build({stdin:{contents:"export * from './src/FishObserverV19Motion';export * from './src/WorldV10';export * from './src/Timeline';export * from './src/CinematicRouteV10';",resolveDir:process.cwd(),loader:'ts'},outfile:out+'/runtime.mjs',bundle:true,format:'esm',platform:'node',packages:'external'});
const {FishObserverV19Motion,fishTravelV19Motion,sampleLivingFishV19,WorldV10,timeline,stateAt,sampleFilmCamera}=await import(pathToFileURL(process.cwd()+'/'+out+'/runtime.mjs'));
const file='public/assets_v19_repair/characters/rainbow_fish_v19_repair.glb';
const data=fs.readFileSync(file);const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const world=new WorldV10(undefined,new T.Scene()),camera=new T.PerspectiveCamera(45,1920/1080,.03,400);
const fish=new FishObserverV19Motion(gltf.scene,gltf.animations).attach(world);
const groups=[world.observer,world.friend,world.sprayObserver],roles=['observer','friend','spray'],figures=groups.map(g=>g.children[0]);
const errors=[],samples=[],lifecycle=[],previous=[],previousBones=new Map(),visibleBounds=[];
let maxEyeError=0,maxLensError=0,maxGazeError=0,maxStep=0,maxBoneStep=0,minExitOpacity=1,maxSpeed=0,maxVisibleStep=0;
let peakFrame=0,peakBoneFrame=0,peakVisibleStepFrame=0,minGroundClearance=Infinity,firstObserverHidden=null,firstSprayHidden=null;
function applyCamera(frame){const p=sampleFilmCamera(frame);camera.position.set(...p.position);camera.quaternion.copy(p.quaternion);const t=frame/30,bank=.0028*Math.sin(t*.17)+.0014*Math.sin(t*.053+1.2);camera.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),bank));camera.fov=p.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);}
function capture(frame){world.update(stateAt(frame));applyCamera(frame);fish.update(frame,camera);world.group.updateMatrixWorld(true);return JSON.stringify(figures.map((fig,i)=>{const a=[groups[i].visible,fig.visible,world.sprayLight.group.visible];fig.traverse(o=>{a.push(o.name,o.visible,...o.position.toArray(),...o.quaternion.toArray());if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])a.push(m.opacity,m.transparent,m.depthWrite);});return a;}));}
function summary(frame){return {frame,roles:figures.map((f,i)=>({role:roles[i],parentVisible:groups[i].visible,figureVisible:f.visible,...f.userData}))};}
function meshBounds(fig,step=6){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];fig.traverse(m=>{if(!m.isSkinnedMesh||!m.visible)return;m.skeleton.update();for(let k=0;k<m.geometry.attributes.position.count;k+=step){const p=m.getVertexPosition(k,new T.Vector3()).applyMatrix4(m.matrixWorld).project(camera);[p.x,p.y,p.z].forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});}});return {min,max,intersectsScreen:max[0]>=-1&&min[0]<=1&&max[1]>=-1&&min[1]<=1&&max[2]>=-1&&min[2]<=1};}
for(let frame=0;frame<timeline.duration;frame++){
 capture(frame);
 figures.forEach((fig,i)=>{
  const d=fig.userData;maxEyeError=Math.max(maxEyeError,d.eyeAnchorError);maxSpeed=Math.max(maxSpeed,d.travelSpeed);
  if(d.opticalExplanationAnchored)maxGazeError=Math.max(maxGazeError,d.gazeErrorDegrees);
  if(previous[i]){const step=fig.quaternion.angleTo(previous[i].q);if(step>maxStep){maxStep=step;peakFrame=frame;}if(groups[i].visible&&fig.visible&&previous[i].visible&&step>maxVisibleStep){maxVisibleStep=step;peakVisibleStepFrame=frame;}}
  previous[i]={q:fig.quaternion.clone(),visible:groups[i].visible&&fig.visible};
  fig.traverse(o=>{if(o.isBone){const id=i+'/'+o.name;if(previousBones.has(id)){const step=o.quaternion.angleTo(previousBones.get(id));if(step>maxBoneStep){maxBoneStep=step;peakBoneFrame=frame;}}previousBones.set(id,o.quaternion.clone());}if(d.independentOpaque&&o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])minExitOpacity=Math.min(minExitOpacity,m.opacity);});
  if(frame%300===0){
   const anchor=new T.Vector3();for(const side of ['L','R']){const m=groups[i].getObjectByName('EyeIris'+side);m.skeleton.update();anchor.add(m.getVertexPosition(0,new T.Vector3()).applyMatrix4(m.matrixWorld));}anchor.multiplyScalar(.5);const exact=groups[i].localToWorld(new T.Vector3(0,1.55,0).add(new T.Vector3(...d.travelOffset)));maxLensError=Math.max(maxLensError,anchor.distanceTo(exact));
   if(d.opticalExplanationAnchored)groups[i].traverse(m=>{if(!m.isSkinnedMesh||!m.visible)return;m.skeleton.update();for(let k=0;k<m.geometry.attributes.position.count;k+=6){const p=groups[i].worldToLocal(m.getVertexPosition(k,new T.Vector3()).applyMatrix4(m.matrixWorld));minGroundClearance=Math.min(minGroundClearance,p.y);}});
  }
 });
 if(frame>=9715&&firstObserverHidden===null&&figures[0].userData.exited){firstObserverHidden=frame;visibleBounds.push({role:'observer',frame,...meshBounds(figures[0],1)});}
 if(frame>=10255&&firstSprayHidden===null&&figures[2].userData.exited){firstSprayHidden=frame;visibleBounds.push({role:'spray',frame,...meshBounds(figures[2],1)});}
 if([450,9715,9740,9780,9803,9830,9853,9865,9890,9940,9988,10022,10255,10288,10320,10360,10398,10402].includes(frame))samples.push(summary(frame));
 if(frame>=9680&&frame%5===0)lifecycle.push({frame,observer:figures[0].userData,spray:figures[2].userData,visible:figures.map((f,i)=>groups[i].visible&&f.visible)});
}
const poses=new Map();for(const frame of [0,450,600,5400,5618,7418,7717,8448,9740,9853,9900,10288,10402,10699])poses.set(frame,capture(frame));
const seek=Array.from(poses).reverse().map(([frame,snapshot])=>{capture(1);capture(10699);return {frame,exact:capture(frame)===snapshot};});
capture(9853);const entryBounds=meshBounds(figures[2],1);capture(10402);const finalBridge={frame:10402,anyVisible:figures.some((f,i)=>f.visible&&groups[i].visible&&!f.userData.safelyOutside),roles:figures.map((f,i)=>({role:roles[i],visible:f.visible&&groups[i].visible,...f.userData}))};
const idle={};for(const role of roles){const poses=[];for(let f=600;f<900;f++)poses.push(sampleLivingFishV19(f,role,{weight:0,distance:0,heading:0,headPitch:0}));const range=fn=>{const values=poses.map(fn);return Math.max(...values)-Math.min(...values);};idle[role]={tail0YawRange:range(p=>p.tailEuler[0][1]),tail3YawRange:range(p=>p.tailEuler[3][1]),pectoralLeftFlapRange:range(p=>p.pectoralEuler.left[2]),pectoralRightFlapRange:range(p=>p.pectoralEuler.right[2]),rootRollRange:range(p=>p.rootEuler[2]),jawRange:range(p=>p.jawEuler[0])};}
if(maxEyeError>1e-6)errors.push('eye anchor');if(maxLensError>1e-5)errors.push('actual iris midpoint');if(maxGazeError>1.5)errors.push('explanation gaze direction');if(minExitOpacity<.9999)errors.push('exiting fish opacity');if(!seek.every(x=>x.exact))errors.push('seek');if(finalBridge.anyVisible)errors.push('fish visible at final bridge');if(entryBounds.intersectsScreen)errors.push('spray enters with on-screen pop');if(visibleBounds.some(x=>x.intersectsScreen))errors.push('fish retired on screen');if(firstSprayHidden===null||firstSprayHidden>=10402)errors.push('spray exit too late');if(maxVisibleStep>.11)errors.push('visible heading step');if(maxBoneStep>.11)errors.push('bone step');if(minGroundClearance<.1)errors.push('ground clearance');
const report={pass:!errors.length,errors,asset:file,assetSHA256:createHash('sha256').update(data).digest('hex'),adapterSHA256:createHash('sha256').update(fs.readFileSync('src/FishObserverV19Motion.ts')).digest('hex'),sampledFrames:timeline.duration,maxEyeError,maxLensError,minGroundClearance,maxExplanationGazeError:maxGazeError,maxStepRadians:maxStep,peakFrame,maxVisibleStepRadians:maxVisibleStep,peakVisibleStepFrame,maxBoneStepRadians:maxBoneStep,peakBoneFrame,minExitOpacity,maxTravelSpeed:maxSpeed,firstObserverHidden,firstSprayHidden,entryBounds,visibleBounds,finalBridge,seek,idle,samples,scope:'Actual posed eye midpoint; all frames; camera frustum and actual skinned vertices at retirement; reverse seeks including visibility/opacity; physical motion stylized.'};
fs.writeFileSync(out+'/fish-motion-audit.json',JSON.stringify(report,null,2));fs.writeFileSync(out+'/exit-lifecycle.json',JSON.stringify(lifecycle,null,2));
console.log(JSON.stringify({...report,samples:undefined,finalBridge:undefined},null,2));fish.dispose();world.dispose();if(errors.length)process.exitCode=1;
