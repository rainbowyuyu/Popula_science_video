import fs from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const root=process.cwd(); const loader=new GLTFLoader(); const bytes=await fs.readFile(root+'/public/models/body.glb'); const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),''); let mesh; gltf.scene.traverse(o=>{if(o.isMesh&&!mesh)mesh=o});
const pos=mesh.geometry.attributes.position; const weights=JSON.parse(await fs.readFile(root+'/src/V5PersonWeights.json','utf8')).weights; const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function loc(p,side){const wrist=V(side*.250,.911,.008),forward=V(side*.023,-.104,.042).normalize(),dorsal=V(0,0,-1).addScaledVector(forward,forward.z).normalize(),lateral=V().crossVectors(forward,dorsal).normalize(),d=p.clone().sub(wrist);return [d.dot(lateral)*side,d.dot(forward),d.dot(dorsal)]}
let out=[];for(const side of [1]){for(let i=0;i<pos.count;i++){if((weights[i]?.handL??0)>.5){const p=new T.Vector3().fromBufferAttribute(pos,i),l=loc(p,side);out.push([l[0],l[1],l[2],i]);}}} await fs.writeFile(root+'/tmp/v19-grip-points.json',JSON.stringify(out));
