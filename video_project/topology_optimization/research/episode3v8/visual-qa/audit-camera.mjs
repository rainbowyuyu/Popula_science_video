/** Independent v8 camera/geometry audit. No video render or production edits.
 * Run only after final audio timing: node .../audit-camera.mjs
 * --allow-draft is an explicitly provisional diagnostic, never a final pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import ts from 'typescript';
import * as T from 'three';

const qa=import.meta.dirname,root=path.resolve(qa,'../../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const allowDraft=process.argv.includes('--allow-draft');
const diagnostic=process.argv.includes('--diagnostic');
const timeline=read('src/episode3v8/timeline.json'),story=read('research/episode3v8/story.json');
const manifest=read('public/episode3v7/models/pavilion-manifest.json');
const fps=timeline.fps??30;
const expectedCounts={intro:4,straight:7,frame:5,bracket:5,hip:5,gravity:10,wind:8,return:3};
const timingProblems=[];
if(timeline.draft)timingProblems.push('timeline is marked draft');
if(timeline.clips.length!==47)timingProblems.push('timeline does not have 47 clips');
for(let i=0;i<story.clips.length;i++){
 const a=story.clips[i],b=timeline.clips[i];
 if(!b||['id','scene','line','text','spoken'].some(k=>a[k]!==b[k]))timingProblems.push(`story mismatch at ${a.id}`);
}
for(const [scene,count]of Object.entries(expectedCounts))if(timeline.clips.filter(c=>c.scene===scene).length!==count)timingProblems.push(`${scene} count`);
if(timeline.scenes.some(s=>s.id==='inverse'))timingProblems.push('obsolete inverse scene');
const reference=timeline.scenes.find(s=>s.id==='references');
if(!reference||reference.end-reference.start!==12*fps)timingProblems.push('references must hold 12 seconds');
const publicTimeline='public/episode3v8/timeline.json';
if(!fs.existsSync(path.join(root,publicTimeline))||sha(publicTimeline)!==sha('src/episode3v8/timeline.json'))timingProblems.push('public/src actual timeline mismatch');
if(!allowDraft&&timingProblems.length)throw Error(`Actual v8 timing is not ready: ${timingProblems.join('; ')}`);

const sources=['src/episode3v8/World.ts','src/episode3v8/ForceStory.ts','src/episode3v8/StressField.ts','src/episode3v8/SurfaceSampling.ts','src/episode3v8/force-evidence.json','src/episode3v8/Film.tsx','src/episode3v8/Annotations.tsx','src/episode3v8/annotations.json','src/episode3v8/timeline.json','research/episode3v8/story.json','public/episode3v7/models/pavilion-manifest.json','public/episode3v7/models/pavilion-v7.glb','public/episode3v7/physics/dynamic-response.json','public/episode3v7/physics/static-cases.json'];
const provenance=sources.map(file=>({file,sha256:sha(file)}));
const source=fs.readFileSync(path.join(root,'src/episode3v8/World.ts'),'utf8');
await build({entryPoints:[path.join(root,'src/episode3v8/World.ts')],outfile:path.join(qa,'World.audit.mjs'),bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent'});
const {JoineryWorld}=await import(pathToFileURL(path.join(qa,'World.audit.mjs'))+'?'+sha('src/episode3v8/World.ts'));
const hasPartPath=typeof JoineryWorld.prototype.getPartAssemblyQ==='function';
if(!hasPartPath&&!/const partQ=p\.q;part\.offset\.copy\(this\.offset\(part\.info,partQ\)\)/.test(source))throw Error('Renderer offset mapping changed. Inspect actual per-part method before auditing.');
// Import the exact stateAt function from Film rather than reimplementing it.
const film=fs.readFileSync(path.join(root,'src/episode3v8/Film.tsx'),'utf8');
const ast=ts.createSourceFile('Film.tsx',film,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const stateNode=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='stateAt');
if(!stateNode)throw Error('Film stateAt export missing');
const stateCode=ts.transpileModule(stateNode.getText(ast).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const stateAt=new Function('timeline','clamp',`${stateCode}; return stateAt;`)(timeline,x=>Math.max(0,Math.min(1,x)));

// Read actual GLB POSITION accessors and ancestor matrices. Bounds are computed
// from the delivered mesh, not assumed from manifest labels or part counts.
function glbBounds(){
 const buf=fs.readFileSync(path.join(root,'public/episode3v7/models/pavilion-v7.glb'));
 if(buf.readUInt32LE(0)!==0x46546c67)throw Error('Not a GLB');
 let json,bin;for(let i=12;i<buf.length;){const n=buf.readUInt32LE(i),type=buf.readUInt32LE(i+4),chunk=buf.subarray(i+8,i+8+n);if(type===0x4e4f534a)json=JSON.parse(chunk.toString());if(type===0x004e4942)bin=chunk;i+=n+8;}
 const ids=new Set(manifest.parts.map(p=>p.id)),bounds=new Map();
 const walk=(index,parent,owner)=>{const node=json.nodes[index];const own=ids.has(node.name)?node.name:owner;let m=new T.Matrix4();
  if(node.matrix)m.fromArray(node.matrix);else m.compose(new T.Vector3(...(node.translation??[0,0,0])),new T.Quaternion(...(node.rotation??[0,0,0,1])),new T.Vector3(...(node.scale??[1,1,1])));m.premultiply(parent);
  if(node.skin!==undefined)throw Error('Skinned geometry requires a different camera auditor');
  if(node.mesh!==undefined&&own){let box=bounds.get(own);if(!box){box=new T.Box3();bounds.set(own,box);}
   for(const primitive of json.meshes[node.mesh].primitives){const acc=json.accessors[primitive.attributes.POSITION];if(acc.componentType!==5126||acc.type!=='VEC3'||acc.sparse)throw Error('Unsupported GLB position accessor');const view=json.bufferViews[acc.bufferView];const off=(view.byteOffset??0)+(acc.byteOffset??0),stride=view.byteStride??12;
    for(let i=0;i<acc.count;i++){const at=off+i*stride;box.expandByPoint(new T.Vector3(bin.readFloatLE(at),bin.readFloatLE(at+4),bin.readFloatLE(at+8)).applyMatrix4(m));}
   }
  }
  for(const child of node.children??[])walk(child,m,own);
 };
 for(const index of json.scenes[json.scene??0].nodes)walk(index,new T.Matrix4(),null);
 return bounds;
}
const meshBounds=glbBounds();
const geometryChecks=manifest.parts.map(info=>{const b=meshBounds.get(info.id);if(!b)throw Error(`No actual geometry for ${info.id}`);const declared=new T.Box3(new T.Vector3(...info.bbox_three[0]),new T.Vector3(...info.bbox_three[1]));return {part:info.id,maxBoundError:Math.max(b.min.distanceTo(declared.min),b.max.distanceTo(declared.max))};});
const world=Object.create(JoineryWorld.prototype);world.manifest=manifest;
world.parts=new Map(manifest.parts.map(info=>[info.id,{info,centroid:meshBounds.get(info.id).getCenter(new T.Vector3())}]));world.prepareTravel();
const physics=read('public/episode3v7/physics/dynamic-response.json');
const maxU=Math.max(1e-8,...physics.snapshots.flatMap(s=>Object.values(s.nodalDisplacements).map(u=>Math.hypot(...u))));
const displayGain=Math.max(1,Math.min(250,.14/maxU));
const camera=new T.PerspectiveCamera(34,16/9,.035,240);
const project=(v,cam=camera)=>{const q=v.clone().project(cam);return [(q.x+1)*960,(1-q.y)*540,q.z];};
const inside=[],near=[],steps=[],records=[],boundaries=[],lineBoundaries=[];let previous;
let minimumClearance=Infinity;
for(let frame=0;frame<timeline.duration;frame++){
 const s=stateAt(frame),p=world.blendedPose(s);camera.position.copy(p.position);camera.lookAt(p.target);camera.updateMatrixWorld(true);
 const offsets=new Map(manifest.parts.map(info=>[info.id,world.offset(info,hasPartPath?world.getPartAssemblyQ(info.id,s,p):p.q)]));
 const displacementBound=p.deform*displayGain*maxU;
 for(const info of manifest.parts){const box=meshBounds.get(info.id).clone().translate(offsets.get(info.id)).expandByScalar(displacementBound);const clearance=box.distanceToPoint(p.position);minimumClearance=Math.min(minimumClearance,clearance);if(box.containsPoint(p.position))inside.push({frame,scene:s.scene,line:s.line,part:info.id,displacementBound});if(clearance<camera.near)near.push({frame,scene:s.scene,line:s.line,part:info.id,clearance});}
 if(previous){let partDelta=0,part='';for(const [id,off]of offsets){const delta=off.distanceTo(previous.offsets.get(id));if(delta>partDelta){partDelta=delta;part=id;}}
  let screen=null;if(part){const centre=world.parts.get(part).centroid;const a=project(centre.clone().add(previous.offsets.get(part)),previous.camera),b=project(centre.clone().add(offsets.get(part)));const visible=v=>v[0]>=0&&v[0]<=1920&&v[1]>=0&&v[1]<=1080&&v[2]>=-1&&v[2]<=1;screen={before:a,after:b,pixelDelta:Math.hypot(a[0]-b[0],a[1]-b[1]),centreVisible:visible(a)||visible(b)};}
  const step={frame,scene:s.scene,line:s.line,cameraDelta:p.position.distanceTo(previous.p.position),targetDelta:p.target.distanceTo(previous.p.target),rotationRadians:camera.quaternion.angleTo(previous.camera.quaternion),partDelta,part,screen,qDelta:Math.abs(p.q-previous.p.q)};steps.push(step);
  if(s.scene!==previous.s.scene)boundaries.push({previous:previous.s.scene,...step});
  if(s.scene!==previous.s.scene||s.line!==previous.s.line)lineBoundaries.push({previousScene:previous.s.scene,previousLine:previous.s.line,...step});
 }
 if(frame%15===0||timeline.clips.some(c=>c.start===frame)||timeline.scenes.some(c=>c.start===frame))records.push({frame,scene:s.scene,line:s.line,lineProgress:s.lineProgress,q:p.q,position:p.position.toArray(),target:p.target.toArray(),deformationBound:displacementBound});
 previous={s,p,offsets,camera:camera.clone()};
}
const peak=(key,n=12)=>[...steps].sort((a,b)=>b[key]-a[key]).slice(0,n);
const ranges=items=>{const grouped=new Map();for(const x of items){const key=`${x.scene}/${x.part}`;const g=grouped.get(key)??[];g.push(x);grouped.set(key,g);}return [...grouped.values()].flatMap(g=>{const out=[];for(const x of g){const last=out.at(-1);if(last&&last.end+1===x.frame)last.end=x.frame;else out.push({scene:x.scene,part:x.part,start:x.frame,end:x.frame});}return out;});};
const sourceChanged=provenance.filter(p=>sha(p.file)!==p.sha256);
const checks={geometryBoundsMatch:geometryChecks.every(x=>x.maxBoundError<.003),all117PartsPresent:meshBounds.size===117,zeroCameraInsideConservativeBounds:inside.length===0,nearPlaneClearance:near.length===0,sceneBoundaryCameraStepsUnder025m:boundaries.every(x=>x.cameraDelta<.25&&x.targetDelta<.25),sceneBoundaryPartStepsUnder015m:boundaries.every(x=>x.partDelta<.15),sourceUnchangedDuringAudit:sourceChanged.length===0};
const summary={scope:'Every frame of actual v8 Film stateAt; actual GLB bounds expanded by an upper bound on displayed native displacement. No rendered-pixel/aesthetic claim.',provisional:diagnostic||timingProblems.length>0,diagnostic,timingProblems,provenance,totalFrames:timeline.duration,fps,sceneRanges:timeline.scenes,hipDemonstration:{line:1,offsetPolicy:hasPartPath?'actual World.getPartAssemblyQ(partID,state,pose)':'all parts use actual renderer partQ=p.q; no obsolete v7 line2 override'},geometryChecks,minimumClearance,displayGain,cameraInside:ranges(inside),cameraNear:ranges(near),boundaries,lineBoundaries,maxCameraStep:peak('cameraDelta'),maxPartStep:peak('partDelta'),maxRotationStep:peak('rotationRadians'),checks,formalGeometryPass:!diagnostic&&!timingProblems.length&&Object.values(checks).every(Boolean),sourceChanged,limitations:['Conservative AABBs can flag empty space around diagonal members. A positive flag needs rendered or triangle review; zero is a sufficient clearance result.','This checks geometry persistence and coordinate continuity, not text occlusion, labels, material opacity, aesthetics, or audible timing.','Step thresholds are review gates; smoothness still requires motion playback.']};
fs.writeFileSync(path.join(qa,'camera-audit.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(qa,'camera-frames.json'),JSON.stringify(records));
console.log(JSON.stringify({report:path.join(qa,'camera-audit.json'),provisional:summary.provisional,totalFrames:timeline.duration,minimumClearance,cameraInsideRanges:summary.cameraInside.length,checks,formalGeometryPass:summary.formalGeometryPass},null,2));
