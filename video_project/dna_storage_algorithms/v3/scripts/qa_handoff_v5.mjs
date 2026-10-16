/** CPU transition gate audit; real model GLBs and shaders still require raster review. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const THREE=require('three'),previousHook=require.extensions['.ts'];
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText,filename);
globalThis.document={createElement(tag){if(tag!=='canvas')throw new Error(tag);const ctx={measureText:t=>({width:[...t].length*96}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),fillRect(){},fillText(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){}};return{width:300,height:150,getContext:()=>ctx};}};
const {makeStations}=require(path.join(root,'src/scene/StationsV5.ts')),{sampleCamera,STATIONS}=require(path.join(root,'src/CameraPathV5.ts'));
const modules=makeStations(),camera=new THREE.PerspectiveCamera(40,16/9,.05,250),frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),gates=[];
for(let i=0;i<modules.length;i++)for(const gate of ['show','hide']){
 const t=gate==='show'?STATIONS[i].start-3:STATIONS[i].end+3;if(t<=0||t>=300)continue;
 const pose=sampleCamera(t);camera.fov=pose.fov;camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.rotateZ(THREE.MathUtils.degToRad(pose.rollDeg));camera.updateProjectionMatrix();camera.updateMatrixWorld(true);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
 const mod=modules[i];mod.position.set(...STATIONS[i].origin);mod.update(Math.max(0,t-STATIONS[i].start));mod.updateMatrixWorld(true);const visible=[];let index=0;
 mod.traverse(o=>{const n=index++;if(!o.isMesh&&!o.isSprite)return;if(o.isMesh&&!o.geometry)return;let inFrame=false;if(o.isSprite)inFrame=frustum.intersectsSprite(o);else inFrame=frustum.intersectsObject(o);if(inFrame){const p=o.getWorldPosition(new THREE.Vector3()).project(camera);visible.push({index:n,type:o.type,screen:p.toArray()});}});
 gates.push({station:STATIONS[i].id,gate,timeSec:t,frustumIntersectionCount:visible.length,examples:visible.slice(0,12)});
}
const report={status:gates.some(g=>g.frustumIntersectionCount)?'REVIEW_REQUIRED':'PASS',method:'Bounding spheres at actual WorldV5 module show/hide thresholds. A sphere intersection is conservative, not proof of visible pixels. No imported GLB or transparency/occlusion check.',gates};fs.writeFileSync(path.join(root,'research/handoff-gates-qa-v5.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));require.extensions['.ts']=previousHook;delete globalThis.document;
