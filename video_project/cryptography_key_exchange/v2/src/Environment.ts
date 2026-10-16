import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Original Blender night-city environment. Camera and hero envelope are external. */
export class Environment{
  root=new THREE.Group();
  private templates=new Map<string,THREE.Object3D>();
  private gltf:THREE.Group|null=null;
  private lamps:THREE.PointLight[]=[];
  private motes:THREE.Points;
  private originalPositions:Float32Array;
  private disposed=false;
  constructor(){
    this.root.name='midnight-city-environment';
    this.root.userData.anchors={postBox:[-5,0,0],postSlot:[-5,1.88,.45],heroWindow:[7,8,-10],deliveryDoor:[7,0,-10]};
    this.root.userData.units='metres';
    const ambient=new THREE.HemisphereLight('#5477e8','#061020',.38);ambient.name='city-blue-ambient';this.root.add(ambient);
    const moon=new THREE.DirectionalLight('#86a4ff',1.3);moon.position.set(-8,20,8);moon.target.position.set(2,2,-8);moon.name='city-moon-key';this.root.add(moon,moon.target);
    const front=new THREE.DirectionalLight('#95bcff',.48);front.position.set(3,6,18);front.target.position.set(-5,1,0);this.root.add(front,front.target);
    const halo=new THREE.PointLight('#ffd09a',110,24,2);halo.position.set(7,8,-8.5);halo.name='hero-window-warm-spill';this.root.add(halo);
    const postLight=new THREE.PointLight('#ffb079',54,10,2);postLight.position.set(-5,4.3,2);postLight.name='postbox-soft-warm-spill';this.root.add(postLight);
    for(const[x,z]of[[-7,3],[3.9,-5],[-3.9,-15],[3.9,15]]){
      const light=new THREE.PointLight('#ffcf85',18,9,2);light.position.set(x,4.2,z);light.name='street-lantern-fill';this.root.add(light);this.lamps.push(light);
    }
    const count=150,positions=new Float32Array(count*3);let seed=0x2917ab;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<count;i++){positions[i*3]=-3+random()*6;positions[i*3+1]=.4+random()*11;positions[i*3+2]=-20+random()*41;}
    this.originalPositions=positions.slice();
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    this.motes=new THREE.Points(geo,new THREE.PointsMaterial({color:'#c9d7ee',size:.024,transparent:true,opacity:.24,depthWrite:false,sizeAttenuation:true}));
    this.motes.name='sparse-atmospheric-dust';this.root.add(this.motes);
  }
  async load(url:string):Promise<void>{
    if(this.disposed)throw new Error('Cannot load a disposed environment');
    const gltf=await new GLTFLoader().loadAsync(url);
    const backdropNames=['City','PostBox','WindowFrame','DeliveryDoor'];
    const libraryNames=['Envelope','CipherWheel','Certificate'];
    for(const name of [...backdropNames,...libraryNames]){
      const object=gltf.scene.getObjectByName(name);
      if(!object)throw new Error(`Night city GLB missing required object: ${name}`);
      this.templates.set(name,object);
    }
    gltf.scene.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      object.castShadow=materials.every(m=>!m.transparent&&m.opacity>.99);
      object.receiveShadow=true;
      for(const material of materials){const m=material as THREE.MeshStandardMaterial;if(m.isMeshStandardMaterial)m.envMapIntensity=.38;}
    });
    for(const name of libraryNames)this.templates.get(name)!.visible=false;
    this.gltf=gltf.scene;this.gltf.name='original-blender-midnight-city';this.root.add(this.gltf);
    this.root.userData.assetUrl=url;
    this.root.userData.loadedBackdrop=backdropNames;
    this.root.userData.libraryProps=libraryNames;
    this.root.updateMatrixWorld(true);
  }
  /** Caller may clone the hero envelope, mechanical wheel, or certificate. */
  cloneAsset(name:string):THREE.Object3D{
    const source=this.templates.get(name);if(!source)throw new Error(`Unloaded night-city asset: ${name}`);
    const object=source.clone(true);object.position.set(0,0,0);object.quaternion.identity();object.visible=true;
    object.traverse(o=>{if(o instanceof THREE.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
    return object;
  }
  update(t:number):void{
    const position=this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for(let i=0;i<position.count;i++){
      position.setXYZ(i,this.originalPositions[i*3]+.07*Math.sin(t*.21+i*2.37),this.originalPositions[i*3+1]+.05*Math.sin(t*.17+i*.77),this.originalPositions[i*3+2]+.08*Math.sin(t*.15+i*.93));
    }
    position.needsUpdate=true;
    // Almost imperceptible electrical warmth, not conspicuous random flicker.
    this.lamps.forEach((lamp,i)=>lamp.intensity=18*(1+.007*Math.sin(t*.62+i*1.13)));
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    this.root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.root.removeFromParent();this.root.clear();this.templates.clear();this.gltf=null;
  }
}
