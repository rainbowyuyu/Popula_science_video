import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {TessellateModifier} from 'three/examples/jsm/modifiers/TessellateModifier.js';
const root=process.cwd(),base=process.argv.find(x=>x.startsWith('--base='))?.slice(7)??'public/physics',out=path.join(root,'research/qa/v10-playback');fs.mkdirSync(out,{recursive:true});
const bundled=path.join(root,'tmp/audit-v10-playback.mjs');
await build({stdin:{contents:`export {PhysicsPlayback} from './src/PhysicsPlayback';export {HighResolutionResponse} from './src/HighResolutionResponse';export {ShellWallPlayback} from './src/ShellWallPlayback';export {stateAt} from './src/visual';`,resolveDir:root},outfile:bundled,bundle:true,platform:'node',format:'esm',external:['three'],logLevel:'error'});
const {PhysicsPlayback,HighResolutionResponse,ShellWallPlayback,stateAt}=await import(pathToFileURL(bundled));
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),buffer=p=>{const b=fs.readFileSync(p);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
const data=json(path.join(base,'response.json')),meta=json(path.join(base,'cinematic-response.json')),shellMeta=json(path.join(base,'shell-response.json')),tl=json('src/timeline.json');
const high=new HighResolutionResponse(meta,buffer(path.join(base,'cinematic-response.f32'))),physics=new PhysicsPlayback(data,tl,high),shell=new ShellWallPlayback(data,shellMeta,buffer(path.join(base,'shell-response.f32')));physics.shells=shell;
const checks={},metrics={};
checks.noEquivalentCoreMembers=!data.members.some(m=>m.role==='core'||String(m.id).startsWith('M_CORE'));
checks.transportNotSolverElements=physics.coreAxes.every(a=>a.index===-1);
const U=new Float32Array(data.nodes.length*3),R=new Float32Array(U.length),S=new Float32Array(data.members.length);
let maxU=0,maxS=0;
for(let f=0;f<data.dynamic.time.length;f++){
 high.sample(data.dynamic.time[f],U,R,S);
 for(let i=0;i<U.length;i++)maxU=Math.max(maxU,Math.abs(U[i]-data.dynamic.u[f][Math.floor(i/3)][i%3]));
 for(let i=0;i<S.length;i++)maxS=Math.max(maxS,Math.abs(S[i]-data.dynamic.axialMPa[f][i]));
}
metrics.jsonVsHighU_m=maxU;metrics.jsonVsHighStress_MPa=maxS;checks.highFrequencyIdentity=maxU<1e-6&&maxS<1e-4;
high.sample(0,U,R,S);checks.exactZeroInitialIncrement=[...U,...R,...S].every(x=>x===0);
const gltf=await new GLTFLoader().parseAsync(buffer('public/models/shanghai-tower.glb'),'');gltf.scene.updateMatrixWorld(true);
const mapping=[];let vertices=0;
for(const [id]of shell.byMesh){
 const obj=gltf.scene.getObjectByName(id);if(!obj)throw new Error('Missing source wall group '+id);
 obj.traverse(o=>{if(!(o instanceof T.Mesh))return;const coarse=o.geometry.clone().applyMatrix4(o.matrixWorld).scale(.01,.01,.01),geo=new TessellateModifier(.06,9).modify(coarse);coarse.dispose();shell.bind(id,geo);mapping.push({id,...geo.userData.shellMapping});vertices+=geo.getAttribute('position').count;geo.dispose();});
}
checks.actualCoreGeometryMapped=mapping.length>0&&mapping.every(x=>x.maxDistance_m<4);metrics.mappedVertices=vertices;metrics.maxDistance_m=Math.max(...mapping.map(x=>x.maxDistance_m));
// Independent affine displacement patch on an actual wall panel. Bilinear
// display interpolation must reproduce a linear field at its interior points.
const panel=shell.panels[Math.floor(shell.panels.length*.45)],wall=data.walls[panel.index],points=[];
for(const [a,b]of [[.17,.23],[.5,.5],[.86,.72]])points.push(panel.a.clone().addScaledVector(panel.h,panel.hl*a).addScaledVector(panel.v,panel.vl*b).multiplyScalar(.01));
const geometry=new T.BufferGeometry().setFromPoints(points),rest=new Float32Array(geometry.getAttribute('position').array),material=new T.MeshStandardMaterial({color:'#ffffff'});shell.bind(wall.meshIds[0],geometry);
for(let i=0;i<data.nodes.length;i++){const [x,y,z]=data.nodes[i].xyz;U[i*3]=.001*x+.0007*y;U[i*3+1]=-.0002*y;U[i*3+2]=.0003*z+.0004*y;}R.fill(0);shell.current.fill(0);
shell.deform(geometry,rest,material,U,R,.01,1,true);let affineError=0;const p=geometry.getAttribute('position');
for(let i=0;i<points.length;i++){const [x,y,z]=points[i].toArray().map(v=>v*100),expected=[rest[i*3]+.01*(.001*x+.0007*y),rest[i*3+1]-.01*.0002*y,rest[i*3+2]+.01*(.0003*z+.0004*y)];for(let q=0;q<3;q++)affineError=Math.max(affineError,Math.abs(p.array[i*3+q]-expected[q]));}
metrics.affineInterpolationErrorSceneUnits=affineError;checks.affineInterpolation=affineError<5e-7;
shell.deform(geometry,rest,material,U,R,0,0,false);checks.inactiveRestored=p.array.every((v,i)=>v===rest[i]);
const frames=[4406,6430,11130,11380,4406],snapshots=[];
for(const frame of frames){physics.update(stateAt(frame,tl));material.color.set('#ffffff');material.userData.physicsBaseColor=new T.Color('#ffffff');physics.deform(geometry,rest,material);snapshots.push(new Float32Array(p.array));}
checks.randomSeekDeterministic=snapshots[0].every((v,i)=>v===snapshots.at(-1)[i]);
const env=json(path.join(base,'environment-response.json')),top=data.nodes.findIndex(n=>n.id===env.tmd.supportNodeId);let tmdError=0;
for(let i=0;i<env.tmd.time.length;i++){high.sample(env.tmd.time[i],U,R,S);tmdError=Math.max(tmdError,Math.abs(U[top*3]-env.tmd.supportX_m[i]));}
checks.tmdSameStructure=top>=0&&tmdError<1e-6;metrics.tmdSupportDifference_m=tmdError;
const report={passed:Object.values(checks).every(Boolean),checks,metrics,mapping,scope:'Actual node/member/history identity, original GLB wall registration, affine interpolation, reset and random seek, and TMD/main-model agreement. Not visual acceptance.'};
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2));console.log({passed:report.passed,checks,metrics});if(!report.passed)process.exit(1);
