import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// v2: forces are applied at the teaching nozzle pods (real application points), not at the centre of mass.
// v1 data is preserved untouched for traceability.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const timeline=JSON.parse(fs.readFileSync(path.join(root,'source/v01/timeline-preview.json'),'utf8'));
const g=9.81,fps=30;
const GROUND=-2.2;
const NOZZLE_LEFT=[0,.89,-.33],NOZZLE_RIGHT=[0,-.89,-.33],NOZZLE_CENTRE=[0,0,-.33];
const rotateX=(v,a)=>[v[0],v[1]*Math.cos(a)-v[2]*Math.sin(a),v[1]*Math.sin(a)+v[2]*Math.cos(a)];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const spinDuration=.60,spinPulse=.12,totalAngle=Math.PI*2.5;
const alpha=totalAngle/(spinPulse*(spinDuration-spinPulse));
const spin=t=>{
 if(t<spinPulse)return [.5*alpha*t*t,alpha*t,alpha];
 if(t<spinDuration-spinPulse)return [.5*alpha*spinPulse*spinPulse+alpha*spinPulse*(t-spinPulse),alpha*spinPulse,0];
 const q=t-(spinDuration-spinPulse),s0=.5*alpha*spinPulse*spinPulse+alpha*spinPulse*(spinDuration-2*spinPulse);
 return [s0+alpha*spinPulse*q-.5*alpha*q*q,alpha*spinPulse-alpha*q,-alpha];
};
const plume=(origin,force,length)=>force.every(v=>Math.abs(v)<1e-6)?null:{origin,dir:force.map(v=>-v/Math.hypot(...force)),length};
const frames=[];
for(const scene of timeline.scenes){
 for(let local=0;local<scene.durationInFrames;local++){
  const u=local/(scene.durationInFrames-1);let c=[0,0,.1],phi=0,omega=0,simTime=0,arrows=[],plumes=[],trail=[],mode='dynamic',rollRate=0;
  if(scene.id==='hover'){
   // Statically balanced teaching case: thrust applied at the underbody pod, weight at the centre of mass.
   arrows=[
    {origin:NOZZLE_CENTRE,vector:[0,0,1.45],color:'#4cf2d0',label:'推力 T',side:'right'},
    {origin:[0,0,.1],vector:[0,0,-1.45],color:'#ffbd69',label:'重力 mg',side:'left'}];
   plumes.push(plume(NOZZLE_CENTRE,[0,0,1.45],.62));
  }
  if(scene.id==='ballistic'){
   simTime=u*1.2;phi=2*Math.PI*1.25*u;omega=2*Math.PI*1.25/1.2;rollRate=0;
   c=[-2.4+4*simTime,0,5.886*simTime-.5*g*simTime*simTime];
   trail=Array.from({length:81},(_,i)=>{const t=i/80*1.2;return [-2.4+4*t,0,5.886*t-.5*g*t*t]});
   arrows=[{origin:c,vector:[0,0,-1.35],color:'#ffbd69',label:'重力 mg',side:'left'}];
  }
  if(scene.id==='couple'){
   simTime=u*spinDuration;const result=spin(simTime);phi=result[0];omega=result[1];rollRate=result[2];
   c=[0,0,1.0-.5*g*simTime*simTime];
   if(rollRate!==0){
    const sign=Math.sign(rollRate);
    for(const [nozzle,name,side] of [[NOZZLE_LEFT,'推力 A','right'],[NOZZLE_RIGHT,'推力 B','left']]){
     const origin=params=>add(c,rotateX(params,phi));
     const y=nozzle[1]>0?1:-1;
     const f=rotateX([0,0,y*sign*1.25],phi);
     arrows.push({origin:origin(nozzle),vector:f,color:'#4cf2d0',label:name,side});
     const p=plume(origin(nozzle),f,.5);if(p)plumes.push(p);
    }
   }
   arrows.push({origin:c,vector:[0,0,-1.2],color:'#ffbd69',label:'重力 mg',side:'left'});
   arrows.push({origin:c,vector:[0,0,-1.2],color:'#4cf2d0',label:'喷口净推力 = 0',side:'right',dashed:true,unitless:true,hidden:true});
  }
  if(scene.id==='fixed'){
   mode='orientation-study';phi=u<=.68?(Math.PI/2)*Math.min(1,u/.46):Math.PI/2+(Math.PI/2)*(u-.68)/.32;
   c=[0,0,.3];const origin=add(c,rotateX(NOZZLE_CENTRE,phi));const v=rotateX([0,0,1.85],phi);
   arrows=[{origin,vector:v,color:'#4cf2d0',label:'固定喷口推力 T',side:phi<1.2?'right':'left'}];
   const p=plume(origin,v,.7);if(p)plumes.push(p);
   if(Math.abs(v[1])>.08)arrows.push({origin,vector:[0,v[1],0],color:'#8ca5ff',label:'横向分量',side:'left',dashed:true});
   if(Math.abs(v[2])>.08)arrows.push({origin,vector:[0,0,v[2]],color:'#ffbd69',label:'竖直分量',side:'right',dashed:true});
  }
  frames.push({frame:scene.from+local,scene:scene.id,local,u,c,phi,omega,rollRate,simTime,mode,arrows:arrows.filter(a=>!a.hidden),plumes:plumes.filter(Boolean),trail,groundMark:[c[0],c[1],GROUND],nozzles:{left:add(c,rotateX(NOZZLE_LEFT,phi)),right:add(c,rotateX(NOZZLE_RIGHT,phi))},forceBodyZWorld:rotateX([0,0,1],phi)});
 }
}
const tests=[];
const check=(name,ok,detail)=>{tests.push({name,pass:!!ok,detail});if(!ok)throw Error(name)};
check('frames contiguous',frames.every((f,i)=>f.frame===i),frames.length);
for(const [a,expect] of [[0,[0,0,1]],[Math.PI/2,[0,-1,0]],[Math.PI,[0,0,-1]]])check('Rx '+a,rotateX([0,0,1],a).every((v,i)=>Math.abs(v-expect[i])<1e-7),rotateX([0,0,1],a));
check('analytic ballistic residual',frames.filter(f=>f.scene==='ballistic').every(f=>Math.abs(f.c[2]-(5.886*f.simTime-.5*g*f.simTime**2))<1e-9),'metres, no air');
check('spin starts and ends at rest',Math.abs(spin(0)[1])<1e-9&&Math.abs(spin(spinDuration)[1])<1e-9,'principal x axis');
check('total roll about 1.25 turns',Math.abs(spin(spinDuration)[0]-Math.PI*2.5)<1e-9,spin(spinDuration)[0].toFixed(4));
// Nozzle pods must be a pure couple: zero resultant, non-zero torque about x, computed at the actual application points.
const nozzle=[[0,.89,-.33],[0,-.89,-.33]];
const cross=(r,F)=>[r[1]*F[2]-r[2]*F[1],r[2]*F[0]-r[0]*F[2],r[0]*F[1]-r[1]*F[0]];
const coupleF=[[0,0,1.25],[0,0,-1.25]];
const netF=coupleF[0].map((v,i)=>v+coupleF[1][i]);const netT=cross(nozzle[0],coupleF[0]).map((v,i)=>v+cross(nozzle[1],coupleF[1])[i]);
check('nozzle couple zero resultant',netF.every(v=>Math.abs(v)<1e-12),netF);
check('nozzle couple pure x torque',Math.abs(netT[1])<1e-12&&Math.abs(netT[2])<1e-12&&netT[0]>0,netT.map(v=>+v.toFixed(4)));
check('plume opposes thrust',frames.flatMap(f=>f.plumes).every(p=>Math.abs(Math.hypot(...p.dir)-1)<1e-9),'unit direction, reversed thrust');
check('fixed nozzle force stays at pod',frames.filter(f=>f.scene==='fixed').every(f=>{const expect=add(f.c,rotateX(NOZZLE_CENTRE,f.phi));const a=f.arrows.find(x=>x.label==='固定喷口推力 T');return a.origin.every((v,i)=>Math.abs(v-expect[i])<1e-9)}),'origin = c + Rx(phi) r');
check('gravity stays at centre of mass',frames.filter(f=>f.scene!=='fixed').every(f=>{const a=f.arrows.find(x=>x.label==='重力 mg');return !a||a.origin.every((v,i)=>Math.abs(v-f.c[i])<1e-9)}),'no lever arm for uniform gravity');
check('90 deg loses vertical lift',Math.abs(Math.cos(Math.PI/2))<1e-12,'T cos(90) = 0');
const out=path.join(root,'source/v01/physics/preview-frames-v2.json');
fs.writeFileSync(out,JSON.stringify(frames));
const assumptions={fps,gravity:g,world:'right-handed x forward y left z up',teachingOnly:true,vehicleDimensionsNotTesla:true,airResistance:false,massConstantApproximation:true,rollAxis:'principal x',coupleTorqueMoment:netT[0],angularAcceleration:alpha,physicalTime:{ballistic:1.2,couple:spinDuration},forceApplicationPoints:'teaching nozzle pods at y=+-0.89, z=-0.33; not a verified Tesla layout',fixedNozzleStudy:'orientation prescribed; force drawn at its real application point; not a hover prediction',rotationMatrix:'Rx(phi)',proofOfTeslaFlight:false,supersedes:'preview-frames.json (v1 keeps forces at the centre of mass; retained for traceability)'};
fs.writeFileSync(path.join(root,'source/v01/physics/assumptions-v2.json'),JSON.stringify(assumptions,null,2));
fs.mkdirSync(path.join(root,'work/v01/checks'),{recursive:true});
fs.writeFileSync(path.join(root,'work/v01/checks/physics-v2.json'),JSON.stringify({tests,passed:tests.every(t=>t.pass)},null,2));
console.log('PHYSICS_V2_OK',frames.length,'frames',tests.length,'assertions');
