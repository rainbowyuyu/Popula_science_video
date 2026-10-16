import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {PartsInventory} from '../../../src/v16/PartsInventoryV16';
import {V16CameraRig} from '../../../src/v16/V16CameraRig';
import {sourceStateAt,transitionAt} from '../../../src/v16/timeline';
import {CameraPath,towerCameraAnchors} from '../../../src/CameraPath';
import {spatialLabelLayout} from '../../../src/v16/SpatialEngineeringV16';
import {Timeline,V} from '../../../src/visual';
import original from '../../../src/timeline.json';
import manifest from '../../../public/models/shanghai-tower-manifest.json';
const assert=(ok:boolean,msg:string)=>{if(!ok)throw new Error(msg);};
async function main(){
 const input=fs.readFileSync('public/models/shanghai-tower.glb'),buffer=input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength);
 const gltf=await new GLTFLoader().parseAsync(buffer,'');gltf.scene.updateMatrixWorld(true);
 const parts:any[]=[];
 for(const info of manifest.parts){
  const source=gltf.scene.getObjectByName(info.id);if(!source||(!source.getObjectByProperty('type','Mesh')&&!(source instanceof T.Mesh)))continue;
  const root=new T.Group();root.name=info.id;
  source.traverse(o=>{if(o instanceof T.Mesh)root.add(new T.Mesh(o.geometry.clone().applyMatrix4(o.matrixWorld).scale(.01,.01,.01),new T.MeshBasicMaterial()));});
  parts.push({id:info.id,role:(info as any).role??info.id.split('_')[0],root,center:new T.Box3().setFromObject(root).getCenter(V()),offset:V()});
 }
 const tl=original as Timeline,inventory=new PartsInventory(parts,tl),path=new CameraPath(tl);
 path.setAnchors({...towerCameraAnchors(manifest),...inventory.anchors});

 const output:any=[];
 for(const aspect of ['16:9','9:16'] as const){
  const camera=new T.PerspectiveCamera(34,16/9,.008,200),world:any={camera,path,physics:{displacementAt:()=>V()}},rig=new V16CameraRig(world,aspect);
  for(const frame of aspect==='16:9'?[260,300,350]:[250,280,295]){
   const state=sourceStateAt(frame,aspect);inventory.apply(state.n+state.u);
   for(const factor of [1]){
    const pose=rig.pose(state);pose.position.sub(pose.target).multiplyScalar(factor).add(pose.target);rig.applyPose(pose);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const p of parts){if(/SOIL|GROUND/.test(p.id))continue;p.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(p.root);
     for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const q=V(x,y,z).project(camera);if(q.z<0||q.z>1)continue;minX=Math.min(minX,(q.x+1)/2);maxX=Math.max(maxX,(q.x+1)/2);minY=Math.min(minY,(1-q.y)/2);maxY=Math.max(maxY,(1-q.y)/2);}}
    output.push({aspect,frame,source:state.frame,factor,minX,maxX,minY,maxY});
   }
  }
 }
 console.log(JSON.stringify(output,null,2));fs.writeFileSync('work/v16/camera/overview-framing-qa.json',JSON.stringify(output,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
