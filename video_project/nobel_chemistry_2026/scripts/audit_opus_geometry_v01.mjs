import fs from 'node:fs';import ts from 'typescript';import {createHash} from 'node:crypto';
const code=fs.readFileSync('src/chemistry2026/OpusChemistryV01.ts','utf8');
const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const m=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const geometry=m.auditChiralGeometry();
if(!geometry.allCoordinatesFinite||geometry.originalSignedVolume6*geometry.mirrorSignedVolume6>=0||geometry.mirrorSignedVolume6*geometry.alignedSignedVolume6<=0||geometry.alignedSubstituentDistances[0]>1e-9||geometry.alignedSubstituentDistances[1]>1e-9||geometry.alignedSubstituentDistances[2]<1||geometry.alignedSubstituentDistances[3]<1)throw Error('Chirality invariant failed');
const cases=[];
for(const name of ['drawChiralPair','drawCrystalSorting','drawReactionVessel'])for(const p of [0,.12,.26,.45,.61,.75,.92,1]){
 let alpha=.42,depth=0;const alphas=[];let calls=0;
 const known={get globalAlpha(){return alpha},set globalAlpha(v){if(!Number.isFinite(v)||v<0||v>1)throw Error('alpha '+v);alpha=v},save(){alphas.push(alpha);depth++},restore(){alpha=alphas.pop();depth--;if(depth<0)throw Error('unbalanced restore')},createLinearGradient(){return{addColorStop(){}}},createRadialGradient(){return{addColorStop(){}}}};
 const ctx=new Proxy(known,{get(target,key){if(key in target)return target[key];return (...args)=>{calls++;for(const a of args)if(typeof a==='number'&&!Number.isFinite(a))throw Error('Nonfinite canvas geometry '+String(key))}},set(target,key,val){target[key]=val;return true}});
 m[name](ctx,p*15,p,100,330,1720,560,.45);
 if(depth!==0||alpha!==.42)throw Error('Canvas state leak '+name);
 cases.push({name,progress:p,calls,balanced:true,alphaRestored:true});
}
const report={status:'pass',sourceSha256:createHash('sha256').update(code).digest('hex'),geometry,cases,scope:'Numeric construction, alpha/save-state isolation and finite Canvas arguments; dynamic visual review still required'};
fs.writeFileSync('docs/v01/opus-geometry-audit-v01.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.geometry,null,2));