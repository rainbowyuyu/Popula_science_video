import fs from 'node:fs';
import * as T from 'three';
import {sampleFilmCamera,filmCameraKeys as cameraKeys} from '../src/CinematicRouteV06';
import {timeline,stateAt} from '../src/Timeline';
const c=new T.PerspectiveCamera(45,1920/1080,.025,180);
const samples:{frame:number;position:number[];quaternion:number[]}[]=[];
let speed=0,rotation=0,speedFrame=0,rotationFrame=0,invalid=0;
for(let frame=0;frame<timeline.duration;frame++){
 const pose=sampleFilmCamera(frame);c.position.set(...pose.position);c.quaternion.copy(pose.quaternion);c.fov=pose.fov;
 const p=c.position.toArray(),q=c.quaternion.toArray();
 if(![...p,...q,c.fov].every(Number.isFinite))invalid++;
 if(frame){const last=samples.at(-1)!;const dp=c.position.distanceTo(new T.Vector3(...last.position as [number,number,number]));const dr=T.MathUtils.radToDeg(c.quaternion.angleTo(new T.Quaternion(...last.quaternion as [number,number,number,number])));if(dp>speed){speed=dp;speedFrame=frame}if(dr>rotation){rotation=dr;rotationFrame=frame}}
 samples.push({frame,position:p,quaternion:q});
}
const empty=Array.from({length:timeline.duration},(_,f)=>stateAt(f)).filter(s=>!s.scene).length;
const report={version:'V06',frames:timeline.duration,seconds:timeline.duration/30,invalidCoordinates:invalid,unassignedSceneFrames:empty,maxTranslationPerFrame:speed,translationPeakFrame:speedFrame,maxRotationDegreesPerFrame:rotation,rotationPeakFrame:rotationFrame,keyCount:cameraKeys.length,allCameraKeysDistinct:cameraKeys.every((k,i,a)=>!i||k.frame>a[i-1].frame),captionMaxLength:Math.max(...timeline.captions.map(c=>c.text.length)),lastCaptionEnd:timeline.captions.at(-1)?.end,referenceFrames:timeline.duration-(timeline.scenes.at(-1)?.start??0),scope:'Checks the active V06 camera and frame contracts, not subjective motion quality.'};
fs.mkdirSync('research/qa',{recursive:true});fs.writeFileSync('research/qa/motion-audit.json',JSON.stringify(report,null,2));console.log(report);
if(invalid||empty||rotation>5)process.exitCode=1;
