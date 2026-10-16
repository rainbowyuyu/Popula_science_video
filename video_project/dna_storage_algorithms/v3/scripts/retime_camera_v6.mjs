/** Rebind proven camera compositions to the new spoken beats, preserving
 * inter-station handoffs. This changes authored key times, never audio speed. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),prior=require.extensions['.ts'];
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText,filename);
const old=require(path.join(root,'src/TimelineV5.ts')).sceneNarrationV5;
const fresh=require(path.join(root,'src/TimelineV6.ts')).sceneNarrationV6;
if(fresh.version!==6||fresh.timingStatus!=='measured-local-natural-gap')throw new Error('Wait for measured V6 audio');
const {STATIONS_V5:stations}=require(path.join(root,'src/CameraPathV5.ts'));
const knots=[{x:0,y:0},{x:300,y:300}];
for(const cue of old.cues){const next=fresh.cues.find(c=>c.id===cue.id);if(!next)throw new Error(cue.id);knots.push({x:cue.startSec,y:next.startSec},{x:cue.endSec,y:next.endSec});}
knots.sort((a,b)=>a.x-b.x);
const map=t=>{let i=0;while(i<knots.length-2&&t>knots[i+1].x)i++;const a=knots[i],b=knots[i+1];return a.y+(b.y-a.y)*(t-a.x)/Math.max(1e-9,b.x-a.x);};
let source=fs.readFileSync(path.join(root,'src/CameraPathV5.ts'),'utf8').replaceAll('V5','V6');
const updates=[];let previous=-1;
source=source.replace(/k\(([\d.]+),(\d+),([^\n]+)\),/g,(all,raw,index,tail)=>{
 const time=Number(raw),station=stations[Number(index)];
 const fixed=time===0||time===300||tail.includes("'handoff'")||tail.includes("'establish'")||Number(index)===8;
 const proposed=fixed?time:map(time);
 const shifted=fixed?time:Math.max(previous+.45,Math.min(station.end-3.65,Math.max(station.start+3.35,proposed)));
 if(shifted<=previous)throw new Error(`Camera key collision at ${time}`);
 previous=shifted;updates.push({shotId:tail.match(/'([^']+)'/)?.[1],oldSceneSec:time,newSceneSec:shifted,fixed});
 return `k(${shifted.toFixed(4)},${index},${tail}),`;
});
// Focus intervals refer to the same semantic beats as their keyframes.
source=source.replace(/station:(\d+),start:([\d.]+),end:([\d.]+),min:/g,(_all,index,a,b)=>{
 const s=stations[Number(index)];const lo=Number(index)===0?0:s.start+3.35;
 const start=Math.max(lo,Math.min(s.end-3.7,map(Number(a))));
 const end=Math.max(start+.05,Math.min(s.end-3.5,map(Number(b))));
 return `station:${index},start:${start.toFixed(4)},end:${end.toFixed(4)},min:`;
});
source=source.replace(/\/\/ Calibrated to the measured 321\.8 s narration on 2026-10-11\. The[\s\S]*?k\(162/,`// V6 keys follow the new measured voice cues; composition remains continuous.\n k(162`);
fs.writeFileSync(path.join(root,'src/CameraPathV6.ts'),source);
fs.writeFileSync(path.join(root,'research/camera-retime-v6.json'),JSON.stringify({durationSec:fresh.durationSec,method:'Monotone cue identity mapping for detail keys; inter-station poses and handoff times preserved; camera uses C2 interpolation.',updates},null,2));
console.log(JSON.stringify({keys:updates.length,durationSec:fresh.durationSec}));
require.extensions['.ts']=prior;
