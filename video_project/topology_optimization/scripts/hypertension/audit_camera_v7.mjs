import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as T from 'three';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const tl=JSON.parse(fs.readFileSync(path.join(root,'src/hypertension/timeline.json'),'utf8'));
const physics=JSON.parse(fs.readFileSync(path.join(root,'public/hypertension/physics.json'),'utf8'));
const generated=path.join(root,'tmp/hypertension-v7-audit-world.mjs');
const files=[];
for(const name of ['CameraPath','VascularDetail','World']){
 const source=fs.readFileSync(path.join(root,`src/hypertension/${name}.ts`),'utf8').replace("import timeline from './timeline.json';",`const timeline=${JSON.stringify(tl)};`).replace("'./CameraPath'","'./hypertension-v7-audit-CameraPath.mjs'").replace("'./VascularDetail'","'./hypertension-v7-audit-VascularDetail.mjs'");
 const out=name==='World'?generated:path.join(root,`tmp/hypertension-v7-audit-${name}.mjs`);files.push(out);
 fs.writeFileSync(out,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
try{
 const {HypertensionWorld}=await import(pathToFileURL(generated).href);
 const w=Object.create(HypertensionWorld.prototype);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/hypertension/models/asset-manifest.json'),'utf8'));
 const bodyBounds=manifest.groups.bodySurface.bounds,scale=6.85/(bodyBounds[1][1]-bodyBounds[0][1]);
 w.anchors={};for(const name of ['heart','leftKidney','brain','liver','bodySurface']){const v=manifest.groups[name].center;w.anchors[name]=new T.Vector3(v[0]*scale,(v[1]-bodyBounds[0][1])*scale+.08,v[2]*scale);}
 w.anchors.body=w.anchors.bodySurface.clone();w.anchors.vessel=new T.Vector3(.033008,4.80,.007975);
 w.anchors.arteriole=w.anchors.leftKidney.clone().add(new T.Vector3(-.068+.00048*Math.cos(.16),.026+.00048*Math.sin(.16),.092));
 w.anchors.lipoprotein=w.anchors.liver.clone().add(new T.Vector3(.0025*Math.cos(-.06)-.002*Math.sin(-.06),.012+.0025*Math.sin(-.06)+.002*Math.cos(-.06),.17));
 // Execute the production builder to derive the four actual world-space
 // renal targets. This catches changes to position, scale and rotation;
 // camera fallback coordinates cannot make a stale audit pass.
 w.bodyRoot=new T.Group();w.signals=[];w.buildKidneyDiagram();
 for(const name of ['nephronFocus','nephronFilter','nephronTubule','nephronDrain']){
  const anchor=w.anchors[name];if(!anchor||![anchor.x,anchor.y,anchor.z].every(Number.isFinite))throw new Error(`Missing production renal anchor: ${name}`);
 }
 // The instrument screen needs a browser canvas; it does not define either
 // arm anchor. Build the production mannequin with that screen builder skipped.
 w.measureRoot=new T.Group();w.measureRoot.position.x=12;
 const buildMonitor=w.buildMonitor;w.buildMonitor=()=>{};
 w.buildMeasure();w.buildMonitor=buildMonitor;
 for(const name of ['measureCuff','measureForearm']){
  const anchor=w.anchors[name];if(!anchor||![anchor.x,anchor.y,anchor.z].every(Number.isFinite))throw new Error(`Missing production measurement anchor: ${name}`);
 }
 const measurementPoints=[];
 for(const name of ['measurement-upper-arm-cuff','measurement-forearm']){
  const object=w.measureRoot.getObjectByName(name);if(!object)throw new Error(`Missing production measurement object: ${name}`);
  const box=new T.Box3().setFromObject(object);
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])measurementPoints.push(new T.Vector3(x,y,z));
 }
 measurementPoints.push(w.anchors.measureElbow.clone());
 w.camera=new T.PerspectiveCamera(34,16/9);w.scene=new T.Scene();
 for(const name of ['key','fill']){const light=new T.DirectionalLight();light.name=name;w.scene.add(light);}
 w.physics=physics;w.vessel={length:1.72};w.flowPhase=new Float64Array(tl.duration+2);w.integrateFlow();
 const stateAt=(frame)=>{const i=tl.scenes.findIndex(s=>frame>=s.start&&frame<s.end),s=tl.scenes[i],clips=tl.clips.filter(c=>c.scene===s.id),c=clips.filter(c=>frame>=c.start).at(-1)??clips[0];return {scene:s.id,previous:tl.scenes[i-1]?.id,elapsed:(frame-s.start)/30,duration:(s.end-s.start)/30,progress:(frame-s.start)/(s.end-s.start),time:frame/30,line:c?.line??0,lineProgress:c?Math.max(0,Math.min(1,(frame-c.start)/c.duration)):0};};
 const rows=[],measurementProjection=[];let prior;let maxMove={frame:0,value:0},maxAngle={frame:0,value:0},maxRelativeMove={frame:0,value:0},maxRelativeAcceleration={frame:0,value:0};
 for(let f=0;f<tl.duration;f++){
  const s=stateAt(f);w.cameraAt(s);const p=w.camera.position.clone(),q=w.camera.quaternion.clone();
  const focusDistance=w.cameraPath.at(s.time).distance;
  if(f>=8554&&f<=9123){
   w.camera.updateMatrixWorld(true);const projected=measurementPoints.map(v=>v.clone().project(w.camera));
   measurementProjection.push({frame:f,minX:Math.min(...projected.map(p=>(p.x+1)*960)),maxX:Math.max(...projected.map(p=>(p.x+1)*960)),minY:Math.min(...projected.map(p=>(1-p.y)*540)),maxY:Math.max(...projected.map(p=>(1-p.y)*540)),clipped:projected.some(p=>Math.abs(p.x)>=1||Math.abs(p.y)>=1||p.z<=-1||p.z>=1)});
  }
  if(prior){const delta=p.clone().sub(prior.p),distance=delta.length(),angle=q.angleTo(prior.q),relative=distance/focusDistance,acceleration=prior.delta?delta.clone().sub(prior.delta).length()/focusDistance:0;if(distance>maxMove.value)maxMove={frame:f,value:distance};if(angle>maxAngle.value)maxAngle={frame:f,value:angle};if(relative>maxRelativeMove.value)maxRelativeMove={frame:f,value:relative};if(acceleration>maxRelativeAcceleration.value)maxRelativeAcceleration={frame:f,value:acceleration};rows.push({frame:f,distance,relativeMove:relative,relativeAcceleration:acceleration,angleRadians:angle,logDollyRatePerSecond:30*Math.log(focusDistance/prior.focusDistance),phaseAdvance:w.flowPhase[f]-w.flowPhase[f-1]});prior={p,q,delta,focusDistance};}
  else prior={p,q,delta:null,focusDistance};
 }
 const boundaries=tl.scenes.slice(1).map(s=>({scene:s.id,frame:s.start,...rows[s.start-1]}));
 const phaseMin=Math.min(...rows.map(r=>r.phaseAdvance)),phaseMax=Math.max(...rows.map(r=>r.phaseAdvance));
 const discontinuities=rows.filter(b=>b.relativeMove>.15||b.relativeAcceleration>.022||b.angleRadians>.025);
 const ranges=[['arteriole-entry',2829,3100],['nephron-entry',4025,4401],['liver-entry',6805,7110],['plaque-exit',8011,8180],['cuff-entry-and-return',8554,9123]];
 const pacing=ranges.map(([name,start,end])=>{
  const inRange=rows.filter(r=>r.frame>=start&&r.frame<=end);
  const max=(key,abs=false)=>inRange.reduce((a,b)=>(abs?Math.abs(a[key]):a[key])>(abs?Math.abs(b[key]):b[key])?a:b);
  return {name,start,end,maxNormalizedMove:{frame:max('relativeMove').frame,value:max('relativeMove').relativeMove},maxNormalizedAcceleration:{frame:max('relativeAcceleration').frame,value:max('relativeAcceleration').relativeAcceleration},maxAngularVelocityRadPerSecond:{frame:max('angleRadians').frame,value:max('angleRadians').angleRadians*30},maxAbsoluteLogDollyRatePerSecond:{frame:max('logDollyRatePerSecond',true).frame,value:Math.abs(max('logDollyRatePerSecond',true).logDollyRatePerSecond)}};
 });
 const sourceHashes=Object.fromEntries(['src/hypertension/CameraPath.ts','src/hypertension/World.ts','src/hypertension/VascularDetail.ts','src/hypertension/timeline.json','public/hypertension/physics.json'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
 const measurementFraming={frames:[8554,9123],scope:'Projected world bounding-box corners of the actual cuff group and forearm, plus elbow center; does not test occlusion or annotation overlap',bounds:{minX:Math.min(...measurementProjection.map(p=>p.minX)),maxX:Math.max(...measurementProjection.map(p=>p.maxX)),minY:Math.min(...measurementProjection.map(p=>p.minY)),maxY:Math.max(...measurementProjection.map(p=>p.maxY))},clippedFrames:measurementProjection.filter(p=>p.clipped).map(p=>p.frame)};
 const report={frames:tl.duration,scope:'Every timeline frame evaluated through production cameraAt: scale-normalized movement, acceleration, orientation and particle phase. Static-frame and encoded visual inspection remain separate.',anchorSource:{anatomy:'Current asset-manifest.json bounds in production atlas normalization',nephron:'Executed current World.buildKidneyDiagram and its Object3D.localToWorld targets; not CameraPath fallback coordinates',measurement:'Executed current World.buildMeasure with only the instrument canvas builder stubbed; actual cuff and forearm anchors'},sourceHashes,maxMove,maxAngle,maxAngularVelocityRadiansPerSecond:maxAngle.value*30,maxRelativeMove,maxRelativeAcceleration,pacing,measurementFraming,boundaries,phaseMin,phaseMax,negativePhaseSteps:rows.filter(r=>r.phaseAdvance<=0).length,boundaryDiscontinuities:discontinuities,anchors:w.anchors,cameraKnotCount:w.cameraPath.knots.length,passed:discontinuities.length===0&&phaseMin>0&&measurementFraming.clippedFrames.length===0};
 fs.writeFileSync(path.join(root,'research/hypertension/camera-v7-audit.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,maxMove,maxAngle,maxRelativeMove,maxRelativeAcceleration,phaseMin,phaseMax,boundaryDiscontinuities:discontinuities.slice(0,8)},null,2));
 if(!report.passed)process.exitCode=1;
}finally{for(const f of files)fs.unlinkSync(f);}
