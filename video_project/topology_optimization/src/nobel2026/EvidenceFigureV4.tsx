import React from 'react';
import {Img,staticFile} from 'remotion';
import type {NobelState} from './WorldV2';

/** Camera moves across the original Nobel popular-information diagrams.
 * Figure coordinates were checked against the four 2500px source images. The
 * figures are editorial explanations, not microscope or electrode footage. */
type Crop={x:number;y:number;w:number;h:number};
type Shot={crop:Crop;label:string};
type Figure={file:string;width:number;height:number;shots:Shot[];exitLine:number};
const crop=(x:number,y:number,w:number,h:number):Crop=>({x,y,w,h});
const figures:Record<string,Figure>={
 algae:{file:'nobel2026/POP_Fig_2.jpg',width:2500,height:964,exitLine:2,shots:[
  {crop:crop(0,0,2500,964),label:'衣藻与感光点'},
  {crop:crop(0,55,1140,800),label:'眼点接住光'},
  {crop:crop(750,70,1250,780),label:'向光的一侧游去'},
  {crop:crop(1460,70,1040,780),label:'光从一侧照来'},
 ]},
 channel:{file:'nobel2026/POP_Fig_3_ENG_01.jpg',width:2500,height:1100,exitLine:2,shots:[
  {crop:crop(0,0,2500,1100),label:'从藻类找到基因'},
  {crop:crop(0,90,1180,850),label:'基因进入蛙卵'},
  {crop:crop(600,150,1040,760),label:'通道原本闭合'},
  {crop:crop(1300,120,1200,850),label:'蓝光打开通道'},
 ]},
 neuron:{file:'nobel2026/POP_Fig_4_ENG_01.jpg',width:2500,height:996,exitLine:2,shots:[
  {crop:crop(0,0,2500,996),label:'把通道带进神经元'},
  {crop:crop(0,70,1460,850),label:'培养神经元'},
  {crop:crop(1160,80,1340,850),label:'光脉冲与电信号'},
  {crop:crop(1370,180,1130,730),label:'记录动作电位'},
 ]},
 brain:{file:'nobel2026/POP_Fig_5_ENG_01.jpg',width:2500,height:1027,exitLine:1,shots:[
  {crop:crop(0,0,2500,1027),label:'进入活体小鼠'},
  {crop:crop(0,140,1550,800),label:'给特定细胞装开关'},
  // The actual fiber tip is in the RIGHT half of Fig. 5. An earlier draft
  // incorrectly focused near x=980; this crop was corrected by image review.
  {crop:crop(1050,0,1450,810),label:'光纤到达皮层'},
  {crop:crop(1430,60,1070,780),label:'刺激与神经信号'},
 ]},
};
const W=830,H=468;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const t=clamp(v);return t*t*(3-2*t)};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const interpolate=(a:Crop,b:Crop,t:number):Crop=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),w:mix(a.w,b.w,t),h:mix(a.h,b.h,t)});

export function EvidenceFigureV4({state}:{state:NobelState}){
 const def=figures[state.scene];if(!def)return null;
 const line=Math.max(0,state.line),p=clamp(state.lineProgress);
 const enter=ease((state.elapsed??0)/.75);
 // Hold full source first, then follow at most two locations per narration
 // beat. The scene's 3D mechanism takes over before the next scene begins.
 const global=clamp((line+p)/Math.max(1,def.shots.length-1));
 const v=global*(def.shots.length-1),idx=Math.min(def.shots.length-2,Math.floor(v));
 const phase=ease(v-idx),a=def.shots[idx],b=def.shots[idx+1];
 const rect=interpolate(a.crop,b.crop,phase);
 const scale=Math.min(W/rect.w,H/rect.h);
 const imageW=def.width*scale,imageH=def.height*scale;
 const left=(W-rect.w*scale)/2-rect.x*scale;
 const top=(H-rect.h*scale)/2-rect.y*scale;
 const exit=state.line>def.exitLine?1:state.line===def.exitLine?ease((p-.56)/.38):0;
 const opacity=enter*(1-exit);
 if(opacity<=.001)return null;
 const label=phase<.52?a.label:b.label;
 return <div style={{position:'absolute',left:970,top:322,width:W+28,height:H+70,zIndex:6,
   opacity,transform:`translate3d(${74*(1-enter)-48*exit}px,${12*(1-enter)}px,0) scale(${1+.03*exit})`,
   transformOrigin:'center center',pointerEvents:'none'}}>
   <div style={{height:48,display:'flex',alignItems:'center',justifyContent:'space-between',
     padding:'0 8px',fontFamily:'"Microsoft YaHei",sans-serif',fontSize:26,color:'#28536a',fontWeight:700}}>
    <span>{label}</span><span style={{fontSize:23,fontWeight:500,color:'#6d8290'}}>NobelPrize.org</span>
   </div>
   <div style={{position:'relative',width:W,height:H,overflow:'hidden',borderRadius:12,
      background:'#6b98d2',border:'8px solid rgba(255,253,248,.96)',
      boxShadow:'0 22px 54px rgba(22,57,78,.22)'}}>
    <Img src={staticFile(def.file)} style={{position:'absolute',left,top,width:imageW,height:imageH,
       maxWidth:'none',display:'block',transform:'translateZ(0)'}}/>
    <div style={{position:'absolute',inset:0,border:'1px solid rgba(255,255,255,.55)',
       borderRadius:4,boxShadow:'inset 0 0 55px rgba(31,61,100,.07)'}}/>
   </div>
 </div>;
}

export const EVIDENCE_FIGURE_V4_CROPS=figures;
