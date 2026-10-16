import React from 'react';
import {Img,staticFile} from 'remotion';
import {FrameState,ease,clamp} from './Timeline';

const INK='#193b43';

/** The question occupies the sky briefly, then leaves with the opening
 * camera. A typographic reveal is not a second screen pasted on the shot. */
export function IntroV13({state}:{state:FrameState}){
  if(state.frame>222)return null;
  const f=state.frame,entry=ease((f-8)/32),exit=ease((f-120)/78);
  const travel=exit*1320;
  return <div style={{position:'absolute',left:456+travel,top:272-exit*62,width:1008,
    zIndex:15,pointerEvents:'none',fontFamily:'RainbowSans,sans-serif',
    transform:`translateY(${(1-entry)*14}px)`,clipPath:`inset(0 ${(1-entry)*100}% 0 0)`}}>
    <div style={{fontSize:94,fontWeight:660,lineHeight:1.18,letterSpacing:-2,textAlign:'center',
      color:'#fffdf4',textShadow:'0 2px 6px rgba(12,37,38,.62),0 8px 38px rgba(12,37,38,.28)'}}>
      彩虹为什么是弧形？
    </div>
  </div>;
}

/** Pure-frame choreography for the paper-plane camera; shared by audit. */
export function codaPoseV13(state:FrameState){
  const local=state.frame-state.sceneStart;
  const surface=ease(local/24),settle=ease((local-9)/30),back=ease((local-15)/27);
  const p=clamp(local/(state.sceneEnd-state.sceneStart-1));
  return {local,surface,settle,back,p,
    wipeX:2300*(1-surface)-220,
    dollyX:-16*p,dollyY:8*p,
    bank:-.55*p,scale:1.012-.012*p};
}

/** A softly lit paper surface grows out of the outgoing mist. The camera
 * glides above two actual paper pages; no giant sliding rectangular card. */
export function CodaV13({state}:{state:FrameState}){
  if(state.scene!=='references')return null;
  const m=codaPoseV13(state);
  const mask=`linear-gradient(102deg,transparent ${m.wipeX}px,#000 ${m.wipeX+135}px)`;
  return <div style={{position:'absolute',inset:0,zIndex:30,pointerEvents:'none',
    fontFamily:'RainbowSans,sans-serif',WebkitMaskImage:mask,maskImage:mask,overflow:'hidden'}}>
    <div style={{position:'absolute',inset:-80,
      background:'radial-gradient(ellipse at 48% 16%,#fffef4 0%,#eff5ed 47%,#d6e6df 100%)'}}/>
    <div style={{position:'absolute',left:835,top:-330,width:165,height:1730,
      background:'linear-gradient(90deg,transparent,rgba(221,131,91,.10),rgba(244,214,139,.16),rgba(151,207,186,.17),rgba(121,176,206,.12),transparent)',
      filter:'blur(24px)',transform:`rotate(-24deg) translateX(${m.p*40}px)`}}/>
    <div style={{position:'absolute',inset:0,transformOrigin:'54% 48%',
      transform:`translate(${m.dollyX}px,${m.dollyY}px) rotate(${m.bank}deg) scale(${m.scale})`}}>
      <div style={{position:'absolute',left:326,top:198,color:INK,fontSize:68,fontWeight:650,
        letterSpacing:-1.5,clipPath:`inset(0 ${(1-m.settle)*100}% 0 0)`}}>一滴雨里的光学</div>
      <div style={{position:'absolute',left:328,top:352,width:640,
        transform:`translateY(${(1-m.settle)*38}px)`,opacity:m.settle}}>
        <div style={{fontSize:38,fontWeight:550,color:'#337d83',marginBottom:12}}>折射定律</div>
        <Img src={staticFile('sources/formula-snell.svg')} style={{width:640,height:104,objectFit:'contain',objectPosition:'left center'}}/>
        <div style={{fontSize:38,fontWeight:550,color:'#337d83',marginTop:58,marginBottom:12}}>主虹几何</div>
        <Img src={staticFile('sources/formula-angle.svg')} style={{width:640,height:130,objectFit:'contain',objectPosition:'left center'}}/>
        <div style={{fontSize:36,fontWeight:500,color:'#42616a',marginTop:34}}>两次折射 · 一次内反射</div>
      </div>
      <div style={{position:'absolute',left:1187+(1-m.back)*42,top:252-(1-m.back)*14,
        width:415,height:548,background:'#fff',boxShadow:'0 18px 35px rgba(32,64,63,.15),0 2px 3px rgba(32,64,63,.09)',
        transform:`rotate(${7.2-(1-m.back)*2}deg)`,transformOrigin:'50% 80%'}}>
        <Img src={staticFile('sources/gettelman-2023-rainbow-optics-page4939.png')} style={{width:'100%',height:'100%',objectFit:'contain',objectPosition:'center top'}}/>
      </div>
      <div style={{position:'absolute',left:1054,top:259+(1-m.settle)*56,
        width:428,height:565,background:'#fff',boxShadow:'0 26px 46px rgba(32,64,63,.17),0 3px 6px rgba(32,64,63,.10)',
        transform:`rotate(${-3.5-(1-m.settle)*4}deg)`,transformOrigin:'48% 84%'}}>
        <Img src={staticFile('sources/gettelman-2023-title-page.png')} style={{width:'100%',height:'100%',objectFit:'contain',objectPosition:'center top'}}/>
      </div>
      <div style={{position:'absolute',left:1012,top:871,width:640,textAlign:'center',
        color:INK,fontSize:36,fontWeight:520,opacity:m.back}}>Gettelman · 2023 · GMD</div>
      <div style={{position:'absolute',left:688,top:987,width:560,textAlign:'center',
        color:'#54757b',fontSize:36,fontWeight:500,opacity:m.settle}}>几何光学示意</div>
    </div>
  </div>;
}
