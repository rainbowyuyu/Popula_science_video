import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createHash} from 'node:crypto';
const root='src/chemistry2026v04/';
const uri=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const transpile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const sources={};
for(const file of ['ChemistryMechanismsV04.ts','CinematicMechanismsV04.ts','OpusChemistryV04.ts'])sources[file]=fs.readFileSync(root+file,'utf8');
const baseURI=uri(transpile(sources['ChemistryMechanismsV04.ts']));
const cinematicURI=uri(transpile(sources['CinematicMechanismsV04.ts']).replace(/(['"])\.\/ChemistryMechanismsV04\1/g,JSON.stringify(baseURI)));
const base=await import(baseURI),visual=await import(cinematicURI),opus=await import(uri(transpile(sources['OpusChemistryV04.ts'])));
const drawMethods=new Set(['fill','stroke','fillRect','strokeRect','fillText','strokeText','drawImage','clearRect']);
const geometryMethods=new Set(['beginPath','closePath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse','rect','roundRect','clip','translate','rotate','scale','transform','setTransform','resetTransform','setLineDash']);
function finite(v,label){if(typeof v==='number')assert(Number.isFinite(v),`${label}: ${v}`);else if(Array.isArray(v))v.forEach(a=>finite(a,label));}
function probe(alpha){let state={globalAlpha:alpha};const stack=[];let calls=0,maxAlpha=0;const gradient=(...args)=>{finite(args,'gradient');return{addColorStop(offset){finite(offset,'stop');assert(offset>=0&&offset<=1)}}};const methods={save(){stack.push({...state})},restore(){assert(stack.length>0,'Restore without save');state=stack.pop()},createLinearGradient:gradient,createRadialGradient:gradient};const ctx=new Proxy({},{get(_,key){if(key in methods)return methods[key];if(key in state)return state[key];assert(drawMethods.has(key)||geometryMethods.has(key),`Unknown ${String(key)}`);return(...args)=>{finite(args,key);if(drawMethods.has(key)){calls++;maxAlpha=Math.max(maxAlpha,state.globalAlpha);assert(state.globalAlpha<=alpha+1e-12,`Parent fade overridden by ${key}: ${state.globalAlpha} > ${alpha}`)}}},set(_,key,v){finite(v,key);if(key==='globalAlpha')assert(v>=0&&v<=1,`Invalid alpha ${v}`);state[key]=v;return true}});return{ctx,result(){assert.equal(stack.length,0,'Unbalanced Canvas saves');assert.equal(state.globalAlpha,alpha);assert(calls>0);return{calls,maxAlpha,balanced:true}}};}
const scenes=['kaganV02','nonlinearV02','soaiV02','feedbackV02','amplificationV02','chanceV02','toolsV02','catalystV02','frankV02'];
const cases=[];
for(const alpha of [0,.25,1])for(const p of [0,.005,.025,.06,.1,.15,.2,.25,.3,.35,.4,.45,.5,.55,.6,.65,.7,.75,.8,.85,.9,.95,1]){
 for(const name of scenes){const test=probe(alpha);try{visual[name](test.ctx,p*30,p);cases.push({scene:name,parentAlpha:alpha,progress:p,...test.result()});}catch(e){throw Error(`${name}, p=${p}, parent=${alpha}: ${e.message}`);}}
 for(const name of ['award','life','coda']){const test=probe(alpha);base[name](test.ctx,p*30,p);cases.push({scene:name,parentAlpha:alpha,progress:p,...test.result()});}
 for(const name of ['drawChiralPair','drawCrystalSorting']){const test=probe(alpha);opus[name](test.ctx,p*30,p,100,330,1720,560);cases.push({scene:name,parentAlpha:alpha,progress:p,...test.result()});}
}
const quantities=visual.auditMechanismQuantitiesV02();
assert.equal(quantities.probabilities.sum,1);assert.equal(quantities.activeRatio,9);assert.equal(quantities.productEE,.8);assert.equal(quantities.ligandEE,.5);assert.equal(quantities.productR,.9);assert.equal(quantities.rightTrials+quantities.leftTrials,37);assert.equal(Math.round(24*quantities.initialRightFraction),12);assert.equal(quantities.thirdRoundMajorityBound,.9975);
assert(quantities.reactionTetrahedralCosines.every(c=>Math.abs(c+1/3)<1e-12),'Carbonyl product must have tetrahedral attachment directions');
const chirality=opus.auditChiralGeometry();assert(chirality.allCoordinatesFinite);assert(chirality.originalSignedVolume6*chirality.alignedSignedVolume6<0);assert(chirality.alignedSubstituentDistances[0]<1e-9&&chirality.alignedSubstituentDistances[1]<1e-9);assert(chirality.alignedSubstituentDistances[2]>1&&chirality.alignedSubstituentDistances[3]>1);
const hashes=Object.fromEntries(Object.entries(sources).map(([f,s])=>[f,createHash('sha256').update(s).digest('hex')]));
const report={status:'pass',totalCases:cases.length,totalDrawCalls:cases.reduce((s,c)=>s+c.calls,0),quantities,chirality,sourceSha256:hashes,scope:'Actual scene calls under parent alpha 0/0.25/1; finite geometry and Canvas state isolation, exact model probabilities and mirror invariants. Rendered layout/motion must still be checked.',cases};
fs.mkdirSync('docs/v02',{recursive:true});fs.writeFileSync('docs/v04/visual-regression-v04.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,cases:undefined},null,2));
