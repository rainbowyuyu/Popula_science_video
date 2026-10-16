import React,{useCallback,useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CinematicLensV15} from './CinematicLensV15';
import {CupDetailV15} from './CupDetailV15';
import {FishObserverV16} from './FishObserverV16';
import {HDRLoader} from 'three/examples/jsm/loaders/HDRLoader.js';
import {timeline,stateAt,FrameState,ease,clamp} from './Timeline';
import {WorldV10,HERO,sceneP,Anchor} from './WorldV10';
import {GaussianDropletV15} from './GaussianDropletV15';
import {GaussianSceneV16} from './GaussianSceneV16';
import {sampleFilmCamera} from './CinematicRouteV10';
import {loadWaterProV09,WaterPoolV16} from './WaterPoolV16';
import {EditorialOverlayV11} from './EditorialOverlayV11';
import {microStrengthV10} from './EditorialOverlayV10';
import {createMacroStudioV15 as createMacroStudioV09} from './MacroLookV15';
import {RealityBridgeV11,realityWindowAtV11} from './RealityBridgeV11';
import {SPECTRUM} from './optics';
import {IntroV15,CodaV15} from './TitlesV15';
import {SunlightV16} from './SunlightV16';


const INK='#203d45';
type Projected={x:number;y:number;text:string;color:string;visible:boolean};
type Guide={points:{x:number;y:number}[];colour:string;opacity:number};
type Rig={renderer:T.WebGLRenderer;scene:T.Scene;camera:T.PerspectiveCamera;world:WorldV10;hdri?:T.WebGLRenderTarget;landscape?:T.Texture;macroStudio?:T.WebGLRenderTarget;lens?:CinematicLensV15;splat?:GaussianDropletV15;gardenSplats?:GaussianSceneV16;actors?:FishObserverV16;cupDetail?:CupDetailV15;sunlight?:SunlightV16;water?:WaterPoolV16};
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
  const sample=sampleFilmCamera(state.frame);
  camera.position.set(...sample.position);
  camera.quaternion.copy(sample.quaternion);
  // A barely perceptible, frame-deterministic bank keeps the long rail alive
  // between optical beats. It is kept below 0.35° so labels and horizon stay
  // stable while the viewer still feels a continuous aerial camera.
  const t=state.frame/30;
  const bank=(0.0028*Math.sin(t*.17)+0.0014*Math.sin(t*.053+1.2));
  camera.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),bank));
  camera.fov=sample.fov;
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}

function Stage({frame,onProjection,onGuides,plate=false}:{frame:number;onProjection:(p:Projected|undefined)=>void;onGuides:(g:Guide[])=>void;plate?:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null),rig=useRef<Rig|null>(null),[handle]=useState(()=>delayRender('V16 complete garden, dense Gaussian and rigged round fish')),[ready,setReady]=useState(false);
  const draw=useCallback(()=>{
    const r=rig.current;if(!r)return;const s=stateAt(frame);r.world.update(s);applyCamera(r.camera,s);r.actors?.update(frame,r.camera);r.sunlight?.setSolarDirection(r.world.getSolarDirection());r.water?.setSolarDirection(r.world.getSolarDirection());r.sunlight?.update(frame,r.camera,1-microStrengthV10(frame));
    const drop=timeline.scenes.find(s=>s.id==='drop')!;const cloudIn=ease((frame-drop.start-8)/28),cloudOut=1-ease((frame-drop.start-36)/24);
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
      for(const node of [...r.world.finiteBeam.flatMap(b=>[b.energy.group,b.spectrum.group]),r.world.macroLook.spectrum.group,r.world.contact.group,r.world.spectrumDetail.group,r.world.energy.group,r.world.rays,r.world.transmitted.group,r.world.angle,r.world.eyeRay,r.world.coneRig,r.world.axisSunCue,r.world.friendRay,r.world.sprayLight.group,r.world.spraySunCue,r.world.glassRay.group,r.world.glassRayGuide.group,r.world.glassVirtual])node.visible=false;
    }
    const gs=ease((frame-410)/40)*(1-ease((frame-732)/66));
    r.gardenSplats?.update(r.camera,frame,{opacity:gs>1e-7?.84:0,scatter:.024*Math.sin(Math.PI*clamp((frame-450)/310))**2,focus:[-3.5,1.1,1],radius:13,pointScale:.98,focusDistance:13,aperturePixels:.15});
    const dropSplat=ease((frame-940)/55)*(1-ease((frame-1040)/65));
    r.splat?.update(r.camera,dropSplat*.76,ease((frame-925)/140));
    const prepareMesh=()=>{r.world.cinema?.setSurfaceVisibility(1);if(r.gardenSplats)r.gardenSplats.visible=false;r.water?.update(frame,'mesh');};
    const prepareSplat=()=>{r.world.cinema?.setGaussianSupportVisibility();if(r.gardenSplats)r.gardenSplats.visible=true;r.water?.update(frame,'gaussian');};
    r.lens?.renderGardenHandoff(frame,microStrengthV10(frame),new T.Vector3(...sampleFilmCamera(frame).target),gs,{mesh:prepareMesh,splat:prepareSplat});
    const anchor=r.world.anchor;if(!anchor){onProjection(undefined);return;}const p=anchor.point.clone().project(r.camera);onProjection({x:(p.x*.5+.5)*1920,y:(.5-p.y*.5)*1080,text:anchor.text,color:anchor.color??INK,visible:p.z>-1&&p.z<1&&Math.abs(p.x)<1.15&&Math.abs(p.y)<1.15});
  },[frame,onProjection,onGuides,plate]);
  useLayoutEffect(()=>{let alive=true;try{
    const renderer=new T.WebGLRenderer({canvas:canvas.current!,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setSize(1920,1080,false);renderer.setPixelRatio(1);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.93;
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1920/1080,.03,400),world=new WorldV10(renderer,scene);rig.current={renderer,scene,camera,world,lens:new CinematicLensV15(renderer,scene,camera),sunlight:new SunlightV16(scene)};
    const studio=createMacroStudioV09(renderer);rig.current.macroStudio=studio;world.macroLook.waterMaterial.envMap=studio.texture;rig.current.cupDetail=new CupDetailV15(world.glass,studio.texture);
    Promise.all([
      // V19 keeps the same coordinate system and camera handoff, but adds the
      // reviewed grass tufts, animated rain lighting and the denser hand-painted
      // garden surface. V18 remains the rollback asset in its own directory.
      new GLTFLoader().loadAsync(staticFile('assets_v19/environment/rain_garden_v19.glb')).then(g=>{if(alive)world.cinema?.attachAsset(g.scene);}),
      GaussianSceneV16.load(staticFile('assets_v19/gaussian/rain-garden-v19.splats.bin'),staticFile('assets_v19/gaussian/rain-garden-v19.splats.json')).then(g=>{if(alive){rig.current!.gardenSplats=g;scene.add(g);}else g.dispose();}),
      new GLTFLoader().loadAsync(staticFile('assets_v08/macro/macro_leaf_v08.glb')).then(g=>{if(alive)world.macroLook.attachContext(g.scene);}),
      new HDRLoader().loadAsync(staticFile('assets_v08/environment/hilly_terrain_01_2k.hdr')).then(texture=>{if(!alive){texture.dispose();return;}texture.mapping=T.EquirectangularReflectionMapping;const pmrem=new T.PMREMGenerator(renderer);const map=pmrem.fromEquirectangular(texture);rig.current!.hdri=map;rig.current!.landscape=texture;world.cinema?.attachLandscape(texture,-.88);scene.environment=map.texture;scene.environmentIntensity=.62;pmrem.dispose();}),
      loadWaterProV09().then(compat=>{if(alive)rig.current!.water=new WaterPoolV16(compat,world,renderer,scene,camera);}),
      fetch(staticFile('assets_v06/lux3d/splats-v06.json')).then(r=>r.json()).then(data=>{if(!alive)return;const splat=new GaussianDropletV15(data.rows);splat.position.copy(HERO);rig.current!.splat=splat;scene.add(splat);}),
      new GLTFLoader().loadAsync(staticFile('assets_v19/characters/rainbow_fish_v19.glb')).then(g=>{if(!alive)return;const actors=new FishObserverV16(g.scene,g.animations);actors.attach(world);rig.current!.actors=actors;}),
      new GLTFLoader().loadAsync(staticFile('assets_v08/macro/spherical_raindrop_v08.glb')).then(g=>{if(!alive)return;let mesh:T.Mesh|undefined;g.scene.traverse(o=>{if((o as T.Mesh).isMesh)mesh=o as T.Mesh;});if(mesh){world.drop.geometry.dispose();world.drop.geometry=mesh.geometry.clone();world.drop.scale.setScalar(1.6);}})
    ]).then(()=>{if(alive){setReady(true);continueRender(handle);}}).catch(e=>{if(alive)cancelRender(e);});
  }catch(e){cancelRender(e);}return()=>{alive=false;if(rig.current){rig.current.sunlight?.dispose();rig.current.cupDetail?.dispose();rig.current.actors?.dispose();rig.current.lens?.dispose();rig.current.splat?.dispose();rig.current.gardenSplats?.dispose();rig.current.water?.dispose();rig.current.world.dispose();rig.current.hdri?.dispose();rig.current.landscape?.dispose();rig.current.macroStudio?.dispose();rig.current.renderer.dispose();rig.current.renderer.forceContextLoss();}rig.current=null;};},[handle]);
  useLayoutEffect(()=>draw(),[draw,ready]);
  return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}

function Brand({strength=0}:{strength?:number}){
  const ink=[32,61,69],paper=[249,249,241],colour=`rgb(${ink.map((v,i)=>Math.round(v+(paper[i]-v)*strength)).join(',')})`;
  return <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,zIndex:60,pointerEvents:'none'}}>
    <div style={{position:'relative',width:76.17,height:90}}>
      <Img src={staticFile('brand/logo.png')} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',opacity:1-strength}}/>
      <Img src={staticFile('assets_v15/brand/logo-light.png')} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',opacity:strength}}/>
    </div><span style={{fontSize:44,fontWeight:650,color:colour,textShadow:strength>.5?'0 2px 8px rgba(3,18,20,.45)':'0 1px 5px rgba(250,248,235,.3)'}}>rainbow鱼</span>
  </div>;
}

export function V11RainbowArcFilm({audio=true,clean=false,plate=false}:{audio?:boolean;clean?:boolean;plate?:boolean}){
  const frame=useCurrentFrame(),state=stateAt(frame),[p,setP]=useState<Projected>(),[guides,setGuides]=useState<Guide[]>([]);const onProjection=useCallback((p:Projected|undefined)=>setP(p),[]);const onGuides=useCallback((g:Guide[])=>setGuides(g),[]);
  const window=realityWindowAtV11(frame),real=window?.strength??0;
  const matchedPlate=window?.bridge.transition.kind==='matched'&&real>.999;
  const renderWorld=clean||(!matchedPlate&&!(state.scene==='references'&&frame-state.sceneStart>=24));
  return <AbsoluteFill style={{background:'#edf3ef',fontFamily:'"RainbowSans","Microsoft YaHei",sans-serif',color:INK,overflow:'hidden'}}>
    <style>{`@font-face{font-family:RainbowSans;src:url('${staticFile('fonts/unified.woff2')}') format('woff2');font-weight:100 900;font-display:block;}`}</style>
    {renderWorld&&<Stage frame={frame} onProjection={onProjection} onGuides={onGuides} plate={plate}/>} {!clean&&<><RealityBridgeV11 frame={frame}/>{real>0&&!matchedPlate&&<svg width={1920} height={1080} style={{position:'absolute',inset:0,zIndex:3,pointerEvents:'none',opacity:real}}>{guides.map((g,i)=><polyline key={i} points={g.points.map(p=>`${p.x},${p.y}`).join(' ')} stroke={g.colour} strokeOpacity={g.opacity} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" style={{filter:'drop-shadow(0 0 5px rgba(255,244,209,.25))'}}/>)}</svg>}<IntroV15 state={state}/><EditorialOverlayV11 state={state} projected={p} realityStrength={real}/><CodaV15 state={state}/><Brand strength={Math.max(ease((frame-86)/50)*(1-ease((frame-400)/50)),microStrengthV10(frame))}/></>}
    {audio&&<Audio src={staticFile('audio_v18/master-v18.wav')}/>}
  </AbsoluteFill>;
}

