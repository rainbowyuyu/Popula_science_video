/** Sample the exact camera + wave functions without a browser. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'work/audio-v4');fs.mkdirSync(output,{recursive:true});
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const compile=async(name)=>{
 const input=path.join(root,'src',`${name}.ts`),destination=path.join(output,`${name}.mjs`);
 const result=ts.transpileModule(fs.readFileSync(input,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:input,reportDiagnostics:true});
 if(result.diagnostics?.some(x=>x.category===ts.DiagnosticCategory.Error))throw new Error(`Unable to compile ${name}`);
 fs.writeFileSync(destination,result.outputText);return import(pathToFileURL(destination).href+`?sha=${hash(input)}`);
};
const [{sampleCamera},{waterHeightAt,waterSubmersionAt}]=await Promise.all([compile('CameraRail'),compile('WaterSurfaceState')]);
const storyPath=path.join(root,'src/story.json');const story=JSON.parse(fs.readFileSync(storyPath,'utf8').replace(/^\uFEFF/,''));
const scenes=story.scenes.map(s=>({id:s.chapter,start:s.start,end:s.end}));
const fps=30,frameCount=Math.ceil(Math.max(...scenes.map(s=>s.end))*fps),duration=frameCount/fps;
const sample=t=>{
 const camera=sampleCamera(t,scenes),[x,y,z]=camera.position,water=waterHeightAt(x,z,t,0,.35);
 return {t,position:camera.position,surfaceY:water,signedDistance:y-water,immersion:waterSubmersionAt(x,y,z,t,0,.35)};
};
const samples=Array.from({length:frameCount+1},(_,frame)=>({...sample(frame/fps),frame}));
const raw=[];
for(let i=1;i<samples.length;i++){
 const a=samples[i-1],b=samples[i];if(a.signedDistance*b.signedDistance>=0)continue;
 let lo=a.t,hi=b.t;
 for(let n=0;n<32;n++){const mid=(lo+hi)/2;if(sample(lo).signedDistance*sample(mid).signedDistance>0)lo=mid;else hi=mid;}
 const time=(lo+hi)/2,exact=sample(time);
 raw.push({time,frame:Math.round(time*fps),kind:a.signedDistance>0?'enter':'exit',position:exact.position,surfaceY:exact.surfaceY,residualMetres:Math.abs(exact.signedDistance)});
}
// Wave grazing can create a rapid enter/exit pair. Merge only within one second;
// a pair returning to its original medium is not a full transition sound.
const groups=[];
for(const e of raw){const g=groups.at(-1);if(g&&e.time-g.at(-1).time<1)g.push(e);else groups.push([e]);}
const crossings=[];const merged=[];
for(const group of groups){
 if(group.length===1){crossings.push(group[0]);continue;}
 merged.push(group);
 if(group[0].kind===group.at(-1).kind)crossings.push({...group[0],mergedCount:group.length});
}
const underwaterIntervals=[];let start=samples[0].signedDistance<0?0:null;
for(const e of crossings){if(e.kind==='enter')start=e.time;else if(start!==null){underwaterIntervals.push({start,end:e.time});start=null;}}
if(start!==null)underwaterIntervals.push({start,end:duration});
const result={schema:'marine-immersion-v4',fps,frameCount,duration,level:0,direction:.35,
 sources:{camera:{path:'src/CameraRail.ts',sha256:hash(path.join(root,'src/CameraRail.ts'))},wave:{path:'src/WaterSurfaceState.ts',sha256:hash(path.join(root,'src/WaterSurfaceState.ts'))},story:{path:'src/story.json',sha256:hash(storyPath)}},
 crossings,rawCrossingCount:raw.length,mergedGroups:merged,underwaterIntervals,samples};
fs.writeFileSync(path.join(output,'immersion-timeline.json'),JSON.stringify(result));
fs.writeFileSync(path.join(output,'crossings.json'),JSON.stringify({...result,samples:undefined},null,2));
console.log(JSON.stringify({duration,frameCount,crossings,underwaterIntervals},null,2));
