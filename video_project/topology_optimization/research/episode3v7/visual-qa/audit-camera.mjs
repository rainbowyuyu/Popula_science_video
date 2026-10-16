import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import * as T from 'three';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'../../..');
const qa=import.meta.dirname;
const sources=['src/episode3v7/World.ts','src/episode3v7/Film.tsx','src/episode3v7/timeline.json','public/episode3v7/models/pavilion-manifest.json','public/episode3v7/models/pavilion-v7.glb','src/episode3v7/StressField.ts'].filter(file=>fs.existsSync(path.join(root,file)));
const provenance=sources.map(file=>({file,mtime:fs.statSync(path.join(root,file)).mtime.toISOString(),sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}));
const source=fs.readFileSync(path.join(root,sources[0]),'utf8');
for(const name of ['World','StressField']){
 const file=path.join(root,`src/episode3v7/${name}.ts`);
 if(!fs.existsSync(file))continue;
 let code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 code=code.replace(/from ['"]\.\/StressField['"]/g,"from './StressField.audit.mjs'");
 fs.writeFileSync(path.join(qa,`${name}.audit.mjs`),code);
}
const {JoineryWorld}=await import(pathToFileURL(path.join(qa,'World.audit.mjs')));
const manifest=JSON.parse(fs.readFileSync(path.join(root,sources[3]),'utf8'));
const timeline=JSON.parse(fs.readFileSync(path.join(root,sources[2]),'utf8'));
const world=Object.create(JoineryWorld.prototype);world.manifest=manifest;world.parts=new Map(manifest.parts.map(info=>[info.id,{info,centroid:new T.Vector3(...info.bbox_three[0]).add(new T.Vector3(...info.bbox_three[1])).multiplyScalar(.5)}]));
if(typeof world.prepareTravel==='function')world.prepareTravel();
const camera=new T.PerspectiveCamera(34,16/9,.035,240);
function stateAt(frame){const i=Math.max(0,timeline.scenes.findIndex(s=>frame>=s.start&&frame<s.end)),s=timeline.scenes[i],clips=timeline.clips.filter(c=>c.scene===s.id),c=clips.filter(c=>frame>=c.start).at(-1)??clips[0];return {scene:s.id,previous:timeline.scenes[i-1]?.id,elapsed:(frame-s.start)/30,duration:(s.end-s.start)/30,progress:Math.min(1,Math.max(0,(frame-s.start)/(s.end-s.start))),time:frame/30,line:c?.line??0,lineProgress:c?Math.min(1,Math.max(0,(frame-c.start)/c.duration)):0};}
function point(p){const q=p.clone().project(camera);return [(q.x+1)*960,(1-q.y)*540,q.z];}
function bbox(info,off){return new T.Box3(new T.Vector3(...info.bbox_three[0]).add(off),new T.Vector3(...info.bbox_three[1]).add(off));}
function corners(box){const a=box.min,b=box.max;return [a.x,b.x].flatMap(x=>[a.y,b.y].flatMap(y=>[a.z,b.z].map(z=>new T.Vector3(x,y,z))));}
const records=[],steps=[],cameraInBounds=[],nearBounds=[],focusRayHits=[],boundaries=[];let prev=null;
for(let frame=0;frame<timeline.duration;frame++){
 const s=stateAt(frame),p=world.blendedPose(s);camera.position.copy(p.position);camera.lookAt(p.target);camera.updateMatrixWorld(true);
 // Match the actual renderer's isolated HIP_FL demonstration. Other corner
 // beams stay seated while that selected beam exits and returns.
 const offsets=new Map(manifest.parts.map(info=>[info.id,world.offset(info,s.scene==='hip'&&s.line===2&&info.id.startsWith('HIP_')&&info.id!=='HIP_FL'?.893:p.q)]));
 const all=[];for(const info of manifest.parts){const off=offsets.get(info.id),box=bbox(info,off);if(box.containsPoint(camera.position))cameraInBounds.push({frame,scene:s.scene,part:info.id,q:p.q,position:camera.position.toArray()});if(box.distanceToPoint(camera.position)<.12)nearBounds.push({frame,scene:s.scene,part:info.id,distance:box.distanceToPoint(camera.position)});all.push({info,box,off});}
 if(prev){let partDelta=0,part='';for(const [id,off]of offsets){const d=off.distanceTo(prev.offsets.get(id));if(d>partDelta){partDelta=d;part=id;}}let partScreen=null;if(part){const centre=world.parts.get(part).centroid;const before=point(centre.clone().add(prev.offsets.get(part))),after=point(centre.clone().add(offsets.get(part)));const visible=v=>v[0]>=0&&v[0]<=1920&&v[1]>=0&&v[1]<=1080&&v[2]>=-1&&v[2]<=1;partScreen={before,after,pixelDelta:Math.hypot(before[0]-after[0],before[1]-after[1]),centreVisible:visible(before)||visible(after)};}steps.push({frame,scene:s.scene,cameraDelta:p.position.distanceTo(prev.p.position),targetDelta:p.target.distanceTo(prev.p.target),partDelta,part,partScreen,qDelta:Math.abs(p.q-prev.p.q)});if(s.scene!==prev.s.scene)boundaries.push({frame,previous:prev.s.scene,scene:s.scene,lastQ:prev.p.q,q:p.q,...steps.at(-1)});}
 if(frame%15===0||timeline.scenes.some(x=>x.start===frame)){
  const demo=manifest.demonstrations[s.scene];let focal=null;
  if(demo){const anchor=s.scene==='bracket'?'POST_FL':s.scene==='hip'?'SUPPORT_X':demo.anchor_part;const focus=new T.Vector3(...demo.focus_three).add(offsets.get(anchor));const ray=new T.Ray(camera.position,focus.clone().sub(camera.position).normalize());const dist=camera.position.distanceTo(focus),hits=[];for(const {info,box}of all){const hit=ray.intersectBox(box,new T.Vector3());if(hit&&camera.position.distanceTo(hit)<dist-.1)hits.push({part:info.id,distance:camera.position.distanceTo(hit),remaining:dist-camera.position.distanceTo(hit)});}hits.sort((a,b)=>a.distance-b.distance);focal={anchor,point:point(focus),hits:hits.slice(0,6)};if(hits.length)focusRayHits.push({frame,scene:s.scene,...focal});}
  const frameBoxes=all.map(({info,box})=>{const pts=corners(box).map(point);return {part:info.id,min:[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1]))],max:[Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]};});
  records.push({frame,scene:s.scene,q:p.q,line:s.line,lineProgress:s.lineProgress,position:p.position.toArray(),target:p.target.toArray(),focal,partBoxes:frameBoxes});
 }
 prev={s,p,offsets};
}
const ranges=items=>{const out=[];for(const x of items){const last=out.at(-1);if(last&&x.frame===last.end+1&&x.part===last.part&&x.scene===last.scene)last.end=x.frame;else out.push({start:x.frame,end:x.frame,part:x.part,scene:x.scene});}return out;};
const summary={provenance,totalFrames:timeline.duration,sceneRanges:timeline.scenes,cameraAabbInside:ranges(cameraInBounds),cameraNearAabb:ranges(nearBounds),boundaries,maxCameraStep:[...steps].sort((a,b)=>b.cameraDelta-a.cameraDelta).slice(0,12),maxPartStep:[...steps].sort((a,b)=>b.partDelta-a.partDelta).slice(0,12),scenePeaks:timeline.scenes.map(s=>({scene:s.id,camera:[...steps].filter(x=>x.scene===s.id).sort((a,b)=>b.cameraDelta-a.cameraDelta)[0],part:[...steps].filter(x=>x.scene===s.id).sort((a,b)=>b.partDelta-a.partDelta)[0]})),focusOcclusionAabbWarnings:focusRayHits.filter(x=>x.frame%90===0),limitations:['AABB broad-phase warnings are conservative and are not proof of triangle intersections.','Camera/offset math is imported from the snapshotted World.ts; no WebGL rendering performed.','Deformations are not applied in broad-phase checks; target and part offset continuity is exact for this source snapshot.']};
fs.writeFileSync(path.join(qa,'camera-audit.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(qa,'camera-frames.json'),JSON.stringify(records));
console.log(JSON.stringify({...summary,focusOcclusionAabbWarnings:summary.focusOcclusionAabbWarnings.slice(0,10)},null,2));
