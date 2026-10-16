import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const timeline=JSON.parse(fs.readFileSync(path.join(root,'source/v01/timeline-preview.json'),'utf8'));
const g=9.81,fps=30;
const rotateX=(v,a)=>[v[0],v[1]*Math.cos(a)-v[2]*Math.sin(a),v[1]*Math.sin(a)+v[2]*Math.cos(a)];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const frames=[];
const duration=.60,pulse=.12,alpha=(Math.PI*1.5)/(pulse*(duration-pulse));
const spin=t=>{
 if(t<pulse)return [.5*alpha*t*t,alpha*t,alpha];
 if(t<duration-pulse)return [.5*alpha*pulse*pulse+alpha*pulse*(t-pulse),alpha*pulse,0];
 const q=t-(duration-pulse),s0=.5*alpha*pulse*pulse+alpha*pulse*(duration-2*pulse);
 return [s0+alpha*pulse*q-.5*alpha*q*q,alpha*pulse-alpha*q,-alpha];
};
for(const scene of timeline.scenes){
 for(let local=0;local<scene.durationInFrames;local++){
  const u=local/(scene.durationInFrames-1);let c=[0,0,.1],phi=0,omega=0,simTime=0,arrows=[],trail=[],mode='dynamic';
  if(scene.id==='hover'){
   arrows=[{origin:[0,0,.1],vector:[0,0,1.45],color:'#4cf2d0',label:'推力 T'},{origin:[0,0,.1],vector:[0,0,-1.45],color:'#ffbd69',label:'重力 mg'}];
  }
  if(scene.id==='ballistic'){
   simTime=u*1.2;phi=2*Math.PI*u;omega=2*Math.PI/1.2;
   c=[-2.4+4*simTime,0,5.886*simTime-.5*g*simTime*simTime];
   trail=Array.from({length:65},(_,i)=>{const t=i/64*1.2;return [-2.4+4*t,0,5.886*t-.5*g*t*t]});
   arrows=[{origin:c,vector:[0,0,-1.4],color:'#ffbd69',label:'重力仍在'}];
  }
  if(scene.id==='couple'){
   simTime=u*duration;const result=spin(simTime);phi=result[0];omega=result[1];const angularAcceleration=result[2];
   c=[0,0,1.0-.5*g*simTime*simTime];
   if(angularAcceleration!==0){
    const sign=Math.sign(angularAcceleration);
    for(const side of [-1,1])arrows.push({origin:add(c,rotateX([0,side*.9,0],phi)),vector:rotateX([0,0,side*sign*1.3],phi),color:'#4cf2d0',label:side===1?'推力 A':'推力 B'});
   }
   arrows.push({origin:c,vector:[0,0,-1.25],color:'#ffbd69',label:'重力'});
  }
  if(scene.id==='fixed'){
   // This is a force-direction bench, NOT a predicted trajectory or hover simulation.
   mode='orientation-study';phi=u<=.68?(Math.PI/2)*Math.min(1,u/.46):Math.PI/2+(Math.PI/2)*(u-.68)/.32;
   c=[0,0,.3];const v=rotateX([0,0,1.85],phi);
   arrows=[{origin:c,vector:v,color:'#4cf2d0',label:'固定喷口推力 T'}];
   if(Math.abs(v[1])>.08)arrows.push({origin:c,vector:[0,v[1],0],color:'#8ca5ff',label:'横向分量',dashed:true});
   if(Math.abs(v[2])>.08)arrows.push({origin:c,vector:[0,0,v[2]],color:'#ffbd69',label:'竖直分量',dashed:true});
  }
  frames.push({frame:scene.from+local,scene:scene.id,local,u,c,phi,omega,simTime,mode,arrows,trail,forceBodyZWorld:rotateX([0,0,1],phi)});
 }
}
const tests=[];
function check(name,ok,detail){tests.push({name,pass:!!ok,detail});if(!ok)throw Error(name)}
check('frames contiguous',frames.every((f,i)=>f.frame===i),frames.length);
for(const [a,expect] of [[0,[0,0,1]],[Math.PI/2,[0,-1,0]],[Math.PI,[0,0,-1]]])check('Rx vector '+a,rotateX([0,0,1],a).every((v,i)=>Math.abs(v-expect[i])<1e-10),rotateX([0,0,1],a));
const ballistic=frames.filter(f=>f.scene==='ballistic');
check('analytic ballistic residual',ballistic.every(f=>Math.abs(f.c[2]-(5.886*f.simTime-.5*g*f.simTime**2))<1e-10),'metres');
check('couple starts/stops at rest',Math.abs(spin(0)[1])+Math.abs(spin(duration)[1])<1e-9,'principal x axis, fixed inertia');
for(const f of frames.filter(f=>f.scene==='couple')){
 const a=f.arrows.filter(a=>a.color==='#4cf2d0');
 if(a.length)check('couple zero resultant frame '+f.frame,a[0].vector.every((v,i)=>Math.abs(v+a[1].vector[i])<1e-9),'gravity excluded from couple only');
}
const assumptions={fps,gravity:g,world:'right-handed x forward y left z up',teachingOnly:true,vehicleDimensionsNotTesla:true,airResistance:false,massConstantApproximation:true,spinPrincipalAxis:'x',coupleTorquePerInertia:alpha,physicalTime:{ballistic:1.2,couple:.6},fixedNozzleStudy:'orientation is prescribed; position locked for force decomposition; not a hovering prediction',rotationMatrix:'Rx(phi)',proofOfTeslaFlight:false};
fs.writeFileSync(path.join(root,'source/v01/physics/preview-frames.json'),JSON.stringify(frames));
fs.writeFileSync(path.join(root,'source/v01/physics/assumptions.json'),JSON.stringify(assumptions,null,2));
fs.mkdirSync(path.join(root,'work/v01/checks'),{recursive:true});
fs.writeFileSync(path.join(root,'work/v01/checks/physics.json'),JSON.stringify({tests,passed:tests.every(t=>t.pass)},null,2));
console.log('PHYSICS_OK',frames.length,'frames',tests.length,'assertions');
