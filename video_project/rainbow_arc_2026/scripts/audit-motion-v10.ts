import fs from 'node:fs';
import * as T from 'three';
import {sampleFilmCamera,filmCameraKeys} from '../src/CinematicRouteV10';
import {WorldV10} from '../src/WorldV10';
import {timeline,stateAt} from '../src/Timeline';
import {labelEnvelope,labelLayoutV10,microStrengthV10} from '../src/EditorialOverlayV10';
const root=process.cwd();const output='research/qa';fs.mkdirSync(output,{recursive:true});
let dp=0,dr=0,df=0,dpf=0,drf=0,invalid=0;
let last:ReturnType<typeof sampleFilmCamera>|undefined;
for(let f=0;f<timeline.duration;f++){
 const p=sampleFilmCamera(f);
 if(![...p.position,...p.target,...p.quaternion.toArray(),p.fov].every(Number.isFinite))invalid++;
 if(last){const move=new T.Vector3(...p.position).distanceTo(new T.Vector3(...last.position));const turn=T.MathUtils.radToDeg(p.quaternion.angleTo(last.quaternion));
  if(move>dp){dp=move;dpf=f;}if(turn>dr){dr=turn;drf=f;}df=Math.max(df,Math.abs(p.fov-last.fov));}last=p;
}
const w=new WorldV10(undefined,new T.Scene()),c=new T.PerspectiveCamera(45,16/9,.03,400);
const changes:any[]=[];let previousText:string|undefined;
for(let f=0;f<timeline.duration;f+=3){
 const state=stateAt(f);w.update(state);const a=w.anchor;
 if(a?.text!==previousText){changes.push({frame:f,from:previousText,to:a?.text??null,opacity:a?labelEnvelope(state,a.text).opacity:0});previousText=a?.text;}
 if(a){const pose=sampleFilmCamera(f);c.position.set(...pose.position);c.quaternion.copy(pose.quaternion);c.fov=pose.fov;c.updateProjectionMatrix();c.updateMatrixWorld(true);
 const v=a.point.clone().project(c);const projected={text:a.text,x:(v.x*.5+.5)*1920,y:(.5-v.y*.5)*1080,color:a.color??'#203d45',visible:Math.abs(v.x)<1.15&&Math.abs(v.y)<1.15};
 const l=labelLayoutV10(state,projected);if(![l.x,l.y,l.width,l.height].every(Number.isFinite))invalid++;
 }
}
w.dispose();
const motion={version:'V10',passed:!invalid&&dp<.6&&dr<2.0&&df<.4,frames:timeline.duration,invalid,maxTranslationPerFrame:dp,translationPeakFrame:dpf,maxRotationDegreesPerFrame:dr,rotationPeakFrame:drf,maxFovDeltaPerFrame:df,keyCount:filmCameraKeys.length,captionMaxChars:Math.max(...timeline.captions.map(x=>x.text.length)),scope:'Pure frame sampling of actual V10 route; visual handoffs reviewed separately. Physical small light separation magnified by camera, not displaced rays.'};
fs.writeFileSync(output+'/motion-audit-v10.json',JSON.stringify(motion,null,2)+'\n');
fs.writeFileSync(output+'/v10-label-transition-audit.json',JSON.stringify({version:'V10',changes,scope:'Every 3 frames sampled; change frames added to final raster inspection. Smooth label envelope does not guarantee visual quality.'},null,2)+'\n');
console.log(motion);if(!motion.passed)process.exitCode=1;
