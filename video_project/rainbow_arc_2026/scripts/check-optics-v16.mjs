import {build} from 'esbuild';
import * as T from 'three';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'research/physics/v16');fs.mkdirSync(output,{recursive:true});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const tolerance=2e-6,errors=[];
const check=(pass,text)=>{if(!pass)errors.push(text);};
const bundle=await build({stdin:{contents:"export * from './src/optics';export * from './src/WorldV10';export * from './src/SpectralRibbonV15';export * from './src/MacroLookV15';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,outfile:path.join(output,'active-optics-v16.mjs')});
const sourceHashes=Object.keys(bundle.metafile.inputs).filter(p=>!p.startsWith('<')).map(p=>path.resolve(root,p)).filter(p=>fs.existsSync(p)).map(p=>({file:path.relative(root,p).replaceAll('\\','/'),sha256:sha(p)}));
sourceHashes.push({file:'scripts/check-optics-v16.mjs',sha256:sha(fileURLToPath(import.meta.url))});
const o=await import(pathToFileURL(path.join(output,'active-optics-v16.mjs')).href);
const report={version:'V16',schema:'rainbow.v16.independent-spherical-ray-and-rendered-mesh/1',createdUTC:new Date().toISOString(),passed:false,tolerance,scope:'Independent spherical-angle solution and scalar Snell/reflection checks of actual WorldV10 paths, actual spectral meshes and per-wavelength contact coordinates. CPU verification; not GPU visual approval.',sourceHashes,errors,extrema:[],sweep:{paths:0,maxResidual:0},runtime:{primary:[],secondary:[]},ribbon:{meshes:0,vertices:0,triangles:0,maxXYDeviation:0,maxContactOffset:0,maxColorDeviation:0,reflectionSegmentsChecked:0},radiance:{segments:0,maxEndpointDeviation:0},contacts:{count:0,maxRegistrationError:0},humanNormalSpeedPlayback:false,humanListening:false};

// Independent closed-form sphere geometry. Does not call tracePrimary,
// traceSecondary, refractBoundary, reflect or interpolateDisplayedSpectralPath.
function analytic(impact,n,order,radius=1){
 const i=Math.asin(impact),r=Math.asin(o.AIR.refractiveIndex*impact/n);
 const contacts=[];for(let k=0;k<=order+1;k++){const a=(1-k)*Math.PI-i+2*k*r;contacts.push(new T.Vector3(radius*Math.cos(a),radius*Math.sin(a),0));}
 const exit=contacts.at(-1),before=exit.clone().sub(contacts.at(-2)).normalize(),normal=exit.clone().normalize();
 const tangential=before.clone().addScaledVector(normal,-before.dot(normal)).multiplyScalar(n/o.AIR.refractiveIndex);
 const outgoing=tangential.addScaledVector(normal,Math.sqrt(Math.max(0,1-tangential.lengthSq()))).normalize();
 return {contacts,outgoing,incidenceRad:i,refractionRad:r};
}
const cross=(a,b)=>a.x*b.y-a.y*b.x;
function crossing(a,b,c,d){const u=b.clone().sub(a),v=d.clone().sub(c),delta=c.clone().sub(a),den=cross(u,v);if(Math.abs(den)<1e-13)return null;const t=cross(delta,v)/den,s=cross(delta,u)/den;return {t,s,point:a.clone().addScaledVector(u,t).toArray(),insideBoth:t>0&&t<1&&s>0&&s<1};}
function residuals(points,n,impact,order,radius){
 const expected=analytic(impact,n,order,radius),entry=points[1],exit=points.at(-2);
 const incoming=points[1].clone().sub(points[0]).normalize(),inside=points[2].clone().sub(points[1]).normalize();
 const leavingInside=exit.clone().sub(points.at(-3)).normalize(),outgoing=points.at(-1).clone().sub(exit).normalize();
 const sine=(d,p)=>d.clone().cross(p.clone().normalize()).length();
 const result={surface:Math.max(...points.slice(1,-1).map(p=>Math.abs(p.length()-radius))),independentContact:Math.max(...expected.contacts.map((p,i)=>p.distanceTo(points[i+1]))),entrySnell:Math.abs(o.AIR.refractiveIndex*sine(incoming,entry)-n*sine(inside,entry)),exitSnell:Math.abs(n*sine(leavingInside,exit)-o.AIR.refractiveIndex*sine(outgoing,exit)),outgoingDirection:outgoing.distanceTo(expected.outgoing),reflection:0};
 for(let j=2;j<points.length-2;j++){const before=points[j].clone().sub(points[j-1]).normalize(),after=points[j+1].clone().sub(points[j]).normalize(),normal=points[j].clone().normalize();const reflected=before.clone().addScaledVector(normal,-2*before.dot(normal));result.reflection=Math.max(result.reflection,reflected.distanceTo(after),Math.abs(before.dot(normal)+after.dot(normal)));}
 return result;
}
for(const sample of o.SPECTRUM)for(const order of [1,2]){
 const extreme=order===1?o.findPrimaryExtremum(sample.refractiveIndex,1024):o.findSecondaryExtremum(sample.refractiveIndex,1024),v=residuals(extreme.path.points,sample.refractiveIndex,extreme.impactParameter,order,1);
 report.extrema.push({color:sample.name,wavelengthNm:sample.wavelengthNm,order,impact:extreme.impactParameter,angle:extreme.rainbowAngleDeg,residuals:v});check(Object.values(v).every(x=>Number.isFinite(x)&&x<tolerance),`Extremum ${sample.name}/${order} fails independent Snell/sphere/reflection`);
 for(let j=1;j<200;j++){const impact=.999*j/200,p=order===1?o.tracePrimary(impact,sample.refractiveIndex):o.traceSecondary(impact,sample.refractiveIndex);check(!!p,`Missing ${sample.name}/${order}/${impact}`);if(!p)continue;const values=residuals(p.points,sample.refractiveIndex,impact,order,1),max=Math.max(...Object.values(values));report.sweep.paths++;report.sweep.maxResidual=Math.max(report.sweep.maxResidual,max);check(max<tolerance,`Sweep ${sample.name}/${order}/${impact} residual ${max}`);}
}
const find=(name,order)=>report.extrema.find(x=>x.color===name&&x.order===order);
report.colorOrder={primaryRedOutside:find('red',1).angle>find('violet',1).angle,secondaryVioletOutside:find('violet',2).angle>find('red',2).angle,primaryAnglesDescending:o.SPECTRUM.slice(1).every((s,k)=>find(o.SPECTRUM[k].name,1).angle>find(s.name,1).angle),secondaryAnglesAscending:o.SPECTRUM.slice(1).every((s,k)=>find(o.SPECTRUM[k].name,2).angle<find(s.name,2).angle)};
for(const [name,ok]of Object.entries(report.colorOrder))check(ok,'Incorrect '+name);

// This constructor is the active renderer's source, not a copy of its formulas.
const world=new o.WorldV10(undefined,new T.Scene());
for(const [role,order] of [['primary',1],['secondary',2]]){
 const paths=world[role];check(paths.length===o.SPECTRUM.length,`Actual ${role} wavelength count`);
 const impacts=paths.map(p=>p.points[1].y/p.points[1].length());
 check(Math.max(...impacts)-Math.min(...impacts)<1e-10,`Actual ${role} should share one white incident ray`);
 const points=paths.map((p,k)=>{const sample=o.SPECTRUM[k],v=residuals(p.points,sample.refractiveIndex,impacts[k],order,1.6);check(Object.values(v).every(x=>Number.isFinite(x)&&x<tolerance),`Runtime ${role}/${sample.name} has wrong path/contact/direction`);report.runtime[role].push({color:sample.name,impact:impacts[k],points:p.points.map(v=>v.toArray()),residuals:v});return p.points;});
 for(let j=2;j<points[0].length-1;j++)check(points[0][j].distanceTo(points.at(-1)[j])>1e-4,`${role} reflection/exit ${j} incorrectly merges red and violet`);
 const cr=crossing(points[0][2],points[0][3],points.at(-1)[2],points.at(-1)[3]);report.runtime[role+'ReflectedCrossing']=cr;
 if(role==='primary')check(cr?.insideBoth,'Primary reflected red/violet rays must cross inside the sphere');
}

function checkSpectrum(spectrum,inputs,label){
 const byRole={primary:inputs.filter(p=>p.role==='primary'),secondary:inputs.filter(p=>p.role==='secondary')};
 spectrum.group.traverse(mesh=>{if(!mesh.isMesh)return;const {segment,layer,spectralSteps,alongSteps,independentSnellRows,transverseOpticalOffsets}=mesh.userData;check(independentSnellRows===true&&transverseOpticalOffsets===0,`${label} has undeclared in-plane optical offsets`);
  const role=mesh.name.includes('-secondary-')?'secondary':'primary',rows=byRole[role],position=mesh.geometry.getAttribute('position');report.ribbon.meshes++;
  const colors=mesh.geometry.getAttribute('spectralColour'),indices=mesh.geometry.getIndex();
  for(let s=0;s<spectralSteps;s++)for(let t=0;t<alongSteps;t++){const n=s*(alongSteps+1)+t,expected=[n,n+1,n+alongSteps+1,n+1,n+alongSteps+2,n+alongSteps+1],start=(s*alongSteps+t)*6;for(let k=0;k<6;k++)check(indices.getX(start+k)===expected[k],`${label} spectral mesh connects noncorresponding wavelengths/segments`);report.ribbon.triangles+=2;}
  if(segment===2)report.ribbon.reflectionSegmentsChecked++;
  for(let s=0;s<=spectralSteps;s++){const r=s/spectralSteps*(rows.length-1),k=Math.min(rows.length-2,Math.floor(r)),q=r-k,ra=rows[k].points,rb=rows[k+1].points,radius=ra[1].length(),impact=(ra[1].y/radius)*(1-q)+(rb[1].y/radius)*q;
   const n=o.SPECTRUM[k].refractiveIndex*(1-q)+o.SPECTRUM[k+1].refractiveIndex*q,order=role==='primary'?1:2,expected=analytic(impact,n,order,radius),a=expected.contacts[segment-1],b=segment===expected.contacts.length?expected.contacts.at(-1).clone().addScaledVector(expected.outgoing,ra.at(-1).distanceTo(ra.at(-2))*(1-q)+rb.at(-1).distanceTo(rb.at(-2))*q):expected.contacts[segment];
   const expectedColor=new T.Color(rows[k].color).lerp(new T.Color(rows[k+1].color),q);
   for(let t=0;t<=alongSteps;t++){const index=s*(alongSteps+1)+t,p=new T.Vector3().fromBufferAttribute(position,index),correct=a.clone().lerp(b,t/alongSteps),xy=Math.hypot(p.x-correct.x,p.y-correct.y),colourDeviation=Math.max(Math.abs(colors.getX(index)-expectedColor.r),Math.abs(colors.getY(index)-expectedColor.g),Math.abs(colors.getZ(index)-expectedColor.b));report.ribbon.maxColorDeviation=Math.max(report.ribbon.maxColorDeviation,colourDeviation);check(colourDeviation<tolerance,`${label} reorders a spectral row's colour at reflection`);report.ribbon.vertices++;report.ribbon.maxXYDeviation=Math.max(report.ribbon.maxXYDeviation,xy);check(xy<tolerance,`${label}/${mesh.name}/${s}/${t} changes physical XY path`);if(t===0||t===alongSteps){const offset=p.distanceTo(correct);report.ribbon.maxContactOffset=Math.max(report.ribbon.maxContactOffset,offset);check(offset<tolerance,`${label} moves wavelength ${s} endpoint off exact Snell contact`);}if(layer===0)check(Math.abs(p.z-correct.z)<tolerance,`${label} center sheet changes optical plane`);}
  }
 });
}
const allInputs=[...world.primary.map((p,k)=>({points:p.points,color:o.SPECTRUM[k].color,role:'primary'})),...world.secondary.map((p,k)=>({points:p.points,color:o.SPECTRUM[k].color,role:'secondary'}))];
function checkRadiance(energy,inputs,label){energy.group.traverse(mesh=>{if(!mesh.isMesh)return;const match=/^v15-(primary|secondary)-radiance-(\d+)-segment-(\d+)$/.exec(mesh.name);if(!match)return;const index=Number(match[2]),segment=Number(match[3]),points=inputs[index].points,u=mesh.material.uniforms,residual=Math.max(u.uA.value.distanceTo(points[segment]),u.uB.value.distanceTo(points[segment+1]));report.radiance.segments++;report.radiance.maxEndpointDeviation=Math.max(report.radiance.maxEndpointDeviation,residual);check(residual<tolerance,`${label} photon/radiance segment ${segment} joins wrong wavelength endpoint`);});}
checkRadiance(world.energy,allInputs,'hero');
checkSpectrum(world.macroLook.spectrum,allInputs,'hero');
for(const [index,layer]of world.finiteBeam.entries()){
 const impact=world.primary[0].points[1].y/1.6+[-.018,.018][index];
 const inputs=o.SPECTRUM.map(s=>{const p=o.tracePrimary(impact,s.refractiveIndex),points=p.points.map(v=>v.clone().multiplyScalar(1.6));points.at(-1).copy(points.at(-2)).addScaledVector(p.outgoing,2.1);return {points,color:s.color,role:'primary'};});checkSpectrum(layer.spectrum,inputs,'finite-'+index);checkRadiance(layer.energy,inputs,'finite-'+index);
}
const counts={};world.macroLook.group.traverse(mesh=>{if(!mesh.isMesh||!mesh.name.startsWith('v16-'))return;const {role,spectralIndex,pointIndex,sharedEntry}=mesh.userData,expected=world[role][spectralIndex].points[pointIndex],residual=mesh.position.distanceTo(expected);report.contacts.count++;report.contacts.maxRegistrationError=Math.max(report.contacts.maxRegistrationError,residual);check(residual<tolerance,`Contact ${mesh.name} is not registered to its wavelength`);const key=role+':'+pointIndex;counts[key]=(counts[key]??0)+1;if(sharedEntry)check(spectralIndex===0&&pointIndex===1,`Invalid shared contact ${mesh.name}`);});
for(const [role,order]of [['primary',1],['secondary',2]]){check(counts[role+':1']===1,`${role} should have one shared entrance contact`);for(let j=2;j<=order+2;j++)check(counts[role+':'+j]===o.SPECTRUM.length,`${role} contact ${j} must retain each independent wavelength`);}
report.contacts.counts=counts;world.dispose();
report.sourceChangesDuringCheck=sourceHashes.filter(x=>sha(path.join(root,x.file))!==x.sha256).map(x=>x.file);check(report.sourceChangesDuringCheck.length===0,'Source changed during check');
report.passed=errors.length===0;fs.writeFileSync(path.join(output,'verification-v16.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({version:report.version,passed:report.passed,sweep:report.sweep,colorOrder:report.colorOrder,primaryCrossing:report.runtime.primaryReflectedCrossing,secondaryCrossing:report.runtime.secondaryReflectedCrossing,ribbon:report.ribbon,radiance:report.radiance,contacts:report.contacts,errors:report.errors.slice(0,30)},null,2));if(!report.passed)process.exitCode=1;
