import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import {pathToFileURL} from 'node:url';import * as T from 'three';
import {readBladeNodes} from './read_blade_nodes.mjs';
const root=path.resolve(import.meta.dirname,'../..');
let source=fs.readFileSync(path.join(root,'src/NarrativeMechanismsV8.ts'),'utf8').replace("import story from './story.json';",'const story='+fs.readFileSync(path.join(root,'src/story.json'),'utf8')+';');
fs.writeFileSync(path.join(import.meta.dirname,'NarrativeMechanismsV8.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
const {createNarrativeMechanismsV8}=await import(pathToFileURL(path.join(import.meta.dirname,'NarrativeMechanismsV8.mjs')).href+'?'+Date.now());
const scene=new T.Scene(),model=readBladeNodes(path.join(root,'public/models/v8/turbine-rayao.glb')),floating=new T.Group();scene.add(model,floating);floating.position.set(250,0,-230);floating.rotation.set(.013,0,-.012);
const result=createNarrativeMechanismsV8(scene,model,floating);const visual=scene.getObjectByName('NarrativeMechanismsV8');
const report={created:new Date().toISOString(),metadata:visual.userData,meshes:0,vertices:0,finiteGeometry:true,forceDirections:[],repeatTimeIdentical:false};
scene.traverse(o=>{if(!o.isMesh)return;report.meshes++;const p=o.geometry.attributes.position;report.vertices+=p.count;if([...p.array].some(x=>!Number.isFinite(x)))report.finiteGeometry=false;});
const capture=()=>{const data=[];scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isMesh)data.push([o.name,...o.matrixWorld.elements,o.material.opacity]);});return JSON.stringify(data);};
result.update(28);const a=capture();result.update(190);result.update(28);report.repeatTimeIdentical=a===capture();
for(const name of ['BuoyancyUp_0','BuoyancyUp_1','BuoyancyUp_2','WeightDown']){const g=scene.getObjectByName(name),q=g.getWorldQuaternion(new T.Quaternion());report.forceDirections.push({name,direction:new T.Vector3(0,1,0).applyQuaternion(q).toArray(),position:g.getWorldPosition(new T.Vector3()).toArray()});}
report.passed=report.finiteGeometry&&report.repeatTimeIdentical&&report.forceDirections.every(x=>x.name==='WeightDown'?x.direction[1]<-.999:x.direction[1]>.999);
const rotor=model.getObjectByName('RotorAssembly');rotor.rotation.x=88*.19;result.update(88);scene.updateMatrixWorld(true);
report.bladeTorqueDirections=[];const hub=rotor.getWorldPosition(new T.Vector3()),axis=new T.Vector3(1,0,0).transformDirection(rotor.matrixWorld);
for(let i=1;i<=3;i++){const force=scene.getObjectByName('BladeTangentialForce_'+i),p=force.getWorldPosition(new T.Vector3()),r=p.clone().sub(hub).addScaledVector(axis,-p.clone().sub(hub).dot(axis)).normalize(),d=new T.Vector3(0,1,0).applyQuaternion(force.getWorldQuaternion(new T.Quaternion()));report.bladeTorqueDirections.push({blade:i,axisDot:d.dot(axis),radialDot:d.dot(r),forwardTorque:d.dot(new T.Vector3().crossVectors(axis,r)),pressureAttached:!!model.getObjectByName('Blade_'+i).getObjectByName('BladePressureDifference_'+i)});}
report.passed=report.passed&&report.bladeTorqueDirections.every(x=>Math.abs(x.axisDot)<1e-6&&Math.abs(x.radialDot)<1e-6&&x.forwardTorque>.999&&x.pressureAttached);
fs.writeFileSync(path.join(import.meta.dirname,'mechanisms-audit.json'),JSON.stringify(report,null,2));result.dispose();if(!report.passed)throw Error('Mechanism audit failed');console.log(JSON.stringify(report,null,2));
