import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
export const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export const ease=(v:number)=>{const x=clamp(v);return x*x*x*(x*(6*x-15)+10)};
const mix=T.MathUtils.lerp,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export type MetroState={scene:string;index:number;progress:number;elapsed:number;time:number;line:number;lineProgress:number};
type FlowFrame={u:number[];v:number[];cp:number[]};
type FlowData={nx:number;nz:number;x0:number;z0:number;dx:number;dz:number;solid:number[];frames:FlowFrame[]};
type Streamline={seedZ:number;points:[number,number][];arrivalTime:number[];travelTime:number;termination:string};
type StreamlineData={snapshots:{flowFrameIndex:number;lines:Streamline[]}[]};
type BalanceFrame={windSpeedMs:number;dragN:number;overturningMomentNm:number;weightN:number};
type BalanceData={frames:BalanceFrame[]};
export const IDS=['arrival','line','piston','nose','side','wake','balance','distance','speed','doors','habit','return','references'];
type Shot={eye:number[];at:number[];endEye:number[];endAt:number[];train:number;platform:number;rear:number;tunnel:number;flow:number;heat:number;force:number;doors:number;person:number};
const spec=(eye:number[],at:number[],endEye:number[],endAt:number[],v:Partial<Shot>={}):Shot=>({eye,at,endEye,endAt,train:0,platform:0,rear:0,tunnel:0,flow:0,heat:0,force:0,doors:0,person:0,...v});
const shots:Shot[]=[
 spec([-7,3.3,5.2],[2,1,0],[-8,4.8,7.5],[0,1,.4],{train:18}),
 spec([-3,4.8,7],[-1,0,1.5],[-1,3.4,6],[-.5,.25,1.4]),
 spec([-12,7,10],[1,1,0],[-7,9,8],[0,1,0],{tunnel:1,person:0,platform:1,train:-2}),
 spec([-7,7.6,8],[-2,.7,0],[-8,5.5,6],[-3,.65,0],{flow:1,heat:1,platform:1,rear:1}),
 spec([.5,7.7,6.8],[0,.7,0],[3,4.5,5],[.6,.9,.35],{flow:1,heat:.35,platform:1,rear:1}),
 spec([8,8,7],[4,.65,0],[9,5,5.8],[4,.8,0],{flow:1,heat:.2,platform:1,rear:1}),
 spec([-3,3.8,6.5],[-1,.7,1.8],[-2,2.9,5.4],[-1,.9,2],{force:1,person:1}),
 spec([-2,7,8],[-.7,.1,1.3],[1.5,6.6,8],[0,.3,1.2],{person:1}),
 spec([-3,3.3,6.6],[.5,.7,1.8],[-2.5,3,6.4],[.5,.8,1.8],{force:1}),
 spec([-4,3.8,7],[0,.8,1],[-1.5,3,5.8],[.1,1,1.1],{doors:1}),
 spec([-3,3.4,6],[-.5,.85,2.4],[1.6,3,6.7],[2.2,.7,2.8],{doors:1,person:1}),
 spec([-6,5.5,9],[0,.8,1],[-9,7.5,11],[0,.5,.8],{doors:1}),
 spec([-9,7.5,11],[0,.5,.8],[-11,8.5,13],[0,.5,.8],{doors:1}),
];
function material(c:number,metal=.0,rough=.52){return new T.MeshStandardMaterial({color:c,metalness:metal,roughness:rough})}
function box(w:number,h:number,d:number,m:T.Material,r=.02){const b=new T.Mesh(r?new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)):new T.BoxGeometry(w,h,d),m);b.castShadow=true;b.receiveShadow=true;return b}
function put(g:T.Object3D,o:T.Object3D,x=0,y=0,z=0){o.position.set(x,y,z);g.add(o);return o}
function rod(a:T.Vector3,b:T.Vector3,r:number,m:T.Material){const o=new T.Mesh(new T.CylinderGeometry(r,r,a.distanceTo(b),10),m);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize());return o}
function path(points:T.Vector3[],color:number,r=.018){return new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),60,r,7,false),new T.MeshBasicMaterial({color}))}
function labelTexture(text:string,color='#eaf1f2',bg='#142b3b'){const c=document.createElement('canvas');c.width=1024;c.height=180;const x=c.getContext('2d')!;x.fillStyle=bg;x.fillRect(0,0,1024,180);x.font='600 96px Microsoft YaHei';x.textAlign='center';x.textBaseline='middle';x.fillStyle=color;x.fillText(text,512,90);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t}
export class MetroWorld{
 root=new T.Group();station=new T.Group();train=new T.Group();cars:T.Group[]=[];tunnel=new T.Group();screen=new T.Group();humans:T.Group[]=[];scarf!:T.Group;scarfTail!:T.Group;
 flowGroup=new T.Group();heatGroup=new T.Group();forceGroup=new T.Group();pistonGroup=new T.Group();distanceGroup=new T.Group();balanceGroup=new T.Group();doors:T.Group[]=[];screenDoors:T.Group[]=[];propsGroup=new T.Group();trainRoofs:T.Object3D[]=[];pistonCurves:T.CatmullRomCurve3[]=[];
 ready:Promise<void>;flow!:FlowData;balance!:BalanceData;streamlines!:StreamlineData;flowPaths:Streamline[]=[];flowDots:T.Mesh[]=[];flowTrails:T.Line[]=[];flowLines:T.Line[]=[];heatTexture?:T.DataTexture;heatPlane?:T.Mesh;flowPoint=new T.Vector3();
 forwardArrows:T.ArrowHelper[]=[];pistonDots:T.Mesh[]=[];balanceArrow!:T.ArrowHelper;gravityArrow!:T.ArrowHelper;com!:T.Mesh;balanceLine!:T.Line;feetArea!:T.Mesh;distanceBars:T.Mesh[]=[];
 white=material(0xdbE5e6,.25,.26);navy=material(0x142c3b,.28,.38);dark=material(0x0b1825,.2,.43);metal=material(0x92a3ae,.8,.26);amber=material(0xf4b544,.15,.4);teal=material(0x24bdb4,.25,.3);
 bodyMaterials:T.MeshStandardMaterial[]=[];cameraAudit:any={};piston:any;
 constructor(base:string){
  this.root.name='metro-exploded-laboratory';
  this.root.add(this.station,this.train,this.tunnel,this.screen,this.flowGroup,this.heatGroup,this.forceGroup,this.pistonGroup,this.distanceGroup,this.balanceGroup);
  this.buildStation();this.buildTrain();this.buildTunnel();this.buildPeople();this.buildForces();this.buildScreens();this.buildProps();
  const read=async(n:string)=>{const r=await fetch(base+'physics/'+n);if(!r.ok)throw Error('Missing simulation '+n);return r.json()};
  this.ready=Promise.all([read('flow.json'),read('balance.json'),read('streamlines.json'),read('piston.json')]).then(([flow,balance,streamlines,piston])=>{this.flow=flow;this.balance=balance;this.streamlines=streamlines;this.piston=piston;this.buildFlow()});
 }
 buildStation(){
  put(this.station,box(37,.6,5.5,material(0x506373,.1,.68),.16),0,-.35,3.55);
  put(this.station,box(37,.1,.14,this.metal),0,-.03,.82);
  put(this.station,box(37,.023,.22,this.amber,.015),0,.007,1.62);
  put(this.station,box(37,.024,.32,material(0x718393),.015),0,.004,2.12);
  // Tactile ribs and large tile joints give the camera a stable spatial anchor.
  for(let x=-18;x<=18;x+=.4)put(this.station,box(.04,.032,.25,material(0x92a4ad),.009),x,.028,2.12);
  for(let x=-18;x<=18;x+=1.5)put(this.station,box(.009,.012,4.9,material(0x374d5d),0),x,-.025,3.68);
  for(let z=2.7;z<6.1;z+=1.15)put(this.station,box(37,.012,.01,material(0x374d5d),0),0,-.025,z);
  for(let x=-15;x<=18;x+=6){
   put(this.station,box(.4,4.8,.4,this.navy,.08),x,2.3,8.8);
   put(this.station,box(.43,.06,.43,this.teal),x,3.3,8.8);
   put(this.station,box(3.9,.05,.08,new T.MeshBasicMaterial({color:0xdceef0})),x,4.3,8.5);
   put(this.station,box(3.9,.12,.35,this.navy),x,4.4,8.5);
  }
  const bed=box(65,.22,2,material(0x152331),.08);put(this.root,bed,7,-.78,0);
  for(const z of [-.44,.44])put(this.root,box(65,.1,.065,this.metal,.01),7,-.53,z);
  for(let x=-25;x<38;x+=.46)put(this.root,box(.13,.08,1.55,material(0x35404b),.01),x,-.63,0);
  const sign=box(4.8,.8,.08,new T.MeshBasicMaterial({map:labelTexture('安全线后候车')}),.02);put(this.station,sign,8,3.35,-2.2);
  for(const x of [-8,7]){put(this.station,box(2.3,.11,.48,this.metal,.045),x,.5,4.8);for(const xx of [-.8,.8])put(this.station,box(.06,.5,.32,this.navy),x+xx,.22,4.8);}
 }
 buildTrain(){
  for(let k=0;k<3;k++){
   const g=new T.Group();this.train.add(g);this.cars.push(g);
   put(g,box(7.6,.22,1.26,this.navy,.07),.05,-.01,0);
   const roof=put(g,box(7.65,.22,1.3,this.white,.09),.02,1.67,0);this.trainRoofs.push(roof);
   put(g,box(7.2,.08,1.15,material(0x93a4a8),.03),.1,.07,0);
   for(const z of [-.65,.65]){
    for(const [lo,hi] of [[-3.23,-1.3],[-.3,1.25],[2.25,3.7]]){
     const x=(lo+hi)/2,w=hi-lo;
     put(g,box(w,.56,.08,this.white,.025),x,.4,z);
     put(g,box(w,.11,.084,this.teal,.01),x,.68,z);
     put(g,box(w,.13,.08,this.white,.01),x,1.46,z);
     for(const edge of [lo+.05,hi-.05])put(g,box(.1,.69,.08,this.white,.01),edge,1.08,z);
     const win=material(0x193c4d,.48,.16);put(g,box(w-.22,.65,.03,win,.055),x,1.07,z);
    }
    for(const x of [-.8,1.75]){
     const doorGroup=new T.Group();put(g,doorGroup,x,.8,z*1.005);this.doors.push(doorGroup);doorGroup.userData.car=k;
     for(const side of [-1,1]){
      const leaf=new T.Group();leaf.userData.side=side;doorGroup.add(leaf);
      put(leaf,box(.46,1.3,.045,this.white,.02),side*.245,0,0);
      put(leaf,box(.32,.62,.049,material(0x123445,.48,.17),.04),side*.245,.16,0);
      put(leaf,box(.025,.17,.055,this.metal,.008),side*.075,-.32,z>0?.012:-.012);
     }
    }
   }
   for(const x of [-2.4,2.4]){for(const z of [-.56,.56]){const w=new T.Mesh(new T.CylinderGeometry(.28,.28,.14,20),this.dark);w.rotation.x=Math.PI/2;put(g,w,x,-.31,z);const hub=new T.Mesh(new T.CylinderGeometry(.13,.13,.148,18),this.metal);hub.rotation.x=Math.PI/2;put(g,hub,x,-.31,z);}put(g,box(1.2,.17,.95,this.dark),x,-.27,0);}
   for(const x of [-1.5,1.8]){put(g,box(1.35,.14,.8,material(0x8396a2,.6,.45),.06),x,1.86,0);for(let n=-4;n<=4;n++)put(g,box(.048,.014,.64,this.navy,.005),x+n*.13,1.94,0);}
   for(const z of [-.37,.37])for(const [x,w] of [[-2.25,1.6],[.475,1.1],[3,1.05]])put(g,box(w,.25,.32,this.teal,.05),x,.34,z);
   for(const x of [-2,1,2.8])put(g,new T.Mesh(new T.CylinderGeometry(.016,.016,1.45,8),this.metal),x,.84,.05);
   // Sloping front face and wraparound glass distinguish the leading cab.
   if(k===0){const nose=box(.88,1.46,1.27,this.white,.2);put(g,nose,-3.52,.86,0);nose.rotation.z=-.055;
    const glass=box(.045,.68,1.08,material(0x0a2739,.5,.14),.03);put(g,glass,-3.964,1.11,0);glass.rotation.z=-.055;
    for(const z of [-.44,.44])put(g,box(.04,.1,.21,new T.MeshBasicMaterial({color:0xf9eac6}),.028),-3.98,.56,z);
    put(g,box(.048,.08,.51,this.teal,.02),-3.99,.35,0);
   }else put(g,box(.1,1.48,1.24,this.white,.07),-3.63,.86,0);
   put(g,box(.13,1.45,1.22,this.white,.06),3.75,.86,0);
   if(k<2){put(g,box(.5,1.18,.97,this.dark,.08),4.02,.83,0);for(let n=0;n<5;n++)put(g,box(.027,1.24,1.02,this.metal,.008),3.82+n*.085,.83,0);}
  }
 }
 buildTunnel(){
  const section=new T.Shape();section.moveTo(-1.7,-.65);section.lineTo(-1.7,2.05);section.absarc(0,2.05,1.7,Math.PI,0,true);section.lineTo(1.7,-.65);
  const linePts=section.getPoints(45).map(p=>V(0,p.y,p.x));
  for(let x=9;x<34;x+=2){const ring=path(linePts,0x506878,.045);ring.position.x=x;this.tunnel.add(ring);}
  for(const z of [-1.6,1.6])put(this.tunnel,box(24,.08,.08,this.teal),21,1.1,z);
  const branches=[ [V(-4,1,0),V(-6,1,0),V(-9,1,0),V(-13,1,0)], [V(-4,1,0),V(-4.8,1,1.2),V(0,1,1.37),V(6,1,1.3)], [V(-4,1,0),V(-5,1,-1.1),V(-5,3,-1.1),V(-5,5.5,-1.1)] ];
  this.pistonCurves=branches.map(p=>new T.CatmullRomCurve3(p));
  this.pistonCurves.forEach((c,i)=>{const mesh=new T.Mesh(new T.TubeGeometry(c,80,.022,8,false),new T.MeshBasicMaterial({color:i===2?0xefbb68:0x54cfca}));this.pistonGroup.add(mesh);});
  put(this.tunnel,box(1.3,3.4,.055,new T.MeshStandardMaterial({color:0x51747f,transparent:true,opacity:.2,side:T.DoubleSide}),.015),9,4.3,-1.6);
  for(let i=0;i<80;i++){const dot=new T.Mesh(new T.SphereGeometry(.045,8,8),new T.MeshBasicMaterial({color:0x62e0db}));this.pistonGroup.add(dot);this.pistonDots.push(dot);}
  for(let i=0;i<4;i++){const a=new T.ArrowHelper(V(-1,0,0),V(0,1,0),1.2,0x5cdddb,.24,.13);this.pistonGroup.add(a);this.forwardArrows.push(a);}
 }
 buildPeople(){
  for(let i=0;i<4;i++){
   const p=new T.Group();this.root.add(p);this.humans.push(p);const coat=material([0xf2ac55,0x659aa3,0xabb9c2,0x397e94][i],.06,.68);
   // A short neck closes the gap between the torso and head so the scarf has
   // a real attachment point instead of reading as a floating rectangle.
   put(p,new T.Mesh(new T.CylinderGeometry(.072,.082,.16,16),material(0xd0bda9,.02,.62)),0,1.37,0);
   put(p,new T.Mesh(new T.SphereGeometry(.125,20,16),material(0xdcc9b4)),0,1.52,0);
   put(p,box(.33,.58,.22,coat,.12),0,1.04,0);
   for(const x of [-.094,.094]){put(p,box(.12,.68,.14,this.navy,.04),x,.43,0);put(p,box(.14,.08,.28,this.dark,.035),x,.052,.065);}
   for(const x of [-.235,.235]){
    const arm=rod(V(x*.73,1.3,0),V(x,.78,.045),.061,coat);p.add(arm);
    // Small skin-toned end caps keep the arms visually connected during the
    // camera move and avoid the mannequin-like cut-off hands.
    put(p,new T.Mesh(new T.SphereGeometry(.067,12,8),material(0xd0bda9,.02,.62)),x,.77,.05);
   }
   const phone=box(.12,.18,.02,material(0x192731,.2,.25),.012);put(p,phone,-.16,1.02,.18);phone.rotation.x=-.4;
   if(i===0){
    // The old scarf was an isolated box behind the left shoulder.  Its centre
    // rotation made a pale square peek out and drift independently.  Build a
    // continuous collar plus a thin curved tail on the front of the neck;
    // only the tail pivot is animated below.
    this.scarf=new T.Group();this.scarf.name='person-scarf';p.add(this.scarf);
    const scarfMat=material(0xb9783f,.04,.46);
    const collar=new T.Mesh(new T.TorusGeometry(.091,.022,10,24),scarfMat);collar.name='scarf-collar';collar.rotation.x=Math.PI/2;put(this.scarf,collar,0,1.37,.005);
    this.scarfTail=new T.Group();this.scarfTail.name='scarf-tail';put(this.scarf,this.scarfTail,0,1.37,.105);
    const tailCurve=new T.CatmullRomCurve3([V(-.058,0,0),V(-.065,-.105,-.008),V(-.045,-.245,-.015),V(.012,-.39,-.02)]);
    const tail=new T.Mesh(new T.TubeGeometry(tailCurve,18,.031,8,false),scarfMat);tail.name='scarf-tail-fabric';this.scarfTail.add(tail);
   }
  }
 }
 buildForces(){
  this.balanceArrow=new T.ArrowHelper(V(-.65,0,-.76).normalize(),V(-1,1.08,2),1.1,0xf3886c,.2,.13);this.forceGroup.add(this.balanceArrow);
  this.gravityArrow=new T.ArrowHelper(V(0,-1,0),V(-1,1.02,2),.9,0x8cddd3,.16,.1);this.forceGroup.add(this.gravityArrow);
  this.com=new T.Mesh(new T.SphereGeometry(.065,16,12),new T.MeshBasicMaterial({color:0xffce76}));this.balanceGroup.add(this.com);
  this.balanceLine=new T.Line(new T.BufferGeometry().setFromPoints([V(),V(0,1,0)]),new T.LineDashedMaterial({color:0xffc96c,dashSize:.065,gapSize:.05}));this.balanceGroup.add(this.balanceLine);
  this.feetArea=box(.43,.012,.38,new T.MeshBasicMaterial({color:0xeebc64,transparent:true,opacity:.3}),.05);this.balanceGroup.add(this.feetArea);
  for(const group of [this.forceGroup,this.balanceGroup])group.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.renderOrder=90;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{m.depthTest=false;m.depthWrite=false})}});
  for(let i=0;i<3;i++){const bar=box(.035,.025,1, new T.MeshBasicMaterial({color:i===0?0xf4916e:0x56d5cf}),.008);this.distanceGroup.add(bar);this.distanceBars.push(bar);}
 }
 buildScreens(){
  const glass=new T.MeshPhysicalMaterial({color:0x97d6df,metalness:.12,roughness:.14,transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false});
  for(let car=0;car<3;car++){
   const offset=car*8.55;
   for(const [lo,hi] of [[-3.8,-1.3],[-.3,1.25],[2.25,4.73]]){const x=(lo+hi)/2+offset,w=hi-lo;
    put(this.screen,box(w,2.24,.021,glass),x,1.12,.99);put(this.screen,box(w,.045,.035,this.teal),x,1.2,1.01);
    for(const xx of [lo,hi])put(this.screen,box(.04,2.35,.06,this.metal),xx+offset,1.175,.99);
   }
   put(this.screen,box(8.55,.1,.12,this.navy),offset+.475,2.33,.99);
   for(const x of [-.8,1.75]){const pair=new T.Group();put(this.screen,pair,x+offset,0,.99);this.screenDoors.push(pair);for(const side of [-1,1]){const leaf=new T.Group();leaf.userData.side=side;pair.add(leaf);put(leaf,box(.49,2.24,.021,glass),side*.25,1.12,0);put(leaf,box(.021,2.24,.035,this.metal),side*.015,1.12,.005);put(leaf,box(.49,.045,.035,this.teal),side*.25,1.2,.015);}}
  }
 }
 buildProps(){
  this.root.add(this.propsGroup);
  const bag=new T.Group();put(this.propsGroup,bag,-.42,0,2.75);put(bag,box(.3,.47,.2,material(0xc18448,.15,.55),.055),0,.29,0);for(const x of [-.1,.1])put(bag,box(.016,.33,.016,this.metal),x,.68,0);put(bag,box(.22,.035,.035,this.dark),0,.85,0);for(const x of [-.12,.12])put(bag,new T.Mesh(new T.SphereGeometry(.045,12,8),this.dark),x,.065,.035);
  const stroller=new T.Group();put(this.propsGroup,stroller,3.65,0,3.1);const frame=material(0x94aeb8,.7,.3);
  for(const x of [-.24,.24]){stroller.add(rod(V(x,.15,-.28),V(x,.95,.26),.024,frame),rod(V(x,.15,.33),V(x,.8,-.13),.024,frame));for(const z of [-.28,.33]){const wh=new T.Mesh(new T.CylinderGeometry(.11,.11,.055,16),this.dark);wh.rotation.z=Math.PI/2;put(stroller,wh,x,.12,z);}}
  put(stroller,box(.48,.08,.45,material(0x437f8b),.03),0,.44,0);const back=box(.48,.4,.06,material(0x437f8b),.04);put(stroller,back,0,.63,.18);back.rotation.x=-.2;stroller.add(rod(V(-.24,.95,.26),V(.24,.95,.26),.03,this.dark));
 }
 sample(x:number,z:number,f=this.flow.frames.length-1){
  const d=this.flow;const {nx,nz}=d;const xx=clamp((x-d.x0)/(d.dx*(nx-1)))*(nx-1),zz=clamp((z-d.z0)/(d.dz*(nz-1)))*(nz-1);const ix=Math.min(nx-2,Math.floor(xx)),iz=Math.min(nz-2,Math.floor(zz)),fx=xx-ix,fz=zz-iz;const k=iz*nx+ix;const ff=d.frames[Math.max(0,Math.min(d.frames.length-1,Math.floor(f)))];
  const interp=(a:number[])=>mix(mix(a[k],a[k+1],fx),mix(a[k+nx],a[k+nx+1],fx),fz);
  return {u:interp(ff.u),v:interp(ff.v),cp:interp(ff.cp)};
 }
 // Numerical path-time interpolation retains slow near-wall flow. It does not
 // normalize particle speed or add spline overshoot inside the train.
 samplePath(path:Streamline,time:number,out:T.Vector3){
  const times=path.arrivalTime,t=Math.max(0,Math.min(path.travelTime,time));let lo=0,hi=times.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(times[mid]<=t)lo=mid;else hi=mid;}
  const a=path.points[lo],b=path.points[hi],q=clamp((t-times[lo])/Math.max(1e-9,times[hi]-times[lo]));
  return out.set(mix(a[0],b[0],q),.94,mix(a[1],b[1],q));
 }
 balanceAtSpeed(speed:number){
  const rows=this.balance.frames,s=Math.max(rows[0].windSpeedMs,Math.min(rows[rows.length-1].windSpeedMs,speed));let lo=0,hi=rows.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(rows[mid].windSpeedMs<=s)lo=mid;else hi=mid;}
  const a=rows[lo],b=rows[hi],q=(s-a.windSpeedMs)/Math.max(1e-9,b.windSpeedMs-a.windSpeedMs);
  return {windSpeedMs:s,dragN:mix(a.dragN,b.dragN,q),overturningMomentNm:mix(a.overturningMomentNm,b.overturningMomentNm,q)};
 }
 // Independent illustrative wind speeds, never a scale conversion from Re=20.
 // With the default 4 m/s baseline, multiplier 1 -> 2 returns force ratio 1 -> 4.
 forceScaleForSpeedMultiplier(multiplier:number,referenceSpeed=4){
  const baseline=this.balanceAtSpeed(referenceSpeed).dragN;
  return this.balanceAtSpeed(referenceSpeed*multiplier).dragN/Math.max(1e-9,baseline);
 }
 buildFlow(){
  // Final stable field. The same verified train-frame paths are followed in
  // nose/side/wake close-ups; shot values control entry and exit of this layer.
  this.flowPaths=this.streamlines.snapshots[this.streamlines.snapshots.length-1].lines.map(p=>{
   // Straight visual transport extensions place particle birth/death well
   // outside every camera. Original RK4 points and times remain unchanged
   // relative to one another. These external segments are not a new solve.
   const first=p.points[0],last=p.points[p.points.length-1];const before=first[0]+45,after=45-last[0];
   return {...p,points:[[-45,first[1]],...p.points,[45,last[1]]] as [number,number][],arrivalTime:[0,...p.arrivalTime.map(t=>t+before),before+p.travelTime+after],travelTime:before+p.travelTime+after};
  });
  for(const [pathIndex,stream] of this.flowPaths.entries()){
   const points=stream.points.map(([x,z])=>V(x,.94,z));
   const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0x46bfbf,transparent:true,opacity:.17}));line.frustumCulled=false;this.flowGroup.add(line);this.flowLines.push(line);
   for(let k=0;k<3;k++){const dot=new T.Mesh(new T.SphereGeometry(.038,8,8),new T.MeshBasicMaterial({color:0x9bfff0}));dot.userData.pathIndex=pathIndex;dot.userData.offset=(k/3+(stream.seedZ+4.2)*.021)%1;this.flowGroup.add(dot);this.flowDots.push(dot);
    const trail=new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length:12},()=>V())),new T.LineBasicMaterial({color:0x58dbd3,transparent:true,opacity:.8}));trail.frustumCulled=false;this.flowGroup.add(trail);this.flowTrails.push(trail);}
  }
  const d=this.flow,pixels=new Uint8Array(d.nx*d.nz*4),cp=d.frames[d.frames.length-1].cp;
  const warm=new T.Color(0xe68466),cool=new T.Color(0x2cc5cf),neutral=new T.Color(0x173442),color=new T.Color();
  for(let k=0;k<cp.length;k++){
   const v=Math.max(-1,Math.min(1,cp[k]/1.2));
   color.copy(v>0?warm:cool).lerp(neutral,1-Math.abs(v)).convertLinearToSRGB();
   pixels[4*k]=Math.round(color.r*255);pixels[4*k+1]=Math.round(color.g*255);pixels[4*k+2]=Math.round(color.b*255);
   pixels[4*k+3]=d.solid[k]?0:Math.round(160*Math.min(1,Math.abs(v)*2+.05));
  }
  const tex=new T.DataTexture(pixels,d.nx,d.nz,T.RGBAFormat);tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearFilter;tex.colorSpace=T.SRGBColorSpace;tex.flipY=false;tex.needsUpdate=true;this.heatTexture=tex;
  const w=d.dx*(d.nx-1),h=d.dz*(d.nz-1);this.heatPlane=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,transparent:true,opacity:.6,depthWrite:false,side:T.DoubleSide}));
  // Texture row zero is z_min. +90deg maps plane local-y to world +z.
  this.heatPlane.rotation.x=Math.PI/2;this.heatPlane.position.set(d.x0+w/2,.14,d.z0+h/2);this.heatGroup.add(this.heatPlane);
 }
 values(s:MetroState){
  const i=Math.max(0,IDS.indexOf(s.scene));const curr=shots[i],prev=shots[Math.max(0,i-1)];const join=i===0?1:ease(s.elapsed/2.8);const vals={} as Record<string,number>;for(const key of ['train','platform','rear','tunnel','flow','heat','force','doors','person'])vals[key]=mix((prev as any)[key],(curr as any)[key],join);
  if(i===0)vals.train=mix(25,0,ease(s.progress*.95));if(i===1)vals.train=mix(mix(25,0,ease(.95)),0,ease(s.elapsed/3));
  return {i,curr,prev,join,vals};
 }
 update(s:MetroState,camera:T.PerspectiveCamera){
  const {i,curr,prev,join,vals:a}=this.values(s);const u=ease(clamp((s.progress-.12)/.88));const eye=V(...curr.eye as [number,number,number]).lerp(V(...curr.endEye as [number,number,number]),u);const at=V(...curr.at as [number,number,number]).lerp(V(...curr.endAt as [number,number,number]),u);
  if(i>0){eye.lerpVectors(V(...prev.endEye as [number,number,number]),eye,join);at.lerpVectors(V(...prev.endAt as [number,number,number]),at,join);}
  camera.position.copy(eye);camera.fov=39;camera.near=.04;camera.far=180;camera.lookAt(at);camera.updateProjectionMatrix();
  this.train.position.x=a.train;this.cars.forEach((car,k)=>car.position.x=k*8.55+(k?46*a.rear:0));
  // The platform assembly, people, props, and platform screen must share the
  // same z travel during the opening/arrival move.  Leaving the screen at its
  // build-time z made its white metal frames and translucent panes drift
  // independently behind the nearest person for a few seconds (visible as a
  // moving white block in the close-up).  Keep the whole platform-side
  // assembly in lockstep while preserving the independent x slide used for
  // the screen-door reveal.
  this.station.position.z=34*a.platform;this.screen.position.z=34*a.platform;this.screen.position.y=0;this.screen.position.x=48*(1-a.doors);this.tunnel.position.z=0;this.tunnel.position.x=mix(40,-16,a.tunnel);
  for(let n=0;n<this.humans.length;n++){const p=this.humans[n];const x=[-1,3.9,7.5,11.5][n],z=[2.2,2.8,3.6,2.6][n];p.position.set(x,0,z+34*a.platform);p.rotation.x=0;p.rotation.y=Math.PI*.12;
   if(n===0&&s.scene==='balance'){const b=ease(clamp((s.progress-.2)/.32))*(1-ease(clamp((s.progress-.72)/.25)));p.rotation.x=-.07*b;p.position.z+=.15*b;}
   if(n===0&&i===7)p.position.z=z+.5*ease(s.progress);
   if(n===0&&i>=8)p.position.z=z+.5;
  }
  // Keep the collar planted at the neck.  A small pivot at the top of the
  // curved tail gives the fabric a restrained, readable flutter without
  // ever swinging a rectangular piece out behind the shoulder.
  const scarfMotion=i===0?1:i===1?mix(1,.3,join):.3;
  this.scarfTail.rotation.z=.055*Math.sin(s.time*4.2)*scarfMotion;
  this.scarfTail.rotation.x=.022*Math.sin(s.time*3.1+.4)*scarfMotion;
  this.scarfTail.rotation.y=.018*Math.sin(s.time*2.7)*scarfMotion;
  const flowA=Math.min(1,a.flow*2);this.flowGroup.position.set(a.train,0,40*(1-flowA));this.heatGroup.position.set(a.train,0,40*(1-Math.min(1,a.heat*8)));
  if(this.flow){
   this.flowDots.forEach((dot,n)=>{
    const path=this.flowPaths[dot.userData.pathIndex];const t=(s.time*2.1+dot.userData.offset*path.travelTime)%path.travelTime;
    this.samplePath(path,t,dot.position);
    const attr=this.flowTrails[n].geometry.getAttribute('position') as T.BufferAttribute;
    // Clip each tail at its off-screen birth point; never draw a wraparound
    // chord from downstream outlet to inlet across the model.
    for(let k=0;k<12;k++){this.samplePath(path,Math.max(0,t-k*.027),this.flowPoint);attr.setXYZ(k,this.flowPoint.x,this.flowPoint.y,this.flowPoint.z);}
    attr.needsUpdate=true;this.flowTrails[n].geometry.computeBoundingSphere();
   });
  }
  this.pistonGroup.position.set(a.train,0,34*(1-a.tunnel));this.pistonDots.forEach((dot,n)=>{const branch=n<20?0:n<56?1:2;const record=this.piston?.frames[40];const speed=record?record.branches[[1,2,0][branch]].meanSpeedMs:1;const phase=(s.time*.11*speed+n*.618)%1;dot.position.copy(this.pistonCurves[branch].getPointAt(phase));dot.position.y+=Math.sin(n*14)*.09;});
  this.forwardArrows.forEach((ar,n)=>{const curve=this.pistonCurves[n%3];const u=.4+.05*Math.sin(s.time);ar.position.copy(curve.getPointAt(u));ar.setDirection(curve.getTangentAt(u).normalize());});
  this.forceGroup.position.set(28*(1-a.force),0,0);this.balanceGroup.position.copy(this.forceGroup.position);const person=this.humans[0];const point=V(-1,1.06,person.position.z+.13);this.balanceArrow.position.copy(point);const speedMultiple=s.scene==='speed'?1+ease((s.progress-.2)/.25):i>8?2:1;const forceRatio=this.balance?this.forceScaleForSpeedMultiplier(speedMultiple):1;this.balanceArrow.setLength(.43*forceRatio,.14,.085);this.gravityArrow.position.copy(point);this.com.position.copy(point);this.feetArea.position.set(-1,.025,person.position.z+.065);const arr=this.balanceLine.geometry.getAttribute('position') as T.BufferAttribute;arr.setXYZ(0,point.x,point.y,point.z);arr.setXYZ(1,point.x,.026,point.z);arr.needsUpdate=true;this.balanceLine.computeLineDistances();this.balanceLine.geometry.computeBoundingSphere();
  const distance=i===7?ease(s.elapsed/3):i===8?1-ease(s.elapsed/3):0;this.distanceGroup.position.z=30*(1-distance);this.distanceBars.forEach((bar,n)=>{bar.scale.z=[.55,1.15,1.9][n];bar.position.set(-1.4+n*1.9,.03,.75+bar.scale.z*.5);});
  const opening=(s.scene==='return'?ease((s.progress-.46)/.32):s.scene==='references'?1:0)*.48;
  this.doors.forEach(d=>d.children.forEach(leaf=>{leaf.position.x=leaf.userData.side*opening;}));
  this.screenDoors.forEach(d=>d.children.forEach(leaf=>{leaf.position.x=leaf.userData.side*opening;}));
  this.propsGroup.position.z=34*a.platform;
  this.cameraAudit={scene:s.scene,eye:camera.position.toArray(),at:at.toArray(),values:a};
  this.root.updateMatrixWorld(true);
 }
 dispose(){const gs=new Set<T.BufferGeometry>(),ms=new Set<T.Material>();this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){gs.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());this.heatTexture?.dispose();}
}

