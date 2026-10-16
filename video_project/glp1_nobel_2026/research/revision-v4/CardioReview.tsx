import React,{useLayoutEffect,useRef} from 'react';
import {Composition,registerRoot,useCurrentFrame} from 'remotion';
import * as T from 'three';
import {CardioDetail,CardioMode} from '../../src/CardioDetail';
const shots:[string,CardioMode,number,string,number][]=[['pressure','pressure',.33,'artery',.065],['resistance','resistance',.62,'arteriole',.0048],['nephron','nephron',.7,'nephron',.0053],['vldl','lipid',.12,'lipid',.64e-6],['ldl-clearance','clearance',.59,'lipid',.64e-6],['ldl-wall','lipid_wall',.67,'lipidWall',1.9e-6],['foam-cell','lipid_wall',.75,'foamCell',65e-6],['plaque','plaque',.88,'plaque',.008],['thrombus','thrombus',.77,'thrombus',.008]];
function Review(){const ref=useRef<HTMLCanvasElement>(null),f=useCurrentFrame(),shot=shots[f%shots.length];useLayoutEffect(()=>{
 const renderer=new T.WebGLRenderer({canvas:ref.current!,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,720);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.97;
 const scene=new T.Scene();scene.background=new T.Color('#f1eee7');scene.add(new T.HemisphereLight('#fff8ed','#80969b',.85));const key=new T.DirectionalLight('#fff8ee',2.0);key.position.set(-2,4,4);scene.add(key);const fill=new T.DirectionalLight('#d3efed',1.0);fill.position.set(3,2,-1);scene.add(fill);
 const model=new CardioDetail();scene.add(model.root);model.update(17.2,shot[1],shot[2]);model.setVisibility({artery:['pressure','plaque','thrombus','foam-cell'].includes(shot[0])?1:0,arteriole:shot[0]==='resistance'?1:0,nephron:shot[0]==='nephron'?1:0,lipid:['vldl','ldl-clearance'].includes(shot[0])?1:0,lipidWall:shot[0]==='ldl-wall'?1:0});
 if(shot[0]==='foam-cell')model.setArteryShellVisibility(0);else if(['plaque','thrombus'].includes(shot[0]))model.setArteryShellVisibility(.10);
 const point=(model.getAnchors() as Record<string,T.Vector3>)[shot[3]],distance=shot[4],camera=new T.PerspectiveCamera(34,1280/720,distance*.0001,distance*20);
 camera.position.copy(point).add(['plaque','thrombus'].includes(shot[0])?new T.Vector3(distance*.12,distance*.88,distance*.44):new T.Vector3(distance*.13,distance*.16,distance));camera.lookAt(point);renderer.render(scene,camera);
 return()=>{model.dispose();renderer.dispose();};
},[f]);return <><canvas ref={ref}/><div style={{position:'absolute',top:20,left:25,font:'22px sans-serif',color:'#456366'}}>{shot[0]} · {shot[4]} m camera distance</div></>;}
registerRoot(()=> <Composition id='CardioReview' component={Review} width={1280} height={720} fps={30} durationInFrames={shots.length}/>);
