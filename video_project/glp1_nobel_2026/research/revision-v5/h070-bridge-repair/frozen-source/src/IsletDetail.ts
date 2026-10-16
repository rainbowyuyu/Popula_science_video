import * as T from 'three';
import {V,mat,ball,tube,C} from './visual';
import {SCALE} from './Scale';

/** Representative 150 µm human islet cutaway; mixed cell arrangement, not an atlas mesh. */
export class IsletDetail{
 root=new T.Group(); selected=V(0,0,.52); capillaries:T.CatmullRomCurve3[]=[];
 private redCells:{mesh:T.Mesh;curve:T.CatmullRomCurve3;phase:number}[]=[];
 constructor(){
  this.root.name='representative-human-islet-150-micrometres';
  this.root.scale.setScalar(SCALE.isletRadius);
  const points:{p:T.Vector3;kind:number}[]=[];
  const step=16.5e-6/SCALE.isletRadius;
  for(let z=-5;z<=5;z++)for(let y=-5;y<=5;y++)for(let x=-5;x<=5;x++){
   const p=V(x*step+(y%2)*step*.5,y*step*.866,z*step*.86).add(V(Math.sin(x*71+y*91+z*137),Math.sin(x*41+y*127+z*11),Math.sin(x*181+y*37+z*97)).multiplyScalar(step*.14));
   if(p.length()>.91||p.distanceTo(this.selected)<step*.95)continue;
   // Open the anterior third, preserving enough cells behind the selected one.
   if(p.z>.18&&Math.abs(p.x)<.43&&Math.abs(p.y)<.48)continue;
   if(Math.abs(p.y-.16*Math.sin(p.x*4))<.065&&p.z>.05)continue;
   const h=Math.abs(Math.sin(x*127.1+y*311.7+z*91.4));
   points.push({p,kind:h<.63?0:h<.87?1:2});
  }
  const dummy=new T.Object3D();
  [C.aqua,'#d2ad78','#ac9faf'].forEach((color,kind)=>{
   const subset=points.filter(p=>p.kind===kind);
   const cells=new T.InstancedMesh(new T.SphereGeometry(7.5e-6/SCALE.isletRadius,18,12),mat(color,1,.51),subset.length);
   const nuclei=new T.InstancedMesh(new T.SphereGeometry(2.15e-6/SCALE.isletRadius,12,9),mat(kind===0?'#4f8584':'#957f74',.9,.55),subset.length);
   subset.forEach(({p},i)=>{dummy.position.copy(p);dummy.scale.set(1,.95,1);dummy.updateMatrix();cells.setMatrixAt(i,dummy.matrix);dummy.position.z+=.026;dummy.scale.set(1,1,1);dummy.updateMatrix();nuclei.setMatrixAt(i,dummy.matrix)});
   cells.name=`mixed-islet-cell-type-${kind}`;this.root.add(cells);
  });
  for(const z of [-.35,.10]){
   const pts=[V(-.95,-.10,z),V(-.48,-.15,z+.10),V(-.03,.0,z+.05),V(.48,.10,z),V(.95,.03,z-.06)];
   const curve=new T.CatmullRomCurve3(pts);this.capillaries.push(curve);
   this.root.add(tube(pts,4e-6/SCALE.isletRadius,'#b77370',.27));
   for(let i=0;i<8;i++){const m=ball(3.4e-6/SCALE.isletRadius,'#a7524d',.9);m.scale.set(1,.34,1);this.root.add(m);this.redCells.push({mesh:m,curve,phase:i/8});}
  }
  // A fine discontinuous perimeter expresses a section, not a giant solid shell.
  for(let i=0;i<3;i++){
   const pts=Array.from({length:49},(_,j)=>{const a=j/48*Math.PI*1.48+.40;return V(Math.cos(a),Math.sin(a),-.16+i*.15)});
   this.root.add(tube(pts,.0045,'#94aaa3',.22));
  }
  this.root.userData={representativeDiameterMetres:150e-6,cellDiameterMetres:15e-6,cellCount:points.length+1,representation:'Human islet teaching cutaway; mixed types, not patient histology.'};
 }
 render(time:number){for(const r of this.redCells){const u=(time*.07+r.phase)%1;r.mesh.position.copy(r.curve.getPoint(u));r.mesh.quaternion.setFromUnitVectors(V(0,1,0),r.curve.getTangent(u));}}
}
