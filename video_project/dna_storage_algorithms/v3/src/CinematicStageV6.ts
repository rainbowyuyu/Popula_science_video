import * as T from 'three';

export type CinematicStageOptionsV6={shadows?:boolean;shadowMapSize?:number;exposure?:number};
export type CinematicStageV6={
 group:T.Group;
 update:(focus:T.Vector3|[number,number,number])=>void;
 prepareModels:(root:T.Object3D)=>void;
 dispose:()=>void;
};

/** A real, procedural radiance environment. The bright softboxes and dark
 * negative-fill wall are baked by PMREM into the reflections used by every
 * physical material. They are deliberately not added to the visible scene.
 * Generated here from original geometry; no HDRI download/license dependency. */
function makeStudioEnvironment(renderer:T.WebGLRenderer){
 const studio=new T.Scene();
 const shell=new T.Mesh(new T.BoxGeometry(30,22,30),new T.MeshBasicMaterial({color:new T.Color('#b8c9ca').multiplyScalar(.14),side:T.BackSide}));
 studio.add(shell);
 const panel=(name:string,position:number[],width:number,height:number,color:string,intensity:number,target:number[]=[0,0,0])=>{
  const mesh=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(intensity),side:T.DoubleSide}));
  mesh.name=name;mesh.position.set(position[0],position[1],position[2]);mesh.lookAt(new T.Vector3(...target));studio.add(mesh);
 };
 // Large warm key reflection, narrow cool rim, ceiling bounce, and deliberately
 // dark opposite side. This produces recognisable edges on clear glass/metal.
 panel('warm-overhead-softbox',[-5,7,5],7,5,'#fff1da',5.2);
 panel('cool-vertical-strip',[5,3,-5],1.45,8,'#c8eeff',3.5);
 panel('long-ceiling-bounce',[-1,9,-2],9,2.5,'#effbff',1.4);
 panel('subtle-front-reflector',[3,2,7],2.5,5,'#d3e6e5',.65);
 panel('negative-fill',[8,1,0],7,12,'#10232b',.045);
 panel('lower-warm-bounce',[-3,-5,2],9,4,'#e9dac0',.26);
 const pmrem=new T.PMREMGenerator(renderer);
 pmrem.compileCubemapShader();
 const target=pmrem.fromScene(studio,.035,.1,100);
 target.texture.name='DNA-V6-original-studio-PMREM';
 studio.traverse(object=>{if(object instanceof T.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
 pmrem.dispose();
 return target;
}

/** Continuous ivory laboratory with a single directionally lit volume.
 * Light direction and reflection cards never rotate with the camera. Only the
 * shadow-map centre translates along the continuous camera target. This is
 * deterministic for random-access frame rendering and avoids lighting cuts. */
export function createCinematicStageV6(
 scene:T.Scene,
 renderer:T.WebGLRenderer,
 options:CinematicStageOptionsV6={},
):CinematicStageV6{
 const group=new T.Group();group.name='cinematic-stage-v6';scene.add(group);
 renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;
 renderer.toneMappingExposure=options.exposure??.98;
 renderer.shadowMap.enabled=options.shadows!==false;
 renderer.shadowMap.type=T.VSMShadowMap;
 scene.background=new T.Color('#eef1e9');
 scene.fog=new T.Fog('#eef1e9',38,82);
 const originalEnvironment=scene.environment;
 const environment=makeStudioEnvironment(renderer);scene.environment=environment.texture;

 // Low fill keeps readable shaded faces. The warm key is high and left;
 // cool rim separates clear vessels from the warm paper-white cyclorama.
 const hemi=new T.HemisphereLight(0xd8edf4,0xb8a894,.25);group.add(hemi);
 const key=new T.DirectionalLight(0xffedce,2.65);key.name='warm-large-key';
 key.castShadow=options.shadows!==false;
 const shadowSize=options.shadowMapSize??2048;
 key.shadow.mapSize.set(shadowSize,shadowSize);
 Object.assign(key.shadow.camera,{left:-11.5,right:11.5,top:10.5,bottom:-8.5,near:.5,far:45});
 key.shadow.camera.updateProjectionMatrix();
 key.shadow.normalBias=.025;key.shadow.bias=-.00008;key.shadow.radius=5;key.shadow.blurSamples=6;
 const fill=new T.DirectionalLight(0xc3e1f1,.30);fill.name='restrained-cool-fill';
 const rim=new T.DirectionalLight(0xd5edff,1.65);rim.name='glass-edge-rim';
 group.add(key,key.target,fill,fill.target,rim,rim.target);

 // Fixed satin microtexture: only roughness changes, never colour speckling.
 const pixels=new Uint8Array(64*64*4);let seed=0x51af317;
 for(let i=0;i<64*64;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const level=229+Math.round((seed/4294967296)*21);
  pixels.set([level,level,level,255],i*4);
 }
 const grain=new T.DataTexture(pixels,64,64,T.RGBAFormat);grain.needsUpdate=true;
 grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(110,35);
 grain.magFilter=T.LinearFilter;grain.minFilter=T.LinearFilter;
 const floorMaterial=new T.MeshStandardMaterial({color:0xdfe4d9,roughness:.66,roughnessMap:grain,metalness:.025,envMapIntensity:.38});
 const floor=new T.Mesh(new T.PlaneGeometry(230,80),floorMaterial);
 floor.name='continuous-satin-floor';floor.rotation.x=-Math.PI/2;floor.position.set(80,-2.80,-6);
 floor.receiveShadow=true;group.add(floor);

 // One smooth, softly coloured cove replaces an empty flat white clear colour.
 // Its normals create a gentle lighting gradient while staying behind content.
 const positions:number[]=[],indices:number[]=[];
 const ringCount=36;
 for(let row=0;row<=ringCount+1;row++){
  const angle=Math.min(row,ringCount)/ringCount*Math.PI/2;
  const y=row===ringCount+1?17:-2.80+8*(1-Math.cos(angle));
  const z=-5.7-8*Math.sin(angle);
  positions.push(-35,y,z,195,y,z);
  if(row){const a=(row-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
 }
 const coveGeometry=new T.BufferGeometry();coveGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));coveGeometry.setIndex(indices);coveGeometry.computeVertexNormals();
 const cove=new T.Mesh(coveGeometry,new T.MeshStandardMaterial({color:0xe2e9df,roughness:.95,metalness:0,envMapIntensity:.3,side:T.DoubleSide}));
 cove.name='seamless-curved-cyclorama';group.add(cove);

 // Soft floor occlusion is an illustrative grounding effect. It is kept low
 // enough to avoid a grey blob under floating data or a false simulation claim.
 const alpha=new Uint8Array(128*128*4);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const nx=(x-63.5)/63.5,ny=(y-63.5)/63.5,r=nx*nx+ny*ny;
  const a=Math.max(0,Math.exp(-4.0*r)-Math.exp(-4.0))/(1-Math.exp(-4.0));
  alpha.set([42,58,57,Math.round(a*31)],(y*128+x)*4);
 }
 const contactMap=new T.DataTexture(alpha,128,128,T.RGBAFormat);contactMap.needsUpdate=true;
 contactMap.magFilter=T.LinearFilter;contactMap.minFilter=T.LinearFilter;
 const contactMaterial=new T.MeshBasicMaterial({map:contactMap,transparent:true,depthWrite:false,toneMapped:false});
 for(let i=0;i<9;i++){
  const contact=new T.Mesh(new T.PlaneGeometry(12.8,7.2),contactMaterial);
  contact.name=`grounding-shadow-${i}`;contact.rotation.x=-Math.PI/2;contact.position.set(i*20,-2.793,0);group.add(contact);
 }

 const prepareModels=(root:T.Object3D)=>root.traverse(object=>{
  if(!(object as T.Mesh).isMesh)return;
  const mesh=object as T.Mesh;
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  // Text planes and transparent glass cannot cast opaque rectangle shadows.
  const solid=materials.every(material=>{
   const physical=material as T.MeshPhysicalMaterial;
   return physical.isMeshStandardMaterial&&!physical.transparent&&physical.opacity>=.99&&!(physical.transmission>0);
  });
  mesh.castShadow=solid;mesh.receiveShadow=solid;
  for(const material of materials){
   const standard=material as T.MeshPhysicalMaterial;
   if(standard.isMeshStandardMaterial){
    const optical=standard.transmission>0||(standard.transparent&&standard.opacity<.65);
    standard.envMapIntensity=optical?1.2:standard.metalness>.5?.95:.72;
    // Preserve material-specific roughness, clearcoat and transmission from
    // the models. No global clamp that turns glass or metal into chalk.
   }
  }
 });
 const update=(focus:T.Vector3|[number,number,number])=>{
  const x=Array.isArray(focus)?focus[0]:focus.x;
  key.position.set(x-7.5,12,7);key.target.position.set(x,-.5,0);
  fill.position.set(x+8,5.2,10);fill.target.position.set(x,.2,0);
  rim.position.set(x+3,8.2,-9);rim.target.position.set(x,.5,0);
  group.updateMatrixWorld(true);
 };
 update([0,0,0]);
 return{group,update,prepareModels,dispose(){
  scene.remove(group);
  if(scene.environment===environment.texture)scene.environment=originalEnvironment;
  environment.dispose();
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  group.traverse(object=>{const mesh=object as T.Mesh;if(mesh.isMesh){geometries.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);}});
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
  grain.dispose();contactMap.dispose();key.shadow.dispose();
 }};
}
