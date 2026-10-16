import React, {useLayoutEffect, useMemo, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, cancelRender, staticFile, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {MetroWorld} from './World';

export type CoverRatio = '16x9'|'4x3'|'3x4'|'9x16';
// These cover-only cameras and materials leave the film's scene unchanged.
const covers = {
  '16x9': {box:[830,300,1040,580], eye:[-7,7,12]},
  '4x3': {box:[750,560,1120,680], eye:[-7,7,12]},
  '3x4': {box:[180,850,1170,740], eye:[-9,9,12]},
  '9x16': {box:[110,890,890,760], eye:[-10,11,11]},
} as const;

function frameBounds(object:T.Object3D,camera:T.Camera,width:number,height:number){
  const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  const point=new T.Vector3();object.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  object.traverse(o=>{
    if(!(o instanceof T.Mesh))return;
    const a=o.geometry.getAttribute('position');
    for(let k=0;k<a.count;k++){
      point.fromBufferAttribute(a,k).applyMatrix4(o.matrixWorld).project(camera);
      const x=(point.x+1)*width/2,y=(1-point.y)*height/2;
      bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);
      bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);
    }
  });return bounds;
}

function silhouetteHull(object:T.Object3D,camera:T.Camera,width:number,height:number){
  const p=new T.Vector3(),points:number[][]=[];
  object.traverse(o=>{if(!(o instanceof T.Mesh))return;const a=o.geometry.getAttribute('position');
    for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(camera);points.push([Math.round((p.x+1)*width/2),Math.round((1-p.y)*height/2)]);}
  });
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const lower:number[][]=[],upper:number[][]=[];
  for(const p of points){while(lower.length>1&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
  for(const p of [...points].reverse()){while(upper.length>1&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}

function Layer({ratio}:{ratio:CoverRatio}){
  const {gl,scene,camera,invalidate}=useThree();
  const {width,height}=useVideoConfig();
  const world=useMemo(()=>new MetroWorld(staticFile('metro/')),[]);
  const [handle]=useState(()=>delayRender('Light metro cover scene'));
  useLayoutEffect(()=>{
    const bg=new T.Color('#f7f4eb');
    scene.background=bg;scene.fog=null;
    gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=.95;gl.outputColorSpace=T.SRGBColorSpace;
    gl.shadowMap.enabled=true;gl.shadowMap.type=T.PCFSoftShadowMap;
    const pm=new T.PMREMGenerator(gl),env=pm.fromScene(new RoomEnvironment(),.035);
    scene.environment=env.texture;scene.environmentIntensity=.65;pm.dispose();
    world.ready.then(()=>{
      world.update({scene:'nose',index:3,progress:.5,elapsed:12,time:90,line:2,lineProgress:.4},new T.PerspectiveCamera());
      for(const g of [world.station,world.screen,world.tunnel,world.pistonGroup,world.balanceGroup,world.distanceGroup,world.forceGroup,world.propsGroup,...world.humans])g.visible=false;
      world.cars.slice(1).forEach(c=>c.visible=false);
      world.white.color.set('#dce7e7');world.white.roughness=.28;world.white.metalness=.22;
      world.teal.color.set('#328e91');world.metal.roughness=.4;
      world.flowGroup.position.set(0,0,0);world.heatGroup.visible=false;
      // The light cover uses the same numerical paths. Only their display
      // thickness and contrast change; no invented vortices or vector arrows.
      world.flowLines.forEach((l,i)=>{
        l.visible=false;
        if(i%2!==0)return;
        const path=world.flowPaths[i];
        const points=path.points.map(([x,z])=>new T.Vector3(x,.94,z));
        const curve=new T.CurvePath<T.Vector3>();
        for(let j=1;j<points.length;j++)curve.add(new T.LineCurve3(points[j-1],points[j]));
        const geom=new T.TubeGeometry(curve,500,.008,5,false);
        const mat=new T.MeshBasicMaterial({color:'#328d94',transparent:true,opacity:i%8===0?.29:.23,depthWrite:false});
        world.flowGroup.add(new T.Mesh(geom,mat));
      });
      world.flowDots.forEach((dot,i)=>{
        dot.visible=i%6===0;if(!dot.visible)return;
        const path=world.flowPaths[dot.userData.pathIndex],targetX=-8+(i*1.719)%18;
        const nearest=path.points.reduce((best,p,j)=>Math.abs(p[0]-targetX)<Math.abs(path.points[best][0]-targetX)?j:best,0);
        world.samplePath(path,path.arrivalTime[nearest],dot.position);
        (dot.material as T.MeshBasicMaterial).color.set('#348b90');dot.scale.setScalar(.65);
        const trail=world.flowTrails[i],a=trail.geometry.getAttribute('position') as T.BufferAttribute;
        for(let j=0;j<a.count;j++){
          const p=new T.Vector3();world.samplePath(path,path.arrivalTime[nearest]-j*.025,p);a.setXYZ(j,p.x,p.y,p.z);
        }a.needsUpdate=true;trail.geometry.computeBoundingSphere();
      });
      world.flowTrails.forEach((l,i)=>{l.visible=i%6===0;(l.material as T.LineBasicMaterial).color.set('#31999c');(l.material as T.LineBasicMaterial).opacity=.6;});
      // All direct root meshes are the rail bed, rails and sleepers. Put
      // them in a pale continuous setting instead of a dark rectangular plate.
      world.root.children.forEach(o=>{
        if(!(o instanceof T.Mesh))return;
        const m=(o.material as T.MeshStandardMaterial).clone();o.material=m;
        const size=new T.Box3().setFromObject(o).getSize(new T.Vector3());
        m.color.set(size.z>1.8?'#dadbd5':size.x<.2?'#a5b5b4':'#7c9498');m.roughness=.62;m.metalness=.12;
      });
      // Faint near-nose pressure tint, derived from the existing cp field and
      // tapered at its edges so the numeric plane has no rectangular border.
      if(world.flow){
        const d=world.flow,cp=d.frames[d.frames.length-1].cp,pixels=new Uint8Array(d.nx*d.nz*4);
        for(let iz=0;iz<d.nz;iz++)for(let ix=0;ix<d.nx;ix++){
          const k=iz*d.nx+ix,v=cp[k]/1.2,c=v>0?[220,151,110]:[48,153,162];
          const edge=Math.min(1,ix/12,(d.nx-1-ix)/12,iz/12,(d.nz-1-iz)/12);
          pixels.set([...c,d.solid[k]?0:Math.round(48*Math.min(1,Math.abs(v))*Math.max(0,edge))],4*k);
        }
        const tex=new T.DataTexture(pixels,d.nx,d.nz,T.RGBAFormat);tex.colorSpace=T.SRGBColorSpace;tex.minFilter=tex.magFilter=T.LinearFilter;tex.needsUpdate=true;
        const plane=new T.Mesh(new T.PlaneGeometry(d.dx*(d.nx-1),d.dz*(d.nz-1)),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:T.DoubleSide}));
        plane.rotation.x=Math.PI/2;plane.position.set(d.x0+d.dx*(d.nx-1)/2,.15,d.z0+d.dz*(d.nz-1)/2);world.root.add(plane);
      }
      const cfg=covers[ratio],cam=camera as T.OrthographicCamera;
      const at=new T.Vector3(0,.6,0);cam.position.set(cfg.eye[0],cfg.eye[1],cfg.eye[2]);cam.lookAt(at);cam.updateProjectionMatrix();
      const b=frameBounds(world.cars[0],cam,width,height);const [x,y,w,h]=cfg.box;
      cam.zoom=Math.min(w/(b.right-b.left),h/(b.bottom-b.top));cam.updateProjectionMatrix();
      const fitted=frameBounds(world.cars[0],cam,width,height);
      const dx=x+w/2-(fitted.left+fitted.right)/2,dy=y+h/2-(fitted.top+fitted.bottom)/2;
      const right=new T.Vector3(1,0,0).applyQuaternion(cam.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(cam.quaternion);
      const shift=right.multiplyScalar(-dx*(cam.right-cam.left)/(width*cam.zoom)).add(up.multiplyScalar(dy*(cam.top-cam.bottom)/(height*cam.zoom)));
      cam.position.add(shift);at.add(shift);cam.lookAt(at);cam.updateMatrixWorld(true);
      const final=frameBounds(world.cars[0],cam,width,height);
      (window as any).__coverAudit={ratio,size:[width,height],trainBounds:final,trainHull:silhouetteHull(world.cars[0],cam,width,height),zoom:cam.zoom,eye:cam.position.toArray(),target:at.toArray(),source:'MetroWorld numerical streamlines; cover display only'};
      console.log('COVER_AUDIT '+JSON.stringify((window as any).__coverAudit));
      gl.render(scene,cam);invalidate();continueRender(handle);
    }).catch(cancelRender);
    return()=>{world.dispose();env.dispose();};
  },[]);
  return <><primitive object={world.root}/>
    <ambientLight intensity={.25}/><hemisphereLight args={[0xf4f5ec,0x728c97,.85]}/>
    <directionalLight position={[-4,9,6]} intensity={3.4} color={0xfff2df} castShadow shadow-mapSize={[4096,4096]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16} shadow-camera-near={.1} shadow-camera-far={60} shadow-normalBias={.035} shadow-bias={-.0003}/>
    <directionalLight position={[7,5,-5]} intensity={1.5} color={0xc4e9ed}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.91,0]} receiveShadow><planeGeometry args={[500,500]}/><meshStandardMaterial color="#f7f4eb" roughness={.92} metalness={0}/></mesh>
  </>;
}

export function MetroCover({ratio='16x9'}:{ratio?:CoverRatio}){
  const {width,height}=useVideoConfig();
  const camera=useMemo(()=>new T.OrthographicCamera(-5*width/height,5*width/height,5,-5,.1,200),[width,height]);
  return <AbsoluteFill style={{background:'#f7f4eb'}}><ThreeCanvas width={width} height={height} camera={camera} gl={{antialias:true,preserveDrawingBuffer:true}}><Layer ratio={ratio}/></ThreeCanvas></AbsoluteFill>;
}
