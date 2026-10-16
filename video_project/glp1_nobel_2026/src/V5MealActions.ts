import * as T from 'three';
import {V,mat,smooth} from './visual';
/** Ordinary drink replacement on the same table, in physical metres. */
export class V5MealActions{
 root=new T.Group();private sweet=new T.Group();private water=new T.Group();
 private saltCue=new T.Group();private saltParticles:T.Mesh[]=[];private saltMaterials:T.MeshStandardMaterial[]=[];
 private dessert?:T.Object3D;private dessertBase=V();
 private readonly saltAnchorLocal=V(-.080,1.105,.438);
 private readonly saltLabelLocal=V(-.095,1.045,.438);
 constructor(meal:T.Group){
  this.root.name='same-table-sweet-drink-to-water';meal.add(this.root);this.root.add(this.sweet,this.water,this.saltCue);
  for(const [g,color] of [[this.sweet,'#b68146'],[this.water,'#9cb8b2']] as const){
   const profile=[new T.Vector2(.027,0),new T.Vector2(.029,.004),new T.Vector2(.032,.13),new T.Vector2(.034,.132),new T.Vector2(.034,.004),new T.Vector2(.031,0)];
   const glass=new T.Mesh(new T.LatheGeometry(profile,64),new T.MeshPhysicalMaterial({color:'#eaf0ea',transparent:true,opacity:.27,roughness:.16,metalness:0,side:T.DoubleSide,depthWrite:false}));g.add(glass);
   const liquid=new T.Mesh(new T.CylinderGeometry(.030,.026,.104,48),mat(color,.60,.19));liquid.position.y=.057;g.add(liquid);
   const rim=new T.Mesh(new T.TorusGeometry(.033,.001,8,64),mat('#a4b2a8',.70,.28));rim.rotation.x=Math.PI/2;rim.position.y=.132;g.add(rim);
  }
  this.sweet.position.set(-.30,.934,.36);this.water.position.set(-2.4,.934,.36);
  // A restrained salt / sodium cue returns the explanation to the actual
  // meal. It is a visual teaching symbol, not a literal count of ions.
  this.saltCue.name='salt-sodium-meal-cue';
  const saltCurve=new T.CatmullRomCurve3([V(-.080,1.045,.438),V(-.072,1.085,.438),V(-.080,1.125,.438)],false,'centripetal');
  const saltLine=new T.Mesh(new T.TubeGeometry(saltCurve,20,.0012,7,false),mat('#c39a52',.78,.34));
  saltLine.name='sodium-rising-path';this.saltCue.add(saltLine);
  for(let i=0;i<12;i++){
   const material=mat(i%3===0?'#b98650':'#d4b768',.88,.30);this.saltMaterials.push(material);
   const crystal=new T.Mesh(new T.OctahedronGeometry(.0042,0),material);
   crystal.position.set(-.080+Math.sin(i*2.37)*.018,1.045+(i%6)*.014,.438+Math.cos(i*1.81)*.012);
   crystal.rotation.set(i*.31,i*.47,i*.19);crystal.name='sodium-particle-symbol';this.saltCue.add(crystal);this.saltParticles.push(crystal);
  }
  this.saltCue.userData={representation:'illustrative sodium cue from common salty foods; not an ion count'};
 }
 connectDessert(meal:T.Group){this.dessert=meal.getObjectByName('Poly Haven CC0 photogrammetry carrot cake');if(this.dessert)this.dessertBase.copy(this.dessert.position);}
 update(replacement:number,saltWeight=0,time=0){
  const q=Math.max(0,Math.min(1,replacement));
  const exit=smooth(q/.43),enter=smooth((q-.55)/.45);
  this.sweet.position.x=-.30-2.10*exit;this.water.position.x=-2.4+2.10*enter;
  this.sweet.visible=q<.43;this.water.visible=q>.55;
  this.root.userData={replacement:q,sweetX:this.sweet.position.x,waterX:this.water.position.x,minimumFoodLaneClearanceMetres:.12,sequentialExchange:true};
  // The outgoing cup clears the left edge before the incoming cup enters.
  // Both paths stay left of the bowl/cake/hand envelope; no glass crosses food.
  // They never dissolve in place or magically turn sugar into water.
  if(this.dessert)this.dessert.position.copy(this.dessertBase);
  const sw=Math.max(0,Math.min(1,saltWeight));
  this.saltCue.visible=sw>.001;
  this.saltParticles.forEach((particle,i)=>{
   const phase=time*.9+i*.37;
   if(sw>.001){
    const baseX=-.080+Math.sin(i*2.37)*.018,baseY=1.045+(i%6)*.014,baseZ=.438+Math.cos(i*1.81)*.012;
    particle.position.set(baseX+.0014*Math.cos(phase*.83),baseY+.0022*Math.sin(phase),baseZ);
    particle.rotation.y=i*.47+.012*(time%100);
   }
   const material=this.saltMaterials[i];material.opacity=.88*sw*(.78+.22*(.5+.5*Math.sin(phase)));
  });
  const line=this.saltCue.getObjectByName('sodium-rising-path') as T.Mesh|undefined;
  if(line)for(const material of Array.isArray(line.material)?line.material:[line.material])material.opacity=.78*sw;
 }
 getSaltAnchor(){return this.saltAnchorLocal.clone();}
 getSaltLabelAnchor(){return this.saltLabelLocal.clone();}
}
