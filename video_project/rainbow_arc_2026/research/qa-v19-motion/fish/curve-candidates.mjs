import fs from 'node:fs';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const out='research/qa-v19-motion/fish';
const source=fs.readFileSync('src/FishObserverV19Motion.ts','utf8');
const file='public/assets_v19_repair/characters/rainbow_fish_v19_repair.glb',data=fs.readFileSync(file),gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const variants=[{id:'left-soft',modify:s=>s.replace('new T.Vector3(-.65,.16,-1.30)','new T.Vector3(-1.0,.16,-1.30)').replace('new T.Vector3(5.8,.9,-2.6)','new T.Vector3(-5.8,.9,-2.6)').replace('new T.Vector3(12,1.3,-2.6)','new T.Vector3(-12,1.3,-2.6)').replace('new T.Vector3(10*entry','new T.Vector3(12*entry')},
{id:'right-gentle',modify:s=>s.replace('new T.Vector3(-.65,.16,-1.30)','new T.Vector3(.8,.16,-1.5)').replace('new T.Vector3(5.8,.9,-2.6)','new T.Vector3(5.8,.9,-4.2)').replace('new T.Vector3(12,1.3,-2.6)','new T.Vector3(12,1.3,-5.6)').replace('new T.Vector3(10*entry','new T.Vector3(12*entry')}];
const reports=[];
for(const variant of variants){
 await build({stdin:{contents:"export * from './src/FishObserverV19Motion';export * from './src/WorldV10';export * from './src/Timeline';export * from './src/CinematicRouteV10';",resolveDir:process.cwd(),loader:'ts'},outfile:out+'/'+variant.id+'.mjs',bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'candidate-only',setup(build){build.onLoad({filter:/FishObserverV19Motion\.ts$/},()=>({contents:variant.modify(source),loader:'ts'}));}}]});
 const {FishObserverV19Motion,WorldV10,stateAt,sampleFilmCamera}=await import(pathToFileURL(process.cwd()+'/'+out+'/'+variant.id+'.mjs'));
 const world=new WorldV10(undefined,new T.Scene()),camera=new T.PerspectiveCamera(45,1920/1080,.03,400),fish=new FishObserverV19Motion(gltf.scene,gltf.animations).attach(world),fig=world.sprayObserver.children[0];let last,maxStep=0,peakFrame=0,retire=null;const samples=[];
 for(let frame=10200;frame<10403;frame++){
  world.update(stateAt(frame));const p=sampleFilmCamera(frame);camera.position.set(...p.position);camera.quaternion.copy(p.quaternion);const t=frame/30,bank=.0028*Math.sin(t*.17)+.0014*Math.sin(t*.053+1.2);camera.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),bank));camera.fov=p.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);fish.update(frame,camera);
  if(last){const step=fig.quaternion.angleTo(last);if(step>maxStep){maxStep=step;peakFrame=frame;}}last=fig.quaternion.clone();if(fig.userData.exited&&retire===null)retire=frame;
  if([10255,10288,10320,10350,10375,10402].includes(frame)){const eye=fig.getObjectByName('optical-eye-reference-spray').getWorldPosition(new T.Vector3()).project(camera);samples.push({frame,visible:fig.visible,ndc:eye.toArray(),...fig.userData});}
 }
 reports.push({candidate:variant.id,maxStepDegrees:T.MathUtils.radToDeg(maxStep),peakFrame,retire,samples});fish.dispose();world.dispose();
}
fs.writeFileSync(out+'/curve-candidates.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.map(r=>({...r,samples:undefined})),null,2));
