import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {createMarineWorld} from './MarineWorld';
import {sampleCamera} from './CameraRail';
import {chapters,durationSeconds} from './timeline';
import story from './story.json';

const FPS=30;
function Stage({frame}:{frame:number}){
 const ref=useRef<HTMLCanvasElement>(null);const display=useRef<HTMLCanvasElement>(null);const world=useRef<Awaited<ReturnType<typeof createMarineWorld>>|null>(null);
 const [handle]=useState(()=>delayRender('native WebGPU ocean initialization',{timeoutInMilliseconds:240000}));
 const [ready,setReady]=useState(false);const chain=useRef<Promise<void>>(Promise.resolve());
 const initialReleased=useRef(false);const generation=useRef(0);const scratch=useRef<HTMLCanvasElement|null>(null);
 useEffect(()=>{
  let dead=false;let owned:Awaited<ReturnType<typeof createMarineWorld>>|null=null;
  (async()=>{try{
   const w=await createMarineWorld(ref.current!);owned=w;if(dead){w.dispose();return;}
   const buffer=document.createElement('canvas');buffer.width=1920;buffer.height=1080;scratch.current=buffer;
   world.current=w;setReady(true);
  }catch(e){if(!dead)cancelRender(e);}})();
  return()=>{dead=true;generation.current++;chain.current.finally(()=>{owned?.dispose();if(world.current===owned)world.current=null;});};
 },[handle]);
 // Remotion releases its own seek barrier on the next animation frame. Register
 // our GPU barrier during React's commit, before the browser can paint/observe ready.
 useLayoutEffect(()=>{
  if(!ready||!world.current)return;
  const requestedGeneration=++generation.current;let cancelled=false;
  const gate=delayRender('WebGPU frame '+frame,{timeoutInMilliseconds:240000});
  chain.current=chain.current.then(async()=>{
   try{
    if(cancelled||requestedGeneration!==generation.current)return;
    const t=frame/FPS,c=sampleCamera(t,chapters),w=world.current!,buffer=scratch.current!;
    w.camera.position.set(...c.position);w.camera.lookAt(...c.target);w.camera.fov=c.fov;w.camera.updateProjectionMatrix();w.camera.updateMatrixWorld(true);
    await w.update(t);
    if(cancelled||requestedGeneration!==generation.current)return;
    await w.capture(buffer);
    const device=(w.renderer.backend as any).device;if(device)await device.queue.onSubmittedWorkDone();
    if(cancelled||requestedGeneration!==generation.current)return;
    const target=display.current!;const ctx=target.getContext('2d');if(!ctx)throw new Error('Display canvas 2D context unavailable.');
    // Only a completed current-generation image reaches the visible canvas.
    // This is an atomic CPU blit, so a superseded async readback cannot flash.
    ctx.drawImage(buffer,0,0);
    const native=(window as any).__marineV7?.state;
    if(native&&native.tick!==frame*2)throw new Error(`Water tick ${native.tick} does not match requested frame ${frame}.`);
    const evidence={schema:1,frame,time:t,nativeTick:native?.tick,generation:requestedGeneration,camera:{position:[...c.position],target:[...c.target],fov:c.fov}};
    (window as any).__marineFrameV8=evidence;target.dataset.presentedFrame=String(frame);
    if(!initialReleased.current){initialReleased.current=true;continueRender(handle);}
   }finally{continueRender(gate);}
  }).catch(e=>cancelRender(e));
  return()=>{cancelled=true;};
 },[frame,ready]);
 return <><canvas ref={ref} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0}}/><canvas data-marine-display="true" ref={display} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/></>;
}

function Caption({frame}:{frame:number}){
 const t=frame/FPS;const cap=(story.captions as any[]).find(c=>t>=c.start&&t<c.end);
 const tint='#f1f8f8';
 const brandStyle:React.CSSProperties={position:'absolute',left:48,top:32,color:tint,display:'flex',alignItems:'center',gap:14,filter:'drop-shadow(0 2px 3px rgba(0,18,29,.8))'};
 const mask=(file:string,w:number,h:number)=>({width:w,height:h,backgroundColor:'currentColor',WebkitMaskImage:`url("${staticFile(file)}")`,maskImage:`url("${staticFile(file)}")`,WebkitMaskSize:'contain',maskSize:'contain',WebkitMaskRepeat:'no-repeat',maskRepeat:'no-repeat',WebkitMaskPosition:'center',maskPosition:'center'} as React.CSSProperties);
 return <>
 <div style={brandStyle}>
  <span style={{...mask('brand/zju-emblem.svg',55,55),filter:'drop-shadow(0 1px 1px rgba(255,255,255,.55))'}}/>
  <span style={{fontSize:31,fontWeight:420,opacity:.78}}>×</span>
  <span style={{...mask('brand/logo.png',43,52),filter:'drop-shadow(0 1px 1px rgba(255,255,255,.55))'}}/>
  <div style={{borderLeft:'1px solid rgba(230,244,250,.6)',paddingLeft:17,marginLeft:2,textShadow:'0 1px 3px rgba(0,18,29,.65)'}}><div style={{fontSize:28,fontWeight:700,letterSpacing:1}}>浙江大学·海洋新能源</div><div style={{fontSize:20,fontWeight:600,marginTop:5,letterSpacing:2,opacity:.9}}>第一期  海洋风电总览</div></div>
 </div>
 {cap&&<div style={{position:'absolute',left:'50%',transform:'translateX(-50%)',bottom:42,width:'max-content',maxWidth:1420,padding:'12px 38px',textAlign:'center',fontSize:42,fontWeight:600,letterSpacing:1,lineHeight:1.35,color:'#fffdf7',background:'radial-gradient(ellipse at center,rgba(2,18,28,.30),rgba(2,18,28,0) 72%)',textShadow:'0 2px 5px rgba(1,14,20,.9),0 0 18px rgba(1,14,20,.70)',WebkitTextStroke:'.2px rgba(2,22,30,.4)'}}>{cap.text}</div>}
 </>;
}
export function EpisodeFilm({audio=true}:{audio?:boolean}){const frame=useCurrentFrame();return <AbsoluteFill style={{background:'#a9ccd1',fontFamily:'RainbowSans,Microsoft YaHei,sans-serif',overflow:'hidden'}}><style>{`@font-face{font-family:RainbowSans;src:url('${staticFile('fonts/unified.woff2')}') format('woff2');font-display:block;font-weight:100 900;}`}</style><Stage frame={frame}/><Caption frame={frame}/>{audio&&<Audio src={staticFile('audio/episode01-mix-v8.wav')} volume={1}/>}</AbsoluteFill>}
export {durationSeconds};

