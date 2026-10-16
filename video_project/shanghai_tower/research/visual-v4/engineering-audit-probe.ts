import * as T from 'three';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {PhysicsPlayback} from '../../src/PhysicsPlayback';
import {HighResolutionResponse} from '../../src/HighResolutionResponse';
import {EnvironmentPlayback} from '../../src/EnvironmentPlayback';
import {CameraPath} from '../../src/CameraPath';
import {stateAt,pulse,V} from '../../src/visual';

const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const response=read('public/physics/response.json'),env=read('public/physics/environment-response.json'),
 manifest=read('public/models/shanghai-tower-manifest.json'),tl=read('src/timeline.json'),meta=read('public/physics/cinematic-response.json');
const bytes=fs.readFileSync('public/'+meta.binary),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const physics=new PhysicsPlayback(response,tl,new HighResolutionResponse(meta,buffer));
const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1920/1080,.008,200),path=new CameraPath(tl);path.setAnchors(manifest.cameraAnchorsThree);
const effects=new EnvironmentPlayback(scene,env,physics);
const nodeIndex=new Map(response.nodes.map((n:any,i:number)=>[n.id,i]));
const p=(a:number[])=>V(...a as [number,number,number]).multiplyScalar(.01);
const anchors=manifest.forceAnchorsThree,load=p(anchors.floorLoad.point),contact=p(anchors.floorCoreContact.point),column=p(anchors.outriggerColumn.point);
const routePoints=[
 [load,contact,...manifest.coreLoadPathThree.map(p)],
 [load,column.clone().setY(load.y),...manifest.columnPathThree.map(p)],
];
const curves=routePoints.map(points=>{const c=new T.CurvePath<T.Vector3>();for(let i=1;i<points.length;i++)if(points[i].distanceTo(points[i-1])>1e-7)c.add(new T.LineCurve3(points[i-1],points[i]));return c;});
function fullCoreDeformation(point:T.Vector3){
 const m=point.clone().multiplyScalar(100);let best=Infinity,axis=physics.coreAxes[0],w=0;
 for(const a of physics.coreAxes){const f=T.MathUtils.clamp(m.clone().sub(a.a).dot(a.delta)/a.l2,0,1),d=m.distanceToSquared(a.a.clone().addScaledVector(a.delta,f));if(d<best){best=d;axis=a;w=f;}}
 const offset=m.clone().sub(axis.a.clone().addScaledVector(axis.delta,w));
 const u=V(),r=V();for(let k=0;k<3;k++){u.setComponent(k,T.MathUtils.lerp(physics.currentU[axis.i*3+k],physics.currentU[axis.j*3+k],w));r.setComponent(k,T.MathUtils.lerp(physics.currentR[axis.i*3+k],physics.currentR[axis.j*3+k],w));}
 return u.add(r.cross(offset)).multiplyScalar(.01*(physics.play?.weight??0)*(physics.play?.scale??1));
}
const screen=(p:T.Vector3)=>{const q=p.clone().project(camera);return new T.Vector2((q.x+1)*960,(1-q.y)*540);};
let checks=0,windMax=0,axialDirectionErrors=0,maxRoutePixel={px:0,frame:0,time:0,u:0,route:0,point:[0,0,0],renderDelta:[0,0,0]},maxForceDirectionError=0;
let maxPileLabel={px:0,frame:0,role:''};
for(let frame=0;frame<tl.duration;frame+=3){
 const s=stateAt(frame,tl),u=s.n+s.u;if(!((u>=6.65&&u<7.9)||(u>=15.9&&u<17.15)||(u>=18.85&&u<21.15)||(u>=29.85&&u<34.6)))continue;
 physics.update(s);path.apply(camera,s.time);effects.update(s,camera);scene.updateMatrixWorld(true);checks++;
 if(u>=29.85&&u<34.6)for(let j=0;j<effects.windIndices.length;j++){
  const k=effects.windIndices[j],id=env.tmd.windLoads.nodeIds[k],idx=nodeIndex.get(id) as number,rest=p(env.tmd.windLoads.nodeXYZ_m[k]);
  const expected=rest.clone().add(V(physics.currentU[idx*3],physics.currentU[idx*3+1],physics.currentU[idx*3+2]).multiplyScalar(.01*(physics.play?.weight??0)*(physics.play?.scale??1)));
  windMax=Math.max(windMax,expected.distanceTo(effects.windTargets[j].position));
  const ar=effects.windArrows[j];if(ar.root.visible){const actual=V(0,1,0).applyQuaternion(ar.root.quaternion),f=p(env.tmd.windLoads.baseForce_N[k]).multiplyScalar(effects.tmd(s).windFactor).normalize();maxForceDirectionError=Math.max(maxForceDirectionError,actual.distanceTo(f));}
 }
 for(let j=0;j<effects.axialArrows.length;j++){
  const ar=effects.axialArrows[j];if(!ar.root.visible)continue;const idx=effects.axialIndices[Math.floor(j/2)],stress=physics.currentStress[idx],outward=physics.axes[idx].delta.clone().normalize().multiplyScalar(j%2?1:-1),actual=V(0,1,0).applyQuaternion(ar.root.quaternion),expected=outward.multiplyScalar(stress>=0?1:-1);if(actual.dot(expected)<.99999)axialDirectionErrors++;
 }
 const gravity=pulse(15.9,16.15,16.85,17.15,u)+pulse(32.9,33.2,33.7,34,u);
 if(gravity>.9)for(let r=0;r<curves.length;r++)for(let i=0;i<4;i++){
  const rest=curves[r].getPoint((s.time*.15+i/4)%1),dot=rest.clone().add(physics.displacementAt(rest)),tube=rest.clone().add(fullCoreDeformation(rest)),projected=dot.clone().project(camera);if(projected.z<0||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1)continue;
  const px=screen(dot).distanceTo(screen(tube));if(px>maxRoutePixel.px)maxRoutePixel={px,frame,time:s.time,u,route:r,point:rest.toArray(),renderDelta:tube.clone().sub(dot).toArray()};
 }
 if(u>=6.8&&u<7.9){
  const markers=[{role:'side',label:V(.149,-.55,.351),arrow:effects.sideArrows[2]},{role:'toe',label:V(.125,-.835,.343),arrow:effects.toeArrow}];
  for(const marker of markers){const ar=marker.arrow,tip=V(0,ar.shaft.scale.y+ar.head.scale.y,0).applyQuaternion(ar.root.quaternion).add(ar.root.position).add(effects.pile.position);const px=screen(marker.label).distanceTo(screen(tip));if(px>maxPileLabel.px)maxPileLabel={px,frame,role:marker.role};}
 }
}
const output={scope:'CPU-only source/data audit; no WebGL renderer, images or new solve.',checks,windNodalAnchorMaximumRenderUnitError:windMax,windForceDirectionMaximumUnitVectorError:maxForceDirectionError,axialArrowDirectionErrors:axialDirectionErrors,routeDotVsFullyDeformedLineMaximumProjectedError:maxRoutePixel,pileLabelVsCurrentArrowEndpointMaximumProjectedDistance:maxPileLabel,sourceHashes:Object.fromEntries(['src/World.ts','src/PhysicsPlayback.ts','src/EnvironmentPlayback.ts','public/physics/cinematic-response.json','public/models/shanghai-tower-manifest.json'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))};
fs.writeFileSync('research/visual-v4/engineering-audit-probe.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
