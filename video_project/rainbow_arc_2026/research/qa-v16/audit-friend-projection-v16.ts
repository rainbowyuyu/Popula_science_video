/** Independent read-only camera-space skin bounds, using the live V16 world. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {WorldV10} from '../../src/WorldV10';import {FishObserverV16} from '../../src/FishObserverV16';
import {stateAt} from '../../src/Timeline';import {sampleFilmCamera} from '../../src/CinematicRouteV10';

const out='research/qa-v16',assetPath='public/assets_v16/characters/rainbow_fish_v16.glb';fs.mkdirSync(out,{recursive:true});
const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sourceFiles=['src/WorldV10.ts','src/FishObserverV16.ts','src/FishMotionV14.ts','src/CinematicRouteV10.ts','src/CameraPathV06.ts','src/Timeline.ts','src/timeline.json','src/V11RainbowArcFilm.tsx',assetPath];
const sources=sourceFiles.map(path=>({path,sha256:hash(path)}));
const bytes=fs.readFileSync(assetPath),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1920/1080,.025,180);
const world=new WorldV10(undefined,scene),actors=new FishObserverV16(gltf.scene,gltf.animations).attach(world);
const groups=[world.observer,world.friend],roles=['observer','friend'];
type Support={mesh:T.SkinnedMesh;bones:{index:number;box:T.Box3}[]};
const supports=groups.map(group=>{
 const result:Support[]=[];group.traverse(o=>{if(!(o as T.SkinnedMesh).isSkinnedMesh)return;
  const mesh=o as T.SkinnedMesh,geometry=mesh.geometry,pos=geometry.attributes.position;
  const weights=geometry.attributes.skinWeight,indices=geometry.attributes.skinIndex;
  const boxes=new Map<number,T.Box3>();const p=new T.Vector3();
  for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i);for(let k=0;k<4;k++){
   if(weights.getComponent(i,k)<=0)continue;const index=indices.getComponent(i,k);
   if(!boxes.has(index))boxes.set(index,new T.Box3());boxes.get(index)!.expandByPoint(p);
  }}result.push({mesh,bones:[...boxes].map(([index,box])=>({index,box}))});
 });return result;
});
const corners=(b:T.Box3)=>[0,1,2,3,4,5,6,7].map(i=>new T.Vector3(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z));
const visible=(mesh:T.Object3D)=>{for(let o:T.Object3D|null=mesh;o;o=o.parent)if(!o.visible)return false;return true};
function projected(group:T.Group,index:number){
 const points:T.Vector3[]=[],activeMeshes:string[]=[];let maxOpacity=0;
 for(const s of supports[index]){
  const materials=Array.isArray(s.mesh.material)?s.mesh.material:[s.mesh.material];const opacity=Math.max(...materials.map(m=>m.opacity));
  maxOpacity=Math.max(maxOpacity,opacity);if(!visible(s.mesh)||opacity<.05)continue;activeMeshes.push(s.mesh.name);
  for(const b of s.bones){
   // Weighted skin position is a convex combination of these transformed
   // positive-weight support regions. Their union AABB conservatively bounds
   // the actual skin, without sampling vertices or rigid-body approximations.
   const matrix=s.mesh.matrixWorld.clone().multiply(s.mesh.bindMatrixInverse)
    .multiply(s.mesh.skeleton.bones[b.index].matrixWorld).multiply(s.mesh.skeleton.boneInverses[b.index]).multiply(s.mesh.bindMatrix);
   for(const p of corners(b.box)){p.applyMatrix4(matrix).project(camera);points.push(p)}
  }
 }
 const eye=group.getObjectByName(`optical-eye-reference-${roles[index]}`)!.getWorldPosition(new T.Vector3()).project(camera);
 if(!points.length)return {renderVisible:false,maxOpacity,eye:{x:(eye.x*.5+.5)*1920,y:(.5-eye.y*.5)*1080,z:eye.z},bounds:null,activeMeshes};
 const xs=points.map(p=>(p.x*.5+.5)*1920),ys=points.map(p=>(.5-p.y*.5)*1080);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const clipped={minX:Math.max(0,minX),maxX:Math.min(1920,maxX),minY:Math.max(0,minY),maxY:Math.min(1080,maxY)};
 const width=Math.max(0,clipped.maxX-clipped.minX),height=Math.max(0,clipped.maxY-clipped.minY);
 return {renderVisible:true,maxOpacity,eye:{x:(eye.x*.5+.5)*1920,y:(.5-eye.y*.5)*1080,z:eye.z},bounds:{minX,maxX,minY,maxY,width:maxX-minX,height:maxY-minY,clipped,clippedWidth:width,clippedHeight:height},activeMeshes};
}
const rows:any[]=[];const warnings:any[]=[];let bothLargeCount=0,minGap=Infinity,worst:any=null,validationMaxEscape=0,validatedFrames=0;
for(let frame=7550;frame<=8740;frame++){
 world.update(stateAt(frame));const sample=sampleFilmCamera(frame);camera.position.set(...sample.position);camera.quaternion.copy(sample.quaternion);
 const t=frame/30,bank=.0028*Math.sin(t*.17)+.0014*Math.sin(t*.053+1.2);
 camera.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),bank));camera.fov=sample.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 actors.update(frame,camera);scene.updateMatrixWorld(true);
 const a=projected(groups[0],0),b=projected(groups[1],1),A=a.bounds,B=b.bounds;
 const bothLarge=!!(A&&B&&a.maxOpacity>=.10&&b.maxOpacity>=.10&&A.clippedWidth>=40&&A.clippedHeight>=40&&B.clippedWidth>=40&&B.clippedHeight>=40);
 const eyeDistance=Math.hypot(a.eye.x-b.eye.x,a.eye.y-b.eye.y);
 let horizontalGap:number|null=null,verticalGap:number|null=null,conservativeOverlap=false;
 if(A&&B){horizontalGap=Math.max(A.minX-B.maxX,B.minX-A.maxX);verticalGap=Math.max(A.minY-B.maxY,B.minY-A.maxY);conservativeOverlap=horizontalGap<0&&verticalGap<0;}
 if(bothLarge){bothLargeCount++;const gap=Math.max(horizontalGap!,verticalGap!);if(gap<minGap){minGap=gap;worst={frame,gap,eyeDistance,observer:a,friend:b}}
  if(conservativeOverlap)warnings.push({frame,horizontalGap,verticalGap,eyeDistance,interpretation:'Conservative support boxes overlap. Requires actual silhouette/render review, not proof of mesh collision.'});
 }
 // Independent exact skinned-vertex spot validation checks the conservative
 // support construction, with all vertices at these frames (not a sparse skin).
 if(frame===7550||frame===8740||frame%60===0){validatedFrames++;
  [a,b].forEach((record,k)=>{if(!record.bounds)return;const R=record.bounds;
   for(const s of supports[k]){if(!record.activeMeshes.includes(s.mesh.name))continue;
    for(let i=0;i<s.mesh.geometry.attributes.position.count;i++){
     const p=s.mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(s.mesh.matrixWorld).project(camera);
     const x=(p.x*.5+.5)*1920,y=(.5-p.y*.5)*1080;
     validationMaxEscape=Math.max(validationMaxEscape,R.minX-x,x-R.maxX,R.minY-y,y-R.maxY,0);
    }
   }
  });
 }
 rows.push({frame,scene:stateAt(frame).scene,camera:{position:sample.position,target:sample.target,fov:sample.fov,bankRad:bank},observer:a,friend:b,bothLarge,eyeDistancePx:eyeDistance,horizontalGapPx:horizontalGap,verticalGapPx:verticalGap,conservativeOverlap});
}
assert.ok(validationMaxEscape<1e-4,'support bounds do not contain exact skin');
for(const source of sources)assert.equal(hash(source.path),source.sha256,'source changed during read-only audit');
const summary={version:'V16',scope:'All integer frames7550..8740 inclusive; live WorldV10, FishObserverV16 and CinematicRouteV10 with Stage bank, world→camera→actors order',
 status:warnings.length?'requires-actual-silhouette-review':'pass-camera-space-conservative-separation',frameCount:rows.length,sources,
 viewport:[1920,1080],minimumClippedWidthAndHeightForBothLargePx:40,minimumOpacityForBothLarge:.10,bothLargeFrames:bothLargeCount,
 minSeparationGapPx:Number.isFinite(minGap)?minGap:null,worstFrame:worst?.frame??null,worstCase:worst,
 conservativeOverlapWarningCount:warnings.length,warningFrames:warnings.map(w=>w.frame),
 conservativeBoundMethod:'Union of positive-weight per-bone support AABBs transformed through mesh bind, current bone world, inverse bind and mesh world. This contains convex blended skin; no body-centre or rigid mesh proxy.',
 exactSkinContainmentValidation:{frames:validatedFrames,allActiveSkinVerticesAtValidationFrames:true,maxProjectedEscapePx:validationMaxEscape},
 limitations:['Projected support boxes are conservative and ignore environment/other-mesh occlusion. Their overlap alone does not prove silhouette or mesh overlap.','No GPU render or normal-speed playback is claimed. Exact frame-index data and source hashes make the result reviewable.'],
 sourcesModified:false,rowsPath:'research/qa-v16/friend-projection-frames-v16.json',warningsPath:'research/qa-v16/friend-projection-warnings-v16.json'};
fs.writeFileSync(`${out}/friend-projection-frames-v16.json`,JSON.stringify(rows,null,2)+'\n');fs.writeFileSync(`${out}/friend-projection-warnings-v16.json`,JSON.stringify(warnings,null,2)+'\n');fs.writeFileSync(`${out}/friend-projection-summary-v16.json`,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({...summary,worstCase:undefined},null,2));actors.dispose();world.dispose();
