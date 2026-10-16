/** Focused geometric audit, independent of final raster QA. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as T from 'three';
const require=createRequire(import.meta.url),root=process.cwd();
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText,filename);
globalThis.document={createElement(){return {width:300,height:150,getContext(){return {measureText:text=>({width:[...text].length*96}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),fillRect(){},fillText(){}};}};}};
const {helix}=require(path.join(root,'src/scene/primitivesV6.ts'));
const {MemoryArchiveV6}=require(path.join(root,'src/scene/MemoryArchiveV6.ts'));
const {sceneNarrationV6}=require(path.join(root,'src/TimelineV6.ts'));
const errors=[],examples=[];
for(const [height,radius]of [[6,1],[2.6,.38]]){
 const g=helix(22,height,radius);g.updateMatrixWorld(true);const b=new T.Box3().setFromObject(g);let nonfinite=0,vertices=0;
 g.traverse(o=>{if(o.isMesh){const p=o.geometry.getAttribute('position');vertices+=p.count;for(const n of p.array)if(!Number.isFinite(n))nonfinite++;}});
 const backbones=g.children.filter(o=>o.name.startsWith('backbone')),bases=g.children.filter(o=>o.name.startsWith('base_')),sugars=g.children.filter(o=>o.name.startsWith('sugar'));
 if(backbones.length!==2||bases.length!==44||sugars.length!==44||nonfinite)errors.push({height,radius,backbones:backbones.length,bases:bases.length,sugars:sugars.length,nonfinite});
 if(b.getSize(new T.Vector3()).y>height+radius*.2)errors.push('Helix grew outside vertical anchor range');
 examples.push({height,radius,backbones:backbones.length,pairedBases:bases.length,bounds:b.getSize(new T.Vector3()).toArray(),vertices});
}
const archive=new MemoryArchiveV6(),n02=sceneNarrationV6.cues.find(c=>c.id==='n02').startSec;
archive.update(Math.max(0,n02-.05));const tileHome=archive.tiles.every((tile,i)=>tile.position.distanceTo(archive.homes[i])<1e-8&&tile.scale.x===1);
if(!tileHome)errors.push('Family memory damaged before challenge narration');
for(const t of [0,n02-.05,n02+1,17.5]){archive.update(t);const a=archive.tiles.map(o=>[...o.position.toArray(),...o.scale.toArray()]);archive.update(17.95);archive.update(t);if(JSON.stringify(a)!==JSON.stringify(archive.tiles.map(o=>[...o.position.toArray(),...o.scale.toArray()])))errors.push('Non-deterministic tile movement');}
const manifest=JSON.parse(fs.readFileSync('public/3d/v6/assets-manifest.json','utf8'));
for(const [name,asset]of Object.entries(manifest.assets)){if(!asset.sizeMeters.every(n=>Number.isFinite(n)&&n>0))errors.push(`bad asset size ${name}`);if(asset.objects>120)errors.push(`unbatched asset ${name}`);}
const report={pass:errors.length===0,errors,examples,openingIntactBeforeNarration:tileHome,assetBounds:manifest.assets,scope:'CPU geometry/timing; final raster aesthetics checked separately'};
fs.writeFileSync('work/qa_models_v6.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
