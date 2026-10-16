import * as T from 'three';

export type CinematicStageOptionsV5={shadows?:boolean;shadowMapSize?:number;exposure?:number};
export type CinematicStageV5={
 group:T.Group;
 update:(focus:T.Vector3|[number,number,number])=>void;
 prepareModels:(root:T.Object3D)=>void;
 dispose:()=>void;
};

/** Pale seamless studio, not a corridor of boards. Install instead of the old
 * hemisphere/key/fill/floor/pillars block. Existing PMREM environment may stay.
 * One moving shadow frustum covers the active mechanism without allocating
 * a separate shadow map for every station. No clocks, random or post effects. */
export function createCinematicStageV5(
 scene:T.Scene,
 renderer:T.WebGLRenderer,
 options:CinematicStageOptionsV5={},
):CinematicStageV5{
 const group=new T.Group();group.name='cinematic-stage-v5';scene.add(group);
 renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;
 renderer.toneMappingExposure=options.exposure??.92;
 renderer.shadowMap.enabled=options.shadows!==false;
 renderer.shadowMap.type=T.PCFSoftShadowMap;
 scene.background=new T.Color('#edf1e9');
 scene.fog=new T.Fog('#edf1e9',34,72);

 const hemi=new T.HemisphereLight(0xe8f5f6,0xa7ac9b,.62);group.add(hemi);
 const key=new T.DirectionalLight(0xffedcf,3.2);key.name='warm-large-key';
 key.castShadow=options.shadows!==false;
 const shadowSize=options.shadowMapSize??1536;
 key.shadow.mapSize.set(shadowSize,shadowSize);
 Object.assign(key.shadow.camera,{left:-11,right:11,top:10,bottom:-8,near:.5,far:45});
 key.shadow.camera.updateProjectionMatrix();
 key.shadow.normalBias=.018;key.shadow.bias=-.00008;key.shadow.radius=3;
 const fill=new T.DirectionalLight(0xc4dfe6,.82);fill.name='cool-camera-fill';
 const rim=new T.DirectionalLight(0xe3fff1,2.05);rim.name='glass-edge-rim';
 group.add(key,key.target,fill,fill.target,rim,rim.target);

 // A fixed, tiny-scale texture makes grazing highlights feel like a finished
 // satin surface. It is seeded offline-style data, not render-order noise.
 const pixels=new Uint8Array(64*64*4);let seed=0x51af317;
 for(let i=0;i<64*64;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const level=226+Math.round((seed/4294967296)*25);
  pixels.set([level,level,level,255],i*4);
 }
 const grain=new T.DataTexture(pixels,64,64,T.RGBAFormat);grain.needsUpdate=true;
 grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(110,35);
 grain.magFilter=T.LinearFilter;grain.minFilter=T.LinearFilter;
 const floorMaterial=new T.MeshStandardMaterial({color:0xe1e8df,roughness:.53,roughnessMap:grain,metalness:.06});
 const floor=new T.Mesh(new T.PlaneGeometry(230,80),floorMaterial);
 floor.name='continuous-satin-floor';floor.rotation.x=-Math.PI/2;floor.position.set(80,-2.80,-6);
 floor.receiveShadow=true;group.add(floor);

 // Curved cyclorama eliminates the horizontal seam and repeating vertical
 // poles. It lives behind every mechanism and never crosses the action plane.
 const positions:number[]=[],indices:number[]=[];
 const ringCount=24;
 for(let row=0;row<=ringCount+1;row++){
  const angle=Math.min(row,ringCount)/ringCount*Math.PI/2;
  const y=row===ringCount+1?15:-2.80+8*(1-Math.cos(angle));
  const z=-5.7-8*Math.sin(angle);
  positions.push(-35,y,z,195,y,z);
  if(row){const a=(row-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
 }
 const coveGeometry=new T.BufferGeometry();coveGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));coveGeometry.setIndex(indices);coveGeometry.computeVertexNormals();
 const cove=new T.Mesh(coveGeometry,new T.MeshStandardMaterial({color:0xeff2e9,roughness:.92,metalness:0,side:T.DoubleSide}));
 cove.name='seamless-curved-cyclorama';group.add(cove);

 // Broad contact pools survive machines where shadow sampling is disabled.
 // These are subtle grounding layers, not baked claims about simulation.
 const alpha=new Uint8Array(128*128*4);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const nx=(x-63.5)/63.5,ny=(y-63.5)/63.5,r=nx*nx+ny*ny;
  const a=Math.max(0,Math.exp(-3.2*r)-Math.exp(-3.2))/(1-Math.exp(-3.2));
  const p=(y*128+x)*4;alpha.set([40,62,58,Math.round(a*37)],p);
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
  // Text planes and transparent glass must not cast opaque rectangle shadows.
  const solid=materials.every(material=>(material as T.MeshStandardMaterial).isMeshStandardMaterial&&!material.transparent&&material.opacity>=.99);
  mesh.castShadow=solid;mesh.receiveShadow=solid;
  for(const material of materials){
   const standard=material as T.MeshStandardMaterial;
   if(standard.isMeshStandardMaterial){standard.envMapIntensity=.82;standard.roughness=Math.max(.20,standard.roughness);}
  }
 });
 const update=(focus:T.Vector3|[number,number,number])=>{
  const f=Array.isArray(focus)?new T.Vector3(...focus):focus;
  const x=f.x;
  key.position.set(x-7.5,12,7);key.target.position.set(x,-.5,0);
  fill.position.set(x+8,5.2,10);fill.target.position.set(x,.2,0);
  rim.position.set(x+3,8.2,-9);rim.target.position.set(x,.5,0);
  group.updateMatrixWorld(true);
 };
 update([0,0,0]);
 return{group,update,prepareModels,dispose(){
  scene.remove(group);
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  group.traverse(object=>{const mesh=object as T.Mesh;if(mesh.isMesh){geometries.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(material);}});
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
  grain.dispose();contactMap.dispose();key.shadow.map?.dispose();
 }};
}
