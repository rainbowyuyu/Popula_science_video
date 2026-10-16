import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {Vector3,Mesh,Color} from 'three';

const root=process.cwd(),work=path.join(root,'work/v5-native-qa');await fs.mkdir(work,{recursive:true});
const bundle=path.join(work,'native-platform.mjs');
await build({entryPoints:[path.join(root,'src/beso/NativePlatformV5.ts')],outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {NativePlatformV5}=await import(pathToFileURL(bundle).href+'?qa='+Date.now());
const model=JSON.parse(await fs.readFile(path.join(root,'public/beso-research/physics/native-model.json'),'utf8'));
const response=JSON.parse(await fs.readFile(path.join(root,'public/beso-research/physics/zwind-response.json'),'utf8'));
const platform=new NativePlatformV5(model,response),failures=[],source=v=>new Vector3(v[0],v[2],-v[1]);
platform.setTime(0,true);platform.group.updateMatrixWorld(true);
const members=[];
for(const e of model.elements){
  const object=platform.group.getObjectByName(`Native member ${e.id} (${e.role})`),a=source(model.nodes[String(e.from)]),b=source(model.nodes[String(e.to)]),length=a.distanceTo(b);
  if(!object){failures.push({type:'missing_native_member',id:e.id});continue;}
  const first=object.localToWorld(new Vector3(0,-length/2,0)),second=object.localToWorld(new Vector3(0,length/2,0));
  const residual=Math.min(Math.max(first.distanceTo(a),second.distanceTo(b)),Math.max(first.distanceTo(b),second.distanceTo(a)));
  if(residual>1e-7)failures.push({type:'misaligned_native_member',id:e.id,residual});
  const detail=object.geometry.userData;
  if(e.role==='inner_leg'&&detail.lowerJointSurfaceResidualMaxM>1e-7)failures.push({type:'saddle_surface_gap',id:e.id,residual:detail.lowerJointSurfaceResidualMaxM});
  if(e.role==='inner_leg'&&detail.upperJointSurfaceResidualMaxM>1e-7)failures.push({type:'root_node_surface_gap',id:e.id,residual:detail.upperJointSurfaceResidualMaxM});
  if(e.role==='inner_leg'&&detail.endTrimM.min<=detail.startTrimM.max)failures.push({type:'inverted_leg_skin',id:e.id});
  if(e.role==='outer_column'){
    const positions=object.geometry.getAttribute('position');let maxRadius=0;
    for(let i=0;i<positions.count;i++)maxRadius=Math.max(maxRadius,Math.hypot(positions.getX(i),positions.getZ(i)));
    const radiusResidual=Math.abs(maxRadius-(e.diameterM/2));
    if(radiusResidual>1e-5)failures.push({type:'inflated_column',id:e.id,radiusResidual});
    detail.radiusResidualM=radiusResidual;
  }
  const {jointRings,...detailSummary}=detail;
  members.push({id:e.id,role:e.role,endpointResidualM:residual,lengthM:length,visibleShell:detailSummary});
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
const selectionChecks=[];
for(const focus of [null,2,null]){
  platform.setMooringFocus(focus);platform.setTime(46);platform.group.updateMatrixWorld(true);
  let activePackets=0,emissiveShells=0,coloredLines=0;
  const neutral=new Color('#526771');
  platform.group.traverse(o=>{
    if(o.name.startsWith('Saved tension highlight')&&o.visible)activePackets++;
    if(o instanceof Mesh&&o.name.startsWith('Native member')&&o.material.emissiveIntensity>0&&o.material.emissive.getHex()!==0)emissiveShells++;
    if(o instanceof Mesh&&o.name.startsWith('Native mooring line')&&!o.material.color.equals(neutral))coloredLines++;
  });
  const check={focus,activePackets,emissiveShells,coloredLines};selectionChecks.push(check);
  if(activePackets||emissiveShells||coloredLines!==(focus===null?0:1))failures.push({type:'selection_clutter',...check});
}
const counts={outerColumns:members.filter(x=>x.role==='outer_column').length,innerLegs:members.filter(x=>x.role==='inner_leg').length,radialBeams:members.filter(x=>x.role==='hub_radial_box_beam').length,mooringLines:model.mooringPolylines.length};
if(counts.outerColumns!==3||counts.innerLegs!==3||counts.radialBeams!==3||counts.mooringLines!==12)failures.push({type:'native_counts',counts});
const report={schema:'launch-v5-native-geometry-qa-v1',checked:new Date().toISOString(),sourceSHA256:createHash('sha256').update(await fs.readFile(path.join(root,'src/beso/NativePlatformV5.ts'))).digest('hex'),nativeModelSHA256:createHash('sha256').update(await fs.readFile(path.join(root,'public/beso-research/physics/native-model.json'))).digest('hex'),counts,members,lineChecks,selectionChecks,pass:failures.length===0,failures,
  designChoices:['Exact native node axes and native section diameters retained.','Outer columns use equal-diameter flat-capped fabricated shells; ivory upper coat and navy lower coat. A same-diameter 0.20D lower joint bay encloses each complete brace weld ring beyond the solver junction node. This fabrication skin is illustrative and does not change solver length, volume, or response.','Each native radial box beam endpoint has a local compact fabricated junction chamber: radial length 6.4 m, native beam width, height at least brace diameter plus 1 m, 0.12 m edge bevel. It supplies a complete brace root attachment around the thin equivalent hub, without replacing the source hub height or beam section.','Inner legs have analytical fishmouth cuts to local root junction chamber and finite outer-column shell, plus 55 mm presentation weld beads.','Underwater leg-to-column load path requires camera submergence or transparent ocean; no fabricated top connecting beam has been invented.','One selected mooring can use saved tension colour; all travelling packets and emissive shell highlights disabled.','No displacement or rotation exaggeration: recorded response remains 1:1.'],
  boundary:'Geometry and saved-response attachment checks; fabrication skins and weld details are illustrative, not recovered manufacturing CAD or a new hydrodynamic solve.'};
await fs.mkdir(path.join(root,'research/qa'),{recursive:true});await fs.writeFile(path.join(root,'research/qa/launch-v5-native-geometry.json'),JSON.stringify(report,null,2));
// Portable exact presentation geometry for CPU-only Blender inspection/source.
platform.setTime(0,true);platform.group.updateMatrixWorld(true);const meshes=[];
platform.group.traverse(o=>{
  if(!(o instanceof Mesh)||o.name.startsWith('Saved tension highlight')||o.name.startsWith('Discontinuous water contact')||o.name.startsWith('Native mooring line'))return;
  const p=o.geometry.getAttribute('position'),c=o.geometry.getAttribute('color'),index=o.geometry.index;
  const positions=[];for(let i=0;i<p.count;i++)positions.push(new Vector3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(o.matrixWorld).toArray());
  meshes.push({name:o.name,positions,indices:index?Array.from(index.array):Array.from({length:p.count},(_,i)=>i),colors:c?Array.from(c.array):null,
    color:o.material.color?.toArray()??[.65,.72,.72],roughness:o.material.roughness??.45,metalness:o.material.metalness??.2,userData:o.userData});
});
await fs.writeFile(path.join(work,'presentation-meshes.json'),JSON.stringify({axis:'Three.js Y-up, metres',meshes}));
console.log(JSON.stringify({pass:report.pass,counts,memberMaxResidualM:Math.max(...members.map(x=>x.endpointResidualM)),saddleMaxResidualM:Math.max(...members.filter(m=>m.role==='inner_leg').map(m=>m.visibleShell.lowerJointSurfaceResidualMaxM)),failures},null,2));platform.dispose();
if(failures.length)process.exitCode=1;
