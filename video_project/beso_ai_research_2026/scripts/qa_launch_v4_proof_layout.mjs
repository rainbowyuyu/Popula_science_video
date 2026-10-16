import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {PerspectiveCamera,Vector3,Box3} from 'three';

const root=process.cwd(),out=path.join(root,'work/v4-native-qa/cinematic-proof.mjs');
await build({entryPoints:[path.join(root,'src/beso/CinematicWorld.ts')],outfile:out,bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent'});
const{CinematicWorld}=await import(pathToFileURL(out).href+'?qa='+Date.now());
const world=Object.create(CinematicWorld.prototype);world.launchMode=true;
const manifest=JSON.parse(await fs.readFile(path.join(root,'public/beso-research/geometry/manifest.json'),'utf8'));
const shared=JSON.parse(await fs.readFile(path.join(root,'public/beso-research/geometry',manifest.shared),'utf8'));
const box=new Box3();for(let i=0;i<shared.positions.length;i+=3)box.expandByPoint(new Vector3(...shared.positions.slice(i,i+3)));
const corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new Vector3(x,y,z));
const camera=new PerspectiveCamera(34,16/9,.2,2600),failures=[],samples=[];
for(let frame=4680;frame<=5712;frame++){
  const time=frame/60,pose=world.cameraPose({id:'compare',time}),model=world.presentationModelPose(time);
  camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();
  const px=corners.map(p=>p.clone().multiplyScalar(model.scale).add(new Vector3(model.x,model.y,model.z)).project(camera));
  const b={left:Math.min(...px.map(p=>(p.x+1)*960)),right:Math.max(...px.map(p=>(p.x+1)*960)),top:Math.min(...px.map(p=>(1-p.y)*540)),bottom:Math.max(...px.map(p=>(1-p.y)*540))};
  const overlapsOverlay=b.right>=980&&b.left<=1840&&b.bottom>=414&&b.top<=920;
  if(time<=90&&overlapsOverlay)failures.push({frame,time,type:'proof_numeric_overlap',bounds:b});
  if(time>90&&overlapsOverlay)failures.push({frame,time,type:'proof_exit_numeric_overlap',bounds:b});
  if(frame%60===0||frame===5712)samples.push({frame,time,model,bounds:b});
}
const report={schema:'launch-v4-proof-layout-v1',pass:!failures.length,sourceGeometryBounds:{min:box.min.toArray(),max:box.max.toArray()},limits:{numericLeft:980,proofBodyStartS:78,proofHoldEndS:90},samples,failures};
await fs.writeFile(path.join(root,'research/qa/launch-v4-proof-layout.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,maxModelRightDuringHold:Math.max(...samples.filter(s=>s.time<=90).map(s=>s.bounds.right)),failures:failures.slice(0,4),failureCount:failures.length},null,2));if(failures.length)process.exitCode=1;
