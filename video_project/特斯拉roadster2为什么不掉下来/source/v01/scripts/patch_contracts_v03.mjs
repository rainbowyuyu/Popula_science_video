// Patch successful data and timeline only; keep v02 files and generated voice unchanged.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const save=(p,data)=>{const file=path.join(root,p);if(fs.existsSync(file))throw Error('Already exists: '+p);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2));};
const timeline=read('source/v01/timeline-preview.json');const frames=read('source/v01/physics/preview-frames-v3.json');const model=read('assets/v03/teaching-car.mesh.json');
const centre=o=>[0,1,2].map(k=>{const a=o.positions.filter((_,i)=>i%3===k);return (Math.max(...a)+Math.min(...a))/2});
const pods=model.objects.filter(o=>/Teaching.*nozzle pod/.test(o.name)).map(o=>({name:o.name,point:centre(o)}));
const left=pods.find(p=>p.point[1]>.5).point,right=pods.find(p=>p.point[1]<-.5).point,central=pods.find(p=>Math.abs(p.point[1])<.1).point;
const rx=(p,a)=>[p[0],p[1]*Math.cos(a)-p[2]*Math.sin(a),p[1]*Math.sin(a)+p[2]*Math.cos(a)];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
// Clause boundaries manually checked against stored ASR word list. No ASR text replaces canonical subtitles.
const spans={hover:[[0,2.66],[3.14,4.98]],ballistic:[[0,2.44],[2.98,5.78]],couple:[[0,2.62],[2.90,4.04]],fixed:[[0,2.24],[2.50,4.74],[4.98,5.92]]};
for(const s of timeline.scenes){s.captions=s.captions.map((c,i)=>({...c,from:s.from+Math.floor(spans[s.id][i][0]*30),to:s.from+Math.ceil(spans[s.id][i][1]*30)+2,alignment:'offline Whisper-small clause boundaries checked against word list; original wording retained; human listening pending'}));}
timeline.asrChecked=true;timeline.subtitleWordAlignmentVerified=false;timeline.asrEvidence='work/v01/crosscheck/asr.json';timeline.subjectiveListeningChecked=false;
const dt=.6/150;
for(const f of frames){
 if(f.scene==='fixed'){
  // Reach 90 degrees at the spoken "90", hold throughout "only horizontal", then show downward thrust.
  const l=f.local;f.phi=l<93?Math.PI/2*l/93:l<=147?Math.PI/2:l<188?Math.PI/2+Math.PI/2*(l-147)/41:Math.PI;
  const at=add(f.c,rx(central,f.phi)),v=rx([0,0,2.6],f.phi);
  f.arrows=[{origin:at,vector:v,color:'#4cf2d0',label:'固定喷口推力 T',side:'left'}];
  if(Math.abs(v[1])>.1)f.arrows.push({origin:at,vector:[0,v[1],0],color:'#8ca5ff',label:'横向分量',dashed:true,side:'left'});
  if(Math.abs(v[2])>.1)f.arrows.push({origin:at,vector:[0,0,v[2]],color:'#ffbd69',label:'竖直分量',dashed:true,side:'right'});
  f.thrust={magnitude:2.6,verticalComponent:v[2],lateralComponent:v[1]};
 }else{
  for(const a of f.arrows){
   a.side=a.label==='重力 mg'?'left':'right';
   if(a.label==='推力 T')a.origin=add(f.c,rx(central,f.phi));
   if(a.label==='推力 A')a.origin=add(f.c,rx(left,f.phi));
   if(a.label==='推力 B'){a.origin=add(f.c,rx(right,f.phi));a.side='left';}
  }
 }
 if(f.scene==='couple'){
  f.phase=f.local<30?'accelerate':f.local<120?'coast':f.local<150?'brake':'stopped';
  if(f.phase==='stopped'){f.arrows=f.arrows.filter(a=>a.label==='重力 mg');f.rollRate=0;}
 }else f.phase=f.scene;
 f.plumes=f.arrows.filter(a=>!a.dashed&&a.label!=='重力 mg').map(a=>({origin:a.origin,dir:a.vector.map(v=>-v/Math.hypot(...a.vector)),length:f.scene==='fixed'?.8:.5}));
 f.nozzles={left:add(f.c,rx(left,f.phi)),right:add(f.c,rx(right,f.phi)),centre:add(f.c,rx(central,f.phi))};
}
save('source/v01/timeline-crosschecked.json',timeline);
save('source/v01/physics/preview-frames-v4.json',frames);
save('source/v01/physics/contract-v4.json',{model:'assets/v03/teaching-car.mesh.json',pods,coordinateSystem:'right-handed x forward y left z up',teachingOnly:true,noTeslaParameters:true,arrowLengths:'schematic display scale; not measured newtons',fixedHoldFrames:[528+93,528+147],fixedAngleIsPrescribed:true,gravity:9.81,simSeconds:{ballistic:1.2,couple:.6},couplePulseSeconds:.12,rotationAxis:'principal x, constant inertia',coupleAlpha:Math.PI*2.5/(.12*(.6-.12)),physicalTimeIsNotVideoTime:true,asrSpans:spans});
const srt=t=>{const ms=Math.round(t/30*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`};
fs.mkdirSync(path.join(root,'subtitles/v03'),{recursive:true});fs.writeFileSync(path.join(root,'subtitles/v03/preview-asr-assisted.srt'),timeline.scenes.flatMap(s=>s.captions).map((c,i)=>`${i+1}\n${srt(c.from)} --> ${srt(c.to)}\n${c.text}\n`).join('\n'));
console.log('PATCH_OK',frames.length,'frames; model pods:',pods,'original audio unchanged');
