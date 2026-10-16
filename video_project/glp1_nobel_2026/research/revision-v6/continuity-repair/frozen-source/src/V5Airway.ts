import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {V,clamp,smooth,Label} from './visual';

const TAU=Math.PI*2;
const phase=(x:number)=>((x%1)+1)%1;
function material(color:string,opacity:number,roughness=.65){
 const m=new T.MeshStandardMaterial({color,opacity,transparent:true,depthWrite:false,side:T.FrontSide,roughness,metalness:.015});
 m.userData.baseOpacity=opacity;return m;
}
// Transparency state is fixed across the whole transition. No opacity threshold
// toggles depth writing, so the anatomical layers cannot abruptly jump forward.
function alpha(o:T.Object3D,weight:number){
 o.visible=weight>1e-5;o.traverse(n=>{if(n instanceof T.Mesh||n instanceof T.Line){
  for(const m of Array.isArray(n.material)?n.material:[n.material])m.opacity=(m.userData.baseOpacity??1)*clamp(weight);
 }});
}
function arrow(color:string,length:number,radius:number){
 const g=new T.Group(),m=material(color,.95,.42);
 const shaft=new T.Mesh(new T.CylinderGeometry(radius*.29,radius*.29,length*.61,8),m);
 const head=new T.Mesh(new T.ConeGeometry(radius,length*.39,14),m);
 shaft.position.y=length*.305;head.position.y=length*.805;g.add(shaft,head);return g;
}

/** Actual BodyParts3D tongue / epiglottis / pharyngeal muscles at unchanged
 * metre coordinates. The airway lumen is a landmark-constrained teaching
 * overlay, not a segmented lumen, patient collapse model or CFD simulation.
 * Only the educational lumen changes shape; reference anatomy is not warped.
 */
export class V5Airway{
 root=new T.Group();ready:Promise<void>;
 anchors={airway:V(-.0006,1.528,.0045)};
 private anatomy=new T.Group();private teaching=new T.Group();private pressure=new T.Group();
 private tongue?:T.Object3D;private epiglottis?:T.Object3D;private constrictors:T.Object3D[]=[];
 private lumen:T.Mesh;private crossSections:T.Line[]=[];private outlines:T.Line[]=[];
 private flow:T.Group[]=[];private pressureArrows:T.Group[]=[];
 private weight=0;private cpap=false;private open=1;
 private sections=64;private radial=36;
 private curve=new T.CatmullRomCurve3([
  V(-.0006,1.568,.012),V(-.0006,1.552,.010),V(-.0006,1.538,.007),
  V(-.0006,1.524,.0045),V(-.0006,1.510,.002),V(-.0006,1.493,.001),
 ],false,'catmullrom',.2);
 private center:T.Vector3[]=[];
 constructor(base=''){
  this.root.name='v5-reference-pharynx-with-educational-airway';
  this.root.add(this.anatomy,this.teaching,this.pressure);
  const positions=new Float32Array((this.sections+1)*(this.radial+1)*3),indices:number[]=[];
  for(let j=0;j<=this.sections;j++){
   this.center.push(this.curve.getPoint(j/this.sections));
   if(j<this.sections)for(let i=0;i<this.radial;i++){
    const a=j*(this.radial+1)+i,b=a+this.radial+1;indices.push(a,b,a+1,b,b+1,a+1);
   }
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setIndex(indices);
  const surface=material('#4c8d8c',.25,.36);surface.side=T.DoubleSide;
  this.lumen=new T.Mesh(geometry,surface);this.lumen.name='teaching-lumen-not-measured-anatomy';this.lumen.frustumCulled=false;this.teaching.add(this.lumen);
  // Sparse sections reveal the constriction without an opaque plastic pipe.
  for(let j=0;j<9;j++){
   const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array((this.radial+1)*3),3));
   const m=new T.LineBasicMaterial({color:'#477e7a',transparent:true,opacity:.31,depthWrite:false});m.userData.baseOpacity=.31;
   const line=new T.Line(g,m);line.frustumCulled=false;line.userData.u=.06+j*.11;this.crossSections.push(line);this.teaching.add(line);
  }
  for(const angle of [Math.PI*.5,Math.PI*1.5]){
   const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array((this.sections+1)*3),3));
   const m=new T.LineBasicMaterial({color:'#397f7d',transparent:true,opacity:.54,depthWrite:false});m.userData.baseOpacity=.54;
   const line=new T.Line(g,m);line.frustumCulled=false;line.userData.angle=angle;this.outlines.push(line);this.teaching.add(line);
  }
  for(let i=0;i<8;i++){const a=arrow('#529eaa',.0038,.00075);a.name='air-direction-symbol-not-particle-size';this.flow.push(a);this.teaching.add(a);}
  for(let i=0;i<4;i++){const a=arrow('#b49a60',.0033,.00064);a.name='positive-pressure-support-symbol';this.pressureArrows.push(a);this.pressure.add(a);}
  this.root.userData={units:'metres',coordinateTransform:'identity',anatomy:'Unchanged BodyParts3D source meshes; not patient-specific.',
   lumen:'Landmark-constrained teaching surface between tongue and posterior pharyngeal wall. Its dimensions are illustrative, not measured segmentation.',
   flow:'Direction symbols; no CFD, quantitative airflow, pressure units or treatment prediction.',
   animation:'CPAP maintains positive pressure to support airway patency. Only the artificial lumen deforms.',
   sourceManifest:'models/airway-v5.manifest.json'};
  this.update(0,0,0,'sleep_apnea');
  const loader=new GLTFLoader();
  this.ready=loader.loadAsync(base+'models/airway-v5.glb').then(gltf=>{
   gltf.scene.traverse(o=>{if(o instanceof T.Mesh){
    const id=o.name.split('_')[0],tongue=id==='FJ2761',epiglottis=id==='FJ2770';
    o.material=material(tongue?'#bc8479':epiglottis?'#c6a078':'#9a8680',tongue?.38:epiglottis?.40:.16,.72);
    o.name=id+'_'+(tongue?'reference-tongue':epiglottis?'reference-epiglottis':'reference-pharyngeal-constrictor');
    if(tongue)this.tongue=o;else if(epiglottis)this.epiglottis=o;else this.constrictors.push(o);
   }});
   this.anatomy.add(gltf.scene);alpha(this.anatomy,this.weight);
  });
 }
 private radii(u:number){
  const center=this.curve.getPoint(u),throat=Math.exp(-(((center.y-1.527)/.012)**2)),closed=(1-this.open)*throat;
  return {x:.0062*(1-.42*closed),z:.0043*(1-.90*closed)};
 }
 private surface(u:number,angle:number){
  const p=this.curve.getPoint(u),r=this.radii(u);return p.add(V(Math.cos(angle)*r.x,0,Math.sin(angle)*r.z));
 }
 update(time:number,weight:number,progress:number,mode:string){
  const p=clamp(progress);this.weight=clamp(weight);this.cpap=mode==='cpap_airway';
  // End of the narrowing demonstration matches the initial CPAP aperture.
  this.open=this.cpap?.12+.88*smooth((p-.06)/.61):1-.88*smooth((p-.12)/.52);
  this.root.visible=this.weight>1e-5;
  if(!this.root.visible)return;
  alpha(this.anatomy,this.weight);alpha(this.teaching,this.weight);
  const pos=this.lumen.geometry.getAttribute('position') as T.BufferAttribute;
  for(let j=0;j<=this.sections;j++){
   const u=j/this.sections,r=this.radii(u),c=this.center[j];
   for(let i=0;i<=this.radial;i++){const a=i/this.radial*TAU;pos.setXYZ(j*(this.radial+1)+i,c.x+Math.cos(a)*r.x,c.y,c.z+Math.sin(a)*r.z);}
  }
  pos.needsUpdate=true;this.lumen.geometry.computeVertexNormals();
  for(const line of this.crossSections){
   const a=line.geometry.getAttribute('position') as T.BufferAttribute;
   for(let i=0;i<=this.radial;i++){const point=this.surface(line.userData.u,i/this.radial*TAU);a.setXYZ(i,point.x,point.y,point.z);}a.needsUpdate=true;
  }
  for(const line of this.outlines){
   const a=line.geometry.getAttribute('position') as T.BufferAttribute;
   for(let j=0;j<=this.sections;j++){const point=this.surface(j/this.sections,line.userData.angle);a.setXYZ(j,point.x,point.y,point.z);}a.needsUpdate=true;
  }
  // Breathing arrows are paced by absolute time: switching narration sentences
  // does not restart the air markers at the upper end of the throat.
  this.flow.forEach((a,i)=>{
   const u=phase(time*.075+i/this.flow.length),point=this.curve.getPoint(u),direction=this.curve.getTangent(u).normalize();
   a.position.copy(point);a.quaternion.setFromUnitVectors(V(0,1,0),direction);
   const fade=smooth(Math.min(u,1-u)/.10),below=1-smooth((u-.44)/.17),flow=.10+.90*(this.open*.8+below*.2);
   alpha(a,this.weight*fade*flow);a.scale.setScalar(.7+.3*this.open);
  });
  const support=this.cpap?smooth((p-.03)/.48):0;
  this.pressureArrows.forEach((a,i)=>{
   const angle=i*TAU/this.pressureArrows.length+Math.PI*.25,dir=V(Math.cos(angle),0,Math.sin(angle)),r=this.radii(.55),c=this.curve.getPoint(.55);
   a.position.copy(c).add(V(dir.x*r.x*.32,0,dir.z*r.z*.32));a.quaternion.setFromUnitVectors(V(0,1,0),dir);
   a.scale.set(1,.55+.45*support,1);
  });
  alpha(this.pressure,this.weight*support);
 }
 labels():Label[]{
  if(this.weight<.025)return[];
  const primary:Label[]=[
   {text:'舌',point:V(-.001,1.536,.043),color:'#a9776e',side:'left',weight:this.weight},
   {text:this.cpap?'正压撑住气道':'舌后气道变窄',point:this.anchors.airway.clone(),color:'#448583',side:'right',weight:this.weight},
  ];
  if(!this.cpap)primary.push({text:'咽后壁',point:V(-.001,1.55,-.004),color:'#8c7975',side:'right',weight:this.weight*.8});
  return primary;
 }
}
