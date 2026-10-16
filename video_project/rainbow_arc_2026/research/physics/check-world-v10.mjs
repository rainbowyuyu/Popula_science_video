import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as T from 'three';
import assert from 'node:assert/strict';
const checker=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(checker),'../..');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const captured=new Map();
const capture={name:'capture-v10-source-hashes',setup(b){b.onLoad({filter:/\.(?:tsx?|m?js|json)$/},args=>{
 const relative=path.relative(root,args.path);
 if(relative.startsWith('..')||relative.split(path.sep).includes('node_modules'))return;
 const contents=fs.readFileSync(args.path);captured.set(args.path,createHash('sha256').update(contents).digest('hex'));
 const ext=path.extname(args.path).slice(1);return {contents,loader:ext==='mjs'?'js':ext};
});}};
const result=await build({absWorkingDir:root,stdin:{contents:"export * from './src/WorldV10';export * from './src/Timeline';export * from './src/CinematicRouteV10';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:path.join(root,'research/physics/world-v10.mjs'),metafile:true,plugins:[capture]});
const files=[...new Set([...Object.keys(result.metafile.inputs).filter(rel=>rel!=='<stdin>').map(rel=>path.resolve(root,rel)),checker,path.join(root,'package.json'),path.join(root,'package-lock.json')])];
const sourceHashes=Object.fromEntries(files.map(file=>[path.relative(root,file).replaceAll('\\','/'),captured.get(file)??sha(file)]));
const {WorldV10,stateAt,timeline,sampleFilmCamera}=await import(pathToFileURL(path.join(root,'research/physics/world-v10.mjs')));
const world=new WorldV10(undefined,new T.Scene());
const rise=timeline.clips.find(c=>c.id==='r027'&&c.scene==='circle');
const fullCircleFrame=rise?Math.round(rise.start+Math.min(rise.duration,160)+12):null;
const frames=[...timeline.scenes.flatMap(s=>[s.start+1,s.start+Math.round((s.end-s.start)*.56),s.end-1]),...timeline.clips.map(c=>Math.round((c.start+c.end)/2)),...(fullCircleFrame===null?[]:[fullCircleFrame])];
for(const c of timeline.clips.filter(c=>['r042','r043','r044'].includes(c.id)))for(let f=c.start;f<c.end;f+=12)frames.push(f);
const report={version:'V10',schema:'rainbow.v10.world-geometry-verification/1',sourceHashes,passed:true,frames:[],minCircleY:null,invalidTransforms:0,deterministicSeek:false,minForward:1,groundOcclusion:true};
const snapshot=()=>{const a=[];world.group.traverse(o=>{a.push(o.position.toArray(),o.quaternion.toArray(),o.scale.toArray());if(o.isInstancedMesh)a.push(Array.from(o.instanceMatrix.array));});return JSON.stringify(a);};
for(const f of [...new Set(frames)].sort((a,b)=>a-b)){
 const s=stateAt(f);world.update(s);world.group.updateMatrixWorld(true);report.frames.push(f);
 world.group.traverse(o=>{if([...o.position.toArray(),...o.scale.toArray(),...o.quaternion.toArray(),...o.matrixWorld.elements].some(x=>!Number.isFinite(x)))report.invalidTransforms++;});
 const camera=sampleFilmCamera(f),d=new T.Vector3(...camera.target).sub(new T.Vector3(...camera.position)).normalize(),forward=new T.Vector3(0,0,-1).applyQuaternion(camera.quaternion);report.minForward=Math.min(report.minForward,d.dot(forward));
 if(f===fullCircleFrame){
   const a=world.primaryRing.geometry.attributes.position;let minY=Infinity;for(let i=0;i<a.count;i++){const p=new T.Vector3(a.getX(i),a.getY(i),a.getZ(i)).applyMatrix4(world.primaryRing.matrixWorld);minY=Math.min(minY,p.y);}report.minCircleY=minY;assert(minY>0,'Full circle is still below opaque ground');
 }
}
world.update(stateAt(frames[4]));const first=snapshot();world.update(stateAt(frames.at(-1)));world.update(stateAt(0));world.update(stateAt(frames[4]));report.deterministicSeek=first===snapshot();
assert.equal(report.invalidTransforms,0);assert(report.minForward>.999999);assert(report.deterministicSeek);
const primary=world.primaryAngles,secondary=world.secondaryAngles;assert(primary[0].rainbowAngleDeg>primary[6].rainbowAngleDeg);assert(secondary[0].rainbowAngleDeg<secondary[6].rainbowAngleDeg);assert(secondary[0].rainbowAngleDeg>primary[0].rainbowAngleDeg);
report.primaryAngles=primary.map(x=>x.rainbowAngleDeg);report.secondaryAngles=secondary.map(x=>x.rainbowAngleDeg);world.dispose();
report.sourceChangesDuringCheck=files.map(file=>path.relative(root,file).replaceAll('\\','/')).filter(rel=>sha(path.join(root,rel))!==sourceHashes[rel]);
report.passed=report.sourceChangesDuringCheck.length===0;
fs.writeFileSync(path.join(root,'research/physics/world-geometry-check-v10.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({version:report.version,passed:report.passed,sourceHashCount:files.length,frames:report.frames.length,minCircleY:report.minCircleY,invalidTransforms:report.invalidTransforms,deterministicSeek:report.deterministicSeek,minForward:report.minForward,sourceChangesDuringCheck:report.sourceChangesDuringCheck},null,2));
if(!report.passed)process.exitCode=1;
