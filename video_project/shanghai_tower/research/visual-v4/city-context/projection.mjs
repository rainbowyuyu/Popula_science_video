import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const p='public/models/shanghai-tower.glb',b=fs.readFileSync(p);
const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');gltf.scene.updateMatrixWorld(true);
const pts=[];gltf.scene.traverse(o=>{if(!o.isMesh||!/ENVELOPE.*GLASS/.test(o.name))return;const a=o.geometry.getAttribute('position');for(let i=0;i<a.count;i++)pts.push(new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).multiplyScalar(.01))});
fs.writeFileSync('research/visual-v4/city-context/glass-points.json',JSON.stringify(pts.map(p=>p.toArray())));console.log(pts.length);
