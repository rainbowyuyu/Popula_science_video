import * as T from 'three';
import {C,DataCell,Label,Route,Token,solid,material,tube,contactShadow,disposeTree,clamp} from './Models';
import {applyCamera} from './Camera';
import {cue,ease,phase,timeline} from './Timeline';
import beatData from './beats.json';
import captionData from './captions-data.json';

const after=(id:string,t:number,d=2,delay=0)=>ease((t-cue(id).startSec-delay)/d);
const at=(id:string,f:number)=>{const c=cue(id);return c.startSec+(c.endSec-c.startSec)*f;};
export const beatAlignedTime=(time:number)=>{let closest=time,delta=.35;for(const beat of beatData.beatTimesSec){const d=Math.abs(beat-time);if(d<delta){closest=beat;delta=d;}}return closest;};
const action=(id:string,t:number,f=.38,d=1.2)=>ease((t-beatAlignedTime(at(id,f)))/d);
const normal=(s:string)=>s.replace(/[\s，。；：！？、,.!?;:]/g,'');
/** Caption windows come from the actual ASR-aligned narration. Locate one
 * meaningful phrase, then keep a broad motion around it rather than chasing
 * every syllable. Beat alignment may move the onset by at most 0.35 s. */
export function speechActionTime(id:string,phrase:string,fallback=.45){const part=captionData.cues.find(c=>c.cueId===id&&normal(c.text).includes(normal(phrase)));if(!part)return at(id,fallback);const txt=normal(part.text),offset=txt.indexOf(normal(phrase));return part.start+offset/Math.max(1,txt.length)*(part.end-part.start);}
export const actionTiming={
 scoreWrite:beatAlignedTime(speechActionTime('s15','写入八')+.18),
 bonusWrite:beatAlignedTime(speechActionTime('s17','改星号p')+.58),
 functionIncrement:beatAlignedTime(speechActionTime('s22','再把它加一')+.48),
 arrayMoveStart:beatAlignedTime(speechActionTime('s25','现在给指针加一')+.18),
 arrayMoveEnd:beatAlignedTime(speechActionTime('s25','它会去第二名')+.90),
 localExpires:speechActionTime('s30','对象生命结束'),
};
const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
export class World {
 root=new T.Group();score:DataCell;copy:DataCell;pointer:DataCell;bonus:DataCell;array:DataCell[]=[];local:DataCell;
 game=new T.Group();gameBall:T.Mesh;gameFlag:T.Mesh;
 pointerRoute:Route;copyRoute:Route;copyToken:Token;addressToken:Token;followToken:Token;functionFrame=new T.Group();functionLabel:Label;memoryRail=new T.Group();arrayRail=new T.Group();guard=new T.Group();guardLabel:Label;lifeLabel:Label;endLabel:Label;strideLabel:Label;scoreHalo:T.Mesh;scoreHeader:Label;byteTiles:T.Mesh[]=[];guardBars:T.Mesh[]=[];checks:Label[]=[];movingShadows:{object:T.Object3D;shadow:T.Mesh}[]=[];env:T.WebGLRenderTarget;accentLight:T.PointLight;
 constructor(private scene:T.Scene,private camera:T.PerspectiveCamera,private renderer:T.WebGLRenderer){
  scene.add(this.root);this.root.name='ContinuousPointerWorkshop';renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;scene.background=new T.Color(C.floor);scene.fog=new T.Fog(C.floor,48,105);
  const studio=new T.Scene();studio.background=new T.Color('#cbd1d6');for(const[p,w,h,col,i]of[[[-12,14,9],16,12,'#fff9ed',3],[[11,12,-10],10,17,'#e3efff',3],[[-16,4,-8],5,10,'#f8fcff',2]]as[number[],number,number,string,number][]){const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(col).multiplyScalar(i),side:T.DoubleSide}));m.position.set(...p as[number,number,number]);m.lookAt(0,1,0);studio.add(m);}const pm=new T.PMREMGenerator(renderer);this.env=pm.fromScene(studio,.04);scene.environment=this.env.texture;pm.dispose();disposeTree(studio);
  const key=new T.DirectionalLight('#fff7e7',2.2);key.position.set(-10,24,15);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-23,right:48,top:20,bottom:-16,near:1,far:80});key.shadow.normalBias=.03;key.shadow.bias=-.0001;key.shadow.radius=4;key.shadow.intensity=.48;key.target.position.set(10,0,0);this.root.add(key,key.target,new T.HemisphereLight('#f1f6ff','#c1b6a5',1.5));const fill=new T.DirectionalLight('#dce8ff',1.0);fill.position.set(20,12,-8);this.root.add(fill);this.accentLight=new T.PointLight(C.blue,.0,10,2);this.root.add(this.accentLight);
  const floor=new T.Mesh(new T.PlaneGeometry(180,130),material(C.floor,.87,0));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;this.root.add(floor);
  // One tiny playable-looking putting lane grounds the opening in a game:
  // a ball crosses the finish, then its +1 event travels to the function copy.
  this.root.add(this.game);this.game.position.set(-8.6,.02,2.0);
  solid(this.game,3.65,.22,1.85,C.ink,0,.16,0,.15);solid(this.game,3.44,.05,1.64,'#597b88',0,.30,0,.12);
  solid(this.game,3.45,.12,.06,C.paper,0,.37,-.81,.025);solid(this.game,3.45,.12,.06,C.paper,0,.37,.81,.025);
  const hole=new T.Mesh(new T.CylinderGeometry(.24,.24,.015,40),material('#182c39',.9,0));hole.position.set(1.0,.336,0);this.game.add(hole);
  const mast=new T.Mesh(new T.CylinderGeometry(.025,.025,1.6,16),material(C.paper,.35,.4));mast.position.set(1.0,1.12,-.15);this.game.add(mast);
  const flagGeo=new T.BufferGeometry();flagGeo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,.72,-.19,0,0,-.40,0],3));flagGeo.computeVertexNormals();this.gameFlag=new T.Mesh(flagGeo,new T.MeshPhysicalMaterial({color:C.coral,side:T.DoubleSide,roughness:.7}));this.gameFlag.position.set(1.03,1.91,-.15);this.game.add(this.gameFlag);
  this.gameBall=new T.Mesh(new T.SphereGeometry(.22,32,24),material('#ffad73',.24,.08));this.gameBall.castShadow=true;this.game.add(this.gameBall);contactShadow(this.game,0,0,4.2,2.4,.24);
  // A continuous milled rail physically connects the workshop's stations.
  this.root.add(this.memoryRail,this.arrayRail);solid(this.memoryRail,14,.30,2.35,'#d7dfe1',-1,.20,0,.12);solid(this.memoryRail,13.7,.075,2.16,C.paper,-1,.39,0,.025);
  solid(this.arrayRail,12.4,.30,2.35,'#d7dfe1',17,.20,0,.12);solid(this.arrayRail,12.1,.075,2.16,C.paper,17,.39,0,.025);
  tube(this.root,[v(-4,.085,2.3),v(0,.085,3.3),v(10,.085,3.35),v(17,.085,3.35),v(24,.085,3.0)],.022,'#bfcbd2');
  this.score=new DataCell(this.root);this.score.root.position.set(-4,.43,0);this.score.set('score','7','0x1000');contactShadow(this.root,-4,0,5,4,.28);
  this.scoreHeader=new Label(this.score.root,3.5,.6,0,3.38,.4,C.ink,'transparent','Noto Sans SC');this.scoreHeader.set('计分板',C.ink,.73);
  this.scoreHalo=solid(this.score.root,4.1,3.4,.23,'#284962',0,1.72,-.74,.18);
  this.copy=new DataCell(this.root,3.5,C.coral);this.copy.root.position.set(4,.43,0);this.copy.set('n','8','局部副本');this.copy.address.set('局部副本',C.coral,.8);this.movingShadows.push({object:this.copy.root,shadow:contactShadow(this.root,4,0,5,4,.24)});
  this.root.add(this.functionFrame);this.functionFrame.position.set(4,.43,0);solid(this.functionFrame,4.4,.15,1.5,'#91a4ae',0,3.5,0,.06);solid(this.functionFrame,.15,3.6,1.5,'#91a4ae',-2.15,1.75,0,.05);solid(this.functionFrame,.15,3.6,1.5,'#91a4ae',2.15,1.75,0,.05);this.functionLabel=new Label(this.functionFrame,4.15,.63,0,4.03,.1,C.coral);this.functionLabel.set('addOneWrong',C.coral,.66);
  this.pointer=new DataCell(this.root,3.5,C.blue);this.pointer.root.position.set(0,.03,5);this.pointer.set('p','0x1000','0x3000');this.pointer.status.set('');this.movingShadows.push({object:this.pointer.root,shadow:contactShadow(this.root,0,5,4.8,3.5,.25)});
  this.bonus=new DataCell(this.root);this.bonus.root.position.set(-9,.03,-.4);this.bonus.set('bonus','20','0x1040');this.movingShadows.push({object:this.bonus.root,shadow:contactShadow(this.root,-9,-.4,4.8,3.5,.24)});
  for(let i=0;i<3;i++){const cell=new DataCell(this.root,2.92);cell.root.position.set(13.95+i*3.05,.43,0);cell.set(`[${i}]`,String(7+i),`0x200${i*4}`);cell.name.set(`[${i}]`,C.ink,.75);this.array.push(cell);contactShadow(this.root,cell.root.position.x,0,4.0,3.7,.24);for(let b=0;b<4;b++){const tile=solid(this.root,.64,.12,.65,b%2?'#b7c8d9':'#d1dce7',cell.root.position.x+(b-1.5)*.70,.14,1.90,.035);this.byteTiles.push(tile);}}
  this.local=new DataCell(this.root,3.0,C.coral);this.local.root.position.set(27,.03,0);this.local.set('local','7','生命周期');this.local.address.set('生命周期',C.coral,.75);this.lifeLabel=new Label(this.local.root,3.8,.56,0,3.45,0,C.coral,'transparent','Noto Sans SC');this.lifeLabel.set('临时对象',C.coral,.7);
  this.root.add(this.guard);this.guard.position.set(23.4,0,1.7);solid(this.guard,.16,3.6,.24,C.coral,0,1.8,0,.05);solid(this.guard,.16,3.6,.24,C.coral,3.0,1.8,0,.05);solid(this.guard,3.2,.16,.24,C.coral,1.5,3.5,0,.05);for(let i=0;i<5;i++){const bar=solid(this.guard,.07,3.35,.08,'#c5b4a6',i*.6+.3,1.72,0,.015);this.guardBars.push(bar);}this.guardLabel=new Label(this.guard,4.1,.64,1.5,4.05,0,C.coral,'transparent','Noto Sans SC');this.guardLabel.set('先检查，再访问',C.coral,.70);
  this.endLabel=new Label(this.root,3.8,.6,23.1,.75,2.6,C.coral);this.endLabel.set('scores + 3',C.coral,.72);
  // The one-past location is a line, deliberately not a fourth storage cell.
  solid(this.root,.08,.03,2.36,C.coral,22.49,.42,0,.01);
  this.strideLabel=new Label(this.root,6.9,.6,17,.48,3.7,C.blue,'transparent','Noto Sans SC');this.strideLabel.set('一步 = 一个元素',C.blue,.78);
  for(let i=0;i<3;i++){const l=new Label(this.guard,2.7,.47,1.5,2.6-i*.75,.13,C.ink,'transparent','Noto Sans SC');this.checks.push(l);}
  this.pointerRoute=new Route(this.root,C.blue);this.copyRoute=new Route(this.root,C.coral);this.copyToken=new Token(this.root,C.coral);this.addressToken=new Token(this.root,C.blue);this.followToken=new Token(this.root,C.blue);
 }
 async loadAssets(_resolve:(p:string)=>string){await Promise.resolve();}
 update(t:number){
  applyCamera(this.camera,t);
  const stage=(id:string)=>t>=cue(id).startSec;
  const enter=after('s10',t,2.6),toArray=after('s24',t,3.5),toSafety=after('s29',t,2.5),returnHome=after('s33',t,4.5);
  this.pointer.root.position.set((10*toArray+1.5*toSafety)*(1-returnHome)+27*(1-enter),.03,5);
  const bonusVisible=after('s16',t,2.4);this.bonus.root.position.set(-9-24*(1-bonusVisible)-26*after('s18',t,2.8),.03,-.4);
  const scoreIsEight=(t>=actionTiming.scoreWrite&&!stage('s18'))||t>=actionTiming.functionIncrement;
  this.score.set(stage('s05')?'score':'分数',scoreIsEight?'8':'7',stage('s05')?'0x1000':'');this.scoreHeader.set(stage('s05')?'':'计分板','#f7f7f0',.73);
  const housing=after('s04',t,3.6);this.scoreHalo.position.x=-13*housing;this.scoreHalo.rotation.y=-.24*housing;this.scoreHalo.visible=housing<1;
  const shiftBonus=action('s16',t,.24,2.8),bonusValue=t>=actionTiming.bonusWrite?'21':'20';this.bonus.set('bonus',bonusValue,'0x1040');
  const arrayStep=ease((t-actionTiming.arrayMoveStart)/Math.max(.5,actionTiming.arrayMoveEnd-actionTiming.arrayMoveStart));
  const inMotion=(q:number)=>q>0&&q<1;
  let pointerValue=stage('s16')&&!stage('s18')?(inMotion(shiftBonus)?'寻址中':shiftBonus>=1?'0x1040':'0x1000'):'0x1000';
  if(stage('s18')&&inMotion(after('s18',t,2.8)))pointerValue='寻址中';
  if(stage('s24'))pointerValue=inMotion(after('s24',t,3.5))||inMotion(arrayStep)?'寻址中':arrayStep>=1?'0x2004':'0x2000';
  if(stage('s29'))pointerValue=stage('s31')?(inMotion(after('s31',t,2.8))?'寻址中':'0x200C'):stage('s30')?(t>=actionTiming.localExpires?'旧地址':'局部地址'):after('s29',t,1.8)<1?'断开中':'NULL';
  if(stage('s33'))pointerValue=inMotion(returnHome)?'寻址中':'0x1000';
  this.pointer.set(stage('s31')&&!stage('s33')?'end':'p',pointerValue,'0x3000',stage('s29')&&!stage('s33')?C.coral:C.blue);
  const twoCalls=stage('s18')&&!stage('s24'),correct=stage('s19')&&!stage('s24');
  const hookCopy=action('s01',t,.36)>.5||stage('s02');const inCopy=stage('s18')?action('s18',t,.48)>.5:hookCopy;
  this.copy.set(correct?'p':stage('s04')?'n':'副本',correct?'0x1000':inCopy?'8':'7',correct?'地址副本':'数值副本',correct?C.blue:C.coral);this.copy.address.set(correct?'地址副本':'数值副本',correct?C.blue:C.coral,.78);this.functionLabel.set(stage('s04')?(correct?'addOne':'addOneWrong'):'加分函数',correct?C.blue:C.coral,.66);
  const copyExit=after('s04',t,2.8)*(1-after('s18',t,2.5))+after('s23',t,3.1);this.copy.root.position.x=4+60*clamp(copyExit);this.functionFrame.position.x=4+60*clamp(copyExit);this.copy.root.visible=copyExit<.999;this.functionFrame.visible=copyExit<.999;
  // Copies travel on one front-side track. Original storage never moves.
  const event=stage('s19')?'s19':stage('s18')?'s18':stage('s03')?'s03':stage('s02')?'s02':'s01';
  const cp=action(event,t,.12,2.5);this.copyToken.label.set(correct?'0x1000':'7',correct?C.blue:C.coral,correct?.52:.76);this.copyToken.root.position.set(-4+8*cp,2.5+.85*Math.sin(Math.PI*cp),1.7);this.copyToken.root.rotation.z=-.08*Math.sin(cp*Math.PI);this.copyToken.root.scale.setScalar(Math.sin(Math.PI*clamp(cp))*.85);this.copyToken.root.visible=(t<cue('s04').startSec||twoCalls)&&cp>0&&cp<1;
  // Pull the address from the original plaque along a clean, non-crossing arc.
  const ap=action('s10',t,.08,2.9);this.addressToken.label.set('0x1000',C.blue,.52);this.addressToken.root.position.set(-4+4*ap,1.15+1.3*Math.sin(ap*Math.PI),.9+4.1*ap);this.addressToken.root.rotation.y=.18*Math.sin(ap*Math.PI);this.addressToken.root.visible=ap>0&&ap<1;this.addressToken.root.scale.setScalar(Math.sin(Math.PI*clamp(ap))*.9);
  let target=v(-4,.43,0);
  if(stage('s16'))target.lerp(v(-9,.03,-.4),shiftBonus*(1-after('s18',t,2.8)));
  if(stage('s24'))target.lerp(v(13.95+3.05*arrayStep,.43,0),after('s24',t,3.5));
  if(stage('s31'))target.lerp(v(22.49,.43,0),after('s31',t,2.8));
  if(stage('s33'))target.lerp(v(-4,.43,0),after('s33',t,4.5));
  const origin=this.pointer.root.position;const arrayPort=after('s24',t,3.5)*(1-after('s33',t,4.5));const portOffset=(1.19-.1972*arrayPort)*(1-after('s31',t,2.8)*(1-after('s33',t,4.5)));const px=target.x-portOffset;const points=[v(origin.x-1.75,origin.y+1.5,origin.z+.1),v(origin.x-2.1,.65,origin.z+.1),v(px,.52,2.65),v(px,target.y+.55,1.4),v(px,target.y+1.05,.84)];
  const routeShow=after('s10',t,2.7)*(1-after('s29',t,1.8))+after('s31',t,2)*(1-after('s32',t,1.5))+after('s33',t,3.3);
  const flowCue=stage('s33')?'s33':stage('s28')?'s28':stage('s25')?'s25':stage('s22')?'s22':stage('s17')?'s17':stage('s15')?'s15':stage('s14')?'s14':stage('s13')?'s13':'s11';
  const travel=action(flowCue,t,.16,Math.max(2.1,(cue(flowCue).endSec-cue(flowCue).startSec)*.6));this.pointerRoute.update(points,clamp(routeShow),travel);
  // A second address copied into a function can point to the same score. Its
  // route is behind the main rail, and meets the side, never the numeric face.
  const cr=after('s21',t,2.1)*(1-after('s23',t,2.0));this.copyRoute.update([v(this.copy.root.position.x-1.7,2.0,-.25),v(1.7,1.5,-2.6),v(-6.15,1.5,-2.6),v(-6.15,2.1,0),v(-5.52,2.1,.70)],cr,action('s22',t,.12,2.7));
  const writePulse=Math.sin(Math.PI*ease((t-actionTiming.scoreWrite+.45)/1.5))+Math.sin(Math.PI*ease((t-actionTiming.functionIncrement+.45)/1.5));this.score.pulse(writePulse);this.bonus.pulse(Math.sin(Math.PI*ease((t-actionTiming.bonusWrite+.45)/1.5)));
  const activeArray=arrayStep>=1?1:arrayStep<=0?0:-1;for(let i=0;i<3;i++){this.array[i].pulse(stage('s24')&&!stage('s29')&&i===activeArray?.65:0);}
  const bytes=after('s26',t,2.2);this.byteTiles.forEach((m,i)=>{m.position.z=1.1+.85*bytes;m.position.y=.14+.025*Math.sin(i*.3)*bytes;});this.strideLabel.mesh.visible=stage('s26')&&!stage('s29');this.endLabel.mesh.visible=stage('s31')&&!stage('s33');
  const safe=after('s29',t,2.7);this.guard.position.set(23.4+28*(1-safe),0,1.7);
  const expired=ease((t-actionTiming.localExpires)/.65),localExit=ease((t-actionTiming.localExpires-.4)/2.5);
  this.local.root.position.x=28.6+24*(1-after('s30',t,2.8))+24*localExit;this.lifeLabel.set('',C.coral,.7);
  this.local.set('local',expired>.5?'—':'7',expired>.5?'已失效':'生命周期',expired>.5?C.muted:C.ink);this.local.address.set(expired>.5?'已失效':'生命周期',expired>.5?C.coral:C.muted,.78);(this.local.body.material as T.MeshPhysicalMaterial).color.set(C.paper).lerp(new T.Color('#cbd0d2'),expired*.75);(this.local.lid.material as T.MeshPhysicalMaterial).color.set('#e9eee9').lerp(new T.Color('#c6cbcc'),expired*.7);
  this.local.root.visible=this.local.root.position.x<50;
  for(let i=0;i<3;i++){this.checks[i].set(stage('s32')?['目标有效','对象存活','没有越界'][i]:'',C.ink,.72);}
  this.guardBars.forEach(b=>{b.visible=!stage('s32');});
  this.accentLight.position.copy(target).add(v(0,2,2));this.accentLight.intensity=Math.max(0,writePulse)*.8;
  const goal=ease((t-.4)/2.2),goalDrop=ease((t-2.6)/.55),gameExit=after('s04',t,2.8);
  this.game.position.x=-8.6-27*gameExit;this.gameBall.position.set(-1.2+2.2*goal,.54-.35*goalDrop,.10*Math.sin(Math.PI*goal));this.gameBall.scale.setScalar(1-.88*goalDrop);this.gameFlag.rotation.y=.13*Math.sin(t*1.8)*(1-gameExit);
  const scoreEvent=ease((t-2.75)/2.0);this.followToken.label.set('+1',C.coral,.8);this.followToken.root.position.set(-7.6+11.6*scoreEvent,1.8+1.7*Math.sin(Math.PI*scoreEvent),2.1-1.3*scoreEvent);this.followToken.root.scale.setScalar(.64*Math.sin(Math.PI*scoreEvent));this.followToken.root.visible=scoreEvent>0&&scoreEvent<1;
  for(const {object,shadow}of this.movingShadows){shadow.position.x=object.position.x;shadow.position.z=object.position.z;shadow.visible=object.visible;}
  this.root.updateMatrixWorld(true);this.renderer.shadowMap.autoUpdate=true;this.renderer.shadowMap.needsUpdate=true;this.renderer.render(this.scene,this.camera);
 }
 dispose(){disposeTree(this.root);this.env.dispose();this.scene.remove(this.root);}
}
