import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import * as THREE from 'three';
import {layoutFor,rotateX,add} from '../src/stage-layout.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const frames=read('source/v01/physics/preview-frames-v4.json'),model=read('assets/v03/teaching-car.mesh.json'),old=read('assets/v01/teaching-car.mesh.json'),contract=read('source/v01/physics/contract-v4.json'),timeline=read('source/v01/timeline-crosschecked.json');
const tests=[],layoutErrors=[],counts={};
function check(id,ok,detail){tests.push({id,pass:!!ok,detail});}
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const physical=o=>!o.dashed&&o.label!=='重力 mg';
check('all 42 original meshes unchanged',old.objects.every(o=>JSON.stringify(o)===JSON.stringify(model.objects.find(n=>n.name===o.name))),{original:old.objects.length,patched:model.objects.length});
check('725 contiguous frames',frames.length===725&&frames.every((f,i)=>f.frame===i),frames.length);
let originError=0,plumeError=0,torqueError=0,projectionError=0,noPropulsionPlumes=0,phaseMismatch=0;
const pod=key=>contract.pods.find(p=>key==='centre'?Math.abs(p.point[1])<.1:key==='left'?p.point[1]>.5:p.point[1]<-.5).point;
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
for(const f of frames){
 const thrust=f.arrows.filter(physical);
 for(const a of thrust){const key=a.label==='推力 A'?'left':a.label==='推力 B'?'right':'centre';originError=Math.max(originError,dist(a.origin,add(f.c,rotateX(pod(key),f.phi))));}
 for(let i=0;i<f.plumes.length;i++){
  const pl=f.plumes[i],a=thrust[i];if(!a){plumeError=Infinity;continue;}
  plumeError=Math.max(plumeError,dist(pl.origin,a.origin),Math.abs(pl.dir.reduce((v,n,j)=>v+n*a.vector[j],0)/Math.hypot(...a.vector)+1));
 }
 if(f.scene==='ballistic'&&f.plumes.length)noPropulsionPlumes++;
 if(f.scene==='couple'){
  const expected=f.local<30?'accelerate':f.local<120?'coast':f.local<150?'brake':'stopped';if(f.phase!==expected)phaseMismatch++;
  const torques=thrust.map(a=>cross(a.origin.map((n,j)=>n-f.c[j]),a.vector));const total=torques.reduce((a,b)=>add(a,b),[0,0,0]);
  if(thrust.length){torqueError=Math.max(torqueError,Math.abs(total[1])+Math.abs(total[2]),Math.abs(Math.sign(total[0])-Math.sign(f.rollRate)));}
 }
 const l=layoutFor(f),box={x:l.box.minX,y:l.box.minY,w:l.box.maxX-l.box.minX,h:l.box.maxY-l.box.minY};
 const rects=[{...l.com,name:'质心'},...l.chips.map(c=>({x:c.pos[0],y:c.pos[1],w:c.width,h:c.height,name:c.a.label}))];
 for(const r of rects){
  if(r.x<18||r.x+r.w>1280||r.y<70||r.y+r.h>690)layoutErrors.push({frame:f.frame,type:'safe-area',rect:r});
  if(overlap(r,box))layoutErrors.push({frame:f.frame,type:'label-on-body',rect:r});
 }
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)if(overlap(rects[i],rects[j]))layoutErrors.push({frame:f.frame,type:'label-collision',a:rects[i].name,b:rects[j].name});
 for(const a of f.arrows){
  for(const p of [a.origin,add(a.origin,a.vector)]){
   const q=l.project(p),v=new THREE.Vector3(...p).project(l.camera);projectionError=Math.max(projectionError,dist(q,[(v.x+1)*640,(1-v.y)*380]));
  }
 }
}
check('force starts at actual mesh pod including COM translation',originError<1e-8,{maxErrorMetres:originError});
check('each plume co-located with and antiparallel to corresponding thrust',plumeError<1e-8,{maxError:plumeError});
check('no plume without propulsion',noPropulsionPlumes===0,noPropulsionPlumes);
check('pure-x torque sign agrees with angular acceleration',torqueError<1e-8,torqueError);
check('phase text uses exact force activation schedule',phaseMismatch===0,phaseMismatch);
check('90 degree hold covers whole lateral-only spoken clause',frames.filter(f=>f.scene==='fixed'&&f.local>=111&&f.local<=143).every(f=>Math.abs(f.phi-Math.PI/2)<1e-10),'ASR local 3.70--4.74 seconds');
check('end frame reaches 180 degrees',Math.abs(frames.at(-1).phi-Math.PI)<1e-10,frames.at(-1).phi);
check('SVG and 3D projection share matrix',projectionError<1e-9,projectionError);
check('all frame label rectangles outside body, within safe area, mutually disjoint',layoutErrors.length===0,{errors:layoutErrors.length,examples:layoutErrors.slice(0,10)});
check('caption bounds inside scene and chronological',timeline.scenes.every(s=>s.captions.every((c,i)=>c.from>=s.from&&c.to<=s.from+s.durationInFrames&&c.from<c.to&&(!i||c.from>=s.captions[i-1].to))),timeline.scenes.map(s=>s.captions.map(c=>[c.from,c.to])));
// Direction change in angular velocity by numerical derivative, away from pulse boundaries.
let rotationResidual=0,ballisticResidual=0;
for(let i=1;i<frames.length-1;i++){
 const a=frames[i-1],b=frames[i],c=frames[i+1];if(a.scene!==b.scene||c.scene!==b.scene)continue;
 if(b.scene==='couple'&&![29,30,31,119,120,121,149].includes(b.local)){const actual=(c.phi-a.phi)/(c.simTime-a.simTime);rotationResidual=Math.max(rotationResidual,Math.abs(actual-b.omega));}
 if(b.scene==='ballistic'){const dt=c.simTime-b.simTime;const az=(c.c[2]-2*b.c[2]+a.c[2])/(dt*dt);ballisticResidual=Math.max(ballisticResidual,Math.abs(az+9.81));}
}
check('finite-difference angular velocity matches saved omega',rotationResidual<1e-8,rotationResidual);
check('independent second-difference acceleration equals gravity',ballisticResidual<1e-7,ballisticResidual);
const out=path.join(root,'work/v03/checks');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'contracts.json'),JSON.stringify({tests,allPassed:tests.every(t=>t.pass),layoutErrors},null,2));console.log(JSON.stringify({tests,allPassed:tests.every(t=>t.pass)},null,2));
if(tests.some(t=>!t.pass))process.exitCode=1;
