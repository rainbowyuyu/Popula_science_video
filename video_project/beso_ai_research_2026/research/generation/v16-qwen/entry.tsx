import React,{useLayoutEffect,useRef,useState} from 'react';
import {Composition,registerRoot,useCurrentFrame,staticFile,delayRender,continueRender,cancelRender} from 'remotion';
import {LaunchWorldV16} from '../../../src/beso/LaunchWorldV16';
const Anchor=({blueprint=false}:{blueprint?:boolean})=>{
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<LaunchWorldV16|null>(null),ready=useRef(false);
 const frame=useCurrentFrame(),latest=useRef(frame);latest.current=frame;
 const [handle]=useState(()=>delayRender('Load native v16 anchor'));
 useLayoutEffect(()=>{const w=new LaunchWorldV16(canvas.current!,staticFile(''));world.current=w;w.ready.then(async()=>{await w.render(latest.current/60,blueprint);ready.current=true;continueRender(handle)}).catch(cancelRender);return()=>{ready.current=false;w.dispose()}},[]);
 useLayoutEffect(()=>{if(ready.current){const h=delayRender('Await WebGPU anchor frame');world.current!.render(frame/60,blueprint).then(()=>continueRender(h)).catch(cancelRender)}},[frame,blueprint]);
 return <canvas ref={canvas} width={1920} height={1080}/>;
};
registerRoot(()=> <Composition id="NativeV16Anchor" component={Anchor} durationInFrames={6300} fps={60} width={1920} height={1080} defaultProps={{blueprint:false}}/>);
