import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Vector3} from 'three';

const root=process.cwd(),work=path.join(root,'work/v4-native-qa');await fs.mkdir(work,{recursive:true});
const bundle=path.join(work,'native-platform.mjs');
await build({entryPoints:[path.join(root,'src/beso/NativePlatform.ts')],outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {NativePlatform}=await import(pathToFileURL(bundle).href+'?qa='+Date.now());
const model=JSON.parse(await fs.readFile(path.join(root,'public/beso-research/physics/native-model.json'),'utf8'));
const response=JSON.parse(await fs.readFile(path.join(root,'public/beso-research/physics/zwind-response.json'),'utf8'));
const platform=new NativePlatform(model,response),failures=[],source=v=>new Vector3(v[0],v[2],-v[1]);
platform.setTime(0,true);platform.group.updateMatrixWorld(true);
const members=[];
for(const e of model.elements){
  const object=platform.group.getObjectByName(`Native member ${e.id} (${e.role})`),a=source(model.nodes[String(e.from)]),b=source(model.nodes[String(e.to)]),length=a.distanceTo(b);
  if(!object){failures.push({type:'missing_native_member',id:e.id});continue;}
  const first=object.localToWorld(new Vector3(0,-length/2,0)),second=object.localToWorld(new Vector3(0,length/2,0));
  const residual=Math.min(Math.max(first.distanceTo(a),second.distanceTo(b)),Math.max(first.distanceTo(b),second.distanceTo(a)));
  if(residual>1e-7)failures.push({type:'misaligned_native_member',id:e.id,residual});
  members.push({id:e.id,role:e.role,endpointResidualM:residual,lengthM:length});
}
const lineChecks=[];
for(const time of [0.01,17,46,92,120]){
  platform.setVisualOceanTime(time*.18);platform.setTime(time);platform.group.updateMatrixWorld(true);
  for(const sourceLine of model.mooringPolylines){
    const line=sourceLine.line,points=platform.getMooringPath(line),fairlead=platform.getCalloutAnchors()[`fairlead-${line}`].object.getWorldPosition(new Vector3());
    const end=points.at(-1).clone().applyMatrix4(platform.group.matrixWorld),anchor=points[0].clone().applyMatrix4(platform.group.matrixWorld),rest=source(sourceLine.nativeXYZ[0]).applyMatrix4(platform.group.matrixWorld);
    const endpointResidual=fairlead.distanceTo(end),anchorResidual=anchor.distanceTo(rest),tension=platform.getMooringTension(line);
    if(endpointResidual>1e-8||anchorResidual>1e-8||!Number.isFinite(tension))failures.push({type:'line_binding',line,time,endpointResidual,anchorResidual,tension});
    lineChecks.push({line,time,endpointResidualM:endpointResidual,anchorResidualM:anchorResidual,tensionN:tension});
  }
}
const counts={outerColumns:members.filter(x=>x.role==='outer_column').length,innerLegs:members.filter(x=>x.role==='inner_leg').length,radialBeams:members.filter(x=>x.role==='hub_radial_box_beam').length,mooringLines:model.mooringPolylines.length};
if(counts.outerColumns!==3||counts.innerLegs!==3||counts.radialBeams!==3||counts.mooringLines!==12)failures.push({type:'native_counts',counts});
const report={schema:'launch-v4-native-binding-qa-v1',checked:new Date().toISOString(),counts,members,lineChecks,pass:failures.length===0,failures,boundary:'Tests geometry transforms and saved fairlead binding. Does not certify a new hydrodynamic solve or CAD manufacturing fit.'};
await fs.mkdir(path.join(root,'research/qa'),{recursive:true});await fs.writeFile(path.join(root,'research/qa/launch-v4-native-binding.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,counts,memberMaxResidualM:Math.max(...members.map(x=>x.endpointResidualM)),lineMaxResidualM:Math.max(...lineChecks.map(x=>x.endpointResidualM)),failures},null,2));platform.dispose();
if(failures.length)process.exitCode=1;
