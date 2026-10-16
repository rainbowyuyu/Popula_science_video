import timeline from './timeline-v11.json';
import {drawDetectorSceneV11} from './DetectorRedrawV11';
import {drawResearchSceneV11} from './ResearchRedrawV11';
import {drawCosmicV11} from './CosmicOpusV11';
import {withTextOpacityV11} from './TextOpacityV11';

export type State={frame:number;time:number;clipId:string;scene:string;elapsed:number;progress:number};
const W=1920,H=1080;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
// Zero slope and curvature at opacity endpoints; spatial camera motion is
// handled inside each scene so screen-space teaching labels stay anchored.
const smooth=(v:number)=>{v=clamp(v);return v*v*v*(v*(v*6-15)+10);};
const rnd=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};

/** Opaque atmosphere is a SEPARATE layer beneath the existing muted Qwen
 * bridge plates. The teaching canvas is transparent, so environmental video
 * is not silently hidden by a second opaque canvas. */
function background(c:CanvasRenderingContext2D,s:State){
 const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#061521');g.addColorStop(.55,'#102c3e');g.addColorStop(1,'#071723');c.fillStyle=g;c.fillRect(0,0,W,H);
 for(const p of [{x:560,y:650,r:670,col:'rgba(24,128,165,.065)'},{x:1400,y:510,r:730,col:'rgba(38,91,164,.035)'}]){
  const x=p.x+25*Math.sin(s.time*.022),y=p.y+12*Math.cos(s.time*.031);
  const light=c.createRadialGradient(x,y,0,x,y,p.r);light.addColorStop(0,p.col);light.addColorStop(1,'transparent');c.fillStyle=light;c.fillRect(0,0,W,H);
 }
 // Faint camera depth, deliberately below text and precise scientific objects.
 for(let i=0;i<70;i++){
  const x=100+rnd(i+3)*1720+4*Math.sin(s.time*.017+i),y=320+rnd(i+157)*560;
  c.save();c.globalAlpha=.035+.055*rnd(i+253);c.fillStyle='#d1e8ec';c.beginPath();c.arc(x,y,.5+.7*rnd(i+615),0,Math.PI*2);c.fill();c.restore();
 }
 const vignette=c.createRadialGradient(960,540,430,960,540,1100);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'rgba(0,5,12,.55)');c.fillStyle=vignette;c.fillRect(0,0,W,H);
}

/** The three independently reviewed drawing modules cover all 17 narration
 * clips. They own the same film coordinates, retain fixed hardware positions,
 * and honor the inherited alpha; old unrelated illustrations are not routed. */
function drawScene(c:CanvasRenderingContext2D,s:State,opacity:number,textOpacity=1){
 c.save();c.globalAlpha*=opacity;
 let handled=false;
 withTextOpacityV11(c,textOpacity,()=>{
  handled=drawDetectorSceneV11(c,s.clipId,s.elapsed,s.time)
   ||drawResearchSceneV11(c,s.clipId,s.elapsed,s.time)
   ||drawCosmicV11(c,s.clipId,s.elapsed,s.time);
 });
 c.restore();
 if(!handled)throw new Error(`Missing visual for narration clip ${s.clipId}`);
}
function world(c:CanvasRenderingContext2D,s:State){
 c.clearRect(0,0,W,H);
 const clips=timeline.clips;
 const idx=clips.findIndex(clip=>clip.id===s.clipId);
 const duration=.72,blend=idx>0?smooth(s.elapsed/duration):1;
 if(idx>0&&s.elapsed<duration){
  const prev=clips[idx-1];
  // Continue the previous scene's final camera/particle motion during the
  // seam, with the same absolute clock as the incoming scene.
  const previous:State={...s,clipId:prev.id,scene:prev.scene,elapsed:(prev.end-prev.start)/30+s.elapsed*.18,progress:1};
  drawScene(c,previous,1-blend,0);
 }
 const next=clips[idx+1];
 const labelsIn=idx>0?smooth((s.elapsed-.24)/.4):1;
 const labelsOut=next?smooth((next.start-s.frame)/9):1;
 drawScene(c,s,blend,labelsIn*labelsOut);
}
export class PhysicsWorldV11{
 canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;
 constructor(canvas:HTMLCanvasElement){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:true})!;}
 render(s:State){world(this.ctx,s);}
 renderBackground(s:State){background(this.ctx,s);}
}
export function stateAt(frame:number):State{
 const n=Math.max(0,Math.min(timeline.duration-1,frame));
 let clip=timeline.clips[0];
 for(const candidate of timeline.clips){if(candidate.start<=n)clip=candidate;else break;}
 const elapsedFrames=Math.max(0,n-clip.start),length=Math.max(1,clip.end-clip.start);
 // Inter-clip pauses retain their preceding narration scene, never the coda.
 return{frame:n,time:n/30,clipId:clip.id,scene:clip.scene,elapsed:elapsedFrames/30,progress:Math.min(1,elapsedFrames/length)};
}
