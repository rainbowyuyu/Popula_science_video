import React from 'react';
import {Img,staticFile} from 'remotion';
import type {NobelState} from './WorldV51';
import timeline from './timeline-v51.json';

/** Original Nobel educational illustrations, timed to measured spoken phrases.
 * These panels are not recordings of the experiments. Camera targets are source
 * pixel rectangles; a move lasts 0.8 seconds and then holds completely still.
 * The frog's OPEN panel begins at 008-01, never a percentage of scene time.
 * Fig.5 belongs only to 015 (motor cortex/whiskers), never sleep or memory.
 */
export type EvidenceCropV51={x:number;y:number;w:number;h:number};
type Focus={x:number;y:number;rx:number;ry:number};
type FigureId='algae'|'channel'|'neuron'|'motor';
type Target={crop:EvidenceCropV51;focus?:Focus};
type PhraseCue={clip:string;phrase:number;target:string};
type WindowSpec={id:string;figure:FigureId;first:PhraseCue;until:{clip:string;phrase?:number};cues:PhraseCue[]};
type Figure={file:string;width:number;height:number;number:number;targets:Record<string,Target>};

export const EVIDENCE_FIGURE_V51_LAYOUT={x:1110,y:380,width:720,height:405,sourceY:797} as const;
const {width:W,height:H}=EVIDENCE_FIGURE_V51_LAYOUT;
const FPS=timeline.fps;
const MOVE_SECONDS=.8;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const t=clamp(v);return t*t*t*(t*(t*6-15)+10);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const crop=(x:number,y:number,w:number,h:number):EvidenceCropV51=>({x,y,w,h});
const interpolate=(a:EvidenceCropV51,b:EvidenceCropV51,t:number):EvidenceCropV51=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),w:mix(a.w,b.w,t),h:mix(a.h,b.h,t)});

// All rectangles stay within the 2500px originals. The smallest focus is
// Selected regions are displayed at no more than native scale; portrait
// regions use a fitted floating frame rather than empty blue side panels.
const figures:Record<FigureId,Figure>={
 algae:{file:'nobel2026/POP_Fig_2.jpg',width:2500,height:964,number:2,targets:{
  full:{crop:crop(0,0,2500,964)},
  cell:{crop:crop(0,30,1150,850)},
  eyespot:{crop:crop(310,165,940,529),focus:{x:650,y:425,rx:58,ry:100}},
  flagella:{crop:crop(0,40,1000,563),focus:{x:455,y:190,rx:260,ry:120}},
 }},
 channel:{file:'nobel2026/POP_Fig_3_ENG_01.jpg',width:2500,height:1100,number:3,targets:{
  full:{crop:crop(0,0,2500,1100)},
  geneEgg:{crop:crop(25,90,1000,930),focus:{x:312,y:523,rx:100,ry:105}},
  closed:{crop:crop(780,195,790,445)},
  open:{crop:crop(1620,160,840,473)},
  ions:{crop:crop(1620,275,840,473)},
  result:{crop:crop(1620,200,840,473)},
 }},
 neuron:{file:'nobel2026/POP_Fig_4_ENG_01.jpg',width:2500,height:996,number:4,targets:{
  full:{crop:crop(0,0,2500,996)},
  gene:{crop:crop(100,20,1600,900),focus:{x:560,y:270,rx:275,ry:150}},
  quiet:{crop:crop(210,470,900,506)},
  stimulus:{crop:crop(725,270,1110,625),focus:{x:1175,y:565,rx:182,ry:110}},
  spike:{crop:crop(1730,490,560,416)},
  signalChain:{crop:crop(1730,490,560,416)},
 }},
 motor:{file:'nobel2026/POP_Fig_5_ENG_01.jpg',width:2500,height:1027,number:5,targets:{
  full:{crop:crop(0,0,2500,1027)},
  fibre:{crop:crop(1190,60,1250,704),focus:{x:1763,y:453,rx:60,ry:84}},
  gene:{crop:crop(35,30,1080,900),focus:{x:370,y:570,rx:135,ry:90}},
  whiskers:{crop:crop(1420,275,1080,608),focus:{x:1885,y:670,rx:180,ry:150}},
 }},
};

/** Every cue points to subtitleParts, not a uniform division of scene time.
 * Empty windows are deliberate: Fig.2 contains no electrode readout (005/006),
 * Fig.3 shows frog eggs rather than cultured kidney cells (009), and Fig.5 does
 * not document sleep/wake (016) or the hippocampal engram experiment (017).
 */
const windows:WindowSpec[]=[
 {id:'algae-observation',figure:'algae',first:{clip:'003',phrase:1,target:'full'},until:{clip:'004'},cues:[
  {clip:'003',phrase:1,target:'full'},
  // Original lamp is on the RIGHT; Canvas handles the narrated left-side
  // light. The source crop stays on the cell during those two sentences.
  {clip:'004',phrase:0,target:'cell'},
  {clip:'004',phrase:1,target:'cell'},
  {clip:'004',phrase:2,target:'eyespot'},
  {clip:'004',phrase:3,target:'flagella'},
 ]},
 {id:'frog-expression',figure:'channel',first:{clip:'007',phrase:0,target:'full'},until:{clip:'008'},cues:[
  {clip:'007',phrase:0,target:'full'},
  {clip:'007',phrase:1,target:'geneEgg'},
  {clip:'007',phrase:2,target:'closed'},
  {clip:'008',phrase:0,target:'closed'},
  {clip:'008',phrase:1,target:'open'},
  {clip:'008',phrase:2,target:'ions'},
  {clip:'008',phrase:3,target:'result'},
 ]},
 {id:'channel-recap',figure:'channel',first:{clip:'010',phrase:0,target:'result'},until:{clip:'010',phrase:3},cues:[
  {clip:'010',phrase:0,target:'result'},
  {clip:'010',phrase:1,target:'open'},
  {clip:'010',phrase:2,target:'result'},
 ]},
 {id:'cultured-neurons',figure:'neuron',first:{clip:'011',phrase:0,target:'full'},until:{clip:'014',phrase:2},cues:[
  {clip:'011',phrase:0,target:'full'},
  {clip:'011',phrase:1,target:'gene'},
  {clip:'012',phrase:0,target:'quiet'},
  {clip:'012',phrase:1,target:'stimulus'},
  {clip:'012',phrase:2,target:'spike'},
  {clip:'012',phrase:3,target:'spike'},
  {clip:'013',phrase:0,target:'signalChain'},
  {clip:'013',phrase:1,target:'spike'},
  {clip:'013',phrase:2,target:'spike'},
  {clip:'014',phrase:0,target:'gene'},
  {clip:'014',phrase:1,target:'stimulus'},
 ]},
 {id:'motor-cortex',figure:'motor',first:{clip:'015',phrase:0,target:'fibre'},until:{clip:'015'},cues:[
  {clip:'015',phrase:0,target:'fibre'},
  {clip:'015',phrase:1,target:'gene'},
  {clip:'015',phrase:2,target:'whiskers'},
 ]},
];

const clips=timeline.clips as Array<{id:string;start:number;end:number;subtitleParts:Array<{start:number;end:number;text:string}>}>;
const getClip=(id:string)=>{const c=clips.find(item=>item.id===id);if(!c)throw new Error('Evidence V5.1: missing clip '+id);return c;};
const phraseTime=(cue:{clip:string;phrase:number})=>{const c=getClip(cue.clip),p=c.subtitleParts[cue.phrase];if(!p)throw new Error('Evidence V5.1: missing phrase '+cue.clip+'-'+cue.phrase);return c.start/FPS+p.start;};
const timedWindows=windows.map(w=>{
 const fig=figures[w.figure];
 for(const cue of w.cues)if(!fig.targets[cue.target])throw new Error('Evidence V5.1: missing target '+w.figure+'/'+cue.target);
 const timed=w.cues.map(cue=>({...cue,time:phraseTime(cue)}));
 // Repeated targets mean HOLD, not a fresh animation on every sentence.
 const cues=timed.filter((cue,index)=>index===0||cue.target!==timed[index-1].target);
 return {...w,start:phraseTime(w.first),end:w.until.phrase===undefined?getClip(w.until.clip).end/FPS:phraseTime(w.until as {clip:string;phrase:number}),cues};
});

export function getEvidenceFigureV51Metadata(state:Pick<NobelState,'time'>){
 const active=timedWindows.find(w=>state.time>=w.start&&state.time<w.end);
 if(!active)return null;
 const cueIndex=Math.max(0,active.cues.map(cue=>state.time>=cue.time).lastIndexOf(true));
 const cue=active.cues[cueIndex],previous=active.cues[Math.max(0,cueIndex-1)],fig=figures[active.figure];
 const target=fig.targets[cue.target],from=fig.targets[previous.target];
 const motion=ease((state.time-cue.time)/MOVE_SECONDS);
 const rect=interpolate(from.crop,target.crop,motion);
 const enter=ease((state.time-active.start)/.45),exit=ease((active.end-state.time)/.5);
 return {windowId:active.id,figureId:active.figure,file:fig.file,figureNumber:fig.number,clip:cue.clip,phrase:cue.phrase,target:cue.target,
  layout:EVIDENCE_FIGURE_V51_LAYOUT,crop:rect,focus:target.focus,focusOpacity:motion,opacity:enter*exit,
  sourceOpacity:ease((state.time-active.start)/.4)*(1-ease((state.time-active.start-5.3)/.7)),
  sourceWidth:fig.width,sourceHeight:fig.height};
}

export function EvidenceFigureV51({state}:{state:NobelState}){
 const evidence=getEvidenceFigureV51Metadata(state);if(!evidence||evidence.opacity<=.001)return null;
 const {crop:rect,layout,focus}=evidence;
 const scale=Math.min(1,W/rect.w,H/rect.h);
 const viewportW=rect.w*scale,viewportH=rect.h*scale;
 // Clip exactly to the selected crop even when it is portrait-shaped. A
 // contain-fit without this viewport leaked CLOSED into the OPEN shot.
 const focusStyle=focus?{left:(focus.x-rect.x-focus.rx)*scale,top:(focus.y-rect.y-focus.ry)*scale,width:focus.rx*2*scale,height:focus.ry*2*scale}:undefined;
 return <div style={{position:'absolute',left:layout.x,top:layout.y,width:W,height:H,zIndex:6,opacity:evidence.opacity,pointerEvents:'none'}}>
  <div style={{position:'absolute',left:(W-viewportW)/2,top:(H-viewportH)/2,width:viewportW,height:viewportH,overflow:'hidden',borderRadius:14,background:'#6490ce',boxShadow:'0 18px 42px rgba(24,55,70,.16)',outline:'4px solid rgba(255,253,248,.95)'}}>
   <div style={{position:'absolute',left:0,top:0,width:viewportW,height:viewportH,overflow:'hidden'}}>
    <Img src={staticFile(evidence.file)} style={{position:'absolute',left:-rect.x*scale,top:-rect.y*scale,width:evidence.sourceWidth*scale,height:evidence.sourceHeight*scale,maxWidth:'none',display:'block'}}/>
    {focusStyle&&<div style={{position:'absolute',...focusStyle,border:'2.5px solid rgba(255,230,167,.94)',borderRadius:'50%',boxSizing:'border-box',boxShadow:'0 0 0 3px rgba(29,66,96,.10)',opacity:evidence.focusOpacity}}/>}
   </div>
  </div>
  <div style={{position:'absolute',left:0,top:H+12,fontFamily:'"Nobel Sans",sans-serif',fontSize:19,fontWeight:500,lineHeight:1.25,color:'#5f7680',opacity:evidence.sourceOpacity,whiteSpace:'nowrap'}}>NobelPrize.org · 图 {evidence.figureNumber} · Mattias Karlén</div>
 </div>;
}

export const EVIDENCE_FIGURE_V51_CROPS=figures;
export const EVIDENCE_FIGURE_V51_PHRASE_CUES=windows;

