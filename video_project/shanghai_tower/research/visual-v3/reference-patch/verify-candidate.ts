import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from 'three';
import {EnvironmentPlayback,referenceTiming} from './src/EnvironmentPlayback';
import {PhysicsPlayback} from './src/PhysicsPlayback';
import {stateAt,V} from './src/visual';
const tl=JSON.parse(fs.readFileSync('src/timeline.json','utf8')),data=JSON.parse(fs.readFileSync('public/physics/response.json','utf8')),environment=JSON.parse(fs.readFileSync('public/physics/environment-response.json','utf8'));
const sha=(p:string)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),base=sha('src/EnvironmentPlayback.ts'),physics=new PhysicsPlayback(data,tl),env=new EnvironmentPlayback(new T.Scene(),environment,physics);
const ranges:number[][]=[];let begin=-1;for(let frame=0;frame<tl.duration;frame++){const s=stateAt(frame,tl),on=referenceTiming(s.n+s.u).draw>0;if(on&&begin<0)begin=frame;if(!on&&begin>=0){ranges.push([begin,frame-1]);begin=-1;}}
const frames=new Set<number>();for(const [a,b]of ranges){for(let f=a-1;f<=b+1;f+=7)frames.add(f);[a-1,a,a+1,b-1,b,b+1].forEach(f=>frames.add(f));}
for(const [a,b]of [[13.1,13.3],[13.55,13.75],[32.2,32.4],[33.35,33.55]])for(const u of [a,b]){const clip=tl.clips.find((c:any)=>Number(c.id.slice(1))===Math.floor(u));frames.add(Math.round(clip.start+(u-Math.floor(u))*(clip.end-clip.start)));}
const ordered=[...frames].sort((a,b)=>a-b),originalBuffer=env.currentReference.geometry.getAttribute('instanceStart').data;
const snapshot=()=>JSON.stringify({shown:env.reference.visible,outline:Array.from(env.outline.geometry.getAttribute('instanceStart').data.array),outlineEnd:Array.from(env.outline.geometry.getAttribute('instanceEnd').data.array),drawn:env.outline.geometry.instanceCount,displaced:Array.from(env.currentReference.geometry.getAttribute('instanceStart').data.array),connector:Array.from(env.connector.geometry.getAttribute('instanceStart').data.array),width:env.connector.material.linewidth,marker:env.referenceDot.position.toArray(),scale:env.referenceDot.scale.toArray()});
const snapshots=new Map<number,string>();let maxAnchorError=0,maxVisibleHeightError=0;const boundaries:any[]=[];
for(const frame of ordered){const s=stateAt(frame,tl),timing=referenceTiming(s.n+s.u);physics.update(s);env.update(s);assert.equal(env.currentReference.geometry.getAttribute('instanceStart').data,originalBuffer);assert.deepEqual(env.reference.position.toArray(),[0,0,.4]);assert.equal(env.outline.geometry.instanceCount,Math.ceil(timing.draw*100));
 if(env.connector.visible)assert.equal(timing.draw,1);if(env.referenceDot.visible){assert.equal(timing.draw,1);assert.equal(timing.connector,1);}
 const actualTip=env.referenceDot.position,rest=V(-.185,5.8,0),expectedTip=rest.clone().add(physics.displacementAt(rest));const error=actualTip.distanceTo(expectedTip);maxAnchorError=Math.max(maxAnchorError,error);assert(error<1e-10);
 if(timing.draw>0){const n=env.outline.geometry.instanceCount,ends=env.outline.geometry.getAttribute('instanceEnd'),height=ends.getY(n-1);maxVisibleHeightError=Math.max(maxVisibleHeightError,Math.abs(height-5.8*timing.draw));assert(Math.abs(height-5.8*timing.draw)<1e-6);}
 snapshots.set(frame,snapshot());if(ranges.some(([a,b])=>[a-1,a,a+1,b-1,b,b+1].includes(frame)))boundaries.push({frame,timeSeconds:frame/30,...timing,shownSegments:env.outline.geometry.instanceCount,visibleHeight:5.8*timing.draw});}
// A fixed scramble of the same frames proves the candidate doesn't inherit a
// previous draw count, partial endpoint, marker scale, or GPU buffer allocation.
for(const frame of ordered.slice().sort((a,b)=>Math.sin(a*37)-Math.sin(b*37))){const s=stateAt(frame,tl);physics.update(s);env.update(s);assert.equal(snapshot(),snapshots.get(frame));}
assert.equal(sha('src/EnvironmentPlayback.ts'),base);
const result={status:'passed; candidate not applied',productionSourceSHA256:base,minimumInclusiveFrameRanges:ranges,minimumRangeSeconds:ranges.map(([a,b])=>[a/30,(b+1)/30]),candidateSampleCount:ordered.length,randomAccessDeterministic:true,fixedTrueAnchors:true,bufferIdentityPreserved:true,maxAnchorError,maxVisibleHeightError,boundaries};fs.writeFileSync('research/visual-v3/reference-patch/candidate-qa.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
