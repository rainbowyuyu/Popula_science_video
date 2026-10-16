import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {OBJExporter} from 'three/examples/jsm/exporters/OBJExporter.js';
const root=path.resolve(import.meta.dirname,'../..');
const out='C:/Users/zju/Videos/rainbow-marine-ep01-v8/model-review';
fs.mkdirSync(out,{recursive:true});
for(const name of ['MarineSurfaceMaterials','EngineeringFoundations']){
 let source=fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8');
 source=source.replace("'./MarineSurfaceMaterials'","'./MarineSurfaceMaterials.mjs'");
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 fs.writeFileSync(path.join(import.meta.dirname,name+'.mjs'),compiled);
}
const {createSemisubFoundation}=await import(pathToFileURL(path.join(import.meta.dirname,'EngineeringFoundations.mjs')).href+'?'+Date.now());
const {group}=createSemisubFoundation({merged:false,mooring:false});
group.updateMatrixWorld(true);
const materials=new Map(),names={},counts={meshes:0,triangles:0};
group.traverse(o=>{
 if(!o.isMesh)return;
 counts.meshes++;counts.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
 names[o.name]=(names[o.name]??0)+1;
 for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(!materials.has(m)){
  m.name='Marine_'+materials.size;
  const c=m.color;
  materials.set(m,`newmtl ${m.name}\nKd ${c?.r??.5} ${c?.g??.5} ${c?.b??.5}\nPr ${m.roughness??.5}\nPm ${m.metalness??0}\n`);
 }
});
fs.writeFileSync(path.join(out,'semisub-v8.obj'),'mtllib semisub-v8.mtl\n'+new OBJExporter().parse(group));
fs.writeFileSync(path.join(out,'semisub-v8.mtl'),[...materials.values()].join('\n'));
const report={created:new Date().toISOString(),counts,names,metadata:group.userData,note:'Independent geometry audit, no physical response certification.'};
fs.writeFileSync(path.join(out,'geometry-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({out,counts,names}));
