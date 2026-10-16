import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'work/physics-optics-v09.bundle.mjs');
await build({entryPoints:[path.join(root,'src/optics.ts')],bundle:true,format:'esm',platform:'node',outfile:out});
const o=await import(`${out.replaceAll('\\','/').startsWith('/')?'file://':'file:///'}${out.replaceAll('\\','/')}?t=${Date.now()}`);
const report={version:'V09',sourceHashes:{'src/optics.ts':crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'src/optics.ts'))).digest('hex')},model:'sphere + geometric ray optics; no wave interference calculation',airRefractiveIndex:o.AIR.refractiveIndex,tolerance:1e-7,tests:[],sweep:{samples:199,colors:o.SPECTRUM.length,reflectionOrders:[1,2],validPaths:0,maxResidual:0},passed:true};
for(const s of o.SPECTRUM)for(const order of [1,2]){
 const e=order===1?o.findPrimaryExtremum(s.refractiveIndex,1024):o.findSecondaryExtremum(s.refractiveIndex,1024);
 const residual=o.verifyPath(e.path);report.tests.push({color:s.name,wavelengthNm:s.wavelengthNm,n:s.refractiveIndex,internalReflections:order,impactParameter:e.impactParameter,angleDeg:e.rainbowAngleDeg,residual});
 if(Object.values(residual).some(x=>x>report.tolerance))report.passed=false;
}
for(let i=1;i<200;i++)for(const s of o.SPECTRUM)for(const order of [1,2]){
 const b=.999*i/200,p=order===1?o.tracePrimary(b,s.refractiveIndex):o.traceSecondary(b,s.refractiveIndex);if(!p)continue;
 report.sweep.validPaths++;const residual=Math.max(...Object.values(o.verifyPath(p)));report.sweep.maxResidual=Math.max(report.sweep.maxResidual,residual);if(residual>report.tolerance)report.passed=false;
}
const red=report.tests.find(x=>x.color==='red'&&x.internalReflections===1),violet=report.tests.find(x=>x.color==='violet'&&x.internalReflections===1);
const sr=report.tests.find(x=>x.color==='red'&&x.internalReflections===2),sv=report.tests.find(x=>x.color==='violet'&&x.internalReflections===2);
report.angleChecks={primaryRedAbout42:red.angleDeg>41&&red.angleDeg<43,primaryVioletAbout40:violet.angleDeg>39&&violet.angleDeg<41,primaryRedOutsideViolet:red.angleDeg>violet.angleDeg,secondaryLarger:sr.angleDeg>red.angleDeg,secondaryColorOrderReversed:sr.angleDeg<sv.angleDeg};
report.passed&&=Object.values(report.angleChecks).every(Boolean);
fs.writeFileSync(path.join(root,'research/physics/verification-v09.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,sweep:report.sweep,angleChecks:report.angleChecks},null,2));
if(!report.passed)process.exitCode=1;
