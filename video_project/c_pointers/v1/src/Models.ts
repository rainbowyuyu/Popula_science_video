import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const C={paper:'#f7f7f0',floor:'#f1f1ec',ink:'#203349',blue:'#3568cb',coral:'#e87862',muted:'#728191',steel:'#92a3ac',pale:'#dce6ed',green:'#3c9285'};
export const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export function material(color:string,roughness=.48,metalness=.12){return new T.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:.12,clearcoatRoughness:.42});}
export function solid(parent:T.Object3D,w:number,h:number,d:number,color:string,x=0,y=0,z=0,r=.12){const m=new T.Mesh(new RoundedBoxGeometry(w,h,d,5,Math.min(r,w*.22,h*.22,d*.22)),material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function cylinder(parent:T.Object3D,r:number,h:number,color:string,x=0,y=0,z=0){const m=new T.Mesh(new T.CylinderGeometry(r,r,h,48),material(color,.35,.55));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function rr(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
export class Label {
 canvas=document.createElement('canvas');texture:T.CanvasTexture;mesh:T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>;last='';
 constructor(parent:T.Object3D,public w:number,public h:number,x:number,y:number,z:number,public color=C.ink,public background='transparent',public font='Consolas'){
  this.canvas.width=Math.max(1024,Math.round(w*320));this.canvas.height=Math.max(64,Math.round(this.canvas.width*h/w));
  this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;this.texture.anisotropy=8;
  this.mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:this.texture,transparent:true,depthWrite:false,toneMapped:false}));
  this.mesh.position.set(x,y,z);parent.add(this.mesh);
 }
 set(text:string,color=this.color,size=.65){const key=text+'|'+color+'|'+size;if(key===this.last)return;this.last=key;const c=this.canvas.getContext('2d')!,w=this.canvas.width,h=this.canvas.height;c.clearRect(0,0,w,h);if(this.background!=='transparent'){c.fillStyle=this.background;c.fillRect(0,0,w,h);}c.fillStyle=color;c.font=`600 ${Math.floor(h*size)}px "${this.font}", "Noto Sans SC", sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h/2,w*.94);this.texture.needsUpdate=true;}
}
/** A data object is one ceramic cartridge. The front is a value; the separate
 * bottom plaque identifies the object's storage position. It is never a HUD. */
export class DataCell {
 root=new T.Group();name:Label;value:Label;address:Label;status:Label;rim:T.Mesh;body:T.Mesh;lid:T.Mesh;accent:T.Mesh;lastValue='';
 constructor(parent:T.Object3D,public width=3.5,accent=C.blue){
  parent.add(this.root);this.root.name='memory-cartridge';
  solid(this.root,width+.18,.18,1.7,C.ink,0,.12,0,.07);
  solid(this.root,width-.35,.12,1.35,C.steel,0,.26,0,.04);
  this.rim=solid(this.root,width,2.65,1.24,C.ink,0,1.72,0,.20);
  this.body=solid(this.root,width-.16,2.47,1.30,C.paper,0,1.75,.015,.18);
  this.lid=solid(this.root,width-.40,2.19,.09,'#e9eee9',0,1.78,.707,.13);
  (this.lid.material as T.MeshPhysicalMaterial).roughness=.84;
  this.accent=solid(this.root,width-.66,.055,.025,accent,0,.855,.77,.012);
  this.name=new Label(this.root,width-.45,.58,0,2.49,.772,C.ink);this.name.set('score');
  this.value=new Label(this.root,width-.45,1.15,0,1.71,.776,C.ink);this.value.set('7',C.ink,.89);
  solid(this.root,width-.25,.43,.10,'#dfe6e8',0,.53,.715,.08);
  this.address=new Label(this.root,width-.48,.44,0,.52,.776,C.blue);this.address.set('0x1000',C.blue,.86);
  this.status=new Label(this.root,width-.5,.36,0,3.03,.12,C.muted,'transparent','Noto Sans SC');this.status.set('');
  const socket=new T.Mesh(new T.TorusGeometry(.095,.028,12,32),material('#7698bb',.28,.58));socket.position.set(-width*.34,1.05,.79);this.root.add(socket);
  for(const x of[-1,1]){const s=new T.Mesh(new T.CylinderGeometry(.039,.039,.02,12),material('#81909a',.38,.8));s.rotation.x=Math.PI/2;s.position.set(x*(width/2-.17),.53,.78);this.root.add(s);}
  // Recessed ventilation slots and a double-wall side shell make these actual
  // cartridges, not flat cards; details remain subordinate to the values.
  for(const x of[-1,1])for(let j=0;j<5;j++){solid(this.root,.024,.055,.58,'#78909c',x*(width/2+.009),1.12+j*.18,-.13,.008);}
 }
 set(name:string,value:string,address:string,color=C.ink){this.name.set(name);this.value.set(value,color,value.length>5?.43:value.length>2?.61:.89);this.address.set(address,C.blue,.86);}
 pulse(v:number){const m=this.accent.material as T.MeshPhysicalMaterial;m.emissive.set(C.blue);m.emissiveIntensity=Math.max(0,v)*.55;this.value.mesh.scale.setScalar(1+.025*Math.max(0,v));}
}
export function contactShadow(parent:T.Object3D,x:number,z:number,w:number,d:number,opacity=.22){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d')!,g=c.createRadialGradient(128,128,16,128,128,128);g.addColorStop(0,'rgba(28,39,48,0.55)');g.addColorStop(.5,'rgba(28,39,48,.25)');g.addColorStop(1,'rgba(28,39,48,0)');c.fillStyle=g;c.fillRect(0,0,256,256);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(w,d),new T.MeshBasicMaterial({map:texture,transparent:true,opacity,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,.023,z);parent.add(m);return m;}
export function tube(parent:T.Object3D,points:T.Vector3[],radius:number,color:string){const curve=new T.CatmullRomCurve3(points),m=new T.Mesh(new T.TubeGeometry(curve,80,radius,10,false),material(color,.34,.32));m.castShadow=true;parent.add(m);return m;}
export class Route {
 root=new T.Group();rail:T.Mesh<T.TubeGeometry,T.MeshPhysicalMaterial>;core:T.Mesh<T.SphereGeometry,T.MeshPhysicalMaterial>;tip:T.Mesh;curve:T.CatmullRomCurve3;last='';
 constructor(parent:T.Object3D,public color=C.blue){parent.add(this.root);this.curve=new T.CatmullRomCurve3([new T.Vector3(),new T.Vector3(1,0,0),new T.Vector3(2,0,0)]);this.rail=new T.Mesh(new T.TubeGeometry(this.curve,90,.045,10,false),material(color,.32,.28));this.rail.castShadow=true;this.root.add(this.rail);this.core=new T.Mesh(new T.SphereGeometry(.135,24,16),material('#cbe2ff',.22,.15));this.core.material.emissive.set(color);this.core.material.emissiveIntensity=.75;this.root.add(this.core);this.tip=new T.Mesh(new T.ConeGeometry(.13,.36,28),material(color,.3,.25));this.root.add(this.tip);}
 update(points:T.Vector3[],reveal:number,travel:number){const key=points.map(p=>p.toArray().map(n=>n.toFixed(4)).join(',')).join('/');if(key!==this.last){this.last=key;this.curve=new T.CatmullRomCurve3(points);this.rail.geometry.dispose();this.rail.geometry=new T.TubeGeometry(this.curve,90,.045,10,false);}const n=this.rail.geometry.index?.count??0;this.rail.geometry.setDrawRange(0,Math.floor(n*clamp(reveal)/6)*6);this.root.visible=reveal>0;const q=clamp(travel),at=this.curve.getPoint(q);this.core.position.copy(at);this.core.scale.setScalar(reveal>q?1:0);this.tip.position.copy(this.curve.getPoint(clamp(reveal)));const tangent=this.curve.getTangent(clamp(reveal));this.tip.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),tangent);this.tip.scale.setScalar(clamp(reveal*5));}
}
export class Token {
 root=new T.Group();label:Label;
 constructor(parent:T.Object3D,color=C.blue){parent.add(this.root);solid(this.root,1.66,.85,.19,C.paper,0,0,0,.12);solid(this.root,1.67,.86,.06,color,0,0,-.11,.08);this.label=new Label(this.root,1.48,.60,0,0,.105,color);this.label.set('7');}
}
export function disposeTree(root:T.Object3D){const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value);}}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
