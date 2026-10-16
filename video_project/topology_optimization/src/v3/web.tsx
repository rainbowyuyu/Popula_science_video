import React,{useRef,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {World} from './World';
import {LabPanel} from './LabPanel';
import {BrandLockup} from './Brand';
function App(){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<World|null>(null);const [idx,setIdx]=useState(50),[playing,setPlaying]=useState(false);
 useEffect(()=>{world.current=new World(canvas.current!);return()=>world.current?.dispose()},[]);
 useEffect(()=>{world.current?.render({scene:'lab',progress:idx/50,line:0,lineProgress:0,time:idx,iteration:idx})},[idx]);
 useEffect(()=>{if(!playing)return;const id=setInterval(()=>setIdx(i=>{if(i>=50){setPlaying(false);return 50}return i+1}),180);return()=>clearInterval(id)},[playing]);
 return <main><canvas ref={canvas}/><header><BrandLockup src="logo.png" scale={.84}/><h1>材料怎样找到位置</h1></header><aside><LabPanel index={idx} onChange={i=>{setPlaying(false);setIdx(i)}} onPlay={()=>{if(idx>=50)setIdx(0);setPlaying(!playing)}} playing={playing}/></aside><footer><strong>拖动查看 · 100轮计算回放</strong><details><summary>实验条件与数据</summary><p>左边固定，右上角受力100 N。铝板400×200×8 mm，材料预算35%，80×40个单元。本页回放预先保存的有限元与SIMP/OC结果，不是在线重新求解。</p><p>曲线采用线性坐标，表示柔度N·mm；数值越小，给定载荷下整体越不容易变形。形状重建不等于强度认证。</p><a href="simulation.json">下载计算数据</a></details></footer></main>
}
createRoot(document.getElementById('root')!).render(<App/>);
