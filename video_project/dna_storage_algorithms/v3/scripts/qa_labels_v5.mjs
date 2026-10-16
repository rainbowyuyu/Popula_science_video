/** Conservative CPU label/bounds review; never substitutes for final raster QA. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),THREE=require('three'),oldHook=require.extensions['.ts'];
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText;
require.extensions['.ts']=(module,filename)=>module._compile(compile(fs.readFileSync(filename,'utf8')),filename);
globalThis.document={createElement(){const ctx={measureText:t=>({width:[...t].reduce((s,c)=>s+(/[\u2e80-\u9fff]/.test(c)?96:c===' '?26:58),0)}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),fillRect(){},fillText(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){}};return{width:300,height:150,getContext:()=>ctx};}};
const {makeStations}=require(path.join(root,'src/scene/StationsV5.ts')),{sampleCamera,STATIONS}=require(path.join(root,'src/CameraPathV5.ts')),{sceneNarrationV5:narration}=require(path.join(root,'src/TimelineV5.ts')),{ERROR_EVENTS_V5}=require(path.join(root,'src/EventsV5.ts'));
const film=fs.readFileSync(path.join(root,'src/FilmV5.tsx'),'utf8'),raw=film.slice(film.indexOf('const callouts:'),film.indexOf('function Callouts'));
const callouts=new Function('narration','ERROR_EVENTS_V5',compile(raw)+';return callouts;')(narration,ERROR_EVENTS_V5);
const modules=makeStations(),camera=new THREE.PerspectiveCamera(40,16/9,.05,250),keys=[['phone'],['binary','pairs','dna'],['packs','rejected','gc','gcHighlight'],['sources','droplets','recovered','recoveredC'],['originalRead','errors','nozzle'],['reads','matrixGroup','consensus','analogy'],['dna','tokens','networkLayers','candidates'],['phone'],[]];
const project=p=>{const n=p.clone().project(camera);return[(n.x*.5+.5)*1920,(.5-n.y*.5)*1080];};
const rectangle=object=>{const b=new THREE.Box3().setFromObject(object);if(b.isEmpty())return null;const ps=[];for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])ps.push(project(new THREE.Vector3(x,y,z)));const xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),r:Math.max(...xs),b:Math.max(...ys)};};
const overlap=(a,b)=>Math.max(0,Math.min(a.r,b.r)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.b,b.b)-Math.max(a.y,b.y));
const results=[];
for(const c of callouts){
 const mod=modules[c.station];mod.position.set(...STATIONS[c.station].origin);const samples=[],width=[...c.text].reduce((sum,ch)=>sum+(/[\u2e80-\u9fff\uff00-\uffef]/.test(ch)?44:30),24),height=61;
 for(let t=c.from+.4;t<c.to-.35;t+=.2){const pose=sampleCamera(t);camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.rotateZ(THREE.MathUtils.degToRad(pose.rollDeg));camera.fov=pose.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);mod.update(Math.max(0,t-STATIONS[c.station].start));mod.updateMatrixWorld(true);const anchor=project(new THREE.Vector3(c.point[0]+mod.position.x,c.point[1],c.point[2])),objects=[];for(const key of keys[c.station])for(const[o,i]of (Array.isArray(mod[key])?mod[key]:[mod[key]]).map((o,i)=>[o,i])){if(!o)continue;const rect=rectangle(o);if(rect&&rect.r>0&&rect.x<1920&&rect.b>0&&rect.y<1080)objects.push({key:`${key}[${i}]`,...rect});}samples.push({t,anchor,objects});}
 const assess=offset=>{let sum=0,max=0,worst=null;for(const s of samples){const x=Math.max(92,Math.min(1828-width,s.anchor[0]+offset[0])),y=Math.max(210,Math.min(875,s.anchor[1]+offset[1])),rect={x,y,r:x+width,b:y+height};for(const obj of s.objects){const fraction=overlap(rect,obj)/(width*height);sum+=fraction;if(fraction>max){max=fraction;worst={timeSec:s.t,object:obj.key,labelRect:rect,objectRect:obj,fraction};}}}return{meanSum:sum/Math.max(1,samples.length),maxOverlapFraction:max,worst};};
 const current=assess(c.offset);let best={offset:c.offset,...current,score:current.meanSum*1000+current.maxOverlapFraction*300};
 for(let dx=-650;dx<=650;dx+=50)for(let dy=-350;dy<=350;dy+=50){const test=assess([dx,dy]),score=test.meanSum*1000+test.maxOverlapFraction*300+Math.hypot(dx-c.offset[0],dy-c.offset[1])*.04;if(score<best.score)best={offset:[dx,dy],...test,score};}
 results.push({text:c.text,from:c.from,to:c.to,offset:c.offset,current,suggested:best});
}
const report={scope:'Conservative screen rectangles of actual animated Three groups, current caption-derived callout windows and camera. Font metric approximations, no imported GLB/alpha/occlusion. Suggested offsets must be visually reviewed.',results};fs.writeFileSync(path.join(root,'research/labels-v5-review.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(results.map(r=>({text:r.text,range:[r.from,r.to],maxOverlap:r.current.maxOverlapFraction,worst:r.current.worst?.timeSec,object:r.current.worst?.object,offset:r.offset,suggested:r.suggested.offset,after:r.suggested.maxOverlapFraction})),null,2));require.extensions['.ts']=oldHook;delete globalThis.document;
