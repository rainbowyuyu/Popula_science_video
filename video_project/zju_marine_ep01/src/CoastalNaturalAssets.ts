import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {staticFile} from 'remotion';

/**
 * Small asynchronous loader for the CC0 Poly Haven vegetation used by the
 * campus shots.  The main campus stays synchronous so existing camera rails
 * keep their exact coordinates; callers that want deterministic first-frame
 * capture can await `ready` before rendering.
 */
export type CoastalNaturalAssets={group:T.Group;ready:Promise<void>;dispose:()=>void};
export type NaturalTreePlacement={x:number;y:number;z:number;scale:number;variant?:number;rotation?:number;broadleaf?:boolean;forest?:boolean};
export type NaturalShrubPlacement={x:number;y:number;z:number;height:number;width?:number;rotation?:number};

const setMeshFlags=(root:T.Object3D)=>root.traverse(o=>{
  const m=o as T.Mesh;
  if(!m.isMesh)return;
  m.castShadow=true;m.receiveShadow=true;m.frustumCulled=true;
  const materials=Array.isArray(m.material)?m.material:[m.material];
  for(const x of materials){
    const p=x as T.MeshStandardMaterial;
    p.side=T.DoubleSide;
    p.roughness=Math.max(.42,p.roughness??.75);
    p.envMapIntensity=.75;
  }
});

function loadTexture(loader:T.TextureLoader,path:string,colorSpace:T.ColorSpace,repeatX:number,repeatY:number){
 return loader.loadAsync(staticFile(path)).then(texture=>{
   texture.colorSpace=colorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;
   texture.repeat.set(repeatX,repeatY);texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=true;texture.anisotropy=8;return texture;
 });
}

/** Add the Poly Haven grass-ground PBR maps to the existing campus terrain.
 * This changes material response only; it does not add a second terrain mesh,
 * so there is no z-fighting with the shoreline slope or road kerbs. */
export function loadGrassGroundMaterial(material:T.MeshStandardMaterial):Promise<void>{
 const loader=new T.TextureLoader();
 return Promise.all([
   loadTexture(loader,'models/v8-city/grass_ground_coastal_grade.jpg',T.SRGBColorSpace,1,1),
   loadTexture(loader,'models/polyhaven/grass_ground/textures/grass_ground_nor_gl_2k.jpg',T.NoColorSpace,1,1),
   loadTexture(loader,'models/polyhaven/grass_ground/textures/grass_ground_arm_2k.jpg',T.NoColorSpace,1,1),
 ]).then(([map,normal,arm])=>{
   material.map=map;material.normalMap=normal;material.roughnessMap=arm;
   material.color.set('#e8edda');
   material.roughness=.91;material.metalness=.0;material.normalScale.set(.22,.22);
   material.needsUpdate=true;
 });
}

/** CC0 scanned architectural surfaces. Metric UVs are authored by Campus.box;
 * no world-projection shader hooks, so these maps work in WebGL and WebGPU. */
export async function loadCampusSurfaceMaterials(materials:{asphalt:T.MeshStandardMaterial;concrete:T.MeshStandardMaterial;brick:T.MeshStandardMaterial;brickCool:T.MeshStandardMaterial;sand?:T.MeshStandardMaterial;rocks?:T.MeshStandardMaterial[]}){
 const loader=new T.TextureLoader();
 const apply=async(asset:string,targets:T.MeshStandardMaterial[],normalStrength:number)=>{
  const base=`models/v7-city/${asset}`;
  const [map,normal,rough]=await Promise.all([loadTexture(loader,`${base}/diff.jpg`,T.SRGBColorSpace,1,1),loadTexture(loader,`${base}/normal.jpg`,T.NoColorSpace,1,1),loadTexture(loader,`${base}/rough.jpg`,T.NoColorSpace,1,1)]);
  for(const m of targets){m.map=map;m.normalMap=normal;m.roughnessMap=rough;m.normalScale.set(normalStrength,normalStrength);m.color.set(asset==='asphalt_02'?'#a8b1b1':asset==='brick_wall_001'?'#d8c6af':'#e5e5dc');m.metalness=0;m.roughness=.90;m.needsUpdate=true;}
 };
 await Promise.all([apply('asphalt_02',[materials.asphalt],.22),apply('concrete_layers_02',[materials.concrete],.18),apply('brick_wall_001',[materials.brick,materials.brickCool],.28)]);
 materials.brickCool.map=materials.concrete.map;materials.brickCool.normalMap=materials.concrete.normalMap;materials.brickCool.roughnessMap=materials.concrete.roughnessMap;materials.brickCool.color.set('#c8d2cf');
 const landscape=async(asset:string,targets:T.MeshStandardMaterial[],strength:number)=>{
  const base=`models/v8-city/${asset}`,maps=await Promise.all([loadTexture(loader,`${base}/diff.jpg`,T.SRGBColorSpace,1,1),loadTexture(loader,`${base}/normal.jpg`,T.NoColorSpace,1,1),loadTexture(loader,`${base}/rough.jpg`,T.NoColorSpace,1,1)]);
  for(const m of targets){[m.map,m.normalMap,m.roughnessMap]=maps;m.normalScale.set(strength,strength);m.roughness=.96;m.metalness=0;m.envMapIntensity=.38;m.needsUpdate=true;}
 };
 await Promise.all([materials.sand?landscape('coast_sand_rocks_02',[materials.sand],.58):Promise.resolve(),materials.rocks?.length?landscape('rock_boulder_dry',materials.rocks,.82):Promise.resolve()]);
}

/** Load one high-quality conifer source and instance a handful of hero trees.
 * The model contains three author-authored variants as scene children; clones
 * share the original BufferGeometry/texture resources and are placed at the
 * road/campus edge for readable parallax. Distant rows remain procedural. */
export function loadCoastalNaturalAssets(parent:T.Object3D,placements?:NaturalTreePlacement[],shrubs:NaturalShrubPlacement[]=[]):CoastalNaturalAssets{
 const group=new T.Group();group.name='PolyHavenCoastalVegetation';parent.add(group);
 const loader=new GLTFLoader();
 const requested=placements??[
   {x:-898,y:2.2,z:230,scale:8.4,variant:0,rotation:0},
   {x:-906,y:2.2,z:-18,scale:7.1,variant:1,rotation:1.73},
   {x:-898,y:2.2,z:-260,scale:6.7,variant:2,rotation:3.46},
   {x:-927,y:2.2,z:-474,scale:5.6,variant:1,rotation:5.19},
 ];
 // Blender-decimated CC0 variant: 14–18k triangles per tree, preserving the
 // branch/twig maps while keeping the four near-shore instances below 1.2M
 // triangles in the full shot.
 const useBroadleaf=(p:NaturalTreePlacement,i:number)=>p.forest===true||p.broadleaf===true||(p.x>-1220&&((p.x>-900&&Math.abs(p.z)<340)||i%5===0));
 const firRequested=requested.filter((p,i)=>!useBroadleaf(p,i));
 const firReady=loader.loadAsync(staticFile('models/polyhaven/fir_sapling_lod/fir_sapling_lod.gltf')).then(asset=>{
   const variants=asset.scene.children.length?asset.scene.children: [asset.scene];
   asset.scene.updateMatrixWorld(true);
   // One InstancedMesh per authored source part and variant.  The source has
   // branch and twig materials; their geometry and maps remain shared across
   // every tree, so 68 trees stay below ~1.2M triangles and do not multiply
   // texture memory.
   const sourceParts=variants.map(source=>{
     const parts:T.Mesh[]=[];source.traverse(o=>{const m=o as T.Mesh;if(m.isMesh)parts.push(m);});return parts;
   });
   const counts=variants.map((_,variant)=>firRequested.filter(p=>(p.variant??variant)%variants.length===variant).length);
   for(let variant=0;variant<variants.length;variant++){
     const count=counts[variant];if(!count)continue;
     for(const part of sourceParts[variant]){
       const materials=Array.isArray(part.material)?part.material:[part.material];
       // The current Poly Haven tree uses one material per part.  If a future
       // source contains slots, keep its first slot for InstancedMesh and let
       // the source asset's manifest document the limitation.
       const material=materials[0];setMeshFlags(part);
       const foliage=material as T.MeshStandardMaterial;
       if(foliage.alphaTest>0||foliage.transparent){foliage.alphaTest=.20;foliage.alphaToCoverage=true;foliage.transparent=false;foliage.depthWrite=true;foliage.side=T.DoubleSide;}
       const inst=new T.InstancedMesh(part.geometry,material,count);
       inst.name=`PolyHavenFir_Instanced_v${variant}_${part.name}`;inst.castShadow=true;inst.receiveShadow=true;inst.frustumCulled=true;
       inst.instanceMatrix.setUsage(T.StaticDrawUsage);
       let index=0;for(const placement of firRequested){if((placement.variant??0)%variants.length!==variant)continue;
         const pos=new T.Vector3(placement.x,placement.y,placement.z);
         const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),placement.rotation??0);
         // Normalize each authored variant by its actual world-space height.
         // Avoid the old hard-coded multiplier that produced huge needle trees.
         const sourceBounds=new T.Box3().setFromObject(variants[variant]);
         const sourceHeight=sourceBounds.max.y-sourceBounds.min.y;
         const worldScale=placement.scale/Math.max(.1,sourceHeight);
         const s=new T.Vector3(worldScale,worldScale,worldScale);
         const origin=new T.Matrix4().makeTranslation(0,-sourceBounds.min.y,0);
         const local=new T.Matrix4().compose(pos,q,s).multiply(origin).multiply(part.matrixWorld);
         inst.setMatrixAt(index++,local);
       }
       inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();group.add(inst);
     }
   }
   (group.userData as any).treeCount=requested.length;
   (group.userData as any).source='Poly Haven fir_sapling CC0 1.0, Blender decimated LOD';
 }).catch(error=>{
   // A missing optional asset must never prevent the episode from rendering.
   group.userData.loadError=String(error);return undefined;
 });
 const broadleafReady=loader.loadAsync(staticFile('models/v7-city/tree_small_02_lod/tree_small_02_lod.glb')).then(asset=>{
  const selected=requested.filter((p,i)=>useBroadleaf(p,i)&&!p.forest);asset.scene.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(asset.scene),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  const normalize=new T.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z);
  asset.scene.traverse(o=>{const part=o as T.Mesh;if(!part.isMesh)return;setMeshFlags(part);
   const m=(Array.isArray(part.material)?part.material[0]:part.material) as T.MeshStandardMaterial;
   if(/leav/i.test(m.name)){m.alphaTest=.20;m.alphaToCoverage=true;m.transparent=false;m.depthWrite=true;m.roughness=.85;m.side=T.DoubleSide;}
   const inst=new T.InstancedMesh(part.geometry,m,selected.length);inst.name='PolyHavenBroadleaf_'+part.name;inst.castShadow=inst.receiveShadow=true;inst.frustumCulled=true;
   selected.forEach((placement,index)=>{const height=placement.scale*(placement.x>-890?1.22:1.4),scale=height/size.y;const matrix=new T.Matrix4().compose(new T.Vector3(placement.x,placement.y,placement.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),placement.rotation??0),new T.Vector3(scale,scale,scale)).multiply(normalize).multiply(part.matrixWorld);inst.setMatrixAt(index,matrix);});inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();group.add(inst);
  });
  group.userData.broadleafCount=selected.length;group.userData.broadleafSource='Poly Haven tree_small_02 CC0, source 2.06M triangles -> Blender LOD 267,998 triangles, normalized to world metres';
 });
 const forestReady=loader.loadAsync(staticFile('models/v8-city/tree_small_02_forest.glb')).then(asset=>{
  const selected=requested.filter(p=>p.forest);asset.scene.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(asset.scene),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),normalize=new T.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z);
  asset.scene.traverse(o=>{const part=o as T.Mesh;if(!part.isMesh)return;setMeshFlags(part);const m=(Array.isArray(part.material)?part.material[0]:part.material) as T.MeshStandardMaterial;
   if(/leav/i.test(m.name)){m.alphaTest=.12;m.alphaToCoverage=true;m.transparent=false;m.depthWrite=true;m.roughness=.90;m.side=T.DoubleSide;}
   const inst=new T.InstancedMesh(part.geometry,m,selected.length);inst.name='ScannedForestLOD_'+part.name;inst.castShadow=inst.receiveShadow=true;
   selected.forEach((p,i)=>{const sy=p.scale/size.y,sxz=sy*(.88+(i%7)*.045),matrix=new T.Matrix4().compose(new T.Vector3(p.x,p.y,p.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),p.rotation??0),new T.Vector3(sxz,sy,sxz)).multiply(normalize).multiply(part.matrixWorld);inst.setMatrixAt(i,matrix);inst.setColorAt(i,new T.Color().setHSL(.25+(i%5)*.008,.04+(i%3)*.015,.80+(i%4)*.035));});
   inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();group.add(inst);
  });group.userData.forestCount=selected.length;group.userData.forestSource='Poly Haven tree_small_02, Blender reduced to 19798 triangles, crown sizes 18-30m for distant forest only';
 });
 const shrubReady=shrubs.length?loader.loadAsync(staticFile('models/v8-city/shrub_02/shrub_02_2k.gltf')).then(asset=>{
  asset.scene.updateMatrixWorld(true);const variants=asset.scene.children;
  // The source contains four side-by-side author variants; choose ONE per
  // placement and normalize its own bounds, never instance the four-object row.
  variants.forEach((source,variant)=>{
   const selected=shrubs.filter((_,i)=>i%variants.length===variant),bounds=new T.Box3().setFromObject(source),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),normalization=new T.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z);
   source.traverse(o=>{const part=o as T.Mesh;if(!part.isMesh)return;const sourceMaterial=(Array.isArray(part.material)?part.material[0]:part.material) as T.MeshStandardMaterial,m=sourceMaterial.clone();
    m.side=T.DoubleSide;m.transparent=false;m.alphaTest=.42;m.depthWrite=true;m.roughness=.91;m.metalness=0;m.envMapIntensity=.52;
    const inst=new T.InstancedMesh(part.geometry,m,selected.length);inst.name='ScannedShrub02_v'+variant+'_'+part.name;inst.castShadow=inst.receiveShadow=true;
    selected.forEach((p,i)=>{const sy=p.height/size.y,sxz=(p.width??p.height*1.4)/Math.max(size.x,size.z),matrix=new T.Matrix4().compose(new T.Vector3(p.x,p.y,p.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),p.rotation??i*2.399),new T.Vector3(sxz,sy,sxz)).multiply(normalization).multiply(part.matrixWorld);inst.setMatrixAt(i,matrix);inst.setColorAt(i,new T.Color().setHSL(.21+(i%5)*.006,.08,.72+(i%4)*.035));});
    inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();group.add(inst);
   });
  });group.userData.shrubCount=shrubs.length;group.userData.shrubSource='Poly Haven shrub_02 CC0 2k; four independent scanned variants, scale normalized';
 }):Promise.resolve();
 const ready=Promise.all([firReady,broadleafReady,forestReady,shrubReady]).then(()=>undefined);
 const dispose=()=>{
   group.traverse(o=>{const m=o as T.Mesh;if(m.isMesh){m.geometry.dispose();const materials=Array.isArray(m.material)?m.material:[m.material];materials.forEach(x=>x.dispose());}});
   parent.remove(group);
 };
 return {group,ready,dispose};
}
