// QA fixture only. Not an engineering result and never imported by the film.
import React,{useLayoutEffect,useState} from 'react';
import {Composition,registerRoot,delayRender,continueRender,AbsoluteFill} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {ComputedPressureVisualization,ComputedPressureData} from '../../src/ComputedPressureVisualization';
import {State} from '../../src/visual';

function Stage(){
 const {scene,camera,gl}=useThree();const [handle]=useState(()=>delayRender('Isolated pressure shader QA'));
 useLayoutEffect(()=>{
  const geometry=new T.CylinderGeometry(1,1,6,40,20),pos=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),index=geometry.index!;
  const data:ComputedPressureData={coordinates:'metres, Three.js XYZ, Y up',normalConvention:'body-outward',points_m:[],triangles:[],cp:[],outward_normals:[],provenance:{solver:'SYNTHETIC SHADER QA ONLY'}};
  for(let i=0;i<pos.count;i++){data.points_m.push([pos.getX(i),pos.getY(i),pos.getZ(i)]);data.outward_normals!.push([normal.getX(i),normal.getY(i),normal.getZ(i)]);data.cp.push(pos.getX(i));}
  for(let i=0;i<index.count;i+=3)data.triangles.push([index.getX(i),index.getX(i+1),index.getX(i+2)]);
  const material=new T.MeshPhysicalMaterial({color:'#9fadaf',metalness:.10,roughness:.18,clearcoat:.88}),mesh=new T.Mesh(geometry,material);scene.add(mesh);
  const fill=new T.HemisphereLight('#ffffff','#a5b5bd',2),sun=new T.DirectionalLight('#fff0dd',3);sun.position.set(3,5,8);scene.add(fill,sun);
  scene.background=new T.Color('#edf2f3');gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1;camera.position.set(0,2,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const pressure=new ComputedPressureVisualization(scene,data,{geometryUnitsPerMetre:1,cpRange:[-1,1],maxProjectionDistanceM:.001,arrowLengthMetresPerCp:.6,arrowRadiusM:.025,surfaceOffsetM:.012,arrowHeightBands:5});
  pressure.bind('ENVELOPE_QA_GLASS',geometry);const state={n:30,u:0,time:1,frame:30} as State;
  pressure.updateMaterial(geometry,material,state);pressure.update(state,camera);gl.render(scene,camera);continueRender(handle);
  return()=>{pressure.dispose();scene.remove(mesh,fill,sun);geometry.dispose();material.dispose();continueRender(handle);};
 },[scene,camera,gl,handle]);return null;
}
function Preview(){return <AbsoluteFill><ThreeCanvas width={960} height={600} dpr={1} camera={{fov:44,near:.01,far:100}}><Stage/></ThreeCanvas><div style={{position:'absolute',left:28,top:25,fontFamily:'sans-serif',color:'#243d48',fontSize:22}}>PRESSURE SHADER QA<br/><span style={{fontSize:15}}>Synthetic fixture · not CFD · not in film</span></div><div style={{position:'absolute',left:45,bottom:32,fontFamily:'sans-serif',fontSize:18,color:'#07869f'}}>Negative Cp → outward suction</div><div style={{position:'absolute',right:45,bottom:32,fontFamily:'sans-serif',fontSize:18,color:'#d7653e'}}>Positive Cp → inward pressure</div></AbsoluteFill>;}
registerRoot(()=> <Composition id="PressureShaderQA" component={Preview} fps={30} durationInFrames={60} width={960} height={600}/>);
