import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {build} from 'esbuild';

const out='research/revision-v5/h005-fix';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const baseRoot='research/revision-v5/final-motion-source';
const sourcePaths=['src/V5World.ts','src/V5CameraPath.ts','src/V5Person.ts','src/V5CardioDetail.ts','src/V5HandoffContext.ts','src/World.ts','src/timeline.json'];
const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,sha(p)]));
const baseHashes=Object.fromEntries(sourcePaths.map(p=>[p,sha(`${baseRoot}/${p}`)]));
const scalarNames=['d','macroExit','pancreasFamily','gutFamily','drugFamily','arteryFamily','arterioleFamily','lipidFamily','wallFamily','renalFamily','neural','wp','wg','islet','beta','receptor','gut','drug','artery','arteriole','lipid','lipidWall','nephron','muscleFamily','clotFamily','customMicro','localMicro','anatomy','mealWeight','mealPreview','mealRenderWeight','measurementWeight','actionWeight','personWeight','atrialWeight','airwayWeight','adiposity','personOpticalBase','macroPreviewOptical','personOptical','visiblePerson'];
const boolNames=['outgoingToMacro','diningToMeasurement'];
const manifest=read('public/models/manifest.json');
const organNames=Object.keys(manifest.assets).filter(k=>k!=='skin');

async function moduleFor(kind){
 const prefixPath=kind==='base'?`${baseRoot}/src`:'src';
 const world=fs.readFileSync(`${prefixPath}/V5World.ts`,'utf8');
 const helper=world.slice(world.indexOf('function anteriorInterior'),world.indexOf('/** Single atlas-coordinate'));
 const viewWeight=world.slice(world.indexOf(' private viewWeight'),world.indexOf(' private contiguousProgress'));
 const prefix=world.slice(world.indexOf(' update(s:FrameState){'),world.indexOf('  this.person?.update'));
 const personLine=world.split(/\r?\n/).find(l=>l.includes('this.person?.update('));
 const organs=world.slice(world.indexOf('  const sympathetic='),world.indexOf('  this.mealScene.update(s.time);'));
 const bloodLines=world.split(/\r?\n/).filter(l=>/^\s*(visibility\(this\.(bloodContext|plasmaField|drugPlasmaBridge\.children)|if\(lipidFamily>drugFamily\)|this\.plasmaField\.position|this\.drugPlasmaBridge\.position|const drugBridgeWeight=)/.test(l)).join('\n').replaceAll('visibility(','this.capture(');
 const routeLines=world.split(/\r?\n/).filter(l=>/^\s*(const routeOptical=|this\.routes\?\.update|const foodAlpha=)/.test(l)).join('\n');
 const extras=kind==='current'?'drugLead,measurementOptical,':'drugLead:0,measurementOptical:1,';
 const generated=`import * as T from 'three';import {V,mat,smooth,clamp,stateAt} from './src/visual';import {V5CameraPath,viewOf} from './${prefixPath}/V5CameraPath';import {V5HandoffContext} from './src/V5HandoffContext';
 export {V5CameraPath,viewOf,stateAt,smooth};export {V5CardioDetail} from './src/V5CardioDetail';export {V5Person} from './src/V5Person';export {V5Atrium} from './src/V5Atrium';
 const closer=(d:number,near:number,far:number)=>1-smooth(Math.log(Math.max(d,1e-12)/near)/Math.log(far/near));${helper}export {anteriorInterior};
 export class Audit{
 weightFrame=-1;weightCache=new Map();weights={};camera=new T.PerspectiveCamera(34,1920/1080);organs={};alphas={};personState={};nerveWeight=0;captures={};routeState={};
 bloodContext=new T.Group();plasmaField=new T.Group();drugPlasmaBridge=new T.Group();
 person={update:(s:any)=>{this.personState=s}};routes={update:(time:number,s:any)=>{this.routeState=s}};handoff:any;
 constructor(public anchors:any,public tl:any,public cameraPath:any){this.handoff=new V5HandoffContext(tl);this.handoff.setAnchors(anchors.lipid,anchors.lipidWall);for(const name of ${JSON.stringify(organNames)}){const g=new T.Group();g.name=name;this.organs[name]=g}this.bloodContext.name='bloodContext';this.plasmaField.name='plasmaField';for(const name of ['drugBridgeRBC','drugBridgeProtein']){const g=new T.Group();g.name=name;this.drugPlasmaBridge.add(g)}}
 setOpacity(o:any,k:number){this.alphas[o.name]=k;}
 capture(o:any,k:number){this.captures[o.name]=k;}
 ${viewWeight}
 ${prefix}
 ${personLine}
 ${organs}
 ${bloodLines}
 ${routeLines}
 return{frame:s.frame,clip:s.clip.id,view,scalars:{${scalarNames.join(',')},${extras}foodAlpha,routeOptical,nerveWeight:this.nerveWeight},booleans:{${boolNames.join(',')}},organs:{...this.alphas},person:{opacity:this.personState.opacity,propsOpacity:this.personState.propsOpacity,wardrobeOpacity:this.personState.wardrobeOpacity},drugGates:{...this.captures},route:{...this.routeState},bloodPosition:this.bloodContext.position.toArray(),camera:{position:pose.position.toArray(),target:pose.target.toArray(),focus:pose.focus.toArray(),distance:pose.distance,az:pose.az,el:pose.el}};
 }}
 `;
 const bundle=await build({stdin:{contents:generated,resolveDir:process.cwd(),sourcefile:`expanded-impact-${kind}.ts`,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,external:['three']});
 const compiled=path.resolve(out,`expanded-impact-${kind}.mjs`);fs.writeFileSync(compiled,bundle.outputFiles[0].text);return import(pathToFileURL(compiled).href);
}
const [base,current]=await Promise.all([moduleFor('base'),moduleFor('current')]);
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
async function load(name){const b=fs.readFileSync(`public/models/${name}.glb`);const g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');g.scene.updateMatrixWorld(true);return g.scene;}
const [thigh,kidney,body,heart]=await Promise.all(['thighMuscles','leftKidney','body','heart'].map(load));
const recorded=read('research/revision-v5/camera-audit/metrics.json').anchors;
const anchors=Object.fromEntries(Object.entries(recorded).map(([k,a])=>[k,V(...a)]));
for(const [name,data]of Object.entries(manifest.assets))anchors[name]=V(...data.center);
const person=new current.V5Person(body);Object.assign(anchors,person.anchors);
const rectus=thigh.getObjectByName('FJ1433M_Left_rectus_femoris');anchors.muscle=current.anteriorInterior(rectus,new T.Box3().setFromObject(rectus).getCenter(V()),.004);anchors.muscleCell=anchors.muscle.clone();
anchors.nephron=current.anteriorInterior(kidney,anchors.leftKidney.clone().add(V(.021,.012,0)),.0025);
const detail=new current.V5CardioDetail(),routes=read('public/models/anatomical-routes.json');const route=routes.routes.find(r=>r.id==='descending_aorta'),arterialPoint=V(...route.points[Math.floor(route.points.length*.55)]);
detail.arteryRoot.position.copy(arterialPoint);detail.arteryRoot.rotation.z=-Math.PI/2;detail.arterioleRoot.position.copy(arterialPoint).add(V(.014,-.004,.003));detail.lipidRoot.position.copy(anchors.liver).add(V(.028,.009,.015));detail.nephronRoot.position.copy(anchors.nephron);detail.root.updateMatrixWorld(true);Object.assign(anchors,detail.getAnchors());detail.lipidWallRoot.position.copy(anchors.foamCell).add(V(0,0,20e-6));detail.root.updateMatrixWorld(true);Object.assign(anchors,detail.getAnchors());anchors.clotDetail=anchors.thrombus.clone();anchors.kidney=anchors.leftKidney.clone();Object.assign(anchors,new current.V5Atrium(heart).getAnchors());
const timeline=read('src/timeline.json'),copyAnchors=()=>Object.fromEntries(Object.entries(anchors).map(([k,v])=>[k,v.clone()]));
const aa=copyAnchors(),bb=copyAnchors(),a=new base.Audit(aa,timeline,new base.V5CameraPath(aa,timeline)),b=new current.Audit(bb,timeline,new current.V5CameraPath(bb,timeline));
const tolerance=1e-12,perField={},affected=[],samples=[],byFrame=new Map();
function flatten(obj,prefix='',result={}){for(const [key,value]of Object.entries(obj)){const p=prefix?`${prefix}.${key}`:key;if(typeof value==='number'||typeof value==='boolean'||typeof value==='string')result[p]=value;else if(value&&typeof value==='object')flatten(value,p,result);}return result;}
for(let frame=0;frame<timeline.duration;frame++){
 const old=a.update(base.stateAt(frame,timeline)),now=b.update(current.stateAt(frame,timeline));
 const x=flatten(old),y=flatten(now),fields=[];
 for(const k of Object.keys(x)){if(['frame','clip'].includes(k))continue;const delta=typeof x[k]==='number'&&typeof y[k]==='number'?Math.abs(x[k]-y[k]):x[k]===y[k]?0:1;if(delta>tolerance){fields.push(k);const rec=perField[k]??={frames:[],maximumDelta:0};rec.frames.push(frame);rec.maximumDelta=Math.max(rec.maximumDelta,delta);}}
 if(fields.length){affected.push(frame);byFrame.set(frame,fields);}
 if([630,690,930,1244,1314,1440,18400,18430,18500,18590,19090,19150,23990,24030,24060,24096,24700,7050,7100,7160].includes(frame))samples.push({frame,changedFields:fields,base:old,current:now});
}
function ranges(frames){const result=[];for(const frame of frames){const last=result.at(-1);if(last&&frame===last[1]+1)last[1]=frame;else result.push([frame,frame]);}return result;}
function framesOf(ranges){return ranges.flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>a+i));}
function padMerge(input,pad=60,gap=90){const result=[];for(const [a,b]of input){const start=Math.max(0,a-pad),end=Math.min(timeline.duration-1,b+pad),last=result.at(-1);if(last&&start<=last[1]+gap)last[1]=Math.max(last[1],end);else result.push([start,end]);}return result;}
const prior=read(`${out}/wardrobe-impact.json`),priorSupport=framesOf(prior.alphaSupportFramesInclusive);
const union=[...affected,...priorSupport,...framesOf([[1009,1545]])].sort((a,b)=>a-b).filter((x,i,all)=>!i||x!==all[i-1]);
const fullSupport=ranges(union),recommended=padMerge(fullSupport);
const fieldReport=Object.fromEntries(Object.entries(perField).map(([k,v])=>[k,{rangesInclusive:ranges(v.frames),count:v.frames.length,maximumDelta:v.maximumDelta}]));
const categoryKeys=['scalars','organs','person','drugGates','route','bloodPosition','camera','view','booleans'];
const categories=Object.fromEntries(categoryKeys.map(key=>{const f=[...new Set(Object.entries(perField).filter(([k])=>k===key||k.startsWith(key+'.')).flatMap(([,v])=>v.frames))].sort((a,b)=>a-b);return[key,{rangesInclusive:ranges(f),count:f.length}]}));
const seams=recommended.flatMap(([start,end])=>[start-1,start,end,end+1]).filter(f=>f>=0&&f<timeline.duration).map(frame=>({frame,differences:byFrame.get(frame)??[],expectedChangedFilmEdge:(frame===0||frame===timeline.duration-1)}));
const result={createdAtUTC:new Date().toISOString(),method:'CPU-only frozen/current V5World prefix, exact organ-alpha loop for every loaded atlas organ, actual V5HandoffContext liver gate, actual camera paths, person state arguments, drug/plasma visibility expressions and blood/nerve route gates compared at every integer frame. No browser, renderer, GPU, production edits, or compositing.',sourceSHA256:sourceHashes,baseSourceSHA256:baseHashes,sourceStableDuringAudit:sourcePaths.every(p=>sha(p)===sourceHashes[p]),timeline:{frames:timeline.duration,fps:timeline.fps},tolerance,organNames,anchors:Object.fromEntries(Object.entries(anchors).map(([k,v])=>[k,v.toArray()])),categories,fieldReport,allComputedDifferenceSupportInclusive:ranges(affected),priorWardrobeSupportInclusive:prior.alphaSupportFramesInclusive,unionSupportInclusive:fullSupport,recommendedRenderRangesInclusive:recommended,recommendedTotalFrames:recommended.reduce((s,[x,y])=>s+y-x+1,0),paddingFrames:60,mergeGapAfterPaddingFrames:90,seamChecks:seams,samples,limitations:['All raw gate and opacity differences retained, including offscreen shadow effects; no frustum rejection.','Some baseline organ opacity differences below a perceptually useful level are deliberately retained.','CPU equality does not certify visual appeal, shadow correctness, transition perception, or text placement.','Static atlas tissue anchors inherit earlier verified CPU camera metadata; macro/procedural organ anchors are recomputed here.']};
fs.writeFileSync(`${out}/expanded-impact.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({sourceStableDuringAudit:result.sourceStableDuringAudit,sourceSHA256:sourceHashes,patchCount:recommended.length,totalFrames:result.recommendedTotalFrames,seconds:result.recommendedTotalFrames/30,fraction:result.recommendedTotalFrames/timeline.duration,ranges:recommended,categories,seamsWithUnexpectedDifferences:seams.filter(s=>s.differences.length&&!s.expectedChangedFilmEdge),output:`${out}/expanded-impact.json`},null,2));
