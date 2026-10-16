import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as T from 'three';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),prefix=`cuff-v6-audit-${process.pid}-${Date.now()}`,files=[];
const timeline=JSON.parse(fs.readFileSync(path.join(root,'src/hypertension/timeline.json'),'utf8'));
const worldSource=fs.readFileSync(path.join(root,'src/hypertension/World.ts'),'utf8');
for(const name of ['World','CameraPath','VascularDetail']){
 let source=fs.readFileSync(path.join(root,`src/hypertension/${name}.ts`),'utf8').replace("import timeline from './timeline.json';",`const timeline=${JSON.stringify(timeline)};`).replace("'./CameraPath'",`'./${prefix}-CameraPath.mjs'`).replace("'./VascularDetail'",`'./${prefix}-VascularDetail.mjs'`);
 const file=path.join(root,'tmp',`${prefix}-${name}.mjs`);files.push(file);fs.writeFileSync(file,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
try{
 // Canvas texture needs only a width/height holder while geometry is built;
 // no renderer, canvas drawing, visual comparison or browser is used here.
 globalThis.document={createElement(tag){if(tag!=='canvas')throw Error('Unexpected DOM request');return {width:0,height:0};}};
 const {HypertensionWorld}=await import(pathToFileURL(path.join(root,'tmp',`${prefix}-World.mjs`)).href);
 const w=Object.create(HypertensionWorld.prototype);Object.assign(w,{measureRoot:new T.Group(),anchors:{},screens:[]});w.measureRoot.position.x=12;w.buildMeasure();w.measureRoot.updateMatrixWorld(true);
 const find=n=>{const o=w.measureRoot.getObjectByName(n);if(!o)throw Error('Missing '+n);return o;};
 const cuff=find('measurement-upper-arm-cuff'),arm=find('measurement-upper-arm'),forearm=find('measurement-forearm'),pad=find('measurement-forearm-support'),table=find('measurement-support-table'),cable=find('measurement-connected-air-tube'),cuffPort=find('measurement-cuff-air-connector'),monitorPort=find('measurement-monitor-air-port');
 const axis=o=>new T.Vector3(0,1,0).applyQuaternion(o.getWorldQuaternion(new T.Quaternion())).normalize();
 const cuffAxis=axis(cuff),armAxis=axis(arm),center=cuff.getWorldPosition(new T.Vector3()),armCenter=arm.getWorldPosition(new T.Vector3());
 const pointOffAxis=center.clone().sub(armCenter).cross(armAxis).length();
 const end=o=>o.localToWorld(new T.Vector3(0,o.geometry.parameters.height*.5,0));
 const cuffSocket=end(cuffPort),monitorSocket=end(monitorPort),pathCurve=cable.geometry.parameters.path;
 const cableStart=w.measureRoot.localToWorld(pathCurve.getPointAt(0)),cableEnd=w.measureRoot.localToWorld(pathCurve.getPointAt(1));
 const padBox=new T.Box3().setFromObject(pad,true),tableBox=new T.Box3().setFromObject(table,true),forearmBox=new T.Box3().setFromObject(forearm,true);
 const forearmStart=forearm.localToWorld(new T.Vector3(0,-forearm.geometry.parameters.height*.5,0)),forearmEnd=forearm.localToWorld(new T.Vector3(0,forearm.geometry.parameters.height*.5,0));
 const segment=new T.Line3(forearmStart,forearmEnd);let minCableArmClearance=Infinity,minCableTableClearance=Infinity;
 for(let i=0;i<=400;i++){
  const p=w.measureRoot.localToWorld(pathCurve.getPointAt(i/400)),near=segment.closestPointToPoint(p,true,new T.Vector3());minCableArmClearance=Math.min(minCableArmClearance,p.distanceTo(near)-.19-.023);
  if(p.x>=tableBox.min.x&&p.x<=tableBox.max.x&&p.z>=tableBox.min.z&&p.z<=tableBox.max.z)minCableTableClearance=Math.min(minCableTableClearance,p.y-.023-tableBox.max.y);
 }
 const sourceMethod=worldSource.slice(worldSource.indexOf(' private buildMeasure(){'),worldSource.indexOf(' private pulse(',worldSource.indexOf(' private buildMeasure(){')));
 const report={createdAt:new Date().toISOString(),scope:'Production buildMeasure and buildMonitor called directly from current TypeScript. Checks spatial alignment, support and connected cable endpoints without GPU rendering. Camera/visual approval is separate.',buildMeasureSha256:crypto.createHash('sha256').update(sourceMethod).digest('hex'),worldSourceSha256:crypto.createHash('sha256').update(worldSource).digest('hex'),cuff:{axisAlignmentAbsDot:Math.abs(cuffAxis.dot(armAxis)),centerDistanceFromArmAxis:pointOffAxis,centerWorld:center.toArray(),axisWorld:cuffAxis.toArray(),innerRadialClearance:cuff.userData.innerRadius-cuff.userData.armRadius,elbowGap:cuff.userData.elbowGap,width:cuff.userData.width},support:{forearmBottom:forearmBox.min.y,padTop:padBox.max.y,verticalGap:forearmBox.min.y-padBox.max.y,padWithinTableXZ:padBox.min.x>=tableBox.min.x&&padBox.max.x<=tableBox.max.x&&padBox.min.z>=tableBox.min.z&&padBox.max.z<=tableBox.max.z,forearmWithinPadXZ:forearmBox.min.x>=padBox.min.x-.04&&forearmBox.max.x<=padBox.max.x+.04&&forearmBox.min.z>=padBox.min.z&&forearmBox.max.z<=padBox.max.z},tube:{cuffSocketEndpointError:cableStart.distanceTo(cuffSocket),monitorSocketEndpointError:cableEnd.distanceTo(monitorSocket),minimumForearmSurfaceClearance:minCableArmClearance,minimumTabletopClearance:minCableTableClearance},anchors:Object.fromEntries(Object.entries(w.anchors).map(([k,p])=>[k,p.toArray()]))};
 report.passed=report.cuff.axisAlignmentAbsDot>1-1e-10&&pointOffAxis<1e-8&&report.cuff.innerRadialClearance>0&&report.cuff.innerRadialClearance<.01&&report.cuff.elbowGap>.07&&report.cuff.elbowGap<.15&&Math.abs(report.support.verticalGap)<.005&&report.support.padWithinTableXZ&&report.support.forearmWithinPadXZ&&report.tube.cuffSocketEndpointError<1e-8&&report.tube.monitorSocketEndpointError<1e-8&&minCableArmClearance>0&&minCableTableClearance>=0;
 fs.writeFileSync(path.join(root,'research/hypertension/cuff-v6-geometry-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}finally{for(const file of files)fs.unlinkSync(file);delete globalThis.document;}
