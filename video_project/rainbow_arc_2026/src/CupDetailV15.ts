import * as T from 'three';

/** A photographic material upgrade of the caller's real cup geometry. The
 * submerged stick, water plane and two-medium ray vertices remain untouched. */
export class CupDetailV15 {
 readonly group=new T.Group();private readonly surfaces:T.MeshPhysicalMaterial[]=[];
 private readonly restore:{mesh:T.Mesh;original:T.Material|T.Material[];replacement:T.Material|T.Material[]}[]=[];
 private disposed=false;
 constructor(private readonly cup:T.Object3D,studio?:T.Texture){
  this.group.name='v15-cup-optical-studio-detail';this.group.userData.provenance='Photographic finish and physical lip/meniscus edges at existing cup dimensions; explanatory rays unchanged';
  cup.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;const original=mesh.material;
   const list=Array.isArray(original)?original:[original];let changed=false;
   const replacement=list.map(material=>{
    const source=material as T.MeshPhysicalMaterial;if(!source.isMeshPhysicalMaterial)return material;
    const m=source.clone(),isWater=source.thickness>1;
    m.color.set(isWater?'#e8f8fc':'#fcffff');m.roughness=isWater?.010:.014;
    m.transmission=isWater?.978:.988;m.ior=isWater?1.333:1.50;m.opacity=isWater?.61:.79;m.envMapIntensity=isWater?.89:1.10;
    m.clearcoat=0;m.attenuationColor.set(isWater?'#d8f4f7':'#eefaff');m.attenuationDistance=isWater?20:65;m.depthWrite=false;
    m.transparent=true;m.userData.a=m.opacity;m.userData.transparent=true;m.userData.depthWrite=false;
    if(studio)m.envMap=studio;m.needsUpdate=true;this.surfaces.push(m);changed=true;return m;
   });
   if(changed){mesh.material=Array.isArray(original)?replacement:replacement[0];this.restore.push({mesh,original,replacement:mesh.material});}
   if(mesh.name==='real-water-level-at-068'){
    const m=mesh.material as T.MeshBasicMaterial;m.color.set('#d8f0f5');m.opacity=.20;m.userData.a=.20;
   }
  });
  const ring=(radius:number,tube:number,y:number,name:string,opacity:number)=>{
   const m=new T.MeshPhysicalMaterial({color:'#f1fbff',roughness:.019,transmission:.95,thickness:.04,ior:1.5,transparent:true,opacity,depthWrite:false,envMapIntensity:1.04,clearcoat:0});
   if(studio)m.envMap=studio;m.userData.a=opacity;m.userData.transparent=true;m.userData.depthWrite=false;
   const mesh=new T.Mesh(new T.TorusGeometry(radius,tube,20,160),m);mesh.rotation.x=-Math.PI/2;mesh.position.y=y;mesh.renderOrder=5;mesh.name=name;this.group.add(mesh);this.surfaces.push(m);
  };
  ring(.805,.016,1.215,'v15-real-glass-upper-lip',.57);ring(.753,.012,-1.14,'v15-real-glass-base-edge',.39);
  const m=new T.MeshPhysicalMaterial({color:'#ecfbff',roughness:.011,transmission:.94,thickness:.016,ior:1.333,transparent:true,opacity:.23,depthWrite:false,envMapIntensity:.92,side:T.DoubleSide});if(studio)m.envMap=studio;
  m.userData.a=.23;m.userData.transparent=true;m.userData.depthWrite=false;
  const top=new T.Mesh(new T.CircleGeometry(.739,128),m);top.rotation.x=-Math.PI/2;top.position.y=.683;top.renderOrder=4;top.name='v15-water-real-level-subtle-meniscus-reflection';this.group.add(top);this.surfaces.push(m);cup.add(this.group);
 }
 setStudio(studio:T.Texture):void{if(this.disposed)return;for(const m of this.surfaces){m.envMap=studio;m.needsUpdate=true;}}
 dispose():void{if(this.disposed)return;this.disposed=true;for(const r of this.restore)if(r.mesh.material===r.replacement)r.mesh.material=r.original;
  this.group.traverse(o=>{const mesh=o as T.Mesh;if(mesh.isMesh)mesh.geometry.dispose();});this.surfaces.forEach(m=>m.dispose());this.surfaces.length=0;this.restore.length=0;this.cup.remove(this.group);this.group.clear();}
}
