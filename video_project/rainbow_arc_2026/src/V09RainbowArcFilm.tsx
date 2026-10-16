import React,{useCallback,useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CinematicLensV09} from './CinematicLensV09';
import {AnimatedObserverV09} from './AnimatedObserverV09';
import {HDRLoader} from 'three/examples/jsm/loaders/HDRLoader.js';
import {timeline,stateAt,FrameState,ease,clamp} from './Timeline';
import {WorldV09,HERO,sceneP,Anchor} from './WorldV09';
import {GaussianSplatV07} from './GaussianSplatV07';
import {sampleFilmCamera} from './CinematicRouteV09';
import {loadWaterProV09,WaterPoolV09} from './WaterProV09';
import {EditorialOverlayV09,microStrengthV09} from './EditorialOverlayV09';
import {createMacroStudioV09} from './MacroLookV09';

const INK='#203d45';
type Projected={x:number;y:number;text:string;color:string;visible:boolean};
type Rig={renderer:T.WebGLRenderer;scene:T.Scene;camera:T.PerspectiveCamera;world:WorldV09;hdri?:T.WebGLRenderTarget;landscape?:T.Texture;macroStudio?:T.WebGLRenderTarget;lens?:CinematicLensV09;splat?:GaussianSplatV07;actors?:AnimatedObserverV09;water?:WaterPoolV09};
type Pose={position:number[];target:number[];fov:number};
const pose=(position:number[],target:number[],fov=45):Pose=>({position,target,fov});
const hero=[0,4,0];
export const shotPoses:Record<string,{start:Pose;end:Pose}>={
  street:{start:pose([0,2.4,16],[0,5,-8],52),end:pose([4.4,3.8,13],[0,5,-6],50)},
  drop:{start:pose([2.3,5.1,10.8],hero,43),end:pose([.4,4.8,9.6],hero,43)},
  dispersion:{start:pose([.4,4.8,9.6],hero,43),end:pose([-.7,4.6,9.2],hero,45)},
  reflection:{start:pose([-.7,4.6,9.2],hero,45),end:pose([-2.3,5.2,10.1],hero,45)},
  angle:{start:pose([-2.3,5.2,10.1],hero,45),end:pose([3.8,6.3,13],[0,4.2,0],49)},
  cone:{start:pose([19,12,24],[0,4,-3],48),end:pose([-10,9,26],[0,4,-3],48)},
  circle:{start:pose([0,5,25],[0,4,-6],52),end:pose([2,5.5,25],[0,4,-6],52)},
  observer:{start:pose([13,8,26],[0,3,-3],48),end:pose([21,8.5,21],[2,3,-3],48)},
  secondary:{start:pose([1.4,5,11],hero,44),end:pose([0,4.5,25],[0,5,-8],51)},
  return:{start:pose([-7,4.4,11],[-3,2,3],49),end:pose([-4,2.7,9],[-3,1.7,3],47)},
  references:{start:pose([-4,2.7,9],[-3,1.7,3],47),end:pose([-3.5,2.7,8.7],[-3,1.7,3],47)},
};

// The configurable camera rail is reviewed independently. Its source record
// distinguishes the local implementation from the external Opus request.
function applyCamera(camera:T.PerspectiveCamera,state:FrameState){
  const sample=sampleFilmCamera(state.frame);camera.position.set(...sample.position);camera.quaternion.copy(sample.quaternion);camera.fov=sample.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}

function Stage({frame,onProjection}:{frame:number;onProjection:(p:Projected|undefined)=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),rig=useRef<Rig|null>(null),[handle]=useState(()=>delayRender('V09 cinematic optical world assets')),[ready,setReady]=useState(false);
  const draw=useCallback(()=>{
    const r=rig.current;if(!r)return;const s=stateAt(frame);r.world.update(s);r.actors?.update(frame);applyCamera(r.camera,s);
    const drop=timeline.scenes.find(s=>s.id==='drop')!;const cloudIn=ease((frame-drop.start-8)/28),cloudOut=1-ease((frame-drop.start-45)/40);
    r.splat?.update(r.camera,cloudIn*cloudOut*.018,ease((frame-drop.start-24)/50));r.water?.update(frame);r.lens?.render(frame,microStrengthV09(frame),new T.Vector3(...sampleFilmCamera(frame).target));
    const anchor=r.world.anchor;if(!anchor){onProjection(undefined);return;}const p=anchor.point.clone().project(r.camera);onProjection({x:(p.x*.5+.5)*1920,y:(.5-p.y*.5)*1080,text:anchor.text,color:anchor.color??INK,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1.15&&Math.abs(p.y)<1.15});
  },[frame,onProjection]);
  useLayoutEffect(()=>{let alive=true;try{
    const renderer=new T.WebGLRenderer({canvas:canvas.current!,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setSize(1920,1080,false);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.93;
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1920/1080,.03,400),world=new WorldV09(renderer,scene);rig.current={renderer,scene,camera,world,lens:new CinematicLensV09(renderer,scene,camera)};
    const studio=createMacroStudioV09(renderer);rig.current.macroStudio=studio;world.macroLook.waterMaterial.envMap=studio.texture;
    Promise.all([
      new GLTFLoader().loadAsync(staticFile('assets_v09/environment/rain_after_terrace_v09.glb')).then(g=>{if(alive)world.cinema?.attachAsset(g.scene);}),
      new GLTFLoader().loadAsync(staticFile('assets_v08/macro/macro_leaf_v08.glb')).then(g=>{if(alive)world.macroLook.attachContext(g.scene);}),
      new HDRLoader().loadAsync(staticFile('assets_v08/environment/hilly_terrain_01_2k.hdr')).then(texture=>{if(!alive){texture.dispose();return;}texture.mapping=T.EquirectangularReflectionMapping;const pmrem=new T.PMREMGenerator(renderer);const map=pmrem.fromEquirectangular(texture);rig.current!.hdri=map;rig.current!.landscape=texture;world.cinema?.attachLandscape(texture,-.88);scene.environment=map.texture;scene.environmentIntensity=.62;pmrem.dispose();}),
      loadWaterProV09().then(compat=>{if(alive)rig.current!.water=new WaterPoolV09(compat,world,renderer,scene,camera);}),
      fetch(staticFile('assets_v06/lux3d/splats-v06.json')).then(r=>r.json()).then(data=>{if(!alive)return;const splat=new GaussianSplatV07(data.rows);splat.position.copy(HERO);rig.current!.splat=splat;scene.add(splat);}),
      new GLTFLoader().loadAsync(staticFile('assets_v09/characters/robot_expressive/RobotExpressive-original.glb')).then(g=>{if(!alive)return;const actors=new AnimatedObserverV09(g.scene,g.animations);actors.attach(world);rig.current!.actors=actors;}),
      new GLTFLoader().loadAsync(staticFile('assets_v08/macro/spherical_raindrop_v08.glb')).then(g=>{if(!alive)return;let mesh:T.Mesh|undefined;g.scene.traverse(o=>{if((o as T.Mesh).isMesh)mesh=o as T.Mesh;});if(mesh){world.drop.geometry.dispose();world.drop.geometry=mesh.geometry.clone();world.drop.scale.setScalar(1.6);}})
    ]).then(()=>{if(alive){setReady(true);continueRender(handle);}}).catch(e=>{if(alive)cancelRender(e);});
  }catch(e){cancelRender(e);}return()=>{alive=false;if(rig.current){rig.current.actors?.dispose();rig.current.lens?.dispose();rig.current.splat?.dispose();rig.current.water?.dispose();rig.current.world.dispose();rig.current.hdri?.dispose();rig.current.landscape?.dispose();rig.current.macroStudio?.dispose();rig.current.renderer.dispose();rig.current.renderer.forceContextLoss();}rig.current=null;};},[handle]);
  useLayoutEffect(()=>draw(),[draw,ready]);
  return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}

function Brand({strength=0}:{strength?:number}){return <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,zIndex:60,pointerEvents:'none'}}><div style={{position:'absolute',inset:'-10px -18px',borderRadius:18,background:'rgba(245,249,243,.92)',opacity:strength,zIndex:-1}}/><Img src={staticFile('brand/logo.png')} style={{width:76.17,height:90,objectFit:'contain'}}/><span style={{fontSize:44,fontWeight:650,color:INK}}>rainbow鱼</span></div>;}

export function realityWindowAt(frame:number){
  const start=(id:string)=>timeline.scenes.find(s=>s.id===id)?.start??0;
  const clip=(id:string)=>timeline.clips.find(c=>c.id===id)?.start??0;
  const windows=[{slug:'street',start:0,x:50,y:46},{slug:'droplet',start:start('drop')-65,x:50,y:52},{slug:'waterfall',start:start('cone')-75,x:50,y:48},{slug:'fountain',start:start('return')+25,x:48,y:55},{slug:'street',start:clip('r041')+25,x:50,y:46}];
  const active=windows.find(w=>frame>=w.start&&frame<w.start+150);
  if(!active)return undefined;
  const local=frame-active.start,enter=active.start===0?1:ease(local/22),exit=ease((local-116)/34);
  return {...active,local,enter,exit,strength:enter*(1-exit)};
}

function Reality({state}:{state:FrameState}){
  const active=realityWindowAt(state.frame);if(!active)return null;
  const {local,enter,exit}=active,index=local+1;
  // A broad feathered foreground veil crosses the frame; no circular portal.
  const amount=exit>0?1-exit:enter;
  const edge=amount*150-25;
  const mask=amount>.999?'none':`linear-gradient(112deg,#000 ${edge-18}%,rgba(0,0,0,.80) ${edge-8}%,rgba(0,0,0,.3) ${edge+4}%,transparent ${edge+18}%)`;
  const street=active.slug==='street',zoom=active.slug==='droplet'?1+.75*ease((local-70)/75):1;
  return <div style={{position:'absolute',inset:0,zIndex:2,overflow:'hidden',maskImage:mask}}>
    <Img src={staticFile(`assets_v06/qwen/generated/${active.slug}/frames/frame_${String(index).padStart(4,'0')}.jpg`)} style={{position:'absolute',left:street?-510:0,top:street?-120:0,width:street?2430:'100%',height:street?1366.875:'100%',objectFit:'cover',transform:`scale(${zoom*(1+local/150*.03)})`,transformOrigin:'50% 55%',filter:`saturate(.90)`}}/>
    <div style={{position:'absolute',inset:0,background:'linear-gradient(0deg,rgba(13,37,36,.20),transparent 46%)'}}/>
  </div>;
}
function Intro({state}:{state:FrameState}){
  if(state.frame>220)return null;const enter=ease((state.frame-10)/30),leave=ease((state.frame-104)/60);
  const real=realityWindowAt(state.frame)?.strength??0;
  return <div style={{position:'absolute',left:640+leave*1460,top:560-leave*70,width:640,zIndex:15,transform:`translateY(${(1-enter)*25}px)`,opacity:enter}}>
    <div style={{color:new T.Color(INK).lerp(new T.Color('#fff'),real).getStyle(),fontSize:88,fontWeight:760,lineHeight:1.14,textAlign:'center',letterSpacing:-2,textShadow:`0 4px 8px rgba(10,32,30,${real*.6}),0 5px 35px rgba(10,42,39,${real*.3})`}}>彩虹为什么<br/>是弧形？</div>
  </div>;
}
function Label({p,state}:{p:Projected|undefined;state:FrameState}){
  if(!p?.visible||state.scene==='references'||state.frame<370)return null;
  if(state.scene==='return'&&state.clip?.id==='r041')return null;
  const real=realityWindowAt(state.frame);
  const realityStrength=real?.strength??0;
  const simple=['dispersion','circle','return'].includes(state.scene)||(state.scene==='secondary'&&p.text!=='多一次反射');
  const w=p.text.length>9?620:p.text.length>6?500:340,h=state.scene==='angle'?112:76;
  const right=['reflection','angle','secondary'].includes(state.scene),preferredX=right?p.x+70:p.x-w-70;
  const x=state.scene==='circle'?120:simple?960-w/2:Math.max(120,Math.min(1800-w,preferredX));
  const y=state.scene==='secondary'&&p.text==='多一次反射'?210:simple?184:Math.max(190,Math.min(760,p.y-70));
  const a=ease((state.frame-state.sceneStart-24)/35)*(state.scene==='return'?1:1-realityStrength);const labelX=right?x:x+w;
  const showLeader=!simple&&realityStrength<.01&&Math.hypot(labelX-p.x,y+40-p.y)<180;
  const reality=(real?.strength??0)>.25;
  return <div style={{position:'absolute',inset:0,zIndex:15,pointerEvents:'none',opacity:a}}>
    {showLeader&&<svg width="1920" height="1080" style={{position:'absolute',inset:0}}><path d={`M${labelX} ${y+40} L${p.x} ${p.y}`} fill="none" stroke={p.color} strokeOpacity=".45" strokeWidth="2"/><circle cx={p.x} cy={p.y} r="5" fill={p.color}/></svg>}
    <div style={{position:'absolute',left:x,top:y,width:w,textAlign:'center',fontSize:/^约\d/.test(p.text)?92:48,fontWeight:730,lineHeight:1.25,color:reality?'#fff':p.color,textShadow:reality?'0 2px 14px rgba(15,43,39,.65)':'0 2px 12px rgba(248,251,244,.9)',background:simple?'none':'linear-gradient(90deg,transparent,rgba(240,247,243,.75),transparent)',borderRadius:24}}>{p.text}</div>
  </div>;
}
function Caption({state}:{state:FrameState}){
  const caption=timeline.captions.find(c=>state.frame>=c.start&&state.frame<c.end);if(!caption)return null;
  const text=caption.text;const midpoint=text.length>13?Math.ceil(text.length/2):text.length;const lines=text.length>13?[text.slice(0,midpoint),text.slice(midpoint)]:[text];
  const dark=(realityWindowAt(state.frame)?.strength??0)>.25;
  return <div style={{position:'absolute',bottom:34,left:632,width:656,zIndex:40,textAlign:'center',pointerEvents:'none'}}><span style={{display:'inline-block',fontSize:46,fontWeight:550,lineHeight:1.32,color:dark?'#fff':INK,padding:'11px 22px',borderRadius:16,background:dark?'rgba(20,44,43,.72)':'rgba(249,252,247,.90)',boxShadow:'0 8px 25px rgba(21,56,53,.10)'}}>{lines.map((line,i)=><React.Fragment key={i}>{i>0&&<br/>}{line}</React.Fragment>)}</span></div>;
}
function Coda({state}:{state:FrameState}){
  if(state.scene!=='references')return null;const p=ease(state.progress*7.2),slide=ease(state.progress*6),s2=ease((state.progress-.06)*6);
  return <div style={{position:'absolute',inset:0,zIndex:30,transform:`translateX(${(1-p)*1940}px)`,background:'radial-gradient(ellipse at 45% 15%,#fffdf4,#e9efec 65%,#d5e3df)',boxShadow:'-40px 0 80px rgba(35,77,77,.12)',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,transform:`translateX(${-state.progress*12}px) rotate(${-state.progress*.3}deg)`}}>
      <div style={{position:'absolute',left:880,top:-160,width:110,height:1420,background:'linear-gradient(90deg,transparent,rgba(200,95,92,.15),rgba(236,198,90,.22),rgba(113,193,154,.22),rgba(75,153,188,.20),transparent)',filter:'blur(23px)',transform:`rotate(-24deg) translateX(${state.progress*24}px)`,pointerEvents:'none'}}/>
      <div style={{position:'absolute',left:670,top:178,fontSize:64,fontWeight:760,color:INK}}>一滴雨里的光学</div>
      <div style={{position:'absolute',left:300,top:340,width:620,transform:`translateY(${(1-slide)*70}px)`}}>
        <div style={{fontSize:40,fontWeight:650,color:'#35878e'}}>折射定律</div><Img src={staticFile('sources/formula-snell.svg')} style={{width:610,height:112,objectFit:'contain',objectPosition:'left'}}/>
        <div style={{fontSize:40,fontWeight:650,marginTop:30,color:'#35878e'}}>主虹几何</div><Img src={staticFile('sources/formula-angle.svg')} style={{width:620,height:112,objectFit:'contain',objectPosition:'left'}}/>
        <div style={{fontSize:36,marginTop:28,color:INK}}>两次折射 · 一次内反射</div>
      </div>
      <div style={{position:'absolute',left:1150,top:280,width:425,height:546,transform:`translateX(${(1-s2)*140}px) rotate(7deg)`,boxShadow:'0 24px 44px rgba(30,72,77,.16)',background:'#fff',overflow:'hidden'}}><Img src={staticFile('sources/gettelman-2023-rainbow-optics-page4939.png')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top'}}/></div>
      <div style={{position:'absolute',left:1030,top:280,width:425,height:546,transform:`translateY(${(1-slide)*65}px) rotate(-4deg)`,boxShadow:'0 24px 44px rgba(30,72,77,.19)',background:'#fff',overflow:'hidden'}}><Img src={staticFile('sources/gettelman-2023-title-page.png')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top'}}/></div>
      <div style={{position:'absolute',left:994,top:868,width:644,textAlign:'center',fontSize:36,fontWeight:550,color:INK}}>Gettelman · 2023 · GMD</div>
      <div style={{position:'absolute',left:646,top:986,width:640,textAlign:'center',fontSize:34,color:'#597b7e'}}>几何光学示意</div>
    </div>
  </div>;
}

export function V09RainbowArcFilm({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){
  const frame=useCurrentFrame(),state=stateAt(frame),[p,setP]=useState<Projected>();const onProjection=useCallback((p:Projected|undefined)=>setP(p),[]);
  return <AbsoluteFill style={{background:'#edf3ef',fontFamily:'"RainbowSans","Microsoft YaHei",sans-serif',color:INK,overflow:'hidden'}}>
    <style>{`@font-face{font-family:RainbowSans;src:url('${staticFile('fonts/unified.woff2')}') format('woff2');font-weight:100 900;font-display:block;}`}</style>
    <Stage frame={frame} onProjection={onProjection}/><Reality state={state}/>{!clean&&<><Intro state={state}/><EditorialOverlayV09 state={state} projected={p} realityStrength={realityWindowAt(frame)?.strength??0}/><Coda state={state}/><Brand strength={Math.max(realityWindowAt(frame)?.strength??0,microStrengthV09(frame))}/></>}
    {audio&&<Audio src={staticFile('audio/master-v07.wav')}/>}
  </AbsoluteFill>;
}

