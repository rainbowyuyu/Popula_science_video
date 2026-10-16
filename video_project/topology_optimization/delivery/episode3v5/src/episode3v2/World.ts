import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import timeline from './timeline.json';
export const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export const smooth=(x:number)=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10)};
const mix=T.MathUtils.lerp,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const anchorTo=(target:T.Vector3,from:T.Vector3,scale:number)=>target.clone().add(from.clone().sub(target).multiplyScalar(scale));
export type JoineryState={scene:string;progress:number;line:number;lineProgress:number;time:number;elapsed:number;previous?:string;clip?:string};
const mat=(c:number)=>new T.MeshStandardMaterial({color:c,roughness:.47});
const box=(w:number,h:number,d:number,c:number)=>new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));
const materials=(o:T.Object3D)=>o instanceof T.Mesh?(Array.isArray(o.material)?o.material:[o.material]):[];
const find=(r:T.Object3D,n:string)=>{let result:T.Object3D|undefined;r.traverse(o=>{if(o.name===n||o.name.startsWith(n+'.')||o.name.startsWith(n+'_'))result??=o});return result!};
type Beam={xy:number[][];triangles:number[][];displacement:number[][];sigmaX:number[];displayGain:number;length:number;height:number;maxStress:number};
type Moist={nx:number;ny:number;frames:number[][];meanUptake:number[]};
type Wind={nx:number;ny:number;dx:number;x0:number;y0:number;frames:{u:number[];v:number[];p:number[]}[];solid:number[]};
export class JoineryWorld{
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(36,16/9,.1,150);ready:Promise<void>;env:T.WebGLRenderTarget;
 pavilion=new T.Group();joint=new T.Group();dovetail=new T.Group();lap=new T.Group();peg=new T.Group();stress=new T.Group();moisture=new T.Group();forces=new T.Group();wind=new T.Group();supports=new T.Group();windResponse=new T.Group();
 roots:T.Group[]=[];parts:T.Object3D[]=[];tenon!:T.Object3D;mortise!:T.Object3D;pegMoving!:T.Object3D;pegPin!:T.Object3D;doveMoving!:T.Object3D;lapMoving!:T.Object3D;
 stressBeamGroup=new T.Group();stressJoint!:T.Object3D;stressContact!:T.Mesh;pegPost!:T.Object3D;
 beam!:Beam;wet!:Moist;flow!:Wind;beamMesh!:T.Mesh;beamArrows:T.ArrowHelper[]=[];jointArrow!:T.ArrowHelper;jointResistArrow!:T.ArrowHelper;doveArrow!:T.ArrowHelper;doveResistArrow!:T.ArrowHelper;lapArrow!:T.ArrowHelper;lapResistArrow!:T.ArrowHelper;pegArrow!:T.ArrowHelper;pegResistArrow!:T.ArrowHelper;contact!:T.Mesh;forceNodes:T.Mesh[]=[];wetLayers:T.Mesh[]=[];
 flowCurves:T.CatmullRomCurve3[]=[];flowDots:T.Mesh[]=[];flowTrails:T.Line[]=[];
 // Colour-coded wire shell for the wind response. It follows the pavilion
 // during the same camera hand-off, so the stress response reads as part of
 // the model rather than as a separate card.
 windHeat=new T.Group();
 pathLines:{mesh:T.Mesh;halo:T.Mesh;curve:T.CatmullRomCurve3;dot:T.Mesh;stage:number;corner:number}[]=[];
 sample!:T.Mesh;sampleRoot=new T.Group();wetTex!:T.DataTexture;wetFace!:T.Mesh;wetSide!:T.Mesh;wetTop!:T.Mesh;water:T.Mesh[]=[];wetJoint!:T.Object3D;wetTenon!:T.Object3D;dryOutline!:T.LineSegments;grain!:T.CanvasTexture;
  windModel!:T.Object3D;windShell!:T.Object3D;windHeatModel!:T.Object3D;

 constructor(canvas:HTMLCanvasElement,base:string){
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  this.renderer.setSize(1920,1080,false);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.08;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.localClippingEnabled=true;
  this.scene.background=new T.Color(0xeee7d8);this.scene.fog=new T.Fog(0xeee7d8,26,75);
  const pm=new T.PMREMGenerator(this.renderer);this.env=pm.fromScene(new RoomEnvironment(),.04);this.scene.environment=this.env.texture;this.scene.environmentIntensity=.47;pm.dispose();
  this.scene.add(new T.HemisphereLight(0xfff2db,0x78827a,1.6));
  const sun=new T.DirectionalLight(0xffebd2,3.1);sun.position.set(-4,11,7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:40});sun.shadow.normalBias=.025;sun.shadow.bias=-.0004;sun.shadow.radius=4;this.scene.add(sun);
  const fill=new T.DirectionalLight(0xe4eeef,1.25);fill.position.set(7,6,-8);this.scene.add(fill);
  const floor=box(180,.12,180,0xe5ddcc);floor.position.y=-.5;floor.receiveShadow=true;this.scene.add(floor);
  this.roots=[this.pavilion,this.joint,this.dovetail,this.lap,this.peg,this.stress,this.moisture];this.scene.add(...this.roots,this.forces,this.wind,this.supports);
  this.grain=this.makeGrain();
  const l=new GLTFLoader(),json=(n:string)=>fetch(base.replace('models/','physics/')+n).then(r=>{if(!r.ok)throw Error(n);return r.json()});
  this.ready=Promise.all([l.loadAsync(base+'crafted-pavilion.glb'),l.loadAsync(base+'crafted-joint.glb'),l.loadAsync(base+'dovetail.glb'),l.loadAsync(base+'half-lap.glb'),l.loadAsync(base+'pegged.glb'),json('beam.json'),json('moisture.json'),json('wind.json')]).then(([p,j,d,h,g,b,m,w])=>{
   [p,j,d,h,g].forEach((a,i)=>this.roots[i].add(a.scene));this.beam=b;this.wet=m;this.flow=w;
   this.roots.slice(0,5).forEach(r=>r.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;materials(o).forEach(mt=>{const mm=mt as T.MeshStandardMaterial;if(/cedar/i.test(mm.name)){mm.map=this.grain;mm.roughness=.49;}mm.userData.opacity=mm.opacity;})}}));
   p.scene.traverse(o=>{if(o.name.startsWith('stage_')){this.parts.push(o);o.userData.base=o.position.clone();o.userData.baseRotation=o.rotation.clone();o.userData.baseScale=o.scale.clone()}});
   this.tenon=find(this.joint,'tenon');this.mortise=find(this.joint,'mortise');
   // The GLBs contain a fixed member and a moving member as sibling nodes.
   // Selecting the whole root makes a half-lap or pegged joint look like one
   // fused prop during a handoff, so keep the stationary board/post in place
   // and animate only the named moving part.
   // Animate the authored moving parent groups so each child keeps its
   // designed local pivot (lap_upper, beam/tenon and wood_peg).  Moving a
   // mesh directly would erase its baked y/x offset and make the members
   // appear to jump or separate from the actual holes.
   this.doveMoving=find(this.dovetail,'moving')??this.dovetail;
   this.lapMoving=find(this.lap,'moving001')??find(this.lap,'lap upper')??this.lap;
   this.pegMoving=find(this.peg,'moving002')??find(this.peg,'beam')??this.peg;
   this.pegPin=find(this.peg,'pin')??find(this.peg,'wood peg')??this.peg;
   this.pegPost=find(this.peg,'post');this.pegPost.traverse(o=>{if(o instanceof T.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
   this.buildBeam();this.buildMoisture();this.buildFlow();this.buildForces();this.buildWindResponse();
   // Explanatory direction arrows are anchored to the actual joinery roots.
   // They are depth-tested foreground overlays so the viewer reads the motion
   // before the timber hides the shaft.  Each arrow is enabled only during
   // its own beat and fades through scale/opacity in configure* below.
   this.jointArrow=new T.ArrowHelper(V(-1,0,0),V(1.5,2.35,.18),1.15,0xc44737,.22,.09);this.joint.add(this.jointArrow);
   this.jointResistArrow=new T.ArrowHelper(V(1,0,0),V(.62,2.35,.22),.72,0xa56e33,.17,.07);this.joint.add(this.jointResistArrow);
   // Pulling a drawer is allowed along one axis; the widened tail blocks the
   // opposite lift.  These arrows share the dovetail's local frame so they
   // stay registered during the orbiting close-up.
   this.doveArrow=new T.ArrowHelper(V(1,0,0),V(.72,2.52,.86),1.24,0xc44737,.24,.10);this.dovetail.add(this.doveArrow);
   this.doveResistArrow=new T.ArrowHelper(V(-1,0,0),V(.22,1.76,.86),.92,0x2a8d84,.19,.08);this.dovetail.add(this.doveResistArrow);
   this.lapArrow=new T.ArrowHelper(V(0,-1,0),V(0,2.24,.52),.92,0xa56e33,.22,.095);this.lap.add(this.lapArrow);
   this.lapResistArrow=new T.ArrowHelper(V(0,1,0),V(.78,.62,.52),.76,0xc44737,.21,.09);this.lap.add(this.lapResistArrow);
   this.pegArrow=new T.ArrowHelper(V(0,0,-1),V(-.6,2.65,2.85),1.32,0x2a8d84,.25,.10);this.peg.add(this.pegArrow);
   this.pegResistArrow=new T.ArrowHelper(V(1,0,0),V(1.3,2.88,.55),1.0,0xc44737,.25,.10);this.peg.add(this.pegResistArrow);
   this.contact=box(.95,.026,.46,0xda9c4b);this.contact.position.set(-.6,1.95,0);this.joint.add(this.contact);
   for(const x of [-1.7,1.7]){const leg=box(.14,3.4,.14,0x4d7469);leg.position.set(x,1.32,2);const cap=box(.8,.12,.6,0x4d7469);cap.position.set(x,3.02,2);this.supports.add(leg,cap);}
   this.scene.updateMatrixWorld(true);
  });
 }
 buildWindResponse(){
  // Keep a second, pale model in the wind shot.  The heat map is registered
  // to this clone (and synchronised with the animated pavilion every frame),
  // so the response cannot drift away from the roof or columns.
  const model=this.pavilion.children[0].clone(true); model.name='wind-response-model';
  model.traverse(o=>{if(o instanceof T.Mesh){const m=new T.MeshBasicMaterial({color:0xe5e9e2,transparent:true,opacity:.92,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});o.material=m;o.renderOrder=10;o.castShadow=false;o.receiveShadow=false;}});
  this.windModel=model;this.windResponse.add(model);
  const shell=this.pavilion.children[0].clone(true); shell.name='wind-response-shell';
  shell.traverse(o=>{if(o instanceof T.Mesh){const m=new T.MeshBasicMaterial({color:0xb8c8c0,wireframe:true,transparent:true,opacity:.34,depthWrite:false});o.material=m;o.castShadow=false;o.receiveShadow=false;}});
  this.windShell=shell;shell.visible=false;this.windResponse.add(shell);
  // Reuse the pavilion geometry for a restrained colour-coded stress shell.
  // It stays registered to the roof, beams and columns while the pale shell
  // keeps the silhouette readable.
  const heat=this.pavilion.children[0].clone(true);heat.name='wind-stress-response';
  heat.updateMatrixWorld(true);
  heat.traverse(o=>{if(o instanceof T.Mesh){
   let node:T.Object3D|null=o;let foundation=false;while(node){if(node.name.includes('base'))foundation=true;node=node.parent;}
   o.userData.isFoundation=foundation;
   o.geometry=o.geometry.clone();const position=o.geometry.attributes.position,colors=new Float32Array(position.count*3);
   const cold=new T.Color(0x4d98a1),neutral=new T.Color(0xe9d8a7),hot=new T.Color(0xc9573e),field=this.flow.frames.at(-1)!;
   for(let i=0;i<position.count;i++){
    const point=V().fromBufferAttribute(position,i).applyMatrix4(o.matrixWorld),gx=clamp((point.x-this.flow.x0)/(this.flow.dx*(this.flow.nx-1)))*(this.flow.nx-1),gy=clamp(point.y/(this.flow.dx*(this.flow.ny-1)))*(this.flow.ny-1);
    const ix=Math.min(this.flow.nx-2,Math.floor(gx)),iy=Math.min(this.flow.ny-2,Math.floor(gy)),fx=gx-ix,fy=gy-iy;
    const cp=mix(mix(field.p[iy*this.flow.nx+ix],field.p[iy*this.flow.nx+ix+1],fx),mix(field.p[(iy+1)*this.flow.nx+ix],field.p[(iy+1)*this.flow.nx+ix+1],fx),fy);
    const value=T.MathUtils.clamp(cp/.52,-1,1),color=neutral.clone().lerp(value<0?cold:hot,Math.abs(value));colors.set([color.r,color.g,color.b],i*3);
   }
   o.geometry.setAttribute('color',new T.BufferAttribute(colors,3));o.renderOrder=12;
   o.material=new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:foundation?0:.55,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});o.castShadow=false;o.receiveShadow=false;
  }});
  this.windHeatModel=heat;this.windHeat.add(heat);this.windResponse.add(this.windHeat);this.wind.add(this.windResponse);
  for(const [x,z] of [[0,0],[-1.9,0],[1.9,0],[0,1.9],[0,-1.9]]){
   const ring=new T.Mesh(new T.RingGeometry(.14,.22,32),new T.MeshBasicMaterial({color:0xd45e42,transparent:true,opacity:.84,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(x,3.52,z);this.wind.add(ring);this.forceNodes.push(ring);
  }
 }
 // Clone the hierarchy by child index so duplicate GLTF names (rafter.001,
 // beam.003, …) remain paired.  Copying local transforms keeps the heat shell
 // exactly on top of the moving white model during the wind response.
 syncHierarchy(source:T.Object3D,target:T.Object3D){
  target.position.copy(source.position);target.quaternion.copy(source.quaternion);target.scale.copy(source.scale);
  const n=Math.min(source.children.length,target.children.length);
  for(let i=0;i<n;i++)this.syncHierarchy(source.children[i],target.children[i]);
 }
 makeGrain(){const c=document.createElement('canvas');c.width=256;c.height=512;const ctx=c.getContext('2d')!,im=ctx.createImageData(256,512);for(let y=0;y<512;y++)for(let x=0;x<256;x++){const q=226+8*Math.sin(x*.72+2*Math.sin(y*.012))+4*Math.sin(x*2.4+y*.02);const i=(y*256+x)*4;im.data.set([q,q-7,q-15,255],i)}ctx.putImageData(im,0,0);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;}
 opacity(root:T.Object3D,alpha:number){root.visible=alpha>.001;root.traverse(o=>materials(o).forEach(m=>{const base=m.userData.opacity??1;m.transparent=alpha<.999||base<1;m.opacity=base*alpha;m.depthWrite=alpha>.98;m.needsUpdate=false;}));}
 buildBeam(){
  const b=this.beam,N=b.xy.length,positions=new Float32Array(N*6),colors=new Float32Array(N*6),ix:number[]=[];
  b.triangles.forEach(t=>{ix.push(...t,t[2]+N,t[1]+N,t[0]+N)});
  const nx=49,ny=13,edges:number[][]=[];for(let i=0;i<nx-1;i++)edges.push([i,i+1],[(ny-1)*nx+i,(ny-1)*nx+i+1]);for(let j=0;j<ny-1;j++)edges.push([j*nx,(j+1)*nx],[j*nx+nx-1,(j+1)*nx+nx-1]);edges.forEach(([a,c])=>ix.push(a,c,c+N,a,c+N,a+N));
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(positions,3));geo.setAttribute('color',new T.BufferAttribute(colors,3));geo.setIndex(ix);
  this.beamMesh=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.55,side:T.DoubleSide}));this.beamMesh.castShadow=true;this.stress.add(this.beamMesh);
  for(const x of [-2.4,2.4]){const c=new T.Mesh(new T.CylinderGeometry(.16,.25,.32,3),mat(0x657d70));c.position.set(x,1.92,0);c.rotation.y=Math.PI/2;this.stress.add(c);}
  for(let i=0;i<9;i++){const a=new T.ArrowHelper(V(0,-1,0),V(),.65,0xb75c42,.15,.065);this.stress.add(a);this.beamArrows.push(a);}
  [...this.stress.children].forEach(o=>this.stressBeamGroup.add(o));this.stress.add(this.stressBeamGroup);
  this.stressJoint=this.joint.children[0].clone(true);this.stressJoint.position.set(14,0,0);
  this.stressJoint.traverse(o=>{if(o instanceof T.Mesh){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();}});
  this.stress.add(this.stressJoint);
  this.stressContact=box(.045,.60,.60,0xc35a40);this.stressContact.position.set(.025,2.25,0);this.stressJoint.add(this.stressContact);
 }
 buildMoisture(){
  this.sample=box(3.5,1.65,1.35,0xbd8954);(this.sample.material as T.MeshStandardMaterial).map=this.grain;this.sample.position.set(0,2.05,0);this.sample.castShadow=true;this.sample.receiveShadow=true;this.sampleRoot.add(this.sample);
  const data=new Uint8Array(this.wet.nx*this.wet.ny*4);this.wetTex=new T.DataTexture(data,this.wet.nx,this.wet.ny);this.wetTex.colorSpace=T.SRGBColorSpace;this.wetTex.magFilter=T.LinearFilter;this.wetTex.minFilter=T.LinearFilter;
  // A lightly lit material lets the grain remain visible underneath the wet
  // front instead of turning the whole block into a flat cyan card.
  const fm=new T.MeshStandardMaterial({map:this.wetTex,transparent:true,depthWrite:false,side:T.DoubleSide,opacity:.56,roughness:.3,metalness:0});fm.userData.opacity=.56;
  this.wetFace=new T.Mesh(new T.PlaneGeometry(3.5,1.65),fm);this.wetFace.position.set(0,2.05,.684);this.sampleRoot.add(this.wetFace);
  // Perspective cutaway: translucent internal bands make the front-to-back
  // moisture path readable instead of leaving a flat heatmap on the box.
  for(let i=0;i<4;i++){
   const layer=new T.Mesh(new T.PlaneGeometry(3.15,1.35),new T.MeshBasicMaterial({color:0x7bb7b3,transparent:true,opacity:.12,side:T.DoubleSide}));
   // Keep the slices parallel to the front face.  A previous Y rotation made
   // them edge-on, so the depth of the wetting front disappeared in render.
   // Stacking these planes through the timber gives a simple perspective
   // cutaway: the blue front advances toward the dry core as uptake grows.
   layer.position.set(0,2.05,-.42+i*.28);layer.rotation.set(0,0,0);layer.visible=false;this.sampleRoot.add(layer);this.wetLayers.push(layer);
  }
  // Two translucent cutaway faces expose the depth of the wetting front. The
  // side and top planes are intentionally offset by a few millimetres so the
  // camera reads a volume rather than a floating rectangle.
  const cutMat=()=>new T.MeshBasicMaterial({color:0x77aeb0,transparent:true,opacity:.12,side:T.DoubleSide,depthWrite:false});
  this.wetSide=new T.Mesh(new T.PlaneGeometry(1.35,1.65),cutMat());this.wetSide.rotation.y=Math.PI/2;this.wetSide.position.set(1.756,2.05,0);this.sampleRoot.add(this.wetSide);
  this.wetTop=new T.Mesh(new T.PlaneGeometry(3.5,1.35),cutMat());this.wetTop.rotation.x=Math.PI/2;this.wetTop.position.set(0,2.886,0);this.sampleRoot.add(this.wetTop);
  this.dryOutline=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(3.5,1.65,1.35)),new T.LineBasicMaterial({color:0x947654,transparent:true,opacity:.35}));this.dryOutline.position.set(0,2.05,0);this.sampleRoot.add(this.dryOutline);this.moisture.add(this.sampleRoot);
  this.wetJoint=this.joint.children[0].clone(true);
  // The GLB is authored with the working joint offset to the right of its
  // local origin.  Re-center the transparent cutaway so the moisture shot
  // reads as a complete part instead of cropping the tenon at the viewport
  // edge when the camera moves into the joint close-up.
  this.wetJoint.position.x=-.82;
  this.wetJoint.traverse(o=>{if(o instanceof T.Mesh){const cloned=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();const set=(m:T.Material)=>{m.transparent=true;m.opacity=.52;m.userData.opacity=.52;m.depthWrite=false;};Array.isArray(cloned)?cloned.forEach(set):set(cloned);o.material=cloned;}});this.wetTenon=find(this.wetJoint,'tenon');this.moisture.add(this.wetJoint);
  const wm=new T.MeshPhysicalMaterial({color:0xa8d0ce,roughness:.08,metalness:0,transparent:true,opacity:.74,transmission:.38,thickness:.08,clearcoat:1,depthTest:false,depthWrite:false});wm.userData.opacity=.74;
  for(let i=0;i<24;i++){const drop=new T.Mesh(new T.SphereGeometry(.07+(i%3)*.012,10,8),wm.clone());drop.userData.seed=i;drop.scale.set(.72,1.8,.72);this.moisture.add(drop);this.water.push(drop);}
 }
 sampleFlow(x:number,y:number){const f=this.flow,field=f.frames[f.frames.length-1],gx=clamp((x-f.x0)/f.dx/(f.nx-1))*(f.nx-1),gy=clamp(y/f.dx/(f.ny-1))*(f.ny-1);const ix=Math.min(f.nx-2,Math.floor(gx)),iy=Math.min(f.ny-2,Math.floor(gy)),a=gx-ix,b=gy-iy;const sample=(v:number[])=>mix(mix(v[iy*f.nx+ix],v[iy*f.nx+ix+1],a),mix(v[(iy+1)*f.nx+ix],v[(iy+1)*f.nx+ix+1],a),b);return [sample(field.u),sample(field.v)];}
 buildFlow(){
  for(let lane=0;lane<30;lane++){let x=-8.5,y=.65+lane*.23;const z=[-2.15,0,2.15][lane%3],points:T.Vector3[]=[];
   for(let j=0;j<200;j++){points.push(V(x,y,z));const [u,v]=this.sampleFlow(x,y);const speed=Math.hypot(u,v);if(speed<.02||x>8.5||y<.32||y>9)break;x+=u/speed*.09;y+=v/speed*.09;}
   if(points.length<15)continue;
   const curve=new T.CatmullRomCurve3(points,false,'centripetal');this.flowCurves.push(curve);
   const line=new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(100)),new T.LineBasicMaterial({color:0x719890,transparent:true,opacity:.24,depthTest:false}));this.wind.add(line);
   const trail=new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length:12},()=>V())),new T.LineBasicMaterial({color:0x548e89,transparent:true,opacity:.94,depthTest:false}));trail.frustumCulled=false;this.wind.add(trail);this.flowTrails.push(trail);
   const dot=new T.Mesh(new T.SphereGeometry(.036,8,6),new T.MeshBasicMaterial({color:0xb78342}));this.wind.add(dot);this.flowDots.push(dot);
  }
 }
 buildForces(){
  for(const [corner,[x,z]] of [[2,2],[-2,2],[2,-2],[-2,-2]].entries()){
   const points=[V(x*.5,5.02,z*.5),V(x,4.2,z),V(x,3.46,z),V(x,1.85,z),V(x,.10,z)];
   for(let stage=0;stage<4;stage++){
    const curve=new T.CatmullRomCurve3([points[stage],points[stage+1]]);
    const mesh=new T.Mesh(new T.CylinderGeometry(.038,.038,1,8),new T.MeshBasicMaterial({color:0xbd513c,transparent:true,opacity:0,depthTest:false,depthWrite:false}));
    const halo=new T.Mesh(new T.CylinderGeometry(.075,.075,1,8),new T.MeshBasicMaterial({color:0xd7a14b,transparent:true,opacity:0,depthTest:false,depthWrite:false}));
    const dot=new T.Mesh(new T.SphereGeometry(.082,12,8),new T.MeshBasicMaterial({color:0xffe2a0,transparent:true,opacity:0,depthTest:false,depthWrite:false}));
    this.forces.add(halo,mesh,dot);this.pathLines.push({mesh,halo,curve,dot,stage,corner});
   }
  }
 }
 configureForces(s:JoineryState){
  const b=s.line+s.lineProgress,lift=smooth(s.elapsed/2.2);
  this.pathLines.forEach(({mesh,halo,curve,dot,stage,corner},i)=>{
    const [x,z]=[[2,2],[-2,2],[2,-2],[-2,-2]][corner],points=[V(x*.5,5.02+1.15*lift,z*.5),V(x,4.2+.48*lift,z),V(x,3.46,z),V(x,1.85,z),V(x,.10,z)];
   const starts=[1.02,1.40,2.02,2.42],on=smooth((b-starts[stage])/.22),focus=corner===0?1:.20;
    const activeStage=b<1.4?0:b<2?1:b<2.4?2:3,emphasis=stage===activeStage?1:.55;
    const alpha=on*focus,from=points[stage],to=points[stage+1],delta=to.clone().sub(from),length=delta.length();
   curve.points=[from,to];curve.updateArcLengths();
    // The active segment gets a restrained widening so the eye can follow the
    // load hand-off without turning the whole diagram into a bundle of lines.
    for(const tube of [mesh,halo]){tube.visible=alpha>.0001;tube.position.copy(from).lerp(to,.5);tube.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());tube.scale.set(1+.34*emphasis,length,1+.34*emphasis);}
   (mesh.material as T.MeshBasicMaterial).opacity=alpha*emphasis;(halo.material as T.MeshBasicMaterial).opacity=.21*alpha*emphasis;
   (mesh.material as T.MeshBasicMaterial).color.set(stage<2?0xc1503d:0xb77535);
   dot.visible=alpha>.0001;dot.position.copy(curve.getPoint((s.elapsed*.38+i*.13)%1));(dot.material as T.MeshBasicMaterial).opacity=alpha;
  });
 }
 configurePavilion(s:JoineryState){
  const b=s.line+s.lineProgress;
  this.pavilion.position.set(0,0,0);this.pavilion.scale.setScalar(1);this.pavilion.rotation.set(0,0,0);
  this.parts.forEach(o=>{o.position.copy(o.userData.base);o.rotation.copy(o.userData.baseRotation??o.rotation);o.scale.copy(o.userData.baseScale??o.scale);o.visible=true;const n=o.name;let lift=0;
   if(s.scene==='intro'){const open=smooth(s.elapsed/2.6)*(1-smooth((s.elapsed-11)/6));
    // Spread the pavilion into a readable exploded view.  Each family takes
    // a slightly different orbit so the roof, rafters, frame and columns do
    // not collapse into one vertical stack.
    const idx=Math.max(0,Number((n.match(/(\d+)$/)||['0','0'])[1]));
    if(n.includes('roof')){lift=2.65*open;o.position.x+=.16*open;o.position.z+=.12*open;o.rotation.z=.07*open;}
    // The rafter/purlin pack is the other member read as a construction
    // beam in the wide shot.  Pull the pack toward the left in screen space
    // and keep depth fixed; a small lift still reveals the roof layers while
    // avoiding the old rearward fan-out.
    else if(n.includes('rafters')){lift=1.5*open;o.position.x+=-4.2*open;o.position.z=0;o.rotation.z=.025*open;}
    // During the construction reveal, pull bearing beams toward camera-left
    // along one horizontal axis.  Keeping y/z fixed prevents the old
    // rearward drift that made the extraction look like a perspective error.
    else if(n.includes('beam')){lift=0;o.position.x+=(-2.05+(idx-1.5)*.22)*open;o.rotation.y=(idx%2?.025:-.025)*open;}
    // The low rail enters as a sliding frame at its final floor height; it
    // should never rise vertically into place.
    else if(n.includes('rails')){lift=0;o.position.x+=-2.35*open;o.rotation.y=.018*open;}
    else if(n.includes('column')){const k=idx%4;o.position.x+=(k%2===0?-.68:.68)*open;o.position.z+=(k<2?.72:-.72)*open;o.position.y-=.12*open;o.rotation.z=(k%2?.04:-.04)*open;}}
   if(s.scene==='assembly'){
    const start=n.includes('column')?.5:n.includes('beam')?1.8:n.includes('rafters')?3.1:n.includes('roof')?3.5:n.includes('rails')?3.8:0;
    const q=smooth((b-start)/.8);o.visible=true;
    // Install the railing by sliding it in from the left while all other
    // families retain their vertical assembly lift.
    if(n.includes('rails')){lift=0;o.position.x=-5.8*(1-q);o.rotation.y=.012*(1-q);}
    else lift=n.includes('base')?0:(1-q)*20;
   }
   if(s.scene==='load')lift=(n.includes('roof')?1.15:n.includes('rafters')?.48:0)*smooth(s.elapsed/2.2);
   if(s.scene==='repair'){const q=smooth((b-.7)/.7);lift=(n.includes('roof')?2:n.includes('rafters')?1.1:0)*q;if(n==='stage_beam_0')o.position.x=2.4*smooth((b-2.1)/.9)*(1-smooth((b-3.4)/.6));}
   if(s.scene==='return')lift=(n.includes('roof')?1.6:n.includes('rafters')?.8:0)*(1-smooth(s.elapsed/3));
   if(s.scene==='wind'){const sway=.075*(.45+.55*smooth(s.elapsed/3))*Math.sin(s.elapsed*.9)*Math.sin(Math.PI*s.progress);const h=n.includes('roof')?5:n.includes('rafters')?4:n.includes('beam')?3.4:n.includes('column')?1.8:0;o.position.x=sway*h/5;}
   o.position.y+=lift;
  });
  if(s.scene==='references'){const q=smooth(s.elapsed/1.2);this.pavilion.position.x=-1.5*q;this.pavilion.scale.setScalar(1-.12*q);}
 }
 configureJoint(s:JoineryState){
  const b=s.line+s.lineProgress;
  this.tenon.position.set(1.7*(1-smooth((b-1.5)/1.3))+1.7*smooth((b-5)/.85),0,0);this.tenon.scale.set(1,1,1);this.tenon.rotation.set(0,0,0);
  const cut=s.line===4?1:0;this.mortise.traverse(o=>materials(o).forEach(m=>{m.clippingPlanes=cut?[new T.Plane(V(0,0,-1),.06)]:[]}));
  // The insertion beat is a short, legible close-up: arrow points toward the
  // socket while the contact pad glows only after the tenon has seated.
   // The second narration line names the protruding tenon. Keep the close-up
   // on screen for that sentence so the camera move and the highlighted part
   // refer to the same object.
   const convexA=s.scene==='straight'&&s.line===1?smooth(clamp((s.lineProgress-.04)/.16))*(1-smooth(clamp((s.lineProgress-.82)/.20))):0;
  const insertA=s.line===4?smooth(clamp(s.lineProgress/.32))*(1-smooth(clamp((s.lineProgress-.72)/.28))):convexA;
  this.arrowVisual(this.jointArrow,insertA);
  const resistA=s.line===4?smooth(clamp((s.lineProgress-.28)/.22))*(1-smooth(clamp((s.lineProgress-.82)/.18))):0;
  this.arrowVisual(this.jointResistArrow,resistA);
  this.contact.visible=s.line===4&&s.lineProgress>.66;this.contact.scale.setScalar(.88+.12*insertA);
 }
 arrowVisual(a:T.ArrowHelper,alpha:number){
  a.visible=alpha>.002;a.scale.setScalar(.84+.16*alpha);
  const mats=[a.line.material,a.cone.material] as T.Material[];
  mats.forEach(m=>{m.transparent=true;m.opacity=alpha;m.depthTest=false;m.depthWrite=false;m.needsUpdate=true;});
 }
 configureVariant(root:T.Group,moving:T.Object3D,s:JoineryState){
  const b=s.line+s.lineProgress;moving.position.set(0,0,0);root.position.set(0,0,0);root.scale.setScalar(1);if(root===this.peg&&this.pegPin){this.pegPin.visible=true;this.pegPin.position.set(0,0,0);}
  if(s.scene==='dovetail'){
   // In the GLB the fixed board ends at x=0 and the dovetail tail starts at
   // x=-.8 on the moving board.  x=.95 therefore leaves a .15-unit air gap
   // before the lift (the previous .42 value was already inside the socket).
   // Approach at base height, rise above the .55-unit timber thickness,
   // translate over the socket while raised, then lower into the seat.
   const slideIn=smooth((b-.15)/.95),lift=smooth((b-1.05)/.42),align=smooth((b-1.48)/.52),drop=smooth((b-1.98)/.55);
   const exitLift=smooth((b-4.22)/.55),exitSlide=smooth((b-4.78)/.72);
   const approachX=2.8*(1-slideIn)+.95*slideIn;
   const seatedX=.95*(1-align);
   const xIn=approachX*(1-align)+seatedX*align;
   const yIn=.95*lift*(1-drop);
   // Reverse order: lift clear first, then slide to the safe gap and leave
   // screen right.  x/y never change together during the collision-prone
   // portion of the demonstration.
   moving.position.x=xIn*(1-exitSlide)+(.95+1.85*exitSlide)*exitSlide;
   moving.position.y=yIn+.95*exitLift;
   // Explain the drawer pull at the moment the joint is seated.  The red
   // vector is the attempted pull-out; the teal vector is the opposing face
   // reaction.  Both hand off smoothly with the narration and disappear
   // before the next joinery variant enters.
   const pullA=s.line===3?smooth(clamp((s.lineProgress-.08)/.22))*(1-smooth(clamp((s.lineProgress-.86)/.18))):0;
   const blockA=s.line===3?smooth(clamp((s.lineProgress-.30)/.22))*(1-smooth(clamp((s.lineProgress-.90)/.16))):0;
   this.arrowVisual(this.doveArrow,pullA);this.arrowVisual(this.doveResistArrow,blockA);
  }
  // Half-lap now has a complete service cycle: approach from above, seat
  // flush, pause, then lift and slide the upper member away so the two half
  // depth notches are unambiguous in the cutaway view.
  if(s.scene==='lap'){
    const approach=smooth((b-.18)/.68),seat=smooth((b-1.04)/.82),remove=smooth((b-2.10)/.36),slide=smooth((b-2.56)/.44);
   // The upper member starts visibly above the lower one, drops into the
   // half-depth notch, then lifts before sliding away for the cutaway view.
    moving.position.y=1.32*(1-seat)+1.38*remove;
    // Start visibly offset from the fixed lower member, then bring the upper
    // member over the notch before seating. This makes the two authored parts
    // read as separate pieces even on the first frame of the chapter.
    moving.position.x=-1.15*(1-approach)+2.9*slide;
    moving.position.z=.62*(1-approach)+.25*slide;
   // Downward seating and the equal/opposite upward extraction are shown as
   // separate arrows.  Their short overlap makes the half-depth notch read as
   // an actual mechanical interface rather than one fused mesh.
   const seatA=smooth((b-1.02)/.22)*(1-smooth((b-1.85)/.15));
   const removeA=smooth(clamp((b-2.02)/.22))*(1-smooth(clamp((b-2.9)/.28)));
   this.arrowVisual(this.lapArrow,seatA);this.arrowVisual(this.lapResistArrow,removeA);
  }
  if(s.scene==='pin'){
   const enter=smooth((b-.85)/.85),withdraw=smooth((b-3.0)/.75),beamExit=smooth((b-3.9)/.65);
   // The pin is visible from the first frame at a safe near-side z=1.8. It
   // enters through both holes, withdraws completely, and only then lets the
   // beam move away; this removes both the spawn pop and the old穿模 exit.
   moving.position.x=3.6*beamExit;this.pegPin.visible=true;
   // The pin starts on the near side, travels through both holes, pauses in
   // the joint, then comes all the way back out before the beam is released.
   const pinZ=withdraw>0?1.8*withdraw:1.8*(1-enter);
   this.pegPin.position.set(0,0,pinZ);
   const enterA=smooth(clamp((b-.72)/.24))*(1-smooth(clamp((b-1.72)/.22)));
   const pullA=smooth((b-2.02)/.22)*(1-smooth((b-2.85)/.15));
   const withdrawing=smooth((b-3.03)/.15)*(1-smooth((b-3.74)/.15));
   this.pegArrow.setDirection(V(0,0,b>=3?1:-1));this.pegArrow.position.set(-.6,2.66,b>=3?.65:2.85);
   this.arrowVisual(this.pegArrow,Math.max(enterA,withdrawing));this.arrowVisual(this.pegResistArrow,pullA);
   const cut=smooth((b-2.05)/.25)*(1-smooth((b-2.72)/.28));this.pegPost.traverse(o=>materials(o).forEach(m=>{m.transparent=cut>.001;m.opacity=1-.66*cut;m.depthWrite=cut<.01;}));
  }
  // Other joinery variants should never leave a previous beat's overlay in
  // the scene while their root is being handed off.
  if(root===this.dovetail&&s.scene!=='dovetail'){this.arrowVisual(this.doveArrow,0);this.arrowVisual(this.doveResistArrow,0);}
  if(root===this.lap&&s.scene!=='lap'){this.arrowVisual(this.lapArrow,0);this.arrowVisual(this.lapResistArrow,0);}
  if(root===this.peg&&s.scene!=='pin'){this.arrowVisual(this.pegArrow,0);this.arrowVisual(this.pegResistArrow,0);}
 }
 configureBeam(s:JoineryState){
  const b=this.beam,N=b.xy.length,q=smooth((s.line+s.lineProgress-1)/1.2),heat=smooth((s.line+s.lineProgress-2.6)/.7),pos=this.beamMesh.geometry.attributes.position as T.BufferAttribute,col=this.beamMesh.geometry.attributes.color as T.BufferAttribute;
  const beat=s.line+s.lineProgress,swap=smooth((beat-4.05)/.8);this.stressBeamGroup.position.x=-14*swap;this.stressJoint.position.x=-.82+14*(1-swap);
  this.stressJoint.traverse(o=>{if(o.name.toLowerCase().includes("mortise"))materials(o).forEach(m=>{m.transparent=true;m.opacity=.52;m.depthWrite=false;});});
  const contact=this.stressContact.material as T.MeshStandardMaterial;contact.transparent=true;contact.opacity=.22+.2*Math.sin(s.elapsed*1.5)**2;
  const base=new T.Color(0xc89a63),cold=new T.Color(0x327f85),hot=new T.Color(0xc76143),neutral=new T.Color(0xe8d7b6);
  for(let layer=0;layer<2;layer++)for(let i=0;i<N;i++){const [x,y]=b.xy[i],[ux,uy]=b.displacement[i];pos.setXYZ(layer*N+i,x-b.length/2+ux*b.displayGain*q,y+2.1+uy*b.displayGain*q,layer===0?.34:-.34);const value=Math.max(-1,Math.min(1,b.sigmaX[i]/(b.maxStress*.75)));const color=neutral.clone().lerp(value<0?cold:hot,Math.abs(value)).lerp(base,1-heat);col.setXYZ(layer*N+i,color.r,color.g,color.b);}
  pos.needsUpdate=true;col.needsUpdate=true;this.beamMesh.geometry.computeVertexNormals();
  this.beamArrows.forEach((a,i)=>{const node=(13-1)*49+Math.round(i*48/8);this.arrowVisual(a,smooth((s.line+s.lineProgress-1)/.45));const x=b.xy[node][0]-2.4,y=2.1+.7+b.displacement[node][1]*b.displayGain*q;a.position.set(x,y+.68,0);a.setLength(.65,.14,.06)});
 }
 configureMoisture(s:JoineryState){
  const beat=s.line+s.lineProgress,q=.4*smooth((beat-1.9)/2.7),idx=q*(this.wet.frames.length-1),a=Math.floor(idx),c=Math.min(this.wet.frames.length-1,a+1),f=idx-a;
  const bytes=this.wetTex.image.data as Uint8Array,dry=new T.Color(0xd8b17e),wet=new T.Color(0x438e96);
  for(let i=0;i<this.wet.nx*this.wet.ny;i++){
   const value=mix(this.wet.frames[a][i],this.wet.frames[c][i],f),color=dry.clone().lerp(wet,value).convertLinearToSRGB(),k=i*4;
   bytes[k]=color.r*255;bytes[k+1]=color.g*255;bytes[k+2]=color.b*255;bytes[k+3]=235;
  }
  this.wetTex.needsUpdate=true;
  const uptake=mix(this.wet.meanUptake[a],this.wet.meanUptake[c],f),cut=smooth((beat-2.7)/.55),handoff=smooth((beat-4.65)/.65);
  // Both study objects stay intact as the camera tracks between them.  The
  // blue map belongs to the sample and leaves with it, so it never becomes
  // a floating card underneath the wet joint.
   this.sampleRoot.visible=true;this.sampleRoot.position.set(-14*handoff,-.123*uptake,0);
  this.sampleRoot.scale.set(1+.10*uptake,1+.06*uptake,1+.004*uptake);
  const sm=this.sample.material as T.MeshStandardMaterial;sm.transparent=cut>.001;sm.opacity=1-.38*cut;sm.depthWrite=cut<.01;
  this.wetFace.visible=true;(this.wetFace.material as T.MeshStandardMaterial).opacity=.04+.43*cut;
  this.dryOutline.visible=true;(this.dryOutline.material as T.LineBasicMaterial).opacity=.65*cut;this.dryOutline.scale.set(1/(1+.10*uptake),1/(1+.06*uptake),1/(1+.004*uptake));
  this.wetSide.visible=true;this.wetTop.visible=true;
  (this.wetSide.material as T.MeshBasicMaterial).opacity=.12*cut;(this.wetTop.material as T.MeshBasicMaterial).opacity=.09*cut;
  this.wetLayers.forEach((o,i)=>{o.visible=true;o.position.z=-.48+i*.28;o.scale.set(1,1,1);(o.material as T.MeshBasicMaterial).opacity=cut*(.025+.045*uptake)*(1-i*.12);});
   // Keep the complete transparent joint alive while the camera hands off
   // from the sample. A material fade is used for depth cues; visibility is
   // never toggled at the seam, which prevents a shadow-only flash.
   this.wetJoint.visible=true;this.wetJoint.position.set(-.82+14*(1-handoff),0,0);
  this.wetJoint.traverse(o=>{materials(o).forEach(m=>{m.transparent=true;m.opacity=o.name.toLowerCase().includes('mortise')?.38:.92;m.depthWrite=false;});});
  const tighten=smooth((beat-4.95)/.35)*(1-smooth((beat-5.48)/.45));
  this.wetTenon.scale.set(1,1+.06*tighten,1+.075*tighten);
  this.water.forEach((o,i)=>{const rainA=smooth((beat-1.65)/.4)*(1-smooth((beat-3.55)/.45)),t=(s.elapsed*.47+i*.173)%1;
   o.visible=true;o.position.set(-1.48+(i%7)*.49-14*handoff,4.05-1.25*t,.15+.11*(i%4));
   const life=Math.sin(Math.PI*t);o.scale.set(.52,.9+.6*(1-t),.52);o.rotation.z=.05*Math.sin(i*1.7);
   const m=o.material as T.MeshPhysicalMaterial;m.opacity=.76*rainA*life;m.depthTest=true;m.depthWrite=false;
  });
 }
 which(scene:string){if(['intro','assembly','load','wind','repair','return','references'].includes(scene))return this.pavilion;if(scene==='straight')return this.joint;if(scene==='dovetail')return this.dovetail;if(scene==='lap')return this.lap;if(scene==='pin')return this.peg;if(scene==='stress')return this.stress;return this.moisture;}
 orbit(cam:T.Vector3,look:T.Vector3,angle:number,anchor=V(0,2.2,0)){
  if(Math.abs(angle)<1e-4)return;
  const axis=V(0,1,0),c=cam.clone().sub(anchor).applyAxisAngle(axis,angle),l=look.clone().sub(anchor).applyAxisAngle(axis,angle);
  cam.copy(anchor).add(c);look.copy(anchor).add(l);
 }
 pose(scene:string,progress:number,beat:number){
  let cam=V(10,7.5,12),look=V(-1.3,2.6,0);const p=smooth(progress);
  if(['intro','assembly','repair'].includes(scene)){cam.set(12,9,14);look.set(-1.45,3,0);}
  if(scene==='intro'){cam.applyAxisAngle(V(0,1,0),-.2+.4*p);this.orbit(cam,look,.16*Math.sin(Math.PI*p),V(0,2.3,0));}
   if(scene==='straight'){
   cam.set(mix(5.5,4.5,p),mix(5.0,4.5,p),mix(11.7,10.7,p));look.set(.3,2.8,0);
   // The tenon beat gets a deliberate leftward camera sweep and a short
   // push-in.  It then returns to the normal three-quarter view before the
   // next sentence, so the motion feels motivated rather than decorative.
    const focus=smooth(clamp((beat-.92)/.18))*(1-smooth(clamp((beat-1.72)/.22)));
   const focusLook=V(1.42,2.28,.12),normalLook=look.clone();look.lerpVectors(normalLook,focusLook,focus);
    cam.lerp(anchorTo(focusLook,cam,.72),focus);this.orbit(cam,look,.34*Math.sin(Math.PI*p)-1.12*focus,V(0,2.25,0));
  }
  if(scene==='dovetail'){cam.set(mix(4.2,2.6,p),mix(5.8,5.15,p),7.8);look.set(mix(-.35,-.7,p),2.05,0);this.orbit(cam,look,.24*Math.sin(Math.PI*p),V(0,2.1,0));}
  if(scene==='lap'){cam.set(mix(5.2,2.2,p),mix(7.2,5.8,p),10.8);look.set(mix(.25,.05,p),2.85,0);this.orbit(cam,look,-.46*Math.sin(Math.PI*p),V(0,2.1,0));}
  if(scene==='pin'){
   cam.set(mix(5.4,3.5,p),4.6,11.3);look.set(.15,2.65,0);
   const pinFocus=smooth(clamp((beat-1.55)/.24))*(1-smooth(clamp((beat-3.72)/.28)));
   const pinLook=V(-.55,2.66,.12);look.lerp(pinLook,pinFocus);this.orbit(cam,look,.42*Math.sin(Math.PI*p)+.22*pinFocus,V(0,2.35,0));
  }
  if(scene==='load'){
   const keys=[
    {b:0,c:V(11,9,15),l:V(-.9,3.6,0)},
    {b:1.4,c:V(8.4,8.8,11.6),l:V(.9,5.5,1)},
    {b:2,c:V(7.8,6.5,11),l:V(1.5,3.65,1.7)},
    {b:2.95,c:V(7,4.2,10),l:V(1.7,1.45,1.8)},
    {b:3.6,c:V(10.5,8.3,15),l:V(-.6,3.5,0)}
   ];
   const k=keys.findIndex((v,i)=>i<keys.length-1&&beat<keys[i+1].b),a=keys[k<0?keys.length-1:k],n=keys[Math.min(keys.length-1,(k<0?keys.length-1:k)+1)],t=a===n?0:smooth((beat-a.b)/(n.b-a.b));
   cam.lerpVectors(a.c,n.c,t);look.lerpVectors(a.l,n.l,t);this.orbit(cam,look,.24*Math.sin(Math.PI*p),V(0,2.5,0));
  }
  if(scene==='stress'){cam.set(mix(3.5,1.8,p),mix(4.2,3.6,p),mix(10.2,8.4,p));look.set(mix(-.8,.05,p),2.3,0);this.orbit(cam,look,.36*Math.sin(Math.PI*p),V(0,2.1,0));}
  if(scene==='wind'){cam.set(mix(9.2,3.0,p),mix(7.2,5.4,p),mix(16.2,11.8,p));look.set(mix(-.7,-.1,p),2.8,0);this.orbit(cam,look,.48*Math.sin(Math.PI*p),V(0,2.4,0));}
  if(scene==='moisture'){cam.set(mix(3.0,4.6,p),mix(4.8,4.3,p),mix(11.4,10.8,p));look.set(mix(-.1,.05,p),2.65,0);this.orbit(cam,look,-.4*Math.sin(Math.PI*p),V(0,2.1,0));}
  if(scene==='return'){cam.set(mix(11,9.5,p),mix(8,6.4,p),12.5);look.set(-1.3,2.4,0);this.orbit(cam,look,.24*Math.sin(Math.PI*p),V(0,2.4,0));}
  if(scene==='references'){cam.set(10,7.8,15);look.set(0,3.0,0);}
  return {cam,look};
 }
 render(s:JoineryState){
  if(!this.tenon)return;
  const current=this.which(s.scene),previous=s.previous?this.which(s.previous):current,transition=smooth(s.elapsed/1.4),sameRoot=current===previous;
  const previousScene=timeline.scenes.find(x=>x.id===s.previous),pc=timeline.clips.filter(x=>x.scene===s.previous).at(-1);
  const lastFrame=previousScene?previousScene.end-1:0;
  const old:JoineryState={scene:s.previous??s.scene,progress:previousScene?(lastFrame-previousScene.start)/(previousScene.end-previousScene.start):0,line:pc?.line??0,lineProgress:pc?clamp((lastFrame-pc.start)/pc.duration):0,time:lastFrame/30,elapsed:previousScene?(lastFrame-previousScene.start)/30:0};
  const stateFor=(r:T.Group)=>r===current?s:old;
  this.roots.forEach(r=>{r.visible=false;r.position.set(0,0,0);r.rotation.set(0,0,0);r.scale.setScalar(1);});
  // A shared pavilion is one continuous object.  Interpolate its exact
  // previous end pose, deterministically, even when rendering frames out of
  // order.  No captured history or clone replacement at the chapter seam.
  let oldParts:{p:T.Vector3;q:T.Quaternion;s:T.Vector3}[]|undefined;
  if(sameRoot&&s.previous&&current===this.pavilion&&transition<1){
   this.configurePavilion(old);oldParts=this.parts.map(o=>({p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}));
  }
  this.configurePavilion(stateFor(this.pavilion));
  if(oldParts)this.parts.forEach((o,i)=>{o.position.lerpVectors(oldParts![i].p,o.position,transition);o.quaternion.slerpQuaternions(oldParts![i].q,o.quaternion,transition);o.scale.lerpVectors(oldParts![i].s,o.scale,transition);});
  this.configureJoint(stateFor(this.joint));
  this.configureVariant(this.dovetail,this.doveMoving,stateFor(this.dovetail));this.configureVariant(this.lap,this.lapMoving,stateFor(this.lap));this.configureVariant(this.peg,this.pegMoving,stateFor(this.peg));
  this.configureBeam(stateFor(this.stress));this.configureMoisture(stateFor(this.moisture));
  const now=this.pose(s.scene,s.progress,s.line+s.lineProgress);
  if(s.previous&&transition<1){const before=this.pose(old.scene,old.progress,old.line+old.lineProgress);now.cam.lerpVectors(before.cam,now.cam,transition);now.look.lerpVectors(before.look,now.look,transition);}
  this.camera.position.copy(now.cam);this.camera.lookAt(now.look);this.camera.updateMatrixWorld(true);
  current.visible=true;
  const right=V(1,0,0).applyQuaternion(this.camera.quaternion);
  const shift=(root:T.Object3D,amount:number)=>{
   root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(root),radius=Math.min(9,bounds.getSize(V()).length()/2),center=bounds.getCenter(V());
   const distance=now.cam.distanceTo(center),halfWidth=(distance+radius)*Math.tan(T.MathUtils.degToRad(this.camera.fov/2))*this.camera.aspect;
   root.position.addScaledVector(right,amount*(halfWidth+radius+3));
  };
  if(s.previous&&transition<1&&!sameRoot){previous.visible=true;shift(previous,-transition);shift(current,1-transition);}
  const owns=(scene:string)=>s.scene===scene||(s.previous===scene&&transition<1);
  const effectState=(scene:string)=>s.scene===scene?s:old;
  // Every explanatory layer rides with its actual outgoing or incoming
  // model until that whole assembly is outside the camera frustum.
  this.forces.visible=owns('load');this.forces.position.copy(this.pavilion.position);this.forces.quaternion.copy(this.pavilion.quaternion);this.forces.scale.copy(this.pavilion.scale);
  if(this.forces.visible)this.configureForces(effectState('load'));
  this.wind.visible=owns('wind');this.wind.position.copy(this.pavilion.position);this.wind.quaternion.copy(this.pavilion.quaternion);this.wind.scale.copy(this.pavilion.scale);
  this.windResponse.position.set(0,0,0);this.windResponse.rotation.set(0,0,0);this.windResponse.scale.setScalar(1);
  if(this.wind.visible){
   const ws=effectState('wind');
   for(const clone of [this.windModel,this.windShell,this.windHeatModel])this.syncHierarchy(this.pavilion.children[0],clone);
   this.windHeat.position.set(0,0,0);this.windHeat.rotation.set(0,0,0);
   const pulse=.78+.12*(.5+.5*Math.sin(ws.elapsed*2.2));
   this.windHeat.traverse(o=>{if(o instanceof T.Mesh)(o.material as T.MeshBasicMaterial).opacity=o.userData.isFoundation?0:pulse;});
   this.flowCurves.forEach((c,i)=>{const phase=(ws.elapsed*.13+i*.173)%1;this.flowDots[i].position.copy(c.getPoint(phase));const p=this.flowTrails[i].geometry.attributes.position as T.BufferAttribute;for(let k=0;k<12;k++){const v=c.getPoint(clamp(phase-k*.0035));p.setXYZ(k,v.x,v.y,v.z)}p.needsUpdate=true;this.flowTrails[i].geometry.computeBoundingSphere();});
  }
  this.forceNodes.forEach(o=>o.visible=false);
  this.supports.visible=owns('repair');this.supports.position.copy(this.pavilion.position);this.supports.quaternion.copy(this.pavilion.quaternion);
  if(this.supports.visible){const rs=effectState('repair'),arrival=smooth((rs.line+rs.lineProgress-.8)/.7);this.supports.position.y-=10*(1-arrival);if(s.previous==='repair'&&s.scene!=='repair')shift(this.supports,-transition);}
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});this.grain.dispose();this.wetTex?.dispose();this.env.dispose();this.renderer.dispose();this.renderer.forceContextLoss();}
}

