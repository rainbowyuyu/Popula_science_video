/** Read-only geometric review of current title placement along the actual camera rail.
 * CPU boxes do not certify GPU occlusion/material beauty. No final render changes.
 */
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';import * as T from 'three';
const root=process.cwd(),out=path.resolve(root,process.argv[2]||'work/v8-native/title-review');fs.mkdirSync(out,{recursive:true});
const runtime=path.join(out,'runtime');fs.mkdirSync(runtime,{recursive:true});
const sources=['src/WorldTypography.ts','src/CameraRail.ts','src/timeline.ts','src/story.json','public/fonts/marine-display.typeface.json'];
const hashes=Object.fromEntries(sources.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
for(const name of ['CameraRail','timeline','WorldTypography']){
 let source=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8');
 source=source.replace(/import story from '\.\/story.json';/,`const story=${fs.readFileSync(path.join(root,'src/story.json'),'utf8')};`)
 .replace(/import fontData from '\.\.\/public\/fonts\/marine-display.typeface.json';/,`const fontData=${fs.readFileSync(path.join(root,'public/fonts/marine-display.typeface.json'),'utf8')};`)
 .replace("from './CameraRail'","from './CameraRail.mjs'").replace("from './timeline'","from './timeline.mjs'");
 fs.writeFileSync(path.join(runtime,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {createWorldTypography}=await import(pathToFileURL(path.join(runtime,'WorldTypography.mjs')).href);
const {sampleCamera}=await import(pathToFileURL(path.join(runtime,'CameraRail.mjs')).href);
const {chapters,durationSeconds}=await import(pathToFileURL(path.join(runtime,'timeline.mjs')).href);
const camera=new T.PerspectiveCamera(50,16/9,.45,15000),scene=new T.Scene();const type=createWorldTypography(scene,camera);
const box=new T.Box3(),frustum=new T.Frustum(),matrix=new T.Matrix4();
const data=new Map(type.anchors.map(a=>[a.name,{...a,samples:[],toggles:[],maxCenterPxPerFrame:0,visibleFrames:0,maxScreenWidth:0,minScreenGlyphHeight:Infinity}]));
// Text geometry is immutable. Compute each slider-local box once rather than
// re-reading every bevel vertex at every frame.
const localBounds=new Map();
for(const a of type.anchors){const object=scene.getObjectByName(a.name),slider=object.children[0];object.updateMatrixWorld(true);const local=new T.Box3().setFromObject(slider,true);local.applyMatrix4(slider.matrixWorld.clone().invert());localBounds.set(a.name,local);}
const prev=new Map();
for(let frame=0;frame<Math.ceil(durationSeconds*30);frame++){
 const t=frame/30,c=sampleCamera(t,chapters);camera.position.fromArray(c.position);camera.lookAt(new T.Vector3(...c.target));camera.fov=c.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);type.update(t,camera);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
 for(const a of type.anchors){
  const item=data.get(a.name),object=scene.getObjectByName(a.name);box.copy(localBounds.get(a.name)).applyMatrix4(object.children[0].matrixWorld);const intersects=frustum.intersectsBox(box);
  const center=box.getCenter(new T.Vector3()).project(camera);const screen={x:(center.x*.5+.5)*1920,y:(.5-center.y*.5)*1080};
  const p=prev.get(a.name);const on=object.visible&&intersects;
  if(p&&p.visible!==object.visible)item.toggles.push({frame,t,visible:object.visible,boxIntersectsFrustum:intersects,previousBoxIntersects:p.intersects});
  if(on){item.visibleFrames++;if(p?.on)item.maxCenterPxPerFrame=Math.max(item.maxCenterPxPerFrame,Math.hypot(screen.x-p.screen.x,screen.y-p.screen.y));
   if(frame%3===0)item.samples.push({frame,screen,depth:center.z});
  }
  prev.set(a.name,{visible:object.visible,intersects,on,screen});
 }
}
// At visibility boundaries inspect the real bevel vertices, not a rotated world
// AABB. AABB corner inflation can intersect the frustum although every letter
// has already left the screen. Report both tests so no result is concealed.
function actualEndpoint(name,frame){
 const t=frame/30,c=sampleCamera(t,chapters);camera.position.fromArray(c.position);camera.lookAt(new T.Vector3(...c.target));camera.fov=c.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);type.update(t,camera);
 const object=scene.getObjectByName(name);let vertexCount=0,onScreenVertexCount=0;const point=new T.Vector3(),projectedBounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
 object.traverse(mesh=>{if(!mesh.isMesh)return;const attr=mesh.geometry.getAttribute('position');for(let i=0;i<attr.count;i++){point.fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld).project(camera);vertexCount++;if(point.z>=-1&&point.z<=1){projectedBounds.minX=Math.min(projectedBounds.minX,point.x);projectedBounds.maxX=Math.max(projectedBounds.maxX,point.x);projectedBounds.minY=Math.min(projectedBounds.minY,point.y);projectedBounds.maxY=Math.max(projectedBounds.maxY,point.y);if(Math.abs(point.x)<=1&&Math.abs(point.y)<=1)onScreenVertexCount++;}}});
 return {frame,time:t,vertexCount,onScreenVertexCount,projectedBounds,allProjectedGeometryOutside:projectedBounds.maxX<-1||projectedBounds.minX>1||projectedBounds.maxY<-1||projectedBounds.minY>1};
}
for(const item of data.values()){
 item.endpointEvidence=item.toggles.map(e=>({eventFrame:e.frame,eventVisible:e.visible,...actualEndpoint(item.name,e.visible?e.frame:e.frame-1)}));
 if(item.start===0)item.endpointEvidence.unshift({eventFrame:0,eventVisible:true,...actualEndpoint(item.name,0)});
}
const readingProbes=[];
function readingProbe(name,frame){
 actualEndpoint(name,frame);const object=scene.getObjectByName(name),lines=[];
 object.children[0].children.forEach((line,index)=>{if(!line.isGroup)return;let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity,behind=0;
  line.traverse(m=>{if(!m.isMesh)return;const attr=m.geometry.getAttribute('position'),p=new T.Vector3();for(let i=0;i<attr.count;i++){p.fromBufferAttribute(attr,i).applyMatrix4(m.matrixWorld).project(camera);if(p.z<-1||p.z>1){behind++;continue;}x0=Math.min(x0,(p.x*.5+.5)*1920);x1=Math.max(x1,(p.x*.5+.5)*1920);y0=Math.min(y0,(.5-p.y*.5)*1080);y1=Math.max(y1,(.5-p.y*.5)*1080);}});
  lines.push({index,bounds:{x0,x1,y0,y1},heightPixels:y1-y0,behind,fullyInside:x0>=0&&x1<=1920&&y0>=0&&y1<=1080,intersectsBrand:x0<570&&x1>40&&y0<130&&y1>25,intersectsSubtitle:y0<1040&&y1>930&&x0<1670&&x1>250});
 });return {name,frame,time:frame/30,visible:object.visible,lines:object.visible?lines:[],hiddenGeometryOmitted:!object.visible};
}
for(const [name,frames] of Object.entries({Opening_title:[120,156,180],Energy_question:[2050,2150],Research_o05:[1540,1730],Research_w03:[3180,3350,3500],Research_c03:[6850,7010],Research_k02:[8800,8850,8900,9000],Next_episode:[10640,10710,10770,10800]}))for(const frame of frames)readingProbes.push(readingProbe(name,frame));
// Complete two-line geometry, one probe per encoded frame. This is geometric
// readability only: actual native-water absorption still needs GPU stills.
const cableReadability=[];let active=null;
for(let frame=8680;frame<=8940;frame++){
 const p=readingProbe('Research_k02',frame),pass=p.visible&&p.lines.length===2&&p.lines.every(l=>l.fullyInside&&!l.intersectsBrand&&!l.intersectsSubtitle&&l.behind===0&&l.heightPixels>=22);
 if(pass){if(!active)active={startFrame:frame,endFrame:frame,minHeightPixels:Infinity};active.endFrame=frame;active.minHeightPixels=Math.min(active.minHeightPixels,...p.lines.map(l=>l.heightPixels));}
 if(!pass&&active){cableReadability.push({...active,durationSeconds:(active.endFrame-active.startFrame+1)/30});active=null;}
}
if(active)cableReadability.push({...active,durationSeconds:(active.endFrame-active.startFrame+1)/30});
const result={sources:hashes,durationSeconds,readingProbes,cableReadability,limitations:['Conservative world AABB/frustum test for timeline samples; exact projected glyph vertices additionally checked at every visibility boundary.','No projected glyph on screen at the visibility toggle does not certify material beauty or scene occlusion; rendered images are required.','Position speed is screen bbox-center movement; camera perspective can inflate offscreen box speed.'],titles:[...data.values()].map(x=>({...x,minScreenGlyphHeight:undefined,maxScreenWidth:undefined,readableSecondsApprox:x.visibleFrames/30}))};
fs.writeFileSync(path.join(out,'world-type-audit.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result.titles.map(({name,readableSecondsApprox,maxCenterPxPerFrame,toggles})=>({name,readableSecondsApprox,maxCenterPxPerFrame,toggles})),null,2));type.dispose();
