/** Independent endpoint/data checks for the exact visual model. No solver run. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as T from 'three';
const root=process.cwd(),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const model=await read('public/beso-research/physics/native-model.json'),response=await read('public/beso-research/physics/zwind-response.json');
const dir=path.join(root,'tmp/launch-v4-native-qa');await fs.mkdir(dir,{recursive:true});
const file=path.join(dir,'native.mjs');await build({entryPoints:[path.join(root,'src/beso/NativePlatform.ts')],outfile:file,bundle:true,format:'esm',platform:'node',packages:'external',target:'node22'});
const {NativePlatform}=await import(pathToFileURL(file).href+'?t='+Date.now());
const native=new NativePlatform(model,response),failures=[],axisErrors=[],bindingErrors=[],recordChecks=[];
const v=a=>new T.Vector3(a[0],a[2],-a[1]);
const roles=Object.fromEntries(['outer_column','inner_leg','hub_radial_box_beam'].map(role=>[role,model.elements.filter(e=>e.role===role).length]));
if(Object.values(roles).some(n=>n!==3)||model.mooringPolylines.length!==12)failures.push('Unexpected native assembly counts');
native.setTime(0,true);native.group.updateMatrixWorld(true);
native.platform.traverse(o=>{if(!o.userData.nativeElement)return;const e=model.elements.find(e=>e.id===o.userData.nativeElement),a=v(model.nodes[e.from]),b=v(model.nodes[e.to]),len=a.distanceTo(b);const p=new T.Vector3(0,-len/2,0).applyMatrix4(o.matrixWorld),q=new T.Vector3(0,len/2,0).applyMatrix4(o.matrixWorld);const error=Math.max(p.distanceTo(a),q.distanceTo(b));axisErrors.push({id:e.id,errorM:error});if(error>1e-5)failures.push(`Native member axis ${e.id}`)});
for(const time of [0,7.5,21,40,75,99,120]){
 native.group.position.set(31,0,-9);native.setVisualOceanTime(time/3);native.setTime(time);native.group.updateMatrixWorld(true);
 for(let line=1;line<=12;line++){
  const points=native.getMooringPath(line),anchor=native.getCalloutAnchors()['fairlead-'+line].object;
  const expected=points.at(-1).clone().applyMatrix4(native.group.matrixWorld),actual=anchor.getWorldPosition(new T.Vector3()),error=actual.distanceTo(expected);
  bindingErrors.push({time,line,errorM:error});if(error>1e-6)failures.push(`Fairlead endpoint mismatch t=${time} line=${line}`);
 }
 const exact=response.records.find(r=>Math.abs(r.t-time)<1e-9);
 if(exact){const error=Math.max(Math.abs(native.info.surge-exact.platform[0]),Math.abs(native.info.pitch-exact.platform[4]*180/Math.PI),...exact.mooringTensionN.map((n,i)=>Math.abs(n-native.getMooringTension(i+1))));recordChecks.push({time,maxError:error});if(error>1e-5)failures.push('Saved data mismatch at '+time)}
}
native.dispose();
const source='D:/python_project/beso_ai/rules/ai_vs_tuqiang_comparison.yaml',bytes=await fs.readFile(source),text=bytes.toString('utf8');
const block=text.split('id: steel_per_mw')[1]?.split('\n  - id:')[0]??'';
const ai=Number(block.match(/\n\s+ai:\s*([\d.]+)/)?.[1]),reference=Number(block.match(/\n\s+tuqiang:\s*([\d.]+)/)?.[1]);
if(ai!==255.5||reference!==278)failures.push('Case source values changed');
const evidence={schema:'launch-v4-paper-case-v1',source,sourceSHA256:hash(bytes),capacityMW:20,unit:'t/MW',ai,reference,reductionPercent:(1-ai/reference)*100,boundary:'Paper manuscript case comparison; separate from displayed native probe and visual waves. No new solve is claimed.'};
await fs.writeFile(path.join(root,'public/beso-research/physics/launch-case-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const report={checked:new Date().toISOString(),pass:!failures.length,roles,mooringCount:12,axisErrors,maxAxisErrorM:Math.max(...axisErrors.map(r=>r.errorM)),maxFairleadErrorM:Math.max(...bindingErrors.map(r=>r.errorM)),bindingErrors,recordChecks,evidence,failures,boundary:'Geometric and saved-data binding checks; not physical certification or a new solve.'};
await fs.writeFile(path.join(root,'research/qa/launch-v4-evidence.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,roles,axisCount:axisErrors.length,maxAxisErrorM:report.maxAxisErrorM,maxFairleadErrorM:report.maxFairleadErrorM,case:evidence,failures},null,2));
if(failures.length)process.exitCode=1;
