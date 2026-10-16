import * as T from 'three';
import {V,Timeline,clamp} from './visual';
import {SCALE} from './Scale';

type Knot={frame:number;target:T.Vector3;distance:number;az:number;el:number};
// Monotone cubic Hermite interpolation gives the same velocity on both sides
// of every anchor, and log distance allows continuous macro-to-micro dollies.
function slopes(x:number[],y:number[]){
 const d=x.slice(1).map((v,i)=>(y[i+1]-y[i])/(v-x[i]));
 return y.map((_,i)=>i===0?d[0]:i===y.length-1?d.at(-1)!:d[i-1]*d[i]<=0?0:2/(1/d[i-1]+1/d[i]));
}
export class CameraPath{
 knots:Knot[]=[]; curves:number[][]=[]; derivatives:number[][]=[];
 constructor(public anchors:Record<string,T.Vector3>,public tl:Timeline){
  const a=(id:string)=>anchors[id].clone();
  const add=(frame:number,p:T.Vector3,d:number,az=.1,el=.08)=>this.knots.push({frame,target:p,distance:d,az,el});
  const k=(id:string,u:number,p:T.Vector3,d:number,az=.1,el=.08)=>{const c=tl.clips.find(c=>c.id===id)!;add(c.start+c.duration*u,p,d,az,el)};
  const torso=V(0,1.29,.02),meal=a('meal'),gut=a('small_intestine'),pan=a('pancreas'),brain=a('brain'),liver=a('liver');
  // The same tabletop and person occupy world coordinates throughout the film.
  // Start high enough to read the real meal, skim the dessert, then crane up
  // the torso as the narration follows the message into the digestive tract.
  add(0,meal, .92,.40,.76);
  k('g001',.7,meal, .79,.30,.72);
  k('g002',.7,meal.clone().add(V(.06,0,.015)),.70,.20,.68);
  k('g003',.74,meal.clone().add(V(.085,0,.025)),.63,.03,.64);
  k('g004',.65,V(.23,1.01,.47),.47,-.10,.57);
  k('g005',.64,meal,.61,-.24,.61);
  k('g006',.72,torso.clone().lerp(a('stomach'),.30),1.08,-.18,.12);
  k('g007',.20,a('stomach'),.56,.12,.11);
  k('g007',.84,gut,.53,.25,.12);
  k('g008',.15,gut,.40,.20,.14);
  k('g008',.37,a('intestinal'),.045,.20,.16);
  k('g008',.80,a('intestinal'),.00031,.22,.19);
  k('g009',.64,a('intestinal'),.00027,-.16,.22);
  k('g009',.98,a('intestinal'),.012,-.22,.19);
  k('g010',.32,gut,.50,-.21,.14);
  k('g010',.57,gut.clone().lerp(pan,.15),.58,-.17,.12);
  k('g010',.80,gut.clone().lerp(pan,.3),.62,-.12,.10);
  k('g011',.85,pan,.39,.22,.13);
  k('g012',.04,pan,.31,.24,.15);
  k('g012',.24,a('islet'),.022,.20,.16);
  k('g012',.48,a('islet'),.00048,.18,.17);
  k('g012',.66,a('islet'),.00041,.08,.20);
  k('g012',.94,a('beta'),54e-6,.05,.13);
  k('g013',.10,a('beta'),49e-6,.02,.12);
  k('g013',.43,a('receptor'),1.4e-6,.05,.17);
  k('g013',.80,a('receptor'),50e-9,.13,.18);
  k('g014',.68,a('receptor'),48e-9,-.16,.19);
  k('g015',.66,a('receptor'),51e-9,-.29,.16);
  k('g016',.08,a('receptor'),4e-6,-.24,.15);
  k('g016',.28,a('beta'),46e-6,-.16,.11);
  k('g016',.40,a('beta'),42e-6,.03,.12);
  k('g016',.69,a('secretion'),3.5e-6,.19,.11);
  k('g016',.94,a('secretion'),2.9e-6,.27,.10);
  k('g017',.15,a('secretion'),65e-6,.24,.10);
  k('g017',.60,a('beta'),.09,.18,.10);
  k('g017',.93,pan.clone().lerp(liver,.60),.43,.18,.10);
  k('g018',.62,torso,.99,-.09,.06);
  k('g019',.45,torso.clone().lerp(brain,.55),1.0,-.21,.12);
  k('g020',.55,brain,.46,-.39,.17);
  k('g021',.63,brain,.40,-.24,.16);
  k('g022',.62,torso.clone().lerp(brain,.10),1.38,-.34,.06);
  k('g023',.42,a('stomach'),.54,.15,.10);
  k('g023',.85,a('stomach'),.59,.23,.09);
  k('g024',.70,torso,1.12,.28,.08);
  k('g024',.95,a('drug'),.25,.20,.10);
  k('g025',.20,a('drug'),.00045,.16,.13);
  k('g025',.85,a('drug'),1.8e-08,.23,.15);
  k('g026',.60,a('drug').clone().add(V(-.6e-9,.9e-9,0)),1.7e-08,.06,.14);
  k('g027',.65,a('drug'),1.9e-08,-.12,.17);
  k('g028',.65,a('drug').clone().add(V(-.4e-9,.4e-9,0)),1.7e-08,-.25,.14);
  k('g029',.65,a('drug').clone().add(V(.7e-9,-.6e-9,0)),1.9e-08,-.12,.18);
  k('g030',.70,a('drug'),2.3e-08,.14,.14);
  k('g031',.60,a('drug'),2.7e-08,.18,.10);
  k('g031',.96,a('drug'),2e-6,.19,.10);
  k('g032',.63,a('drug'),.28,.20,.09);
  k('g032',.96,torso,1.33,.22,.08);
  k('g033',.7,torso,1.55,.18,.05);
  k('g035',.75,torso,1.52,.03,.04);
  k('g036',.70,torso,1.50,-.10,.05);
  k('g037',.50,torso.clone().lerp(a('heart'),.35),1.40,-.14,.05);
  k('g039',.75,torso,1.50,.02,.08);
  k('g040',.72,a('stomach'),.72,.14,.08);
  k('g041',.75,torso,1.45,.22,.08);
  k('g042',.75,torso,1.53,.28,.07);
  k('g043',.75,torso,1.24,.22,.09);
  k('g044',.75,torso.clone().add(V(0,-.10,0)),1.05,.16,.12);
  k('g045',.75,pan.clone().lerp(torso,.30),.75,-.12,.13);
  k('g046',.7,torso,1.10,-.28,.08);
  k('g047',.60,meal.clone().lerp(torso,.34),1.03,.12,.45);
  k('g048',.70,meal,.78,.25,.68);
  const references=tl.duration-270;
  add(references+60,torso.clone().add(V(2.45,0,0)),1.85,.30,.12);
  add(tl.duration,torso.clone().add(V(2.75,0,0)),1.9,.34,.14);
  this.knots.sort((a,b)=>a.frame-b.frame);
  this.curves=[0,1,2,3,4,5].map(j=>this.knots.map(k=>j<3?k.target.getComponent(j):j===3?Math.log(k.distance):j===4?k.az:k.el));
  this.derivatives=this.curves.map(v=>slopes(this.knots.map(k=>k.frame),v));
 }
 sample(frame:number){
  let i=this.knots.findIndex(k=>k.frame>frame)-1;if(i<0)i=frame<this.knots[0].frame?0:this.knots.length-2;
  const a=this.knots[i],b=this.knots[i+1],h=b.frame-a.frame,t=clamp((frame-a.frame)/h),t2=t*t,t3=t2*t;
  const v=this.curves.map((c,j)=>(2*t3-3*t2+1)*c[i]+(t3-2*t2+t)*h*this.derivatives[j][i]+(-2*t3+3*t2)*c[i+1]+(t3-t2)*h*this.derivatives[j][i+1]);
  const target=V(v[0],v[1],v[2]),distance=Math.exp(v[3]),az=v[4],el=v[5];
  const position=target.clone().add(V(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(distance));
  // A single consistent off-centre composition reserves left-hand title space.
  const right=V(Math.cos(az),0,-Math.sin(az));target.addScaledVector(right,-distance*.073);
  return{position,target,distance};
 }
 apply(frame:number,camera:T.PerspectiveCamera){const p=this.sample(frame);camera.position.copy(p.position);camera.up.set(0,1,0);camera.lookAt(p.target);camera.fov=34;camera.near=p.distance/200;camera.far=Math.max(p.distance*160,1e-7);camera.updateProjectionMatrix();camera.updateMatrixWorld();return p;}
}
