import React, {useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import meshData from '../../../assets/v03/teaching-car.mesh.json';
import {layoutFor} from './stage-layout.mjs';

export const VW=1280, VH=760;
export type V3=[number,number,number];
type Arrow={origin:number[];vector:number[];color:string;label:string;side?:string;dashed?:boolean};
type Plume={origin:number[];dir:number[];length:number};
export type State={scene:string;phase:string;frame:number;local:number;u:number;c:number[];phi:number;omega:number;rollRate:number;simTime:number;mode:string;arrows:Arrow[];plumes:Plume[];trail:number[][];groundMark:number[];nozzles:{left:number[];right:number[]};thrust?:{magnitude:number|null;verticalComponent:number|null;lateralComponent:number|null}};

const Car:React.FC=()=>{
 const parts=useMemo(()=>meshData.objects.map(o=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(o.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(o.normals,3));
  const color=new THREE.Color().setRGB(o.color[0],o.color[1],o.color[2]);
  return {geometry,material:new THREE.MeshStandardMaterial({color,metalness:o.metalness,roughness:o.roughness,emissive:color,emissiveIntensity:o.emissiveStrength*.6})};
 }),[]);
 return <>{parts.map((p,i)=><mesh key={i} geometry={p.geometry} material={p.material}/>)}</>;
};
export const VehicleStage:React.FC<{state:State}>=({state:s})=>{
 const {camera,project,p,box,com,chips}=useMemo(()=>layoutFor(s),[s]);
 const trail=s.trail.map(project).map((v:number[])=>v.join(',')).join(' ');
 const ground=project(s.groundMark);
 const carPx=project([s.c[0]+1,s.c[1],s.c[2]])[0]-p[0];
 const cLabelX=com.x,cLabelY=com.y+24;
 const lines:string[]=[];
 for(let i=-7;i<=7;i++){
  const a=project([i,-7,-2.2]),b=project([i,7,-2.2]),c=project([-7,i,-2.2]),d=project([7,i,-2.2]);
  lines.push(`M${a}L${b}M${c}L${d}`);
 }
 return <div style={{width:VW,height:VH,position:'relative'}}>
  <svg width={VW} height={VH} style={{position:'absolute'}}>
   {lines.map((d,i)=><path key={i} d={d} stroke="#3d5468" strokeWidth={1} opacity={.2}/>)}
  </svg>
  <ThreeCanvas width={VW} height={VH} camera={camera} gl={{alpha:true,antialias:true}}>
   <ambientLight intensity={1.05}/><directionalLight position={[2,-4,8]} intensity={3.6}/><directionalLight position={[-4,6,3]} intensity={2.4} color="#72d8ff"/>
   <group position={s.c as V3} rotation={[s.phi,0,0]}><Car/></group>
  </ThreeCanvas>
  <svg width={VW} height={VH} style={{position:'absolute',inset:0,overflow:'visible'}}>
   <defs>{['#4cf2d0','#ffbd69','#8ca5ff'].map((color,i)=><marker key={color} id={`head${i}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="4.6" markerHeight="4.6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={color}/></marker>)}</defs>
   {/* Contact shadow stays on the world ground plane and scales with the camera, so rotating in place never implies lift. */}
   <ellipse cx={ground[0]} cy={ground[1]} rx={Math.abs(carPx)*.5} ry={Math.abs(carPx)*.5*.11} fill="#000" opacity={s.c[2]>-.6?.26:.14}/>
   {trail&&<><polyline points={trail} fill="none" stroke="#ffcf83" strokeWidth={3.4} strokeDasharray="8 9" opacity={.9}/><text x={92} y={118} fill="#ffcf83" fontSize={25}>质心轨迹 · 忽略空气作用</text></>}
   {/* Exhaust plumes point opposite the thrust applied to the body; cold-gas style, not combustion flame. */}
   {s.plumes.map((pl,i)=>{
    const a=project(pl.origin),b=project(pl.origin.map((v,j)=>v+pl.dir[j]*pl.length));
    const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.max(1,Math.hypot(dx,dy));
    return <g key={i} opacity={.5}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#bfe9ff" strokeWidth={9} strokeLinecap="round" opacity={.28}/><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#e8f7ff" strokeWidth={3} strokeLinecap="round" opacity={.6} strokeDasharray={len>26?'3 7':undefined}/></g>;
   })}
   {chips.map(({a,start,end,pos,width,height}:{a:Arrow;start:number[];end:number[];pos:number[];width:number;height:number},i:number)=>(
    <g key={i}>
     <line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} stroke="#041016" strokeWidth={9} strokeLinecap="round"/>
     <line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} stroke={a.color} strokeWidth={a.dashed?3:4.6} strokeLinecap="round" strokeDasharray={a.dashed?'7 6':undefined} markerEnd={`url(#head${['#4cf2d0','#ffbd69','#8ca5ff'].indexOf(a.color)})`}/>
     <circle cx={start[0]} cy={start[1]} r={4.2} fill="#041016" stroke={a.color} strokeWidth={2.2}/>
     <line x1={start[0]} y1={start[1]} x2={pos[0]+width/2} y2={pos[1]+height/2} stroke={a.color} strokeWidth={1} opacity={.4} strokeDasharray="3 4"/>
     <rect x={pos[0]} y={pos[1]} width={width} height={height} rx={7} fill="#04121e" opacity={.88} stroke={a.color} strokeWidth={1.4}/>
     <text x={pos[0]+width/2} y={pos[1]+height/2+8.5} textAnchor="middle" fill={a.color} fontSize={25} fontWeight={650}>{a.label}</text>
    </g>
   ))}
   <circle cx={p[0]} cy={p[1]} r={7} fill="#fff" stroke="#081725" strokeWidth={3}/>
   <line x1={p[0]} y1={p[1]} x2={cLabelX} y2={cLabelY} stroke="#dcebf7" strokeWidth={1.3} opacity={.75}/>
   <text x={cLabelX} y={cLabelY-5} textAnchor="start" fill="#dcebf7" fontSize={23} opacity={.95}>质心</text>
  </svg>
 </div>;
};
