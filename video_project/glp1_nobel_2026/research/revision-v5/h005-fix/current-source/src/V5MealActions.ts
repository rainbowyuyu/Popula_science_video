import * as T from 'three';
import {V,mat,smooth} from './visual';
/** Ordinary drink replacement on the same table, in physical metres. */
export class V5MealActions{
 root=new T.Group();private sweet=new T.Group();private water=new T.Group();private dessert?:T.Object3D;private dessertBase=V();
 constructor(meal:T.Group){
  this.root.name='same-table-sweet-drink-to-water';meal.add(this.root);this.root.add(this.sweet,this.water);
  for(const [g,color] of [[this.sweet,'#b68146'],[this.water,'#9cb8b2']] as const){
   const profile=[new T.Vector2(.027,0),new T.Vector2(.029,.004),new T.Vector2(.032,.13),new T.Vector2(.034,.132),new T.Vector2(.034,.004),new T.Vector2(.031,0)];
   const glass=new T.Mesh(new T.LatheGeometry(profile,64),new T.MeshPhysicalMaterial({color:'#eaf0ea',transparent:true,opacity:.27,roughness:.16,metalness:0,side:T.DoubleSide,depthWrite:false}));g.add(glass);
   const liquid=new T.Mesh(new T.CylinderGeometry(.030,.026,.104,48),mat(color,.60,.19));liquid.position.y=.057;g.add(liquid);
   const rim=new T.Mesh(new T.TorusGeometry(.033,.001,8,64),mat('#a4b2a8',.70,.28));rim.rotation.x=Math.PI/2;rim.position.y=.132;g.add(rim);
  }
  this.sweet.position.set(-.19,.934,.39);this.water.position.set(.46,.934,.39);
 }
 connectDessert(meal:T.Group){this.dessert=meal.getObjectByName('Poly Haven CC0 photogrammetry carrot cake');if(this.dessert)this.dessertBase.copy(this.dessert.position);}
 update(replacement:number){
  const q=smooth(replacement);this.sweet.position.x=-.19-.24*q;this.water.position.x=.46-.65*q;
  // Glasses slide along the table surface during the explanatory comparison.
  // They never dissolve in place or magically turn sugar into water.
  if(this.dessert)this.dessert.position.copy(this.dessertBase);
 }
}
