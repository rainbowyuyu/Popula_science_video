import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';

export type NobelState={scene:string;progress:number;line:number;lineProgress:number;time:number;previous?:string;elapsed?:number};
export const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export const smooth=(n:number)=>{const x=clamp(n);return x*x*x*(x*(x*6-15)+10)};
const C={ink:0x183746,ivory:0xf4f0e5,blue:0x4389ff,cyan:0x55cfe8,gold:0xffc05a,green:0x43b97b,greenDark:0x126b4c,coral:0xee8c72,purple:0x9b83e6,white:0xf7fbf8,red:0xe86c67,slate:0x648a9b};
const std=(c:number,r=.45,m=0)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
const basic=(c:number,o=1)=>new THREE.MeshBasicMaterial({color:c,transparent:o<1,opacity:o,depthWrite:o>.65});
const glass=(c:number,o=.25)=>new THREE.MeshPhysicalMaterial({color:c,transparent:true,opacity:o,roughness:.25,transmission:.25,clearcoat:.5,side:THREE.DoubleSide});
const sphere=(r:number,m:THREE.Material)=>new THREE.Mesh(new THREE.SphereGeometry(r,24,16),m);
const tube=(points:THREE.Vector3[],c:number,r=.05,o=1)=>new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),64,r,10,false),basic(c,o));
const line=(points:THREE.Vector3[],c:number,o=1)=>new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),basic(c,o));
const cylBetween=(a:THREE.Vector3,b:THREE.Vector3,r:number,m:THREE.Material)=>{const v=new THREE.Vector3().subVectors(b,a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,v.length(),14),m);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return mesh;};
type GroupName='hook'|'context'|'algae'|'channel'|'neuron'|'brain'|'impact';
/* The voice timeline has a fixed number of clips per visual station.  Keeping
 * this map here makes every causal animation key off the same deterministic
 * (line + lineProgress) clock that drives the captions. */
const STEP_COUNT:Record<GroupName,number>={hook:2,context:1,algae:4,channel:4,neuron:4,brain:3,impact:4};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const TARGET_ZOOM:Record<GroupName,number>={hook:1.13,context:1.13,algae:1.22,channel:1.15,neuron:1.10,brain:1.13,impact:1.13};

export class NobelWorldV4{
 renderer:THREE.WebGLRenderer; scene=new THREE.Scene(); camera:THREE.OrthographicCamera;
 groups:Record<GroupName,THREE.Group>={hook:new THREE.Group(),context:new THREE.Group(),algae:new THREE.Group(),channel:new THREE.Group(),neuron:new THREE.Group(),brain:new THREE.Group(),impact:new THREE.Group()};
 room=new THREE.Group();
 hookCells:THREE.Mesh[]=[]; contextCells:THREE.Mesh[]=[]; algae!:THREE.Group; algaeBody!:THREE.Mesh; algaeEye!:THREE.Mesh; algaeFlagella:THREE.Mesh[]=[]; algaeBeam!:THREE.Mesh;
 gate!:THREE.Mesh; gateDoor!:THREE.Mesh; gateGlow!:THREE.Mesh; ionTrail!:THREE.Line; ionArrow!:THREE.Mesh; ions:THREE.Mesh[]=[]; channelPhotons:THREE.Mesh[]=[]; channelMembrane!:THREE.Group; frog!:THREE.Mesh;
 neuronPath:THREE.Vector3[]=[]; neuronPulse:THREE.Mesh[]=[]; neuronPhotons:THREE.Mesh[]=[]; neuronLight!:THREE.Mesh; controlNeuron!:THREE.Group; trace!:THREE.Line; controlTrace!:THREE.Line; traceCursor!:THREE.Mesh;
 fiber!:THREE.Mesh; fiberCone!:THREE.Mesh; fiberPhotons:THREE.Mesh[]=[]; targetCells:THREE.Mesh[]=[]; offTargetCells:THREE.Mesh[]=[]; whiskers:THREE.Line[]=[]; whiskerBaseY:number[][]=[]; mouse!:THREE.Group; memoryCells:THREE.Mesh[]=[]; retina!:THREE.Group;
 constructor(canvas:HTMLCanvasElement,width=1920,height=1080){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setSize(width,height,false);this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;/* Keep the ivory paper bright while restoring separation between translucent teaching layers. */this.renderer.toneMappingExposure=1.14;
  this.camera=new THREE.OrthographicCamera(-4.5*width/height,4.5*width/height,4.5,-4.5,.1,100);this.camera.position.set(0,.2,16);this.camera.lookAt(0,0,0);
  const pm=new THREE.PMREMGenerator(this.renderer);const env=pm.fromScene(new RoomEnvironment(),.03);this.scene.environment=env.texture;pm.dispose();this.scene.background=new THREE.Color(C.ivory);this.scene.add(new THREE.HemisphereLight(0xffffff,0x9baeb2,1.75));const key=new THREE.DirectionalLight(0xfff2db,2.8);key.position.set(-5,8,8);this.scene.add(key);const fill=new THREE.DirectionalLight(0xc5edff,1.4);fill.position.set(7,3,-5);this.scene.add(fill);
  this.scene.add(this.room);Object.values(this.groups).forEach(g=>this.scene.add(g));this.buildRoom();this.buildHook();this.buildContext();this.buildAlgaeScene();this.buildChannel();this.buildNeuronScene();this.buildBrainScene();this.buildImpactScene();
 }
 buildRoom(){const f=new THREE.Mesh(new THREE.PlaneGeometry(60,40),std(0xe9e4d9,.92));f.rotation.x=-Math.PI/2;f.position.y=-3.35;f.receiveShadow=true;this.room.add(f);const halo=new THREE.Mesh(new THREE.CircleGeometry(5.5,64),basic(0xffffff,.16));halo.rotation.x=-Math.PI/2;halo.position.y=-3.32;this.room.add(halo);}
 buildBrainBase(g:THREE.Group,x=0,y=0,z=.2,scale=1){const brain=new THREE.Group();brain.scale.set(scale,scale*.82,scale);for(const dx of [-1.15,1.15]){const h=new THREE.Mesh(new THREE.SphereGeometry(1.85,42,26),new THREE.MeshStandardMaterial({color:0x6398ae,roughness:.4,transparent:true,opacity:.9}));h.scale.set(.98,.82,1);h.position.set(dx,0,0);brain.add(h);for(let i=0;i<7;i++){const a=i*Math.PI*2/7+.2;const pts=[new THREE.Vector3(dx+Math.cos(a)*.55,Math.sin(a)*.95-.15,.65),new THREE.Vector3(dx+Math.cos(a+.4)*1.05,Math.sin(a+.4)*1.25-.1,.7),new THREE.Vector3(dx+Math.cos(a+.75)*1.48,Math.sin(a+.75)*1.4-.1,.7)];brain.add(tube(pts,C.slate,.04,.72));}}brain.position.set(x,y,z);g.add(brain);return brain;}
 buildHook(){const g=this.groups.hook;this.buildBrainBase(g,0,.1,.2,.9);for(let i=0;i<9;i++){const n=sphere(.115,std(C.coral,.3,.05));const a=i/9*Math.PI*2;n.position.set(-.2+Math.cos(a)*.55,-.3+Math.sin(a)*.45,1.15);g.add(n);this.hookCells.push(n);}const ring=new THREE.Mesh(new THREE.TorusGeometry(.75,.035,12,64),basic(C.coral,.82));ring.position.set(-.2,-.3,1.12);g.add(ring);const beam=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,4.2,12),basic(C.blue,.65));beam.rotation.z=Math.PI/2;beam.position.set(-2.3,.9,.9);g.add(beam);}
 buildContext(){const g=this.groups.context;this.buildBrainBase(g,0,.1,.2,.95);for(let i=0;i<30;i++){const n=sphere(.075,basic(i<8?C.coral:C.cyan,.7));const a=i*.82,r=.55+(i%6)*.18;n.position.set(Math.cos(a)*r,Math.sin(a*1.37)*1.2-.25,1.1+Math.sin(a)*.18);g.add(n);this.contextCells.push(n);}const left=line([new THREE.Vector3(-3.2,-2.2,1),new THREE.Vector3(-.7,-2.2,1)],C.ink,.35);const right=line([new THREE.Vector3(.2,-2.2,1),new THREE.Vector3(3.2,-2.2,1)],C.coral,.65);g.add(left,right);}
 buildAlgaeScene(){
  const g=this.groups.algae;
  this.algae=new THREE.Group();this.algae.position.set(-.1,.05,.2);g.add(this.algae);
  const dish=new THREE.Mesh(new THREE.TorusGeometry(2.35,.08,16,72),glass(0x8dbcc2,.6));dish.rotation.x=Math.PI/2;dish.position.y=-1.65;g.add(dish);
  const shell=sphere(1.18,new THREE.MeshPhysicalMaterial({color:C.green,roughness:.3,transmission:.08,clearcoat:.7}));shell.scale.set(1.12,.84,.68);shell.position.set(-.85,0,0);this.algae.add(shell);this.algaeBody=shell;
  const chlor=new THREE.Mesh(new THREE.TorusGeometry(.85,.13,12,52),std(C.greenDark,.4));chlor.rotation.set(Math.PI/2,.25,.25);chlor.position.set(-.85,0,.08);this.algae.add(chlor);
  this.algaeEye=sphere(.2,new THREE.MeshPhysicalMaterial({color:C.gold,emissive:C.gold,emissiveIntensity:.75,roughness:.25}));this.algaeEye.position.set(-1.72,.28,.5);this.algae.add(this.algaeEye);
  for(const pts of [[new THREE.Vector3(.05,.28,.1),new THREE.Vector3(.8,.8,.2),new THREE.Vector3(1.8,.4,.3),new THREE.Vector3(2.5,.8,.4)],[new THREE.Vector3(.05,-.28,.1),new THREE.Vector3(.75,-.8,.2),new THREE.Vector3(1.7,-.5,.3),new THREE.Vector3(2.55,-.9,.4)]]){const f=tube(pts,C.green,.055,.95);this.algae.add(f);this.algaeFlagella.push(f);}
  this.algaeBeam=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,5.2,12),basic(C.blue,.34));this.algaeBeam.rotation.z=Math.PI/2;this.algaeBeam.position.set(-3.1,.48,.65);g.add(this.algaeBeam);
  for(let i=0;i<7;i++){const p=sphere(.045,basic(C.gold,.75));p.position.set(-2.5+i*.52,-1.1+Math.sin(i)*.12,.4);g.add(p);}
 }
 buildChannel(){
  const g=this.groups.channel;
  this.frog=sphere(1.28,glass(0x89d3b7,.72));this.frog.scale.set(1.15,.98,.82);this.frog.position.set(-2.15,.15,.1);g.add(this.frog);
  const eggRing=new THREE.Mesh(new THREE.TorusGeometry(1.3,.035,12,64),basic(C.green,.78));eggRing.scale.set(1.15,.98,1);eggRing.position.copy(this.frog.position);g.add(eggRing);
  const membrane=new THREE.Group();membrane.position.set(.9,.15,.2);membrane.rotation.y=-.65;this.channelMembrane=membrane;g.add(membrane);
  // The bilayer normal is local Z. Both tails point toward the mid-plane,
  // leaving a real pore rather than placing phospholipids across the opening.
  for(const z of [-.38,.38])for(let ix=-7;ix<=7;ix++)for(let iy=-3;iy<=3;iy++){
   const x=ix*.36,y=iy*.36*(1-.08*Math.abs(ix)/7);
   if(Math.hypot(x-.15,y)<.75)continue;
   const bead=sphere(.075,std(0x8cbab4,.58));bead.position.set(x,y,z);membrane.add(bead);
   const tail=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.42,8),std(0x648e91,.62));tail.rotation.x=Math.PI/2;tail.position.set(x,y,z>0?z-.2:z+.2);membrane.add(tail);
  }
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.56,.14,18,56),std(C.cyan,.24,.12));ring.position.set(.15,0,.46);membrane.add(ring);this.gate=ring;
  const backRing=new THREE.Mesh(new THREE.TorusGeometry(.56,.12,18,56),std(C.cyan,.30,.08));backRing.position.set(.15,0,-.46);membrane.add(backRing);
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
   const x=.15+Math.cos(a)*.57,y=Math.sin(a)*.57;
   membrane.add(cylBetween(new THREE.Vector3(x,y,-.43),new THREE.Vector3(x,y,.43),.095,std(C.cyan,.30,.08)));
  }
  // The closing iris is a short dark plug along the membrane normal. Its
  // local X/Z are radial to the cylinder, so those axes shrink when opened.
  this.gateDoor=new THREE.Mesh(new THREE.CylinderGeometry(.31,.31,.66,20),std(C.ink,.3,.08));this.gateDoor.rotation.x=Math.PI/2;this.gateDoor.position.set(.15,0,.48);membrane.add(this.gateDoor);
  this.gateGlow=new THREE.Mesh(new THREE.TorusGeometry(.78,.045,12,52),basic(C.blue,.2));this.gateGlow.position.set(.15,0,.5);membrane.add(this.gateGlow);
  this.ionTrail=line([new THREE.Vector3(.15,0,1.42),new THREE.Vector3(.15,0,-1.6)],C.gold,.32);membrane.add(this.ionTrail);
  this.ionArrow=new THREE.Mesh(new THREE.ConeGeometry(.13,.28,14),basic(C.gold,.55));this.ionArrow.rotation.x=-Math.PI/2;this.ionArrow.position.set(.15,0,-1.55);membrane.add(this.ionArrow);
  for(let i=0;i<14;i++){const ion=sphere(.09,new THREE.MeshPhysicalMaterial({color:i%3===0?C.cyan:C.gold,emissive:i%3===0?C.cyan:C.gold,emissiveIntensity:.3,roughness:.22}));membrane.add(ion);this.ions.push(ion);}
  for(let i=0;i<5;i++){const photon=sphere(.065,basic(C.blue,.9));membrane.add(photon);this.channelPhotons.push(photon);}
  const dna=new THREE.Group();for(let i=0;i<12;i++){const y=-1.55+i*.25,a=i*.65;const pa=sphere(.06,basic(C.purple,.75));pa.position.set(-2.1+Math.sin(a)*.35,y,1);dna.add(pa);const pb=sphere(.06,basic(C.gold,.75));pb.position.set(-2.1-Math.sin(a)*.35,y,1);dna.add(pb);dna.add(line([new THREE.Vector3(-2.1+Math.sin(a)*.35,y,1),new THREE.Vector3(-2.1-Math.sin(a)*.35,y,1)],C.white,.45));}g.add(dna);
 }
 buildNeuronScene(){
  const g=this.groups.neuron;
  const dish=new THREE.Mesh(new THREE.TorusGeometry(3.25,.08,18,80),glass(0x92bec4,.65));dish.rotation.x=Math.PI/2;dish.position.y=-1.8;g.add(dish);
  const soma=sphere(.62,new THREE.MeshPhysicalMaterial({color:C.coral,roughness:.32,clearcoat:.7}));soma.position.set(-2.4,0,.25);g.add(soma);
  for(const pts of [[new THREE.Vector3(-1.95,.2,.3),new THREE.Vector3(-1.2,.7,.35),new THREE.Vector3(-.6,.35,.4)],[new THREE.Vector3(-1.95,-.15,.3),new THREE.Vector3(-1.3,-.8,.35),new THREE.Vector3(-.6,-.35,.4)]])g.add(tube(pts,C.purple,.065,.92));
  const p0=[new THREE.Vector3(-1.9,0,.35),new THREE.Vector3(-.8,.04,.4),new THREE.Vector3(.35,-.03,.4),new THREE.Vector3(1.5,.12,.45),new THREE.Vector3(3.05,.08,.5)];
  this.neuronPath=new THREE.CatmullRomCurve3(p0).getPoints(110);g.add(tube(p0,C.purple,.075,.94));
  for(let i=0;i<12;i++){const p=sphere(.105,basic(C.gold,.95));g.add(p);this.neuronPulse.push(p);}
  this.neuronLight=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,3.4,12),basic(C.blue,.14));this.neuronLight.position.set(-.8,2.05,.8);g.add(this.neuronLight);
  for(let i=0;i<5;i++){const photon=sphere(.065,basic(C.blue,.9));g.add(photon);this.neuronPhotons.push(photon);}
  const control=new THREE.Group();const csoma=sphere(.32,glass(C.slate,.5));csoma.position.set(-1.15,-1.12,.35);control.add(csoma);control.add(tube([new THREE.Vector3(-.85,-1.12,.35),new THREE.Vector3(.05,-1.12,.36),new THREE.Vector3(1.05,-1.08,.38)],C.slate,.045,.62));this.controlNeuron=control;g.add(control);
  const tracePts:THREE.Vector3[]=[],controlPts:THREE.Vector3[]=[];
  for(let i=0;i<90;i++){
   const x=-1.8+i*.055;
   const y=-2.45+Math.sin(i*.12)*.03+Math.exp(-Math.pow((i-30)/6,2))*1.15+Math.exp(-Math.pow((i-63)/5,2))*1.0;
   tracePts.push(new THREE.Vector3(x,y,.5));controlPts.push(new THREE.Vector3(x,-3.07,.5));
  }
  this.trace=line(tracePts,C.red,.94);this.trace.geometry.setDrawRange(0,25);
  this.controlTrace=line(controlPts,C.slate,.72);g.add(this.trace,this.controlTrace);
  this.traceCursor=sphere(.085,basic(C.gold,.95));g.add(this.traceCursor);
 }
 buildBrainScene(){
  const g=this.groups.brain;
  // This is a cutaway of the stimulated cortex, not a giant opaque brain
  // hovering over the animal.  The thin shell leaves the labelled cells legible.
  const brain=this.buildBrainBase(g,-1.05,.45,.05,.68);
  brain.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial){o.material.opacity=.18;o.material.depthWrite=false;o.material.side=THREE.DoubleSide;}});
  const skull=new THREE.Mesh(new THREE.SphereGeometry(1.95,32,20,0,Math.PI*2,0,Math.PI*.55),new THREE.MeshBasicMaterial({color:C.cyan,transparent:true,opacity:.075,wireframe:true,depthWrite:false,side:THREE.DoubleSide}));skull.position.set(-1.05,.48,.55);g.add(skull);
  this.fiber=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,2.8,14),basic(C.blue,.75));this.fiber.position.set(-.86,2.14,1.25);g.add(this.fiber);
  const tip=sphere(.13,basic(C.blue,.95));tip.position.set(-.86,.75,1.25);g.add(tip);
  this.fiberCone=new THREE.Mesh(new THREE.ConeGeometry(.55,.8,32,1,true),basic(C.blue,.06));this.fiberCone.position.set(-.86,.35,1.3);g.add(this.fiberCone);
  for(let i=0;i<5;i++){const photon=sphere(.075,basic(C.blue,.95));g.add(photon);this.fiberPhotons.push(photon);}
  for(let i=0;i<9;i++){const n=sphere(.12,std(C.coral,.3,.05));const a=i/9*Math.PI*2;n.position.set(-.86+Math.cos(a)*.48,.12+Math.sin(a)*.36,1.42);g.add(n);this.targetCells.push(n);}
  for(let i=0;i<8;i++){const n=sphere(.085,glass(C.slate,.32));const a=i/8*Math.PI*2;n.position.set(-.86+Math.cos(a)*.88,.12+Math.sin(a)*.65,1.31);g.add(n);this.offTargetCells.push(n);}
  // All animal features, especially the whisker roots, share one transform.
  // The response changes the distal points only, so no whisker detaches.
  this.mouse=new THREE.Group();this.mouse.position.set(.65,-1.5,.5);g.add(this.mouse);
  const body=sphere(.62,std(C.ink,.52));body.scale.set(1.55,.78,.78);body.position.set(-.12,-.05,0);this.mouse.add(body);
  const head=sphere(.37,std(C.ink,.52));head.scale.set(1.13,.93,.88);head.position.set(.72,.14,.14);this.mouse.add(head);
  const ear=sphere(.18,std(C.slate,.5));ear.scale.set(.68,1,.54);ear.position.set(.54,.47,.35);this.mouse.add(ear);
  const eye=sphere(.055,basic(C.white,.95));eye.position.set(.98,.23,.49);this.mouse.add(eye);
  const nose=sphere(.085,std(C.ink,.28));nose.position.set(1.12,.06,.46);this.mouse.add(nose);
  this.mouse.add(tube([new THREE.Vector3(-.95,-.03,.02),new THREE.Vector3(-1.35,.13,.12),new THREE.Vector3(-1.57,.28,.08)],C.slate,.055,.9));
  for(const x of [-.46,.32]){const foot=sphere(.17,std(C.ink,.5));foot.scale.set(1.1,.35,.72);foot.position.set(x,-.53,.25);this.mouse.add(foot);}
  for(let i=0;i<6;i++){
   const side=i<3?1:-1,offset=i%3-1;
   const pts=[new THREE.Vector3(1.13,.06,.48),new THREE.Vector3(1.47,.06+offset*.12,.51+side*.035),new THREE.Vector3(1.83,.07+offset*.22,.48+side*.08)];
   const w=line(pts,C.gold,.92);this.mouse.add(w);this.whiskers.push(w);this.whiskerBaseY.push(pts.map(v=>v.y));
  }
 }
 buildImpactScene(){const g=this.groups.impact;this.buildBrainBase(g,-1.1,.2,.2,.72);const loopPts=[];for(let i=0;i<8;i++){const a=i*Math.PI*2/8;const n=sphere(.13,std(i%2?C.coral:C.purple,.3));n.position.set(-1.15+Math.cos(a)*1.05,.2+Math.sin(a)*.82,1.1);g.add(n);this.memoryCells.push(n);loopPts.push(n.position.clone());}loopPts.push(loopPts[0].clone());g.add(line(loopPts,C.coral,.55));const eye=new THREE.Group();eye.position.set(2.25,.1,.2);eye.add(sphere(1.0,glass(0xd9edf0,.68)));const iris=new THREE.Mesh(new THREE.TorusGeometry(.34,.12,16,48),std(C.cyan,.25));iris.position.z=.95;eye.add(iris);const pupil=sphere(.17,std(C.ink,.3));pupil.position.z=1.06;eye.add(pupil);g.add(eye);this.retina=eye;const arrow=line([new THREE.Vector3(1.05,.1,.5),new THREE.Vector3(1.8,.1,.5)],C.gold,.8);g.add(arrow);}
 station(n:string):[number,number]{const p:Record<string,[number,number]>={hook:[0,.1],context:[.1,.05],algae:[-.35,.05],channel:[.1,.1],neuron:[.15,.05],brain:[0,.05],impact:[0,.05]};return p[n]??[0,0];}
 setPos(g:THREE.Group,x:number,y:number,scale=1){g.position.set(x,y,0);g.scale.setScalar(scale);}
 render(s:NobelState){
  const scene=s.scene as GroupName,p=clamp(s.progress),t=s.time,prev=s.previous as GroupName|undefined,elapsed=s.elapsed??2;
  const transitioning=!!prev&&prev!==scene,trans=transitioning?clamp(elapsed/1.2):1,q=smooth(trans);
  const stepCount=STEP_COUNT[scene]??1;
  /* One deterministic clock for visuals and captions: a visual event never
   * starts before the spoken clip that introduces it. */
  const voiceStep=clamp((Math.max(0,s.line)+clamp(s.lineProgress))/stepCount);
  const [sx,sy]=this.station(scene),cur=this.groups[scene],travel=13.5;
  for(const n of Object.keys(this.groups) as GroupName[])this.groups[n].rotation.set(0,0,0);
  if(cur){const entering=transitioning?1-q:0;this.setPos(cur,sx+travel*entering,sy,(scene==='brain'||scene==='impact'?.94:1)*(.965+.035*q));cur.rotation.z=.045*entering;cur.rotation.y=.018*entering;}
  if(transitioning){const [px,py]=this.station(prev!);const exiting=q;this.setPos(this.groups[prev!],px-travel*exiting,py,(prev==='brain'||prev==='impact'?.94:1)*(.985+.015*(1-q)));this.groups[prev!].rotation.z=-.035*exiting;this.groups[prev!].rotation.y=-.014*exiting;}
  const [px,py]=transitioning?this.station(prev!):[sx,sy];
  const cameraX=transitioning?mix(px,sx,q):sx;
  const targetZoom=TARGET_ZOOM[scene]??1.13,fromZoom=transitioning?(TARGET_ZOOM[prev!]??1.13):targetZoom;
  this.camera.position.x=cameraX+.1*Math.sin(t*.25);this.camera.position.y=.25+.06*Math.sin(t*.21);this.camera.position.z=16;this.camera.zoom=transitioning?mix(fromZoom,targetZoom,q):targetZoom;this.camera.lookAt(this.camera.position.x*.04,0,0);this.camera.updateProjectionMatrix();
  /* Hide an outgoing group only after its full geometry has crossed the view
   * edge.  A fixed travel distance of 13.5 world units is wider than the
   * orthographic half-width plus the largest model radius at every zoom. */
  const halfW=Math.abs(this.camera.right-this.camera.left)/(2*Math.max(.01,this.camera.zoom)),modelRadius=4.2;
  for(const n of Object.keys(this.groups) as GroupName[]){if(n===scene)this.groups[n].visible=true;else if(transitioning&&n===prev)this.groups[n].visible=Math.abs(this.groups[n].position.x-this.camera.position.x)<halfW+modelRadius;else this.groups[n].visible=false;}
  const active=(n:GroupName)=>scene===n||(transitioning&&prev===n);
  this.hookCells.forEach((n,i)=>n.scale.setScalar(.8+1.4*smooth(.5+.5*Math.sin(t*2.3+i))));
  this.contextCells.forEach((n,i)=>{const a=scene==='context'?smooth(p*1.5-i*.018):transitioning&&prev==='context'?1:.1;n.scale.setScalar(.7+1.8*a);(n.material as THREE.MeshBasicMaterial).opacity=.22+.76*a;});
  // The eye spot faces the lamp on the left. The body actually approaches it
  // during the behavioural clip; the outgoing algae stays at its final pose.
  const algaeStep=scene==='algae'?voiceStep:transitioning&&prev==='algae'?1:0;
  const swim=smooth(clamp((algaeStep-.24)/.27));
  this.algae.position.x=mix(-.1,-1.12,swim);
  this.algaeBody.rotation.z=.07*Math.sin(t*.75)+.05*swim;
  this.algaeFlagella.forEach((f,i)=>f.rotation.z=.13*Math.sin(t*(2+1.3*swim)+i));
  this.algaeEye.scale.setScalar(.9+.18*Math.sin(t*2.4));
  (this.algaeBeam.material as THREE.MeshBasicMaterial).opacity=.18+.38*(.5+.5*Math.sin(t*2.1));
  // Light arrives first, opens the pore second, then cations travel from the
  // camera-side extracellular leaflet (local +Z) to the inner leaflet (-Z).
  const channelStep=scene==='channel'?voiceStep:transitioning&&prev==='channel'?1:0;
  // Clip 008 introduces the blue-light gate.  Do not reveal an open pore
  // during the preceding frog-egg setup (clip 007).
  const open=smooth(clamp((channelStep-.25)/.08)),poreScale=Math.max(.10,1-.90*open);
  this.gateDoor.scale.set(poreScale,1,poreScale);
  this.gateGlow.scale.setScalar(.8+1.4*open);
  (this.gateGlow.material as THREE.MeshBasicMaterial).opacity=.08+.48*open;
  (this.ionTrail.material as THREE.LineBasicMaterial).opacity=.06+.48*open;
  (this.ionArrow.material as THREE.MeshBasicMaterial).opacity=.08+.64*open;
  this.channelMembrane.rotation.y=-.65+.025*Math.sin(t*.4);
  const ionFlow=smooth(clamp((channelStep-.33)/.18));
  this.ions.forEach((ion,i)=>{
   // Continue a measured-looking cation stream after the first reveal;
   // a saturated interpolation left all ions frozen for the next two beats.
   const phase=((t*.52+i/this.ions.length)%1+1)%1;
   const u=ionFlow*phase;
   ion.position.set(.15+Math.sin(i*2.3)*.13,Math.cos(i*1.9)*.13,mix(1.38,-1.55,u));
   ion.visible=active('channel')&&channelStep>.31;
   ion.scale.setScalar((.78+.30*open)*(.58+.42*Math.sin(Math.PI*phase)));
  });
  this.channelPhotons.forEach((ph,i)=>{
   const u=(channelStep-.245)/.075-i*.14;
   ph.position.set(mix(-2.35,.15,clamp(u)),.58+.045*Math.sin(i),.98);
   ph.visible=active('channel')&&u>=0&&u<1;
  });
  const eggBreath=1+.035*Math.sin(t*1.6);this.frog.scale.set(1.15*eggBreath,.98*eggBreath,.82*eggBreath);
  // One event clock links photon arrival, axonal propagation and the plotted
  // action potential. The waveform is revealed progressively, never pre-drawn.
  const neuronStep=scene==='neuron'?voiceStep:transitioning&&prev==='neuron'?1:0;
  const lightPulse=smooth(clamp((neuronStep-.27)/.035))*(1-smooth(clamp((neuronStep-.38)/.05)));
  const signal=smooth(clamp((neuronStep-.37)/.33));
  const signalFade=1-smooth(clamp((neuronStep-.81)/.14));
  this.neuronPhotons.forEach((ph,i)=>{
   const u=(neuronStep-.27)/.105-i*.105;
   ph.position.set(-.8,mix(3.6,.43,clamp(u)),.86);
   ph.visible=active('neuron')&&u>=0&&u<1;
  });
  (this.neuronLight.material as THREE.MeshBasicMaterial).opacity=.12+.65*lightPulse;
  this.neuronPulse.forEach((n,i)=>{
   const u=signal*1.3-i*.055;
   n.visible=active('neuron')&&signalFade>.02&&u>0&&u<1;
   n.position.copy(this.neuronPath[Math.min(this.neuronPath.length-1,Math.floor(clamp(u)*(this.neuronPath.length-1)))!]);
   n.scale.setScalar((.65+1.0*Math.exp(-Math.pow(i/9,2)))*signalFade);
  });
  const traceProgress=smooth(clamp((neuronStep-.39)/.33));
  this.trace.geometry.setDrawRange(0,Math.max(25,Math.round(90*(.28+.72*traceProgress))));
  // The gold read-head keeps moving along the recorded waveform while the
  // red line remains visible for comparison with the quiet grey control.
  const tracePhase=((t*.22)%1+1)%1;
  const tracePosition=this.trace.geometry.getAttribute('position');
  const traceIndex=Math.min(89,Math.round(89*tracePhase));
  this.traceCursor.position.set(tracePosition.getX(traceIndex),tracePosition.getY(traceIndex),.57);
  this.traceCursor.visible=active('neuron')&&neuronStep>.39;
  this.controlNeuron.scale.setScalar(.9+.05*Math.sin(t));
  const brainStep=scene==='brain'?voiceStep:transitioning&&prev==='brain'?1:0;
  const brainReveal=smooth(clamp((brainStep-.18)/.20));
  (this.fiberCone.material as THREE.MeshBasicMaterial).opacity=.03+.24*brainReveal;
  this.targetCells.forEach((n,i)=>n.scale.setScalar(.8+1.3*smooth(brainReveal*1.6-i*.055)));
  this.fiber.rotation.z=.015*Math.sin(t*.7);
  this.fiberPhotons.forEach((ph,i)=>{
   const u=(brainStep-.04)/.22-i*.11;
   ph.position.set(-.86,mix(3.52,.76,clamp(u)),1.30);
   ph.visible=active('brain')&&u>=0&&u<1;
  });
  const whiskerResponse=smooth(clamp((brainStep-.24)/.045))*(1-smooth(clamp((brainStep-.35)/.08)));
  this.mouse.rotation.y=.018*Math.sin(t*.75);
  this.mouse.position.y=-1.5+.018*Math.sin(t*1.1);
  this.whiskers.forEach((w,i)=>{
   const pts=w.geometry.getAttribute('position'),base=this.whiskerBaseY[i]??[];
   pts.setY(0,base[0]??.06);
   pts.setY(1,(base[1]??0)+whiskerResponse*(.08+.07*Math.sin(t*8+i*.42)));
   pts.setY(2,(base[2]??0)+whiskerResponse*(.20+.10*Math.sin(t*8+i*.42)));
   pts.needsUpdate=true;
  });
  const impactStep=scene==='impact'?voiceStep:transitioning&&prev==='impact'?1:0;
  const impactReveal=smooth(clamp((impactStep-.08)/.25));
  this.memoryCells.forEach((n,i)=>n.scale.setScalar(.85+1.6*smooth((impactReveal*1.8-i*.08)%1)));
  if(this.retina){this.retina.rotation.y=.12*Math.sin(t*.5);this.retina.scale.setScalar(.87+.13*smooth((impactStep-.52)/.22));}
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.scene.traverse(o=>{const x=o as THREE.Mesh;if(x.geometry)x.geometry.dispose();const m=(x as any).material;if(m){for(const a of (Array.isArray(m)?m:[m]))a.dispose();}});this.renderer.dispose();this.renderer.forceContextLoss();}
}
