import fs from 'node:fs';
import * as T from 'three';
import {stateAt,pulse,V} from '../../src/visual';
import {CameraPath} from '../../src/CameraPath';
const tl=JSON.parse(fs.readFileSync('src/timeline.json','utf8')),manifest=JSON.parse(fs.readFileSync('public/models/shanghai-tower-manifest.json','utf8'));
const camera=new T.PerspectiveCamera(34,1920/1080,.008,200),path=new CameraPath(tl);path.setAnchors(manifest.cameraAnchorsThree);
const out:any[]=[];let last=false;
for(let frame=0;frame<tl.duration;frame++){
 const s=stateAt(frame,tl),u=s.n+s.u,rw=pulse(12.8,13.1,13.75,14.1,u)+pulse(31.55,32.2,33.55,34.1,u),visible=rw>.001;
 if(visible!==last){const views=[];for(const f of [frame-1,frame,frame+1]){const q=stateAt(Math.max(0,f),tl),v=q.n+q.u,r=pulse(12.8,13.1,13.75,14.1,v)+pulse(31.55,32.2,33.55,34.1,v);path.apply(camera,q.time);camera.updateMatrixWorld();const pts=Array.from({length:101},(_,i)=>V(-.30+.115*i/100,5.80*i/100,.4).project(camera));const onscreen=pts.filter(p=>p.z>=-1&&p.z<=1&&p.x>=-1&&p.x<=1&&p.y>=-1&&p.y<=1);views.push({frame:f,timeSeconds:f/30,clip:q.clip.id,u:v,rw:r,visible:r>.001,undeformedReferenceOnscreenSampleCount:onscreen.length,screenExamples:onscreen.filter((_,i)=>i%Math.max(1,Math.floor(onscreen.length/3))===0).map(p=>[(p.x+1)*960,(1-p.y)*540]).slice(0,4)});}out.push({transition:visible?'appears':'disappears',frame,window:views});last=visible;}
}
const result={scope:'Frozen source visibility threshold + undeformed-reference projection; not encoded-motion review; camera-follow effect is omitted and noted for late wind exit',materialOpacity:.88,lineWidthsPixels:[2.8,3.7,3.2],transitions:out};fs.writeFileSync('research/visual-v3/reference-visibility-qa.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
