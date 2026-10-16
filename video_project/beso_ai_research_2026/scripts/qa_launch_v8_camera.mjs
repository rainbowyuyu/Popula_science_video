/** Numerical continuity, animated source clearance, and actual geometry
 * framing. These checks do not certify visual aesthetics or generated media. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Vector3,Quaternion,PerspectiveCamera,Mesh} from 'three';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=path.join(root,'tmp/launch-v8-camera-qa');await fs.mkdir(scratch,{recursive:true});
const sourcePaths=['src/beso/LaunchV8Camera.ts','src/beso/ContinuousLaunchWorldV8.ts','src/beso/NativePlatformV5.ts','public/beso-research/physics/native-model.json','public/beso-research/physics/zwind-response.json'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const records=await Promise.all(sourcePaths.map(async file=>({file,sha256:sha(await fs.readFile(path.join(root,file)))})));
await build({entryPoints:[path.join(root,sourcePaths[0]),path.join(root,sourcePaths[2])],outdir:scratch,bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',outExtension:{'.js':'.mjs'},logLevel:'silent'});
const {V8_CAMERA_KEYS:keys,V8_CAMERA_SHOTS:shots,sampleV8Camera:sample}=await import(pathToFileURL(path.join(scratch,'LaunchV8Camera.mjs')).href+'?audit='+Date.now());
const {NativePlatformV5}=await import(pathToFileURL(path.join(scratch,'NativePlatformV5.mjs')).href+'?audit='+Date.now());
const model=JSON.parse(await fs.readFile(path.join(root,sourcePaths[3]),'utf8'));
const response=JSON.parse(await fs.readFile(path.join(root,sourcePaths[4]),'utf8'));
const sourceVector=a=>new Vector3(a[0]??0,a[2]??0,-(a[1]??0));
const pivot=sourceVector(model.nodes['1']);
const clamp=x=>Math.max(0,Math.min(1,x));
const savedAt=seconds=>{const all=response.records,t=Math.max(all[0].t,Math.min(all.at(-1).t,seconds));let lo=0,hi=all.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(all[mid].t<=t)lo=mid;else hi=mid;}const a=all[lo],b=all[hi],q=clamp((t-a.t)/(b.t-a.t));return {t,platform:a.platform.map((v,i)=>v+(b.platform[i]-v)*q),towerTop:a.towerTop.map((v,i)=>v+(b.towerTop[i]-v)*q)};};
const nativeQuaternion=d=>{const axis=new Vector3(d[3]??0,d[5]??0,-(d[4]??0)),angle=axis.length();return angle>1e-12?new Quaternion().setFromAxisAngle(axis.multiplyScalar(1/angle),angle):new Quaternion();};
const pointSegmentDistance=(p,a,b)=>{const ab=b.clone().sub(a),q=clamp(p.clone().sub(a).dot(ab)/ab.lengthSq());return p.distanceTo(a.clone().addScaledVector(ab,q));};
const limits={minimumCameraTargetDistanceM:1,maximumSingleFrameStepM:20,maximumLookDirectionStepDegrees:2,firstDerivativeResidualMPerS:.06,minimumConservativeGeometryClearanceM:.5};
const failures=[],samples=[];let previous;
let minDistance={value:Infinity,frame:0},minClearance={value:Infinity,frame:0,member:null},maxStep={value:0,frame:0},maxTargetStep={value:0,frame:0},maxAngle={value:0,frame:0},maxFovStep={value:0,frame:0};
const maximum=(record,value,frame)=>value>record.value?{value,frame}:record;
for(let frame=0;frame<6300;frame++){
 const time=frame/60,pose=sample(time);if(![...pose.position.toArray(),...pose.target.toArray(),pose.fov].every(Number.isFinite)){failures.push({type:'nonfinite',frame});continue;}
 const distance=pose.position.distanceTo(pose.target);if(distance<minDistance.value)minDistance={value:distance,frame};if(distance<limits.minimumCameraTargetDistanceM)failures.push({type:'target_collision',frame,distance});
 const saved=savedAt(120*clamp((time-40)/13)),rotation=nativeQuaternion(saved.platform),shift=sourceVector(saved.platform).add(pivot);
 const transform=p=>p.clone().sub(pivot).applyQuaternion(rotation).add(shift);
 const caps=model.elements.map(el=>({id:el.id,a:transform(sourceVector(model.nodes[String(el.from)])),b:transform(sourceVector(model.nodes[String(el.to)])),radius:el.diameterM?el.diameterM*.60:Math.hypot(el.widthM??1,el.heightM??1)*.55}));
 const top=new Vector3(0,model.tower.baseZM+model.tower.lengthM,0).add(sourceVector(saved.towerTop));
 // The tower skin uses a Hermite curve constrained by both saved endpoints.
 // Twelve segments conservatively cover its actual bent centreline.
 const up=new Vector3(0,1,0).applyQuaternion(rotation),topUp=new Vector3(0,1,0).applyQuaternion(nativeQuaternion(saved.towerTop));
 const center=q=>{const q2=q*q,q3=q2*q,L=model.tower.lengthM;return shift.clone().multiplyScalar(2*q3-3*q2+1).addScaledVector(up,L*(q3-2*q2+q)).addScaledVector(top,-2*q3+3*q2).addScaledVector(topUp,L*(q3-q2));};
 for(let i=0;i<12;i++)caps.push({id:'tower-'+i,a:center(i/12),b:center((i+1)/12),radius:5.65});
 const nearest=caps.reduce((old,c)=>{const clearance=pointSegmentDistance(pose.position,c.a,c.b)-c.radius;return clearance<old.clearance?{clearance,member:c.id}:old;},{clearance:Infinity,member:null});
 if(nearest.clearance<minClearance.value)minClearance={value:nearest.clearance,frame,member:nearest.member};if(nearest.clearance<limits.minimumConservativeGeometryClearanceM)failures.push({type:'conservative_geometry_collision',frame,...nearest});
 let step=0,targetStep=0,angle=0,fovStep=0;
 if(previous){step=pose.position.distanceTo(previous.position);targetStep=pose.target.distanceTo(previous.target);fovStep=Math.abs(pose.fov-previous.fov);angle=Math.acos(Math.max(-1,Math.min(1,pose.target.clone().sub(pose.position).normalize().dot(previous.target.clone().sub(previous.position).normalize()))))*180/Math.PI;maxStep=maximum(maxStep,step,frame);maxTargetStep=maximum(maxTargetStep,targetStep,frame);maxAngle=maximum(maxAngle,angle,frame);maxFovStep=maximum(maxFovStep,fovStep,frame);if(Math.max(step,targetStep)>limits.maximumSingleFrameStepM||angle>limits.maximumLookDirectionStepDegrees)failures.push({type:'frame_jump',frame,step,targetStep,angle});}
 samples.push({frame,time,phase:pose.phase,position:pose.position.toArray(),target:pose.target.toArray(),fov:pose.fov,step,targetStep,angle,clearance:nearest.clearance});previous=pose;
}
const derivatives=keys.filter(k=>k.t>0&&k.t<105).map(key=>{const h=1e-4,a=sample(key.t-h),b=sample(key.t),c=sample(key.t+h);const channels={};for(const name of ['position','target']){const left=b[name].clone().sub(a[name]).divideScalar(h),right=c[name].clone().sub(b[name]).divideScalar(h);channels[name]={residual:left.distanceTo(right)};if(channels[name].residual>limits.firstDerivativeResidualMPerS)failures.push({type:'C1_failure',time:key.t,channel:name,residual:channels[name].residual});}return {time:key.t,...channels};});
const native=new NativePlatformV5(model,response),camera=new PerspectiveCamera(43,16/9,.2,30000);
const projectAt=(time)=>{const p=sample(time);camera.position.copy(p.position);camera.fov=p.fov;camera.setViewOffset(1920,1080,p.viewOffsetX??0,0,1920,1080);camera.updateProjectionMatrix();camera.lookAt(p.target);camera.updateMatrixWorld();native.setTime(120*clamp((time-40)/13),false);native.group.updateMatrixWorld(true);
 const bounds={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity,behind:0,vertices:0};
 const vertex=new Vector3();for(const group of [native.platform,native.tower,native.nacelle])group.traverse(object=>{if(!(object instanceof Mesh)||!object.visible)return;const positions=object.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){vertex.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld).project(camera);const x=(vertex.x+1)*960,y=(1-vertex.y)*540;bounds.x0=Math.min(bounds.x0,x);bounds.x1=Math.max(bounds.x1,x);bounds.y0=Math.min(bounds.y0,y);bounds.y1=Math.max(bounds.y1,y);bounds.behind+=Number(vertex.z>1);bounds.vertices++;}});
 const anchors=Object.fromEntries(Object.entries(native.getCalloutAnchors()).map(([id,a])=>{const ndc=a.object.getWorldPosition(new Vector3()).project(camera);return[id,{x:(ndc.x+1)*960,y:(1-ndc.y)*540,depth:ndc.z}];}));return{time,fov:p.fov,bounds,anchors};};
const framing=[0,5,11,16,23,25,28,30,31,34,37,39,40,44,45,47.5,49,53,58,65,68,72,76,79,85,89,95,98.3333,100,103,104.9833].map(projectAt);
const closingChecks=framing.filter(f=>f.time>=98.3333).map(f=>({time:f.time,bounds:f.bounds,pass:f.bounds.behind===0&&f.bounds.x0>=875&&f.bounds.x1<=1900&&f.bounds.y0>=70&&f.bounds.y1<=990}));
for(const check of closingChecks)if(!check.pass)failures.push({type:'closing_envelope_or_layout',...check});
native.dispose();
const sourceUnchanged=(await Promise.all(records.map(async r=>r.sha256===sha(await fs.readFile(path.join(root,r.file)))))).every(Boolean);if(!sourceUnchanged)failures.push({type:'source_changed_during_audit'});
const report={schema:'launch-v8-camera-qa-v1',checked:new Date().toISOString(),sources:records,sourceUnchanged,fps:60,frameCount:6300,limits,minDistance,minClearance,maxStep,maxTargetStep,maxAngle,maxFovStep,derivatives,boundaries:shots.slice(1).map(s=>({phase:s.phase,time:s.start,samples:samples.slice(s.start*60-1,s.start*60+2)})),framing,closingChecks,failures,pass:!failures.length,limitation:'Clearance checks cover conservative hull capsules and the saved-response-constrained tower centreline. Framing projects actual NativePlatform mesh vertices, but does not certify material quality, occlusion, typography or WAN clip continuity. No new solver or CFD is run.'};
const out=path.join(root,'research/qa');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'launch-v8-camera.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(path.join(out,'launch-v8-camera-samples.json'),JSON.stringify({fps:60,frameCount:6300,samples})+'\n');
console.log(JSON.stringify({pass:report.pass,minDistance,minClearance,maxStep,maxTargetStep,maxAngle,maxFovStep,closingChecks,failureCount:failures.length,failures:failures.slice(0,12)},null,2));if(!report.pass)process.exitCode=1;
