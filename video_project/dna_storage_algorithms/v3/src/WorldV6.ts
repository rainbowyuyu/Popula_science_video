import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {sampleCamera,STATIONS} from './CameraPathV6';
import {C,ball,ease} from './scene/primitivesV6';
import {gaussianCloud} from './scene/Droplet';
import {makeStations} from './scene/StationsV6';
import {MemoryArchiveV6} from './scene/MemoryArchiveV6';
import {createCinematicStageV6,CinematicStageV6} from './CinematicStageV6';
import {DataHandoffV6} from './scene/DataHandoffV6';
import {createMolecularTunnel} from './scene/MolecularTunnel';

export class WorldV6 {
 private stage:CinematicStageV6;private ribbons:DataHandoffV6[]=[];
 modules=makeStations();private root=new T.Group();private courier=ball(.12,C.gold);private clouds:ReturnType<typeof gaussianCloud>[]=[];private bridgeTexture?:T.Texture;private bridgePortal?:T.Mesh;private tunnel=createMolecularTunnel();
 constructor(private scene:T.Scene,private camera:T.PerspectiveCamera,private renderer:T.WebGLRenderer){
  scene.add(this.root);this.stage=createCinematicStageV6(scene,renderer,{shadows:true,shadowMapSize:2048,exposure:.98});
  this.modules.forEach((m,i)=>{m.position.set(...STATIONS[i].origin);this.root.add(m);});
  for(let i=0;i<8;i++){const cloud=gaussianCloud(550);cloud.position.set(i*20+10,0,-.6);cloud.scale.set(1.9,1.35,1.1);this.clouds.push(cloud);this.root.add(cloud);}
  for(let i=0;i<7;i++){const ribbon=new DataHandoffV6(STATIONS[i+1].start,i*20);this.ribbons.push(ribbon);this.root.add(ribbon);}
  this.root.add(this.courier);
  this.tunnel.group.position.set(10,0,-1);this.root.add(this.tunnel.group);
 }
 async loadAssets(base:(path:string)=>string){
  const loader=new GLTFLoader();const names=['glass_vial','synthesis_nozzle','sequencing_flowcell','lux_vial_holder'];
  const models=await Promise.all(names.map(async name=>({name,gltf:await loader.loadAsync(base(`3d/${name==='synthesis_nozzle'||name==='sequencing_flowcell'?'v6/':''}${name}.glb`))})));
  for(const{name,gltf}of models){for(const module of this.modules){const clone=gltf.scene.clone(true);module.installAsset(name,clone);}}
  const family=await new T.TextureLoader().loadAsync(base('bridges/memory-film-atlas.jpg'));family.colorSpace=T.SRGBColorSpace;this.modules.forEach(module=>{if(module instanceof MemoryArchiveV6)module.setMemoryAtlas(family.clone());});

  this.stage.prepareModels(this.root);
 }
 render(t:number,draw=true){const pose=sampleCamera(t);this.camera.position.set(...pose.position);this.camera.lookAt(...pose.target);this.camera.rotateZ(T.MathUtils.degToRad(pose.rollDeg));this.camera.fov=pose.fov;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);this.stage.update(pose.target);
  this.modules.forEach((m,i)=>{m.visible=t>=STATIONS[i].start-3&&t<=STATIONS[i].end+3;m.update(Math.max(0,t-STATIONS[i].start));});
  // The same gold carrier stays on the guide rail during inter-station flight.
  const cx=pose.target[0];this.courier.position.set(cx+.6,Math.sin(t*.4)*.06-2.43,2);this.courier.scale.setScalar(.65);this.courier.rotation.y=t*.3;
  this.clouds.forEach((cloud,i)=>{cloud.material.uniforms.uTime.value=t;cloud.material.uniforms.uMorph.value=.5+.5*Math.sin(t*.3+i);cloud.material.uniforms.uAlpha.value=.15*Math.exp(-((pose.target[0]-cloud.position.x)**2)/12);});
  if(this.bridgeTexture){const f=Math.min(149,Math.max(0,Math.floor((t-115.5)*30)));this.bridgeTexture.offset.set((f%10)/10,1-(Math.floor(f/10)+1)/15);}
  if(this.bridgePortal)this.bridgePortal.position.x=82-5*ease((t-115)/3)-18*ease((t-121)/3);
  this.tunnel.update(t-15);this.tunnel.group.position.y=12*(1-ease((t-13)/2))+12*ease((t-22)/2);this.ribbons.forEach(r=>r.update(t));
  // R3F advances once after the frame's layout updates. Draw explicitly only
  // for asynchronous asset completion, which can occur after that advance.
  if(draw)this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.stage.dispose();this.tunnel.dispose();this.scene.remove(this.root);this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points||o instanceof T.Sprite){o.geometry?.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});}
}
