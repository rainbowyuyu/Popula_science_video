// Geometry-only audit. Two zero history samples exist solely as an in-memory
// adapter fixture; they are not a solver result or a production export.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';import {TessellateModifier} from 'three/examples/jsm/modifiers/TessellateModifier.js';
const root=process.cwd(),out=path.join(root,'research/qa/v10-playback');fs.mkdirSync(out,{recursive:true});
const code=path.join(root,'tmp/audit-shell-registration.mjs');await build({stdin:{contents:`export {ShellWallPlayback} from './src/ShellWallPlayback';`,resolveDir:root},outfile:code,bundle:true,platform:'node',format:'esm',external:['three'],logLevel:'error'});
const {ShellWallPlayback}=await import(pathToFileURL(code)),graph=JSON.parse(fs.readFileSync('research/physics-v10/coarse/graph.json','utf8'));
const walls=graph.members.filter(m=>m.type==='shell').map(m=>({...m,thickness_m:m.section.thickness}));
const data={nodes:graph.nodes,walls,static:{wallStress:{gravity:{verticalMPa:walls.map(()=>0)}}}},meta={schema:'rainbow.shell-response/10',wallIds:walls.map(w=>w.id),bytes:walls.length*2*4,time:{start:0,dt:1,count:2},fields:{verticalMPa:{offsetBytes:0,length:walls.length*2,shape:[2,walls.length]}}};
const shell=new ShellWallPlayback(data,meta,new ArrayBuffer(meta.bytes));
const file=fs.readFileSync('public/models/shanghai-tower.glb'),gltf=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');gltf.scene.updateMatrixWorld(true);
const mapping=[];
for(const [id]of shell.byMesh){const obj=gltf.scene.getObjectByName(id);if(!obj)throw new Error('Missing original wall '+id);obj.traverse(o=>{if(!(o instanceof T.Mesh))return;const coarse=o.geometry.clone().applyMatrix4(o.matrixWorld).scale(.01,.01,.01),geo=new TessellateModifier(.06,9).modify(coarse);coarse.dispose();shell.bind(id,geo);mapping.push({id,...geo.userData.shellMapping});geo.dispose();});}
const report={scope:'Actual original GLB registration to actual reconstructed shell mid-surfaces. In-memory zero history is an adapter fixture only, not a solver result.',passed:mapping.length>0&&mapping.every(m=>m.maxDistance_m<4),maxDistance_m:Math.max(...mapping.map(m=>m.maxDistance_m)),vertices:mapping.reduce((a,m)=>a+m.vertices,0),mapping};
fs.writeFileSync(path.join(out,'wall-registration.json'),JSON.stringify(report,null,2));console.log({passed:report.passed,maxDistance_m:report.maxDistance_m,vertices:report.vertices,groups:mapping.length});
