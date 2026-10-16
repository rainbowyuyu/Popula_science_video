import * as T from 'three';
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {PhysicsPlayback,WIND_MAGNIFICATION,STRESS_COLOR_POWER,CORE_STRESS_COLOR_POWER} from '../../src/PhysicsPlayback';
import {EnvironmentPlayback,TMD_RELATIVE_MAGNIFICATION} from '../../src/EnvironmentPlayback';
import {WindVisualization} from '../../src/WindVisualization';
import {CameraPath} from '../../src/CameraPath';
import {stateAt,V,ramp} from '../../src/visual';
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8')),sha=(p:string)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const frozen=read('research/visual-v3/render-inputs.json'),data=read('public/physics/response.json'),envData=read('public/physics/environment-response.json'),tl=read('src/timeline.json'),manifest=read('public/models/shanghai-tower-manifest.json');
const auditedFiles=['src/PhysicsPlayback.ts','src/EnvironmentPlayback.ts','src/WindVisualization.ts','src/World.ts','src/Film.tsx','src/CameraPath.ts','src/timeline.json','public/physics/response.json','public/physics/environment-response.json','public/physics/structural-graph.json'];
const hashes=Object.fromEntries(auditedFiles.map(p=>[p,sha(p)]));for(const p of auditedFiles)assert.equal(hashes[p],frozen.files[p]);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1920/1080,.008,200),physics=new PhysicsPlayback(data,tl),env=new EnvironmentPlayback(scene,envData,physics),wind=new WindVisualization(scene,physics),path=new CameraPath(tl);path.setAnchors(manifest.cameraAnchorsThree);
const clips=['s013','s019','s020','s029','s030','s031','s032','s033','s034','s035','s036','s037','s038','s039'];
const frames=new Set<number>([4171,6780]);for(const id of clips){const c=tl.clips.find((c:any)=>c.id===id)!;for(const phase of [.05,.25,.5,.75,.95])frames.add(Math.floor(c.start+(c.end-c.start)*phase));}
let arrowSamples=0,axisSamples=0,referenceSamples=0,maxAnchorError=0,maxReferenceError=0,maxDirectionError=0,minWakeVelocity=Infinity,maxWakeVelocity=-Infinity,maxUpstreamDeflection=0;
const samples:any[]=[];
for(const frame of [...frames].sort((a,b)=>a-b)){
 const s=stateAt(frame,tl);physics.update(s);path.apply(camera,s.time);camera.updateMatrixWorld();env.update(s,camera);wind.update(s,camera);const u=s.n+s.u;
 if(env.wind.visible)for(let j=0;j<env.windArrows.length;j++){
  const ar=env.windArrows[j];if(!ar.root.visible)continue;const actualDirection=V(0,1,0).applyQuaternion(ar.root.quaternion),k=env.windIndices[j],force=V(...envData.tmd.windLoads.baseForce_N[k]).normalize();const d=1-actualDirection.dot(force);assert(Math.abs(d)<1e-10);maxDirectionError=Math.max(maxDirectionError,Math.abs(d));
  const tip=V(0,ar.head.position.y+ar.head.scale.y*.5,0).applyQuaternion(ar.root.quaternion).add(ar.root.position),rest=V(...envData.tmd.windLoads.nodeXYZ_m[k]).multiplyScalar(.01),anchor=rest.clone().add(physics.displacementAt(rest)),error=tip.distanceTo(anchor);assert(error<1e-10);maxAnchorError=Math.max(maxAnchorError,error);arrowSamples++;
 }
 for(let j=0;j<env.axialArrows.length;j++){
  const ar=env.axialArrows[j];if(!ar.root.visible)continue;const idx=env.axialIndices[Math.floor(j/2)],axis=physics.axes[idx],stress=physics.currentStress[idx],outward=axis.delta.clone().normalize().multiplyScalar(j%2?1:-1),direction=V(0,1,0).applyQuaternion(ar.root.quaternion);assert(direction.dot(outward)*Math.sign(stress)>.999999);assert.equal(ar.mat.color.getHexString(),stress>=0?'087d9b':'d75d37');axisSamples++;
 }
 if(env.reference.visible){const a=env.outline.geometry.getAttribute('instanceStart'),b=env.currentReference.geometry.getAttribute('instanceStart');for(const k of [0,20,50,80,99]){const p=V(a.getX(k),a.getY(k),a.getZ(k)),q=V(b.getX(k),b.getY(k),b.getZ(k)),expected=physics.displacementAt(p),error=q.sub(p).distanceTo(expected);assert(error<1e-6);maxReferenceError=Math.max(maxReferenceError,error);referenceSamples++;}}
 if(wind.root.visible){
  for(const stream of wind.streams){for(let k=0;k<stream.points.length;k++)if(stream.basePoints[k].x<=.82)maxUpstreamDeflection=Math.max(maxUpstreamDeflection,stream.points[k].distanceTo(stream.basePoints[k]));assert(stream.positions.every(Number.isFinite));}
  if(s.section==='wind'){const next=stateAt(frame+1,tl),dt=physics.physicalTime(next)-physics.physicalTime(s);if(dt>0)for(const h of [.58,1.69,2.82,4.03,5.24]){const phaseDelta=(ramp(31,31.85,next.n+next.u)-ramp(31,31.85,u))*(h-.58)*1.12,v=(1.16+phaseDelta/dt)/3.65;minWakeVelocity=Math.min(minWakeVelocity,v);maxWakeVelocity=Math.max(maxWakeVelocity,v);assert(v>0);}}
 }
 const tm=env.tmd(s),length=manifest.tmdAnchorsThree.cableLength,ratio=tm.relative/length;assert(Math.abs(ratio)<1);const angleDeg=T.MathUtils.radToDeg(Math.asin(ratio));
 samples.push({frame,clip:s.clip.id,clipU:s.u,physicalTime:physics.physicalTime(s),windVisible:wind.root.visible,windArrows:env.wind.visible,axialStressMPa:env.axialIndices.map(i=>physics.currentStress[i]),tmdRelativeMetres:tm.relative,tmdAngleDeg:angleDeg});
}
assert.equal(maxUpstreamDeflection,0);
// Continuity probes around s031 start and its full height-decorrelation endpoint.
const phaseContinuity:any[]=[];
const c31=tl.clips.find((c:any)=>c.id==='s031')!;
for(const u of [31,31.85]){const frame=c31.start+(u-31)*(c31.end-c31.start);const values=[];for(const df of [-.001,0,.001]){const s=stateAt(frame+df,tl);physics.update(s);path.apply(camera,s.time);wind.update(s,camera);values.push(wind.streams.filter(x=>Math.abs(x.offset)<.3).map(st=>st.points[125].toArray()));}let jump=0;for(let i=0;i<values[0].length;i++)jump=Math.max(jump,new T.Vector3(...values[0][i]).distanceTo(new T.Vector3(...values[2][i])));assert(jump<.0001);phaseContinuity.push({u,probeHalfWidthFrames:.001,maxWorldDelta:jump});}
const maxRelative=Math.max(...envData.tmd.relativeX_m.map(Math.abs)),L=manifest.tmdAnchorsThree.cableLength;
const columnIndices=data.members.map((m:any,i:number)=>/megacolumn|corner/i.test(m.role)?i:-1).filter((i:number)=>i>=0),maxColumnStress=Math.max(...physics.dynamicStress.flatMap(row=>columnIndices.map((i:number)=>Math.abs(row[i]))));assert(maxColumnStress<=6);
const coreMax=Math.max(...envData.tmd.coreWindSection.extremeMPa.flat());assert(coreMax<=6);
for(const p of auditedFiles)assert.equal(sha(p),hashes[p]);
const report={date:new Date().toISOString(),scope:'Frozen-source offline playback sampling, not a new solve and not final encoded-video QA',hashes,allMatchFrozenInputs:true,sampleCount:samples.length,arrowSamples,axisSamples,referenceSamples,maxAnchorError,maxReferenceError,maxDirectionError,maxUpstreamDeflection,minWakeVelocity,maxWakeVelocity,phaseContinuity,columnLegend:{limit:6,maxAbsoluteMPa:maxColumnStress,colorPower:STRESS_COLOR_POWER,positive:'blue / tension-directed increment',negative:'orange / compression-directed increment'},coreLegend:{range:[0,6],maxMPa:coreMax,colorPower:CORE_STRESS_COLOR_POWER,meaning:'unsigned equivalent section normal-stress envelope'},magnification:{tower:WIND_MAGNIFICATION,tmdRelative:TMD_RELATIVE_MAGNIFICATION},tmd:{cableLengthMetres:L,maxRelativeMetres:maxRelative,maxAngleDeg:T.MathUtils.radToDeg(Math.asin(maxRelative/L)),maxPendulumRiseMetres:L-Math.sqrt(L*L-maxRelative*maxRelative),relativeWorldAmplitude:maxRelative*.01},samples};
fs.writeFileSync('research/visual-v3/frozen-physics-qa.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,samples:undefined,hashes:undefined},null,2));
