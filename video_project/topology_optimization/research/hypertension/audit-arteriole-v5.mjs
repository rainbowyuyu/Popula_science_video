import fs from 'node:fs';
import ts from 'typescript';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
const root=process.cwd();
const source=fs.readFileSync('src/hypertension/VascularDetail.ts','utf8');
const target=root+'/research/hypertension/arteriole-v5-runtime.mjs';
fs.writeFileSync(target,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
const {ArterioleDetail}=await import(pathToFileURL(target).href+'?v5');
const model=new ArterioleDetail();
let maxSeamError=0,maxParticleJump=0;let finiteFailures=0;const records=[];
for (const constriction of [0,.25,.5,.76923077,1]) for (const pulse of [0,.5,1]) {
 model.update({time:15,activation:1,constriction,pulse,pressure:.8,detail:1,flowPhase:2.3});
 let vertices=0;
 model.root.traverse(o=>{if(o.geometry){const p=o.geometry.attributes.position;vertices+=p.count;for(let i=0;i<p.array.length;i++)if(!Number.isFinite(p.array[i]))finiteFailures++;}});
 for(let layer=0;layer<3;layer++)for(const side of [-1,1]){
  const main=model.shells[layer],a=main.geometry.attributes.position;
  const continuation=model.root.getObjectByName(`${side<0?'parent':'daughter'}-continuous-wall-${layer}`),b=continuation.geometry.attributes.position;
  const nt=48,n=(30+1)*(nt+1),iMain=side<0?0:main.nx;
  for(let surface=0;surface<2;surface++)for(let k=0;k<=12;k++){
   const ai=surface*main.n+iMain*(main.nt+1)+k*3,bi=surface*n+k*4;
   const error=Math.hypot(a.getX(ai)-b.getX(bi),a.getY(ai)-b.getY(bi),a.getZ(ai)-b.getZ(bi));maxSeamError=Math.max(maxSeamError,error);
  }
 }
 records.push({constriction,pulse,vertices});
}
// Every update is random-access deterministic, including branch displacement.
model.update({time:102,activation:1,constriction:.7,pulse:.8,pressure:.4,detail:1,flowPhase:7.6});
const before=Float32Array.from(model.continuations[0].mesh.geometry.attributes.position.array);
model.update({time:5,activation:.4,constriction:0,pulse:0,flowPhase:.3});
model.update({time:102,activation:1,constriction:.7,pulse:.8,pressure:.4,detail:1,flowPhase:7.6});
const after=model.continuations[0].mesh.geometry.attributes.position.array;
const randomAccessExact=before.every((x,i)=>x===after[i]);
const report={sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),scope:'Arteriole visible geometric deformation only; CPU vertex audit, not a rendered visual approval.',states:records,maxSeamError,finiteFailures,randomAccessExact,worldScale:model.root.scale.toArray(),passed:maxSeamError<1e-6&&finiteFailures===0&&randomAccessExact};
fs.writeFileSync('research/hypertension/arteriole-v5-geometry-qa.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));model.dispose();
