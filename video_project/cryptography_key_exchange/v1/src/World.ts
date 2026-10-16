import {buildAttackRig} from './AttackRig';
import {buildAuthRig} from './AuthRig';
import {loadCafeAssets} from './Assets';
import {buildCipherRig} from './CipherRig';
import * as T from 'three';
import {buildMathRig} from './MathRig';
import {createCinematicStageV6} from './Stage';
import {sampleCamera} from './Camera';
import {groups,cue,phase,after,ease,clamp,group} from './Timeline';
import {C,mat,mesh,box,sphere,line,ring,text,packet,key,padlock,pedestal,phone} from './Primitives';

export class World{
 root=new T.Group();stations:T.Group[]=[];stage:ReturnType<typeof createCinematicStageV6>;animated:((t:number)=>void)[]=[];traveler:T.Group;
 constructor(private scene:T.Scene,private camera:T.PerspectiveCamera,private renderer:T.WebGLRenderer){
  this.root.name='cryptography-continuous-world';scene.add(this.root);this.stage=createCinematicStageV6(scene,renderer,{shadowMapSize:1024,exposure:1.04});
  groups.forEach(g=>{const s=new T.Group();s.name=g.id;s.position.x=g.x;this.root.add(s);this.stations.push(s);});
  const track:number[][]=[];for(let i=0;i<=100;i++){const x=-12+i*1.92;track.push([x,-1.58,.5+.26*Math.sin(x*.19)]);}line(this.root,track,'#b9c8bc',.035);line(this.root,track.map(p=>[p[0],p[1]-.08,p[2]-.06]),'#e7c798',.018);
  this.traveler=packet(this.root,C.gold);this.traveler.scale.setScalar(.5);
  this.buildCafe(this.stations[0],false);this.buildExchange(this.stations[1]);this.buildMix(this.stations[2]);this.animated.push(buildMathRig(this.stations[3]));this.animated.push(buildAttackRig(this.stations[4]));this.animated.push(buildAuthRig(this.stations[5]));this.animated.push(buildCipherRig(this.stations[6]));this.buildCafe(this.stations[7],true);
  const n=800,arr=new Float32Array(n*3);let seed=191771;for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;arr[i*3]=-10+seed/2**32*195;seed=(Math.imul(seed,1664525)+1013904223)>>>0;arr[i*3+1]=-.8+seed/2**32*7;seed=(Math.imul(seed,1664525)+1013904223)>>>0;arr[i*3+2]=-7+seed/2**32*3;}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(arr,3));const points=new T.Points(geo,new T.PointsMaterial({color:'#c6ba99',size:.027,transparent:true,opacity:.38,depthWrite:false}));this.root.add(points);
  this.stage.prepareModels(this.root);
 }
 buildCafe(g:T.Group,end:boolean){
  pedestal(g,1.1,4.2);const p=phone(g,end);p.position.set(.8,.6,0);p.rotation.y=-.3;
  const order=packet(g,C.gold);order.position.set(-3.1,.1,.7);order.scale.setScalar(1.25);
  const cupGroup=new T.Group();g.add(cupGroup);cupGroup.name='cup-slot';cupGroup.position.set(-2.8,-1.38,1.1);
  const cup=mesh(new T.CylinderGeometry(.65,.5,1,48,1,true),new T.MeshPhysicalMaterial({color:'#eee8d7',roughness:.23,side:T.DoubleSide}),cupGroup,[0,0,0]);mesh(new T.CylinderGeometry(.57,.57,.04,48),mat('#544438',0,.17),cupGroup,[0,.38,0]);const h=ring(cupGroup,.34,'#e5dfce',[.68,0,0],.11);h.rotation.y=Math.PI/2;mesh(new T.CylinderGeometry(1,1,.11,64),mat('#ece4d4'),cupGroup,[0,-.57,0]);
  const cakeSlot=new T.Group();cakeSlot.name='cake-slot';cakeSlot.position.set(3.65,-.9,.7);g.add(cakeSlot);
  mesh(new T.CylinderGeometry(1.05,1.05,.7,64),mat('#c3916e',0,.55),cakeSlot);mesh(new T.CylinderGeometry(1.08,1.04,.18,64),mat('#faf0d7',0,.35),cakeSlot,[0,.41,0]);mesh(new T.CylinderGeometry(1.3,1.3,.08,64),mat('#c2ae88',.45),cakeSlot,[0,-.4,0]);for(let i=0;i<7;i++){const a=i/7*Math.PI*2;sphere(cakeSlot,.12,'#b75945',[.76*Math.cos(a),.57,.76*Math.sin(a)]);}const candle=mesh(new T.CylinderGeometry(.045,.045,.7,16),mat(C.teal),cakeSlot,[0,.83,0]);const flame=sphere(cakeSlot,.075,C.gold,[0,1.25,0]);flame.scale.y=1.9;
  line(g,[[-4,0,0],[-1,-.9,1.1],[3,-.9,1.1],[6,0,0]],C.metal,.025);
  if(!end){const eye=new T.Group();g.add(eye);eye.position.set(-3.8,1.5,-.4);ring(eye,.42,C.rose);sphere(eye,.14,C.rose);this.animated.push(t=>{const v=phase('c02',t);order.position.set(-2.5+4*ease(v),-.2+.5*Math.sin(v*Math.PI),.8);order.rotation.y=.15*Math.sin(t*.5);});}
  else this.animated.push(t=>{const q=phase('c40',t);flame.scale.set(1+.12*Math.sin(t*5),1.8+.2*Math.sin(t*4),1);order.position.set(-2.5,.2+.09*Math.sin(t*.7),1);cakeSlot.rotation.y=.12*Math.sin(t*.13);});
 }
 buildExchange(g:T.Group){
  pedestal(g,-3.5,2.2);pedestal(g,3.5,2.2);const left=padlock(g,C.teal),right=padlock(g,C.blue);left.g.position.set(-3.5,.2,0);right.g.position.set(3.5,.2,0);left.g.scale.setScalar(1.4);right.g.scale.setScalar(1.4);
  line(g,[[-3.5,-.3,.4],[0,1.15,.3],[3.5,-.3,.4]],C.metal);const k=key(g),copy=key(g,C.rose);const envelope=packet(g);envelope.position.set(0,-.7,.5);envelope.scale.setScalar(1.3);text(g,'你',[-3.5,2.4,0],1.4);text(g,'网站',[3.5,2.4,0],1.7);
  const secretL=sphere(g,.23,C.rose,[-3.4,-1,.6]),secretR=sphere(g,.23,C.blue,[3.4,-1,.6]);this.animated.push(t=>{const p=phase('c03',t),q=after('c04',t,2.5);k.position.set(-3.5+7*ease(clamp((p-.12)/.6)),1.2+.4*Math.sin(p*Math.PI),.6);copy.position.set(k.position.x,-.5-2*ease(p),.7);copy.scale.setScalar(ease((p-.38)*5)*(1-q));left.shackle.position.y=.6*(1-q);right.shackle.position.y=.6*(1-q);secretL.scale.setScalar(.7+q);secretR.scale.setScalar(.7+q);envelope.rotation.y=t*.07;});
 }
 buildMix(g:T.Group){
  const vessels:T.Group[]=[],fluids:T.Mesh<T.CylinderGeometry,T.MeshPhysicalMaterial>[]=[];
  for(const x of [-3.3,3.3]){pedestal(g,x,2.1);const v=new T.Group();v.position.x=x;g.add(v);vessels.push(v);mesh(new T.CylinderGeometry(.94,.94,2.1,64,1,true),new T.MeshPhysicalMaterial({color:'#daebe7',metalness:.05,roughness:.13,transparent:true,opacity:.17,side:T.DoubleSide,depthWrite:false}),v,[0,-.1,0]);const f=mesh(new T.CylinderGeometry(.84,.84,1.32,64),new T.MeshPhysicalMaterial({color:C.gold,roughness:.16,metalness:.04,clearcoat:1}),v,[0,-.42,0]) as T.Mesh<T.CylinderGeometry,T.MeshPhysicalMaterial>;fluids.push(f);for(const y of [-1.18,1]){const r=ring(v,.95,C.metal,[0,y,0],.04);r.rotation.x=Math.PI/2;}for(let j=0;j<4;j++){box(v,.15,.02,.02,C.muted,[.64,-.6+j*.35,.72],.005);}}
  const l=sphere(g,.3,C.rose,[-3.3,2.05,0]),r=sphere(g,.3,C.blue,[3.3,2.05,0]);const publicDrop=sphere(g,.51,C.gold,[0,1.1,0]);text(g,'公开',[0,2.2,0],1.8);text(g,'你',[-3.3,-1.65,.7],1.2);text(g,'网站',[3.3,-1.65,.7],1.7);line(g,[[-3.3,.5,-.2],[0,1.6,-.6],[3.3,.5,-.2]],C.metal,.018);
  const exchangeDrops=[sphere(g,.25,'#dd9856'),sphere(g,.25,'#6c9d79')];
  this.animated.push(t=>{const p=phase('c06',t),q=phase('c07',t),mix1=ease(p*3),swap=ease((p-.38)/.55),mix2=ease(q*2);const cL=new T.Color(C.gold).lerp(new T.Color('#d68755'),mix1),cR=new T.Color(C.gold).lerp(new T.Color('#7ca67b'),mix1);fluids[0].material.color.copy(cL).lerp(cR,swap).lerp(new T.Color('#927b62'),mix2);fluids[1].material.color.copy(cR).lerp(cL,swap).lerp(new T.Color('#927b62'),mix2);l.position.y=2.05-1.9*ease(clamp(p*4))+1.9*ease((p-.35)*4)-1.9*mix2;r.position.y=l.position.y;[l,r].forEach(o=>o.scale.setScalar(1-.7*Math.sin(mix2*Math.PI/2)));exchangeDrops[0].position.set(-3.3+6.6*swap,1.25+.95*Math.sin(swap*Math.PI),.4);exchangeDrops[1].position.set(3.3-6.6*swap,.3-.95*Math.sin(swap*Math.PI),.5);exchangeDrops.forEach(o=>o.scale.setScalar(Math.sin(swap*Math.PI)));publicDrop.rotation.y=t*.17;fluids.forEach((f,i)=>{f.rotation.y=t*.4*(i?1:-1);f.scale.y=1+.012*Math.sin(t*2.2);});});
 }
 async loadAssets(url:(s:string)=>string){const report=await loadCafeAssets(this.stations,url,this.stage.prepareModels);this.animated.push(report.update);}
 render(t:number){const pose=sampleCamera(t);this.camera.position.set(...pose.position);this.camera.lookAt(...pose.target);this.camera.fov=pose.fov;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);this.stage.update(pose.target);this.animated.forEach(fn=>fn(t));this.stations.forEach((g,i)=>{const spec=groups[i];g.visible=Math.abs(g.position.x-pose.target[0])<42&&t>=spec.start-5&&(i===7||t<=spec.end+5);});this.traveler.position.set(-20,-7,0);for(let i=1;i<groups.length;i++){const prev=groups[i-1],next=groups[i],from=prev.end-3.5,to=next.start+.8;if(t>=from&&t<=to){const q=ease((t-from)/(to-from));this.traveler.position.set(prev.x+3+(next.x-prev.x-6)*q,-3.3+3.4*Math.sin(q*Math.PI),.8);}}this.traveler.rotation.y=.12*Math.sin(t*.7);this.root.updateMatrixWorld(true);this.renderer.render(this.scene,this.camera);}
 dispose(){this.scene.remove(this.root);this.root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{const mm=m as T.MeshBasicMaterial;mm.map?.dispose();m.dispose();});}});this.stage.dispose();}
}
