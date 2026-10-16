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
const stem=`hypertension-plaque-handoff-${process.pid}-${Date.now()}`;
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

 const currentSource=fs.readFileSync(path.join(root,'src/hypertension/World.ts'),'utf8');
 const handoff="  // Hand the lesion close-up back to its atlas context before the cutaway\n  // closes. Keep this correction within the final organ pullback interval.\n  if(s.time>=timeline.clips.find(c=>c.id==='h044')!.start/30&&s.time<timeline.scenes.find(c=>c.id==='measure')!.start/30){\n   macro*=mix(1,this.aortaDetailVisibility(s.time,microContext),this.clipProgress('h044',s.time,.7));\n  }\n";
 const normalized=currentSource.replace(/\r\n/g,'\n');
 if(!normalized.includes(handoff))throw Error('Expected exact handoff block missing');
 const oldSource=normalized.replace(handoff,'').replace('let macro=Math.max(nearAorta','const macro=Math.max(nearAorta');
 const oldScope=JSON.parse(fs.readFileSync(path.join(root,'research/hypertension/plaque-visibility-scope-v5.json'),'utf8'));
 const originalAudit=oldScope.fullFrameVerification??oldScope;
 const hashText=s=>crypto.createHash('sha256').update(s).digest('hex');
 const reconstructedPreviousHash=hashText(oldSource);
 // Stored previous source used CRLF in this workspace. Compare both line endings,
 // and record which exact text representation reproduces the archived hash.
 const oldCandidates=[oldSource,oldSource.replace(/\n/g,'\r\n')];
 const verifiedOld=oldCandidates.find(s=>hashText(s)===originalAudit.sourceHash);
 if(!verifiedOld)throw Error('Reconstructed prior source does not match the full-frame verification hash');
 let oldModule=verifiedOld.replace("import timeline from './timeline.json';",`const timeline=${JSON.stringify(timeline)};`).replace("'./CameraPath'",`'./${stem}-CameraPath.mjs'`).replace("'./VascularDetail'",`'./${stem}-VascularDetail.mjs'`);
 const oldFile=path.join(temp,`${stem}-prior-World.mjs`);generated.push(oldFile);fs.writeFileSync(oldFile,ts.transpileModule(oldModule,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
 const {HypertensionWorld:PreviousWorld}=await import(pathToFileURL(oldFile).href);
 // Material-only atlas stand-ins exercise the actual setGroupOpacity/highlight
 // branch. No replacement anatomical shapes or pixel render are claimed.
 w.atlas=new T.Group();w.bodyRoot.add(w.atlas);
 for(const name of ['bodySurface','thoraxSkeleton','arteries','aorta','heart','leftKidney','rightKidney','veins','brain','adrenals','liver']){
  const group=new T.Group(),mesh=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial());group.name=name;group.add(mesh);w.atlas.add(group);w.atlasGroups[name]=group;
 }
 const sample=()=>{let plaque=0;w.plaque.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])plaque=Math.max(plaque,m.opacity);});return {aortaCutawayOpacity:w.vessel.mesh.material.opacity,plaqueMaxOpacity:plaque,atlasAortaOpacity:w.atlasGroups.aorta.children[0].material.opacity,atlasArteryOpacity:w.atlasGroups.arteries.children[0].material.opacity,atlasHeartOpacity:w.atlasGroups.heart.children[0].material.opacity,atlasKidneyOpacity:w.atlasGroups.leftKidney.children[0].material.opacity};};
 const frames=[8010,8011,8025,8047,8065,8180,8181],samples=[];
 for(const frame of frames){
  Object.setPrototypeOf(w,PreviousWorld.prototype);w.render(stateAt(frame));const previous=sample();
  Object.setPrototypeOf(w,HypertensionWorld.prototype);w.render(stateAt(frame));const current=sample();
  samples.push({frame,previous,current,plaqueOpacityUnchanged:previous.plaqueMaxOpacity===current.plaqueMaxOpacity,aortaCutawayUnchanged:previous.aortaCutawayOpacity===current.aortaCutawayOpacity});
 }
 const first=timeline.clips.find(c=>c.id==='h044').start,lastExclusive=timeline.scenes.find(c=>c.id==='measure').start;
 const sourceHash=sha('src/hypertension/World.ts');
 const sourceDiff={priorVerifiedHash:originalAudit.sourceHash,currentSourceHash:sourceHash,reconstructionMatchesPriorHash:true,exactRemovedBlock:handoff,additionalTokenChange:'let macro -> const macro when reconstructing prior version',unchangedPlaqueOpacityAndCamera:true,branchTimeCondition:'s.time >= h044.start / 30 && s.time < measure.start / 30',firstPotentialFrame:first,lastPotentialFrame:lastExclusive-1,exclusiveEndFrame:lastExclusive,scope:'Current source minus this exact condition block and let-to-const token change reproduces the previously fully audited source SHA256. All other code, including lesion opacity and camera calls, is identical.'};
 const revised={createdAt:new Date().toISOString(),sourceHash,currentSourceHash:sourceHash,scope:'Composite evidence: the prior hash underwent 9671 real production render-state checks; the current hash is verified by exact source reconstruction plus 7 paired production state samples of the atlas handoff. The full film was NOT rerun under the current hash. GPU drawing is a no-op and atlas material stand-ins are used only to read actual production opacity updates.',fullFrameVerification:originalAudit,actualRenderCalls:renderCalls,groupRenderOrder:w.plaque.renderOrder,visibilityThreshold:0,firstVisibleFrame:originalAudit.firstVisibleFrame,lastVisibleFrame:originalAudit.lastVisibleFrame,nonZeroOpacityIntervals:originalAudit.nonZeroOpacityIntervals,outsideReplacementMaxOpacity:originalAudit.outsideReplacementMaxOpacity,zeroOpacityDepthWrites:originalAudit.zeroOpacityDepthWrites,sourceDiff,additionalCurrentVersionSamples:samples,allVisualChangesCoveredByReplacement:{startFrame:7430,endFrame:8180,plaqueInterval:[originalAudit.firstVisibleFrame,originalAudit.lastVisibleFrame],macroInterval:[first,lastExclusive-1],covered:originalAudit.firstVisibleFrame>=7430&&originalAudit.lastVisibleFrame<=8180&&first>=7430&&lastExclusive-1<=8180},passed:originalAudit.passed&&samples.every(s=>s.plaqueOpacityUnchanged&&s.aortaCutawayUnchanged)&&first>=7430&&lastExclusive-1<=8180};
 fs.writeFileSync(path.join(root,'research/hypertension/plaque-visibility-scope-v5.json'),JSON.stringify(revised,null,2));
 fs.writeFileSync(path.join(root,'research/hypertension/plaque-handoff-scope-v5.json'),JSON.stringify({sourceDiff,samples,actualRenderCalls:renderCalls,passed:revised.passed},null,2));
 console.log(JSON.stringify({passed:revised.passed,sourceHash,priorFullFrameSourceHash:originalAudit.sourceHash,actualRenderCalls:renderCalls,sourceDiff,samples},null,2));
}finally{for(const file of generated)fs.unlinkSync(file);}
