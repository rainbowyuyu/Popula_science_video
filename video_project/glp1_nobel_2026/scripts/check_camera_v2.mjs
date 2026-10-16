// Source/geometry audit only. Does not build a browser bundle or render frames.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),snapshot=new Map(),modules=new Map();
const read=rel=>{if(!snapshot.has(rel))snapshot.set(rel,fs.readFileSync(path.join(root,rel),'utf8'));return snapshot.get(rel);};
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const dataModule=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const external=id=>pathToFileURL(id==='three'?path.join(path.dirname(require.resolve('three')),'three.module.js'):require.resolve(id)).href;
async function moduleUrl(rel){
  if(modules.has(rel))return modules.get(rel);
  const pending=(async()=>{
    let source=read(rel);
    if(rel.endsWith('.json'))return dataModule('export default '+source);
    let code=(await transform(source,{loader:rel.endsWith('.tsx')?'tsx':'ts',format:'esm',target:'es2022'})).code;
    const imports=[...code.matchAll(/from\s+["']([^"']+)["']/g)];
    for(const match of imports){
      const id=match[1];let url;
      if(id.startsWith('.')){
        const base=path.posix.normalize(path.posix.join(path.posix.dirname(rel),id));
        const resolved=['','.ts','.tsx','.json'].map(ext=>base+ext).find(p=>fs.existsSync(path.join(root,p)));
        if(!resolved)throw new Error('Unresolved '+id+' from '+rel);
        url=await moduleUrl(resolved);
      }else url=external(id);
      code=code.replace(match[0],'from '+JSON.stringify(url));
    }
    return dataModule(code);
  })();modules.set(rel,pending);return pending;
}
const worldSource=read('src/World.ts'),filmSource=read('src/Film.tsx');
read('src/CameraPath.ts');read('src/timeline.json');
const timeline=JSON.parse(read('src/timeline.json')),manifest=JSON.parse(read('public/models/manifest.json'));
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url).replace(/^\//,'')),'utf8'))});
const [{World},{CameraPath},{IntestinalDetail,BetaCellDetail,BrainCircuit},{MolecularDetail},{DrugDetail},{V,C,stateAt}]=await Promise.all([
  moduleUrl('src/World.ts').then(x=>import(x)),moduleUrl('src/CameraPath.ts').then(x=>import(x)),moduleUrl('src/Details.ts').then(x=>import(x)),
  moduleUrl('src/MolecularDetail.ts').then(x=>import(x)),moduleUrl('src/DrugDetail.ts').then(x=>import(x)),moduleUrl('src/visual.ts').then(x=>import(x))
]);
const w=Object.create(World.prototype);
Object.assign(w,{root:new T.Group(),scene:new T.Scene(),camera:new T.PerspectiveCamera(34,16/9,.0001,12),tl:timeline,base:'public/',anchors:{},organs:{},flows:[],stomachFood:[],gastricPoints:[],layerWeights:{},meal:new T.Group(),mealScene:{update(){}},intestinal:new IntestinalDetail(),beta:new BetaCellDetail(),circuit:new BrainCircuit()});
w.scene.add(w.root);w.root.add(w.meal);
const particleGeometry=new T.SphereGeometry(.0016,6,4),particleMaterial=new T.MeshStandardMaterial();
w.stomachFood=Array.from({length:36},()=>{const particle=new T.Mesh(particleGeometry,particleMaterial.clone());w.root.add(particle);return particle;});
// Execute the exact current source anchor blocks without constructing WebGL/DOM state.
async function sourceFunction(source,args){return (await import(dataModule((await transform(`export function run(${args}){${source}}`,{loader:'ts',format:'esm',target:'es2022'})).code))).run;}
const initialStart=worldSource.indexOf('for(const [name,data] of Object.entries(manifest.assets))');
const initialEnd=worldSource.indexOf('this.cameraPath=new CameraPath(this.anchors,tl);',initialStart)+'this.cameraPath=new CameraPath(this.anchors,tl);'.length;
if(initialStart<0||initialEnd<initialStart)throw new Error('World initial anchor block changed; update audit extractor.');
const initialize=await sourceFunction(worldSource.slice(initialStart,initialEnd),'T,manifest,V,MolecularDetail,DrugDetail,CameraPath,base,tl');
initialize.call(w,T,manifest,V,MolecularDetail,DrugDetail,CameraPath,'public/',timeline);
await w.receptor.ready;
const initialAnchors=Object.fromEntries(Object.entries(w.anchors).map(([k,v])=>[k,v.toArray()]));
for(const [name,asset] of Object.entries(manifest.assets)){
  if(name==='skin')continue;
  const bytes=fs.readFileSync(path.join(root,'public',asset.path));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.traverse(o=>{if(o instanceof T.Mesh)o.material=new T.MeshStandardMaterial({side:T.DoubleSide});});
  w.organs[name]=gltf.scene;w.root.add(gltf.scene);
}
w.scene.updateMatrixWorld(true);
const tissueStart=worldSource.indexOf('const tissue='),tissueEnd=worldSource.indexOf('this.cameraPath=new CameraPath(this.anchors,tl);',tissueStart)+'this.cameraPath=new CameraPath(this.anchors,tl);'.length;
if(tissueStart<0||tissueEnd<tissueStart)throw new Error('World surface anchor block changed; update audit extractor.');
const hydrate=await sourceFunction(worldSource.slice(tissueStart,tissueEnd),'T,V,CameraPath,tl');
hydrate.call(w,T,V,CameraPath,timeline);
const anchors=Object.fromEntries(Object.entries(w.anchors).map(([k,v])=>[k,v.toArray()]));
const projectStart=filmSource.indexOf('for(const label of labels){'),projectEnd=filmSource.indexOf('onLabels(output);',projectStart);
if(projectStart<0||projectEnd<projectStart)throw new Error('Film label projection block changed; update audit extractor.');
const projectLabels=await sourceFunction('const output=[];const labels=w.labels(state);'+filmSource.slice(projectStart,projectEnd)+'return output;','w,state,camera,C,T');
const opacity=o=>{let max=0;if(o.visible)o.traverseVisible(m=>{if(m instanceof T.Mesh)for(const material of Array.isArray(m.material)?m.material:[m.material])max=Math.max(max,material.opacity);});return max;};
const screen=v=>{const p=v.clone().project(w.camera);return{x:(p.x+1)*960,y:(1-p.y)*540,z:p.z};};
const worldPosition=o=>o.getWorldPosition(new T.Vector3());
const clip=id=>timeline.clips.find(c=>c.id===id);
const rows=[];
let previous,maximumCameraStep={value:0},maximumOrientation={value:0},maximumRelativeStep={value:0};
for(let frame=0;frame<=timeline.duration;frame++){
  const pose=w.cameraPath.apply(frame,w.camera),q=w.camera.quaternion.clone();
  if(previous){
    const step=pose.position.distanceTo(previous.position),angle=q.angleTo(previous.q)*180/Math.PI,relative=step/pose.distance;
    if(step>maximumCameraStep.value)maximumCameraStep={frame,value:step};
    if(angle>maximumOrientation.value)maximumOrientation={frame,value:angle};
    if(relative>maximumRelativeStep.value)maximumRelativeStep={frame,value:relative};
  }
  previous={position:pose.position.clone(),q};
}
const derivativeErrors=[];
for(const k of w.cameraPath.knots.slice(1,-1)){
  const h=.001,p=w.cameraPath.sample(k.frame).position,left=p.clone().sub(w.cameraPath.sample(k.frame-h).position).divideScalar(h),right=w.cameraPath.sample(k.frame+h).position.sub(p).divideScalar(h);
  derivativeErrors.push({frame:k.frame,error:left.distanceTo(right)});
}
const frames=new Set();
for(let frame=0;frame<timeline.duration;frame+=5)frames.add(frame);
for(const c of timeline.clips)for(const delta of [-2,-1,0,1,2,5,10,20,40,50,70])if(c.start+delta>=0)frames.add(c.start+delta);
const nearPlane={},matrix=new T.Matrix4(),localBox=new T.Box3();
let previousFoodPositions,previousFoodVisible=false,maximumFoodStep={distance:0};
const detailLayers={intestinal:w.intestinal.root,beta:w.beta.root,receptor:w.receptor.root,circuit:w.circuit.root,drug:w.drug.root};
function visibleFrontDepth(layer){
  let nearest=Infinity;
  layer.traverseVisible(o=>{if(!(o instanceof T.Mesh))return;
    const materials=Array.isArray(o.material)?o.material:[o.material];if(!materials.some(m=>m.opacity>=.01))return;
    if(o instanceof T.InstancedMesh){if(!o.boundingBox)o.computeBoundingBox();localBox.copy(o.boundingBox);}
    else{if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();localBox.copy(o.geometry.boundingBox);}
    matrix.multiplyMatrices(w.camera.matrixWorldInverse,o.matrixWorld);localBox.applyMatrix4(matrix);nearest=Math.min(nearest,-localBox.max.z);
  });return nearest;
}
for(let frame=0;frame<timeline.duration;frame++){
  const state=stateAt(frame,timeline);w.update(state);
  const foodVisible=opacity(w.stomachFood[0])>.1,foodPositions=w.stomachFood.map(p=>p.position.clone());
  if(foodVisible&&previousFoodVisible)foodPositions.forEach((p,i)=>{const distance=p.distanceTo(previousFoodPositions[i]);if(distance>maximumFoodStep.distance)maximumFoodStep={frame,particle:i,distance};});
  previousFoodPositions=foodPositions;previousFoodVisible=foodVisible;
  for(const [name,layer] of Object.entries(detailLayers)){
    if(opacity(layer)<.1)continue;
    const depth=visibleFrontDepth(layer),ratio=depth/w.camera.near;
    nearPlane[name]??={auditedFrames:0,minimumDepthToNearRatio:Infinity};nearPlane[name].auditedFrames++;
    if(ratio<nearPlane[name].minimumDepthToNearRatio)Object.assign(nearPlane[name],{frame,minimumDepth:depth,near:w.camera.near,minimumDepthToNearRatio:ratio,passed:depth>w.camera.near});
  }
  if(!frames.has(frame))continue;
  const labels=projectLabels(w,state,w.camera,C,T);
  const betaLigand=w.beta.root.getObjectByName('extracellular-GLP1-ligand');
  rows.push({frame,clip:state.clip.id,distance:w.cameraPath.sample(frame).distance,mealY:w.meal.position.y,
    opacity:{intestinal:opacity(w.intestinal.root),beta:opacity(w.beta.root),receptor:opacity(w.receptor.root),stomach:opacity(w.organs.stomach),pancreas:opacity(w.organs.pancreas),small_intestine:opacity(w.organs.small_intestine)},
    betaLigand:screen(worldPosition(betaLigand)),receptorLigand:screen(w.receptor.root.localToWorld(w.receptor.getLigandAnchor())),
    labels:labels.map(l=>({text:l.text,opacity:l.opacity,x:l.x,y:l.y,tx:l.tx,ty:l.ty,right:l.right}))});
}
const boundaryRows=timeline.clips.map(c=>({clip:c.id,start:c.start,before:rows.find(r=>r.frame===c.start-1),after:rows.find(r=>r.frame===c.start)}));
const receptorSymbol=w.beta.root.getObjectByName('membrane-GLP1-receptor-symbol');
w.update(stateAt(clip('g013').start,timeline));
const receptorHandoffOffset=worldPosition(receptorSymbol).distanceTo(w.anchors.receptor);
const faintLabelRows=rows.filter(r=>r.labels.some(l=>l.opacity>.5&&((l.text==='β 细胞'&&r.opacity.beta<.1)||(l.text==='受体'&&r.opacity.receptor<.1))));
const boundsLabelRows=rows.filter(r=>r.labels.some(l=>l.ty>850||l.ty<250));
// True tabletop polygon projection with homogeneous clipping (also works across near plane).
function tableArea(frame){
  w.update(stateAt(frame,timeline));
  let polygon=[[-.6,.095],[.6,.095],[.6,.745],[-.6,.745]].map(([x,z])=>new T.Vector4(x,.932+w.meal.position.y,z,1).applyMatrix4(w.camera.matrixWorldInverse).applyMatrix4(w.camera.projectionMatrix));
  for(const plane of [v=>v.w+v.x,v=>v.w-v.x,v=>v.w+v.y,v=>v.w-v.y,v=>v.w+v.z,v=>v.w-v.z]){
    const next=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],da=plane(a),db=plane(b);
      if(da>=0)next.push(a);
      if((da>=0)!==(db>=0))next.push(a.clone().lerp(b,da/(da-db)));
    }
    polygon=next;if(!polygon.length)break;
  }
  const points=polygon.map(v=>[v.x/v.w,v.y/v.w]);let area=0;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-b[0]*a[1];}
  return {frame,mealY:w.meal.position.y,screenFraction:Math.abs(area)/8};
}
const tableDeparture=[];
for(const start of [clip('g007').start,timeline.duration-270])for(let d=0;d<=150;d+=5)tableDeparture.push(tableArea(start+d));
// Reproduce current playback, including the final wraparound interpolation segment.
const gastric=[],gastricRadius=.0016,gastricSamples=Math.max(241,w.gastricPoints.length*8);
let minimumGastricSurfaceDistance=Infinity,minimumGastricContinuousClearance=Infinity,maximumGastricSegmentLength=0;
const stomachTriangles=[];
w.organs.stomach.traverse(o=>{if(!(o instanceof T.Mesh))return;const p=o.geometry.attributes.position,index=o.geometry.index;
  for(let i=0;i<(index?.count??p.count);i+=3){const points=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(o.matrixWorld));stomachTriangles.push(new T.Triangle(...points));}
});
const closest=new T.Vector3();
if(w.gastricPoints.length||w.gastricPath){
  const ray=new T.Raycaster(),stomach=w.organs.stomach;
  for(let i=0;i<gastricSamples;i++){
    const q=i/gastricSamples,at=q*w.gastricPoints.length,index=Math.floor(at),a=w.gastricPoints[index],b=w.gastricPoints[(index+1)%w.gastricPoints.length];
    const point=w.gastricPoints.length?a.clone().lerp(b,at-index):w.gastricPath.getPoint(q);ray.set(point,new T.Vector3(0,0,1));
    const raw=ray.intersectObject(stomach,true).map(h=>h.distance),unique=raw.filter((v,j)=>j===0||Math.abs(v-raw[j-1])>1e-6);
    if(unique.length%2!==1)gastric.push({progress:q,point:point.toArray(),forwardIntersections:unique.length});
    let distanceSquared=Infinity;
    for(const triangle of stomachTriangles)distanceSquared=Math.min(distanceSquared,triangle.closestPointToPoint(point,closest).distanceToSquared(point));
    const distance=Math.sqrt(distanceSquared),segmentLength=w.gastricPoints.length?a.distanceTo(b):0;
    maximumGastricSegmentLength=Math.max(maximumGastricSegmentLength,segmentLength);
    minimumGastricSurfaceDistance=Math.min(minimumGastricSurfaceDistance,distance);
    // Distance to a closed set is 1-Lipschitz. Half an eighth-segment spacing
    // bounds the unsampled path between neighbouring test points.
    minimumGastricContinuousClearance=Math.min(minimumGastricContinuousClearance,distance-segmentLength/16-gastricRadius);
  }
}
if(w.gastricPoints.length)minimumGastricContinuousClearance=minimumGastricSurfaceDistance-maximumGastricSegmentLength/16-gastricRadius;
const focusedOcclusion=[];
for(const id of ['g011','g012','g017','g018']){
  const c=clip(id);
  for(const u of [.10,.4,.8]){
    const frame=Math.round(c.start+c.duration*u);w.update(stateAt(frame,timeline));
    const target=w.anchors.pancreas,dir=target.clone().sub(w.camera.position).normalize(),ray=new T.Raycaster(w.camera.position,dir);
    const hits=Object.entries(w.organs).filter(([name])=>!['body','skin','veins','aorta','esophagus'].includes(name)).flatMap(([name,o])=>ray.intersectObject(o,true).map(hit=>({organ:name,distance:hit.distance,opacity:opacity(o)}))).sort((a,b)=>a.distance-b.distance);
    focusedOcclusion.push({frame,clip:id,firstSurfaces:hits.slice(0,5),target:screen(target)});
  }
}
const audioLock=JSON.parse(read('research/revision-v2-audio-lock.json'));
const lockedTimelineHash=audioLock.lockedTimelineHash??audioLock.timelineSHA256??audioLock.timelineSha256??audioLock.timelineHash;
if(!lockedTimelineHash)throw new Error('Audio lock does not contain a timeline SHA-256.');
const sourceHashes=Object.fromEntries([...snapshot].map(([file,content])=>[file,sha(content)]));
const changedDuringRun=[...snapshot].filter(([file,content])=>fs.readFileSync(path.join(root,file),'utf8')!==content).map(([file])=>file);
const report={createdUtc:new Date().toISOString(),status:'source-audit-locked-v2-timeline',scope:'Source and numerical geometry inspection only; no browser bundle, renderer, or final encoded-video audit. Camera sampled every integer frame; animated visible micro geometry audited every active integer frame.',timeline:{duration:timeline.duration,fps:timeline.fps,sha256:sourceHashes['src/timeline.json'],matchesLockedV2:sourceHashes['src/timeline.json']===lockedTimelineHash},sourceHashes,changedDuringRun,
  anatomyAnchorRebuild:{initialAnchors,anchors,receptorSymbolToStructureRootDistance:receptorHandoffOffset},
  camera:{samples:timeline.duration+1,maximumCameraStep,maximumOrientation,maximumRelativeStep,maximumInteriorDerivativeMismatch:derivativeErrors.sort((a,b)=>b.error-a.error)[0]},
  nearPlane,faintLabelRows,boundsLabelRows,boundaryRows,tableDeparture,gastricPath:{projectedControlPoints:w.gastricPoints.length,samples:gastricSamples,centerOutsideStomach:gastric,foodParticleRadius:gastricRadius,minimumSurfaceDistance:minimumGastricSurfaceDistance,conservativeContinuousClearanceBeyondParticleRadius:minimumGastricContinuousClearance,maximumAdjacentControlPointDistance:maximumGastricSegmentLength,maximumPlaybackStepPerFrame:maximumFoodStep,safeRegion:w.root.userData.gastricSafeRegion,continuousSphereContainmentPassed:gastric.length===0&&minimumGastricContinuousClearance>=.002},focusedOcclusion,
  selectedTransitionRows:rows.filter(r=>['g008','g009','g010','g012','g013','g015','g016','g017'].includes(r.clip)&&r.frame%20===0)};
fs.mkdirSync(path.join(root,'research/qa'),{recursive:true});
fs.writeFileSync(path.join(root,'research/qa/camera-v2-source.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,timeline:report.timeline,changedDuringRun,camera:report.camera,nearPlane,receptorHandoffOffset,faintLabelRows:faintLabelRows.slice(0,5),boundsLabelRows:boundsLabelRows.slice(0,3),tableVisibleDuringDeparture:tableDeparture.filter(x=>x.mealY<-.001&&x.screenFraction>.001).slice(0,10),gastric:report.gastricPath,report:'research/qa/camera-v2-source.json'},null,2));
