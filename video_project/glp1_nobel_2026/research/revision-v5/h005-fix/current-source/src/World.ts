import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import manifest from '../public/models/manifest.json';
import {C,V,mat,ball,tube,visibility,smooth,Timeline,FrameState,Label,clamp} from './visual';
import {IntestinalDetail,BetaCellDetail,BrainCircuit} from './Details';
import {MolecularDetail} from './MolecularDetail';
import {DrugDetail} from './DrugDetail';
import {CameraPath} from './CameraPath';
import {MealScene} from './MealScene';
import {IsletDetail} from './IsletDetail';
import {SCALE,BETA_RECEPTOR} from './Scale';
import {AnatomicalRoutes} from './AnatomicalRoutes';
import {pancreaticTissue,plasmaContext,intestinalTissue} from './ScaleContext';

type Flow={root:T.Group;curve:T.CatmullRomCurve3;dots:T.Mesh[];kind:string};
export type WorldCamera={sample:(frame:number)=>{position:T.Vector3;target:T.Vector3;distance:number};apply:(frame:number,camera:T.PerspectiveCamera)=>{position:T.Vector3;target:T.Vector3;distance:number}};
export type WorldCameraFactory=(anchors:Record<string,T.Vector3>,timeline:Timeline)=>WorldCamera;
export class World{
 root=new T.Group();organs:Record<string,T.Group>={};anchors:Record<string,T.Vector3>={};
 islet=new IsletDetail();intestinal=new IntestinalDetail();beta=new BetaCellDetail();circuit=new BrainCircuit();
 receptor:MolecularDetail;drug:DrugDetail;cameraPath:WorldCamera;
 gutContext=intestinalTissue();tissueContext=pancreaticTissue();bloodContext=plasmaContext();
 routes?:AnatomicalRoutes;
 ready:Promise<void>; membranePatch=new T.Group();flows:Flow[]=[];mealScene:MealScene;meal:T.Group;stomachFood:T.Mesh[]=[];
 environment:T.WebGLRenderTarget;floor:T.Mesh;protected lastState?:FrameState;private gastricPath?:T.CatmullRomCurve3;protected gastricPoints:T.Vector3[]=[];
 private layerWeights={islet:0,gut:0,beta:0,receptor:0,circuit:0,drug:0};
 constructor(public scene:T.Scene,public camera:T.PerspectiveCamera,public renderer:T.WebGLRenderer,public base:string,public tl:Timeline,protected cameraFactory:WorldCameraFactory=(a,t)=>new CameraPath(a,t)){
  scene.background=new T.Color(C.paper);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.97;scene.environmentIntensity=.48;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const pmrem=new T.PMREMGenerator(renderer);const room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04);scene.environment=this.environment.texture;room.dispose();pmrem.dispose();
  const ambient=new T.HemisphereLight('#fff8ed','#80969b',.85);const key=new T.DirectionalLight('#fff8ee',2.0);key.position.set(-2,4,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-1;key.shadow.camera.right=1;key.shadow.camera.top=2;key.shadow.camera.bottom=-.5;key.shadow.bias=-.0001;key.shadow.normalBias=.002;key.shadow.radius=4;const rim=new T.DirectionalLight('#d3efed',1.0);rim.position.set(3,2,-1);this.root.add(ambient,key,rim);scene.add(this.root);
  for(const [name,data] of Object.entries(manifest.assets))this.anchors[name]=new T.Vector3(...data.center as [number,number,number]);
  this.anchors.meal=V(.07,1.015,.44);
  this.anchors.intestinal=this.anchors.small_intestine.clone().add(V(.035,.02,.04));
  this.anchors.islet=this.anchors.pancreas.clone();
  this.anchors.beta=this.anchors.islet.clone().addScaledVector(this.islet.selected,SCALE.isletRadius);
  this.anchors.receptor=this.anchors.beta.clone().addScaledVector(V(...BETA_RECEPTOR),SCALE.betaUnit);
  this.anchors.secretion=this.anchors.beta.clone().addScaledVector(V(1.0946,-.0657,.60),SCALE.betaUnit);
  this.anchors.circuit=this.anchors.brain.clone().add(V(.005,-.02,.040));
  this.anchors.drug=this.anchors.liver.clone().add(V(.025,-.023,.09));
  this.intestinal.root.position.copy(this.anchors.intestinal);this.intestinal.root.scale.setScalar(SCALE.epithelialUnit);
  this.beta.root.position.copy(this.anchors.beta);this.beta.root.scale.setScalar(SCALE.betaUnit);
  this.circuit.root.position.copy(this.anchors.circuit);this.circuit.root.scale.setScalar(SCALE.neuronUnit);
  this.receptor=new MolecularDetail(base);this.receptor.root.position.copy(this.anchors.receptor);this.receptor.root.scale.setScalar(SCALE.receptorUnit);
  this.receptor.root.quaternion.setFromUnitVectors(V(0,1,0),V(...BETA_RECEPTOR).normalize());
  for(const y of [-2.5e-9,2.5e-9]){const patch=new T.Mesh(new T.RingGeometry(13e-9,1.3e-6,96),mat('#bccac0',.22,.62));patch.rotation.x=-Math.PI/2;patch.position.y=y;(patch.material as T.MeshStandardMaterial).side=T.DoubleSide;this.membranePatch.add(patch);}
  this.membranePatch.position.copy(this.anchors.receptor);this.membranePatch.quaternion.copy(this.receptor.root.quaternion);this.root.add(this.membranePatch);
  this.drug=new DrugDetail();this.drug.root.position.copy(this.anchors.drug);this.drug.root.scale.setScalar(2.2e-9);
  this.root.add(this.gutContext,this.tissueContext,this.bloodContext,this.islet.root,this.intestinal.root,this.beta.root,this.circuit.root,this.receptor.root,this.drug.root);
  this.cameraPath=this.cameraFactory(this.anchors,tl);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const ctx=shadowCanvas.getContext('2d')!;const grad=ctx.createRadialGradient(64,64,0,64,64,62);grad.addColorStop(0,'rgba(53,71,65,.22)');grad.addColorStop(1,'rgba(53,71,65,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);
  this.floor=new T.Mesh(new T.PlaneGeometry(1.3,.8),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));this.floor.rotation.x=-Math.PI/2;this.floor.position.y=.002;this.root.add(this.floor);
  this.mealScene=new MealScene(base);this.meal=this.mealScene.root;this.root.add(this.meal);
  for(let i=0;i<36;i++){const nutrient=ball(.0016,i%4===0?C.gold:'#e6bc72');this.stomachFood.push(nutrient);this.root.add(nutrient);}

  const loader=new GLTFLoader();
  const palette:Record<string,string>={body:'#d6c3b1',stomach:'#c6857c',esophagus:'#c68b7c',small_intestine:'#c59181',pancreas:'#d9b975',liver:'#aa645f',brain:'#cc9a94',heart:'#ac5955',aorta:'#b85c56',veins:'#799baf',pancreatic_ducts:'#ddc68d',brainstem:'#b79886',pancreatic_arteries:'#b85c56',portal_tributaries:'#799baf'};
  this.ready=Promise.all(Object.entries(manifest.assets).filter(([k])=>k!=='skin').map(async([name,asset])=>{
   const gltf=await loader.loadAsync(base+asset.path);const obj=gltf.scene;
   const skinDepth:T.Mesh[]=[];
   if(name==='brain'){const overlap=new Set(manifest.assets.brainstem.sourceIDs);obj.traverse(o=>{if(o instanceof T.Mesh&&overlap.has(o.name.split('_')[0]))o.userData.duplicateBrainstem=true;});}
   obj.traverse(n=>{if(n instanceof T.Mesh){n.material=mat(palette[name]??C.rose,1,name==='body'?.61:.38);n.material.side=name==='body'||name==='brain'?T.FrontSide:T.DoubleSide;n.frustumCulled=true;n.geometry.computeVertexNormals();
    if(name==='body'||name==='brain'){
     // Resolve the nearest skin surface before blending it over the organs.
     // Triangle-order blending otherwise reveals the far side as jagged patches.
     const depth=new T.Mesh(n.geometry,new T.MeshBasicMaterial({colorWrite:false,depthWrite:true,transparent:true,side:T.FrontSide}));
     depth.position.copy(n.position);depth.quaternion.copy(n.quaternion);depth.scale.copy(n.scale);
     depth.renderOrder=name==='brain'?80:100;depth.userData.skinDepth=true;depth.userData.duplicateBrainstem=n.userData.duplicateBrainstem;skinDepth.push(depth);
     n.renderOrder=name==='brain'?81:101;n.userData.skinSurface=true;
    }
   }});
   for(const depth of skinDepth)obj.add(depth);
   this.organs[name]=obj;this.root.add(obj);
  }).concat([this.receptor.ready,this.mealScene.ready,AnatomicalRoutes.load(base+'models/anatomical-routes.json').then(routes=>{this.routes=routes;this.root.add(routes.root);})] as any)).then(()=>{
   this.scene.updateMatrixWorld(true);
   this.root.userData.surfaceHighlightsAttached=this.routes!.attachSurfaceHighlights(this.root);
   // Target a real anterior tissue surface, rather than an arbitrary offset
   // from the organ's bounding-box centre (which can lie outside the tissue).
   const tissue=(name:string,dx=0,dy=0)=>{
    const object=this.organs[name],box=new T.Box3().setFromObject(object),center=box.getCenter(V()),size=box.getSize(V());
    const ray=new T.Raycaster();
    for(const offset of [V(dx,dy,0),V(),V(size.x*.15,0,0),V(-size.x*.15,0,0)]){
     ray.set(center.clone().add(offset).setZ(box.max.z+.08),V(0,0,-1));
     const hit=ray.intersectObject(object,true)[0];
     if(hit)return hit.point.clone().add(V(0,0,-.0015));
    }
    return center;
   };
   this.anchors.intestinal=tissue('small_intestine',.022,-.012);
   this.anchors.islet=tissue('pancreas',.02,.006);
   this.islet.root.position.copy(this.anchors.islet);this.tissueContext.position.copy(this.anchors.islet);this.bloodContext.position.copy(this.anchors.drug);
   this.anchors.beta=this.anchors.islet.clone().addScaledVector(this.islet.selected,SCALE.isletRadius);
   this.anchors.circuit=tissue('brain',0,.014);
   this.anchors.receptor=this.anchors.beta.clone().addScaledVector(V(...BETA_RECEPTOR),SCALE.betaUnit);
  this.anchors.secretion=this.anchors.beta.clone().addScaledVector(V(1.0946,-.0657,.60),SCALE.betaUnit);
   this.intestinal.root.position.copy(this.anchors.intestinal);this.gutContext.position.copy(this.anchors.intestinal);this.beta.root.position.copy(this.anchors.beta);
   this.circuit.root.position.copy(this.anchors.circuit);this.receptor.root.position.copy(this.anchors.receptor);this.membranePatch.position.copy(this.anchors.receptor);
   // A local circulation schematic inside a measured safe cavity region.
   // Per-point projection into a thin/concave region can produce wall contact
   // and discontinuous jumps. Search a large inscribed sphere instead, then
   // keep the complete particle trajectory and its radius inside that sphere.
   const stomach=this.organs.stomach,box=new T.Box3().setFromObject(stomach),size=box.getSize(V());
   const triangles:T.Triangle[]=[];
   stomach.traverse(object=>{if(object instanceof T.Mesh){
    const position=object.geometry.attributes.position,index=object.geometry.index;
    for(let i=0;i<(index?.count??position.count);i+=3){
     const point=(j:number)=>V().fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(object.matrixWorld);
     triangles.push(new T.Triangle(point(0),point(1),point(2)));
    }
   }});
   const ray=new T.Raycaster(),direction=V(.811,.333,.479).normalize(),closest=V();
   let safeCenter=box.getCenter(V()),safeRadius=0;
   const consider=(point:T.Vector3)=>{
    ray.set(point,direction);
    const hits=ray.intersectObject(stomach,true),distances=hits.map(hit=>hit.distance);
    const intersections=distances.filter((distance,i)=>i===0||Math.abs(distance-distances[i-1])>1e-7);
    if(intersections.length%2!==1)return;
    let minimumSquared=Infinity;
    for(const triangle of triangles){
     minimumSquared=Math.min(minimumSquared,triangle.closestPointToPoint(point,closest).distanceToSquared(point));
     if(minimumSquared<=safeRadius*safeRadius)return;
    }
    safeRadius=Math.sqrt(minimumSquared);safeCenter=point.clone();
   };
   // Deterministic coarse volume search followed by four local refinements.
   for(let x=0;x<8;x++)for(let y=0;y<8;y++)for(let z=0;z<8;z++)consider(V(box.min.x+(x+.5)*size.x/8,box.min.y+(y+.5)*size.y/8,box.min.z+(z+.5)*size.z/8));
   const step=size.clone().divideScalar(8);
   for(let pass=0;pass<4;pass++){
    step.multiplyScalar(.5);const center=safeCenter.clone();
    for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)for(let z=-2;z<=2;z++)consider(center.clone().add(V(x*step.x,y*step.y,z*step.z)));
   }
   const particleRadius=.0016,wallClearance=.002,available=safeRadius-particleRadius-wallClearance;
   if(available<=0)throw new Error('Stomach mesh has no verified safe region for the food particles.');
   const rx=available*.92,ry=available*.70,rz=available*.16;
   this.gastricPoints=Array.from({length:512},(_,i)=>{
    const a=i/512*Math.PI*2;
    return safeCenter.clone().add(V(rx*Math.cos(a),ry*Math.sin(a),rz*Math.sin(2*a)));
   });
   // All points and their linear interpolation segments remain in this convex
   // sphere. The bound also includes the complete 1.6 mm particle radius.
   const maximumOffset=Math.sqrt(Math.max(rx*rx,ry*ry)+rz*rz);
   this.root.userData.gastricSafeRegion={method:'8-cubed interior search plus four closest-triangle-distance refinements',center:safeCenter.toArray(),inscribedRadius:safeRadius,routeRadii:[rx,ry,rz],particleRadius,minimumWallClearanceBound:safeRadius-maximumOffset-particleRadius};
   this.cameraPath=this.cameraFactory(this.anchors,tl);
  });
 }
 private span(s:FrameState,a:string,b:string,ramp=42){const f=this.tl.clips.find(c=>c.id===a)!,e=this.tl.clips.find(c=>c.id===b)!;return smooth((s.frame-f.start+ramp*.2)/ramp)*(1-smooth((s.frame-e.end+ramp)/ramp));}
 protected setOpacity(o:T.Object3D,k:number){o.visible=k>.0001;o.traverse(n=>{if(n instanceof T.Mesh){for(const m of Array.isArray(n.material)?n.material:[n.material]){
  if(n.userData.skinDepth){m.opacity=1;m.transparent=true;m.depthWrite=true;}
  else if(n.userData.skinSurface){m.opacity=k;m.transparent=true;m.depthWrite=false;m.depthFunc=T.EqualDepth;}
  else{m.opacity=k;m.transparent=k<.998;m.depthWrite=k>.94;}
 }}});}
 update(s:FrameState){
  this.lastState=s;this.mealScene.update(s.time);const pose=this.cameraPath.apply(s.frame,this.camera);const n=Number(s.clip.id.slice(1));
  // Optical hand-off: maintain visible anatomy until the lens is close enough
  // to resolve its explanatory micro layer. On exit the anatomy returns while
  // the micro layer is still large, preventing a tiny island in an empty field.
  const closer=(near:number,far:number)=>1-smooth(Math.log(pose.distance/near)/Math.log(far/near));
  const gutWindow=this.span(s,'g008','g010',36),betaWindow=this.span(s,'g012','g017',30),drugWindow=this.span(s,'g025','g032',45);
  const wGut=gutWindow*closer(.0012,.006);
  const wIslet=betaWindow*closer(.0007,.007)*(1-closer(90e-6,240e-6));
  const cellVisibility=betaWindow*closer(65e-6,230e-6);
  const wReceptor=betaWindow*closer(100e-9,2e-6);
  const secretionView=this.span(s,'g016','g017',40);
  const wBeta=betaWindow*(1-closer(1.0e-6,5e-6)*(1-secretionView));
  const wCircuit=0;
  const wDrug=drugWindow*closer(150e-9,60e-6);
  const anatomicalMicro=Math.max(gutWindow,betaWindow,drugWindow)*closer(.002,.025);
  const micro=anatomicalMicro;
  this.layerWeights={islet:wIslet,gut:wGut,beta:wBeta,receptor:wReceptor,circuit:wCircuit,drug:wDrug};
  const focusFor=(n:number)=>n<6?'all':n===6?'stomach':n<=11?'small_intestine':n<=16?'pancreas':n<=18?'metabolic':n<=21?'brain':n===23?'stomach':n<=24?'all':n<=31?'liver':n===40?'stomach':'all';
  const focus=focusFor(n),previousFocus=focusFor(Math.max(1,n-1)),focusBlend=smooth((s.frame-s.clip.start)/48);
  const nerveWindow=this.span(s,'g019','g022',65)*(1-micro);
  const bloodWindow=Math.max(this.span(s,'g009','g012',65),this.span(s,'g017','g018',50))*(1-micro);
  const skin=lerpSafe(.035,.20,smooth((pose.distance-.45)/.8))*Math.pow(1-micro,2)*(1-.83*nerveWindow);
  for(const [name,o] of Object.entries(this.organs)){
   const alphaFor=(f:string)=>name==='esophagus'?(n>=6&&n<=7?.64:.08):f==='metabolic'?(name==='pancreas'||name==='liver'?1:.11):name===f||f==='all'?1:name==='aorta'?.20:name==='veins'?.10:.14;
   let alpha=name==='body'?skin:lerpSafe(alphaFor(previousFocus),alphaFor(focus),focusBlend);
   if(name==='pancreatic_ducts')alpha=0;
   if(['veins','aorta','pancreatic_arteries','portal_tributaries'].includes(name))alpha=lerpSafe(alpha,.72,bloodWindow);
   if(name==='brainstem')alpha=lerpSafe(alpha,.95,nerveWindow);
   if(name==='brain')alpha*=1-.88*nerveWindow;
   if(name==='esophagus')alpha=lerpSafe(alpha,.13,nerveWindow);
   if(['heart','liver','stomach','small_intestine'].includes(name))alpha*=1-.85*nerveWindow;
   if(name!=='body')alpha*=Math.pow(1-micro,3);
   const closeView=Math.max(gutWindow,betaWindow,drugWindow);
   const safeMacroDistance=name==='pancreas'?.025:.10,macroRamp=name==='pancreas'?.12:.20;
   alpha*=lerpSafe(1,smooth((pose.distance-safeMacroDistance)/macroRamp),closeView);
   if(name==='stomach')alpha*=1-.71*clamp(this.span(s,'g007','g007',50)+this.span(s,'g023','g023',50));
   const reveal=smooth((s.frame-this.tl.clips[5].start)/100);
   if(name==='body')alpha=lerpSafe(1,alpha,reveal);
   else alpha=lerpSafe(.03,alpha,reveal);
   const returnToDinner=smooth((s.frame-this.tl.clips[47].start)/(this.tl.clips[47].duration*.65));
   if(name==='body')alpha=lerpSafe(alpha,1,returnToDinner);else alpha*=1-returnToDinner;
   this.setOpacity(o,alpha);
   o.traverse(node=>{if(node.userData.duplicateBrainstem)node.visible=false;});
  }
  // The table remains in world space; it leaves the lens as the camera enters
  // the torso. Its removal only begins when it is already outside the frame.
  const leave=smooth((s.frame-this.tl.clips[6].start)/150),back=smooth((s.frame-this.tl.clips[45].start)/220);this.meal.position.y=-.8*leave*(1-back)-1.3*smooth((s.frame-(this.tl.duration-270))/45);
  const gutStart=this.tl.clips[7].start,gutEnd=this.tl.clips[8].end;
  modulate(this.intestinal.root,wGut,()=>this.intestinal.render(s.time,clamp((s.frame-gutStart)/(gutEnd-gutStart))));
  const betaProgress=n<12?0:n===12?.34*s.clipProgress:n<16?.34+.06*clamp((s.frame-this.tl.clips[12].start)/(this.tl.clips[15].start-this.tl.clips[12].start)):.40+.60*s.clipProgress;
  visibility(this.gutContext,gutWindow*closer(.018,.12)*(1-closer(.0007,.002)));
  visibility(this.tissueContext,betaWindow*closer(.025,.14)*(1-closer(.0006,.0018)));
  visibility(this.bloodContext,drugWindow*closer(.00025,.003)*(1-closer(90e-9,9e-6)));
  modulate(this.islet.root,wIslet,()=>this.islet.render(s.time));
  modulate(this.beta.root,wBeta,()=>this.beta.render(s.time,betaProgress));
  visibility(this.membranePatch,betaWindow*closer(3e-6,12e-6)*(1-closer(65e-9,200e-9)));
  modulate(this.receptor.root,wReceptor,()=>this.receptor.render(s.time,clamp((s.frame-this.tl.clips.find(c=>c.id==='g013')!.start)/this.tl.clips.find(c=>c.id==='g013')!.duration)));
  modulate(this.circuit.root,wCircuit,()=>this.circuit.render(s.time,s.clipProgress));
  // Tie the scientific actions to the spoken sentence, independently of its
  // synthesized duration: cleavage, redesign, Aib, sidechain, carrier.
  const drugPhases=[0,.115,.330,.535,.800,.865,.93,1],drugIndex=Math.max(0,Math.min(6,n-25));
  const drugProgress=n<25?0:n>31?1:lerpSafe(drugPhases[drugIndex],drugPhases[drugIndex+1],s.clipProgress);
  modulate(this.drug.root,wDrug,()=>this.drug.render(s.time,drugProgress));
  this.routes?.update(s.time,{blood:bloodWindow,nerve:nerveWindow,showLumenMarkers:true});
  const foodAlpha=this.span(s,'g007','g007',50)+this.span(s,'g023','g023',50);
  for(let i=0;i<this.stomachFood.length;i++){
   const q=(s.time*(n===23?.021:.073)+i/this.stomachFood.length)%1;
   const at=q*this.gastricPoints.length,index=Math.floor(at),point=this.gastricPoints.length?this.gastricPoints[index].clone().lerp(this.gastricPoints[(index+1)%this.gastricPoints.length],at-index):this.anchors.stomach.clone();
   this.stomachFood[i].position.copy(point);this.setOpacity(this.stomachFood[i],clamp(foodAlpha));
  }
  this.scene.updateMatrixWorld();
 }
 labels(s:FrameState):Label[]{
  const n=Number(s.clip.id.slice(1)),a=this.anchors;const loc=(root:T.Object3D,v:T.Vector3)=>root.localToWorld(v.clone());
  if(n<=6)return n===6?[{text:'胃',point:a.stomach.clone().add(V(.021,-.029,.023)),side:'right'}]:[];
  if(n<=7)return[{text:'胃',point:a.stomach.clone().add(V(.021,-.029,.023)),side:'right'},{text:'小肠',point:a.small_intestine,side:'right'}];
  if(n<=9){const detail=this.layerWeights.gut;return[{text:'L 细胞',point:loc(this.intestinal.root,V(.61,.08,.55)),side:'left',color:C.teal,weight:detail},{text:n===8?'营养信号':'GLP-1 信号',point:loc(this.intestinal.root,n===8?V(.61,.95,.5):V(1.3,-1,.6)),side:'right',color:C.gold,weight:detail}];}
  if(n===10){
   const opacityOf=(object:T.Object3D|undefined)=>{let opacity=0;if(!object?.visible)return 0;object.traverseVisible(o=>{if(o instanceof T.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material])opacity=Math.max(opacity,material.opacity)});return opacity;};
   const macroReveal=1-smooth((opacityOf(this.intestinal.root)-.10)/.20);
   return([{text:'小肠',point:a.small_intestine,side:'right',organ:'small_intestine'},{text:'胰腺',point:a.pancreas,side:'right',organ:'pancreas'}] as const)
    .map(({organ,...label})=>({...label,weight:macroReveal*smooth((opacityOf(this.organs[organ])-.04)/.10)})).filter(label=>label.weight>.05);
  }
  if(n===11)return[{text:'小肠',point:a.small_intestine,side:'right'},{text:'胰腺',point:a.pancreas,side:'right'}];
  if(n===12||n===16){
   const detail=this.layerWeights.beta;
   if(this.layerWeights.islet>.15)return[{text:'胰岛',point:a.islet,side:'right',weight:this.layerWeights.islet},{text:'β 细胞',point:a.beta,side:'left',weight:this.layerWeights.islet}];
   if(detail<.03)return[{text:'胰腺',point:a.pancreas,side:'right',weight:1-detail}];
   const released=this.beta.root.children.filter(o=>o.name.startsWith('released-insulin-')&&o.scale.x>.001);
   const insulinPoint=released.length?released.reduce((sum,o)=>sum.add(o.getWorldPosition(V())),V()).divideScalar(released.length):this.beta.vesicles[1].getWorldPosition(V());
   const ligandPoint=this.beta.root.getObjectByName('extracellular-GLP1-ligand')!.getWorldPosition(V());
   return[{text:'β 细胞',point:loc(this.beta.root,V(.35,.88,.60)),side:'right',weight:detail},{text:n===12?'膜上受体的位置':released.length?'释放胰岛素':'胰岛素小泡',point:n===12?a.receptor:insulinPoint,side:n===12?'left':'right',color:C.gold,weight:detail}];
  }
  if(n<=15)return[{text:'GLP-1',point:loc(this.receptor.root,this.receptor.getLigandAnchor()),side:'right',color:C.gold,weight:this.layerWeights.receptor},{text:'受体',point:loc(this.receptor.root,V(-.30,.1,.20)),side:'left',color:C.teal,weight:this.layerWeights.receptor},{text:'细胞内的接力',point:loc(this.receptor.root,V(.17,-.95,.12)),side:'right',weight:this.layerWeights.receptor}];
  if(n===17||n===18)return[{text:'胰腺',point:a.pancreas,side:'right'},{text:'肝脏',point:a.liver.clone().add(V(-.05,0,.07)),side:'left'}];
  if(n<=21)return[{text:'脑干',point:a.brainstem,side:'right'},{text:'大脑',point:a.brain,side:'right'}];
  if(n===22){const route=this.routes?.getRoute('vagus_left_reference');return[{text:'脑干',point:a.brainstem,side:'right'},{text:'迷走神经',point:route?new T.Vector3(...route.points[Math.floor(route.points.length*.48)]):V(.015,1.36,0),side:'right',color:'#898c57'}];}
  if(n===23)return[{text:'胃排空',point:a.stomach,side:'right'}];
  if(n<=24)return[{text:'肠道',point:a.small_intestine,side:'right'},{text:'大脑',point:a.brain,side:'right'}];
  if(n<=31){const preferred=n>=29?['albumin','c18','persistence']:n===28?['aib8']:['native','cleavage','dpp4'];return this.drug.getLabels().filter(l=>l.opacity>.15&&preferred.includes(l.id)).slice(0,3).map((l,i)=>({text:l.text,color:l.color,point:loc(this.drug.root,new T.Vector3(...l.position)),weight:l.opacity*this.layerWeights.drug,side:i%2?'left':'right'}));}
  if(n===40)return[{text:'胃肠道反应',point:a.stomach,side:'right'}];
  return[];
 }
 dispose(){this.mealScene.dispose();this.root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});this.environment.dispose();this.scene.remove(this.root);}
}
function lerpSafe(a:number,b:number,t:number){return a+(b-a)*t;}
function modulate(root:T.Object3D,k:number,render:()=>void){
 const materials=new Set<T.Material>();root.traverse(n=>{if(n instanceof T.Mesh)for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m)});
 for(const m of materials)if(m.userData.unmodulated!==undefined)m.opacity=m.userData.unmodulated;
 render();root.visible=k>.0001;for(const m of materials){m.userData.unmodulated=m.opacity;m.opacity*=k;m.transparent=m.opacity<.998;m.depthWrite=m.opacity>.96;}
}
