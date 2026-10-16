import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import ts from 'typescript';
import * as T from 'three';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const timeline=read('src/hypertension/timeline.json');
const manifest=read('public/hypertension/models/asset-manifest.json');
const design=read('research/hypertension/anatomy-camera-design.json');
const physics=read('public/hypertension/physics.json');
const stem=`hypertension-plaque-impact-${process.pid}-${Date.now()}`;
const temp=path.join(root,'tmp');fs.mkdirSync(temp,{recursive:true});
const generated=[];
const sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
for(const name of ['CameraPath','VascularDetail','World']){
 let source=fs.readFileSync(path.join(root,`src/hypertension/${name}.ts`),'utf8');
 source=source.replace("import timeline from './timeline.json';",`const timeline=${JSON.stringify(timeline)};`)
  .replace("'./CameraPath'",`'./${stem}-CameraPath.mjs'`).replace("'./VascularDetail'",`'./${stem}-VascularDetail.mjs'`);
 const file=path.join(temp,`${stem}-${name}.mjs`);generated.push(file);
 fs.writeFileSync(file,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
try{
 const {HypertensionWorld}=await import(pathToFileURL(path.join(temp,`${stem}-World.mjs`)).href);
 const w=Object.create(HypertensionWorld.prototype);
 const bounds=manifest.groups.bodySurface.bounds,scale=6.85/(bounds[1][1]-bounds[0][1]);
 const worldPoint=(a)=>new T.Vector3(a[0]*scale,(a[1]-bounds[0][1])*scale+.08,a[2]*scale);
 const worldBox=(a)=>new T.Box3(worldPoint(a[0]),worldPoint(a[1]));
 Object.assign(w,{scene:new T.Scene(),camera:new T.PerspectiveCamera(35,16/9,.0001,70),bodyRoot:new T.Group(),introRoot:new T.Group(),measureRoot:new T.Group(),atlasGroups:{},atlasScale:scale,anchors:{},screens:[],signals:[],traces:[],ldlParticles:[],pressureVectors:[],pressureFronts:[],foamCells:[],platelets:[],dummy:new T.Object3D(),flowPhase:new Float64Array(timeline.duration+2),arteriolePhase:new Float64Array(timeline.duration+2),physics,disposed:false,pulseTime:0});
 w.scene.add(w.bodyRoot,w.introRoot,w.measureRoot);
 for(const [name,group] of Object.entries(manifest.groups))w.anchors[name]=worldPoint(group.center);
 w.anchors.body=w.anchors.bodySurface.clone();w.anchors.vessel=new T.Vector3(...design.aorticCutaway.center);
 for(const name of ['key','fill']){const light=new T.DirectionalLight();light.name=name;w.scene.add(light,light.target);}
 let renderCalls=0;w.renderer={render(){renderCalls++;}};
 // Invoke the actual production geometry builders and integrator, not replicas.
 w.buildKidneyDiagram();w.buildSignals();w.buildVessel();w.buildVascularDetails();w.integrateFlow();w.scene.updateMatrixWorld(true);

 const stateAt=(frame)=>{const scene=timeline.scenes.find(s=>frame>=s.start&&frame<s.end),clips=timeline.clips.filter(c=>c.scene===scene.id),clip=clips.filter(c=>frame>=c.start).at(-1)??clips[0];return {scene:scene.id,elapsed:(frame-scene.start)/30,duration:(scene.end-scene.start)/30,progress:(frame-scene.start)/(scene.end-scene.start),time:frame/30,line:clip?.line??0,lineProgress:clip?Math.max(0,Math.min(1,(frame-clip.start)/clip.duration)):0};};

 const sourceHashBefore=sha('src/hypertension/World.ts'),records=[],intervals=[];let start=null,end=null,zeroOpacityDepthWrites=0,positiveFrames=0,outsideReplacementMaxOpacity=0;
 for(let frame=0;frame<timeline.duration;frame++){
  w.render(stateAt(frame));let maxOpacity=0,positiveMaterials=0;
  w.plaque.traverse(o=>{if(!(o instanceof T.Mesh))return;let visible=true,p=o;while(p){visible&&=p.visible;p=p.parent;}for(const m of Array.isArray(o.material)?o.material:[o.material]){const opacity=visible?m.opacity:0;if(opacity<=0&&m.depthWrite)zeroOpacityDepthWrites++;maxOpacity=Math.max(maxOpacity,opacity);if(opacity>0)positiveMaterials++;}});
  if(maxOpacity>0){positiveFrames++;if(start===null)start=frame;end=frame;}else if(start!==null){intervals.push({startFrame:start,endFrame:end});start=null;}
  if(frame<7430||frame>8180)outsideReplacementMaxOpacity=Math.max(outsideReplacementMaxOpacity,maxOpacity);
  if(frame%1000===0)console.log('Production render states checked:',frame);
  if(maxOpacity>0&&(frame%30===0||frame===7757||frame===7939))records.push({frame,maxOpacity,positiveMaterials});
 }
 if(start!==null)intervals.push({startFrame:start,endFrame:end});
 const hashAfter=sha('src/hypertension/World.ts');
 const result={createdAt:new Date().toISOString(),sourceHash:sourceHashBefore,sourceStable:sourceHashBefore===hashAfter,scope:'Every production render state frame executed (9671 frames), with real camera, vessel, plaque, signal and detail update methods. GPU drawing is a no-op; atlas background is omitted. This tests when changing plaque Group.renderOrder can affect alpha/depth contribution. It does not itself compare encoded pixels.',groupRenderOrder:w.plaque.renderOrder,totalFilmFrames:timeline.duration,actualRenderCalls:renderCalls,positiveFrames,zeroOpacityDepthWrites,visibilityThreshold:0,outsideReplacementMaxOpacity,firstVisibleFrame:intervals[0]?.startFrame??null,lastVisibleFrame:intervals.at(-1)?.endFrame??null,nonZeroOpacityIntervals:intervals,conservativeRenderIntervals:intervals.map(i=>({startFrame:Math.max(0,i.startFrame-1),endFrame:Math.min(timeline.duration-1,i.endFrame+1)})),samples:records,passed:sourceHashBefore===hashAfter&&zeroOpacityDepthWrites===0&&outsideReplacementMaxOpacity===0};
 fs.writeFileSync(path.join(root,'research/hypertension/plaque-v5-impact.json'),JSON.stringify(result,null,2));
 fs.writeFileSync(path.join(root,'research/hypertension/plaque-visibility-scope-v5.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,samples:'see report'},null,2));
}finally{for(const file of generated)fs.unlinkSync(file);}
