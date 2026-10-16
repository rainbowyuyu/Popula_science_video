import fs from 'node:fs';import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const bytes=fs.readFileSync('public/assets_v10/characters/rainbow_fish.glb');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
gltf.scene.updateMatrixWorld(true);const stats=[];
gltf.scene.traverse(o=>{if(o.isSkinnedMesh)stats.push({name:o.name,vertices:o.geometry.attributes.position.count,
 joints:o.skeleton.bones.length,vertexColors:o.material.vertexColors,bones:o.skeleton.bones.map(b=>b.name)});});
const eye=gltf.scene.getObjectByName('EyeReference');
console.log(JSON.stringify({skins:stats.length,stats,eye:eye?.getWorldPosition(new T.Vector3()).toArray(),animations:gltf.animations.map(c=>c.name)},null,2));
