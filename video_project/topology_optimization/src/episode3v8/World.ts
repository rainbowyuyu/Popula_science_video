import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {prepareCoordinate,sampleSigned,sampleEnvelope,StressCoordinate} from './StressField';
import {GRAVITY_ROUTES,WIND_ROUTES,GRAVITY_CAMERA,WIND_CAMERA,FORCE_FOCUS_PARTS,TERM_ANCHORS,TERM_LABELS,RestAnchor,RouteSpec} from './ForceStory';
import forceEvidence from './force-evidence.json';
import {refineStressSurface} from './SurfaceSampling';

export const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export const smooth=(x:number)=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10)};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const fromB=(v:number[])=>V(v[0],v[2],-v[1]);
export type FrameState={scene:string;previous?:string;elapsed:number;duration:number;progress:number;time:number;line:number;lineProgress:number};
type Key={t:number;offset_three:number[]};
type PartInfo={id:string;role:string;assembly_keys:Key[];[key:string]:any};
type Demo={focus_three:number[];anchor_part:string;assembly_window:number[]};
type Manifest={glb?:string;parts:PartInfo[];demonstrations:Record<string,Demo>;[key:string]:any};
type Part={info:PartInfo;root:T.Group;meshes:T.Mesh[];base:Float32Array[];centroid:T.Vector3;offset:T.Vector3;nodeWeights:{node:string;weight:number}[][][];stressCoordinates:(StressCoordinate|undefined)[][]};
type Sample={s:number;normalMinPa:number;normalMaxPa:number};
type ElementResult={elementID:number;nodes:number[];sectionSamples:Sample[];sigmaMaxAbsPa:number};
type Response={t:number;nodalDisplacements:Record<string,number[]>;supportReactions:Record<string,number[]>;members:Record<string,{elementResults:ElementResult[];sigmaMaxAbsPa:number}>};
type Member={id:number;part_id:string;nodes:number[];section:{b:number;h:number};roll_vec?:number[]};
type Physics={nodes:{id:number;xyz:number[]}[];members:Member[];snapshots:Response[];[key:string]:any};
type Pose={q:number;position:T.Vector3;target:T.Vector3;heat:number;deform:number;flow:number;force:number;cut:number;inverse:number;sim:number};
type SurfaceBinding={partID:string;mesh:T.Mesh;indices:[number,number,number];bary:T.Vector3;distance:number};
type RouteVisual={spec:RouteSpec;bindings:SurfaceBinding[];segments:{core:T.Mesh;halo:T.Mesh}[];dots:T.Mesh[];ring:T.Mesh};
export type ProjectedAnchor={partID:string;partId:string;world:[number,number,number];x:number;y:number;visible:boolean;occluded:boolean;opacity:number;distanceToSurface:number;groupBounds?:{left:number;top:number;right:number;bottom:number};memberIds?:string[]};
export type PhysicsOverlay={mode:'none'|'path'|'flow'|'signed'|'envelope'|'reaction'|'pressure';label:string;unit:string;min:number;max:number;parts:string[];displayGain:number;signed:boolean;flow:boolean;opacity:number;probe?:{topMPa:number;bottomMPa:number}};
const scalar=(points:number[][],t:number)=>{if(t<=points[0][0])return points[0][1];for(let i=1;i<points.length;i++){if(t<=points[i][0])return mix(points[i-1][1],points[i][1],smooth((t-points[i-1][0])/(points[i][0]-points[i-1][0])))}return points.at(-1)![1]};
// Lift the cap before the upper crossed arm in the sentence that names the
// opening. q=.620 leaves that arm 0.603 m above its seated position, exposing
// both mating notches together instead of sending it far outside the shot.
const BRACKET_ASSEMBLY=[[0,.52],[1,.52],[1.88,.66],[2,.66],[2.28,.620],[4,.620],[4.72,.66],[5,.66]];

/** One repaired pavilion, always present. All frames are pure functions of time. */
export class JoineryWorld{
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(34,16/9,.035,240);ready:Promise<void>;environment:T.WebGLRenderTarget;
 manifest!:Manifest;parts=new Map<string,Part>();pavilion=new T.Group();physics!:Physics;staticData:any;inverseData:any;flowData:any;
 nodes=new Map<string,T.Vector3>();members=new Map<string,Member[]>();maxStress=1;displayGain=1;assemblyTravel:number[]=[];
 forceLines:{line:T.Line;member:Member;dot:T.Mesh}[]=[];arrows:T.ArrowHelper[]=[];flowLines:{line:T.Line;points:T.Vector3[];dot:T.Mesh;seed:number}[]=[];
 flowRoot=new T.Group();forces=new T.Group();woodGrain:T.CanvasTexture;
 routeVisuals:RouteVisual[]=[];surfaceBindings=new Map<string,SurfaceBinding>();
 loadArrows:{anchor:SurfaceBinding;direction:T.Vector3;arrow:T.ArrowHelper;shaft:T.Mesh;kind:'weight'|'wind'|'reaction';panel?:string;amplitude:number}[]=[];
 displacementMeasure?:{binding:SurfaceBinding;rest:T.Mesh;current:T.Mesh;shaft:T.Mesh;restRing:T.Mesh};
 annotationRay=new T.Raycaster();latestState?:FrameState;
 constructor(canvas:HTMLCanvasElement,base:string){
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  this.renderer.setSize(1920,1080,false);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.08;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.localClippingEnabled=true;
  this.scene.background=new T.Color('#eee7d8');this.scene.fog=new T.Fog('#eee7d8',35,95);
  const pm=new T.PMREMGenerator(this.renderer);this.environment=pm.fromScene(new RoomEnvironment(),.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.45;pm.dispose();
  this.scene.add(new T.HemisphereLight(0xfff2db,0x78827a,1.6));
  const key=new T.DirectionalLight(0xffebd2,3.1);key.position.set(-5,12,7);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-17,right:17,top:20,bottom:-12,near:1,far:48});key.shadow.normalBias=.012;key.shadow.bias=-.00015;key.shadow.radius=5;this.scene.add(key);
  const fill=new T.DirectionalLight(0xe4eeef,1.25);fill.position.set(8,6,-8);this.scene.add(fill);
  const floor=new T.Mesh(new T.PlaneGeometry(300,300),new T.MeshStandardMaterial({color:0xe5ddcc,roughness:.91}));floor.rotation.x=-Math.PI/2;floor.position.y=.02;floor.receiveShadow=true;this.scene.add(floor,this.pavilion,this.flowRoot,this.forces);
  this.woodGrain=this.grain();
  const json=async(p:string)=>{const r=await fetch(base+p);if(!r.ok)throw Error(`Missing required verified asset: ${p}`);return r.json()};
  this.ready=Promise.all([json('models/pavilion-manifest.json'),json('physics/dynamic-response.json'),json('physics/static-cases.json'),json('physics/inverse-diffusion.json'),json('physics/flow.json'),json('physics/flow-central.json')]).then(async([manifest,physics,stat,inverse,flow,central])=>{
   this.manifest=manifest;this.physics=physics;this.staticData=stat;this.inverseData=inverse;this.flowData={slices:[flow,central]};
   const gltf=await new GLTFLoader().loadAsync(base+'models/'+(manifest.glb??'pavilion-v7.glb'));
   gltf.scene.updateMatrixWorld(true);
   for(const part of manifest.parts as PartInfo[]){
    const source=gltf.scene.getObjectByName(part.id);if(!source)throw Error(`Pavilion part missing: ${part.id}`);
    if(!part.assembly_keys?.length)throw Error(`Assembly path missing: ${part.id}`);
    const root=new T.Group();root.name=part.id;this.pavilion.add(root);const meshes:T.Mesh[]=[],vertices:Float32Array[]=[];
    source.traverse(o=>{if(!(o instanceof T.Mesh))return;
     let geo=o.geometry.clone().applyMatrix4(o.matrixWorld);
     if(part.id==='PURLIN_Y_LEFT'){const original=geo;geo=refineStressSurface(original);original.dispose();}
     geo.computeBoundingBox();geo.computeBoundingSphere();const attrs=geo.getAttribute('position');vertices.push(new Float32Array(attrs.array));
     const sourceMat=Array.isArray(o.material)?o.material[0]:o.material;const mat=(sourceMat as T.MeshStandardMaterial).clone();
     mat.roughness=Math.max(.36,mat.roughness);mat.metalness=Math.min(.3,mat.metalness);
     // Blender's procedural nodes do not export to glTF. Restore the same
     // warm timber palette explicitly and keep the grain in this renderer.
     if(/wood|cedar|fir|tenon|oak/i.test(mat.name)){if(!mat.map){mat.color.set(part.role==='peg'?'#c08a50':'#a97243');mat.map=this.woodGrain;}mat.roughness=.53;}
     mat.userData.baseColor=mat.color.clone();
     mat.userData.physicsMapBlend={value:0};
     mat.onBeforeCompile=shader=>{shader.uniforms.physicsMapBlend=mat.userData.physicsMapBlend;shader.fragmentShader='uniform float physicsMapBlend;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',T.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;','diffuseColor *= vec4(mix(sampledDiffuseColor.rgb, vec3(1.0), physicsMapBlend), sampledDiffuseColor.a);'));};
     mat.customProgramCacheKey=()=> 'rainbow-wood-to-physics-v7';
     const colors=new Float32Array(attrs.count*3);colors.fill(1);geo.setAttribute('color',new T.BufferAttribute(colors,3));mat.vertexColors=true;
     const mesh=new T.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);meshes.push(mesh);
    });
    if(!meshes.length)throw Error(`Part contains no geometry: ${part.id}`);
    const centroid=new T.Box3().setFromObject(root).getCenter(V());this.parts.set(part.id,{info:part,root,meshes,base:vertices,centroid,offset:V(),nodeWeights:[],stressCoordinates:[]});
   }
   for(const n of physics.nodes)this.nodes.set(String(n.id),fromB(n.xyz));
   for(const m of physics.members){const list=this.members.get(m.part_id)??[];list.push(m);this.members.set(m.part_id,list)}
   const snapshots=[...physics.snapshots,...Object.values(stat.cases??{}).map((c:any)=>c.response).filter(Boolean)] as Response[];
   this.maxStress=Math.max(1,...snapshots.flatMap(s=>Object.values(s.members).map(m=>m.sigmaMaxAbsPa)));
   const maxU=Math.max(1e-8,...physics.snapshots.flatMap((s:Response)=>Object.values(s.nodalDisplacements).map(u=>fromB(u).length())));this.displayGain=Math.max(1,Math.min(250,.14/maxU));
   this.prepareWeights();this.prepareTravel();this.buildForces();this.buildFlow();
  });
 }
 grain(){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;const ctx=canvas.getContext('2d')!,im=ctx.createImageData(256,512);for(let y=0;y<512;y++)for(let x=0;x<256;x++){const v=235+7*Math.sin(x*.5+2*Math.sin(y*.01))+3*Math.sin(x*2.4+y*.02);im.data.set([v,v-5,v-12,255],(y*256+x)*4)}ctx.putImageData(im,0,0);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=8;return texture;}
 offset(info:PartInfo,q:number){const keys=info.assembly_keys;if(q<=keys[0].t)return V(...keys[0].offset_three as [number,number,number]);for(let i=1;i<keys.length;i++){if(q<=keys[i].t){const a=keys[i-1],b=keys[i],t=smooth((q-a.t)/Math.max(1e-6,b.t-a.t));return V(...a.offset_three as [number,number,number]).lerp(V(...b.offset_three as [number,number,number]),t)}}return V(...keys.at(-1)!.offset_three as [number,number,number]);}
 prepareWeights(){
  for(const part of this.parts.values()){
   const mem=this.members.get(part.info.id)??[];
   part.nodeWeights=part.base.map(base=>{const result:{node:string;weight:number}[][]=[],coordinates:(StressCoordinate|undefined)[]=[];for(let i=0;i<base.length;i+=3){const p=V(base[i],base[i+1],base[i+2]);let best=Infinity,weights:{node:string;weight:number}[]=[],coordinate:StressCoordinate|undefined=undefined;
    for(const m of mem){const a=this.nodes.get(String(m.nodes[0]))!,b=this.nodes.get(String(m.nodes[1]))!,ab=b.clone().sub(a),t=clamp(p.clone().sub(a).dot(ab)/ab.lengthSq()),dist=p.distanceToSquared(a.clone().addScaledVector(ab,t));if(dist<best){best=dist;weights=[{node:String(m.nodes[0]),weight:1-t},{node:String(m.nodes[1]),weight:t}];coordinate=prepareCoordinate(m,[[a.x,-a.z,a.y],[b.x,-b.z,b.y]],p)}}
    // Roof panels and non-beam fittings follow nearest solved nodes; their
    // visual displacement is labelled interpolation, never an extra FE solve.
    if(!weights.length){const nearest=[...this.nodes].map(([node,pos])=>({node,dist:p.distanceToSquared(pos)})).sort((a,b)=>a.dist-b.dist).slice(0,3);const sum=nearest.reduce((s,n)=>s+1/(n.dist+.01),0);weights=nearest.map(n=>({node:n.node,weight:1/(n.dist+.01)/sum}))}
    result.push(weights);coordinates.push(coordinate);
   }part.stressCoordinates.push(coordinates);return result});
  }
 }
 prepareTravel(){
  const count=2000;this.assemblyTravel=[0];let previous=[...this.parts.values()].map(p=>this.offset(p.info,0));
  for(let i=1;i<=count;i++){const current=[...this.parts.values()].map(p=>this.offset(p.info,i/count));const delta=Math.max(.00005,...current.map((p,k)=>p.distanceTo(previous[k])));this.assemblyTravel.push(this.assemblyTravel[i-1]+delta);previous=current}
 }
 travelAt(q:number){const n=clamp(q)*2000,i=Math.floor(n);return mix(this.assemblyTravel[i],this.assemblyTravel[Math.min(i+1,2000)],n-i)}
 travelMix(a:number,b:number,t:number){const distance=mix(this.travelAt(a),this.travelAt(b),t);let lo=0,hi=2000;while(hi-lo>1){const mid=(lo+hi)>>1;if(this.assemblyTravel[mid]<distance)lo=mid;else hi=mid}return (lo+(distance-this.assemblyTravel[lo])/(this.assemblyTravel[hi]-this.assemblyTravel[lo]))/2000;}
 assemblyCurve(points:number[][],t:number){if(t<=points[0][0])return points[0][1];for(let i=1;i<points.length;i++)if(t<=points[i][0])return this.travelMix(points[i-1][1],points[i][1],smooth((t-points[i-1][0])/(points[i][0]-points[i-1][0])));return points.at(-1)![1]}
 demo(name:string){const d=this.manifest.demonstrations[name];if(!d)throw Error(`Camera requires verified demonstration: ${name}`);return d;}
 getPartAssemblyQ(partID:string,s:FrameState,p=this.blendedPose(s)){
  if(s.scene==='hip'&&partID==='HIP_FL'&&s.line+s.lineProgress<2.6&&(!s.previous||s.elapsed>=4)){
   // Reverse only the named hip along its collision-checked original path:
   // lift clear, draw outward, return over its seat, then lower into place.
   return scalar([[0,.893],[1,.893],[1.22,.875],[1.45,.855],[1.67,.875],[1.96,.893],[2.6,.893]],s.line+s.lineProgress);
  }
  return p.q;
 }
 pose(scene:string,p:number,elapsed:number,line:number,lineProgress=1):Pose{
  let q=1,target=V(0,2.65,0),az=.66-.23*p,el=.35,dist=14.7,heat=0,deform=0,flow=0,force=0,cut=0,inverse=0,sim=p;
  if(scene==='intro'){q=this.assemblyCurve([[0,1],[.075,1],[.27,.32],[.38,.32],[.58,1],[.76,1],[1,.32]],p);const cameraQ=scalar([[0,1],[.075,1],[.27,.32],[.38,.32],[.58,1],[.76,1],[1,.32]],p);target.y=mix(2.65,5.2,1-cameraQ);dist=mix(14.7,29.7,1-cameraQ);az=.65-.36*p;}
  if(['straight','frame','bracket','hip'].includes(scene)){
   const d=this.demo(scene);const a=d.assembly_window[0],b=d.assembly_window[1];
   const u=line+lineProgress;
   if(scene==='straight')q=this.assemblyCurve([[0,a],[1,a],[2,.23],[3.3,.23],[4,a],[5,.23],[5.8,b],[6,b],[6.35,.23],[7,a]],u);
   if(scene==='frame')q=this.assemblyCurve([[0,a],[1,a],[2,.45],[4,.45],[5,b]],u);
   if(scene==='bracket')q=this.assemblyCurve(BRACKET_ASSEMBLY,u);
   // Complete rafters BEFORE the first rafter name, then show the board
   // arriving during its sentence. The same approved assembly keys apply.
   if(scene==='hip')q=this.assemblyCurve([[0,.893],[2.60,.893],[2.98,.943],[3.8,.947],[4,.952],[4.34,.979],[4.78,1],[5,1]],u);
   target=V(...d.focus_three as [number,number,number]);const anchorId=scene==='bracket'?'POST_FL':scene==='hip'?'SUPPORT_X':d.anchor_part;const anchor=this.parts.get(anchorId);if(!anchor)throw Error(`Focus anchor missing ${anchorId}`);target.add(this.offset(anchor.info,q));
   az=({straight:-.66,frame:.63,bracket:.04,hip:.63} as Record<string,number>)[scene]+.38*Math.sin((p-.5)*Math.PI);
   dist=scene==='frame'?9.4:scene==='hip'?4.2:scene==='bracket'?2.9:3.7;el=scene==='hip'?.53:scene==='bracket'?.28:.2;
   if(scene==='bracket'){
    az=.04+.23*Math.sin((p-.5)*Math.PI);const cameraQ=scalar(BRACKET_ASSEMBLY,u),exploded=clamp((.66-cameraQ)/.14);target.y+=1.2*exploded;dist+=3.2*exploded;
    const crossedDetail=scalar([[0,0],[2,0],[2.28,1],[3.76,1],[4.72,0],[5,0]],u);
    const bearing=scalar([[0,0],[3,0],[3.45,1],[4,1],[4.72,0],[5,0]],u);
    target.lerp(V(-1.5,mix(4.08,3.88,bearing),1.5),crossedDetail);
    dist=mix(dist,3.3,crossedDetail);az=mix(az,-.52,crossedDetail);el=mix(el,mix(.40,.28,bearing),crossedDetail);
   }
   if(scene==='frame'){const close=scalar([[0,0],[1.9,0],[2.25,1],[3.8,1],[4.25,0],[5,0]],u);dist=mix(9.4,4.2,close);cut=.58*close;}
   if(scene==='hip'){
    // Start on the whole hip and its two real supports. During the single
    // removal, truck left/front and dolly back with the extracted member.
    const hip=this.parts.get('HIP_FL')!,hipQ=scalar([[0,.893],[1,.893],[1.22,.875],[1.45,.855],[1.67,.875],[1.96,.893],[2.6,.893]],u),hipOffset=this.offset(hip.info,hipQ);
    const closeHip=scalar([[0,1],[1.88,1],[2.23,0],[5,0]],u);
    const hipTarget=hip.centroid.clone().addScaledVector(hipOffset,.70);
    target.lerp(hipTarget,closeHip);dist=mix(dist,6.7+hipOffset.length()*.45,closeHip);az=mix(az,-.10+.06*Math.sin(u*1.6),closeHip);el=mix(el,.34,closeHip);
    const support=scalar([[0,0],[1.9,0],[2.22,1],[2.58,1],[2.95,0],[5,0]],u);
    target.lerp(V(-.1,4.42,0),support);dist=mix(dist,5.8,support);el=mix(el,.12,support);
    const reveal=scalar([[0,0],[2.58,0],[2.98,1],[3.8,1],[4.2,.7],[5,0]],u);
    target.lerp(V(-1.07,4.5,.528),reveal);dist=mix(dist,8.2,reveal);az=mix(az,-.75,reveal);
    const wide=smooth(clamp((u-4.0)/.8));dist=mix(dist,14.7,wide);target.lerp(V(0,2.65,0),wide);
   }
   if(scene==='straight'){const detail=scalar([[0,0],[4.8,0],[5.25,1],[6.35,1],[7,0]],u);dist=mix(dist,1.8,detail);const peg=this.parts.get('PEG_X_FL')!;target.lerp(peg.centroid.clone().add(this.offset(this.parts.get('POST_FL')!.info,q)),detail);}
   if(scene==='straight')cut=scalar([[0,0],[1.30,0],[1.57,.86],[3.15,.86],[3.7,0],[7,0]],u);
  }
  if(scene==='assembly'){const assemblyProgress=clamp((elapsed-7)/18);q=this.assemblyCurve([[0,0],[.89,1],[1,1]],assemblyProgress);dist=mix(25.5,14.6,smooth(p));target.y=mix(4.65,2.65,smooth(p));az=.82-.78*p;el=.32;}
  if(scene==='gravity'){
   const u=line+lineProgress;
   const channel=(i:number)=>scalar(GRAVITY_CAMERA.map(v=>[v[0],v[i]]),u);
   target=V(channel(1),channel(2),channel(3));dist=channel(4);az=channel(5);el=channel(6);
   force=scalar([[0,0],[.55,1],[9.5,1],[10,0]],u);
   heat=scalar([[0,0],[3.95,0],[4.18,1],[4.85,1],[5.15,0],[6.05,0],[6.3,1],[6.82,1],[7.1,0],[10,0]],u);
  }
  if(scene==='wind'){
   const u=line+lineProgress,channel=(i:number)=>scalar(WIND_CAMERA.map(v=>[v[0],v[i]]),u);
   target=V(channel(1),channel(2),channel(3));dist=channel(4);az=channel(5);el=channel(6);
   heat=scalar([[0,0],[3.95,0],[4.2,1],[4.75,1],[5.0,0],[5.8,0],[6.1,1],[6.95,1],[7.55,0],[8,0]],u);
   deform=scalar([[0,0],[5.8,0],[6.1,1],[6.95,1],[7.55,0],[8,0]],u);
   flow=scalar([[0,0],[.45,1],[1.9,1],[2.8,.32],[3.2,0],[5.8,0],[6.15,.25],[7.5,0],[8,0]],u);
   force=scalar([[0,0],[.5,1],[5.65,1],[6,0],[8,0]],u);
   cut=scalar([[0,0],[4.85,0],[5.18,.70],[5.7,.70],[6,0],[8,0]],u);
  }
  if(scene==='inverse'){inverse=scalar([[0,0],[.1,1],[.92,1],[1,0]],p);q=this.assemblyCurve([[0,1],[.55,1],[.72,.947],[.92,.947],[1,1]],p);heat=scalar([[0,0],[.64,0],[.76,1],[.9,1],[1,0]],p);deform=heat;dist=12.8;el=.45;az=.17+.45*p;target=V(0,3.2,0);}
  if(scene==='return'){az=.6+.32*p;dist=14.7;target=V(0,2.65,0);}
  if(scene==='references'){az=.92;target=V(-13,2.65,0);dist=14.7;}
  const position=target.clone().add(V(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(dist));
  if(!['straight','frame','bracket','hip','gravity','wind'].includes(scene))target.add(V(-.25,.12,0));return {q,position,target,heat,deform,flow,force,cut,inverse,sim};
 }
 blendedPose(s:FrameState){
  const pose=this.pose(s.scene,s.progress,s.elapsed,s.line,s.lineProgress),travelDuration=s.scene==='assembly'?7:4;
  if(!s.previous||s.elapsed>=travelDuration)return pose;
  const prev=this.pose(s.previous,1,100,99),a=smooth(s.elapsed/4),travel=smooth(s.elapsed/travelDuration);
  const result={...pose,position:prev.position.clone().lerp(pose.position,a),target:prev.target.clone().lerp(pose.target,a)};
  for(const key of ['heat','deform','flow','force','cut','inverse','sim'] as const)result[key]=mix(prev[key],pose[key],a);
  result.q=this.travelMix(prev.q,pose.q,travel);return result;
 }

 response(s:FrameState){
  if(s.scene==='wind'){
   if(s.line+s.lineProgress<5.85){const a=this.staticData.cases.gravity_wind.response as Response;return {a,b:a,t:0};}
   const frames=this.physics.snapshots,t=clamp((s.line+s.lineProgress-5.85)/1.2)*(frames.length-1),i=Math.floor(t);return {a:frames[i],b:frames[Math.min(i+1,frames.length-1)],t:t-i};
  }
  if(s.scene==='inverse'){
   const a=this.inverseData.true_native_result.response,b=this.inverseData.recovered_native_result.response;
   return {a:a as Response,b:b as Response,t:smooth(clamp((s.progress-.5)/.32))};
  }
  const cases=this.staticData.cases;const gravity=cases.gravity?.response??cases.dead?.response??Object.values(cases).map((x:any)=>x.response)[0];
  if(!gravity)throw Error('No actual gravity solve');return {a:gravity as Response,b:gravity as Response,t:0};
 }
 displacement(weights:{node:string;weight:number}[],a:Response,b:Response,t:number){const result=V();for(const w of weights){const u=a.nodalDisplacements[w.node],v=b.nodalDisplacements[w.node];if(u&&v)result.addScaledVector(fromB(u).lerp(fromB(v),t),w.weight)}return result;}
 heatColor(value:number){const q=clamp(value/this.maxStress),cold=new T.Color('#4b8f99'),mid=new T.Color('#e7d5a4'),hot=new T.Color('#bd4c39');return q<.48?cold.lerp(mid,q/.48):mid.lerp(hot,(q-.48)/.52);}
 buildForces(){
  const material=(color:number)=>new T.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,depthTest:false});
  const segment=()=>{const core=new T.Mesh(new T.CylinderGeometry(.011,.011,1,8),material(0xb96536)),halo=new T.Mesh(new T.CylinderGeometry(.030,.030,1,8),material(0xe2b467));core.renderOrder=13;halo.renderOrder=12;this.forces.add(core,halo);return {core,halo}};
  for(const spec of [...GRAVITY_ROUTES,...WIND_ROUTES]){
   const bindings=spec.points.map(a=>this.bindSurface(a)),segments=bindings.slice(1).map(segment);
   const dots=Array.from({length:3},()=>{const dot=new T.Mesh(new T.SphereGeometry(.031,10,8),material(0xd19142));dot.renderOrder=14;this.forces.add(dot);return dot});
   const ring=new T.Mesh(new T.RingGeometry(.059,.072,36),material(0xc68b44));ring.renderOrder=14;this.forces.add(ring);
   this.routeVisuals.push({spec,bindings,segments,dots,ring});
  }
  const arrow=(anchor:RestAnchor,direction:T.Vector3,kind:'weight'|'wind'|'reaction',amplitude=1,panel?:string)=>{
   const value=new T.ArrowHelper(direction,V(),.001,kind==='reaction'?0x3f8175:0xb8643d,.15,.08);value.renderOrder=15;
   value.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){const m=o.material as T.Material;m.transparent=true;m.opacity=0;m.depthWrite=false;m.depthTest=false;o.renderOrder=15}});
   const shaft=new T.Mesh(new T.CylinderGeometry(.012,.012,1,10),material(kind==='reaction'?0x3f8175:0xb8643d));shaft.renderOrder=15;
   this.forces.add(value,shaft);this.loadArrows.push({anchor:this.bindSurface(anchor),direction,arrow:value,shaft,kind,amplitude,panel});
  };
  for(const panel of forceEvidence.panels){
   const p=panel.centroidThree as [number,number,number],partID=panel.id.replace('DECK_','TILE_');
   arrow({partID,point:[p[0],p[1]+.06,p[2]]},V(0,-1,0),'weight');
   arrow({partID,point:[p[0],p[1]+.06,p[2]]},V(...panel.forceThreeN as [number,number,number]).normalize(),'wind',Math.abs(panel.Cp),panel.id);
  }
  arrow({partID:'POST_FL',point:[-1.64,2.1,1.5]},V(1,0,0),'wind',.55);
  for(const suffix of ['FL','FR','BL','BR']){
   const part=this.parts.get('POST_'+suffix)!;
   arrow({partID:part.info.id,point:[part.centroid.x,.40,part.centroid.z]},V(0,1,0),'reaction');
  }
  const rest=new T.Mesh(new T.SphereGeometry(.017,14,10),material(0xeee7d8)),current=new T.Mesh(new T.SphereGeometry(.026,14,10),material(0xb96536)),shaft=new T.Mesh(new T.CylinderGeometry(.009,.009,1,10),material(0xb96536)),restRing=new T.Mesh(new T.RingGeometry(.034,.041,32),material(0x596c67));
  for(const mesh of [rest,current,shaft,restRing]){mesh.renderOrder=16;this.forces.add(mesh)}
  this.displacementMeasure={binding:this.bindSurface(TERM_ANCHORS.displacement),rest,current,shaft,restRing};
 }
 bindSurface(anchor:RestAnchor):SurfaceBinding{
  const key=anchor.partID+':'+anchor.point.join(','),existing=this.surfaceBindings.get(key);if(existing)return existing;
  const part=this.parts.get(anchor.partID);if(!part)throw Error(`No real part for anchor ${anchor.partID}`);
  const point=V(...anchor.point),va=V(),vb=V(),vc=V(),closest=V(),triangle=new T.Triangle();
  let winner:SurfaceBinding|undefined,best=Infinity;
  part.meshes.forEach((mesh,k)=>{
   const base=part.base[k],index=mesh.geometry.getIndex(),count=index?.count??base.length/3;
   for(let i=0;i<count;i+=3){
    const ids=[index?index.getX(i):i,index?index.getX(i+1):i+1,index?index.getX(i+2):i+2] as [number,number,number];
    va.fromArray(base,ids[0]*3);vb.fromArray(base,ids[1]*3);vc.fromArray(base,ids[2]*3);triangle.set(va,vb,vc);
    triangle.closestPointToPoint(point,closest);const d=closest.distanceToSquared(point);
    if(d<best){const bary=triangle.getBarycoord(closest,V());if(bary){best=d;winner={partID:anchor.partID,mesh,indices:ids,bary,distance:Math.sqrt(d)}}}
   }
  });
  if(!winner)throw Error(`No valid surface triangle for ${anchor.partID}`);this.surfaceBindings.set(key,winner);return winner;
 }
 surfacePoint(binding:SurfaceBinding){
  const pos=binding.mesh.geometry.getAttribute('position'),[a,b,c]=binding.indices,w=binding.bary;
  return binding.mesh.localToWorld(V().addScaledVector(V().fromBufferAttribute(pos,a),w.x).addScaledVector(V().fromBufferAttribute(pos,b),w.y).addScaledVector(V().fromBufferAttribute(pos,c),w.z));
 }
 restSurfacePoint(binding:SurfaceBinding){
  const part=this.parts.get(binding.partID)!,base=part.base[part.meshes.indexOf(binding.mesh)],[a,b,c]=binding.indices,w=binding.bary;
  return binding.mesh.localToWorld(V().addScaledVector(V().fromArray(base,a*3),w.x).addScaledVector(V().fromArray(base,b*3),w.y).addScaledVector(V().fromArray(base,c*3),w.z));
 }
 getAnchor(partID:string,restPointThree:[number,number,number]):ProjectedAnchor{
  const binding=this.bindSurface({partID,point:restPointThree}),world=this.surfacePoint(binding),ndc=world.clone().project(this.camera);
  const material=binding.mesh.material as T.MeshStandardMaterial,opacity=material.opacity;
  const ray=world.clone().sub(this.camera.position),distance=ray.length();this.annotationRay.set(this.camera.position,ray.normalize());this.annotationRay.far=Math.max(0,distance-.025);
  const hit=this.annotationRay.intersectObject(this.pavilion,true).find(h=>h.object instanceof T.Mesh&&(h.object.material as T.Material).opacity>.45);
  const occluded=!!hit,visible=ndc.z>=-1&&ndc.z<=1&&Math.abs(ndc.x)<=1&&Math.abs(ndc.y)<=1&&opacity>.18&&!occluded;
  return {partID,partId:partID,world:world.toArray() as [number,number,number],x:(ndc.x+1)*960,y:(1-ndc.y)*540,visible,occluded,opacity,distanceToSurface:binding.distance};
 }
 getAnnotationAnchors(s:FrameState):Record<string,ProjectedAnchor>{
  if(!this.manifest)return {};const out:Record<string,ProjectedAnchor>={};
  for(const [term,spec] of Object.entries(TERM_ANCHORS)){
   if(spec.scene!==s.scene)continue;
   // Each cue keeps one physical point for its full duration. A candidate
   // must be chosen while designing the shot, never switched per frame.
   out[term]=this.getAnchor(spec.partID,spec.point);
   if(TERM_LABELS[term])out[TERM_LABELS[term]]=out[term];
   if(term==='hipRafter')out.rafter=out[term];if(term==='hipDeck')out.deck=out[term];
  }
  const addGroup=(key:string,memberIds:string[])=>{
   if(!out[key])return;const points:T.Vector3[]=[];
   for(const id of memberIds){const part=this.parts.get(id)!;const box=new T.Box3().setFromObject(part.root);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(V(x,y,z).project(this.camera));}
   out[key].groupBounds={left:Math.min(...points.map(v=>(v.x+1)*960)),right:Math.max(...points.map(v=>(v.x+1)*960)),top:Math.min(...points.map(v=>(1-v.y)*540)),bottom:Math.max(...points.map(v=>(1-v.y)*540))};out[key].memberIds=memberIds;
  };
  addGroup('bent',['POST_FL','POST_FR','CROSS_FRONT','BRACE_X_FL','BRACE_X_FR']);
  addGroup('bracket',['DOU_FL','GONG_X_FL','GONG_Y_FL','CAP_FL']);
  if(s.scene==='gravity'&&s.line===4){
   // The fixed side-face points expose both fibers in one camera; numeric
   // probes below use these same surface positions, including biaxial bend.
   out.compression=this.getAnchor('PURLIN_Y_LEFT',[-1.59,4.1395,.396]);
   out.tension=this.getAnchor('PURLIN_Y_LEFT',[-1.59,4.0005,.396]);
   out['受压']=out.compression;out['受拉']=out.tension;
  }
  return out;
 }
 getPhysicsOverlay(s:FrameState):PhysicsOverlay{
  const u=s.line+s.lineProgress,p=this.blendedPose(s),out:PhysicsOverlay={mode:'none',label:'',unit:'',min:0,max:0,parts:[],displayGain:this.displayGain,signed:false,flow:false,opacity:0};
  if(s.scene==='gravity'){
   Object.assign(out,{mode:'path',label:'重量沿支承面传递',parts:FORCE_FOCUS_PARTS[Math.min(9,s.line)]??[],opacity:p.force});
   if(u>=4&&u<5.1){
    const member=this.physics.members.find(m=>m.id===177)!,ends=member.nodes.map(n=>{const v=this.nodes.get(String(n))!;return [v.x,-v.z,v.y]}) as [number[],number[]];
    const response=this.staticData.cases.gravity.response,top=sampleSigned(response,prepareCoordinate(member,ends,[-1.59,4.1395,.396]))!,bottom=sampleSigned(response,prepareCoordinate(member,ends,[-1.59,4.0005,.396]))!;
    Object.assign(out,{mode:'signed',label:'这段檩的拉压',unit:'MPa',signed:true,min:-response.members.PURLIN_Y_LEFT.sigmaMaxAbsPa/1e6,max:response.members.PURLIN_Y_LEFT.sigmaMaxAbsPa/1e6,parts:['PURLIN_Y_LEFT'],opacity:p.heat,probe:{topMPa:top/1e6,bottomMPa:bottom/1e6}});
   }else if(u>=6.1&&u<7){
    const scale=this.staticData.cases.gravity.response.members.POST_FL.sigmaMaxAbsPa/1e6;
    Object.assign(out,{mode:'signed',label:'柱身以轴压为主',unit:'MPa',signed:true,min:-scale,max:scale,parts:['POST_FL'],opacity:p.heat});
   }else if(u>=7&&u<8){const value=forceEvidence.gravitySupportReactions['1'][1];Object.assign(out,{mode:'reaction',label:'柱脚反力',unit:'N',max:value,parts:['STONE_FL','POST_FL']});}
  }else if(s.scene==='wind'){
   if(u<2){Object.assign(out,{mode:'flow',label:'风绕过屋檐，穿过柱间',flow:true,opacity:p.flow});}
   else if(u<3){Object.assign(out,{mode:'pressure',label:'屋面侧推与上掀',unit:'Pa',min:Math.min(...forceEvidence.panels.map(v=>v.pressure_Pa)),max:Math.max(...forceEvidence.panels.map(v=>v.pressure_Pa)),parts:forceEvidence.panels.map(v=>v.id),opacity:p.force});}
   else if(u<5.85){Object.assign(out,{mode:'path',label:u<4?'传到梁柱接头':u<5?'斜撑约束框架变斜':'槽面承压，木销限制退出',parts:u<4?['PURLIN_Y_LEFT','POST_FL']:u<5?['BRACE_X_FL','BRACE_X_FR']:['POST_FL','CROSS_FRONT','PEG_X_FL'],opacity:p.force});
    if(u>=4&&u<5){const response=this.staticData.cases.gravity_wind.response,scale=Math.max(response.members.BRACE_X_FL.sigmaMaxAbsPa,response.members.BRACE_X_FR.sigmaMaxAbsPa)/1e6;Object.assign(out,{mode:'signed',signed:true,label:'两侧斜撑的拉压',unit:'MPa',min:-scale,max:scale,opacity:p.heat});}
   }
   else{Object.assign(out,{mode:'envelope',label:'构件应力幅值',unit:'MPa',max:this.maxStress/1e6,parts:[...this.members.keys()],opacity:p.heat});}
  }
  return out;
 }
 updateForces(s:FrameState,p:Pose){
  const u=s.line+s.lineProgress,unitY=V(0,1,0),gravity=s.scene==='gravity';
  for(const route of this.routeVisuals){
   const matches=route.spec.scene==='wind'?s.scene==='wind':gravity;
   const active=matches?smooth((u-route.spec.start)/.32)*(1-smooth((u-route.spec.end)/.35)):0;
   const overview=gravity&&!route.spec.scene?smooth((u-9.0)/.35)*(1-smooth((u-9.65)/.35)):0;
   let amount=Math.max(active,overview*.7)*p.force;
   // Pause the explanatory moving dots during the signed-fiber close-up;
   // they otherwise cover the small but physically valid stress gradient.
   if(gravity&&['purlin-run','birdsmouth-seat'].includes(route.spec.id))amount*=1-scalar([[0,0],[3.85,0],[4.12,1],[4.9,1],[5.15,0],[10,0]],u);
   if(s.scene==='wind'&&u>=3&&u<4.3&&['corner-lap','cap-arm','arm-block','block-column'].includes(route.spec.id))amount=p.force*smooth((u-3)/.22)*(1-smooth((u-4)/.3));
   const points=route.bindings.map(b=>this.surfacePoint(b));
   route.segments.forEach((segment,i)=>{
    const a=points[i],b=points[i+1],direction=b.clone().sub(a),length=direction.length(),at=a.clone().lerp(b,.5);
    for(const mesh of [segment.core,segment.halo]){mesh.position.copy(at);mesh.quaternion.setFromUnitVectors(unitY,length>1e-8?direction.clone().normalize():unitY);mesh.scale.y=Math.max(.0001,length);}
    (segment.core.material as T.Material).opacity=amount*.88;(segment.halo.material as T.Material).opacity=amount*.16;
   });
   const lengths=points.slice(1).map((v,i)=>v.distanceTo(points[i])),total=lengths.reduce((a,b)=>a+b,0);
   route.dots.forEach((dot,k)=>{
    let d=((s.time*.31+k/3)%1)*total,segment=0;while(segment<lengths.length-1&&d>lengths[segment]){d-=lengths[segment];segment++}
    dot.position.copy(points[segment]).lerp(points[segment+1],clamp(d/Math.max(.000001,lengths[segment])));
    (dot.material as T.Material).opacity=route.spec.contact?0:amount*.94;
   });
   route.ring.position.copy(points.at(-1)!);route.ring.quaternion.copy(this.camera.quaternion);route.ring.scale.setScalar(1+.09*Math.sin(s.time*2.1));
   (route.ring.material as T.Material).opacity=route.spec.contact?amount*.88:0;
  }
  for(const load of this.loadArrows){
   let alpha=0;
   if(load.kind==='weight'&&gravity)alpha=p.force*scalar([[0,.7],[1,.7],[2.7,.3],[3.4,0],[8.9,0],[9.3,.35],[10,0]],u);
   if(load.kind==='wind'&&s.scene==='wind')alpha=p.force*scalar([[0,0],[.5,.7],[1.6,.3],[2.15,1],[2.9,.6],[3.4,0],[8,0]],u);
   if(load.kind==='reaction'&&gravity)alpha=p.force*scalar([[0,0],[6.9,0],[7.2,1],[7.8,1],[8.15,0],[9.1,0],[9.4,.55],[10,0]],u);
   const length=(load.kind==='reaction'?.58:.66)*(.7+load.amplitude*.55),tip=this.surfacePoint(load.anchor);
   load.arrow.position.copy(tip).addScaledVector(load.direction,-length);load.arrow.setDirection(load.direction);load.arrow.setLength(length,.15,.07);
   load.arrow.traverse(o=>{if(o instanceof T.Line||o instanceof T.Mesh)(o.material as T.Material).opacity=alpha});
   load.shaft.position.copy(tip).addScaledVector(load.direction,-(length+.12)*.5);load.shaft.quaternion.setFromUnitVectors(unitY,load.direction);load.shaft.scale.y=length-.12;(load.shaft.material as T.Material).opacity=alpha;
  }
  if(this.displacementMeasure){
   const {binding,rest,current,shaft,restRing}=this.displacementMeasure,a=this.restSurfacePoint(binding),b=this.surfacePoint(binding),direction=b.clone().sub(a),length=direction.length();
   const alpha=s.scene==='wind'?scalar([[0,0],[5.94,0],[6.08,1],[6.7,1],[7,0],[8,0]],u):0;
   rest.position.copy(a);current.position.copy(b);restRing.position.copy(a);restRing.quaternion.copy(this.camera.quaternion);
   shaft.position.copy(a).lerp(b,.5);shaft.quaternion.setFromUnitVectors(unitY,length>1e-8?direction.normalize():unitY);shaft.scale.y=Math.max(.00001,length);
   for(const mesh of [rest,current,shaft,restRing])(mesh.material as T.Material).opacity=alpha;
  }
 }
 buildFlow(){
  // Flow paths are integrated in the offline solver. No decorative sine curves.
  this.flowData.slices.forEach((slice:any,plane:number)=>{
  const paths=(slice.streamlines??[]).filter((path:number[][],i:number)=>i%2===0&&path.some(p=>p[1]<7&&p[1]>.3));if(!paths.length)throw Error('Actual flow solver streamlines missing');
  paths.forEach((path:number[][],i:number)=>{for(const z of [-slice.plane_y_m]){
   const points=path.map(v=>V(v[0],v[1],z));const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0x5f9697,transparent:true,opacity:0,depthWrite:false}));line.userData.plane=plane;line.frustumCulled=false;this.flowRoot.add(line);const dot=new T.Mesh(new T.SphereGeometry(.032,8,6),new T.MeshBasicMaterial({color:0x347e87,transparent:true,opacity:0}));this.flowRoot.add(dot);this.flowLines.push({line,points,dot,seed:i*.073+z*.03});
  }});});
 }
 render(s:FrameState){
  if(!this.manifest)return;
  this.latestState=s;
  const p=this.blendedPose(s),r=this.response(s),u=s.line+s.lineProgress;
  const signedParts=s.scene==='gravity'?[u<5.2?'PURLIN_Y_LEFT':'POST_FL']:s.scene==='wind'&&u>=3.95&&u<5?['BRACE_X_FL','BRACE_X_FR']:[];
  const signedMix=signedParts.length?p.heat:0;
  const frameDisplacement=new Map<string,number[]>();if(p.deform>0)for(const [id] of this.nodes){const a=r.a.nodalDisplacements[id],b=r.b.nodalDisplacements[id];frameDisplacement.set(id,[mix(a[0],b[0],r.t),mix(a[2],b[2],r.t),-mix(a[1],b[1],r.t)]);}
  this.camera.position.copy(p.position);this.camera.lookAt(p.target);this.camera.updateMatrixWorld(true);
  for(const part of this.parts.values()){
   const partQ=this.getPartAssemblyQ(part.info.id,s,p);part.offset.copy(this.offset(part.info,partQ));part.root.position.copy(part.offset);
   const stressA=r.a.members[part.info.id]?.sigmaMaxAbsPa,stressB=r.b.members[part.info.id]?.sigmaMaxAbsPa;
   const stress=stressA===undefined?undefined:mix(stressA,stressB??stressA,r.t);
   part.meshes.forEach((mesh,k)=>{const material=mesh.material as T.MeshStandardMaterial,base=material.userData.baseColor as T.Color;material.color.copy(base);
    const localHeat=p.heat*(signedParts.length?(signedParts.includes(part.info.id)?1:0):1);
    const focus=FORCE_FOCUS_PARTS[Math.min(9,s.line)]??[],focusPrevious=FORCE_FOCUS_PARTS[Math.max(0,s.line-1)]??[];
    const focusAmount=s.scene==='gravity'?mix(focusPrevious.includes(part.info.id)?1:0,focus.includes(part.info.id)?1:0,smooth(s.lineProgress/.3)):0;
    material.emissive.set('#bc793d');material.emissiveIntensity=focusAmount*.075*p.force;
    material.userData.physicsMapBlend.value=stress!==undefined?localHeat:0;
    if(stress!==undefined&&localHeat>0){
     mesh.userData.hadHeat=true;material.color.setRGB(1,1,1);const colors=mesh.geometry.getAttribute('color') as T.BufferAttribute;
     const signedResponse=s.scene==='wind'?this.staticData.cases.gravity_wind.response:this.staticData.cases.gravity.response;
     const signedScale=Math.max(1,...signedParts.map(id=>signedResponse.members[id]?.sigmaMaxAbsPa??1));
     for(let i=0;i<colors.count;i++){
      const coordinate=part.stressCoordinates[k][i];let color=base.clone();
      if(coordinate&&localHeat>0){const a=sampleEnvelope(r.a,coordinate),b=sampleEnvelope(r.b,coordinate);if(a!==undefined){const envelope=this.heatColor(mix(a,b??a,r.t));
       if(signedMix>0&&signedParts.includes(part.info.id)){const signed=sampleSigned(r.a,coordinate);if(signed!==undefined){const c=new T.Color('#ece4cc'),amp=clamp(Math.abs(signed)/signedScale);c.lerp(new T.Color(signed<0?'#347f91':'#bd4c39'),amp);envelope.copy(c)}}
       color.lerp(envelope,localHeat);
      }}colors.setXYZ(i,color.r,color.g,color.b);
     }colors.needsUpdate=true;
    }else if(mesh.userData.hadHeat){const colors=mesh.geometry.getAttribute('color') as T.BufferAttribute; (colors.array as Float32Array).fill(1);colors.needsUpdate=true;mesh.userData.hadHeat=false;}
    const pressureID=part.info.id.replace(/^TILE_/,'DECK_');
    if(p.inverse>0&&this.inverseData.panel_ids?.includes(pressureID)){
     const index=this.inverseData.panel_ids.indexOf(pressureID);const truth=this.inverseData.pressure_truth_Cp;const estimate=this.inverseData.pressure_recovered_Cp;
     if(truth&&estimate){let value=mix(truth[index],estimate[index],smooth(clamp((s.progress-.5)/.35)));
      const steps=this.inverseData.diffusion_snapshots;if(s.progress>.22&&s.progress<.52&&steps?.length){const j=clamp((s.progress-.22)/.3)*(steps.length-1),i=Math.floor(j);value=mix(steps[i].Cp[index],steps[Math.min(i+1,steps.length-1)].Cp[index],j-i)}
      const c=new T.Color('#468a98').lerp(new T.Color('#bd563d'),clamp((value+.65)/1.3));material.color.lerp(c,p.inverse);material.userData.physicsMapBlend.value=p.inverse;}
    }
    const post=part.info.id==='POST_FL',tile=part.info.id.startsWith('TILE_'),deck=part.info.id.startsWith('DECK_');
    let roofCut=0;
    if(s.scene==='gravity'){
     const reveal=tile?scalar([[0,0],[.8,0],[1.25,.82],[2,.965],[8.95,.965],[9.55,.24],[10,0]],u):scalar([[0,0],[1.7,0],[2.2,.965],[8.95,.965],[9.55,.25],[10,0]],u);
     roofCut=(tile||deck)?reveal:0;
     if(tile&&u<1)material.color.lerp(new T.Color('#d5d3c8'),.35*p.force);
    }
    if(s.scene==='wind')roofCut=(tile||deck)?scalar([[0,0],[2.7,0],[3.2,.87],[6.9,.87],[7.55,0],[8,0]],u):0;
    if(s.scene==='hip'&&tile)roofCut=scalar([[0,0],[3.6,0],[3.92,.8],[4.45,.8],[4.95,0],[5,0]],u);
    let contextCut=0;
    if(s.scene==='gravity'){
     const clear=scalar([[0,0],[1.65,0],[2.1,.945],[8.9,.945],[9.55,0],[10,0]],u);
     if(part.info.id.startsWith('RAF_')&&part.info.id!=='RAF_3_03')contextCut=clear;
     if(part.info.id.startsWith('HIP_')||part.info.id==='HUB'||part.info.id==='CENTRE_POST')contextCut=clear*.96;
     if(part.info.id==='RAF_3_03')contextCut=clear*scalar([[0,0],[3.8,0],[4.12,1],[7.75,1],[8.15,0],[10,0]],u);
     const fiberClose=scalar([[0,0],[3.85,0],[4.2,.99],[4.9,.99],[5.15,0],[10,0]],u);
     if(part.info.id!=='PURLIN_Y_LEFT'&&!part.info.id.startsWith('STONE_')&&part.info.role!=='base')contextCut=Math.max(contextCut,fiberClose);
    }
    if(s.scene==='wind'&&/^RAF_|^HIP_/.test(part.info.id))contextCut=scalar([[0,0],[2.8,0],[3.2,.73],[5.75,.73],[6.2,.25],[7.3,.25],[7.6,0],[8,0]],u);
    material.opacity=Math.min(post?1-p.cut*.75:1,1-roofCut,1-contextCut);material.transparent=material.opacity<.999;material.depthWrite=material.opacity>.95;
    const pos=mesh.geometry.getAttribute('position') as T.BufferAttribute,original=part.base[k];
    if(p.deform>0){
     const gain=p.deform*this.displayGain;
     for(let i=0;i<pos.count;i++){let x=0,y=0,z=0;for(const w of part.nodeWeights[k][i]){const d=frameDisplacement.get(w.node)!;x+=d[0]*w.weight;y+=d[1]*w.weight;z+=d[2]*w.weight}pos.setXYZ(i,original[i*3]+x*gain,original[i*3+1]+y*gain,original[i*3+2]+z*gain)}
     pos.needsUpdate=true;mesh.userData.deformed=true;mesh.geometry.computeBoundingSphere();
    }else if(mesh.userData.deformed){(pos.array as Float32Array).set(original);pos.needsUpdate=true;mesh.userData.deformed=false;mesh.geometry.computeBoundingSphere();}
    // Beam section fields are interpolated onto the mesh; mortise contact stress is not solved.
   });
  }
  this.pavilion.updateMatrixWorld(true);this.updateForces(s,p);
  for(const f of this.flowLines){const phase=((s.time*.09+f.seed)%1+1)%1;const index=clamp(phase)*(f.points.length-1),i=Math.floor(index);f.dot.position.copy(f.points[i]).lerp(f.points[Math.min(i+1,f.points.length-1)],index-i);const central=smooth(clamp((u-1.35)/.45)),weight=f.line.userData.plane===1?central:1-central;(f.line.material as T.LineBasicMaterial).opacity=p.flow*.43*weight;(f.dot.material as T.MeshBasicMaterial).opacity=p.flow*.88*weight;}
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();const m=Array.isArray(o.material)?o.material:[o.material];m.forEach(x=>x.dispose())}});this.woodGrain.dispose();this.environment.dispose();this.renderer.dispose();}
}
