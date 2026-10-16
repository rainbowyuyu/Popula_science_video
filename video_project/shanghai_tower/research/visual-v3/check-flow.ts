import * as T from 'three';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {WindVisualization} from '../../src/WindVisualization';
import {EnvironmentPlayback} from '../../src/EnvironmentPlayback';
import {PhysicsPlayback} from '../../src/PhysicsPlayback';
import {CameraPath} from '../../src/CameraPath';
import {stateAt,V} from '../../src/visual';
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const timeline=read('src/timeline.json'),data=read('public/physics/environment-response.json');
const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1920/1080,.005,200),physics=new PhysicsPlayback(read('public/physics/response.json'),timeline);
const env=new EnvironmentPlayback(scene,data,physics),wind=new WindVisualization(scene,physics),path=new CameraPath(timeline);
path.setAnchors(read('public/models/shanghai-tower-manifest.json').cameraAnchorsThree);
const checks:any[]=[];
for(const frame of [1511,4214,6452,6658,6872,7121,7381,7624,7865,8108]){
 const s=stateAt(frame,timeline);physics.update(s);path.apply(camera,s.time);camera.updateMatrixWorld();env.update(s,camera);wind.update(s,camera);
 for(const stream of wind.streams){assert(stream.positions.every(Number.isFinite));assert(stream.colors.every(Number.isFinite));assert(stream.colors.every((x,i)=>i%4!==3||(x>=0&&x<=1)));}
 const attachments=[];
 for(let j=0;j<env.windArrows.length;j++){
  const ar=env.windArrows[j];if(!ar.root.visible||!env.wind.visible)continue;
  const k=env.windIndices[j],rest=new T.Vector3(...data.tmd.windLoads.nodeXYZ_m[k]).multiplyScalar(.01),expected=rest.clone().add(physics.displacementAt(rest));
  const headTip=V(0,ar.head.position.y+ar.head.scale.y*.5,0).applyQuaternion(ar.root.quaternion).add(ar.root.position);
  const error=headTip.distanceTo(expected);assert(error<1e-10);attachments.push(error);
 }
 checks.push({frame,section:s.section,windVisible:wind.root.visible,netLoadsVisible:env.wind.visible,finiteGeometry:true,maxLoadAnchorError:Math.max(0,...attachments),visibleArrows:attachments.length});
}
// Arbitrary-frame seeking must generate the same geometry after unrelated frames.
const s=stateAt(7121,timeline);physics.update(s);path.apply(camera,s.time);wind.update(s,camera);const first=wind.streams[5].positions.slice();
const other=stateAt(8108,timeline);physics.update(other);wind.update(other,camera);physics.update(s);path.apply(camera,s.time);wind.update(s,camera);
assert.deepEqual(wind.streams[5].positions,first);
const report={date:new Date().toISOString(),scope:'CPU geometry, encoded-view QA remains separate',checks,randomAccessDeterministic:true,streamCount:wind.streams.length};
fs.writeFileSync('research/visual-v3/flow-geometry-qa.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));wind.dispose();env.dispose();
