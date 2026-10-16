import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import ts from 'typescript';
import * as T from 'three';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const timeline=read('src/hypertension/timeline.json');
const sourceFiles=['src/hypertension/World.ts','src/hypertension/CameraPath.ts','src/hypertension/VascularDetail.ts','src/hypertension/Annotations.ts','src/hypertension/Film.tsx','src/hypertension/timeline.json','public/hypertension/physics.json','public/hypertension/models/human-atlas-hypertension.glb'];
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const hashes=()=>Object.fromEntries(sourceFiles.map(p=>[p,hash(p)]));
const sourceHashes=hashes(),prefix=`annotations-v7-${process.pid}-${Date.now()}`,temporary=[];
for(const name of ['World','CameraPath','VascularDetail','Annotations']){
 let source=fs.readFileSync(path.join(root,`src/hypertension/${name}.ts`),'utf8').replace("import timeline from './timeline.json';",`const timeline=${JSON.stringify(timeline)};`);
 for(const dep of ['World','CameraPath','VascularDetail','Annotations'])source=source.replace(`'./${dep}'`,`'./${prefix}-${dep}.mjs'`);
 const file=path.join(root,'tmp',`${prefix}-${name}.mjs`);temporary.push(file);fs.writeFileSync(file,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
const originalFetch=globalThis.fetch,originalDocument=globalThis.document,originalProgressEvent=globalThis.ProgressEvent;
try{
 // File-backed fetch still runs production loadAtlas + GLTFLoader + its normal
 // material/transform normalization; no synthetic anatomy or atlas opacity.
 const resourceReads=[];
 globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;if(!url.startsWith('http://annotation-audit.local/'))throw Error('Unexpected external asset: '+url);const rel=decodeURIComponent(new URL(url).pathname).replace(/^\//,'');const resolved=path.resolve(root,'public',rel);if(!resolved.startsWith(path.resolve(root,'public')+path.sep))throw Error('Asset path out of scope');const bytes=fs.readFileSync(resolved);resourceReads.push({path:path.relative(root,resolved),bytes:bytes.length});return new Response(bytes,{status:200,headers:{'Content-Length':String(bytes.length),'Content-Type':rel.endsWith('.json')?'application/json':'application/octet-stream'}});};
 globalThis.ProgressEvent=class{constructor(type,init){this.type=type;Object.assign(this,init);}};
 globalThis.document={createElement(tag){if(tag!=='canvas')throw Error('Unexpected DOM request: '+tag);return {width:0,height:0,getContext(){return {fillRect(){},fillText(){}};}};}};
 const {HypertensionWorld}=await import(pathToFileURL(path.join(root,'tmp',`${prefix}-World.mjs`)).href);
 const {annotationSpecs,getAnnotations}=await import(pathToFileURL(path.join(root,'tmp',`${prefix}-Annotations.mjs`)).href);
 const w=Object.create(HypertensionWorld.prototype);
 Object.assign(w,{scene:new T.Scene(),camera:new T.PerspectiveCamera(35,16/9,.0001,70),introRoot:new T.Group(),measureRoot:new T.Group(),atlasGroups:{},atlasScale:1,anchors:{},screens:[],signals:[],traces:[],ldlParticles:[],pressureVectors:[],pressureFronts:[],foamCells:[],platelets:[],dummy:new T.Object3D(),flowPhase:new Float64Array(timeline.duration+2),arteriolePhase:new Float64Array(timeline.duration+2),disposed:false,pulseTime:0,assetBase:'http://annotation-audit.local/hypertension/'});
 for(const name of ['key','fill']){const light=new T.DirectionalLight();light.name=name;w.scene.add(light,light.target);}
 let renderCalls=0;w.renderer={render(){renderCalls++;}};
 await w.loadAtlas();w.camera.updateMatrixWorld(true);
 const manifest=read('public/hypertension/models/asset-manifest.json');
 let loadedAtlasMeshes=0,loadedAtlasPositions=0;w.atlas.traverse(o=>{if(o instanceof T.Mesh){loadedAtlasMeshes++;loadedAtlasPositions+=o.geometry.attributes.position.count;}});
 const stateAt=(frame)=>{let i=timeline.scenes.findIndex(s=>frame>=s.start&&frame<s.end);if(i<0)i=timeline.scenes.length-1;const scene=timeline.scenes[i],clips=timeline.clips.filter(c=>c.scene===scene.id),clip=clips.filter(c=>frame>=c.start).at(-1)??clips[0],clamp=x=>Math.max(0,Math.min(1,x));return {scene:scene.id,previous:timeline.scenes[i-1]?.id,elapsed:(frame-scene.start)/30,duration:(scene.end-scene.start)/30,progress:clamp((frame-scene.start)/(scene.end-scene.start)),time:frame/30,line:clip?.line??0,lineProgress:clip?clamp((frame-clip.start)/clip.duration):0};};
 const run=frame=>{const state=stateAt(frame);w.render(state);w.camera.updateMatrixWorld(true);return getAnnotations(w,state);};
 // Quick genuine-geometry preflight identifies absent cues before full encoding.
 const preflight=[];
 for(const spec of annotationSpecs){const rows=[];for(let n=0;n<7;n++){const frame=Math.floor(spec.from+(spec.to-spec.from)*(.15+n*.7/6));const row=run(frame).find(a=>a.id===spec.id);rows.push({frame,alpha:row?.alpha??0});}preflight.push({id:spec.id,peakAlpha:Math.max(...rows.map(r=>r.alpha)),samples:rows});}
 console.log(JSON.stringify({preflight:'actual GLB loaded',loadedAtlasMeshes,loadedAtlasPositions,neverReadableCandidates:preflight.filter(r=>r.peakAlpha<=.5).map(r=>({id:r.id,peak:r.peakAlpha}))}));
 const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
 const safe={x:60,y:300,width:1800,height:467};
 const reserved=[{id:'brand',x:54,y:38,width:420,height:115},{id:'chapter-heading',x:54,y:172,width:1750,height:110},{id:'learning-cue',x:0,y:780,width:1920,height:95},{id:'mechanism-note',x:0,y:880,width:1920,height:61},{id:'subtitles',x:100,y:948,width:1720,height:104}];
 const counters=Object.fromEntries(annotationSpecs.map(s=>[s.id,{id:s.id,text:s.text,target:s.target,from:s.from,to:s.to,peakOpacity:0,anyVisibleFrames:0,readableFrames:0,firstReadableFrame:null,lastReadableFrame:null,maxConsecutiveReadableFrames:0,maxAnchorStep:0,maxAnchorStepFrame:null,maxBoxStep:0,maxBoxStepFrame:null}]));
 const issues=[],snapshot=new Map(),runs=new Map();let prior=new Map(),maxCount=0;
 for(let frame=0;frame<timeline.duration;frame++){
  const rows=run(frame);maxCount=Math.max(maxCount,rows.length);if(rows.length>2)issues.push({kind:'more-than-two',frame,count:rows.length});const current=new Map();
  for(const a of rows){const c=counters[a.id];if(!c){issues.push({kind:'unknown-cue',frame,id:a.id});continue;}current.set(a.id,a);c.anyVisibleFrames++;c.peakOpacity=Math.max(c.peakOpacity,a.alpha);
   if(![a.alpha,a.anchor.x,a.anchor.y,a.x,a.y,a.width,a.height].every(Number.isFinite)||a.alpha<0||a.alpha>1)issues.push({kind:'non-finite-or-invalid-alpha',frame,id:a.id});
   if(a.alpha>.5){c.readableFrames++;c.firstReadableFrame??=frame;c.lastReadableFrame=frame;const n=(prior.get(a.id)?.alpha>.5?(runs.get(a.id)??0):0)+1;runs.set(a.id,n);c.maxConsecutiveReadableFrames=Math.max(c.maxConsecutiveReadableFrames,n);
    if(a.x<safe.x||a.y<safe.y||a.x+a.width>safe.x+safe.width||a.y+a.height>safe.y+safe.height)issues.push({kind:'safe-margin',frame,id:a.id,box:{x:a.x,y:a.y,width:a.width,height:a.height}});
    for(const b of reserved)if(overlap(a,b))issues.push({kind:'reserved-lane-overlap',frame,id:a.id,lane:b.id});
    const before=prior.get(a.id);if(before?.alpha>.5){const anchorStep=Math.hypot(a.anchor.x-before.anchor.x,a.anchor.y-before.anchor.y),boxStep=Math.hypot(a.x-before.x,a.y-before.y);if(anchorStep>c.maxAnchorStep){c.maxAnchorStep=anchorStep;c.maxAnchorStepFrame=frame;}if(boxStep>c.maxBoxStep){c.maxBoxStep=boxStep;c.maxBoxStepFrame=frame;}if(anchorStep>30||boxStep>30)issues.push({kind:'large-consecutive-step',frame,id:a.id,anchorStep,boxStep});}
   }else runs.set(a.id,0);
  }
  const meaningful=rows.filter(a=>a.alpha>.5);for(let i=0;i<meaningful.length;i++)for(let j=i+1;j<meaningful.length;j++)if(overlap(meaningful[i],meaningful[j]))issues.push({kind:'label-label-overlap',frame,ids:[meaningful[i].id,meaningful[j].id]});
  snapshot.set(frame,rows);prior=current;if(frame%1000===0)console.log('Full actual-atlas annotation states checked:',frame);
 }
 const randomFrames=[...new Set(annotationSpecs.flatMap(s=>[Math.floor(s.from+14),Math.floor((s.from+s.to)/2),Math.ceil(s.to-14)]).concat([0,9670,7757,7939,8047,8868]))].filter(f=>f>=0&&f<timeline.duration).sort((a,b)=>Math.sin(a*12.9898)-Math.sin(b*12.9898));
 const deterministicErrors=[];
 for(const frame of randomFrames){const actual=run(frame),expected=snapshot.get(frame);if(actual.length!==expected.length){deterministicErrors.push({frame,kind:'count',expected:expected.length,actual:actual.length});continue;}for(let i=0;i<actual.length;i++){const a=actual[i],b=expected[i];const error=Math.max(Math.abs(a.alpha-b.alpha),Math.abs(a.anchor.x-b.anchor.x),Math.abs(a.anchor.y-b.anchor.y),Math.abs(a.x-b.x),Math.abs(a.y-b.y));if(a.id!==b.id||error>1e-6)deterministicErrors.push({frame,id:a.id,expectedId:b.id,maxNumericError:error});}}
 const cues=Object.values(counters).map(c=>{const p=preflight.find(p=>p.id===c.id),top=Math.max(...p.samples.map(s=>s.alpha)),high=p.samples.filter(s=>Math.abs(s.alpha-top)<1e-7);return {...c,visibleFrames:c.readableFrames,peakAlpha:c.peakOpacity,representativeFrame:high[Math.floor(high.length/2)].frame,representativeSelection:'One actual production preflight sample at maximum sampled alpha; midpoint among ties',readableSeconds:c.readableFrames/30,maxConsecutiveReadableSeconds:c.maxConsecutiveReadableFrames/30,neverVisible:c.anyVisibleFrames===0,neverReadable:c.readableFrames===0,underOneSecondReadable:c.readableFrames<30};});
 const afterHashes=hashes(),sourceStable=JSON.stringify(afterHashes)===JSON.stringify(sourceHashes),neverVisible=cues.filter(c=>c.neverVisible||c.neverReadable),shortCues=cues.filter(c=>c.underOneSecondReadable);
 const report={createdAt:new Date().toISOString(),scope:'All 9671 production World.render state updates on the actual GLB loaded by production loadAtlas/GLTFLoader, including real anatomical positions, normalized transforms, material opacity and dynamic geometry. Camera world/inverse matrices explicitly updated after each no-op GPU render. getAnnotations is executed from current production source; no browser/GPU pixels or full-speed playback are claimed. Screen canvas drawing is stubbed; body geometry and all material/animation updates are real.',sourceHashes,sourceStable,actualAtlas:{resourceReads,loadedAtlasMeshes,loadedAtlasPositions,sourceCommit:manifest.sourceCommit},frames:timeline.duration,annotationCount:annotationSpecs.length,maxActive:maxCount,preflight,cues,layout:{maxSimultaneous:maxCount,meaningfulOpacityThreshold:.5,safeBox:safe,reservedBoxes:reserved,continuityThresholdPixelsPerFrame:30,issues,issueCount:issues.length},determinism:{nonSequentialFrames:randomFrames.length,maxAllowedNumericError:1e-6,errors:deterministicErrors,passed:deterministicErrors.length===0},neverVisibleOrReadable:neverVisible.map(c=>c.id),shortReadableCues:shortCues.map(c=>({id:c.id,seconds:c.readableSeconds,peak:c.peakOpacity})),actualProductionRenderCalls:renderCalls,passed:sourceStable&&issues.length===0&&deterministicErrors.length===0&&neverVisible.length===0&&shortCues.length===0};
 fs.writeFileSync(path.join(root,'research/hypertension/annotations-v7-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,frames:report.frames,sourceStable,maxSimultaneous:maxCount,neverVisibleOrReadable:report.neverVisibleOrReadable,shortReadableCues:report.shortReadableCues,issues:issues.slice(0,12),deterministicErrors:deterministicErrors.slice(0,8),cueReadability:cues.map(c=>({id:c.id,peak:c.peakOpacity,seconds:c.readableSeconds,maxAnchorStep:c.maxAnchorStep,maxBoxStep:c.maxBoxStep}))},null,2));if(!report.passed)process.exitCode=1;
}finally{globalThis.fetch=originalFetch;globalThis.document=originalDocument;globalThis.ProgressEvent=originalProgressEvent;for(const file of temporary)fs.unlinkSync(file);}
