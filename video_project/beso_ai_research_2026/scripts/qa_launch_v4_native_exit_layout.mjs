import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {PerspectiveCamera,Vector3,Mesh} from 'three';

const root=process.cwd(),work=path.join(root,'work/v4-native-qa');
await fs.mkdir(work,{recursive:true});
const cameraBundle=path.join(work,'cinematic-close.mjs'),nativeBundle=path.join(work,'native-platform.mjs');
await Promise.all([
  build({entryPoints:[path.join(root,'src/beso/CinematicWorld.ts')],outfile:cameraBundle,bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent'}),
  build({entryPoints:[path.join(root,'src/beso/NativePlatform.ts')],outfile:nativeBundle,bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent'})
]);
const[{CinematicWorld},{NativePlatform}]=await Promise.all([import(pathToFileURL(cameraBundle).href+'?qa='+Date.now()),import(pathToFileURL(nativeBundle).href+'?qa='+Date.now())]);
const model=JSON.parse(await fs.readFile(path.join(root,'public/beso-research/physics/native-model.json'),'utf8'));
const response=JSON.parse(await fs.readFile(path.join(root,'public/beso-research/physics/zwind-response.json'),'utf8'));
const native=new NativePlatform(model,response),world=Object.create(CinematicWorld.prototype);world.launchMode=true;
native.setTime(0,true);native.group.updateMatrixWorld(true);
const corners=[];
native.group.traverse(o=>{
  if(!(o instanceof Mesh))return;
  let ancestor=o;
  while(ancestor&&ancestor!==native.group){
    if(ancestor===native.sea||ancestor===native.structuralGroups.moorings||ancestor.name.startsWith('Discontinuous water contact'))return;
    ancestor=ancestor.parent;
  }
  o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;
  for(const x of[b.min.x,b.max.x])for(const y of[b.min.y,b.max.y])for(const z of[b.min.z,b.max.z])corners.push(o.localToWorld(new Vector3(x,y,z)));
});
const camera=new PerspectiveCamera(34,16/9,.2,2600),failures=[],samples=[];
const smooth=v=>{const q=Math.max(0,Math.min(1,v));return q*q*q*(q*(q*6-15)+10)};
const intersects=(a,b)=>a.right>=b.left&&a.left<=b.right&&a.bottom>=b.top&&a.top<=b.bottom;
for(let frame=5490;frame<=5700;frame++){
  const time=frame/60,pose=world.cameraPose({id:'compare',time}),nativePose=world.presentationNativePose(time);
  camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();
  const projected=corners.map(p=>p.clone().multiplyScalar(nativePose.scale).add(new Vector3(nativePose.x,nativePose.y,nativePose.z)).project(camera));
  const bounds={left:Math.min(...projected.map(p=>(p.x+1)*960)),right:Math.max(...projected.map(p=>(p.x+1)*960)),top:Math.min(...projected.map(p=>(1-p.y)*540)),bottom:Math.max(...projected.map(p=>(1-p.y)*540))};
  const dataShift=-2200*smooth((time-92.8)/1.2),titleShift=-2220*smooth((time-93.1)/.9);
  const data={left:1045+dataShift,right:1825+dataShift,top:416,bottom:913},title={left:92+titleShift,right:1492+titleShift,top:150,bottom:379};
  if(time<94&&(intersects(bounds,data)||intersects(bounds,title)))failures.push({frame,time,type:'ending_entry_overlays',bounds,data,title});
  if(frame%15===0||frame===5700)samples.push({frame,time,nativePose,bounds,data,title});
}
const report={schema:'launch-v4-native-close-layout-v1',pass:!failures.length,meshCornerCount:corners.length,failures,samples,limitation:'Conservative projected per-mesh bounding boxes exclude water cues, sea and mooring ropes. Tests saved-static hull, tower, rotor and original nacelle skin against actual proof exit typography rectangles.'};
await fs.writeFile(path.join(root,'research/qa/launch-v4-native-close-layout.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,failureCount:failures.length,failures:failures.slice(0,3),final:samples.at(-1)},null,2));
native.dispose();if(failures.length)process.exitCode=1;
