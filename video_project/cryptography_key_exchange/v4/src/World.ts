import * as T from'three';import{GLTFLoader}from'three/examples/jsm/loaders/GLTFLoader.js';
import{C,box,mesh,material,tube,canvasTex,rr,panel,chip,txt,orderTexture,disposeTree}from'./Design';import{Mixing}from'./Mixing';import{applyCamera}from'./Camera';import{cue,phase,ease,clamp,currentCue,timeline,wordProgress,wordTime}from'./Timeline';
import{observerTexture,certificateTexture,fakeCertificateTexture,tamperTexture}from'./DocumentPrint';
const after=(id:string,t:number,seconds=1.4)=>ease((t-cue(id).startSec)/seconds);
const between=(id:string,end:string,t:number)=>after(id,t)*(1-after(end,t));
const imgLoad=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=url;});
export class World{
 root=new T.Group();phone=new T.Group();router=new T.Group();server=new T.Group();cup=new T.Group();table=new T.Group();mixing=new Mixing();phoneMat?:T.MeshBasicMaterial;screenCanvas=document.createElement('canvas');screenTex:T.CanvasTexture;cakeImage?:HTMLImageElement;
 order:T.Group;cipher:T.Group;received:T.Group;broken:T.Group;witness:T.Group;cert:T.Group;fake:T.Group;certPhase=-1;badStage=-1;identityKey:T.Group;signature:T.Group;observerBranch:T.Mesh;seal:T.Group;secretChips:T.Group[]=[];path:T.CatmullRomCurve3;stream:T.InstancedMesh;dummy=new T.Object3D();labels:T.Mesh[]=[];rail:T.Mesh;outer:T.Mesh;railVersion="";env:T.WebGLRenderTarget;keyLight:T.DirectionalLight;cake=new T.Group();
 constructor(private scene:T.Scene,private camera:T.PerspectiveCamera,private renderer:T.WebGLRenderer){
 scene.add(this.root);this.root.name='BirthdayOrderWorld';this.screenCanvas.width=900;this.screenCanvas.height=1800;this.screenTex=new T.CanvasTexture(this.screenCanvas);this.screenTex.colorSpace=T.SRGBColorSpace;this.screenTex.flipY=false;this.screenTex.anisotropy=8;
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.VSMShadowMap;scene.background=new T.Color('#ece9e2');scene.fog=new T.Fog('#ece9e2',42,90);
 const studio=new T.Scene();studio.background=new T.Color('#c9cec9');for(const[p,w,h,col,intensity]of[[[-8,12,8],12,9,'#fff3de',3],[[10,10,-6],8,14,'#dcebf0',2.8],[[-15,5,-10],5,12,'#ffffff',2]]as[number[],number,number,string,number][]){const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(col).multiplyScalar(intensity),side:T.DoubleSide}));m.position.set(...p as[number,number,number]);m.lookAt(0,0,0);studio.add(m);}const pm=new T.PMREMGenerator(renderer);this.env=pm.fromScene(studio,.025);scene.environment=this.env.texture;pm.dispose();disposeTree(studio);
 // A broad overhead studio source: short, filtered shadows preserve contact
 // without the long black rectangular silhouettes of the former side light.
 this.keyLight=new T.DirectionalLight('#fff4e3',1.65);this.keyLight.position.set(-5,28,7);this.keyLight.castShadow=true;this.keyLight.shadow.mapSize.set(2048,2048);Object.assign(this.keyLight.shadow.camera,{left:-24,right:24,top:21,bottom:-21,near:1,far:72});this.keyLight.shadow.normalBias=.035;this.keyLight.shadow.bias=-.00012;this.keyLight.shadow.radius=7;this.keyLight.shadow.blurSamples=16;this.keyLight.shadow.intensity=.72;this.root.add(this.keyLight,this.keyLight.target);this.root.add(new T.HemisphereLight('#eef2f2','#d2c3ad',1.1));const fill=new T.DirectionalLight('#dfecef',.75);fill.position.set(12,9,-6);this.root.add(fill);
 this.root.add(this.phone,this.router,this.server,this.cup,this.table,this.cake,this.mixing.root);this.phone.position.set(-5.5,.4,1.2);this.router.position.set(0,.07,-4.4);this.server.position.set(7.8,.1,-1);this.cup.position.set(-10,.13,-3.4);this.table.position.y=-.04;
 // An unbroken physical route connects the same devices throughout the film.
 this.path=new T.CatmullRomCurve3([new T.Vector3(-5,1.3,1),new T.Vector3(-3.6,1.1,2),new T.Vector3(0,.9,3.2),new T.Vector3(4,1.1,2),new T.Vector3(7.8,2.2,-.5)]);
 const rail=this.rail=new T.Mesh(new T.TubeGeometry(this.path,120,.04,12,false),material('#6da49b',.4,.3));this.root.add(rail);const outer=this.outer=new T.Mesh(new T.TubeGeometry(this.path,120,.075,12,false),new T.MeshPhysicalMaterial({color:'#b4d3cc',transparent:true,opacity:.16,roughness:.2,depthWrite:false}));this.root.add(outer);
 this.stream=new T.InstancedMesh(new T.SphereGeometry(.09,12,8),material('#3d9c89',.28),20);this.stream.frustumCulled=false;this.root.add(this.stream);
 this.order=panel(this.root,4.6,2.6,orderTexture());this.cipher=panel(this.root,4.6,2.6,orderTexture('cipher'));this.received=panel(this.root,4.6,2.6,orderTexture('received'));this.broken=panel(this.root,4.6,2.6,orderTexture('failed'));
 // The opening turn is one physical sheet with two printed faces. Replacing
 // two different curved sheets edge-on would make their silhouette jump.
 const orderBack=this.order.children[0] as T.Mesh<T.BufferGeometry,T.MeshPhysicalMaterial>;
 orderBack.material.map=orderTexture('cipher');orderBack.material.color.set('#ffffff');
 const backUv=orderBack.geometry.attributes.uv;for(let i=0;i<backUv.count;i++)backUv.setX(i,1-backUv.getX(i));backUv.needsUpdate=true;
 this.witness=panel(this.root,4.4,2.6,observerTexture(false));
 this.cert=panel(this.root,4.8,3.7,certificateTexture(0));
 this.fake=panel(this.root,3.2,2.2,fakeCertificateTexture());
 this.identityKey=chip(this.root,'#b89758');this.identityKey.add(txt(new T.Group(),'网站身份私钥',[0,-1.0,.2],2.3,C.ink,.4));
 this.signature=new T.Group();this.root.add(this.signature);mesh(this.signature,new T.CylinderGeometry(.42,.42,.13,48),material(C.teal,.3,.25)).rotation.x=Math.PI/2;const signTex=canvasTex(256,256,ctx=>{ctx.fillStyle='#fffef8';ctx.font='700 180px "Noto Sans SC"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('签',128,136);});const signFace=new T.Mesh(new T.PlaneGeometry(.55,.55),new T.MeshBasicMaterial({map:signTex,transparent:true,toneMapped:false,depthWrite:false}));signFace.position.z=.09;this.signature.add(signFace);
 this.observerBranch=tube(this.root,[[0,.28,-2.9],[2.8,.28,-1.5],[4.6,.3,3.6],[3.6,1.25,8.4]],C.coral,.033);
 this.observerBranch.castShadow=false;this.observerBranch.receiveShadow=false;
 this.seal=new T.Group();this.root.add(this.seal);mesh(this.seal,new T.TorusGeometry(.65,.055,16,64),material(C.teal,.3,.35));tube(this.seal,[[-.28,0,.04],[-.05,-.2,.04],[.34,.25,.04]],C.teal,.065);
 for(const x of[-5,5]){const k=chip(this.root);k.position.set(x,3.3,1);this.secretChips.push(k);}
 this.labels=[txt(this.root,'你的手机',[-6,6.4,0],3.4,C.ink,.6),txt(this.root,'店里的路由器',[0,3.2,-4.4],4,C.muted,.6),txt(this.root,'蛋糕店的网站',[8,5.4,-1],4,C.ink,.6)];
 }
 async loadAssets(resolve:(p:string)=>string){const loader=new GLTFLoader();const model=async(name:string,parent:T.Group,scale:number)=>{const glb=await loader.loadAsync(resolve(`models/${name}.glb`));const obj=glb.scene;obj.scale.setScalar(scale);obj.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;for(const m of(Array.isArray(o.material)?o.material:[o.material])){if(m instanceof T.MeshStandardMaterial){m.envMapIntensity=.65;if(m.normalScale)m.normalScale.multiplyScalar(.5);if(m.map)m.map.anisotropy=8;
if(name==='table'){
 m.roughness=.88;m.envMapIntensity=.38;
 m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 float oakLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(oakLuma),.20);
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.69,.65,.56),.19);`);};
 m.customProgramCacheKey=()=> 'v4-satin-oak';
}
if(m.transparent&&m.opacity<.15){o.castShadow=false;o.receiveShadow=false;}}}}});parent.add(obj);return obj;};
 const phone=await model('phone',this.phone,40);phone.traverse(o=>{if(o.name==='Screen'&&o instanceof T.Mesh){this.phoneMat=new T.MeshBasicMaterial({map:this.screenTex,toneMapped:false});o.material=this.phoneMat;}if(o.name==='GlassFront'&&o instanceof T.Mesh){o.castShadow=false;o.receiveShadow=false;(o.material as T.MeshPhysicalMaterial).transparent=true;(o.material as T.MeshPhysicalMaterial).opacity=.07;(o.material as T.MeshPhysicalMaterial).depthWrite=false;}});
 await Promise.all([model('router',this.router,20),model('server',this.server,14),model('cup',this.cup,33),model('table',this.table,40)]);
 this.cakeImage=await imgLoad(resolve('textures/birthday-cake.png'));await model('cake',this.cake,25);
 this.drawScreen(0);}
 drawScreen(t:number){const ctx=this.screenCanvas.getContext('2d')!,done=t>=cue('s32').startSec;ctx.fillStyle='#faf8f2';ctx.fillRect(0,0,900,1800);ctx.fillStyle=C.ink;ctx.font='600 40px "Noto Sans SC"';ctx.fillText('09:41',65,90);ctx.fillStyle='#e9ece5';rr(ctx,45,125,810,94,40);ctx.fillStyle=C.muted;ctx.font='38px "Noto Sans SC"';ctx.textAlign='center';ctx.fillText('cake.example',450,188);ctx.textAlign='left';ctx.fillStyle=C.ink;ctx.font='700 62px "Noto Sans SC"';ctx.fillText('给妈妈的生日蛋糕',60,330);ctx.fillStyle='#eee4d5';rr(ctx,45,390,810,560,35);if(this.cakeImage){ctx.save();ctx.beginPath();ctx.roundRect(45,390,810,560,35);ctx.clip();ctx.drawImage(this.cakeImage,45,390,810,560);ctx.restore();}else{ctx.fillStyle='#d8c5a5';ctx.beginPath();ctx.ellipse(450,775,240,65,0,0,7);ctx.fill();ctx.fillStyle='#fffaf0';rr(ctx,240,590,420,190,50);ctx.fillStyle='#c8766a';for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(290+i*80,590,26,35,-.3,0,7);ctx.fill();}}
 ctx.fillStyle=C.muted;ctx.font='42px "Noto Sans SC"';ctx.fillText('给店家的备注',65,1040);ctx.fillStyle=C.ink;ctx.font='600 55px "Noto Sans SC"';const s=t<cue('s02').startSec?ease(t/6):1;const first='送到幸福路八号';ctx.fillText(first.slice(0,Math.floor(first.length*s)),65,1150);ctx.font='48px "Noto Sans SC"';ctx.fillText('别按门铃，我下来拿',65,1240);ctx.fillStyle=C.teal;rr(ctx,55,1450,790,130,40);ctx.fillStyle='#ffffff';ctx.font='600 54px "Noto Sans SC"';ctx.textAlign='center';ctx.fillText(done?'✓  店家已收到':t>=cue('s28').startSec?'正在安全发送':t>=cue('s11').startSec?'正在建立安全连接':'提交订单',450,1536);ctx.fillStyle='#6d8580';ctx.font='34px "Noto Sans SC"';ctx.fillText('虚构订单 · 机制演示',450,1690);this.screenTex.needsUpdate=true;}
 poseCard(o:T.Group,p:number[],scale=1){
  o.position.set(p[0],p[1],p[2]);o.quaternion.copy(this.camera.quaternion);o.scale.setScalar(scale);
  // Slight optical tilt reveals the bent stock and its thin edge while keeping
  // the print legible. Shared order/cipher poses preserve the turning handoff.
  const angles=o===this.cert?[-.26,-.14,.014]:o===this.witness?[-.24,.17,-.014]:[-.28,.15,-.012];
  o.rotateX(angles[0]);o.rotateY(angles[1]);o.rotateZ(angles[2]);
 }
 update(t:number){applyCamera(this.camera,t);this.drawScreen(t);const open=after('s04',t,2.7),finish=after('s34',t,3);this.phone.rotation.x=.95*open*(1-finish);this.phone.position.y=.4+2.6*open*(1-finish);this.phone.rotation.z=-.06+.04*open;
 const experiment=after('s12',t,2.2)*(1-after('s24',t,2.5));this.router.position.z=-4.4-6*experiment;this.router.position.x=-16*experiment;this.server.position.x=7.8+2.8*experiment;this.server.scale.setScalar(1-.18*experiment);this.phone.position.x=-5.5-4*experiment;this.phone.scale.setScalar(1-.22*experiment);
 this.mixing.update(t,this.camera);const c=currentCue(t)?.id??'s01';
 const routeKey=[this.phone.position.x,this.phone.rotation.x,this.router.position.z,this.router.position.x,this.server.position.x].map(n=>n.toFixed(4)).join(',');
 if(routeKey!==this.railVersion){this.railVersion=routeKey;const py=this.phone.position.y-2.8*Math.sin(this.phone.rotation.x),pz=1.2+3.1*Math.cos(this.phone.rotation.x);this.path=new T.CatmullRomCurve3([new T.Vector3(this.phone.position.x,Math.max(.3,py),pz),new T.Vector3(this.phone.position.x-1.2,.22,pz-.5),new T.Vector3(this.router.position.x-3.1,.22,this.router.position.z+1.6),new T.Vector3(this.router.position.x,.25,this.router.position.z+1.5),new T.Vector3(this.router.position.x+4,.22,this.router.position.z+1.4),new T.Vector3(this.server.position.x,.6,1.3)]);this.rail.geometry.dispose();this.outer.geometry.dispose();this.rail.geometry=new T.TubeGeometry(this.path,120,.028,10,false);this.outer.geometry=new T.TubeGeometry(this.path,120,.075,10,false);}
 // Retract the route before the colour analogy enters, then trace it again
 // after identity verification. No cable crosses the cups or their labels.
 const routeReveal=after('s03',t,3.2)*(1-after('s11',t,2.4))+after('s27',t,3.2);
 const indexCount=this.rail.geometry.index?.count??0,shown=Math.floor(indexCount*routeReveal/6)*6;
 this.rail.geometry.setDrawRange(0,shown);this.outer.geometry.setDrawRange(0,shown);
 this.rail.visible=routeReveal>0;this.outer.visible=false;
 for(let i=0;i<20;i++){const p=(t*.055+i/20)%1,v=this.path.getPointAt(p);this.dummy.position.copy(v);this.dummy.scale.setScalar((.48+.24*Math.sin(p*Math.PI))*ease((routeReveal-p)*24));this.dummy.updateMatrix();this.stream.setMatrixAt(i,this.dummy.matrix);}this.stream.instanceMatrix.needsUpdate=true;this.stream.visible=routeReveal>0;
 // Every document starts below the table or behind its device, follows a route,
 // and exits below/behind the set before becoming hidden.
 const stageE=between('s05','s11',t),delivery=between('s28','s32',t);const po=phase('s05',t);const encStart=wordProgress('s06','杂乱',t,1.6);
 this.poseCard(this.order,[-3.6,4-16*(1-stageE),5.8],1.4);this.order.rotateY(Math.PI*encStart);this.order.visible=stageE>0;
 this.cipher.visible=false;
 const receive=wordProgress('s07','还原',t,1.4)*(1-after('s08',t));this.poseCard(this.received,[6.5,4-16*(1-receive),6.2],1.4);this.received.visible=receive>0;
 const observed=between('s05','s07',t);this.witness.visible=observed>0;this.poseCard(this.witness,[3.6,2.8-16*(1-observed),8.4],1.3);
 this.observerBranch.visible=observed>0;this.observerBranch.geometry.setDrawRange(0,Math.floor(72*10*6*observed));
 const observedMesh=this.witness.children[1]as T.Mesh;const observedMat=observedMesh.material as T.MeshBasicMaterial;
 if((this.witness.userData.plain??null)!==(t<wordTime('s06','杂乱')+.8)){this.witness.userData.plain=t<wordTime('s06','杂乱')+.8;observedMat.map?.dispose();observedMat.map=observerTexture(this.witness.userData.plain);observedMat.needsUpdate=true;}
 const keys=between('s08','s11',t)+between('s28','s32',t);for(let i=0;i<2;i++){this.secretChips[i].position.set(i?7.5:-7.5,6.3-15*(1-keys),6.5);this.secretChips[i].quaternion.copy(this.camera.quaternion);const attempt=phase('s10',t);if(c==='s10'&&i===0){this.secretChips[i].position.x=-7.5+6*Math.sin(Math.PI*attempt);this.secretChips[i].position.z=.9+4*Math.sin(Math.PI*attempt);}}
 const auth=between('s25','s28',t);this.poseCard(this.cert,[1,4.1-17*(1-auth),6.8],1.35);this.cert.visible=auth>0;
 const certStage=t<wordTime('s25','证书')?0:t<wordTime('s25','网址')+.65?1:t<wordTime('s25','私人钥匙')+1.5?2:t<cue('s27').startSec?3:4;
 if(certStage!==this.certPhase){this.certPhase=certStage;const cm=(this.cert.children[1] as T.Mesh).material as T.MeshBasicMaterial;cm.map?.dispose();cm.map=certificateTexture(certStage);cm.needsUpdate=true;}
 const fake=between('s24','s25',t)+between('s26','s27',t);const reject=wordProgress('s26','拿不到',t,3.2);this.poseCard(this.fake,[-6.2-18*reject,3.6-15*(1-fake),7],1.2);this.fake.visible=fake>0&&reject<1;
 const identity=between('s25','s28',t);this.identityKey.position.set(7.3,3.5-15*(1-identity),6.8);this.identityKey.quaternion.copy(this.camera.quaternion);this.identityKey.scale.setScalar(1.1);
 const proof=wordProgress('s25','私人钥匙',t,2.2),proofOut=after('s26',t,1.2);this.signature.position.set(7.3-11*proof,4.6+1.3*Math.sin(Math.PI*proof)-14*proofOut,7.5);this.signature.quaternion.copy(this.camera.quaternion);this.signature.scale.setScalar(ease(proof/.12));
 this.seal.position.set(6.6,4.5-15*(1-after('s27',t)),7);this.seal.quaternion.copy(this.camera.quaternion);this.seal.scale.setScalar((1-after('s29',t))*1.4);
 const bad=wordProgress('s29','改动',t,1.5)*(1-after('s32',t)),rejectBad=wordProgress('s30','拒收',t,4);this.poseCard(this.broken,[2+12*rejectBad,3.4-16*(1-bad),7+3*rejectBad],1.6);this.broken.visible=bad>0&&rejectBad<1;
 const nextBad=t<wordTime('s30','核验')?0:t<wordTime('s30','拒收')-.7?1:2;if(nextBad!==this.badStage){this.badStage=nextBad;const bm=(this.broken.children[1] as T.Mesh).material as T.MeshBasicMaterial;bm.map?.dispose();bm.map=tamperTexture(nextBad);bm.needsUpdate=true;}
 if(delivery>0){const p=phase('s28',t);this.cipher.visible=true;this.poseCard(this.cipher,[-3+6*p,3.8-16*(1-delivery),6.5],1.6);if(t>=cue('s29').startSec){const returnLeft=after('s29',t,2.3);this.poseCard(this.cipher,[3-8.4*returnLeft,3.8-16*(1-delivery),6.5],1.6-.35*returnLeft);}}
 if(t>=cue('s32').startSec){
  const exitRejected=ease((t-cue('s32').startSec)/2.4);
  this.poseCard(this.cipher,[-5.4-26*exitRejected,3.8+.25*exitRejected,6.5],1.25);
  this.cipher.rotateZ(.10*exitRejected);this.cipher.visible=exitRejected<1;
 }
 const recapBad=t>=wordTime('s31','报错');
 if(this.cipher.userData.recapBad!==recapBad){this.cipher.userData.recapBad=recapBad;const printed=(this.cipher.children[1] as T.Mesh).material as T.MeshStandardMaterial;printed.map?.dispose();printed.map=recapBad?tamperTexture(2):orderTexture('cipher');printed.needsUpdate=true;}
 if(t>=cue('s31').startSec){
 const a=after('s31',t,1.8),exitReceipt=ease((t-cue('s32').startSec-1.2)/3.2);
 this.poseCard(this.received,[5.8+24*exitReceipt,3.6-16*(1-a)+.55*exitReceipt,6.7-1.2*exitReceipt],1.5-.25*exitReceipt);
 this.received.rotateZ(-.12*exitReceipt);this.received.rotateY(-.22*exitReceipt);
 this.received.visible=exitReceipt<1;
}

 this.cake.position.set(3,.13-14*(1-after('s32',t,3)),0);this.cake.rotation.y=t*.03;
 const labelShow=after('s03',t)*(1-after('s04',t));const anchors=[[-5.8-4*experiment,.55,5.7],[0,.4,-1.4-6*experiment],[8+2.8*experiment,.5,3.0]];for(let i=0;i<3;i++){this.labels[i].position.set(...anchors[i]as[number,number,number]);this.labels[i].quaternion.copy(this.camera.quaternion);(this.labels[i].material as T.MeshBasicMaterial).opacity=labelShow;}
 this.root.updateMatrixWorld(true);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.autoUpdate=true;this.renderer.shadowMap.needsUpdate=true;this.keyLight.shadow.needsUpdate=true;this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.mixing.dispose();this.env.dispose();this.screenTex.dispose();disposeTree(this.root);this.keyLight.shadow.dispose();}
}
