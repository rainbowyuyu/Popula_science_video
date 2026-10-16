import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import sim from './simulation.json';

export const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export const smooth=(n:number)=>{const x=clamp(n);return x*x*x*(x*(x*6-15)+10)};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const palette={metal:0x6c8594,teal:0x087f85,gold:0xe5a65d,wall:0xcbd3d5,paper:0xece9df,coral:0xc55a3d};
export type State={scene:string;progress:number;line:number;lineProgress:number;time:number;iteration?:number;previous?:string;elapsed?:number};
function material(color:number,metalness=.0,roughness=.6){return new THREE.MeshStandardMaterial({color,metalness,roughness})}
export class World {
 renderer:THREE.WebGLRenderer; scene=new THREE.Scene(); camera:THREE.OrthographicCamera;
 model=new THREE.Group(); fixtures=new THREE.Group(); wall=new THREE.Group(); books=new THREE.Group();
 plate:THREE.InstancedMesh; second:THREE.InstancedMesh; surface:THREE.Group; surfaces:THREE.Group[]=[];
 grid:THREE.LineSegments; arrow:THREE.ArrowHelper; smallArrows:THREE.ArrowHelper[]=[]; bolts:THREE.Mesh[]=[];
 cubes=new THREE.Group(); cubeMeshes:THREE.Mesh[]=[]; environment:THREE.WebGLRenderTarget;
 mat=material(0xffffff,.56,.30); dummy=new THREE.Object3D(); color=new THREE.Color();
 outline:THREE.Line; marker:THREE.Mesh; highlight:THREE.Mesh;
 loadAnchor=new THREE.Vector3();
 constructor(canvas:HTMLCanvasElement,width=1920,height=1080){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  this.renderer.setSize(width,height,false);this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const pmrem=new THREE.PMREMGenerator(this.renderer);const room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;room.dispose();pmrem.dispose();
  this.scene.background=new THREE.Color(0xe7ecee);this.scene.fog=new THREE.Fog(0xe7ecee,30,70);
  const a=width/height;this.camera=new THREE.OrthographicCamera(-5.65*a,5.65*a,5.65,-5.65,.1,90);
  this.scene.add(new THREE.HemisphereLight(0xe7f6ff,0x73838d,1.4));
  const key=new THREE.DirectionalLight(0xffefd9,3);key.position.set(1,12,8);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-14,right:14,top:12,bottom:-10,near:1,far:40});key.shadow.bias=-.0004;this.scene.add(key);
  const fill=new THREE.DirectionalLight(0xcce8ff,1.4);fill.position.set(-8,4,-4);this.scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),material(0xdbe3e6));floor.rotation.x=-Math.PI/2;floor.position.y=-.45;floor.receiveShadow=true;this.scene.add(floor);
  this.scene.add(this.model);this.model.add(this.fixtures,this.wall,this.books);
  const wall=this.box(.3,6.8,3.5,palette.wall);wall.position.set(-4.35,2.4,0);this.wall.add(wall);
  const edge=this.box(.025,6.7,.035,0xb9b5aa);edge.position.set(-4.18,2.4,1.78);this.wall.add(edge);
  const shelf=this.box(8.9,.25,2.7,0xb88a5e);shelf.position.set(.18,4.15,0);this.fixtures.add(shelf);
  for(let i=0;i<26;i++){const grain=this.box(8.88,.008,.015,0xa47954);grain.position.set(.18,4.282,-1.3+i*.1);this.fixtures.add(grain)}
  const colors=[0x193b45,0xb57b52,0xccc2a6,0x527b78,0x394559,0xd6bc83,0x9d5947];
  for(let i=0;i<7;i++){
   const book=new THREE.Group(),h=1.2+(i%3)*.14,w=.28+(i%2)*.1;
   const pages=this.box(w,h,1.02,0xded7c3);book.add(pages);
   for(const xx of [-w/2,w/2]){const cover=this.box(.028,h+.055,1.07,colors[i]);cover.position.x=xx;book.add(cover)}
   const spine=this.box(w+.03,h+.055,.045,colors[i]);spine.position.z=.53;book.add(spine);
   for(const yy of [-h*.35,h*.35]){const band=this.box(w*.6,.017,.01,0xc8ad79);band.position.set(0,yy,.56);book.add(band)}
   book.position.set(1.65+i*.38,4.3+h/2,.05);this.books.add(book);
  }
  for(const y of [.4,3.6]){const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,.12,6),material(0x626e77,.8,.23));bolt.rotation.x=Math.PI/2;bolt.position.set(-3.77,y,.19);bolt.castShadow=true;this.bolts.push(bolt);this.model.add(bolt)}
  this.plate=new THREE.InstancedMesh(new THREE.BoxGeometry(.1005,.1005,.16),this.mat,sim.nx*sim.ny);this.plate.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.plate.castShadow=true;this.plate.receiveShadow=true;this.model.add(this.plate);
  this.second=new THREE.InstancedMesh(new THREE.BoxGeometry(.1005,.1005,.16),this.mat,sim.nx*sim.ny);this.second.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.second.castShadow=true;this.model.add(this.second);
  for(const groups of sim.surfaces){
   const g=new THREE.Group();
   for(const rings of groups){
    const shape=new THREE.Shape();rings[0].forEach((v:number[],i:number)=>i?shape.lineTo(v[0],v[1]):shape.moveTo(v[0],v[1]));
    for(const ring of rings.slice(1)){const hole=new THREE.Path();ring.forEach((v:number[],i:number)=>i?hole.lineTo(v[0],v[1]):hole.moveTo(v[0],v[1]));shape.holes.push(hole)}
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:true,bevelSize:.028,bevelThickness:.02,bevelSegments:3,steps:1,curveSegments:8});
    const mesh=new THREE.Mesh(geo,material(palette.metal,.65,.24));mesh.position.z=-.08;mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);
   }
   g.visible=false;this.model.add(g);this.surfaces.push(g)
  }
  this.surface=this.surfaces[this.surfaces.length-1];
  const outlineGeo=new THREE.BufferGeometry().setFromPoints(Array.from({length:81},(_,i)=>new THREE.Vector3(-4+i*.1,4,.18)));
  this.outline=new THREE.Line(outlineGeo,new THREE.LineDashedMaterial({color:0xb66f40,dashSize:.13,gapSize:.12,transparent:true,opacity:.7}));this.outline.computeLineDistances();this.model.add(this.outline);
  this.marker=new THREE.Mesh(new THREE.SphereGeometry(.07,16,12),material(0xb66f40,.1,.3));this.model.add(this.marker);
  this.highlight=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.20),material(0xe0a358,.25,.25));this.model.add(this.highlight);
  const verts:number[]=[];
  for(let i=0;i<=80;i++)verts.push(-4+i*.1,0,.101,-4+i*.1,4,.101);
  for(let j=0;j<=40;j++)verts.push(-4,j*.1,.101,4,j*.1,.101);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));this.grid=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x237f84,transparent:true,opacity:.34}));this.model.add(this.grid);
  this.arrow=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(3.93,5.5,.5),1.4,palette.coral,.25,.18);this.model.add(this.arrow);
  for(let j=0;j<4;j++){const a=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(-4.13,.45+j,.5),.6,palette.teal,.16,.14);this.model.add(a);this.smallArrows.push(a)}
  this.scene.add(this.cubes);
  for(let g=0;g<2;g++)for(let k=0;k<8;k++){
   const box=new THREE.Mesh(new THREE.BoxGeometry(.72,.72,.72),material(g?0x167d82:0xdb9c52,.25,.29));box.castShadow=true;
   box.position.set((g?4:-1)+(k%2)*.79,1.35+Math.floor(k/4)*.79,(Math.floor(k/2)%2)*.79);this.cubes.add(box);this.cubeMeshes.push(box);
  }
 }
 box(w:number,h:number,d:number,c:number){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(c));m.castShadow=true;m.receiveShadow=true;return m}
 render(s:State){
  const scene=s.scene;const p=clamp(s.progress),l=s.line,lp=smooth(s.lineProgress),time=s.time;
  const life=scene==='room'||scene==='return';const compare=scene==='compare';const caveat=scene==='caveat';
  this.model.position.set(1.3,0,0);this.model.scale.setScalar(compare?.69:1);this.model.rotation.set(0,0,0);
  let cx=11,cy=7.2,cz=18,zoom=1.12,lookY=2.2;
  if(life){cx=10-2*p;cy=7;cz=16;zoom=1.10;lookY=2.8}
  else if(scene==='grid'||scene==='load'){cx=7-5*p;cy=5.5;cz=20;zoom=1.23}
  else if(scene==='density'||scene==='penalty'){cx=5;cy=5;cz=20;zoom=1.24}
  else if(scene==='optimize'){cx=6-4*p;cy=5;cz=20;zoom=1.25}
  else if(scene==='lab'){cx=1;cy=4;cz=22;zoom=1.13;this.model.position.x=-.7}
  else if(compare){cx=2;cy=5.8;cz=23;zoom=1.03;this.model.position.set(-2.9,1.4,0)}
  else if(caveat){cx=6-3*p;cy=6;cz=20;zoom=1.16}
  else if(scene==='manufacture'){cx=8-5*p;cy=6.8;cz=16;zoom=1.24}
  // Deterministic camera handoff: begin each scene from the previous scene's endpoint.
  if(s.previous&&s.previous!==scene&&(s.elapsed??2)<1.5){
   const presets:Record<string,number[]>={room:[8,7,16,1.1,2.8,1.3,0,1],solid:[11,7.2,18,1.12,2.2,1.3,0,1],strip:[11,7.2,18,1.12,2.2,1.3,0,1],grid:[2,5.5,20,1.23,2.2,1.3,0,1],load:[2,5.5,20,1.23,2.2,1.3,0,1],density:[5,5,20,1.24,2.2,1.3,0,1],penalty:[5,5,20,1.24,2.2,1.3,0,1],optimize:[2,5,20,1.25,2.2,1.3,0,1],lab:[1,4,22,1.13,2.2,-.7,0,1],compare:[2,5.8,23,1.03,2.2,4,1.4,.69],caveat:[3,6,20,1.16,2.2,1.3,0,1],manufacture:[3,6.8,16,1.24,2.2,1.3,0,1]};
   const v=presets[s.previous];if(v){const q=smooth((s.elapsed??0)/1.5);cx=mix(v[0],cx,q);cy=mix(v[1],cy,q);cz=mix(v[2],cz,q);zoom=mix(v[3],zoom,q);lookY=mix(v[4],lookY,q);this.model.position.x=mix(v[5],this.model.position.x,q);this.model.position.y=mix(v[6],this.model.position.y,q);this.model.scale.setScalar(mix(v[7],this.model.scale.x,q))}
  }
  this.camera.position.set(cx,cy,cz);this.camera.zoom=zoom;this.camera.lookAt(1.0,lookY,0);this.camera.updateProjectionMatrix();
  const depart=scene==='solid'&&p<.10;
  this.fixtures.visible=life||depart;this.books.visible=life||depart;
  this.fixtures.position.y=depart?smooth(p/.10)*8:0;this.books.position.y=this.fixtures.position.y;
  this.wall.visible=life||scene==='solid'||scene==='strip';
  this.bolts.forEach(b=>b.visible=!compare);this.grid.visible=['grid','load','density'].includes(scene);
  (this.grid.material as THREE.LineBasicMaterial).opacity=scene==='grid'?.45*smooth(p*3):.12;
  this.arrow.visible=!life&&scene!=='density'&&scene!=='penalty'&&!compare;
  this.smallArrows.forEach(a=>a.visible=['solid','load'].includes(scene));
  this.surfaces.forEach(g=>g.rotation.set(0,0,0));
  this.surfaces.forEach(g=>g.visible=false);this.plate.visible=true;this.second.visible=compare;
  this.cubes.visible=scene==='penalty';
  if(scene==='penalty'){this.plate.visible=false;this.bolts.forEach(b=>b.visible=false);this.cubeMeshes.forEach((m,k)=>{const q=l>=2?1:l===1?smooth(lp*2):0;const drop=k<8?(k>=4?q:0):(k>8?q:0);m.scale.setScalar(1-drop);m.rotation.set(0,.05*Math.sin(p*Math.PI),0)})}
  let index=0,mode='solid',deform=0;
  if(scene==='room'){mode=l>=2?'final':l===1?'reveal':'solid';this.books.children.forEach((b,i)=>b.position.y=4.9+(i%3)*.07+(l<2?(1-smooth((time-i*.1)/1.2))*1.3:0))}
  if(scene==='return'||scene==='manufacture'||scene==='references')mode='final';
  if(scene==='strip'){mode='strip';deform=l>=2?200*smooth((l-2+lp)/1.1):0}
  if(scene==='grid'){mode='density';deform=200*(1-smooth((s.elapsed??2)/1.5))}
  if(scene==='load'){mode='solid';deform=200*smooth(p*2)}
  if(scene==='density'||scene==='penalty')mode='density';
  if(scene==='optimize'){mode='iteration';index=Math.min(50,Math.floor(p*52))}
  if(scene==='lab'){mode='iteration';index=s.iteration??Math.min(50,Math.floor(p*50))}
  if(compare){mode='strip';deform=200*smooth(p*3)}
  if(caveat){mode=l===1?'solid':'final'}
  this.outline.visible=(scene==='strip'&&l>=2)||scene==='load';this.marker.visible=this.outline.visible;
  const tip=mode==='strip'?sim.comparisons.strip.displacement[40*81+80]:sim.comparisons.solid.displacement[40*81+80];
  this.marker.position.set(4+tip[0]/50*deform,4+tip[1]/50*deform,.22);
  this.highlight.visible=scene==='grid'&&l>=1||scene==='density';
  this.highlight.position.set(2.05,2.05,.18);this.highlight.scale.setScalar(1+.1*Math.sin(p*Math.PI*2));
  if(mode==='final'){
   this.plate.visible=false;this.surface.visible=true;
   if(scene==='manufacture'){
    this.surface.rotation.y=Math.sin(p*Math.PI)*.45;
    this.bolts.forEach((b,i)=>{b.position.z=.19+Math.sin(p*Math.PI)*.8;b.rotation.z=p*.9+i});
   }else{this.surface.rotation.y=0;this.bolts.forEach(b=>b.position.z=.19)}
  }
  // Resultant of the three loaded nodes, inset 0.05 to the rendered contour edge.
  // The tail is derived from the tip; applied gravity remains downward as the part turns.
  const loadU=mode==='strip'||scene==='grid'?sim.comparisons.strip.displacement:sim.comparisons.solid.displacement;
  const meanU=[0,0];for(const row of [38,39,40]){meanU[0]+=loadU[row*81+80][0]/3;meanU[1]+=loadU[row*81+80][1]/3}
  this.loadAnchor.set(3.95+meanU[0]/50*deform,3.9+meanU[1]/50*deform,.12);
  if(mode==='final'){this.surface.updateMatrix();this.loadAnchor.applyMatrix4(this.surface.matrix)}
  this.arrow.position.copy(this.loadAnchor).add(new THREE.Vector3(0,1.4,0));
  if(scene==='references')this.arrow.visible=false;
  const densities=sim.history[index].density;const final=sim.history[50].density;
  const fraction=scene==='optimize'?clamp(p*52-index):0;const next=sim.history[Math.min(50,index+1)].density;
  for(let k=0;k<sim.nx*sim.ny;k++){
   const x=k%80,y=Math.floor(k/80);let rho=1;
   if(mode==='strip')rho=y>=26?1:scene==='strip'?1-smooth(p*8+(1-y/26)*.4):0;
   if(mode==='density')rho=scene==='density'?.15+.7*smooth((l-1+lp)/3):.35;
   if(scene==='grid'&&(s.elapsed??2)<1.5)rho=mix(y>=26?1:0,.35,smooth((s.elapsed??0)/1.5));
   if(mode==='reveal')rho=mix(1,final[k],smooth(lp*1.8));
   if(scene==='solid'&&(s.elapsed??2)<1.5)rho=mix(final[k],1,smooth((s.elapsed??0)/1.5));
   if(mode==='iteration')rho=mix(densities[k],next[k],smooth(fraction));
   let px=-4+(x+.5)*.1,py=(y+.5)*.1;
   if(deform){const uu=mode==='strip'||scene==='grid'?sim.comparisons.strip.displacement:sim.comparisons.solid.displacement;const nod=(y+1)*81+x+1;px+=uu[nod][0]/50*deform;py+=uu[nod][1]/50*deform}
   this.dummy.position.set(px,py,0);this.dummy.scale.setScalar(rho<.035?0:mode==='strip'&&y<26||mode==='reveal'||scene==='solid'&&(s.elapsed??2)<1.5?rho:1);
   this.dummy.updateMatrix();this.plate.setMatrixAt(k,this.dummy.matrix);
   if(mode==='density'||mode==='iteration'){
    this.color.setRGB(mix(.80,.045,rho),mix(.83,.33,rho),mix(.81,.37,rho));
    if(scene==='load'){
     const v=clamp(sim.vonMisesMPa[k]/4);this.color.setHSL(.51-v*.46,.62,.62-v*.15);
    }
   }else this.color.setHex(palette.metal);
   this.plate.setColorAt(k,this.color);
   if(compare){
    const u=sim.displacement[(y+1)*81+x+1];const separation=10*smooth((s.elapsed??2)/1.5);this.dummy.position.set(-4+(x+.5)*.1+u[0]/50*deform+separation,(y+.5)*.1+u[1]/50*deform,0);
    this.dummy.scale.setScalar(final[k]<.035?0:1);this.dummy.updateMatrix();this.second.setMatrixAt(k,this.dummy.matrix);this.color.setHex(0x529b97);this.second.setColorAt(k,this.color);
   }
  }
  this.plate.instanceMatrix.needsUpdate=true;if(this.plate.instanceColor)this.plate.instanceColor.needsUpdate=true;
  if(compare){this.second.instanceMatrix.needsUpdate=true;if(this.second.instanceColor)this.second.instanceColor.needsUpdate=true}
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.scene.traverse(o=>{const x=o as THREE.Mesh;if(x.geometry)x.geometry.dispose();if(x.material){for(const m of Array.isArray(x.material)?x.material:[x.material])m.dispose()}});this.environment.dispose();this.renderer.dispose();this.renderer.forceContextLoss()}
}
