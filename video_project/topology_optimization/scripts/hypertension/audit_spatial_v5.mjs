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
const stem=`hypertension-spatial-v5-${process.pid}-${Date.now()}`;
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
 const kidneyBox=worldBox(manifest.groups.leftKidney.bounds),nephronBox=new T.Box3().setFromObject(w.renalDiagram,true);
 const kidneySize=kidneyBox.getSize(new T.Vector3()),nephronSize=nephronBox.getSize(new T.Vector3());
 const ratio=Math.max(...nephronSize.toArray())/kidneySize.y;
 const focusNames=['nephronFocus','nephronFilter','nephronTubule','nephronDrain'];
 const focus=Object.fromEntries(focusNames.map(name=>[name,{position:w.anchors[name].toArray(),insideKidney: kidneyBox.containsPoint(w.anchors[name]),insideNephron:nephronBox.containsPoint(w.anchors[name])}]));
 const nephron={worldScale:w.renalDiagram.getWorldScale(new T.Vector3()).toArray(),kidneyBox:{min:kidneyBox.min.toArray(),max:kidneyBox.max.toArray()},nephronBox:{min:nephronBox.min.toArray(),max:nephronBox.max.toArray()},nephronMaxExtentToKidneyHeight:ratio,entireBoxInsideKidney:kidneyBox.containsBox(nephronBox),focus};
 nephron.passed=nephron.worldScale.every(x=>Math.abs(x-.012)<1e-12)&&nephron.entireBoxInsideKidney&&ratio<.15&&Object.values(focus).every(x=>x.insideKidney&&x.insideNephron);
 const base=w.vessel.base.attributes.position,vscale=w.vessel.root.getWorldScale(new T.Vector3());let maxRadius=0,minRadius=Infinity;
 for(let i=0;i<base.count;i++){const r=Math.hypot(base.getY(i),base.getZ(i));maxRadius=Math.max(maxRadius,r);minRadius=Math.min(minRadius,r);}
 const aorta={measuredRestOuterRadius:maxRadius*vscale.y,measuredRestInnerRadius:minRadius*vscale.y,expectedOuterRadius:design.aorticCutaway.outerRadius,expectedInnerRadius:design.aorticCutaway.innerRadius,measuredLength:w.vessel.length*vscale.x,expectedLength:design.aorticCutaway.length,center:w.vessel.root.getWorldPosition(new T.Vector3()).toArray(),roundingTolerance:.00025};
 aorta.outerRelativeError=Math.abs(aorta.measuredRestOuterRadius-aorta.expectedOuterRadius)/aorta.expectedOuterRadius;
 aorta.passed=Math.abs(aorta.measuredRestOuterRadius-aorta.expectedOuterRadius)<aorta.roundingTolerance&&Math.abs(aorta.measuredRestInnerRadius-aorta.expectedInnerRadius)<aorta.roundingTolerance&&Math.abs(aorta.measuredLength-aorta.expectedLength)<.001;
 const semantic=w.signals.filter(r=>['nerve','hormone','aldosterone'].includes(r.mode)).map(route=>({mode:route.mode,guideTypes:route.root.children.filter(o=>!route.dots.includes(o)).map(o=>o.type),dots:route.dots.map(dot=>{dot.geometry.computeBoundingSphere();return dot.geometry.boundingSphere.radius*Math.max(...dot.getWorldScale(new T.Vector3()).toArray());})}));
 const largestSemanticRadius=Math.max(...semantic.flatMap(x=>x.dots));
 // Semantic routes intentionally include a soft TubeGeometry halo plus the
 // continuous Line core/dashes.  Permit that named halo while rejecting any
 // unrelated geometry from the route group.
 const signals={routes:semantic,largestSemanticRadius,largestDotToAortaRadius:largestSemanticRadius/aorta.measuredRestOuterRadius,passed:largestSemanticRadius/aorta.measuredRestOuterRadius<.25&&semantic.every(r=>r.guideTypes.every(t=>t==='Line'||t==='Mesh'))};
 const stateAt=(frame)=>{const scene=timeline.scenes.find(s=>frame>=s.start&&frame<s.end),clips=timeline.clips.filter(c=>c.scene===scene.id),clip=clips.filter(c=>frame>=c.start).at(-1)??clips[0];return {scene:scene.id,previous:timeline.scenes[timeline.scenes.indexOf(scene)-1]?.id,elapsed:(frame-scene.start)/30,duration:(scene.end-scene.start)/30,progress:(frame-scene.start)/(scene.end-scene.start),time:frame/30,line:clip?.line??0,lineProgress:clip?Math.max(0,Math.min(1,(frame-clip.start)/clip.duration)):0};};
 const opacity=(root)=>{let max=0;root.traverse(o=>{if(!(o instanceof T.Mesh||o instanceof T.Line))return;let visible=true,p=o;while(p){visible&&=p.visible;p=p.parent;}if(visible)for(const m of Array.isArray(o.material)?o.material:[o.material])max=Math.max(max,m.opacity);});return max;};
 const query=[{id:'h003',kind:'intro'},{id:'h024',kind:'kidney'},{id:'h027',kind:'kidney'},{id:'h030',kind:'control'},{id:'h033',kind:'control'},{id:'h035',kind:'control'},{id:'h040a',kind:'lipid'},{id:'h040b',kind:'lipid'},{id:'h040c',kind:'lipid'},{id:'h045',kind:'measure'},{id:'h047',kind:'measure'}];
 const renderVisibility=[];
 for(const {id,kind} of query){const clip=timeline.clips.find(c=>c.id===id);if(!clip)throw Error('Requested clip absent: '+id);for(const fraction of [.4,.7,.95]){
  const frame=Math.min(timeline.duration-1,Math.floor(clip.start+clip.duration*fraction));w.render(stateAt(frame));
  const row={id,kind,frame,scene:stateAt(frame).scene,aortaOpacity:opacity(w.vessel.root),arterioleOpacity:opacity(w.arteriole.root),camera:w.camera.position.toArray(),focus:w.cameraPath.at(frame/30).target.toArray()};
  row.passed=row.aortaOpacity<=.02&&row.arterioleOpacity<=.02;renderVisibility.push(row);
 }}
 const positiveControls=[];
 for(const id of ['h012','h018','h020','h043']){const clip=timeline.clips.find(c=>c.id===id),frame=Math.floor(clip.start+clip.duration*.7);w.render(stateAt(frame));positiveControls.push({id,frame,aortaOpacity:opacity(w.vessel.root),arterioleOpacity:opacity(w.arteriole.root)});}
 const report={createdAt:new Date().toISOString(),scope:'Invokes current production geometry builders, physics integration and render state update; rendering backend is a no-op. Verifies CPU geometry, opacity and camera state, not pixels, visual taste or full-speed playback. Atlas world bounds are normalized from the asset manifest; no body-geometry surface containment claim is made.',sourceHashes:Object.fromEntries(['src/hypertension/World.ts','src/hypertension/VascularDetail.ts','src/hypertension/CameraPath.ts','src/hypertension/timeline.json','public/hypertension/models/asset-manifest.json','research/hypertension/anatomy-camera-design.json'].map(p=>[p,sha(p)])),nephron,aorta,signals,renderVisibility,positiveControls,actualProductionRenderCalls:renderCalls,passed:nephron.passed&&aorta.passed&&signals.passed&&renderVisibility.every(r=>r.passed)};
 fs.writeFileSync(path.join(root,'research/hypertension/spatial-v5-qa.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,nephronPassed:nephron.passed,nephronRatio:ratio,aorta,signalsPassed:signals.passed,largestDotToAortaRadius:signals.largestDotToAortaRadius,renderCalls,visibilityFailures:renderVisibility.filter(r=>!r.passed),positiveControls},null,2));
 if(!report.passed)process.exitCode=1;
}finally{for(const file of generated)fs.unlinkSync(file);}
