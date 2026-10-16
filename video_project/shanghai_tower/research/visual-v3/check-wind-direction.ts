import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PhysicsPlayback} from '../../src/PhysicsPlayback';
import {EnvironmentPlayback} from '../../src/EnvironmentPlayback';
import {WindVisualization} from '../../src/WindVisualization';
import {CameraPath} from '../../src/CameraPath';
import {stateAt,V} from '../../src/visual';
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8')),tl=read('src/timeline.json'),d=read('public/physics/response.json'),e=read('public/physics/environment-response.json'),manifest=read('public/models/shanghai-tower-manifest.json');
const physics=new PhysicsPlayback(d,tl),scene=new T.Scene(),env=new EnvironmentPlayback(scene,e,physics),wind=new WindVisualization(scene,physics),camera=new T.PerspectiveCamera(34,1920/1080,.008,200),path=new CameraPath(tl);path.setAnchors(manifest.cameraAnchorsThree);
const s=stateAt(6780,tl);physics.update(s);path.apply(camera,s.time);camera.updateMatrixWorld();env.update(s,camera);wind.update(s,camera);
const tm=env.tmd(s),sumForce=e.tmd.windLoads.baseForce_N.reduce((a:number[],v:number[])=>a.map((x,i)=>x+v[i]*tm.windFactor),[0,0,0]);assert(sumForce[0]>0&&sumForce[1]===0&&sumForce[2]===0);
const p=V(0,2.8,0),a=p.clone().project(camera),b=p.clone().add(V(.2,0,0)).project(camera);const screenVector=[(b.x-a.x)*960,-(b.y-a.y)*540];assert(screenVector[0]<0);
const displacement=[.45,2.38,5.80].map(y=>({heightMetres:y*100,displayedWorldXYZ:physics.displacementAt(V(0,y,0)).toArray()}));
const snapshots=[];for(const frame of [6779,6781]){const q=stateAt(frame,tl);physics.update(q);wind.update(q,camera);snapshots.push(wind.streams.map(st=>({visible:st.head.visible,p:st.head.position.clone().sub(physics.displacementAt(V(0,st.height,0)))})));}
const advancing:any[]=[];for(let i=0;i<20;i++){const a=snapshots[0][i],b=snapshots[1][i],dx=b.p.x-a.p.x;if(a.visible&&b.visible&&Math.abs(dx)<1){assert(dx>0);advancing.push({stream:i,dxWorldOver2Frames:dx,baseZ:wind.streams[i].offset});}}
const result={frame:6780,clip:s.clip.id,physicalTime:physics.physicalTime(s),factor:tm.windFactor,netForceXYZ_N:sumForce,worldFlowDirection:'+X',projectedPlusPoint2X_Pixels:screenVector,relativeParticleAdvance:advancing,displayedDisplacement:displacement,interpretation:'Net force and illustrated carrier flow share +X. Wake occupies downstream x>0.82, which projects to the left in this camera. Structural displacement follows the transient solver; instantaneous displacement or velocity need not share the current force sign because of inertia and phase lag.'};
fs.writeFileSync('research/visual-v3/wind-direction-qa.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
