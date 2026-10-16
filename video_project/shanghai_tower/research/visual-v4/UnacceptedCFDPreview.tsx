// Research-only preview of the saved, non-converged SU2 snapshot.
// This entrypoint is never imported by src/index.tsx and must never be copied
// into public/physics or promoted to the film without the acceptance gate.
import React,{useLayoutEffect,useState} from 'react';
import {AbsoluteFill,Composition,delayRender,continueRender,useCurrentFrame,registerRoot} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import surface from './flow-physics/fullscale/tower-crown-resolved/surface-loads.json';
import paths from './flow-physics/fullscale/tower-crown-resolved/computed-wind-paths.json';
import {ComputedPressureData,ComputedPressureVisualization} from '../../src/ComputedPressureVisualization';
import {State} from '../../src/visual';

const SCALE=.01;
const toThree=(v:number[])=>[v[0],v[2],-v[1]] as [number,number,number];
function pressureData():ComputedPressureData{
 const g=(surface as any).surfaceGeometry, sourcePoints=g.points_m as number[][], sourceTriangles=g.triangles as number[][], sourceNormals=g.outward_normals as number[][],sourceCp=g.cp as number[];
 const keep=sourceTriangles.map((t,i)=>({t,i})).filter(({t})=>t.reduce((a,k)=>a+sourcePoints[k][2],0)/3>.05);
 const used=[...new Set(keep.flatMap(x=>x.t))],map=new Map(used.map((v,i)=>[v,i]));
 const points_m=used.map(i=>toThree(sourcePoints[i])),triangles=keep.map(x=>x.t.map(i=>map.get(i)!));
 const sums=points_m.map(()=>[0,0,0]);
 keep.forEach(({t,i})=>{const n=toThree(sourceNormals[i]);for(const node of t)for(let q=0;q<3;q++)sums[map.get(node)!][q]+=n[q];});
 const outward_normals=sums.map(n=>{const l=Math.hypot(...n);return n.map(v=>v/Math.max(l,1e-12));});
 return {coordinates:'metres, Three.js XYZ, Y up',normalConvention:'body-outward',points_m,triangles,cp:used.map(i=>sourceCp[i]),outward_normals,provenance:{solver:'SU2 8.5.0',case:'tower-crown-resolved',source:'research/visual-v4/flow-physics/fullscale/tower-crown-resolved/surface-loads.json',quality:'provisional-not-converged; research preview only'}};
}
const CFD=pressureData();
function Scene({frame}:{frame:number}){
 const {scene,camera,gl}=useThree();const [h]=useState(()=>delayRender('unaccepted CFD research preview'));
 useLayoutEffect(()=>{
  const geometry=new T.BufferGeometry(),positions=CFD.points_m.flatMap(p=>p.map(v=>v*SCALE));geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(CFD.triangles.flat());geometry.computeVertexNormals();
  const material=new T.MeshPhysicalMaterial({color:'#9fadaf',roughness:.22,metalness:.08,clearcoat:.62,transparent:true,opacity:.94,side:T.DoubleSide});const mesh=new T.Mesh(geometry,material);scene.add(mesh);
  const pressure=new ComputedPressureVisualization(scene,CFD,{geometryUnitsPerMetre:SCALE,maxProjectionDistanceM:5,arrowLengthMetresPerCp:28,arrowRadiusM:.62,surfaceOffsetM:.28,cpRange:[-2.9,1.6],arrowHeightBands:8,arrowAngularSlices:10});pressure.bind('ENVELOPE_RESEARCH_GLASS',geometry);
  const pathGroup=new T.Group();pathGroup.name='unaccepted-rans-paths';scene.add(pathGroup);
  const heads:T.Mesh[]=[];for(const [i,path] of (paths as any).streamlines.entries()){
   const points=(path.points_m as number[][]).map(p=>new T.Vector3(...p).multiplyScalar(SCALE));const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:i%9===4?'#c18337':'#08728c',transparent:true,opacity:.34,depthWrite:false}));pathGroup.add(line);
   const head=new T.Mesh(new T.SphereGeometry(.045,10,8),new T.MeshBasicMaterial({color:i%9===4?'#c18337':'#08728c',transparent:true,opacity:.95}));heads.push(head);pathGroup.add(head);
  }
  const hemi=new T.HemisphereLight('#effaff','#71838b',1.7),sun=new T.DirectionalLight('#fff0db',3.2);sun.position.set(-4,7,5);scene.add(hemi,sun);scene.background=new T.Color('#edf3f4');gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1.05;
  camera.position.set(-8.7,4.2,8.8);camera.lookAt(new T.Vector3(.15,3.05,0));camera.updateMatrixWorld();
  const state={frame,time:frame/30,section:'research',p:0,clip:{id:'research',section:'research',text:'',caption:'',start:0,end:120,duration:120},n:0,u:30} as State;
  pressure.updateMaterial(geometry,material,state);pressure.update(state,camera);pressure.root.traverse(o=>{if(o instanceof T.Mesh){const m=o.material as T.Material;m.depthTest=false;m.depthWrite=false;o.renderOrder=20;}});
  const local=Math.min(1,Math.max(0,(frame/30-1)/39));for(let i=0;i<heads.length;i++){const path=(paths as any).streamlines[i];const points=path.points_m.map((p:number[])=>new T.Vector3(...p).multiplyScalar(SCALE));const k=Math.min(points.length-1,Math.floor(local*(points.length-1)));heads[i].position.copy(points[k]);}
  gl.render(scene,camera);continueRender(h);return()=>{pressure.dispose();scene.remove(mesh,pathGroup,hemi,sun);geometry.dispose();material.dispose();};
 },[camera,frame,gl,h,scene]);return null;
}
function Preview(){const frame=useCurrentFrame();return <AbsoluteFill style={{background:'#edf3f4'}}><ThreeCanvas width={1440} height={900} dpr={1} gl={{antialias:true,alpha:false}} camera={{fov:38,near:.01,far:200}}><Scene frame={frame}/></ThreeCanvas><div style={{position:'absolute',left:32,top:26,color:'#9b2e29',fontFamily:'Arial,sans-serif',fontSize:25,fontWeight:700,letterSpacing:1}}>RESEARCH PREVIEW · UNACCEPTED RANS SNAPSHOT</div><div style={{position:'absolute',left:35,top:65,color:'#53656d',fontFamily:'Arial,sans-serif',fontSize:17}}>SU2 8.5.0 · final saved surface snapshot · residual / force / y+ gates not passed · not film / not design load</div><div style={{position:'absolute',left:34,bottom:30,color:'#08728c',fontFamily:'Arial,sans-serif',fontSize:18}}>青：负 Cp 吸力（向外）</div><div style={{position:'absolute',right:34,bottom:30,color:'#c18337',fontFamily:'Arial,sans-serif',fontSize:18}}>橙：正 Cp 压力（向内）</div></AbsoluteFill>}
registerRoot(()=> <Composition id="UnacceptedCFDResearchPreview" component={Preview} fps={30} width={1440} height={900} durationInFrames={120}/>);
