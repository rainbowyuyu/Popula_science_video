import React,{useLayoutEffect,useRef,useState} from 'react';
import {Composition,registerRoot,delayRender,continueRender,cancelRender,staticFile} from 'remotion';
import * as T from 'three';
import {V5World} from '../../../src/V5World';
import {stateAt,Timeline} from '../../../src/visual';
import timeline from '../../../src/timeline.json';

/** A cover-only view of the same shared-metre body. No organ moves or scales. */
function CoverAnatomy(){
 const ref=useRef<HTMLCanvasElement>(null);const[handle]=useState(()=>delayRender('Cover anatomy',{timeoutInMilliseconds:180000}));
 useLayoutEffect(()=>{
  const renderer=new T.WebGLRenderer({canvas:ref.current!,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1920,1920);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.001,20),world=new V5World(scene,camera,renderer,staticFile(''),timeline as Timeline);let live=true;
  world.ready.then(()=>{
   if(!live)return;world.update(stateAt((timeline.clips.find(c=>c.id==='h003')!.start+timeline.clips.find(c=>c.id==='h003')!.duration*.75),timeline as Timeline));
   const alpha:Record<string,number>={body:.25,brain:.60,brainstem:.20,heart:1,aorta:.58,veins:.36,liver:1,stomach:.32,pancreas:1,small_intestine:.82,leftKidney:.65,rightKidney:.65,adrenals:.60,esophagus:.26,pancreatic_arteries:.42,portal_tributaries:.33};
   for(const[name,group]of Object.entries(world.organs)){
    const value=alpha[name]??0;group.visible=value>0;
    group.traverse(object=>{if(!(object instanceof T.Mesh))return;
     if(object.userData.duplicateBrainstem){object.visible=false;return;}
     for(const material of Array.isArray(object.material)?object.material:[object.material]){
      material.opacity=value;material.transparent=value<.995;material.depthWrite=value>.96;
      if(name==='body'&&material instanceof T.MeshStandardMaterial)material.color.set('#aabcb3');
      if(object.userData.skinDepth){material.opacity=1;material.colorWrite=false;material.transparent=true;material.depthWrite=true;}
     }
    });
   }
   camera.position.set(.10,1.335,1.57);camera.lookAt(0,1.285,0);camera.updateProjectionMatrix();
   renderer.render(scene,camera);continueRender(handle);
  }).catch(cancelRender);
  return()=>{live=false;world.dispose();renderer.dispose();continueRender(handle);};
 },[handle]);return <canvas ref={ref}/>;
}
registerRoot(()=> <Composition id="CoverAnatomy" component={CoverAnatomy} fps={30} width={1920} height={1920} durationInFrames={1}/>);
