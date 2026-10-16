import React,{useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Img,cancelRender,continueRender,delayRender,staticFile,useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {World} from './World';
import {currentCue,ease,codaStart,cue} from './Timeline';
import captions from './captions-data.json';
import rawStory from './story.json';

const FONT='"Noto Sans SC","Microsoft YaHei",sans-serif';
const INK='#233447',BLUE='#3568cb',CORAL='#d46650';
const story=(Array.isArray(rawStory)?rawStory:(rawStory as {cues:any[]}).cues) as {id:string;code?:string}[];
let fonts:Promise<void>|undefined;
function readyFonts(){return fonts??=(async()=>{for(const [name,file] of [['Noto Sans SC','NotoSansSC'],['Noto Serif SC','NotoSerifSC']]){const f=new FontFace(name,`url(${staticFile('fonts/'+file+'.woff2')})`,{weight:'100 900'});await f.load();document.fonts.add(f);}await document.fonts.ready;})();}
function Scene({frame}:{frame:number}){
 const {scene,camera,gl}=useThree();const ref=useRef<World|null>(null),f=useRef(frame);f.current=frame;
 const [h]=useState(()=>delayRender('Pointer workshop assets and typography',{timeoutInMilliseconds:120000}));
 useLayoutEffect(()=>{let alive=true;let world:World|undefined;readyFonts().then(async()=>{if(!alive)return;world=new World(scene,camera as T.PerspectiveCamera,gl);ref.current=world;await world.loadAssets(staticFile);if(alive){world.update(f.current/30);continueRender(h);}}).catch(cancelRender);return()=>{alive=false;world?.dispose();ref.current=null;};},[scene,camera,gl,h]);
 useLayoutEffect(()=>{ref.current?.update(frame/30);},[frame]);return null;
}
function Brand(){return <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,color:INK,fontSize:44,fontWeight:650}}><Img src={staticFile('brand/logo.png')} style={{height:90,width:76,objectFit:'contain'}}/>rainbow鱼</div>;}

const words:Record<string,string>={
s01:'加了 1，怎么还是 7？',s02:'函数，改了谁？',s03:'改了副本，原件没动',s04:'让它找到原来的分数',
s05:'数据有内容，也有位置',s06:'score 里面，放着 7',s07:'内容 ≠ 地址',s08:'门牌只作示意',
s09:'&  拿到地址',s10:'把地址存进 p',s11:'两个变量，一条路径',s12:'int *  指向整数',
s13:'*p  沿地址访问',s14:'看地址 → 找原件',s15:'这一次，原件变了',s16:'换地址，换目标',s17:'改 p ／ 改 *p',
s18:'旧办法：传一份分数',s19:'新办法：传一份地址',s20:'C 的参数，都是传值',s21:'两份地址，同一个目标',s22:'找到它，再加一',s23:'函数退场，结果留下',
s24:'三名队员，三个元素',s25:'p + 1  走到下一项',s26:'一步，是一个元素',s27:'类型决定每步多远',s28:'下标，走的是同一条路',
s29:'有地址，不一定能访问',s30:'门牌还在，房间退租了',s31:'终点后，没有第四项',s32:'有效 · 活着 · 未越界',
s33:'这一分，终于加对了',s34:'拿地址 → 找原件'};
const codes:Record<string,string>={s12:'int *p = &score;',s19:'void addOne(int *p);\naddOne(&score);',s22:'void addOne(int *p) { (*p)++; }',s26:'sizeof(int) → 4 字节（本次实测）',s27:'sizeof(*p)',s28:'scores[1] == *(scores + 1)',s34:'&score       p       *p'};
function Code({code}:{code:string}){return <>{code.split(/(\b(?:int|void|NULL)\b|\b\d+\b|\*|&|\+\+)/g).map((v,i)=><span key={i} style={{color:/^(int|void)$/.test(v)?'#527096':/^(\*|&|\+\+)$/.test(v)?BLUE:/^\d+$/.test(v)?CORAL:INK,fontWeight:/^(\*|&|\+\+)$/.test(v)?800:550}}>{v}</span>)}</>;}
function Titles({t}:{t:number}){
 const c=currentCue(t);if(!c||t>=codaStart)return null;
 const id=c.id,fade=ease((t-c.startSec)/.4),code=codes[id]??story.find(s=>s.id===id)?.code??'';
 const early=t<cue('s02').startSec;const lines=code.split('\n').length;
 return <div style={{position:'absolute',top:early?190:154,left:90,right:90,textAlign:'center',color:INK,transform:`translateY(${(1-fade)*12}px)`,opacity:fade}}>
  <div style={{fontSize:early?87:68,fontWeight:800,letterSpacing:-1.8,lineHeight:1.15,textShadow:'0 2px 20px #f6f5ef'}}>{words[id]}</div>
  {!!code&&!early&&<div style={{display:'inline-block',marginTop:15,padding:'6px 24px 8px',borderRadius:16,background:'#f8f9f5d9',fontFamily:'Consolas,monospace',fontSize:lines>1?40:46,whiteSpace:'pre',lineHeight:1.25,boxShadow:'0 9px 30px #23344706'}}><Code code={code}/></div>}
 </div>;
}
function Caption({f}:{f:number}){const c=(captions.cues as {startFrame:number;endFrame:number;text:string}[]).find(c=>f>=c.startFrame&&f<c.endFrame);return c?<div style={{position:'absolute',bottom:42,left:110,right:110,textAlign:'center',fontSize:48,fontWeight:550,color:INK,lineHeight:1.4}}><span style={{padding:'10px 22px',background:'#fbfcf5ef',borderRadius:14,boxShadow:'0 6px 22px #293d4e0b'}}>{c.text.replace(/^[，。；：！？]+|[，。；：]$/g,'')}</span></div>:null;}
function Evidence({t}:{t:number}){if(t<codaStart)return null;const a=ease((t-codaStart)/1.05);return <div style={{position:'absolute',inset:0,background:'#f1f1ecef',transform:`translateX(${(1-a)*1940}px)`,color:INK}}>
 <div style={{position:'absolute',left:112,top:207,fontSize:79,fontWeight:800,letterSpacing:-2}}>从地址，找到原件。</div>
 <div style={{position:'absolute',left:124,top:388,fontSize:58,fontWeight:550,lineHeight:1.85}}><div><span style={{fontFamily:'Consolas',color:BLUE,fontSize:72}}>&amp;score</span>　拿到地址</div><div><span style={{fontFamily:'Consolas',color:BLUE,fontSize:72}}>*p</span>　沿地址访问</div></div>
 <div style={{position:'absolute',left:124,top:716,fontSize:37,lineHeight:1.6,color:'#62748a'}}>WG14 · C11 草案 N1570 · 2011<br/>§6.5.3.2 地址与间接访问<br/>§6.5.2.2 函数调用</div>
 <div style={{position:'absolute',left:1332,top:245,width:340,height:505,background:'#fbfcfa',transform:'rotate(6deg)',boxShadow:'8px 16px 36px #23344722'}}/>
 <div style={{position:'absolute',left:1275,top:228,width:365,height:520,background:'#fffefa',transform:`perspective(1800px) rotateY(-7deg) rotate(-4deg)`,boxShadow:'2px 3px 2px #a3a99d55, 11px 24px 50px #23344722',overflow:'hidden'}}><Img src={staticFile('papers/n1570-pointers.png')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top'}}/></div>
 <div style={{position:'absolute',left:1245,top:790,width:465,textAlign:'center',fontSize:35,fontWeight:600}}>真实标准草案页面</div>
 </div>;}
export function Film(){const f=useCurrentFrame(),t=f/30;return <AbsoluteFill style={{fontFamily:FONT,background:'#f1f1ec',overflow:'hidden'}}><ThreeCanvas width={1920} height={1080} camera={{near:.08,far:250,fov:42}} gl={{antialias:true,alpha:false,preserveDrawingBuffer:true}} shadows><Scene frame={f}/></ThreeCanvas><AbsoluteFill style={{pointerEvents:'none',background:'linear-gradient(180deg,#f1f1ec35,transparent 28%,transparent 85%,#f1f1ec75)'}}/><Titles t={t}/><Evidence t={t}/><Brand/><Caption f={f}/></AbsoluteFill>;}
