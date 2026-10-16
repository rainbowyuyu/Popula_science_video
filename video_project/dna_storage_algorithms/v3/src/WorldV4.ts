import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {sampleCamera,STATIONS} from './CameraPathV4';
import {C,ball,box,ease,line,mat,v} from './scene/primitives';
import {gaussianCloud} from './scene/Droplet';
import {makeStations,HeroLab} from './scene/StationsV4';
import {createMolecularTunnel} from './scene/MolecularTunnel';

export class WorldV4 {
 modules=makeStations();private root=new T.Group();private courier=ball(.12,C.gold);private clouds:ReturnType<typeof gaussianCloud>[]=[];private environment:T.Texture;private bridgeTexture?:T.Texture;private bridgePortal?:T.Mesh;private tunnel=createMolecularTunnel();
 constructor(private scene:T.Scene,private camera:T.PerspectiveCamera,private renderer:T.WebGLRenderer){
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
  scene.background=new T.Color('#edf1ea');scene.fog=new T.Fog('#edf1ea',29,63);
  const pmrem=new T.PMREMGenerator(renderer);const room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04).texture;scene.environment=this.environment;pmrem.dispose();room.dispose();
  scene.add(this.root);this.root.add(new T.HemisphereLight(0xf4fff9,0x72918d,1.25));const key=new T.DirectionalLight(0xfff2d5,2.1);key.position.set(-8,16,13);this.root.add(key);const fill=new T.DirectionalLight(0xc1eaf2,1.0);fill.position.set(3,4,-12);this.root.add(fill);
  this.modules.forEach((m,i)=>{m.position.set(...STATIONS[i].origin);this.root.add(m);});
  const floor=new T.Mesh(new T.PlaneGeometry(220,55),mat(0xe6ece5,.54,.06));floor.rotation.x=-Math.PI/2;floor.position.set(80,-2.77,-7);this.root.add(floor);
  // Continuous architecture lives behind the exhibits, never across their faces.
  for(let i=0;i<10;i++){const pillar=box(.22,12,.32,0xdce5de);pillar.position.set(i*20-8,2.5,-7);this.root.add(pillar);const lamp=box(14,.05,.14,0xffffff,.01);lamp.position.set(i*20,6,-5);(lamp.material as T.MeshStandardMaterial).emissive.set(0xffffff);this.root.add(lamp);}
  this.root.add(line([[-10,-2.42,2],[20,-2.42,2],[60,-2.42,2],[100,-2.42,2],[180,-2.42,2]],0x7ebeb1,.018));
  for(let i=0;i<8;i++){const cloud=gaussianCloud(550);cloud.position.set(i*20+10,0,-.6);cloud.scale.set(2.2,1,.7);this.clouds.push(cloud);this.root.add(cloud);}
  this.root.add(this.courier);
  this.tunnel.group.position.set(10,0,-1);this.root.add(this.tunnel.group);
 }
 async loadAssets(base:(path:string)=>string){
  const loader=new GLTFLoader();const names=['phone_landscape','portable_drive','glass_vial','synthesis_nozzle','sequencing_flowcell','lux_vial_holder'];
  const models=await Promise.all(names.map(async name=>({name,gltf:await loader.loadAsync(base(`3d/${name}.glb`))})));
  for(const{name,gltf}of models){for(const module of this.modules){const clone=gltf.scene.clone(true);module.installAsset(name,clone);}}
  const family=await new T.TextureLoader().loadAsync(base('bridges/family-memory.png'));family.colorSpace=T.SRGBColorSpace;this.modules.forEach(module=>{if(module instanceof HeroLab)module.setFamilyTexture(family.clone());});
  this.bridgeTexture=await new T.TextureLoader().loadAsync(base('bridges/wan-atlas.jpg'));this.bridgeTexture.colorSpace=T.SRGBColorSpace;this.bridgeTexture.repeat.set(.1,1/15);this.bridgeTexture.minFilter=T.LinearFilter;this.bridgeTexture.magFilter=T.LinearFilter;this.bridgeTexture.generateMipmaps=false;
  const alphaCanvas=document.createElement('canvas');alphaCanvas.width=256;alphaCanvas.height=256;const alphaCtx=alphaCanvas.getContext('2d')!;const alphaImage=alphaCtx.createImageData(256,256);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const edge=Math.min(x,255-x,y,255-y);const a=Math.max(0,Math.min(255,Math.round(edge*18)));const k=(y*256+x)*4;alphaImage.data[k]=a;alphaImage.data[k+1]=a;alphaImage.data[k+2]=a;alphaImage.data[k+3]=255;}alphaCtx.putImageData(alphaImage,0,0);const alphaMap=new T.CanvasTexture(alphaCanvas);const portalMaterial=new T.MeshBasicMaterial({map:this.bridgeTexture,alphaMap,transparent:true,opacity:.86,depthWrite:false});const portal=new T.Mesh(new T.PlaneGeometry(7.2,4.05),portalMaterial);portal.position.set(78,.55,-.4);this.root.add(portal);this.bridgePortal=portal;
 }
 render(t:number,draw=true){const pose=sampleCamera(t);this.camera.position.set(...pose.position);this.camera.lookAt(...pose.target);this.camera.rotateZ(T.MathUtils.degToRad(pose.rollDeg));this.camera.fov=pose.fov;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
  this.modules.forEach((m,i)=>m.update(Math.max(0,t-STATIONS[i].start)));
  // The same gold carrier stays on the guide rail during inter-station flight.
  const cx=pose.target[0];this.courier.position.set(cx+.6,Math.sin(t*.4)*.06-2.43,2);this.courier.rotation.y=t*.3;
  this.clouds.forEach((cloud,i)=>{cloud.material.uniforms.uTime.value=t;cloud.material.uniforms.uMorph.value=.5+.5*Math.sin(t*.3+i);cloud.material.uniforms.uAlpha.value=.9*Math.exp(-((pose.target[0]-cloud.position.x)**2)/16);});
  if(this.bridgeTexture){const f=Math.min(149,Math.max(0,Math.floor((t-115.5)*30)));this.bridgeTexture.offset.set((f%10)/10,1-(Math.floor(f/10)+1)/15);}
  if(this.bridgePortal)this.bridgePortal.position.x=82-5*ease((t-115)/3)-18*ease((t-121)/3);
  this.tunnel.update(t-15);
  // R3F advances once after the frame's layout updates. Draw explicitly only
  // for asynchronous asset completion, which can occur after that advance.
  if(draw)this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.tunnel.dispose();this.scene.remove(this.root);this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points||o instanceof T.Sprite){o.geometry?.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});this.environment.dispose();}
}
