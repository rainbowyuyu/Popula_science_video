import React,{useLayoutEffect,useRef,useState}from'react';import{AbsoluteFill,Img,cancelRender,continueRender,delayRender,staticFile,useCurrentFrame}from'remotion';import{ThreeCanvas}from'@remotion/three';import{useThree}from'@react-three/fiber';import * as T from'three';import{World}from'./World';import{cue,ease,currentCue,timeline,phase,wordProgress}from'./Timeline';import captions from'./captions-data.json';import{C}from'./Design';
const font='"Noto Sans SC","Microsoft YaHei",Arial,sans-serif';
let readyFonts:Promise<void>|undefined;
function ensureFonts(){return readyFonts??=(async()=>{for(const [family,file]of [['Noto Serif SC','NotoSerifSC'],['Noto Sans SC','NotoSansSC']]){const face=new FontFace(family,`url(${staticFile('fonts/'+file+'.woff2')})`,{weight:'100 900'});await face.load();document.fonts.add(face);}await document.fonts.ready;})();}
function Scene({frame}:{frame:number}){
 const{scene,camera,gl}=useThree(),ref=useRef<World|null>(null),f=useRef(frame);f.current=frame;
 const[h]=useState(()=>delayRender('V4 printed paper and product assets',{timeoutInMilliseconds:120000}));
 useLayoutEffect(()=>{let alive=true;let world:World|undefined;
  ensureFonts().then(async()=>{if(!alive)return;world=new World(scene,camera as T.PerspectiveCamera,gl);ref.current=world;await world.loadAssets(staticFile);if(alive){world.update(f.current/30);continueRender(h);}}).catch(cancelRender);
  return()=>{alive=false;world?.dispose();ref.current=null;};
 },[scene,camera,gl,h]);
 useLayoutEffect(()=>{ref.current?.update(frame/30);},[frame]);return null;
}
function Brand(){return<div style={{position:'absolute',top:32,left:55,display:'flex',alignItems:'center',gap:12,color:C.ink,fontSize:32,fontWeight:700}}><Img src={staticFile('brand/logo.png')} style={{width:48,height:57,objectFit:'contain',mixBlendMode:'multiply'}}/>rainbow鱼</div>;}
const lines:Record<string,[string,string,string?]>={s03:['地址，谁能看见？','一张生日订单的旅程'],s04:['没约过密码','消息怎么保密？'],s05:['假如直接传原话','中间就能读懂'],s06:['先加密，再上网','明文 → 密文'],s08:['密钥','只有两端知道的秘密数字'],s10:['钥匙，也不能直接寄','问题出在第一次连接'],s11:['交换公开结果','各自算出同一个秘密'],s12:['借两杯颜料，看懂步骤','颜色是类比'],s13:['① 同一个公开起点','黄色，谁都知道'],s14:['② 各自留一种私色','红色留在手机这边'],s15:['② 各自留一种私色','蓝色留在网站这边'],s16:['③ 各自混合','手机：黄＋红　　网站：黄＋蓝'],s17:['④ 只交换混色','红瓶和蓝瓶，一直留在原地'],s18:['路上看得见这些','黄色、橙色、绿色'],s19:['⑤ 加回自己的私色','手机：收到绿色，再加红色'],s20:['⑤ 加回自己的私色','网站：收到橙色，再加蓝色'],s21:['结果一样了','两边都有：黄 ＋ 红 ＋ 蓝'],s22:['秘密没有上路','在两端，分别做出来'],s23:['电脑怎样做到？','用数学保留这种单向性'],s24:['还要认准对面','别把秘密约给冒名者'],s25:['证书 ＋ 身份证明','查签发者、查网址、查签名'],s27:['这叫“握手”','发送订单前，浏览器已经完成'],s28:['现在，发送订单','把共同秘密加工成会话密钥'],s29:['读不懂，也能乱改','把一个密文字节改一下'],s30:['改过，就拒收','认证标记需要密钥'],s31:['真实程序的两次结果',''],s32:['线路看不懂，店家看得懂','惊喜，安全送到了'],s33:['保护手机到网站这一段','网站仍要负责保管你的信息']};
function Heading({t}:{t:number}){const c=currentCue(t);if(!c)return null;const item=lines[c.id];if(!item)return null;const fade=ease((t-c.startSec-.35)/.8)*ease((c.endSec-t)/.5);const big=c.id==='s04';return<div style={{position:'absolute',left:115,right:90,top:big?105:116,color:C.ink,opacity:fade,transform:`translateY(${(1-fade)*25}px)`,textAlign:'center'}}><div style={{fontSize:big?78:70,fontWeight:800,lineHeight:1.2,letterSpacing:-1}}>{item[0]}</div><div style={{fontSize:big?70:38,fontWeight:big?800:500,marginTop:big?8:16,color:big?C.teal:C.muted,lineHeight:1.25}}>{item[1]}</div></div>;}
function Caption({frame}:{frame:number}){const c=captions.cues.find(x=>frame>=x.startFrame&&frame<x.endFrame);return c?<div style={{position:'absolute',bottom:42,left:130,right:130,textAlign:'center',fontSize:48,fontWeight:550,lineHeight:1.35,color:C.ink,textShadow:'0 1px 9px #fff,0 0 3px #fff'}}><span style={{padding:'8px 22px',background:'#faf8f0e8',borderRadius:12,boxDecorationBreak:'clone'}}>{c.text.replace(/^[，。；：！？]+|[，。；：]$/g,'')}</span></div>:null;}
function ResultLabels({t}:{t:number}){
 const c=cue('s31');if(t<c.startSec||t>=cue('s32').startSec)return null;
 const tail=ease((cue('s32').startSec-t)/.45),ok=wordProgress('s31','恢复订单',t,.5)*tail,bad=wordProgress('s31','报错',t,.5)*tail;
 return <><div style={{position:'absolute',left:185,top:842,width:570,textAlign:'center',fontSize:40,fontWeight:650,color:C.coral,opacity:bad,transform:`translateY(${(1-bad)*12}px)`}}>篡改件 → 拒收</div><div style={{position:'absolute',right:135,top:842,width:570,textAlign:'center',fontSize:40,fontWeight:650,color:C.teal,opacity:ok,transform:`translateY(${(1-ok)*12}px)`}}>完整订单 → 恢复</div></>;
}
function Evidence({t}:{t:number}){
 if(t<timeline.coda.startSec)return null;
 const a=ease((t-timeline.coda.startSec)/1.3),settle=ease((t-timeline.coda.startSec-.45)/1.7);
 const stock={backgroundColor:'#faf9f5',backgroundImage:`url(${staticFile('textures/paper-uncoated.png')})`,backgroundSize:'384px 384px',border:'1px solid #ece8de'};
 return<div style={{position:'absolute',inset:0,background:'#f3f0e9f5',transform:`translateY(${(1-a)*1100}px)`,color:C.ink}}>
  <div style={{position:'absolute',left:115,top:155,fontSize:76,fontWeight:800}}>公开交换，也能留下秘密。</div>
  <div style={{position:'absolute',left:180,top:330,width:365,height:475,...stock,transform:`perspective(1400px) rotateX(5deg) rotate(${5+2*(1-settle)}deg)`,boxShadow:'3px 3px 1px #cfc9bc, 12px 17px 20px #39413916, 22px 34px 45px #39413910'}}/>
  <div style={{position:'absolute',left:130,top:315,width:370,height:485,...stock,transform:`perspective(1400px) rotateX(${3+4*(1-settle)}deg) rotateY(-3deg) rotate(-4deg)`,transformOrigin:'50% 90%',boxShadow:'1px 2px 1px #d3cec2, 5px 7px 8px #303c3520, 16px 22px 30px #303c3517'}}>
   <Img src={staticFile('papers/diffie-hellman-1976.png')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top',mixBlendMode:'multiply',opacity:.98}}/>
   <div style={{position:'absolute',inset:0,pointerEvents:'none',background:'linear-gradient(114deg,#ffffff32 0%,transparent 30%,#b4aa8e09 74%,#ffffff45 100%)',boxShadow:'inset 1px 0 2px #ffffff80'}}/>
  </div>
  <div style={{position:'absolute',left:115,top:840,fontSize:34,lineHeight:1.6}}>Diffie &amp; Hellman · 1976<br/>New Directions in Cryptography</div>
  <div style={{position:'absolute',left:690,top:350,fontSize:47,lineHeight:1.85}}><div>共同秘密 <span style={{color:C.teal}}>g<sup>ab</sup> ≡ g<sup>ba</sup> (mod p)</span></div><div>身份验证 <span style={{color:C.teal}}>证书 ＋ 签名</span></div><div>内容保护 <span style={{color:C.teal}}>加密 ＋ 认证</span></div><div style={{fontSize:34,color:C.muted,marginTop:36}}>RFC 8446 · TLS 1.3 · 2018</div><div style={{fontSize:34,color:C.muted}}>真实实验：X25519 → HKDF → AES-GCM</div></div>
 </div>;
}
export function Film(){const f=useCurrentFrame(),t=f/30;return<AbsoluteFill style={{background:'#ece9e2',fontFamily:font,overflow:'hidden'}}><ThreeCanvas shadows={{enabled:true,type:T.VSMShadowMap,autoUpdate:true}} width={1920} height={1080} camera={{near:.05,far:180,fov:42}} gl={{antialias:true,alpha:false,preserveDrawingBuffer:true}}><Scene frame={f}/></ThreeCanvas><AbsoluteFill style={{pointerEvents:'none',background:'linear-gradient(0deg,#f5f1e966,transparent 20%,transparent 78%,#f5f1e977)'}}/><Heading t={t}/><ResultLabels t={t}/><Evidence t={t}/><Brand/><Caption frame={f}/></AbsoluteFill>;}
