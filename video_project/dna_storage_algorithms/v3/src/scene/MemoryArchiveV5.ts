import * as T from 'three';
import {C,ball,box,ease,helix,lerp,mat,ring,word} from './primitives';
import {makeDroplet} from './Droplet';

/** The photo is a teaching prop, not claimed to be footage from a DNA lab.
 * Every tile has a stable UV, home position and path; random access is pure. */
export class MemoryArchiveV5 extends T.Group {
 readonly stationId:string; readonly assets=new T.Group();
 private phone=new T.Group();private picture=new T.Group();
 private tiles:T.Mesh[]=[];private homes:T.Vector3[]=[];
 private drop=makeDroplet(1.28);private molecule=helix(22,2.6,.38);
 private pixels:T.Mesh[]=[];private disk=new T.Group();
 private orbits:T.Mesh[]=[];private filmAtlas?:T.Texture;
 constructor(private ending=false){
  super();this.stationId=ending?'return':'hook';this.name=this.stationId;
  this.add(this.assets);
  const frame=box(6.15,3.64,.23,0x18272f,.2);
  (frame.material as T.MeshStandardMaterial).roughness=.2;
  (frame.material as T.MeshStandardMaterial).metalness=.72;
  this.phone.add(frame);
  const dark=box(5.91,3.4,.035,0x061922,.09);dark.position.z=.128;this.phone.add(dark);
  this.phone.add(this.picture);this.phone.position.set(-2,.1,.25);
  const nx=18,ny=10,w=5.83/nx,h=3.28/ny;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
   const geometry=new T.PlaneGeometry(w+.001,h+.001);
   const uv=geometry.getAttribute('uv');
   for(let k=0;k<uv.count;k++)uv.setXY(k,(i+uv.getX(k))/nx,(j+uv.getY(k))/ny);
   const m=new T.Mesh(geometry,new T.MeshBasicMaterial({color:0xf0d6b2,side:T.DoubleSide}));
   const backing=box(w*.996,h*.996,.022,0x28444d,.008);backing.position.z=-.017;const backingMaterial=backing.material as T.MeshStandardMaterial;backingMaterial.metalness=.48;backingMaterial.roughness=.26;m.add(backing);
   const home=new T.Vector3((i-(nx-1)/2)*w,(j-(ny-1)/2)*h,.15);
   this.tiles.push(m);this.homes.push(home);m.position.copy(home);this.picture.add(m);
  }
  const cameraDot=ball(.031,0x658389);cameraDot.position.set(-2.99,0,.16);this.phone.add(cameraDot);
  const button=box(.028,.48,.07,0x4b6167,.012);button.position.set(3.085,.4,-.01);this.phone.add(button);
  this.add(this.phone);
  const driveBody=box(2.7,.27,1.75,0x24333b,.14);this.disk.add(driveBody);
  for(let i=0;i<13;i++){const groove=box(.027,.018,1.4,0x607679,.006);groove.position.set((i-6)*.16,.14,0);this.disk.add(groove);}
  const led=box(.23,.02,.05,C.cyan,.01);led.position.set(1,.16,.45);this.disk.add(led);
  this.disk.position.set(-3,-2.12,.55);this.disk.rotation.y=.14;this.add(this.disk);
  this.drop.position.set(3,.38,0);this.add(this.drop);
  this.molecule.position.copy(this.drop.position);this.molecule.rotation.z=.16;this.add(this.molecule);
  // A ceramic dish and concentric caustic rings give the transparent carrier a floor.
  const dish=new T.Mesh(new T.CylinderGeometry(1.75,1.7,.1,96),mat(0xf6f1e7,.19,.18));
  dish.position.set(3,-2.4,0);this.add(dish);
  for(let i=0;i<3;i++){const r=ring(1.12+i*.19,0xa6cfc8,.012);r.rotation.x=-Math.PI/2;r.position.set(3,-2.337+i*.006,0);this.add(r);this.orbits.push(r);}
  for(let i=0;i<72;i++){const p=box(.062,.062,.045,[C.teal,C.gold,C.coral,C.violet][i%4],.014);this.pixels.push(p);this.add(p);}
 }
 setFamilyTexture(texture:T.Texture){texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;for(const tile of this.tiles){const m=tile.material as T.MeshBasicMaterial;m.map=texture;m.color.set(0xffffff);m.needsUpdate=true;}}
 setMemoryAtlas(texture:T.Texture){this.filmAtlas=texture;texture.repeat.set(.1,1/9);texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;this.setFamilyTexture(texture);}
 installAsset(name:string,asset:T.Group){
  // Purpose-built phone has accurate image-tile UVs; keep it as the story anchor.
  if(name!=='lux_vial_holder')return;
  const bounds=new T.Box3().setFromObject(asset),size=bounds.getSize(new T.Vector3());
  asset.position.sub(bounds.getCenter(new T.Vector3()));const g=new T.Group();g.add(asset);g.scale.setScalar(2.6/size.y);g.position.set(5.7,-1,-3.2);this.assets.add(g);
 }
 update(t:number){
  if(this.filmAtlas){const frame=Math.min(89,Math.max(0,Math.floor((this.ending?Math.max(0,t-5.2):t)*30)));this.filmAtlas.offset.set((frame%10)/10,1-(Math.floor(frame/10)+1)/9);}
  this.phone.rotation.set(-.025,.07+.04*Math.sin(t*.16),-.025);
  this.drop.material.uniforms.uTime.value=t;
  this.molecule.rotation.y=t*.20;
  this.orbits.forEach((r,i)=>{r.scale.setScalar(1+.025*Math.sin(t*1.3+i));});
  this.tiles.forEach((tile,i)=>{
   const h=this.homes[i],col=i%18,row=Math.floor(i/18);
   const lost=((i*37+13)%31)<6;
   const breakQ=ease((t-2.2-(i%9)*.065)/1.6);
   const flowQ=ease((t-5.8-col*.075-row*.028)/5.7);
   const q=this.ending?1-ease((t-.35-col*.025-row*.02)/4.2):flowQ;
   // Each patch physically leaves the display before joining the molecule stream.
   const a=i*2.399963,depth=Math.sin(a)*.5;
   const destination=new T.Vector3(5+Math.cos(a)*.67,.4+Math.sin(a*.83)*.9,-.25+depth);
   tile.position.copy(h).lerp(destination,q);
   tile.position.y+=Math.sin(Math.PI*q)*(.22+row*.034);
   tile.position.z+=Math.sin(Math.PI*q)*(.45+depth*.25);
   if(!this.ending&&lost){const loss=breakQ*(1-flowQ);tile.position.add(new T.Vector3(.8*loss,(row-4.5)*.10*loss,.65*loss));}
   tile.rotation.set(Math.sin(Math.PI*q)*.08,Math.sin(Math.PI*q)*.18,Math.sin(Math.PI*q)*.06);
   const scale=lerp(1,.12,q);tile.scale.setScalar(scale);
   if(!this.ending&&lost){const m=tile.material as T.MeshBasicMaterial;m.color.setRGB(1-.35*breakQ*(1-flowQ),1-.30*breakQ*(1-flowQ),1-.22*breakQ*(1-flowQ));}
  });
  this.pixels.forEach((p,i)=>{
   const phase=.5-.5*Math.cos((t*.055+i/72)*Math.PI*2),u=this.ending?1-phase:phase,a=i*2.399;
   p.position.set(lerp(-.7,3,u),.32+Math.sin(a)*Math.sin(u*Math.PI)*.6,Math.cos(a)*Math.sin(u*Math.PI)*.8);
   p.scale.setScalar(.2+.8*Math.sin(u*Math.PI));p.rotation.set(a+t*.3,a*.3,t*.2);
  });
 }
}
