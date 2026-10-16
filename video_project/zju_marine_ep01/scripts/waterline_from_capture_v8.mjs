/** Export the exact full-film 30 Hz native water state captured at screenshot time.
 * Requires complete guarded frame evidence, not estimates from camera Y alone.
 * --proof=proof.frames.jsonl --report=render-report.json --sources=ready.json --out=FILE
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return[x.slice(2,i),x.slice(i+1)]}));
for(const k of ['proof','report','sources','out'])if(!args[k])throw Error('Missing --'+k);
const report=JSON.parse(fs.readFileSync(args.report,'utf8')),manifest=JSON.parse(fs.readFileSync(args.sources,'utf8'));
const {durationInFrames:frameCount,fps}=report.composition||{};
if(report.status!=='complete'||!Number.isInteger(frameCount)||fps!==30)throw Error('Completed 30 fps production report required');
const sources=manifest.sources;if(!sources||!sources.camera||!sources.wave||!sources.story)throw Error('Frozen source hashes required');
for(const item of Object.values(sources)){const f=path.resolve(item.path);if(!fs.existsSync(f)||crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')!==item.sha256)throw Error('Current source differs from frozen source '+item.path);}
const byFrame=new Map();
for(const line of fs.readFileSync(args.proof,'utf8').split(/\r?\n/).filter(Boolean)){
 const row=JSON.parse(line),s=row.before,b=row.after;
 if(row.frame!==s.frame||row.frame!==b.frame||s.nativeTick!==row.frame*2||b.nativeTick!==row.frame*2||s.backend!=='webgpu'||b.backend!=='webgpu'||s.hash!==b.hash)throw Error('Invalid capture proof at frame '+row.frame);
 if(!Array.isArray(s.cameraPosition)||s.cameraPosition.length!==3||!Number.isFinite(s.waterHeight)||!Number.isFinite(s.submersion)||s.waterHeight!==b.waterHeight||s.submersion!==b.submersion)throw Error('Water state missing or changed during capture at '+row.frame);
 const sample={t:row.frame/fps,frame:row.frame,position:s.cameraPosition,surfaceY:s.waterHeight,signedDistance:s.cameraPosition[1]-s.waterHeight,immersion:s.submersion,sampling:'production-native-webgpu-capture',nativeTick:s.nativeTick};
 if(byFrame.has(row.frame)&&JSON.stringify(byFrame.get(row.frame))!==JSON.stringify(sample))throw Error('Repeated frame has differing native water data '+row.frame);byFrame.set(row.frame,sample);
}
if(byFrame.size!==frameCount||[...byFrame.keys()].some(f=>f<0||f>=frameCount))throw Error(`Complete film required: expected ${frameCount} frames, received ${byFrame.size}`);
const samples=Array.from({length:frameCount},(_,frame)=>{const s=byFrame.get(frame);if(!s)throw Error('Missing frame '+frame);return s;}),crossings=[];
for(let i=1;i<samples.length;i++){const a=samples[i-1],b=samples[i];if((a.signedDistance>=0)===(b.signedDistance>=0))continue;const k=a.signedDistance/(a.signedDistance-b.signedDistance),time=a.t+(b.t-a.t)*k;crossings.push({time,frame:Math.round(time*fps),kind:a.signedDistance>=0?'enter':'exit',position:a.position.map((v,j)=>v+(b.position[j]-v)*k),surfaceY:a.surfaceY+(b.surfaceY-a.surfaceY)*k,residualMetres:null,precisionSeconds:1/fps,bracket:[{time:a.t,distance:a.signedDistance},{time:b.t,distance:b.signedDistance}]});}
const duration=frameCount/fps,underwaterIntervals=[];let start=samples[0].signedDistance<0?0:null;for(const c of crossings){if(c.kind==='enter')start=c.time;else if(start!==null){underwaterIntervals.push({start,end:c.time});start=null;}}if(start!==null)underwaterIntervals.push({start,end:duration});
const result={schema:'marine-immersion-native-webgpu-v8',fps,frameCount,duration,backend:'webgpu',level:0,seed:7,quality:'high',gpuSampleCount:frameCount,sources,crossings,rawCrossingCount:crossings.length,mergedGroups:[],underwaterIntervals,samples,notes:['Native production water state recorded immediately before and after every actual Remotion screenshot.','30 Hz actual render samples; crossings interpolate measured 1/30-second brackets.','No zero residual or 60 Hz measurement is claimed.'],evidence:{proof:path.resolve(args.proof),proofSHA256:crypto.createHash('sha256').update(fs.readFileSync(args.proof)).digest('hex'),report:path.resolve(args.report)}};
fs.mkdirSync(path.dirname(path.resolve(args.out)),{recursive:true});fs.writeFileSync(args.out,JSON.stringify(result));console.log(JSON.stringify({frames:frameCount,duration,crossings,output:args.out},null,2));
