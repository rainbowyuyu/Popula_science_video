/** Deterministic rail audit. Metrics flag review; they do not certify aesthetics. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import * as T from 'three';
const root=process.cwd(),out=path.join(root,'work/v8/qa-camera');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('src/CameraRail.ts','utf8');
const story=JSON.parse(fs.readFileSync('src/story.json','utf8'));
const runtime=path.join(out,'rail.mjs');
fs.writeFileSync(runtime,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {sampleCamera}=await import(pathToFileURL(runtime).href);
const scenes=story.scenes.map(s=>({id:s.chapter,start:s.start,end:s.end}));
const count=Math.ceil(scenes.at(-1).end*30),camera=new T.PerspectiveCamera(50,16/9,.45,15000);
const rows=[],errors=[];let prev;
for(let f=0;f<count;f++){
 const c=sampleCamera(f/30,scenes),p=new T.Vector3(...c.position);
 camera.position.copy(p);camera.lookAt(new T.Vector3(...c.target));camera.updateMatrixWorld(true);
 const q=camera.quaternion.clone();
 if(![...c.position,...c.target,c.fov].every(Number.isFinite))errors.push({frame:f,reason:'nonfinite'});
 if(p.distanceTo(new T.Vector3(...c.target))<.01)errors.push({frame:f,reason:'zero-view'});
 if(prev){const dp=p.distanceTo(prev.p),da=q.angleTo(prev.q)*180/Math.PI,df=Math.abs(c.fov-prev.fov);rows.push({frame:f,t:f/30,displacement:dp,turnDeg:da,fovDelta:df});if(dp>12||da>10||df>2)errors.push({frame:f,reason:'large-jump',dp,da,df});}
 prev={p,q,fov:c.fov};
}
const repeats=[];for(const f of [0,10812,420,9999,4700,13,420,0])if(f<count){const a=sampleCamera(f/30,scenes);sampleCamera(89.237,scenes);const b=sampleCamera(f/30,scenes);if(JSON.stringify(a)!==JSON.stringify(b))errors.push({frame:f,reason:'nondeterministic'});repeats.push(f);}
const holds=[];for(const r of rows.filter(x=>x.displacement<.00033&&x.turnDeg<.001)){const last=holds.at(-1);if(last&&last.endFrame===r.frame-1)last.endFrame=r.frame;else holds.push({startFrame:r.frame,endFrame:r.frame});}
const report={created:new Date().toISOString(),frames:count,sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),storySHA256:crypto.createHash('sha256').update(fs.readFileSync('src/story.json')).digest('hex'),errors,seekTests:repeats,stationarySpans:holds.filter(x=>x.endFrame-x.startFrame>=3),topMovement:rows.toSorted((a,b)=>b.displacement-a.displacement).slice(0,8),topTurn:rows.toSorted((a,b)=>b.turnDeg-a.turnDeg).slice(0,8),scope:'Numerical frame continuity, deterministic seeks and stationary spans only; requires rendered motion review.'};
fs.writeFileSync(path.join(out,'camera-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
