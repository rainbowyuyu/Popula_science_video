import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const bytes=fs.readFileSync('public/assets_v09/characters/robot_expressive/RobotExpressive-original.glb');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const mixer=new T.AnimationMixer(gltf.scene);mixer.clipAction(gltf.animations.find(c=>c.name==='Idle')).play();mixer.setTime(0);gltf.scene.updateMatrixWorld(true);
const report={nodes:[],clips:gltf.animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length}))};
gltf.scene.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position,points=[];for(let i=0;i<p.count;i++)points.push(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));const box=new T.Box3().setFromPoints(points);report.nodes.push({name:o.name,type:o.type,material:o.material.name,vertices:p.count,min:box.min.toArray(),max:box.max.toArray()});if(o.name==='Head_4'){report.faceBins=[];for(let y=3.2;y<4.4;y+=.1){const vertices=points.filter(p=>p.y>=y&&p.y<y+.1);if(vertices.length){const c=vertices.reduce((a,p)=>a.add(p),new T.Vector3()).divideScalar(vertices.length);report.faceBins.push({y:Number(y.toFixed(2)),n:vertices.length,center:c.toArray()});}}}});
const face=gltf.scene.getObjectByName('Head_4'),p=face.geometry.attributes.position,index=face.geometry.index;
const pointKey=(i)=>{const point=new T.Vector3().fromBufferAttribute(p,i);return [point.x,point.y,point.z].map(x=>Math.round(x*1e5)).join(',');};
const parent=new Map(),vertexKeys=Array.from({length:p.count},(_,i)=>pointKey(i));
const root=k=>parent.get(k)===k?k:(parent.set(k,root(parent.get(k))),parent.get(k));
for(const k of vertexKeys)parent.set(k,k);
for(let i=0;i<(index?index.count:p.count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),r=ids.map(i=>root(vertexKeys[i]));parent.set(r[1],r[0]);parent.set(r[2],r[0]);}
const components=new Map();for(let i=0;i<p.count;i++){const k=root(vertexKeys[i]);if(!components.has(k))components.set(k,[]);components.get(k).push(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(face.matrixWorld));}
report.faceComponents=Array.from(components.values()).map(points=>{const b=new T.Box3().setFromPoints(points);return{n:points.length,min:b.min.toArray(),max:b.max.toArray(),center:b.getCenter(new T.Vector3()).toArray()};});
fs.mkdirSync('work/observer-review-v09',{recursive:true});fs.writeFileSync('work/observer-review-v09/geometry-inspection.json',JSON.stringify(report,null,2));console.log(JSON.stringify({faceComponents:report.faceComponents,clips:report.clips},null,2));
