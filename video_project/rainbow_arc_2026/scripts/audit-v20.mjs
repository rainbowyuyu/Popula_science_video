import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as T from 'three';

// Source/asset integrity and numerical motion gates for the ACTUAL V20 entry.
// This does not claim that a sampled contact sheet proves normal-speed motion.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'research/qa-v20');fs.mkdirSync(output,{recursive:true});
const errors=[],warnings=[],bindings=new Map(),snapshots=new Map();
const absolute=p=>path.isAbsolute(p)?p:path.join(root,p);
const relative=p=>path.relative(root,absolute(p)).replaceAll('\\','/');
const read=p=>fs.readFileSync(absolute(p),'utf8');
const json=p=>JSON.parse(read(p));
const bytesHash=b=>crypto.createHash('sha256').update(b).digest('hex');
function hash(p){const fd=fs.openSync(absolute(p),'r'),h=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(8*1024*1024);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))h.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}return h.digest('hex');}
const check=(ok,message)=>{if(!ok)errors.push(message);return !!ok;};
function bind(p){const file=relative(p);if(!check(!file.startsWith('../')&&!path.isAbsolute(file),'External render input: '+file)||!check(fs.existsSync(absolute(p))&&fs.statSync(absolute(p)).isFile(),'Missing render input: '+file))return;const row={file,sha256:hash(p)};if(!bindings.has(file))bindings.set(file,row);return bindings.get(file);}
const report={version:'V20',schema:'rainbow.v20.active-source-gate/1',createdUTC:new Date().toISOString(),projectRoot:root,
 scope:'Active V20 import graph, file integrity, compiled camera and world numerical samples, actual Qwen source-frame scheduling, character GLB structure, timeline/captions, independent optics. CPU/source checks only. Rendered composition, identity, direction, screen occlusion and normal-speed seam quality require visual review.',
 gpuVisualReviewApproved:false,humanNormalSpeedPlayback:false,humanListening:false,errors,warnings};
async function section(name,fn){try{await fn();}catch(e){errors.push(name+': '+String(e));report[name]={completed:false,error:String(e)};}}
const snapshotPlugin={name:'frozen-v20-source',setup(b){b.onLoad({filter:/\.(tsx?|jsx?|json)$/},args=>{const file=relative(args.path);if(file.startsWith('../'))return;if(!snapshots.has(file))snapshots.set(file,fs.readFileSync(args.path));const source=snapshots.get(file).toString('utf8');return {contents:source+(file==='src/V20RainbowArcFilm.tsx'?'\nexport {applyCamera as auditApplyCameraV20};\n':''),loader:path.extname(file).slice(1),resolveDir:path.dirname(args.path)};});}};
let runtime,active=[];
await section('sourceGraph',async()=>{
 const graph=await build({entryPoints:[absolute('src/index-v20.tsx')],bundle:true,write:false,platform:'node',format:'esm',packages:'external',metafile:true,logLevel:'silent',plugins:[snapshotPlugin]});
 active=Object.keys(graph.metafile.inputs).filter(p=>!p.startsWith('<')).map(relative);
 for(const file of active){const b=snapshots.get(file);if(b)bindings.set(file,{file,sha256:bytesHash(b)});else bind(file);}
 const entry=read('src/index-v20.tsx');check(/id=["']RainbowArcV20["']/.test(entry)&&/fps=\{30\}/.test(entry)&&/width=\{1920\}/.test(entry)&&/height=\{1080\}/.test(entry),'Unexpected V20 composition format');
 for(const p of ['src/V20RainbowArcFilm.tsx','src/HumanObserverV20.ts','src/RealityBridgeV20.tsx'])check(active.includes(p),'Missing active V20 implementation: '+p);
 const nondeterministic=active.filter(p=>/\.tsx?$/.test(p)&&/\b(?:Date\.now|Math\.random|requestAnimationFrame|performance\.now)\s*\(/.test(read(p)));
 check(!nondeterministic.length,'Active sources call nondeterministic clock/random APIs: '+nondeterministic.join(', '));
 for(const p of ['package.json','package-lock.json','tsconfig.json','scripts/render-v20.mjs','scripts/finalize-audio-v15.mjs','scripts/audit-v20.mjs','scripts/qa-delivery-v20.py','work/output-root-v20.json'])bind(p);
 const exports=["export * from './src/Timeline';","export * from './src/CinematicRouteV10';","export * from './src/WorldV10';","export * from './src/RealityBridgeV20';","export * from './src/EditorialOverlayV10';","export {auditApplyCameraV20} from './src/V20RainbowArcFilm';"].join('\n');
 const compiled=path.join(output,'active-runtime-v20.mjs');await build({stdin:{contents:exports,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:compiled,logLevel:'silent',plugins:[snapshotPlugin]});runtime=await import(pathToFileURL(compiled).href+'?audit='+crypto.randomUUID());
 const req=createRequire(import.meta.url),p=spawnSync(process.execPath,[req.resolve('typescript/bin/tsc'),'--noEmit'],{cwd:root,encoding:'utf8',timeout:120000});
 check(p.status===0,'TypeScript check failed');report.typecheck={exitCode:p.status,output:(p.stdout??'')+(p.stderr??'')};report.sourceGraph={entry:'src/index-v20.tsx',inputs:active,nondeterministic};
});
await section('timeline',async()=>{
 const {timeline,stateAt}=runtime,source=json('src/timeline.json');
 check(source.timeUnit==='seconds'&&!source.notFinal,'Timeline must be final and authored in seconds');
 check(timeline.fps===30&&Number.isInteger(timeline.duration),'Invalid timeline frame clock');
 check(timeline.scenes[0].start===0&&timeline.scenes.at(-1).end===timeline.duration,'Timeline does not cover entire film');
 for(const [i,s]of timeline.scenes.entries())check(s.end>s.start&&(!i||timeline.scenes[i-1].end===s.start),'Scene gap/overlap: '+s.id);
 for(const c of timeline.captions)check(c.end>c.start&&c.start>=0&&c.end<=timeline.duration,'Invalid subtitle interval: '+c.text);
 let unassigned=0;for(let f=0;f<timeline.duration;f++)if(!stateAt(f).scene)unassigned++;
 check(unassigned===0,'Unassigned scene frames');
 const refs=timeline.scenes.find(s=>s.id==='references');check(refs&&refs.end-refs.start>=150,'References must retain at least five seconds');
 const maxCaptionGlyphs=Math.max(...timeline.captions.map(c=>[...c.text].length));check(maxCaptionGlyphs<=24,'Caption exceeds 24 glyphs');
 report.timeline={frames:timeline.duration,fps:30,seconds:timeline.duration/30,scenes:timeline.scenes,captions:timeline.captions.length,maxCaptionGlyphs,unassignedFrames:unassigned,referencesFrames:refs?.end-refs?.start};
});
await section('camera',async()=>{
 const {timeline,stateAt,auditApplyCameraV20}=runtime,c=new T.PerspectiveCamera(45,1920/1080,.03,400);let previous,maxTranslation=0,maxRotation=0,maxFov=0,invalid=0;
 const pose=f=>{auditApplyCameraV20(c,stateAt(f));return [...c.position.toArray(),...c.quaternion.toArray(),c.fov];};
 for(let f=0;f<timeline.duration;f++){const values=pose(f);if(!values.every(Number.isFinite))invalid++;if(previous){maxTranslation=Math.max(maxTranslation,c.position.distanceTo(previous.p));maxRotation=Math.max(maxRotation,T.MathUtils.radToDeg(c.quaternion.angleTo(previous.q)));maxFov=Math.max(maxFov,Math.abs(c.fov-previous.fov));}previous={p:c.position.clone(),q:c.quaternion.clone(),fov:c.fov};}
 const frames=[0,...timeline.scenes.flatMap(s=>[s.start,Math.floor((s.start+s.end)/2),s.end-1])],poses=new Map(frames.map(f=>[f,JSON.stringify(pose(f))]));
 const deterministic=[...frames].reverse().every(f=>{pose(timeline.duration-1);pose(0);return JSON.stringify(pose(f))===poses.get(f);});
 check(invalid===0&&maxTranslation<.75&&maxRotation<5&&maxFov<1.5&&deterministic,'Active V20 camera has invalid/jumping/order-dependent poses');
 report.camera={implementation:'V20RainbowArcFilm.applyCamera + CinematicRouteV10',sampledFrames:timeline.duration,invalid,maxTranslationPerFrame:maxTranslation,maxRotationDegreesPerFrame:maxRotation,maxFovStep:maxFov,deterministic};
});
await section('world',async()=>{
 const {WorldV10,timeline,stateAt}=runtime,world=new WorldV10(undefined,new T.Scene());let invalid=0;
 const frames=[...new Set(timeline.scenes.flatMap(s=>[s.start,Math.floor((s.start+s.end)/2),s.end-1]))];
 const snapshot=f=>{world.update(stateAt(f));world.group.updateMatrixWorld(true);const rows=[];world.group.traverse(o=>{const a=[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()];if(!a.every(Number.isFinite))invalid++;rows.push(a);if(o.isInstancedMesh)rows.push(Array.from(o.instanceMatrix.array));});return bytesHash(JSON.stringify(rows));};
 const hashes=new Map(frames.map(f=>[f,snapshot(f)])),deterministic=[...frames].reverse().every(f=>{snapshot(0);return snapshot(f)===hashes.get(f);});world.dispose();
 check(!invalid&&deterministic,'Current WorldV10 invalid or order-dependent transforms');report.world={implementation:'WorldV10',sampledFrames:frames.length,frames,invalidTransforms:invalid,deterministic};
});
await section('optics',async()=>{
 const p=spawnSync(process.execPath,['research/physics/check-optics.mjs'],{cwd:root,encoding:'utf8',timeout:120000});
 check(p.status===0,'Geometric optics numerical gate failed');report.optics=json('research/physics/verification.json');check(report.optics.passed,'Optics report failed');bind('src/optics.ts');bind('research/physics/check-optics.mjs');
});
await section('character',async()=>{
 const p='public/assets_v20/characters/v20_human_rainbow_proxy.glb';bind(p);const b=fs.readFileSync(absolute(p));check(b.toString('ascii',0,4)==='glTF','Human asset is not GLB');const length=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+length));
 const bones=new Set((g.skins??[]).flatMap(s=>s.joints)),animations=(g.animations??[]).map(a=>a.name);check(bones.size>=18&&animations.length>0,'Human lacks expected complete rig/animation');
 const provenance='work/v20-character/v20-character-provenance.json';bind(provenance);check(json(provenance).glb_sha256===hash(p),'Human GLB differs from character provenance');
 report.character={file:p,boneCount:bones.size,animations,meshes:g.meshes?.length,scope:'GLB structure and provenance only; physical proportions/face/motion require rendered inspection.'};
});
await section('qwen',async()=>{
 const {bridgesV20,bridgeLayersAtV20,timeline}=runtime;const rows=[],scheduled=new Map(bridgesV20.map(b=>[b.id,[]]));let maxLayers=0;
 for(let f=0;f<timeline.duration;f++){const layers=bridgeLayersAtV20(f);maxLayers=Math.max(maxLayers,layers.length);for(const l of layers){check(Number.isInteger(l.sourceFrame)&&l.sourceFrame>=0&&l.sourceFrame<l.bridge.frames,'Invalid bridge source index at '+f);scheduled.get(l.id)?.push({frame:f,source:l.sourceFrame});}}
 for(const b of bridgesV20){const dir='public/'+path.posix.dirname(b.framePath),provenance=dir+'/provenance.json',acceptance=dir+'/visual-acceptance.json';
  if(!bind(provenance)||!bind(acceptance))continue;const meta=json(provenance),review=json(acceptance);check(meta.taskId===b.taskId&&meta.frameCount===b.frames&&meta.fps===30,'Qwen manifest/provenance mismatch: '+b.id);check(review.status==='pass'&&review.providerSHA256===meta.providerSHA256,'Qwen sampled source acceptance missing/stale: '+b.id);
  const sourceFrames=[];for(let i=0;i<b.frames;i++){const p='public/'+b.framePath+'/frame_'+String(i+1).padStart(4,'0')+'.jpg';const row=bind(p);if(row){sourceFrames.push(row.sha256);check(row.sha256===meta.frameHashes?.[i],'Published Qwen frame differs from provenance: '+b.id+' '+i);}}
  const used=scheduled.get(b.id)??[];let sequenceSkips=0;for(let i=1;i<used.length;i++)if(used[i].source!==used[i-1].source+1)sequenceSkips++;
  check(!sequenceSkips,'Qwen source sequence drops/repeats frames: '+b.id);
  rows.push({id:b.id,taskId:b.taskId,nativeFrames:b.frames,publishedFrames:sourceFrames.length,scheduledFrames:used.length,filmRange:used.length?[used[0].frame,used.at(-1).frame]:null,sourceRange:used.length?[used[0].source,used.at(-1).source]:null,sequenceSkips,reviewScope:review.reviewScope??review.scope??'sampled source frames',fullNormalSpeedPlaybackChecked:review.fullNormalSpeedPlaybackChecked===true});
 }
 const transitionManifest=json('src/transitions-v20.json');
 report.qwen={clips:rows,fallbacks:transitionManifest.fallbacks??[],maxLayers,scope:'Native frame sequence integrity and sampled-source acceptance. Composited endpoint seams remain separate visual QA.'};
});
await section('assets',async()=>{
 const statics=[...new Set(active.filter(p=>/\.tsx?$/.test(p)).flatMap(p=>[...read(p).matchAll(/staticFile\(['"]([^'"]+)['"]\)/g)].map(m=>m[1])))];for(const p of statics)bind('public/'+p);
 // PaintedScene uses dynamic paths, which literal staticFile extraction cannot see.
 if(fs.existsSync(absolute('public/assets_v20/painted')))for(const p of fs.readdirSync(absolute('public/assets_v20/painted')))if(/\.(png|jpe?g)$/.test(p))bind('public/assets_v20/painted/'+p);
 if(fs.existsSync(absolute('public/assets_v20/full-art'))){
  for(const dir of fs.readdirSync(absolute('public/assets_v20/full-art'))){
   const p='public/assets_v20/full-art/'+dir+'/keyframe-1920x1080.png';
   if(fs.existsSync(absolute(p)))bind(p);
  }
 }
 bind('public/audio_v18/master-v18.wav');bind('research/qa-v18/mix-report-v18-painting-summer.json');bind('research/qa-v18/audio-v18-painting-summer.json');
 report.assets={literalStaticFiles:statics,scope:'Active literal files plus dynamic V20 painted/Qwen assets and current Painting Summer master.'};
});
report.sourceHashes=[...bindings.values()].sort((a,b)=>a.file.localeCompare(b.file));
report.sourceChangedDuringAudit=report.sourceHashes.filter(r=>!fs.existsSync(absolute(r.file))||hash(r.file)!==r.sha256).map(r=>r.file);
check(report.sourceHashes.length>0&&!report.sourceChangedDuringAudit.length,'Source changed during audit: '+report.sourceChangedDuringAudit.join(', '));
report.passed=errors.length===0;report.completedUTC=new Date().toISOString();
fs.writeFileSync(path.join(output,'audit-v20.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(output,'audit-v20.md'),`# V20 actual source audit\n\n${report.passed?'PASS':'FAIL'}\n\n${report.scope}\n\n${errors.map(e=>'- '+e).join('\n')}\n\nSource/resource hash bindings: ${report.sourceHashes.length}.\n`);
console.log(JSON.stringify({version:report.version,passed:report.passed,errors,warnings,hashBindings:report.sourceHashes.length,camera:report.camera,qwen:report.qwen,output:path.join(output,'audit-v20.json')},null,2));
if(!report.passed)process.exitCode=1;
