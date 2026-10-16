from pathlib import Path
p=Path('src/V5World.ts');s=p.read_text(encoding='utf-8')
idx=s.index('/** Single atlas-coordinate world.')
helper='''/** Triangle-space registration, independent of material opacity and raycaster side. */
function atlasTriangles(object:T.Object3D){
 object.updateWorldMatrix(true,true);const triangles:T.Triangle[]=[];
 object.traverse(node=>{if(!(node instanceof T.Mesh)||node.userData.skinDepth)return;const p=node.geometry.getAttribute('position'),ix=node.geometry.index;
  for(let i=0;i<(ix?.count??p.count);i+=3){const at=(j:number)=>V().fromBufferAttribute(p,ix?ix.getX(i+j):i+j).applyMatrix4(node.matrixWorld);triangles.push(new T.Triangle(at(0),at(1),at(2)));}
 });return triangles;
}
function triangleCrossings(triangles:T.Triangle[],origin:T.Vector3,direction:T.Vector3){
 const ray=new T.Ray(origin,direction),hit=V(),out:{point:T.Vector3;normal:T.Vector3;distance:number}[]=[];
 for(const triangle of triangles)if(ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,hit))out.push({point:hit.clone(),normal:triangle.getNormal(V()),distance:origin.distanceTo(hit)});
 return out.sort((a,b)=>a.distance-b.distance).filter((h,i,all)=>i===0||Math.abs(h.distance-all[i-1].distance)>1e-7);
}
function registerPancreaticContext(object:T.Object3D,reference:T.Vector3,field:T.Group){
 const triangles=atlasTriangles(object),bounds=new T.Box3().setFromObject(object);
 const hits=triangleCrossings(triangles,V(reference.x,reference.y,bounds.max.z+.05),V(0,0,-1));
 if(hits.length<2)throw new Error('Pancreatic tissue registration has no closed atlas interval');
 const surface=hits[0].point,normal=hits[0].normal.clone();if(normal.z<0)normal.negate();
 // A smoothed local plane follows the real anterior surface, avoiding the
 // single-triangle faceting of this reference atlas.
 const nearby=triangles.filter(t=>t.getMidpoint(V()).distanceTo(surface)<.008);
 const averaged=nearby.reduce((sum,t)=>{const n=t.getNormal(V());if(n.z<0)n.negate();return sum.add(n)},V()).normalize();
 if(averaged.z>.2)normal.copy(averaged);
 const x=V(1,0,0).addScaledVector(normal,-normal.x).normalize(),y=normal.clone().cross(x).normalize();
 const basis=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,normal));
 const origin=surface.clone().addScaledVector(normal,-.0015);
 field.position.copy(origin);field.quaternion.copy(basis);
 const inverse=basis.clone().invert(),dummy=new T.Object3D(),points:{p:T.Vector3;scale:T.Vector3}[]=[];
 let seed=84211;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 // Sample irregular volumes BELOW the actual organ surface. Every accepted
 // lobule has front/back clearance; no circular unregistered display disc.
 for(let iy=-21;iy<=21;iy++)for(let ix=-28;ix<=28;ix++){
  const u=(ix+(rand()-.5)*.65)*.00073,v=(iy+(rand()-.5)*.65)*.00073;
  const probe=origin.clone().addScaledVector(x,u).addScaledVector(y,v).addScaledVector(normal,.07);
  const crossings=triangleCrossings(triangles,probe,normal.clone().negate());
  if(crossings.length<2)continue;
  const front=crossings[0].point,depth=front.distanceTo(crossings[1].point);
  for(let layer=0;layer<3;layer++){
   const inset=.0007+layer*.00068+rand()*.00015;if(depth<inset+.00055)continue;
   const p=front.clone().addScaledVector(normal,-inset).sub(origin).applyQuaternion(inverse);
   // Leave a small tissue window around the SAME selected endocrine islet.
   if(Math.hypot(p.x,p.y)<.00105&&p.z>-.0018)continue;
   points.push({p,scale:V(.77+rand()*.46,.66+rand()*.49,.52+rand()*.33)});
  }
 }
 const geometry=new T.IcosahedronGeometry(.00040,2),material=mat('#ccaa8e',.59,.85);
 const mesh=new T.InstancedMesh(geometry,material,points.length);mesh.name='atlas-clipped-irregular-pancreatic-lobules';
 points.forEach(({p,scale},i)=>{dummy.position.copy(p);dummy.rotation.set(rand()*.6,rand()*.5,rand()*Math.PI);dummy.scale.copy(scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new T.Color('#c6a08b').lerp(new T.Color('#e6c9a5'),rand()));});
 field.add(mesh);field.userData={units:'metres',representation:'Illustrative pancreatic lobules sampled inside the atlas organ, not measured histology',samples:points.length,allSamplesWithinAtlasFrontBackInterval:true,surface:surface.toArray(),normal:normal.toArray(),insetMetres:.0015};
 return{origin,basis,surface,normal};
}

'''
s=s[:idx]+helper+s[idx:]
a=s.index('  // There is now visible tissue at every decade');b=s.index('  for(let i=-9;i<=9;i++){',a)
s=s[:a]+'  const dummy=new T.Object3D();\n'+s[b:]
a=s.index('   const correctedIslet=');b=s.index('   this.cardio.arterioleRoot.position.copy',a)
s=s[:a]+'''   const priorIslet=this.anchors.islet.clone();
   const pancreatic=registerPancreaticContext(this.organs.pancreas,priorIslet,this.pancreaticField);
   for(const key of ['islet','beta','receptor','secretion'])this.anchors[key].sub(priorIslet).applyQuaternion(pancreatic.basis).add(pancreatic.origin);
   for(const object of [this.islet.root,this.tissueContext,this.beta.root,this.receptor.root,this.membranePatch]){
    object.position.sub(priorIslet).applyQuaternion(pancreatic.basis).add(pancreatic.origin);object.quaternion.premultiply(pancreatic.basis);
   }
   // The micrometre acinar field also uses irregular 3-D packing, not a
   // second flat honeycomb disc; fixed cells remain at their physical size.
   this.tissueContext.traverse(node=>{if(!(node instanceof T.InstancedMesh))return;const matrix=new T.Matrix4(),p=V(),q=new T.Quaternion(),scale=V();
    for(let i=0;i<node.count;i++){node.getMatrixAt(i,matrix);matrix.decompose(p,q,scale);p.x+=12e-6*Math.sin(i*7.31);p.y+=11e-6*Math.cos(i*9.27);p.z-=12e-6+28e-6*(.5+.5*Math.sin(i*3.81));matrix.compose(p,q,scale);node.setMatrixAt(i,matrix);}node.instanceMatrix.needsUpdate=true;
   });
   this.organs.pancreas.userData.teachingAnchor={position:pancreatic.origin.toArray(),surface:pancreatic.surface.toArray(),normal:pancreatic.normal.toArray(),surfaceInsetMetres:.0015,validated:'actual triangle surface, local normal, clipped tissue volume; fixed SI child dimensions'};
   this.betaSignal.setAnchor(this.anchors.beta);this.betaSignal.root.quaternion.copy(pancreatic.basis);
   this.gutField.position.copy(this.anchors.intestinal);
   this.selectedIsletCue.position.copy(this.anchors.islet).addScaledVector(pancreatic.normal,.00006);
   this.selectedBetaCue.position.copy(this.anchors.beta).addScaledVector(pancreatic.normal,8e-6);this.selectedReceptorCue.position.copy(this.anchors.receptor);
   const aortic=this.routes?.routes.find(r=>r.id==='descending_aorta')??this.routes?.routes.find(r=>r.id.includes('aorta'));
   if(!aortic||aortic.points.length<25)throw new Error('A validated descending-aorta route is required for the teaching cutaway');
   const index=Math.floor(aortic.points.length*.55),point=(i:number)=>new T.Vector3(...aortic.points[Math.max(0,Math.min(aortic.points.length-1,i))]);
   const arterialPoint=point(index),tangent=point(index+12).sub(point(index-12)).normalize();
   const anterior=V(0,0,1).addScaledVector(tangent,-tangent.z).normalize(),transverse=anterior.clone().cross(tangent).normalize();
   const arterialBasis=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(tangent,transverse,anterior));
   this.cardio.arteryRoot.position.copy(arterialPoint);this.cardio.arteryRoot.quaternion.copy(arterialBasis);
   this.cardio.arteryRoot.userData.registration={sourceRoute:aortic.id,sourceMethod:'atlas mesh cross-section centreline',routeIndex:index,axis:tangent.toArray(),anterior:anterior.toArray(),position:arterialPoint.toArray(),orientation:'local X = smoothed blood-flow tangent; local Z = anterior cross-section direction',geometry:'10 mm representative lumen, not the atlas segmented lumen'};
''' +s[b:]
s=s.replace('this.cardio.lipidWallRoot.position.copy(this.anchors.foamCell).add(V(0,0,20e-6));','this.cardio.lipidWallRoot.position.copy(this.anchors.foamCell).add(V(0,0,20e-6).applyQuaternion(arterialBasis));this.cardio.lipidWallRoot.quaternion.copy(arterialBasis);')
s=s.replace('this.cameraPath=new V5CameraPath(this.anchors,tl);','this.cameraPath=new V5CameraPath(this.anchors,tl,{islet:pancreatic.basis,beta:pancreatic.basis,receptor:pancreatic.basis,secretion:pancreatic.basis,artery:arterialBasis.clone().multiply(new T.Quaternion().setFromAxisAngle(V(0,0,1),Math.PI/2)),foamCell:arterialBasis.clone().multiply(new T.Quaternion().setFromAxisAngle(V(0,0,1),Math.PI/2))});')
s=s.replace("if(name==='aorta')alpha*=(1-artery*.88)*(1-.995*atrialWeight*closer(d,.18,.55));","if(name==='aorta')alpha*=(1-arteryFamily*closer(d,.045,.16))*(1-.995*atrialWeight*closer(d,.18,.55));")
s=s.replace("if(name!=='body')alpha*=1-.999*Math.max(artery,arteriole,renalClose,lipidWall);","if(name!=='body')alpha*=1-.999*Math.max(name==='aorta'?0:artery,arteriole,renalClose,lipidWall);")
s=s.replace("if(name==='pancreas')alpha*=1-.95*pancreasSite*closer(d,.16,.34);","if(name==='pancreas')alpha*=1-.985*pancreasSite*closer(d,.015,.12);")
s=s.replace("visibility(this.pancreaticField,wp*closer(d,.06,.2)*(1-closer(d,.00030,.0016)));","visibility(this.pancreaticField,wp*closer(d,.016,.046)*(1-closer(d,.00045,.0020)));")
s=s.replace("visibility(this.tissueContext,.28*wp*closer(d,.009,.07)*(1-closer(d,150e-6,450e-6)));","visibility(this.tissueContext,.48*wp*closer(d,.0012,.006)*(1-closer(d,150e-6,450e-6)));")
p.write_text(s,encoding='utf-8')
p=Path('src/V5CameraPath.ts');s=p.read_text(encoding='utf-8')
s=s.replace('roll?:number};','roll?:number;up?:T.Vector3};',1)
s=s.replace('type Knot={frame:number;focus:T.Vector3;distance:number;az:number;el:number;roll?:number};','type Knot={frame:number;focus:T.Vector3;distance:number;az:number;el:number;roll?:number;basis?:T.Quaternion};')
s=s.replace('constructor(public anchors:Record<string,T.Vector3>,public tl:Timeline){','constructor(public anchors:Record<string,T.Vector3>,public tl:Timeline,private localFrames:Record<string,T.Quaternion>={}){')
s=s.replace('roll:d.roll??0};','roll:d.roll??0,basis:d.distance<.08?this.localFrames[d.anchor]?.clone():undefined};')
s=s.replace('const position=focus.clone().add(V(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(distance));','const basis=(a.basis??new T.Quaternion()).clone().slerp(b.basis??new T.Quaternion(),u);\n  const position=focus.clone().add(V(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).applyQuaternion(basis).multiplyScalar(distance));')
s=s.replace('up=V(Math.sin(roll),Math.cos(roll),0);','up=V(Math.sin(roll),Math.cos(roll),0).applyQuaternion(basis);')
s=s.replace('return{position,target,focus,distance,az,el,roll};','return{position,target,focus,distance,az,el,roll,up};')
s=s.replace('camera.up.set(Math.sin(p.roll??0),Math.cos(p.roll??0),0);','camera.up.copy(p.up??V(0,1,0));')
p.write_text(s,encoding='utf-8')
