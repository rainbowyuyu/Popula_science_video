import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import * as T from 'three';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'research/qa-v13');fs.mkdirSync(out,{recursive:true});
const runtime=path.join(out,'editorial-runtime-v13.mjs');
await build({stdin:{contents:"export * from './src/Timeline';export * from './src/EditorialOverlayV10';export * from './src/TitlesV13';export * from './src/CinematicRouteV10';export * from './src/WorldV10';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:runtime});
const {timeline,stateAt,captionLinesV10,labelLayoutV10,labelEnvelope,codaPoseV13,sampleFilmCamera,WorldV10}=await import(pathToFileURL(runtime).href);
const errors=[],labels=[],maxCaption=Math.max(...timeline.captions.map(c=>[...c.text].length));
for(const c of timeline.captions){const lines=captionLinesV10(c.text);if(lines.join('')!==c.text)errors.push('Caption text changed at '+c.start);if(lines.some(x=>[...x].length>22))errors.push('Caption exceeds22 glyphs');if(c.text.length<=22&&lines.length!==1)errors.push('Unnecessary split at '+c.start);}
const world=new WorldV10(undefined,new T.Scene()),camera=new T.PerspectiveCamera(45,1920/1080,.03,400);
const frames=[...new Set(timeline.clips.flatMap(c=>[c.start+30,Math.round((c.start+c.end)/2),c.end-30]).filter(f=>f>=0&&f<timeline.duration))].sort((a,b)=>a-b);
for(const f of frames){
 const s=stateAt(f);world.update(s);if(!world.anchor)continue;
 const a=sampleFilmCamera(f);camera.position.set(...a.position);camera.quaternion.copy(a.quaternion);camera.fov=a.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 const p3=world.anchor.point.clone().project(camera),p={x:(p3.x*.5+.5)*1920,y:(.5-p3.y*.5)*1080,text:world.anchor.text,color:world.anchor.color??'#193b43',visible:p3.z>-1&&p3.z<1&&Math.abs(p3.x)<1.15&&Math.abs(p3.y)<1.15};
 const l=labelLayoutV10(s,p),e=labelEnvelope(s,p.text);
 if(![l.x,l.y,l.width,l.height,e.opacity].every(Number.isFinite))errors.push('Non-finite layout at '+f);
 if(l.x<124||l.x+l.width>1796.00001||l.y<214||l.y+l.height>822.00001)errors.push('Label outside safe design bounds at '+f);
 if(p.visible&&e.opacity>.6)labels.push({frame:f,scene:s.scene,anchor:{x:p.x,y:p.y},text:l.text,layout:{x:l.x,y:l.y,width:l.width,height:l.height,fontSize:l.fontSize},opacity:e.opacity});
}
world.dispose();
const refs=timeline.scenes.find(s=>s.id==='references'),coda=[refs.start,refs.start+12,refs.start+24,refs.start+42,refs.end-1].map(f=>({frame:f,...codaPoseV13(stateAt(f))}));
if(coda.at(-1).surface!==1||coda.at(-1).settle!==1||coda.at(-1).back!==1)errors.push('Coda does not settle before end');
const resources=['sources/formula-snell.svg','sources/formula-angle.svg','sources/gettelman-2023-title-page.png','sources/gettelman-2023-rainbow-optics-page4939.png'].map(file=>{const p=path.join(root,'public',file);if(!fs.existsSync(p)){errors.push('Missing '+file);return{file,exists:false};}return{file,exists:true,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')};});
const report={version:'V13',createdUTC:new Date().toISOString(),status:errors.length?'fail':'pass',scope:'Authored subtitle preservation, sampled current-camera anchor layout bounds, finite paper choreography and actual source-asset hashes. This does not establish visual occlusion, GPU appearance, or full-film review.',captions:{count:timeline.captions.length,maxGlyphs:maxCaption,fontSize:48,width:1080,allCurrentCuesSingleLine:timeline.captions.every(c=>captionLinesV10(c.text).length===1)},sampledFrames:frames.length,labels,coda,resources,errors};
fs.writeFileSync(path.join(out,'editorial-v13.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,captions:report.captions,sampledFrames:frames.length,visibleLabels:labels.length,errors},null,2));if(errors.length)process.exitCode=1;
