import fs from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as T from 'three';
const data=fs.readFileSync('public/models/body.glb');
const scene=(await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene;
const body=[];scene.traverse(o=>{if(o.isMesh)body.push(o)});
const p=body[0].geometry.attributes.position;
const weights=JSON.parse(fs.readFileSync('src/V5PersonWeights.json')).weights;
const forward=new T.Vector3(.023,-.104,.042).normalize(),back=new T.Vector3(0,0,-1).addScaledVector(forward,forward.z).normalize(),width=new T.Vector3().crossVectors(forward,back).normalize(),wrist=new T.Vector3(.25,.911,.008);
const rows=[];for(let i=0;i<p.count;i++){if((weights[i]?.handL??0)<.1)continue;const point=new T.Vector3().fromBufferAttribute(p,i),delta=point.clone().sub(wrist);rows.push({i,xyz:point.toArray(),local:[delta.dot(width),delta.dot(forward),delta.dot(back)],weight:weights[i]});}
fs.writeFileSync('research/revision-v8/person/atlas-hand-points.json',JSON.stringify(rows));console.log({mesh:body.length,vertices:p.count,handVertices:rows.length,bounds:new T.Box3().setFromPoints(rows.map(r=>new T.Vector3(...r.local)))});
