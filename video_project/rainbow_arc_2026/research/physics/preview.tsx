import React,{useLayoutEffect,useRef} from 'react';
import {Composition,registerRoot,useCurrentFrame} from 'remotion';
import * as T from 'three';
import {OpticsWorld} from '../../src/OpticsWorld';
import {CinematicEnvironment} from '../../src/CinematicEnvironment';
const cases=[
 {scene:'drop',camera:[19,4.3,10.5],target:[17.3,2.5,0],fov:40},
 {scene:'dispersion',camera:[18.2,3.7,8],target:[17.6,2.5,0],fov:43},
 {scene:'secondary',camera:[18.3,4.0,9.5],target:[17.8,2.6,0],fov:42},
 {scene:'angle',camera:[10,7.6,22],target:[0,2.8,1],fov:43},
 {scene:'cone',camera:[9.6,8.4,21],target:[0,2.2,0],fov:44},
 {scene:'secondary',camera:[1.7,3.6,17],target:[0,3.1,-5],fov:65},
];
function Preview(){const ref=useRef<HTMLCanvasElement>(null),f=useCurrentFrame();useLayoutEffect(()=>{const c=cases[Math.min(cases.length-1,f)];const renderer=new T.WebGLRenderer({canvas:ref.current!,antialias:true});renderer.setSize(1920,1080,false);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;const scene=new T.Scene();const env=new CinematicEnvironment(renderer,scene);const world=new OpticsWorld();scene.add(world.group);const camera=new T.PerspectiveCamera(c.fov,16/9,.02,200);camera.position.fromArray(c.camera);camera.lookAt(new T.Vector3().fromArray(c.target));world.update({scene:c.scene,progress:.6,time:36,line:1,lineProgress:.6,frame:1000,sceneStart:0,sceneEnd:2000});renderer.render(scene,camera);return()=>{world.dispose();env.dispose();renderer.dispose();};},[f]);return <canvas ref={ref} width={1920} height={1080}/>;}
registerRoot(()=> <Composition id="OpticsPreview" component={Preview} width={1920} height={1080} fps={30} durationInFrames={cases.length}/>);
