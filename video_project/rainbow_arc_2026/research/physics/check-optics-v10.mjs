import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const checker=fileURLToPath(import.meta.url),root=path.resolve(path.dirname(checker),'../..');
const output=path.join(root,'research/physics/optics-v10.mjs');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const inputs=['src/optics.ts','research/physics/check-optics-v10.mjs','package.json','package-lock.json'];
const sourceHashes=Object.fromEntries(inputs.map(rel=>[rel,sha(path.join(root,rel))]));
await build({absWorkingDir:root,entryPoints:['src/optics.ts'],bundle:true,format:'esm',platform:'node',packages:'external',outfile:output});
const o=await import(pathToFileURL(output).href);
const report={version:'V10',schema:'rainbow.v10.optics-verification/1',sourceHashes,model:'sphere + geometric ray optics; no wave interference calculation',airRefractiveIndex:o.AIR.refractiveIndex,tolerance:1e-7,tests:[],sweep:{samples:199,colors:o.SPECTRUM.length,reflectionOrders:[1,2],validPaths:0,maxResidual:0},passed:true,failures:[]};
const residualPass=r=>Object.values(r).every(x=>Number.isFinite(x)&&x<=report.tolerance);
try{
 for(const s of o.SPECTRUM)for(const order of [1,2]){
  const e=order===1?o.findPrimaryExtremum(s.refractiveIndex,1024):o.findSecondaryExtremum(s.refractiveIndex,1024),residual=o.verifyPath(e.path);
  report.tests.push({color:s.name,wavelengthNm:s.wavelengthNm,n:s.refractiveIndex,internalReflections:order,impactParameter:e.impactParameter,angleDeg:e.rainbowAngleDeg,residual});
  if(!residualPass(residual)||!Number.isFinite(e.rainbowAngleDeg))report.failures.push(`${s.name} order ${order}: nonfinite or excessive residual`);
 }
 for(let i=1;i<200;i++)for(const s of o.SPECTRUM)for(const order of [1,2]){
  const b=.999*i/200,p=order===1?o.tracePrimary(b,s.refractiveIndex):o.traceSecondary(b,s.refractiveIndex);if(!p)continue;
  report.sweep.validPaths++;const values=o.verifyPath(p),residual=Math.max(...Object.values(values));report.sweep.maxResidual=Math.max(report.sweep.maxResidual,residual);
  if(!residualPass(values))report.failures.push(`${s.name} order ${order} at b=${b}: invalid residual`);
 }
 const red=report.tests.find(x=>x.color==='red'&&x.internalReflections===1),violet=report.tests.find(x=>x.color==='violet'&&x.internalReflections===1),sr=report.tests.find(x=>x.color==='red'&&x.internalReflections===2),sv=report.tests.find(x=>x.color==='violet'&&x.internalReflections===2);
 report.angleChecks={primaryRedAbout42:red.angleDeg>41&&red.angleDeg<43,primaryVioletAbout40:violet.angleDeg>39&&violet.angleDeg<41,primaryRedOutsideViolet:red.angleDeg>violet.angleDeg,secondaryLarger:sr.angleDeg>red.angleDeg,secondaryColorOrderReversed:sr.angleDeg<sv.angleDeg,allImpactSweepPathsPresent:report.sweep.validPaths===199*o.SPECTRUM.length*2};
 for(const [name,passed] of Object.entries(report.angleChecks))if(!passed)report.failures.push(name);
}catch(error){report.failures.push(String(error?.stack??error));}
report.sourceChangesDuringCheck=inputs.filter(rel=>sha(path.join(root,rel))!==sourceHashes[rel]);
if(report.sourceChangesDuringCheck.length)report.failures.push('Source changed during check; rerun after edits settle');
report.passed=report.failures.length===0;
fs.writeFileSync(path.join(root,'research/physics/verification-v10.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({version:report.version,passed:report.passed,sweep:report.sweep,angleChecks:report.angleChecks,failures:report.failures},null,2));
if(!report.passed)process.exitCode=1;
