import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as T from 'three';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'research/qa-v19-repair');fs.mkdirSync(out,{recursive:true});
const version='V19Repair',entry='src/index-v19-repair.tsx',film='src/V19RepairRainbowArcFilm.tsx';
const errors=[],warnings=[],bindings=new Map(),snapshots=new Map();
const absolute=p=>path.isAbsolute(p)?p:path.join(root,p);
const relative=p=>path.relative(root,absolute(p)).replaceAll('\\','/');
const read=p=>fs.readFileSync(absolute(p),'utf8'),json=p=>JSON.parse(read(p));
const bytesHash=b=>crypto.createHash('sha256').update(b).digest('hex');
function hash(p){const fd=fs.openSync(absolute(p),'r'),h=crypto.createHash('sha256'),b=Buffer.allocUnsafe(8*1024*1024);try{let n;while((n=fs.readSync(fd,b,0,b.length,null)))h.update(b.subarray(0,n));}finally{fs.closeSync(fd);}return h.digest('hex');}
const check=(ok,message)=>{if(!ok)errors.push(message);return Boolean(ok);};
function bind(p){const file=relative(p);if(bindings.has(file))return bindings.get(file);if(!check(!file.startsWith('../')&&!path.isAbsolute(file),'Input outside project: '+file)||!check(fs.existsSync(absolute(file))&&fs.statSync(absolute(file)).isFile(),'Missing render input: '+file))return;const row={file,sha256:hash(file)};bindings.set(file,row);return row;}
const report={version,schema:'rainbow.v19-repair.active-source-gate/1',createdUTC:new Date().toISOString(),projectRoot:root,
 scope:'Actual repair entry import graph, active file integrity, all-frame camera numerical continuity, timeline and deterministic world transforms, GLB structure, native Qwen scheduling and independent optics. CPU/source checks only. Realism, reflected scene correctness, fish gaze, occlusion and normal-speed handoffs require rendered review.',
 humanNormalSpeedPlayback:false,humanListening:false,gpuVisualReviewApproved:false,errors,warnings};
async function section(name,fn){try{await fn();}catch(e){errors.push(name+': '+String(e));report[name]={completed:false,error:String(e)};}}
const snapshotPlugin=(expose=false)=>({name:'frozen-v19-repair-source',setup(b){b.onLoad({filter:/\.(tsx?|jsx?|json)$/},args=>{const file=relative(args.path);if(file.startsWith('../'))return;if(!snapshots.has(file))snapshots.set(file,fs.readFileSync(args.path));const original=snapshots.get(file).toString('utf8');return {contents:original+(expose&&file===film?'\nexport {applyCamera as auditApplyCameraV19Repair};\n':''),loader:path.extname(file).slice(1),resolveDir:path.dirname(args.path)};});}});
let active=[],runtime;
await section('sourceGraph',async()=>{
 const graph=await build({entryPoints:[absolute(entry)],absWorkingDir:root,bundle:true,write:false,platform:'node',format:'esm',packages:'external',metafile:true,logLevel:'silent',plugins:[snapshotPlugin()]});
 active=Object.keys(graph.metafile.inputs).filter(p=>!p.startsWith('<')).map(relative);
 for(const p of active){const b=snapshots.get(p);if(b)bindings.set(p,{file:p,sha256:bytesHash(b)});else bind(p);}
 for(const p of [entry,film,'src/FishObserverV19Repair.ts','src/WaterPoolV19Repair.ts'])check(active.includes(p),'Missing expected active repair implementation: '+p);
 const source=read(entry);check(/id=["']RainbowArcV19Repair["']/.test(source)&&/fps=\{30\}/.test(source)&&/width=\{1920\}/.test(source)&&/height=\{1080\}/.test(source),'Repair entry must be 1920x1080 at 30 fps');
 const nondeterministic=active.filter(p=>/\.tsx?$/.test(p)&&/\b(?:Date\.now|Math\.random|requestAnimationFrame|performance\.now)\s*\(/.test(read(p)));check(!nondeterministic.length,'Nondeterministic active APIs: '+nondeterministic.join(', '));
 for(const p of ['package.json','package-lock.json','tsconfig.json','scripts/render-v19-repair.mjs','scripts/finalize-audio-v15.mjs','scripts/audit-v19-repair.mjs','scripts/qa-delivery-v19-repair.py','work/output-root-v19-repair.json'])bind(p);
 const worldImport=(read(film).match(/from\s+['"](\.\/World[^'"]+)['"]/)??[])[1]??'./WorldV10';
 const bridgeImport=(read(film).match(/from\s+['"](\.\/RealityBridge[^'"]+)['"]/)??[])[1]??'./RealityBridgeV11';
 const exports=["export * from './src/Timeline';","export * from './src/CinematicRouteV10';",`export * from './src/${worldImport.slice(2)}';`,`export * from './src/${bridgeImport.slice(2)}';`,`export {auditApplyCameraV19Repair} from './${film.slice(0,-4)}';`].join('\n');
 const compiled=path.join(out,'active-runtime-v19-repair.mjs');await build({stdin:{contents:exports,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:compiled,logLevel:'silent',plugins:[snapshotPlugin(true)]});runtime=await import(pathToFileURL(compiled).href+'?audit='+crypto.randomUUID());
 const req=createRequire(import.meta.url),p=spawnSync(process.execPath,[req.resolve('typescript/bin/tsc'),'--noEmit'],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});check(p.status===0,'TypeScript check failed');report.typecheck={exitCode:p.status,output:(p.stdout??'')+(p.stderr??'')};report.sourceGraph={entry,inputs:active,nondeterministic,worldImport,bridgeImport};
});
await section('timeline',async()=>{
 const {timeline,stateAt}=runtime,raw=json('src/timeline.json');check(raw.timeUnit==='seconds'&&!raw.notFinal,'Timeline is not final seconds-based narration');check(timeline.fps===30&&Number.isInteger(timeline.duration),'Invalid frame clock');check(timeline.scenes[0].start===0&&timeline.scenes.at(-1).end===timeline.duration,'Incomplete timeline coverage');
 for(const [i,s]of timeline.scenes.entries())check(s.end>s.start&&(!i||timeline.scenes[i-1].end===s.start),'Scene gap/overlap: '+s.id);
 for(const c of timeline.captions)check(c.end>c.start&&c.start>=0&&c.end<=timeline.duration,'Invalid caption: '+c.text);
 let unassigned=0;for(let f=0;f<timeline.duration;f++)if(!stateAt(f).scene)unassigned++;check(!unassigned,'Frames without an assigned scene');
 const refs=timeline.scenes.find(s=>s.id==='references');check(refs&&refs.end-refs.start>=150,'References must retain at least five seconds');
 report.timeline={frames:timeline.duration,fps:30,seconds:timeline.duration/30,scenes:timeline.scenes,captions:timeline.captions.length,unassignedFrames:unassigned,referencesFrames:refs?.end-refs?.start};
});
await section('camera',async()=>{
 const {timeline,stateAt,auditApplyCameraV19Repair}=runtime,c=new T.PerspectiveCamera(45,1920/1080,.03,400);let previous,maxTranslation=0,maxRotation=0,maxFov=0,invalid=0,translationPeakFrame=0,rotationPeakFrame=0;
 const pose=f=>{auditApplyCameraV19Repair(c,stateAt(f));return [...c.position.toArray(),...c.quaternion.toArray(),c.fov];};
 for(let f=0;f<timeline.duration;f++){const values=pose(f);if(!values.every(Number.isFinite))invalid++;if(previous){const dt=c.position.distanceTo(previous.p),dr=T.MathUtils.radToDeg(c.quaternion.angleTo(previous.q));if(dt>maxTranslation){maxTranslation=dt;translationPeakFrame=f;}if(dr>maxRotation){maxRotation=dr;rotationPeakFrame=f;}maxFov=Math.max(maxFov,Math.abs(c.fov-previous.fov));}previous={p:c.position.clone(),q:c.quaternion.clone(),fov:c.fov};}
 const frames=[0,...timeline.scenes.flatMap(s=>[s.start,Math.floor((s.start+s.end)/2),s.end-1])],poses=new Map(frames.map(f=>[f,JSON.stringify(pose(f))]));const deterministic=[...frames].reverse().every(f=>{pose(timeline.duration-1);pose(0);return JSON.stringify(pose(f))===poses.get(f);});
 check(!invalid&&maxTranslation<.75&&maxRotation<5&&maxFov<1.5&&deterministic,'Repair camera has invalid/jumping/order-dependent poses');report.camera={implementation:film+'.applyCamera',sampledFrames:timeline.duration,invalid,maxTranslationPerFrame:maxTranslation,translationPeakFrame,maxRotationDegreesPerFrame:maxRotation,rotationPeakFrame,maxFovStep:maxFov,deterministic};
});
await section('world',async()=>{
 const {timeline,stateAt}=runtime,World=runtime.WorldV19Repair??runtime.WorldV10;const world=new World(undefined,new T.Scene());let invalid=0;
 const frames=[...new Set(timeline.scenes.flatMap(s=>[s.start,Math.floor((s.start+s.end)/2),s.end-1]))];
 const snapshot=f=>{world.update(stateAt(f));world.group.updateMatrixWorld(true);const rows=[];world.group.traverse(o=>{const a=[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()];if(!a.every(Number.isFinite))invalid++;rows.push(a);if(o.isInstancedMesh)rows.push(Array.from(o.instanceMatrix.array));});return bytesHash(JSON.stringify(rows));};
 const hashes=new Map(frames.map(f=>[f,snapshot(f)])),deterministic=[...frames].reverse().every(f=>{snapshot(0);return snapshot(f)===hashes.get(f);});world.dispose();check(!invalid&&deterministic,'World transforms invalid or order-dependent');report.world={sampledFrames:frames.length,frames,invalidTransforms:invalid,deterministic,scope:'CPU world transforms; GPU water/reflections/vegetation require rendered inspection.'};
});
await section('optics',async()=>{
 const p=spawnSync(process.execPath,['research/physics/check-optics.mjs'],{cwd:root,encoding:'utf8',timeout:120000});check(p.status===0,'Geometric optics numerical gate failed');report.optics=json('research/physics/verification.json');check(report.optics.passed,'Optics verification failed');bind('src/optics.ts');bind('research/physics/check-optics.mjs');
});
await section('qwen',async()=>{
 const manifest=json('src/transitions-v19-repair.json');check(!(manifest.pendingRegeneration?.length),'Repair opening/ending Qwen endpoints still await regeneration/acceptance: '+(manifest.pendingRegeneration??[]).join(', '));
 const bridges=runtime.bridgesV19Repair??runtime.bridgesV11??[],layersAt=runtime.bridgeLayersAtV19Repair??runtime.bridgeLayersAtV12;
 check(typeof layersAt==='function','Active bridge scheduling function is unavailable');const scheduled=new Map(bridges.map(b=>[b.id,[]])),rows=[];
 for(let f=0;f<runtime.timeline.duration;f++)for(const l of layersAt(f)){check(Number.isInteger(l.sourceFrame)&&l.sourceFrame>=0&&l.sourceFrame<l.bridge.frames,'Invalid source frame for '+l.id);scheduled.get(l.id)?.push({film:f,source:l.sourceFrame});}
 for(const b of bridges){const dir='public/'+path.posix.dirname(b.framePath);const prov=dir+'/provenance.json',reviewFile=dir+'/visual-acceptance.json';let meta=null;if(bind(prov)){meta=json(prov);check(meta.taskId===b.taskId&&meta.frameCount===b.frames&&meta.fps===30,'Qwen provenance/task/frame mismatch: '+b.id);}if(bind(reviewFile)){const review=json(reviewFile);check(review.status==='pass'&&review.providerSHA256===meta?.providerSHA256,'Inherited Qwen sampled-source acceptance missing/stale: '+b.id);}
  let count=0;for(let i=0;i<b.frames;i++){const p='public/'+b.framePath+'/frame_'+String(i+1).padStart(4,'0')+'.jpg',r=bind(p);if(r){count++;if(meta?.frameHashes?.[i])check(r.sha256===meta.frameHashes[i],'Qwen frame provenance differs: '+b.id+' '+i);}}
  const sequence=scheduled.get(b.id)??[];let skips=0;for(let i=1;i<sequence.length;i++)if(sequence[i].source!==sequence[i-1].source+1)skips++;check(!skips&&sequence.length===b.frames&&sequence[0]?.source===0&&sequence.at(-1)?.source===b.frames-1,'Dropped/replayed/omitted native frames: '+b.id);rows.push({id:b.id,taskId:b.taskId,publishedFrames:count,scheduledFrames:sequence.length,filmRange:sequence.length?[sequence[0].film,sequence.at(-1).film]:null,nativeSequenceSkips:skips});
 }
 report.qwen={clips:rows,scope:'Native frame integrity and chronological scheduling. Previously generated clip endpoints may differ from repaired models; inspect actual composited seams.'};
});
await section('assets',async()=>{
 const explicit=new Set(),dynamic=new Set();
 // Capture path constants as well as staticFile literals; this catches model,
 // texture, HDR and vendor loader paths that are passed through variables.
 for(const p of active){const text=read(p);for(const m of text.matchAll(/['"`]((?:assets_v[\w-]*|brand|fonts|sources|audio(?:_[\w-]+)?)\/[^'"`\r\n]+)['"`]/g)){
  const s=m[1];if(s.includes('${')){const prefix=s.slice(0,s.indexOf('${')),dir=prefix.slice(0,prefix.lastIndexOf('/')+1);if(dir)dynamic.add(dir);}else if(!s.includes('\\'))explicit.add(s);
 }}
 const walk=dir=>{if(!fs.existsSync(absolute(dir)))return;for(const e of fs.readdirSync(absolute(dir),{withFileTypes:true})){const p=path.posix.join(dir,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory())walk(p);else if(e.isFile())bind(p);}};
 for(const s of explicit){const p='public/'+s;if(fs.existsSync(absolute(p))&&fs.statSync(absolute(p)).isDirectory())walk(p);else if(path.posix.extname(s))bind(p);}
 for(const s of dynamic){const p='public/'+s;if(fs.existsSync(absolute(p)))walk(p);else warnings.push('Dynamic asset prefix requires manual binding: '+s);}
 const glbs=[...bindings.keys()].filter(p=>p.endsWith('.glb')),models=[];
 for(const p of glbs){const b=fs.readFileSync(absolute(p));if(!check(b.toString('ascii',0,4)==='glTF','Invalid GLB '+p))continue;const len=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+len));for(const item of [...(g.images??[]),...(g.buffers??[])])if(item.uri&&!item.uri.startsWith('data:'))bind(path.posix.join(path.posix.dirname(p),decodeURI(item.uri)));models.push({file:p,meshes:g.meshes?.length??0,bones:new Set((g.skins??[]).flatMap(s=>s.joints)).size,animations:(g.animations??[]).map(a=>a.name??'unnamed')});}
 const fish=models.filter(m=>/fish/i.test(m.file));check(fish.length>0&&fish.some(m=>m.bones>=8),'Active fish GLB lacks a skeletal rig');
 const vendor='public/assets_v07/vendor-water/waterpro-adapter-v07.min.js';if(bindings.has(vendor)){check(!/\b(?:Date\.now|Math\.random|requestAnimationFrame|performance\.now)\s*\(/.test(read(vendor)),'Active vendor water code uses realtime/random APIs');for(const p of ['public/assets_v07/vendor-water/provenance.json','public/assets_v07/vendor-water/LICENSE.md'])if(fs.existsSync(absolute(p)))bind(p);}
 bind('public/audio_v18/master-v18.wav');report.assets={explicitPaths:[...explicit].sort(),dynamicPrefixes:[...dynamic].sort(),models,scope:'Active literal path constants, dynamic directory prefixes, published Qwen frames, external GLB dependencies and PCM master. Entire GLB bytes include embedded textures.'};
});
report.sourceHashes=[...bindings.values()].sort((a,b)=>a.file.localeCompare(b.file));report.sourceChangedDuringAudit=report.sourceHashes.filter(r=>!fs.existsSync(absolute(r.file))||hash(r.file)!==r.sha256).map(r=>r.file);check(report.sourceHashes.length>0&&!report.sourceChangedDuringAudit.length,'Sources changed during audit: '+report.sourceChangedDuringAudit.join(', '));
report.passed=!errors.length;report.completedUTC=new Date().toISOString();
fs.writeFileSync(path.join(out,'audit-v19-repair.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(out,'audit-v19-repair.md'),`# V19 scene repair technical audit\n\n${report.passed?'PASS':'FAIL'}\n\n${report.scope}\n\n${errors.map(e=>'- '+e).join('\n')}\n\nSource/resource hash bindings: ${report.sourceHashes.length}.\n`);
console.log(JSON.stringify({version,passed:report.passed,errors,warnings,hashBindings:report.sourceHashes.length,camera:report.camera,output:path.join(out,'audit-v19-repair.json')},null,2));if(!report.passed)process.exitCode=1;
