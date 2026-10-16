import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
export const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export const smooth=(x:number)=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10)};
const lerp=THREE.MathUtils.lerp;
export type JoineryState={scene:string;progress:number;line:number;lineProgress:number;time:number;elapsed:number;previous?:string;clip?:string};
const wood=0x95603d,gold=0xd38b36,ink=0x30443e;
const standard=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:.5});
function box(w:number,h:number,d:number,color:number){return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),standard(color))}
function curve(points:THREE.Vector3[],color=gold,r=.035){return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false,'centripetal'),60,r,6,false),new THREE.MeshBasicMaterial({color}))}
export class JoineryWorld{
 renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera:THREE.PerspectiveCamera;ready:Promise<void>;
 pavilion=new THREE.Group();joint=new THREE.Group();lux=new THREE.Group();other=new THREE.Group();forces=new THREE.Group();supports=new THREE.Group();pin=new THREE.Group();nailScene=new THREE.Group();
 floor:THREE.Mesh;tenon?:THREE.Object3D;mortise?:THREE.Object3D;parts:THREE.Object3D[]=[];dots:THREE.Mesh[]=[];paths:THREE.CatmullRomCurve3[]=[];arrows:THREE.ArrowHelper[]=[];contacts:THREE.Mesh[]=[];env:THREE.WebGLRenderTarget;
 constructor(canvas:HTMLCanvasElement,base:string){
 this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setSize(1920,1080,false);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.localClippingEnabled=true;
 this.scene.background=new THREE.Color(0xeee7d8);this.scene.fog=new THREE.Fog(0xeee7d8,28,75);this.camera=new THREE.PerspectiveCamera(36,1920/1080,.1,150);
 const pm=new THREE.PMREMGenerator(this.renderer);this.env=pm.fromScene(new RoomEnvironment(),.025);this.scene.environment=this.env.texture;this.scene.environmentIntensity=.38;pm.dispose();
 this.scene.add(new THREE.HemisphereLight(0xfff6de,0x777d6c,1.4));const sun=new THREE.DirectionalLight(0xffe7c4,3.5);sun.position.set(-5,12,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:40});sun.shadow.bias=-.0006;sun.shadow.normalBias=.035;sun.shadow.radius=3;this.scene.add(sun);const fill=new THREE.DirectionalLight(0xe1eee7,1.4);fill.position.set(6,5,-7);this.scene.add(fill);
 this.floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),standard(0xddd4bf));this.floor.rotation.x=-Math.PI/2;this.floor.position.y=-.47;this.floor.receiveShadow=true;this.scene.add(this.floor,this.pavilion,this.joint,this.lux,this.other,this.forces,this.supports,this.pin,this.nailScene);
 const loader=new GLTFLoader();this.ready=Promise.all([loader.loadAsync(base+'crafted-pavilion.glb'),loader.loadAsync(base+'crafted-joint.glb')]).then(([p,j])=>{
 this.pavilion.add(p.scene);this.joint.add(j.scene);p.scene.traverse(o=>{if(o.name.startsWith('stage_')){this.parts.push(o);o.userData.base=o.position.clone();}});this.tenon=j.scene.getObjectByName('tenon');this.mortise=j.scene.getObjectByName('mortise');
 const tex=this.woodTexture();[p.scene,j.scene].forEach(root=>root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(m instanceof THREE.MeshStandardMaterial){m.side=THREE.DoubleSide;if(/cedar/i.test(m.name)){m.map=tex;m.roughness=.56;}m.needsUpdate=true;}}}}));
 });this.buildExtra();
 }
 woodTexture(){const c=document.createElement('canvas');c.width=256;c.height=512;const cx=c.getContext('2d')!;const d=cx.createImageData(256,512);for(let y=0;y<512;y++)for(let x=0;x<256;x++){const n=Math.sin(x*.8+Math.sin(y*.012)*2)+.5*Math.sin(x*2.7+y*.003);const v=229+n*9+4*Math.sin(y*.31+x*13);const i=(y*256+x)*4;d.data[i]=v;d.data[i+1]=v-5;d.data[i+2]=v-11;d.data[i+3]=255;}cx.putImageData(d,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;}
 buildExtra(){
 // Force paths follow real member centres. Geometry is schematic, not an FEA output.
 for(const x of [-2,2])for(const z of [-2,2]){const pts=[new THREE.Vector3(x,6.185,z),new THREE.Vector3(x,4.45,z),new THREE.Vector3(x,3.15,z),new THREE.Vector3(x,.35,z),new THREE.Vector3(x,-.1,z)];const path=new THREE.CatmullRomCurve3(pts,false,'centripetal');this.paths.push(path);this.forces.add(curve(pts,gold,.024));const d=new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),new THREE.MeshBasicMaterial({color:0xffdc82}));this.forces.add(d);this.dots.push(d);const a=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(x,7.085,z),.9,0xbc633e,.2,.10);this.forces.add(a);}
 for(const x of [-1.7,1.7]){const leg=box(.13,3.3,.13,0x537266);leg.position.set(x,1.3,2);this.supports.add(leg);const cap=box(.8,.12,.7,0x537266);cap.position.set(x,3.0,2);this.supports.add(cap);}
 const pin=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,1.5,20),standard(0x70472a));pin.rotation.x=Math.PI/2;pin.position.set(-.62,2.25,0);this.pin.add(pin);
 const c=box(.9,.022,.45,gold);c.position.set(-.6,1.95,0);this.contacts.push(c);this.joint.add(c);const c2=box(.024,.94,.84,gold);c2.position.set(.015,2.25,0);this.joint.add(c2);this.contacts.push(c2);
 const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(2,3.6,0),.8,0xb55b3f,.2,.095);this.joint.add(arrow);this.arrows.push(arrow);
 const post=box(1.2,3.6,1.25,wood);post.position.set(-.6,1.8,0);const beam=box(2.8,1,.9,0xc79560);beam.position.set(1.42,2.25,0);for(const o of [post,beam]){(o.material as THREE.MeshStandardMaterial).transparent=true;(o.material as THREE.MeshStandardMaterial).opacity=.3;(o.material as THREE.MeshStandardMaterial).depthWrite=false;}this.nailScene.add(post,beam);const nail=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,1.8,20),new THREE.MeshStandardMaterial({color:0x656e6b,metalness:.85,roughness:.27}));nail.rotation.z=Math.PI/2;nail.position.set(.25,2.25,0);this.nailScene.add(nail);const head=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,.07,24),nail.material);head.rotation.z=Math.PI/2;head.position.set(1.1,2.25,0);this.nailScene.add(head);this.nailScene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
 }
 render(s:JoineryState){if(!this.tenon)return;const sc=s.scene,p=s.progress,beat=s.line+s.lineProgress;
 const isP=['prologue','rain','assembly','load','repair','return'].includes(sc);this.pavilion.visible=isP;this.joint.visible=!isP;this.forces.visible=sc==='load'&&s.line<4&&s.elapsed>1.2;this.supports.visible=sc==='repair'&&s.line>=1&&s.line<5;this.pin.visible=sc==='joint'&&s.line>=5;this.nailScene.visible=sc==='compare'&&s.line<3;
 this.joint.position.set(sc==='compare'?2.2:0,0,0);this.joint.scale.setScalar(sc==='compare'?.8:1);this.nailScene.position.set(-2.6,0,0);this.nailScene.scale.setScalar(.8);
 this.pavilion.rotation.y=.1;this.forces.rotation.y=.1;this.joint.rotation.y=0;
 let separation=0,cut=0;this.tenon.position.y=0;this.tenon.rotation.z=0;
 if(sc==='question'){separation=2.1*(1-smooth((beat-3)/2));if(s.line===1)this.tenon.position.y=-.75*Math.sin(s.lineProgress*Math.PI);}
 if(sc==='parts'){separation=1.8*(1-smooth((beat-1)/1.8));}
 if(sc==='joint'){separation=s.line===4?1.3*smooth(s.lineProgress):0;cut=s.line<4?1:0;}
 if(sc==='fit'){cut=s.line>=2&&s.line<=3?1:0;separation=.35;const swing=Math.sin(s.lineProgress*Math.PI);if(s.line===2)this.tenon.scale.z=1+.12*swing;else this.tenon.scale.z=1;}
 else this.tenon.scale.set(1,1,1);
 this.tenon.position.x=separation;if(sc==='joint'&&s.line===2){const theta=-.016*Math.sin(s.lineProgress*Math.PI);this.tenon.rotation.z=theta;this.tenon.position.x+=2.25*Math.sin(theta);this.tenon.position.y+=2.25*(1-Math.cos(theta));}
 this.pin.position.z=s.line===5?lerp(2,0,smooth(s.lineProgress)):0;
 const plane=new THREE.Plane(new THREE.Vector3(0,0,-1),.05);
 this.mortise?.traverse(o=>{if(o instanceof THREE.Mesh){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{const a=m as THREE.MeshStandardMaterial;a.clippingPlanes=cut?[plane]:[];a.clipShadows=true;});}});
 this.contacts.forEach((c,i)=>c.visible=sc==='joint'&&s.line<4&&(i===0||s.line>=2));this.arrows.forEach(a=>{a.visible=sc==='joint'&&s.line<4;const contact=new THREE.Vector3(2,2.75,0).applyAxisAngle(new THREE.Vector3(0,0,1),this.tenon!.rotation.z).add(this.tenon!.position);a.position.copy(contact.add(new THREE.Vector3(0,.85,0)));});
 this.parts.forEach(o=>{o.position.copy(o.userData.base);o.visible=true;const name=o.name;let lift=0;
 if(sc==='prologue'){
 const expand=smooth((s.elapsed-.7)/1.6)*(1-smooth((s.elapsed-4.25)/2.4));
 lift=name.includes('roof')?2.7*expand:name.includes('rafters')?1.6*expand:name.includes('beam')?.7*expand:0;
 if(name.includes('column')){const n=Number(name.at(-1));o.position.x+=(n%2===0?-1:1)*.65*expand;o.position.z+=(n<2?1:-1)*.65*expand;}
 }
 if(sc==='assembly'){let arrival=0;if(name.includes('column'))arrival=1.2+Number(name.at(-1))*.14;else if(name.includes('beam'))arrival=2.2+Number(name.at(-1))*.14;else if(name.includes('rafters'))arrival=4;else if(name.includes('roof'))arrival=4.8;else if(name.includes('rails'))arrival=5.1;lift=2.4*(1-smooth((beat-arrival)/.85));o.visible=name.includes('base')||beat>arrival-.8;}
 if(sc==='load'&&s.line<4){lift=(name.includes('roof')?1.8:name.includes('rafters')?.8:0)*smooth(s.elapsed/1.2);}
 if(sc==='repair'){const unload=smooth((beat-1)/1);lift=name.includes('roof')?unload*2.7:name.includes('rafters')?unload*1.3:0;const restore=1-smooth((beat-4.8)/1);lift*=restore;if(name==='stage_beam_0')o.position.x=2.5*Math.sin(clamp((beat-2.8)/2)*Math.PI);}
 if(sc==='return'){lift=0;}
 o.position.y+=lift;});
 this.dots.forEach((d,i)=>d.position.copy(this.paths[i].getPoint((s.time*.22+i*.18)%1)));
 if(sc==='load'&&s.line>=4){this.pavilion.rotation.z=.008*Math.sin(s.time*2);this.forces.visible=false;}else this.pavilion.rotation.z=0;
 const cam=isP?new THREE.Vector3(10,8,12):new THREE.Vector3(6.3,4.8,8.8);const target=isP?new THREE.Vector3(-.9,2.4,0):new THREE.Vector3(.4,2.15,0);
 if(sc==='assembly'||sc==='repair'||sc==='prologue'){cam.multiplyScalar(sc==='prologue'?1.28:1.16);target.y=3.05;if(sc==='prologue'){target.x=-1.8;cam.applyAxisAngle(new THREE.Vector3(0,1,0),-.22+.44*smooth(p));}}
 if(sc==='compare'){cam.set(8.5,5.5,12);target.set(.2,1.65,0);}
 if(sc==='joint'){cam.set(4.5,3.6,8.4);target.set(.7,2.25,0);}
 // A camera action accompanies each explanatory beat: orbit, insertion, shoulder close-up, cutaway.
 if(sc==='parts'){const q=smooth(beat/2.7);cam.set(lerp(-5.8,6.3,q),lerp(4,4.8,q),lerp(8,8.8,q));if(s.line>=3){const k=smooth((beat-3)/1.3);cam.lerp(new THREE.Vector3(4.5,3.8,7.2),k);target.lerp(new THREE.Vector3(.1,2.35,0),k);}}
 if(sc==='joint'&&s.line<4){cam.set(4.2,3.4,7.6);target.set(.35,2.25,0);}
 if(sc==='fit'&&s.line>=2&&s.line<=3){cam.set(4,3.5,7.6);target.set(.3,2.3,0);}
 if(sc==='compare'&&s.line>=3){cam.set(6.8,4.2,9);target.set(2.1,1.9,0);}
 if(sc==='return'){const k=smooth(p);cam.set(lerp(10,8,k),lerp(8,5.6,k),lerp(12,11,k));target.set(-.4,2.4,0);}
 const a=.10*Math.sin(p*Math.PI*1.4);cam.applyAxisAngle(new THREE.Vector3(0,1,0),a);
 if(s.elapsed<1.1&&s.previous){const wasP=['prologue','rain','assembly','load','repair','return'].includes(s.previous);let prev=wasP?new THREE.Vector3(10,8,12):new THREE.Vector3(6.3,4.8,8.8);let look=wasP?new THREE.Vector3(-.9,2.4,0):new THREE.Vector3(.4,2.15,0);if(s.previous==='assembly'||s.previous==='repair'||s.previous==='prologue'){prev.multiplyScalar(s.previous==='prologue'?1.28:1.16);look.y=3.05;if(s.previous==='prologue'){look.x=-1.8;prev.applyAxisAngle(new THREE.Vector3(0,1,0),.22);}}if(s.previous==='joint'){prev.set(4.5,3.6,8.4);look.set(.7,2.25,0);}if(s.previous==='compare'){prev.set(8.5,5.5,12);look.set(.2,1.65,0);}cam.lerpVectors(prev,cam,smooth(s.elapsed/1.1));target.lerpVectors(look,target,smooth(s.elapsed/1.1));}
 this.camera.position.copy(cam);this.camera.lookAt(target);this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose())}});this.env.dispose();this.renderer.dispose();this.renderer.forceContextLoss();}
}
