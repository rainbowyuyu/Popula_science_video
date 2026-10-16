import fs from 'node:fs';
import * as T from 'three';
import {V5CameraPath} from '../../../src/V5CameraPath';
const root=process.cwd();
const evidence=JSON.parse(fs.readFileSync(root+'/research/revision-v5/garment-diagnostic/metrics.json','utf8'));
const anchors=Object.fromEntries(Object.entries(evidence.anchors).map(([key,value])=>[key,new T.Vector3(...value as [number,number,number])]));
const tl=JSON.parse(fs.readFileSync(root+'/src/timeline.json','utf8'));
const route=new V5CameraPath(anchors,tl);
const smooth=(x:number)=>{const u=Math.max(0,Math.min(1,x));return u*u*u*(u*(u*6-15)+10)};
const rows=[4180,4220,4260,4300,4340,4380].map(frame=>{
 const p=route.sample(frame);
 const gate=smooth(Math.log(p.distance/1.20)/Math.log(2.40/1.20));
 return{frame,distance:p.distance,focus:p.focus.toArray(),candidateEntryGate:gate};
});
const report={method:'CPU-only current camera path sampled against preserved model anchors from garment diagnostic. No GPU rendering; no subjective acceptance.',anchorSource:'research/revision-v5/garment-diagnostic/metrics.json',rows,knots:route.knots.filter(k=>k.frame>3900&&k.frame<4490).map(k=>({...k,focus:k.focus.toArray()}))};
fs.writeFileSync(root+'/research/revision-v5/person-final-candidates/camera-samples.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
