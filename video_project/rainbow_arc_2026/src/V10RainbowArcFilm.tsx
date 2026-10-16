import React,{useCallback,useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CinematicLensV09} from './CinematicLensV09';
import {FishObserverV10} from './FishObserverV10';
import {HDRLoader} from 'three/examples/jsm/loaders/HDRLoader.js';
import {timeline,stateAt,FrameState,ease,clamp} from './Timeline';
import {WorldV10,HERO,sceneP,Anchor} from './WorldV10';
import {GaussianSplatV07} from './GaussianSplatV07';
import {sampleFilmCamera} from './CinematicRouteV10';
import {loadWaterProV09,WaterPoolV09} from './WaterProV09';
import {EditorialOverlayV10,microStrengthV10} from './EditorialOverlayV10';
import {createMacroStudioV09} from './MacroLookV09';
import {RealityBridgeV10,realityWindowAt} from './RealityBridgeV10';
import {SPECTRUM} from './optics';

const INK='#203d45';
type Projected={x:number;y:number;text:string;color:string;visible:boolean};
type Guide={points:{x:number;y:number}[];colour:string;opacity:number};
type Rig={renderer:T.WebGLRenderer;scene:T.Scene;camera:T.PerspectiveCamera;world:WorldV10;hdri?:T.WebGLRenderTarget;landscape?:T.Texture;macroStudio?:T.WebGLRenderTarget;lens?:CinematicLensV09;splat?:GaussianSplatV07;actors?:FishObserverV10;water?:WaterPoolV09};
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

function Stage({frame,onProjection,onGuides,plate=false}:{frame:number;onProjection:(p:Projected|undefined)=>void;onGuides:(g:Guide[])=>void;plate?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null),rig=useRef<Rig|null>(null),[handle]=useState(()=>delayRender('V10 rainbow fish cinematic optical world assets')),[ready,setReady]=useState(false);
  const draw=useCallback(()=>{
    const r=rig.current;if(!r)return;const s=stateAt(frame);r.world.update(s);r.actors?.update(frame);applyCamera(r.camera,s);
    const drop=timeline.scenes.find(s=>s.id==='drop')!;const cloudIn=ease((frame-drop.start-8)/28),cloudOut=1-ease((frame-drop.start-45)/40);
    const projection=(point:T.Vector3)=>{const p=point.clone().project(r.camera);return {x:(p.x*.5+.5)*1920,y:(.5-p.y*.5)*1080};};
    const guides:Guide[]=[];
    const visiblePath=(points:T.Vector3[],portion:number)=>{const count=points.length-1;const out=[points[0]];for(let i=0;i<count;i++){const q=clamp(portion*count-i);if(q<=0)break;out.push(points[i].clone().lerp(points[i+1],q));}return out;};
    if(s.scene==='drop'){
      const worldPoints=r.world.primary[0].points.map(p=>p.clone().add(HERO));
      guides.push({points:visiblePath(worldPoints,.25+s.progress*.24).map(projection),colour:'#fff1d7',opacity:microStrengthV10(frame)});
    }
    if(s.scene==='return'){
      const experiment=timeline.clips.find(c=>c.id==='r039')!;
      const q=ease((frame-experiment.start)/75);
      guides.push({points:visiblePath(r.world.sprayLight.points,q).map(projection),colour:'#ec9d6c',opacity:q*.70});
      const positions=r.world.sprayRainbow.geometry.getAttribute('position') as T.BufferAttribute;
      const bow=ease((frame-s.sceneStart-30)/90);
      for(let band=0;band<7;band++){
        const row=band*4,points:{x:number;y:number}[]=[];
        for(let i=0;i<=64;i++)points.push(projection(new T.Vector3().fromBufferAttribute(positions,row*65+i).applyMatrix4(r.world.sprayRainbow.matrixWorld)));
        guides.push({points,colour:SPECTRUM[band].color,opacity:bow*.54});
      }
    }
    onGuides(guides);
    if(plate){
      for(const node of [r.world.energy.group,r.world.rays,r.world.transmitted.group,r.world.angle,r.world.eyeRay,r.world.coneRig,r.world.axisSunCue,r.world.friendRay,r.world.sprayLight.group,r.world.spraySunCue,r.world.glassRay.group,r.world.glassRayGuide.group,r.world.glassVirtual])node.visible=false;
    }
    r.splat?.update(r.camera,cloudIn*cloudOut*.018,ease((frame-drop.start-24)/50));r.water?.update(frame);r.lens?.render(frame,microStrengthV10(frame),new T.Vector3(...sampleFilmCamera(frame).target));
    const anchor=r.world.anchor;if(!anchor){onProjection(undefined);return;}const p=anchor.point.clone().project(r.camera);onProjection({x:(p.x*.5+.5)*1920,y:(.5-p.y*.5)*1080,text:anchor.text,color:anchor.color??INK,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1.15&&Math.abs(p.y)<1.15});
  },[frame,onProjection,onGuides,plate]);
  useLayoutEffect(()=>{let alive=true;try{
    const renderer=new T.WebGLRenderer({canvas:canvas.current!,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setSize(1920,1080,false);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.93;
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1920/1080,.03,400),world=new WorldV10(renderer,scene);rig.current={renderer,scene,camera,world,lens:new CinematicLensV09(renderer,scene,camera)};
    const studio=createMacroStudioV09(renderer);rig.current.macroStudio=studio;world.macroLook.waterMaterial.envMap=studio.texture;
    Promise.all([
      new GLTFLoader().loadAsync(staticFile('assets_v09/environment/rain_after_terrace_v09.glb')).then(g=>{if(alive)world.cinema?.attachAsset(g.scene);}),
      new GLTFLoader().loadAsync(staticFile('assets_v08/macro/macro_leaf_v08.glb')).then(g=>{if(alive)world.macroLook.attachContext(g.scene);}),
      new HDRLoader().loadAsync(staticFile('assets_v08/environment/hilly_terrain_01_2k.hdr')).then(texture=>{if(!alive){texture.dispose();return;}texture.mapping=T.EquirectangularReflectionMapping;const pmrem=new T.PMREMGenerator(renderer);const map=pmrem.fromEquirectangular(texture);rig.current!.hdri=map;rig.current!.landscape=texture;world.cinema?.attachLandscape(texture,-.88);scene.environment=map.texture;scene.environmentIntensity=.62;pmrem.dispose();}),
      loadWaterProV09().then(compat=>{if(alive)rig.current!.water=new WaterPoolV09(compat,world,renderer,scene,camera);}),
      fetch(staticFile('assets_v06/lux3d/splats-v06.json')).then(r=>r.json()).then(data=>{if(!alive)return;const splat=new GaussianSplatV07(data.rows);splat.position.copy(HERO);rig.current!.splat=splat;scene.add(splat);}),
      new GLTFLoader().loadAsync(staticFile('assets_v10/characters/rainbow_fish.glb')).then(g=>{if(!alive)return;const actors=new FishObserverV10(g.scene,g.animations);actors.attach(world);rig.current!.actors=actors;}),
      new GLTFLoader().loadAsync(staticFile('assets_v08/macro/spherical_raindrop_v08.glb')).then(g=>{if(!alive)return;let mesh:T.Mesh|undefined;g.scene.traverse(o=>{if((o as T.Mesh).isMesh)mesh=o as T.Mesh;});if(mesh){world.drop.geometry.dispose();world.drop.geometry=mesh.geometry.clone();world.drop.scale.setScalar(1.6);}})
    ]).then(()=>{if(alive){setReady(true);continueRender(handle);}}).catch(e=>{if(alive)cancelRender(e);});
  }catch(e){cancelRender(e);}return()=>{alive=false;if(rig.current){rig.current.actors?.dispose();rig.current.lens?.dispose();rig.current.splat?.dispose();rig.current.water?.dispose();rig.current.world.dispose();rig.current.hdri?.dispose();rig.current.landscape?.dispose();rig.current.macroStudio?.dispose();rig.current.renderer.dispose();rig.current.renderer.forceContextLoss();}rig.current=null;};},[handle]);
  useLayoutEffect(()=>draw(),[draw,ready]);
  return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}

function Brand({strength=0}:{strength?:number}){return <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,zIndex:60,pointerEvents:'none'}}><div style={{position:'absolute',inset:'-10px -18px',borderRadius:18,background:'rgba(245,249,243,.92)',opacity:strength,zIndex:-1}}/><Img src={staticFile('brand/logo.png')} style={{width:76.17,height:90,objectFit:'contain'}}/><span style={{fontSize:44,fontWeight:650,color:INK}}>rainbow鱼</span></div>;}

function Intro({state}:{state:FrameState}){
  if(state.frame>220)return null;const enter=ease((state.frame-10)/30),leave=ease((state.frame-104)/60);
  const real=realityWindowAt(state.frame)?.strength??0;
  return <div style={{position:'absolute',left:640+leave*1460,top:440-leave*70,width:640,zIndex:15,transform:`translateY(${(1-enter)*25}px)`,opacity:enter}}>
    <div style={{color:'#fffaf0',fontSize:88,fontWeight:760,lineHeight:1.14,textAlign:'center',letterSpacing:-2,textShadow:'0 3px 8px rgba(10,32,30,.76),0 5px 35px rgba(10,42,39,.42)'}}>彩虹为什么<br/>是弧形？</div>
  </div>;
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

export function V10RainbowArcFilm({audio=true,clean=false,plate=false}:{audio?:boolean;clean?:boolean;plate?:boolean}){
  const frame=useCurrentFrame(),state=stateAt(frame),[p,setP]=useState<Projected>(),[guides,setGuides]=useState<Guide[]>([]);const onProjection=useCallback((p:Projected|undefined)=>setP(p),[]);const onGuides=useCallback((g:Guide[])=>setGuides(g),[]);
  const real=realityWindowAt(frame)?.strength??0;
  return <AbsoluteFill style={{background:'#edf3ef',fontFamily:'"RainbowSans","Microsoft YaHei",sans-serif',color:INK,overflow:'hidden'}}>
    <style>{`@font-face{font-family:RainbowSans;src:url('${staticFile('fonts/unified.woff2')}') format('woff2');font-weight:100 900;font-display:block;}`}</style>
    <Stage frame={frame} onProjection={onProjection} onGuides={onGuides} plate={plate}/>{!clean&&<><RealityBridgeV10 frame={frame}/>{real>0&&<svg width={1920} height={1080} style={{position:'absolute',inset:0,zIndex:3,pointerEvents:'none',opacity:real}}>{guides.map((g,i)=><polyline key={i} points={g.points.map(p=>`${p.x},${p.y}`).join(' ')} stroke={g.colour} strokeOpacity={g.opacity} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" style={{filter:'drop-shadow(0 0 5px rgba(255,244,209,.25))'}}/>)}</svg>}<Intro state={state}/><EditorialOverlayV10 state={state} projected={p} realityStrength={real}/><Coda state={state}/><Brand strength={Math.max(real,microStrengthV10(frame))}/></>}
    {audio&&<Audio src={staticFile('audio_v10/master-v10.wav')}/>}
  </AbsoluteFill>;
}

