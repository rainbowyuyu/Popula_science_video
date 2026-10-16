import React,{useLayoutEffect,useRef,useState} from 'react';
import {Composition,registerRoot,delayRender,continueRender,cancelRender} from 'remotion';
import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {IsletDetail} from '../../../src/IsletDetail';
import {ArterioleDetail} from '../../../src/CardioVascularDetail';
import {V5CardioDetail} from '../../../src/V5CardioDetail';

// Cover-only object studies from the film geometry. Each subject has its own
// magnification; this is an editorial montage, never a shared physical scale.
function Study({kind}:{kind:string}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [handle]=useState(()=>delayRender('Same-film mechanism study'));
 useLayoutEffect(()=>{
  const renderer=new T.WebGLRenderer({canvas:canvas.current!,antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setSize(1600,1400);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.86;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(30,1600/1400,.01,100);
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);
  scene.environment=env.texture;
  scene.add(new T.HemisphereLight('#fffdf8','#748783',.65));
  for(const [color,power,pos] of [['#fff4e4',1.7,[-3,5,6]],['#d0ebe7',1.0,[4,2,-2]]] as [string,number,number[]][]){const l=new T.DirectionalLight(color,power);l.position.set(...pos as [number,number,number]);scene.add(l);}
  const frame=new T.Group();scene.add(frame);let subject:T.Object3D;
  if(kind==='glucose'){
   const model=new IsletDetail();model.render(1.8);subject=model.root;
   subject.scale.setScalar(1);subject.rotation.set(-.14,-.22,.15);
  }else if(kind==='pressure'){
   const model=new ArterioleDetail();model.update({time:2.1,activation:1,detail:1,constriction:.40,pressure:.75,pulse:.6});
   subject=model.root;subject.scale.setScalar(1);subject.rotation.set(.18,-.38,.08);
  }else{
   const model=new V5CardioDetail();model.update(2,'lipid',.45);
   subject=model.lipidRoot.getObjectByName('same-lipoprotein-particle')!;
   subject.removeFromParent();subject.position.set(0,0,0);subject.scale.setScalar(1e8);
   subject.rotation.set(.18,.6,-.25);
   // Open the monolayer in the foreground to expose the neutral-lipid cargo.
   const shell=subject.getObjectByName('phospholipid-monolayer') as T.Mesh;
   shell.geometry.dispose();shell.geometry=new T.SphereGeometry(25e-9,64,40,.32,Math.PI*1.48);
   (shell.material as T.MeshStandardMaterial).opacity=.65;
   const core=subject.getObjectByName('neutral-lipid-core') as T.Mesh;
   (core.material as T.MeshStandardMaterial).opacity=.98;
   core.position.set(0,0,6e-9);
   const heads=subject.getObjectByName('surface-phospholipid-heads') as T.InstancedMesh;
   const matrix=new T.Matrix4(),point=new T.Vector3();
   for(let i=0;i<heads.count;i++){heads.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);if(point.z>11e-9&&point.x>0){matrix.scale(new T.Vector3(0,0,0));heads.setMatrixAt(i,matrix);}}
   heads.instanceMatrix.needsUpdate=true;
  }
  frame.add(subject);subject.visible=true;
  subject.traverse(o=>{if(o instanceof T.Mesh){o.visible=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){
   if(kind==='lipid')m.opacity=m.userData.baseAlpha??m.opacity;
   if(m instanceof T.MeshStandardMaterial){m.roughness=.43;m.envMapIntensity=.4;
    if(o.name==='mixed-islet-cell-type-0')m.color.set('#4e9b99');
    if(o.name==='mixed-islet-cell-type-1')m.color.set('#c6a15b');
    if(o.name==='mixed-islet-cell-type-2')m.color.set('#9e829e');
    if(o.name==='neutral-lipid-core')m.color.set('#bd903d');
    if(o.name==='phospholipid-monolayer')m.color.set('#b89c59');
   }
  }}});
  if(kind==='lipid'){
   ((subject.getObjectByName('neutral-lipid-core') as T.Mesh).material as T.Material).opacity=.96;
   ((subject.getObjectByName('phospholipid-monolayer') as T.Mesh).material as T.Material).opacity=.48;
  }
  subject.updateMatrixWorld(true);let box=new T.Box3().setFromObject(subject),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
  subject.position.sub(center);frame.scale.setScalar(3.55/Math.max(size.x,size.y));
  camera.position.set(0,0,9.1);camera.lookAt(0,0,0);renderer.render(scene,camera);continueRender(handle);
  return()=>{renderer.dispose();pmrem.dispose();env.dispose();room.dispose();continueRender(handle);};
 },[kind,handle]);return <canvas ref={canvas}/>;
}
registerRoot(()=> <>{['glucose','pressure','lipid'].map(kind=><Composition key={kind} id={kind} component={Study} defaultProps={{kind}} width={1600} height={1400} fps={30} durationInFrames={1}/>)}</>);
