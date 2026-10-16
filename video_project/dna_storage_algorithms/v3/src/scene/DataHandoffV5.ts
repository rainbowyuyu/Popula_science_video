import * as T from 'three';
import {C,ball,box,ease,line} from './primitives';

/** A continuous physical ribbon across the gaps between mechanisms.
 * The code is an illustration of the same information, not a molecular scale claim. */
export class DataHandoffV5 extends T.Group {
 private carrier=ball(.13,C.gold);
 private beads:T.Mesh[]=[];
 private curve:T.CatmullRomCurve3;
 constructor(public boundary:number,public startX:number){
  super();this.name=`data-handoff-${boundary}`;
  const controls=[[5.6,-.25,0],[7.2,.65,-.8],[10,1.0,-.7],[12.6,.25,.4],[14.7,-.12,0]];
  this.curve=new T.CatmullRomCurve3(controls.map(p=>new T.Vector3(...p)),false,'catmullrom',.5);
  for(const sign of [-1,1]){
   const points=Array.from({length:64},(_,i)=>{const p=this.curve.getPoint(i/63);p.y+=sign*.15;return p.toArray();});
   this.add(line(points,sign===1?0xa1cbc4:0xd8b575,.022,.58));
  }
  for(let i=0;i<32;i++){const q=i/31,p=this.curve.getPoint(q);const b=box(.085,.23,.065,[C.teal,C.gold,C.violet,C.coral][i%4],.02);b.position.copy(p);b.rotation.z=-.17+q*.25;this.beads.push(b);this.add(b);}
  this.position.x=startX;this.add(this.carrier);
 }
 update(t:number){
  const visibility=ease((t-this.boundary+4)/1.5)*ease((this.boundary+4-t)/1.5);this.traverse(o=>{if(o instanceof T.Mesh){const m=o.material as T.MeshStandardMaterial;m.transparent=true;m.depthWrite=false;m.opacity=visibility*(o===this.carrier?1:.6);}});const u=ease((t-this.boundary+3)/6);this.carrier.position.copy(this.curve.getPoint(u));
  this.beads.forEach((b,i)=>{const q=i/31,d=Math.abs(q-u);const material=b.material as T.MeshStandardMaterial;material.emissive.set(C.gold);material.emissiveIntensity=.55*Math.exp(-d*d*260);});
 }
}
