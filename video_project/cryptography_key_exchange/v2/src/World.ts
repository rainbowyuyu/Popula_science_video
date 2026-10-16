import * as T from 'three';
import {Environment} from './Environment';import{Courier}from './Courier';import{ExchangeRoom}from './ExchangeRoom';import{IdentityRoom}from './IdentityRoom';import{DeliveryFlow}from './DeliveryFlow';import{lighting}from './Lighting';import{applyCamera}from './Camera';import{group,currentCue,phase,clamp,ease}from './Timeline';import{ring,box,mat,line,text}from './Primitives';
export class World{
 env=new Environment();courier=new Courier();engines=[new ExchangeRoom(),new IdentityRoom(),new DeliveryFlow()];set=new T.Group();lights:ReturnType<typeof lighting>;arch:T.Group[]=[];streams:T.InstancedMesh;positions:Float32Array;dummy=new T.Object3D();
 constructor(private scene:T.Scene,private camera:T.PerspectiveCamera,private renderer:T.WebGLRenderer){
  scene.add(this.env.root,this.courier.root,this.set);this.lights=lighting(scene,renderer);
  const centers=[[0,7,-55],[35,8,-70],[8,7,-102]];this.engines.forEach((e,i)=>{e.root.position.set(...centers[i] as [number,number,number]);scene.add(e.root);});
  // The route physically continues through ribs and apertures. They supply
  // foreground occlusion and perspective instead of slideshow transitions.
  for(let i=0;i<3;i++){const a=new T.Group();a.position.set(0,8,-22-i*3);const r=ring(a,11.5,'#2d457c',[0,0,0],.075);r.scale.y=.74;for(const x of[-11.5,11.5])box(a,.15,8,.3,'#24375a',[x,-3,0],.04);this.arch.push(a);this.set.add(a);}
  for(const center of centers){const plate=box(this.set,25,.4,22,'#101d37',[center[0],center[1]-6,center[2]],.15);plate.material=mat('#111e3c',.58,.28);const n=box(this.set,25,.03,.1,'#ddaa66',[center[0],center[1]-5.77,center[2]+7],.01);}
  // Actual geometric network branches around the central mechanism.
  for(let i=0;i<11;i++){const x=-18+i*3.6;line(this.set,[[x,-.2,-32],[x,1,-45],[x*.5,1,-66],[35+x*.3,1,-73],[8+x*.5,1,-104]],i%3===0?'#b07343':'#263e73',.025);}
  const count=240;this.positions=new Float32Array(count*4);let seed=1432;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<count;i++){this.positions.set([(rand()-.5)*50,rand()*26,-25-rand()*90,rand()],i*4);}
  this.streams=new T.InstancedMesh(new T.BoxGeometry(.035,.035,.4),new T.MeshBasicMaterial({color:'#7e9ccc',transparent:true,opacity:.45}),count);this.streams.frustumCulled=false;this.set.add(this.streams);
  const moon=new T.Mesh(new T.SphereGeometry(3,48,32),new T.MeshBasicMaterial({color:'#cad4e5'}));moon.position.set(-18,30,-72);this.set.add(moon);
 }
 async loadAssets(resolve:(p:string)=>string){await this.env.load(resolve('models/night_city.glb'));}
 render(t:number){const p=applyCamera(this.camera,t);this.lights.update(p.target);this.env.update(t);this.courier.update(t);
  const c=currentCue(t);const s=group('secret'),x=group('exchange'),a=group('intruder'),id=group('identity'),d=group('delivery');
  let stage:'secret'|'exchange'|'intruder'='secret',g=s;if(t>=x.start){stage='exchange';g=x;}if(t>=a.start){stage='intruder';g=a;}
  const state=(st:'secret'|'exchange'|'intruder'|'identity'|'delivery',start:number,end:number)=>({stage:st,progress:clamp((t-start)/(end-start)),cue:c?.id??'',cueProgress:c?phase(c.id,t):0});
  this.engines.forEach(e=>e.update(t));
  for(let i=0;i<this.positions.length/4;i++){const b=i*4;this.dummy.position.set(this.positions[b]+.2*Math.sin(t*.3+i),this.positions[b+1],this.positions[b+2]+((t*.55+this.positions[b+3]*5)%5));this.dummy.scale.setScalar(.5+this.positions[b+3]);this.dummy.updateMatrix();this.streams.setMatrixAt(i,this.dummy.matrix);}this.streams.instanceMatrix.needsUpdate=true;
  this.scene.updateMatrixWorld(true);this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.env.dispose();this.courier.dispose();this.engines.forEach(x=>x.dispose());this.lights.dispose();this.set.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});this.set.removeFromParent();}
}


