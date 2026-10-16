import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Match World's baked, metre/100 GLB geometry before any authored motion. */
export async function loadCameraParts(manifest,glbPath='public/models/shanghai-tower.glb'){
 const bytes=fs.readFileSync(glbPath);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.updateMatrixWorld(true);
 const material=new T.MeshBasicMaterial({side:T.DoubleSide}),parts=[];
 for(const info of manifest.parts){
  const source=gltf.scene.getObjectByName(info.id);if(!source)throw new Error('Missing GLB part: '+info.id);
  if(!source.getObjectByProperty('type','Mesh')&&!(source instanceof T.Mesh))continue;
  const root=new T.Group();root.name=source.name;
  source.traverse(o=>{if(o instanceof T.Mesh){const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld).scale(.01,.01,.01);geometry.computeBoundingSphere();root.add(new T.Mesh(geometry,material));}});
  const center=new T.Box3().setFromObject(root).getCenter(new T.Vector3());
  parts.push({id:source.name,role:info.role??source.name.split('_')[0],root,center,offset:new T.Vector3()});
 }
 return {parts,dispose(){for(const p of parts)p.root.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});material.dispose();gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}};
}
