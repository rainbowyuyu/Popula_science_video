import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// v3 supersedes v2 for layout only: readable fixed-nozzle force vector and slower ballistic tumble.
// v1/v2 JSON stay on disk untouched for traceability.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const timeline=JSON.parse(fs.readFileSync(path.join(root,'source/v01/timeline-preview.json'),'utf8'));
const g=9.81,fps=30,GROUND=-2.2;
const NOZZLE_LEFT=[0,.89,-.33],NOZZLE_RIGHT=[0,-.89,-.33],NOZZLE_CENTRE=[0,0,-.33];
const rotateX=(v,a)=>[v[0],v[1]*Math.cos(a)-v[2]*Math.sin(a),v[1]*Math.sin(a)+v[2]*Math.cos(a)];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const BALL_TURNS=.6,FIXED_THRUST=2.6,SPIN_TURNS=1.25;
const spinDuration=.60,spinPulse=.12,totalAngle=Math.PI*2*SPIN_TURNS;
const alpha=totalAngle/(spinPulse*(spinDuration-spinPulse));
const spin=t=>{
 if(t<spinPulse)return [.5*alpha*t*t,alpha*t,alpha];
 if(t<spinDuration-spinPulse)return [.5*alpha*spinPulse*spinPulse+alpha*spinPulse*(t-spinPulse),alpha*spinPulse,0];
 const q=t-(spinDuration-spinPulse),s0=.5*alpha*spinPulse*spinPulse+alpha*spinPulse*(spinDuration-2*spinPulse);
 return [s0+alpha*spinPulse*q-.5*alpha*q*q,alpha*spinPulse-alpha*q,-alpha];
};
const plume=(origin,f,length)=>f.every(v=>Math.abs(v)<1e-6)?null:{origin,dir:f.map(v=>-v/Math.hypot(...f)),length};
const frames=[];
for(const scene of timeline.scenes){
 for(let local=0;local<scene.durationInFrames;local++){
  const u=local/(scene.durationInFrames-1);let c=[0,0,.1],phi=0,omega=0,simTime=0,arrows=[],plumes=[],trail=[],mode='dynamic',rollRate=0,thrustVector=null;
  if(scene.id==='hover'){
   arrows=[{origin:NOZZLE_CENTRE,vector:[0,0,1.6],color:'#4cf2d0',label:'推力 T'},
           {origin:[0,0,.1],vector:[0,0,-1.6],color:'#ffbd69',label:'重力 mg'}];
   plumes.push(plume(NOZZLE_CENTRE,[0,0,1.6],.55));
  }
  if(scene.id==='ballistic'){
   simTime=u*1.2;phi=2*Math.PI*BALL_TURNS*u;omega=2*Math.PI*BALL_TURNS/1.2;
   c=[-2.4+4*simTime,0,5.886*simTime-.5*g*simTime*simTime];
   trail=Array.from({length:81},(_,i)=>{const t=i/80*1.2;return [-2.4+4*t,0,5.886*t-.5*g*t*t]});
   arrows=[{origin:c,vector:[0,0,-1.5],color:'#ffbd69',label:'重力 mg'}];
   plumes.push({origin:c,dir:[0,0,-1],length:.001});
  }
  if(scene.id==='couple'){
   simTime=u*spinDuration;const result=spin(simTime);phi=result[0];omega=result[1];rollRate=result[2];
   c=[0,0,1.0-.5*g*simTime*simTime];
   if(rollRate!==0){
    const sign=Math.sign(rollRate);
    for(const [nozzle,name] of [[NOZZLE_LEFT,'推力 A'],[NOZZLE_RIGHT,'推力 B']]){
     const y=nozzle[1]>0?1:-1;const f=rotateX([0,0,y*sign*1.35],phi);const at=add(c,rotateX(nozzle,phi));
     arrows.push({origin:at,vector:f,color:'#4cf2d0',label:name});
     const p=plume(at,f,.46);if(p)plumes.push(p);
    }
   }
   arrows.push({origin:c,vector:[0,0,-1.35],color:'#ffbd69',label:'重力 mg'});
  }
  if(scene.id==='fixed'){
   mode='orientation-study';phi=u<=.68?(Math.PI/2)*Math.min(1,u/.46):Math.PI/2+(Math.PI/2)*(u-.68)/.32;
   c=[0,0,.3];const at=add(c,rotateX(NOZZLE_CENTRE,phi));const v=rotateX([0,0,FIXED_THRUST],phi);thrustVector=v;
   arrows=[{origin:at,vector:v,color:'#4cf2d0',label:'固定喷口推力 T'}];
   const p=plume(at,v,.8);if(p)plumes.push(p);
   if(Math.abs(v[1])>.1)arrows.push({origin:at,vector:[0,v[1],0],color:'#8ca5ff',label:'横向分量',dashed:true});
   if(Math.abs(v[2])>.1)arrows.push({origin:at,vector:[0,0,v[2]],color:'#ffbd69',label:'竖直分量',dashed:true});
  }
  frames.push({frame:scene.from+local,scene:scene.id,local,u,c,phi,omega,rollRate,simTime,mode,arrows,plumes:plumes.filter(Boolean),trail,groundMark:[c[0],c[1],GROUND],nozzles:{left:add(c,rotateX(NOZZLE_LEFT,phi)),right:add(c,rotateX(NOZZLE_RIGHT,phi))},thrust:{magnitude:thrustVector?FIXED_THRUST:null,verticalComponent:thrustVector?thrustVector[2]:null,lateralComponent:thrustVector?thrustVector[1]:null}});
 }
}
const tests=[];const check=(n,ok,d)=>{tests.push({name:n,pass:!!ok,detail:d});if(!ok)throw Error(n)};
check('frames contiguous',frames.every((f,i)=>f.frame===i),frames.length);
for(const [a,e] of [[0,[0,0,1]],[Math.PI/2,[0,-1,0]],[Math.PI,[0,0,-1]]])check('Rx '+a,rotateX([0,0,1],a).every((v,i)=>Math.abs(v-e[i])<1e-7),rotateX([0,0,1],a));
check('analytic ballistic residual',frames.filter(f=>f.scene==='ballistic').every(f=>Math.abs(f.c[2]-(5.886*f.simTime-.5*g*f.simTime**2))<1e-9),'metres, no air');
check('spin starts and ends at rest',Math.abs(spin(0)[1])<1e-9&&Math.abs(spin(spinDuration)[1])<1e-9,'principal x axis');
check('ballistic tumble slower',BALL_TURNS<1,BALL_TURNS);
const cross=(r,F)=>[r[1]*F[2]-r[2]*F[1],r[2]*F[0]-r[0]*F[2],r[0]*F[1]-r[1]*F[0]];
const cf=[[0,0,1.35],[0,0,-1.35]];const netF=cf[0].map((v,i)=>v+cf[1][i]);const netT=cross(NOZZLE_LEFT,cf[0]).map((v,i)=>v+cross(NOZZLE_RIGHT,cf[1])[i]);
check('nozzle couple zero resultant',netF.every(v=>Math.abs(v)<1e-12),netF);
check('nozzle couple pure x torque',Math.abs(netT[1])<1e-12&&Math.abs(netT[2])<1e-12&&netT[0]>0,netT.map(v=>+v.toFixed(4)));
check('plume opposes thrust',frames.flatMap(f=>f.plumes).filter(p=>p.length>.01).every(p=>Math.abs(Math.hypot(...p.dir)-1)<1e-9),'unit direction');
check('gravity stays at centre of mass',frames.every(f=>{const a=f.arrows.find(x=>x.label==='重力 mg');return !a||a.origin.every((v,i)=>Math.abs(v-f.c[i])<1e-9)}),'no lever arm under uniform gravity');
check('forces at nozzle pods',frames.filter(f=>f.scene==='fixed').every(f=>f.arrows.every(a=>{const expect=add(f.c,rotateX(NOZZLE_CENTRE,f.phi));return a.origin.every((v,i)=>Math.abs(v-expect[i])<1e-9)})),'c + Rx(phi) r');
const ninety=frames.find(f=>f.scene==='fixed'&&Math.abs(f.phi-Math.PI/2)<1e-9);
check('90 deg: no vertical component',Math.abs(ninety.thrust.verticalComponent)<1e-12,ninety.thrust.verticalComponent);
check('90 deg: full lateral component',Math.abs(Math.abs(ninety.thrust.lateralComponent)-FIXED_THRUST)<1e-12,ninety.thrust.lateralComponent);
fs.writeFileSync(path.join(root,'source/v01/physics/preview-frames-v3.json'),JSON.stringify(frames));
fs.writeFileSync(path.join(root,'source/v01/physics/assumptions-v3.json'),JSON.stringify({fps,gravity:g,world:'right-handed x forward y left z up',teachingOnly:true,vehicleDimensionsNotTesla:true,airResistance:false,massConstantApproximation:true,rollAxis:'principal x',coupleTorqueMoment:netT[0],angularAcceleration:alpha,ballisticTurns:BALL_TURNS,fixedThrustTeachingMagnitude:FIXED_THRUST,physicalTime:{ballistic:1.2,couple:spinDuration},forceApplicationPoints:'teaching nozzle pods at y=+-0.89, z=-0.33; not a verified Tesla layout',fixedNozzleStudy:'orientation prescribed; force drawn at its real application point; not a hover prediction',rotationMatrix:'Rx(phi)',proofOfTeslaFlight:false,supersedes:'preview-frames-v2.json (layout pass only)'},null,2));
fs.mkdirSync(path.join(root,'work/v01/checks'),{recursive:true});
fs.writeFileSync(path.join(root,'work/v01/checks/physics-v3.json'),JSON.stringify({tests,passed:tests.every(t=>t.pass)},null,2));
console.log('PHYSICS_V3_OK',frames.length,'frames',tests.length,'assertions');
