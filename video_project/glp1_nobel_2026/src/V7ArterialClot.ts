import * as T from 'three';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const ramp=(x:number,a:number,b:number)=>smooth((x-a)/(b-a));
const phase=(x:number)=>((x%1)+1)%1;
function material(color:string,alpha:number){const m=new T.MeshStandardMaterial({color,roughness:.57,metalness:.015,transparent:true,opacity:alpha,depthWrite:false,side:T.DoubleSide});m.userData.baseAlpha=alpha;return m;}
function alpha(o:T.Object3D,q:number){o.traverse(o=>{if(o instanceof T.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])m.opacity=(m.userData.baseAlpha??1)*clamp(q);}});}

/** A growing aggregate inside the SAME 10 mm artery, in metres. Coagulation
 * is a time-compressed mechanism demonstration, not CFD. Teal marks indicate
 * direction/relative passage, never enlarged literal erythrocytes or platelets.
 */
export class V7ArterialClot {
 readonly root=new T.Group();
 private bulk:T.Mesh;
 private plaque:T.Mesh;
 private cap:T.Mesh[]=[];
 private fibers:T.Mesh[]=[];
 private markers:T.InstancedMesh;
 private arrivals:T.InstancedMesh;
 private dummy=new T.Object3D();
 private uv:{r:number;a:number;bottom:boolean}[]=[];
 private growth=0;
 private inhibition=0;
 constructor(){
  this.root.name='same-artery-lumen-clot-growth-and-residual-flow';
  this.root.userData={units:'metres',lumenDiameter:.01,model:'time-compressed aggregate growth teaching model',flow:'direction markers; not patient CFD or measured flow rate'};
  this.plaque=new T.Mesh(new T.SphereGeometry(1,48,24),material('#c6a66e',.90));
  this.plaque.position.set(.002,-.00455,-.0009);this.plaque.scale.set(.0051,.00057,.0025);this.root.add(this.plaque);
  for(const sign of [-1,1]){const cap=new T.Mesh(new T.SphereGeometry(1,40,20),material('#e0b5a2',.78));cap.position.set(.002+sign*.0019,-.00410,-.0009);cap.scale.set(.0027,.00022,.00245);this.root.add(cap);this.cap.push(cap);}
  const positions:number[]=[],index:number[]=[],nr=24,na=88;
  for(const bottom of [false,true])for(let i=0;i<=nr;i++)for(let j=0;j<=na;j++){this.uv.push({r:i/nr,a:j/na*Math.PI*2,bottom});positions.push(0,0,0);}
  const count=(nr+1)*(na+1);
  for(let side=0;side<2;side++)for(let i=0;i<nr;i++)for(let j=0;j<na;j++){const a=side*count+i*(na+1)+j,b=a+1,c=a+na+1,d=c+1;index.push(...(side?[a,c,b,b,c,d]:[a,b,c,b,d,c]));}
  for(let j=0;j<na;j++){const a=nr*(na+1)+j;index.push(a,a+1,a+count,a+1,a+1+count,a+count);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(index);
  this.bulk=new T.Mesh(geo,material('#ad5d54',1));(this.bulk.material as T.Material).depthWrite=true;(this.bulk.material as T.MeshStandardMaterial).side=T.FrontSide;this.bulk.name='contiguous-millimetre-clot-aggregate-not-single-cell';this.root.add(this.bulk);
  // These threads are visible aggregate ridges, not fibrin's 100 nm diameter.
  for(let i=0;i<11;i++){const line=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([V(),V(.002,0,0),V(.004,.001,0)]),42,.000021,6,false),material('#d9b28f',.61));line.name='fibrin-bundle-surface-ridge-teaching-detail';this.fibers.push(line);this.root.add(line);}
  this.markers=new T.InstancedMesh(new T.SphereGeometry(.000065,8,6),material('#2d8588',.86),110);this.markers.name='relative-blood-passage-direction-markers';this.markers.frustumCulled=false;this.root.add(this.markers);
  this.arrivals=new T.InstancedMesh(new T.SphereGeometry(.000075,8,6),material('#d5b279',.79),24);this.arrivals.name='recruitment-direction-symbols-not-literal-platelets';this.arrivals.frustumCulled=false;this.root.add(this.arrivals);
  this.update(0,0,0,0);
 }
 private surface(r:number,a:number,g:number,bottom=false){
  const spread=.13+.87*Math.sqrt(g),x=.002+.0058*spread*r*Math.cos(a),z=-.0009*(1-g)+.0044*spread*r*Math.sin(a);
  const low=-Math.sqrt(Math.max(0,.00484**2-z*z));
  const height=(.00055+.00772*g)*Math.sqrt(Math.max(0,1-r*r));
  const rough=.00007*g*Math.sin(x*6100+z*2100)*Math.sin(z*5600);
  const y=bottom?low:Math.min(Math.sqrt(Math.max(0,.00482**2-z*z)),low+height+rough);
  return V(x,y,z);
 }
 update(time:number,progress:number,inhibition:number,weight:number){
  this.root.visible=weight>.000001;if(!this.root.visible)return;
  const g=ramp(progress,.20,.95);this.growth=g;this.inhibition=clamp(inhibition);
  const p=this.bulk.geometry.attributes.position as T.BufferAttribute;
  this.uv.forEach((u,i)=>{const q=this.surface(u.r,u.a,g,u.bottom);p.setXYZ(i,q.x,q.y,q.z);});p.needsUpdate=true;this.bulk.geometry.computeVertexNormals();
  alpha(this.plaque,weight);alpha(this.bulk,weight*ramp(progress,.12,.28));
  this.cap.forEach((cap,i)=>{cap.position.x=.002+(i?1:-1)*(.0019+.00055*ramp(progress,.06,.25));alpha(cap,weight*(1-.35*g));});
  (this.bulk.material as T.Material).depthWrite=weight*ramp(progress,.12,.28)>.96;
  this.fibers.forEach((mesh,i)=>{const fixed=((i%6)-2.5)*.22,extent=Math.sqrt(.88**2-fixed**2),pts=Array.from({length:43},(_,j)=>{const u=-extent+j/42*extent*2,x=i<6?u:fixed,z=i<6?fixed:u,r=Math.hypot(x,z),q=this.surface(r,Math.atan2(z,x),g);q.y+=.000030;return q;});const next=new T.TubeGeometry(new T.CatmullRomCurve3(pts,false,'catmullrom',.5),42,.000023,6,false);mesh.geometry.dispose();mesh.geometry=next;alpha(mesh,weight*ramp(progress,.36,.75));});
  for(let i=0;i<this.markers.count;i++){
   const lane=i%11,u=phase(time*(.095-.045*g)+Math.floor(i/11)/10+lane*.037),x=-.020+.040*u;
   const a=lane*2.39996,rr=.00345*Math.sqrt((lane+.5)/11),farY=rr*Math.cos(a),farZ=rr*Math.sin(a);
   const around=Math.exp(-(((x-.002)/.009)**4))*g;
   const y=farY*(1-around)+(.00375+.00030*Math.sin(a))*around,z=farZ*(1-.75*around);
   // A reduced number of downstream markers makes obstruction readable.
   const blocked=lane<Math.floor(8*g),fade=blocked?1-ramp(x,-.009,-.005):1;
   const edge=smooth(Math.min(u,1-u)/.05);
   this.dummy.position.set(x,y,z);this.dummy.rotation.set(0,0,Math.PI/2);this.dummy.scale.set(.85*edge*fade,4.6*edge*fade,.85*edge*fade);this.dummy.updateMatrix();this.markers.setMatrixAt(i,this.dummy.matrix);
  }this.markers.instanceMatrix.needsUpdate=true;alpha(this.markers,weight);
  for(let i=0;i<this.arrivals.count;i++){
   const u=phase(time*.13+i/24),end=this.surface(.28+((i*.37)%1)*.55,i*2.4,g),from=V(-.013,.0015+.0004*Math.sin(i),.002*Math.cos(i));
   const q=ramp(u,.07,.9);this.dummy.position.copy(from).lerp(end,q);const vis=smooth(Math.min(u,1-u)/.12)*(1-.92*this.inhibition)*ramp(progress,.07,.32);
   this.dummy.rotation.set(0,0,Math.PI/2);this.dummy.scale.set(.7*vis,2.4*vis,.7*vis);this.dummy.updateMatrix();this.arrivals.setMatrixAt(i,this.dummy.matrix);
  }this.arrivals.instanceMatrix.needsUpdate=true;alpha(this.arrivals,weight);
 }
 labels(){this.root.updateWorldMatrix(true,false);return [
  {text:this.growth>.35?'血栓 · 堵住通道':'破口附近开始聚集',point:this.root.localToWorld(V(.002,-.0035+.0063*this.growth,0)),side:'left' as const},
  {text:this.inhibition>.3?'减少继续聚集':'剩余血流通道',point:this.root.localToWorld(this.inhibition>.3?V(-.007,.002,0):V(.005,.0040,0)),side:'right' as const}
 ];}
}
