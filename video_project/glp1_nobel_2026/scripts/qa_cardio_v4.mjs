import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import * as T from 'three';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),tmp=path.join(root,'tmp','qa-cardio-v4');fs.mkdirSync(tmp,{recursive:true});
for(const name of ['CardioVascularDetail','CardioDetail']){
 const source=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8').replace("'./CardioVascularDetail'","'./CardioVascularDetail.mjs'").replace("import pressureModel from '../public/cardio/physics.json';",`const pressureModel=${fs.readFileSync(path.join(root,'public/cardio/physics.json'),'utf8')};`);
 fs.writeFileSync(path.join(tmp,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
const {CardioDetail,CARDIO_SCALE}=await import(pathToFileURL(path.join(tmp,'CardioDetail.mjs')).href);
const model=new CardioDetail(),issues=[],states=[];
const roots=['arteryRoot','arterioleRoot','lipidRoot','lipidWallRoot','nephronRoot'];
for(const name of roots)if(model[name].scale.distanceTo(new T.Vector3(1,1,1))>1e-12)issues.push(name+' public root scale must be unity');
const modes=['pressure','resistance','nephron','renal','lipid','clearance','lipid_wall','plaque','thrombus'];
for(const mode of modes)for(const p of [0,.17,.49,.83,1]){
 model.update(12+p*8,mode,p);model.setVisibility({artery:1,arteriole:1,lipid:1,lipidWall:1,nephron:1});model.root.updateMatrixWorld(true);
 let meshes=0;
 model.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){meshes++;for(const a of ['position','normal']){const b=o.geometry.getAttribute(a);if(b&&!Array.from(b.array).every(Number.isFinite))issues.push(`${mode}:${p}:${o.name}:${a}`);}if(!o.matrixWorld.elements.every(Number.isFinite))issues.push(`${mode}:${p}:${o.name}:matrix`);if(o instanceof T.InstancedMesh&&!Array.from(o.instanceMatrix.array).every(Number.isFinite))issues.push(`${mode}:${p}:${o.name}:instance`);}});
 const labels=model.getLabels(mode);for(const l of labels)if(!l.point.toArray().every(Number.isFinite))issues.push(`${mode} label ${l.text}`);
 states.push({mode,progress:p,meshCount:meshes,labelCount:labels.length});
}
model.update(10,'lipid',0);model.root.updateMatrixWorld(true);const vldl=new T.Box3().setFromObject(model.lipidRoot.getObjectByName('phospholipid-monolayer')).getSize(new T.Vector3()).length();
model.update(10,'lipid',1);model.root.updateMatrixWorld(true);const ldl=new T.Box3().setFromObject(model.lipidRoot.getObjectByName('phospholipid-monolayer')).getSize(new T.Vector3()).length();
if(Math.abs(ldl/vldl-.44)>1e-7)issues.push('VLDL to LDL size ratio differs from 22/50');
model.update(10,'pressure',.1);
model.root.updateMatrixWorld(true);
const extents=Object.fromEntries(roots.map(name=>[name,new T.Box3().setFromObject(model[name]).getSize(new T.Vector3()).toArray()]));
const report={passed:issues.length===0,scope:'Current module CPU geometry, representative physical dimensions, finite matrices and deterministic states; not clinical validation or rendered visual acceptance.',scale:CARDIO_SCALE,rootsAtIdentity:roots,extentsMetres:extents,ldlVldlDiameterRatio:ldl/vldl,states,issues};
const out=path.join(root,'research/revision-v4');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'cardio-geometry-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,issues,extentsMetres:extents,states:states.length},null,2));model.dispose();if(issues.length)process.exitCode=1;
