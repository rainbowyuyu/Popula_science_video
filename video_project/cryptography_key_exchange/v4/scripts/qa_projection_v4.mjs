/** Conservative 2D bounds audit. Does not claim ray-traced occlusion or render acceptance. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as T from 'three';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'work/qa/projection-v4-compiled');
fs.mkdirSync(out,{recursive:true});
const program=ts.createProgram([path.join(root,'src/Camera.ts')],{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,rootDir:path.join(root,'src'),outDir:out,strict:true,esModuleInterop:true,resolveJsonModule:true,skipLibCheck:true,noEmitOnError:true});
if(ts.getPreEmitDiagnostics(program).some(d=>d.category===ts.DiagnosticCategory.Error)||program.emit().emitSkipped)throw new Error('Camera compilation failed');
fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({type:'commonjs'}));
const req=createRequire(import.meta.url),{sampleCamera}=req(path.join(out,'Camera.js')),{timeline,cue,phase,ease,wordProgress,wordTime}=req(path.join(out,'Timeline.js'));
const dims=JSON.parse(fs.readFileSync(path.join(root,'docs/models-validation.json'),'utf8')).assets;
const cam=new T.PerspectiveCamera(41,16/9,.05,180),after=(id,t,d=1.4)=>ease((t-cue(id).startSec)/d),between=(id,end,t)=>after(id,t)*(1-after(end,t));
const round=x=>Math.round(x*10)/10,area=b=>Math.max(0,b.right-b.left)*Math.max(0,b.bottom-b.top);
const intersect=(a,b)=>({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});
function project(name,center,bounds,{scale=1,billboard=false,rotation=[0,0,0]}={}){
 const p=new T.Vector3(...center),q=billboard?cam.quaternion:new T.Quaternion().setFromEuler(new T.Euler(...rotation)),matrix=new T.Matrix4().compose(p,q,new T.Vector3(scale,scale,scale)),corners=[];
 for(const x of[bounds[0][0],bounds[1][0]])for(const y of[bounds[0][1],bounds[1][1]])for(const z of[bounds[0][2],bounds[1][2]])corners.push(new T.Vector3(x,y,z).applyMatrix4(matrix).project(cam));
 const b={left:Math.min(...corners.map(p=>(p.x+1)*960)),right:Math.max(...corners.map(p=>(p.x+1)*960)),top:Math.min(...corners.map(p=>(1-p.y)*540)),bottom:Math.max(...corners.map(p=>(1-p.y)*540))};
 return{name,bounds:Object.fromEntries(Object.entries(b).map(([k,v])=>[k,round(v)])),widthPx:round(b.right-b.left),heightPx:round(b.bottom-b.top),insideScreen:b.left>=0&&b.right<=1920&&b.top>=0&&b.bottom<=1080,insideSafe:b.left>=64&&b.right<=1856&&b.top>=100&&b.bottom<=950,worldCenter:center};
}
const panel=(name,center,w,h,scale)=>project(name,center,[[-w/2,-h/2,-.07],[w/2,h/2,.1]],{billboard:true,scale});
const model=(name,center,scale,rotation=[0,0,0])=>project(name,center,dims.find(d=>d.path===`public/models/${name}.glb`).boundsXYZ,{scale,rotation});
function snapshot(t){
 const p=sampleCamera(t);cam.position.set(...p.position);cam.lookAt(...p.target);cam.fov=p.fov;cam.updateProjectionMatrix();cam.updateMatrixWorld(true);
 const objects=[],c=timeline.cues.find(c=>t>=c.startSec&&t<c.endSec),id=c?.id;
 const open=after('s04',t,2.7),finish=after('s34',t,3),experiment=after('s12',t,2.2)*(1-after('s24',t,2.5));
 objects.push(model('phone',[-5.5-4*experiment,.4+2.6*open*(1-finish),1.2],40*(1-.22*experiment),[.95*open*(1-finish),0,-.06+.04*open]));
 objects.push(model('server',[7.8+2.8*experiment,.1,-1],14*(1-.18*experiment)));
 if(id&&id>='s05'&&id<='s10')objects.push(panel('cipher-or-order',[-3.6,4-16*(1-between('s05','s11',t)),5.8],4.6,2.6,1.4));
 const received=wordProgress('s07','还原',t,1.4)*(1-after('s08',t));if(received>.99)objects.push(panel('received',[6.5,4,6.2],4.6,2.6,1.4));
 const observed=between('s05','s07',t);if(observed>.99)objects.push(panel('witness',[3.6,2.8,8.4],4.4,2.6,1.3));
 const keys=between('s08','s11',t)+between('s28','s34',t);if(keys>.99)for(let i=0;i<2;i++){const attempt=phase('s10',t),x=i?7.5:id==='s10'?-7.5+6*Math.sin(Math.PI*attempt):-7.5,z=id==='s10'&&i===0?.9+4*Math.sin(Math.PI*attempt):6.5;objects.push(panel(i?'key-right':'key-left',[x,6.3,z],1.15,1.18,1));}
 if(between('s25','s28',t)>.99){objects.push(panel('certificate',[1,4.1,6.8],4.8,3.7,1.35));objects.push(panel('identity-key',[7.3,3.5,6.8],1.15,1.18,1.1));objects.push(panel('identity-label',[7.3,2.4,6.8],2.3,.4,1.1));}
 const fake=between('s24','s25',t)+between('s26','s27',t),reject=wordProgress('s26','拿不到',t,3.2);if(fake>.99&&reject<1)objects.push(panel('fake',[-6.2-18*reject,3.6,7],3.2,2.2,1.2));
 const bad=wordProgress('s29','改动',t,1.5)*(1-after('s32',t)),rejectBad=wordProgress('s30','拒收',t,4);if(bad>.99&&rejectBad<1)objects.push(panel('tamper',[2+12*rejectBad,3.4,7+3*rejectBad],4.6,2.6,1.6));
 const delivery=between('s28','s32',t);if(delivery>.99){const returnLeft=after('s29',t,2.3);objects.push(panel('delivery-cipher',[t>=cue('s29').startSec?3-8.4*returnLeft:-3+6*phase('s28',t),3.8,6.5],4.6,2.6,t>=cue('s29').startSec?1.6-.35*returnLeft:1.6));}
 if(t>=cue('s31').startSec&&t<cue('s34').startSec+2.4){const a=after('s31',t,1.8)*(1-after('s34',t));if(a>.99)objects.push(panel('received-final',[5.8,3.6,6.7],4.6,2.6,1.5));}
 if(after('s32',t,3)>.99)objects.push(model('cake',[3,.13,0],25,[0,t*.03,0]));
 if(id&&id>='s12'&&id<='s23'){
  for(const x of[-4,4]){objects.push(panel(x<0?'phone-endpoint-label':'shop-endpoint-label',[x,.35,2.05],3.5,.65,1));}
 }
 const overlaps=[];for(const a of objects)for(const b of objects){if(a===b)continue;const hit=intersect(a.bounds,b.bounds),ratio=area(hit)/area(b.bounds);if(ratio>.15&&['cipher-or-order','received-final','certificate','tamper','delivery-cipher','fake'].includes(a.name))overlaps.push({foregroundCandidate:a.name,obscuredCandidate:b.name,projectedBoundsOverlapFraction:round(ratio)});}
 return{id,t:round(t),frame:Math.round(t*30),objects,overlaps};
}
const snapshots=[];for(const c of timeline.cues)for(const q of[.3,.55,.8])snapshots.push(snapshot(c.startSec+(c.endSec-c.startSec)*q));
const report={scope:'Conservative camera-projected object AABBs from source snapshot; approximate stable object states, not ray occlusion or visual acceptance. Cue timings are provisional while audio regenerates.',hashes:Object.fromEntries(['src/World.ts','src/Camera.ts','src/Film.tsx','src/timeline-data.json'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),snapshots};
fs.writeFileSync(path.join(root,'work/qa/projection-v4.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(snapshots.filter(s=>['s08','s09','s31','s32','s33'].includes(s.id)).map(s=>({id:s.id,frame:s.frame,objects:s.objects.map(o=>({name:o.name,bounds:o.bounds,insideSafe:o.insideSafe})),overlaps:s.overlaps})),null,2));
