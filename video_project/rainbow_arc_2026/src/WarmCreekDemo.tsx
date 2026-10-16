import React,{useLayoutEffect,useRef} from 'react';
import {AbsoluteFill,useCurrentFrame,useVideoConfig} from 'remotion';
import {WarmCreekScene} from './WarmCreekScene';

export const WarmCreekDemo:React.FC=()=>{
  const frame=useCurrentFrame();
  const {fps,width,height}=useVideoConfig();
  const canvas=useRef<HTMLCanvasElement>(null);
  const scene=useRef<WarmCreekScene|null>(null);
  useLayoutEffect(()=>{
    const current=new WarmCreekScene(canvas.current!,width,height);scene.current=current;
    return()=>{current.dispose();scene.current=null;};
  },[width,height]);
  useLayoutEffect(()=>{scene.current?.update(frame/fps);},[frame,fps]);
  return <AbsoluteFill style={{background:'#92b9bd',overflow:'hidden'}}><canvas ref={canvas} width={width} height={height} style={{width:'100%',height:'100%'}}/></AbsoluteFill>;
};
