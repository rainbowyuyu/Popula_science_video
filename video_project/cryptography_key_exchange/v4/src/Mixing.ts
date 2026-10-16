import * as T from'three';import{PigmentCup}from'./PigmentCup';import{C,box,chip,tube,txt,material,mesh,canvasTex,paperTexture,disposeTree}from'./Design';import{cue,phase,ease,clamp,wordProgress}from'./Timeline';
const after=(id:string,t:number,d=1.5)=>ease((t-cue(id).startSec)/d);
const pulse=(p:number)=>Math.sin(Math.PI*clamp(p));
function bottle(color:string,owner:string){
 const g=new T.Group();mesh(g,new T.CylinderGeometry(.43,.47,1.15,64),material(color,.32),[0,.65,0]);mesh(g,new T.CylinderGeometry(.26,.26,.36,48),material('#eee7d9',.3),[0,1.35,0]);
 const label=paperTexture(512,400,ctx=>{ctx.fillStyle=C.ink;ctx.font='600 164px "Noto Sans SC", "Microsoft YaHei"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(owner,256,207,450);});
 // Follow the bottle's tapered surface: a thin adhesive paper label, not a
 // separate rectangular card hovering in front of the cylinder.
 const patch=mesh(g,new T.CylinderGeometry(.441,.4615,.59,32,1,true,-.82,1.64),new T.MeshPhysicalMaterial({map:label,roughness:.92,metalness:0,clearcoat:0,specularIntensity:.14,envMapIntensity:.26}),[0,.7,0]);
 patch.castShadow=false;patch.receiveShadow=false;return g;
}
export class Mixing{
 root=new T.Group();cups=[new PigmentCup(),new PigmentCup()];bottles=[bottle(C.red,'手机'),bottle(C.blue,'店家')];publicBottle=bottle(C.yellow,'公开');pourMeshes:T.Mesh[]=[];chips:T.Group[]=[];labels:T.Mesh[]=[];saucers:T.Mesh[]=[];viewSamples=new T.Group();
 constructor(){this.root.name='ColorAgreementAnalogy';for(let i=0;i<2;i++){this.root.add(this.cups[i].root,this.bottles[i]);this.cups[i].root.position.set(i?4:-4,.25,0);this.cups[i].root.scale.set(1.25,.85,1.25);this.bottles[i].position.set(i?7.2:-7.2,.1,1.1);this.chips.push(chip(this.root,C.shared));}
 this.publicBottle.scale.setScalar(1.2);this.publicBottle.position.set(0,.2,-4);this.root.add(this.publicBottle);
 for(const x of[-4,4]){const profile=[[0,.015],[1.12,.015],[1.5,.055],[1.65,.105],[1.64,.145],[1.50,.15],[1.18,.075],[0,.075]].map(([r,y])=>new T.Vector2(r,y));const stand=mesh(this.root,new T.LatheGeometry(profile,96),material('#e8e1d4',.5),[x,.02,0]);this.saucers.push(stand);}
 this.labels=[txt(this.root,'手机这边',[-4,.35,2.05],3.5,C.ink,.65),txt(this.root,'蛋糕店这边',[4,.35,2.05],3.5,C.ink,.65)];
 this.root.add(this.viewSamples);mesh(this.viewSamples,new T.CylinderGeometry(2.05,2.1,.09,64),material('#dce8df',.6),[0,-.46,0]);this.labels.push(txt(this.viewSamples,'路上可见',[0,.8,0],3.6,C.muted,.65));for(let i=0;i<3;i++){mesh(this.viewSamples,new T.SphereGeometry(.43,40,24),material([C.yellow,C.orange,C.green][i]),[(i-1)*.92,0,0]);}this.viewSamples.position.set(0,1.2,3.8);
 for(let i=0;i<4;i++){const m=tube(this.root,[[0,0,0],[.1,.4,.1],[.05,.9,.1],[0,1.5,0]],i%2?C.blue:C.red,.13);this.pourMeshes.push(m);}
 }
 update(t:number,camera:T.Camera){const enter=after('s12',t,2),exit=after('s24',t,2.5);this.root.position.y=-12*(1-enter)-12*exit;this.root.visible=enter>0&&exit<1;
 const swap=wordProgress('s17','交换',t,4),mixL=wordProgress('s16','黄色和红色',t,2),mixR=wordProgress('s16','黄色和蓝色',t,2),r=wordProgress('s19','红色',t,2.2),b=wordProgress('s20','蓝色',t,2.2),both=wordProgress('s22','两端',t,2.8),publicFill=wordProgress('s13','黄色',t,2);
 const retire=wordProgress('s22','两端',t-1.0,4.8);
 // Clear the devices in depth before travelling sideways; labels retire first.
 const front=5*ease(retire/.30),sideways=24*ease((retire-.08)/.92);
 const labelOpacity=1-wordProgress('s22','两端',t,1.0);
 const trackZ=2.5*Math.sin(Math.PI*swap);const xs=[-4+8*swap,4-8*swap];this.cups[0].root.position.set(xs[0],.25+1.3*pulse(swap),-trackZ);this.cups[1].root.position.set(xs[1],.25+1.3*pulse(swap),trackZ);
 // Cup 0 starts at phone (yellow/red), lands at shop and receives blue.
 const states=[{col:C.red,final:C.orange,add:b,second:C.blue},{col:C.blue,final:C.green,add:r,second:C.red}];
 for(let i=0;i<2;i++){const s=states[i],mix=i?mixR:mixL;this.cups[i].setState({fill:.86*publicFill,colorA:s.add>0?s.final:C.yellow,colorB:s.add>0?s.second:mix>0?s.col:C.yellow,mix:s.add>0?s.add:mix,finalColor:s.add>0?C.shared:s.final,t});this.cups[i].root.scale.set(1.25,.85,1.25);const side=i?-1:1;this.cups[i].root.position.x+=side*sideways;this.cups[i].root.position.z+=front;this.cups[i].root.position.y+=.12*Math.sin(Math.PI*retire);this.chips[i].position.set(side*4,1.45+both*.85,0);this.chips[i].quaternion.copy(camera.quaternion);this.chips[i].scale.setScalar(ease(both/.75)*1.3);}
 // The analogy's props leave along the table while its shared result stays put.
 // Neither saucers nor bottles remain as debris under the newly revealed keys.
 this.publicBottle.position.set(34*ease((retire-.08)/.92),.2-7*(1-after('s13',t)),-4+9*ease(retire/.30));
 for(let i=0;i<2;i++){const show=wordProgress(i?'s15':'s14',i?'蓝色':'红色',t,1.6),pour1=pulse(i?mixR:mixL),pour2=pulse(i?b:r),side=i?1:-1;this.bottles[i].position.set(side*(7.2+sideways)-side*(pour1+pour2)*1.5,.1-8*(1-show)+(pour1+pour2)*2.8,1.1+front);this.bottles[i].rotation.z=side*(pour1+pour2)*1.05;this.saucers[i].position.set(side*(4+sideways),.02,front);this.labels[i].position.set(side*(4+sideways),.35,2.05+front);}
 this.viewSamples.position.set(-34*ease((retire-.2)/.8),1.1-7*(1-after('s18',t)),3.8+8*retire);this.viewSamples.scale.setScalar(.85);
 for(let i=0;i<4;i++){const isSecond=i>=2,side=i%2,p=isSecond?(side?b:r):(side?mixR:mixL),a=pulse(p),x=side?4:-4;const m=this.pourMeshes[i];m.visible=a>.06;if(a>.06){this.bottles[side].updateMatrix();const nozzle=new T.Vector3(0,1.51,0).applyMatrix4(this.bottles[side].matrix);const end=new T.Vector3(x,1.45,0);const control=nozzle.clone().lerp(end,.45);control.y-=.2;const path=new T.QuadraticBezierCurve3(nozzle,control,end);m.geometry.dispose();m.geometry=new T.TubeGeometry(path,28,.105*a,10,false);m.position.set(0,0,0);m.scale.setScalar(1);}}
 for(const label of this.labels){label.quaternion.copy(camera.quaternion);(label.material as T.MeshBasicMaterial).opacity=labelOpacity;}
 }
 dispose(){this.cups.forEach(c=>c.dispose());disposeTree(this.root);}
}
