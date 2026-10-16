/** Isolated actual native wave sampler. Build only after narration/camera freeze.
 * It shares the production NativeWater implementation/quality/seed; geometry is
 * intentionally omitted because no authored objects displace the FFT wave field.
 */
import * as T from 'three/webgpu';
import {createNativeWaterV7} from '../src/NativeWaterV7';
import {sampleCamera} from '../src/CameraRail';
import story from '../src/story.json';

const w=window as any;w.waterlineQA={status:'starting'};
try{
 const renderer=new T.WebGPURenderer({antialias:false,powerPreference:'high-performance'});renderer.setSize(96,54);renderer.setPixelRatio(1);await renderer.init();document.body.appendChild(renderer.domElement);
 w.waterlineQA.renderer={webgpu:(renderer.backend as any).isWebGPUBackend,webgl:(renderer.backend as any).isWebGLBackend,hasDevice:!!(renderer.backend as any).device,hasAPI:!!navigator.gpu};
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,16/9,.45,15000);
 const water=await createNativeWaterV7({renderer,scene,camera,quality:'high',ownOceanFloor:false,requireWebGPU:true});
 const scenes=story.scenes.map(s=>({id:s.chapter,start:s.start,end:s.end}));
 const fps=60,frameCount=Math.ceil(Math.max(...scenes.map(s=>s.end))*30)*2,gpuFrames=new Set<number>();
 for(let f=0;f<=frameCount;f++)if(Math.abs(sampleCamera(f/fps,scenes).position[1])<8)for(let d=-120;d<=120;d++)if(f+d>=0&&f+d<=frameCount)gpuFrames.add(f+d);
 const samples:any[]=[];let gpuCount=0,nextFrame=0;
 const evaluate=async(frame:number)=>{
  const t=frame/fps,c=sampleCamera(t,scenes);camera.position.fromArray(c.position);camera.lookAt(new T.Vector3(...c.target));camera.fov=c.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const state=await water.update(t);if(state.tick!==frame)throw Error(`Native tick mismatch ${state.tick} versus ${frame}`);
  if(Math.abs(state.cameraWaterHeight)>6)throw Error('Wave exceeds near-surface sampling margin; expand interval before exporting.');
  return {t,frame,position:c.position,surfaceY:state.cameraWaterHeight,signedDistance:c.position[1]-state.cameraWaterHeight,immersion:state.submersion,sampling:'native-webgpu-fft-readback',nativeTick:state.tick};
 };
 const first=[...gpuFrames][0];if(first!==undefined){const a=await evaluate(first);await evaluate(Math.min(frameCount,first+137));const b=await evaluate(first);if(Math.abs(a.surfaceY-b.surfaceY)>1e-6)throw Error('Water height differs after repeated absolute seek.');}
 w.waterlineQA={status:'ready',fps,frameCount,gpuPlanned:gpuFrames.size,backend:water.backend,three:T.REVISION,repeatSeekPassed:true};
 w.sampleWaterlineBatch=async(count=120)=>{
  const end=Math.min(frameCount+1,nextFrame+count);
  for(;nextFrame<end;nextFrame++){
   if(gpuFrames.has(nextFrame)){samples.push(await evaluate(nextFrame));gpuCount++;}
   else{const t=nextFrame/fps,{position}=sampleCamera(t,scenes);samples.push({t,frame:nextFrame,position,surfaceY:null,signedDistance:position[1],immersion:position[1]<0?1:0,sampling:'far-from-surface-clamped',nativeTick:null});}
  }
  return {frame:nextFrame,frameCount,gpuCount,complete:nextFrame>frameCount};
 };
 w.finishWaterline=()=>{
  if(nextFrame<=frameCount)throw Error('Sampling incomplete');const crossings:any[]=[];
  for(let i=1;i<samples.length;i++){const a=samples[i-1],b=samples[i];if(a.signedDistance*b.signedDistance>=0)continue;
   if(a.surfaceY===null||b.surfaceY===null)throw Error('Crossing lacks real GPU samples');
   const k=a.signedDistance/(a.signedDistance-b.signedDistance),time=a.t+(b.t-a.t)*k;
   crossings.push({time,frame:Math.round(time*fps),kind:a.signedDistance>0?'enter':'exit',position:a.position.map((v:number,j:number)=>v+(b.position[j]-v)*k),surfaceY:a.surfaceY+(b.surfaceY-a.surfaceY)*k,residualMetres:null,precisionSeconds:1/fps,bracket:[{time:a.t,distance:a.signedDistance},{time:b.t,distance:b.signedDistance}]});
  }
  const intervals:any[]=[];let start=samples[0].signedDistance<0?0:null;for(const e of crossings){if(e.kind==='enter')start=e.time;else if(start!==null){intervals.push({start,end:e.time});start=null;}}if(start!==null)intervals.push({start,end:frameCount/fps});
  return {schema:'marine-immersion-native-webgpu-v8',fps,frameCount,duration:frameCount/fps,backend:water.backend,level:0,seed:7,stepSize:1/60,quality:'high',gpuSampleCount:gpuCount,farClampingMetres:8,crossings,rawCrossingCount:crossings.length,mergedGroups:[],underwaterIntervals:intervals,samples,notes:['Exact production NativeWater implementation evaluated at each near-surface absolute 60 Hz tick.','Objects omitted from sampler because the production FFT field has no rigid-body fluid feedback.','Far-field surfaceY is null; immersion is explicitly clamped, not measured.','Crossings linearly interpolate real GPU brackets; null residual is not a claimed solved root.']};
 };
 w.disposeWaterline=()=>{water.dispose();renderer.dispose();};
}catch(e){w.waterlineQA={...w.waterlineQA,status:'failed',error:String((e as Error).stack||e)};}
