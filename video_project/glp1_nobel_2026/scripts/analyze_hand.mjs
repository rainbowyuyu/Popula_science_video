import fs from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const root=process.cwd();
const loader=new GLTFLoader();
const bytes=await fs.readFile(root+'/public/models/body.glb');
const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
let mesh;gltf.scene.traverse(o=>{if(o.isMesh&&!mesh)mesh=o});
const pos=mesh.geometry.attributes.position;
const weights=JSON.parse(await fs.readFile(root+'/src/V5PersonWeights.json','utf8')).weights;
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function local(p,side){const wrist=V(side*.250,.911,.008),forward=V(side*.023,-.104,.042).normalize();const dorsal=V(0,0,-1).addScaledVector(forward,forward.z).normalize();const lateral=V().crossVectors(forward,dorsal).normalize();const d=p.clone().sub(wrist);return {x:d.dot(lateral)*side,y:d.dot(forward),z:d.dot(dorsal)};}
for(const side of [1,-1]){
 const tag=side===1?'handL':'handR';let pts=[];
 for(let i=0;i<pos.count;i++){if((weights[i]?.[tag]??0)>.5){const p=new T.Vector3().fromBufferAttribute(pos,i);pts.push({i,p,l:local(p,side),w:weights[i][tag]})}}
 const mn={x:Infinity,y:Infinity,z:Infinity},mx={x:-Infinity,y:-Infinity,z:-Infinity};let sums={x:0,y:0,z:0,w:0};
 for(const a of pts){for(const k of ['x','y','z']){mn[k]=Math.min(mn[k],a.l[k]);mx[k]=Math.max(mx[k],a.l[k]);}sums.x+=a.l.x*a.w;sums.y+=a.l.y*a.w;sums.z+=a.l.z*a.w;sums.w+=a.w;}
 console.log(JSON.stringify({side,count:pts.length,bounds:{mn,mx},weighted:{x:sums.x/sums.w,y:sums.y/sums.w,z:sums.z/sums.w}},null,2));
 const bins={};for(const a of pts){const by=Math.floor(a.l.y/.01);const bx=Math.floor((a.l.x+.1)/.005);const k=by+':'+bx;(bins[k]??=[]).push(a)};
 // y slices x extents
 const ys=[];for(let by=0;by<30;by++){let a=pts.filter(q=>q.l.y>=by*.01&&q.l.y<(by+1)*.01);if(a.length)ys.push({y0:by*.01,n:a.length,x0:Math.min(...a.map(q=>q.l.x)),x1:Math.max(...a.map(q=>q.l.x)),z0:Math.min(...a.map(q=>q.l.z)),z1:Math.max(...a.map(q=>q.l.z))});}
 console.log(JSON.stringify(ys,null,2));
}
