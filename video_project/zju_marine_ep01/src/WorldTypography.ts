import * as T from 'three';
import {FontLoader} from 'three/examples/jsm/loaders/FontLoader.js';
import {TextGeometry} from 'three/examples/jsm/geometries/TextGeometry.js';
import {sampleCamera} from './CameraRail';
import {chapters} from './timeline';
import story from './story.json';
import fontData from '../public/fonts/marine-display.typeface.json';

/** Original world-space type, informed by Art of the Title / Panic Room.
 * Shallow light-reacting letters, no catalogue panels. Research follows narration. */
export type WorldTypography={update:(seconds:number,camera?:T.PerspectiveCamera)=>void;dispose:()=>void;anchors:{name:string;start:number;end:number;position:number[];quaternion:number[]}[]};
const font=new FontLoader().parse(fontData as any);
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const v=clamp(x);return v*v*v*(v*(v*6-15)+10);};
type Cue={name:string;start:number;end:number;headline:string;detail?:string;eyebrow?:string;distance:number;x:number;y:number;width:number;size:number;at?:number;exitSide?:number;outSeconds?:number};
type Station={root:T.Group;slider:T.Group;cue:Cue;entry:T.Vector3;exit:T.Vector3;inStart:number;inEnd:number;outStart:number;outEnd:number};

export function createWorldTypography(scene:T.Scene,camera:T.PerspectiveCamera):WorldTypography{
 const all=new T.Group();all.name='Marine_CinematicType_V8';scene.add(all);
 const face=new T.MeshPhysicalMaterial({color:'#f2eadb',metalness:.12,roughness:.30,clearcoat:.22,clearcoatRoughness:.28,envMapIntensity:.72,emissive:'#d6e0dd',emissiveIntensity:.65});
 const side=new T.MeshStandardMaterial({color:'#80989e',metalness:.20,roughness:.38});
 const secondary=new T.MeshStandardMaterial({color:'#183e4b',metalness:0,roughness:.55,envMapIntensity:.45});
 const underwaterSecondary=new T.MeshStandardMaterial({color:'#fff5de',metalness:0,roughness:.50,emissive:'#fff1d6',emissiveIntensity:.55});
 // Sky-facing lettering needs a stable ink face: fog and HDR specular can
 // otherwise wash a nominally navy physical material into the pale sky.
 // Extruded bevels retain the lit material, so the type still belongs in 3D.
 const skyInk=new T.MeshBasicMaterial({color:'#18323f',fog:false,toneMapped:false});
 const seaIvory=new T.MeshBasicMaterial({color:'#fff4df',fog:false,toneMapped:false});
 const accent=new T.MeshStandardMaterial({color:'#cba56c',metalness:.40,roughness:.35});
 const materials=[face,side,secondary,underwaterSecondary,skyInk,seaIvory,accent];
 const stations:Station[]=[];const anchors:WorldTypography['anchors']=[];
 const cues:Cue[]=[];
 const sentence=(id:string)=>(story.sentences as any[]).find(s=>s.id===id);
 const chapter=(id:string)=>chapters.find(c=>c.id===id)!;
 const add=(c:Cue)=>cues.push(c);
 add({name:'Opening_title',start:0,end:10.2,headline:'海洋新能源',eyebrow:'浙江大学',detail:'第一期 · 海洋风电总览',distance:145,x:-95,y:9,width:70,size:9,at:5.2});
 const hook=chapter('hook');
 add({name:'Energy_question',start:hook.start+.5,end:hook.end-.3,headline:'风，怎样点亮一盏灯？',detail:'从力量的传递，到能量的旅程',distance:105,x:-45,y:25,width:83,size:5.5});
 const research=[
  {id:'o05',chapter:'overview',offset:.72,headline:'Zwind · 整机耦合分析',detail:'王立忠团队 · 浙江大学',eyebrow:'风 / 浪 / 土 / 结构 / 控制',distance:110,x:-35,y:29,width:85,size:4.5},
  {id:'w03',chapter:'wind',offset:.57,headline:'叶片弯了多少？',detail:'陈鹰、钱鹏团队 · 实时形变监测',eyebrow:'公开研究 · 可靠感知',distance:65,x:-20,y:4,width:48,size:3.1},
  {id:'c03',chapter:'converter',offset:.68,headline:'状态 → 判断 → 动作',detail:'司玉林 · 海上风电优化控制',eyebrow:'公开研究方向',distance:25,x:-8,y:3.5,width:25,size:1.45},
  {id:'k02',chapter:'cable',offset:.52,headline:'海缆变形监测',detail:'葛晗等指导 · 2024竞赛一等奖',distance:35,x:-17.5,y:3.5,width:18,size:1.7},
 ];
 for(const r of research){const s=sentence(r.id),ch=chapter(r.chapter);const start=s?.start??ch.start+(ch.end-ch.start)*r.offset,end=s?.end??ch.end-1;
  // The shore ascent sweeps past the original near-field cable title plane.
  // Place a concise two-line sign beside the sensor close-up; leave it before
  // the camera climbs through the water, rather than showing enormous edges.
  if(r.id==='k02')add({...r,name:'Research_'+r.id,start,end:Math.min(end,start+3.8),at:start+1.24,exitSide:1,outSeconds:2.4});
  else add({...r,name:'Research_'+r.id,start,end});
 }
 const end=chapter('ending');
 const next=(story.captions as any[]).find(c=>c.chapter==='ending'&&c.text.includes('下一集'));
 add({name:'Next_episode',start:(next?.start??end.start+5)-.4,end:end.end+1.2,headline:'风怎样让叶片转起来？',eyebrow:'下一期',detail:'从一块翼型开始',distance:180,x:-45,y:22,width:130,size:8.0});

 function text(parent:T.Group,value:string,size:number,y:number,mat:T.Material,maxWidth:number){
  const group=new T.Group();parent.add(group);let cursor=0;
  for(const char of value){
   const glyph=(font.data.glyphs as any)[char];if(!glyph)throw Error('Missing title glyph '+char);
   if(char!==' '){const geo=new TextGeometry(char,{font,size,depth:size*.055,curveSegments:5,bevelEnabled:true,bevelThickness:size*.009,bevelSize:size*.008,bevelSegments:2});
    const m=new T.Mesh(geo,[mat,side]);m.position.x=cursor;m.castShadow=true;m.receiveShadow=false;group.add(m);}
   cursor+=(glyph.ha/font.data.resolution+.035)*size;
  }
  const ratio=Math.min(1,maxWidth/Math.max(cursor,1));group.scale.setScalar(ratio);group.position.y=y;return group;
 }
 for(const cue of cues){
  const c=sampleCamera(cue.at??(cue.start+cue.end)/2,chapters),reference=new T.PerspectiveCamera(c.fov,16/9,.1,15000);
  reference.position.fromArray(c.position);reference.lookAt(new T.Vector3(...c.target));reference.updateMatrixWorld(true);
  const forward=reference.getWorldDirection(new T.Vector3()),right=new T.Vector3(1,0,0).applyQuaternion(reference.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(reference.quaternion);
  const root=new T.Group();root.name=cue.name;root.position.copy(reference.position).addScaledVector(forward,cue.distance).addScaledVector(right,cue.x).addScaledVector(up,cue.y);root.quaternion.copy(reference.quaternion);
  root.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-.045));
  const slider=new T.Group();root.add(slider);all.add(root);
  const s=cue.size*1.15;
  const isUnderwater=cue.name==='Research_k02';
  const isSeaBackdrop=cue.name==='Research_c03';
  text(slider,cue.headline,s,0,isUnderwater?face:isSeaBackdrop?seaIvory:skyInk,cue.width*1.15);
  // Ivory survives underwater absorption; navy stays legible against the sky.
  // Eyebrow and detail use exactly the same optical weight and material.
  const supportingMaterial=isUnderwater?underwaterSecondary:isSeaBackdrop?seaIvory:skyInk;
  if(cue.eyebrow)text(slider,cue.eyebrow,s*.42,s*1.34,supportingMaterial,cue.width*1.15);
  if(cue.detail)text(slider,cue.detail,s*.42,-s*.86,supportingMaterial,cue.width*1.15);
  const line=new T.Mesh(new T.BoxGeometry(s*.80,s*.027,s*.035),accent);line.position.set(s*.40,-s*1.12,.02);slider.add(line);
  // Offscreen endpoints come from their own camera times, not the mid-shot
  // camera. The old one-axis travel could already be inside the view on spawn.
  const inStart=Math.max(0,cue.start-3.8),inEnd=cue.start<1?3.8:cue.start+.4;
  const outStart=Math.max(inEnd+.8,cue.end-.3),outEnd=outStart+(cue.outSeconds??4.2);
  root.updateMatrixWorld(true);
  const localBox=new T.Box3();slider.traverse(o=>{if(!(o as T.Mesh).isMesh)return;const m=o as T.Mesh;m.geometry.computeBoundingBox();localBox.union(m.geometry.boundingBox!.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(root.matrixWorld.clone().invert(),m.matrixWorld)));});
  const center=localBox.getCenter(new T.Vector3()),radius=localBox.getSize(new T.Vector3()).length()*.5;
  const offscreen=(seconds:number,sideSign:number)=>{
   const p=sampleCamera(seconds,chapters),cam=new T.PerspectiveCamera(p.fov,16/9,.45,15000);cam.position.fromArray(p.position);cam.lookAt(new T.Vector3(...p.target));cam.updateMatrixWorld(true);
   const centerWorld=root.localToWorld(center.clone()),f=cam.getWorldDirection(new T.Vector3()),r=new T.Vector3(1,0,0).applyQuaternion(cam.quaternion),u=new T.Vector3(0,1,0).applyQuaternion(cam.quaternion);
   const depth=Math.max(cue.distance*.65,centerWorld.clone().sub(cam.position).dot(f)),halfWidth=Math.tan(T.MathUtils.degToRad(p.fov)*.5)*depth*16/9;
   const height=centerWorld.clone().sub(cam.position).dot(u);
   const point=cam.position.clone().addScaledVector(f,depth).addScaledVector(r,sideSign*(halfWidth+radius+halfWidth*.18)).addScaledVector(u,height);
   return root.worldToLocal(point).sub(center);
  };
  stations.push({root,slider,cue,entry:offscreen(inStart,1),exit:offscreen(outEnd,cue.exitSide??-1),inStart,inEnd,outStart,outEnd});anchors.push({name:cue.name,start:inStart,end:outEnd,position:root.position.toArray(),quaternion:root.quaternion.toArray()});
 }
 const update=(t:number)=>{for(const s of stations){const a=ease((t-s.inStart)/(s.inEnd-s.inStart)),b=ease((t-s.outStart)/(s.outEnd-s.outStart));
   s.slider.position.copy(s.entry).multiplyScalar(1-a).addScaledVector(s.exit,b);s.root.visible=t>=s.inStart&&t<=s.outEnd;s.root.updateMatrixWorld(true);
  }};
 const dispose=()=>{all.traverse(o=>{const m=o as T.Mesh;if(m.isMesh)m.geometry.dispose();});materials.forEach(m=>m.dispose());all.removeFromParent();};
 update(-20);return {update,dispose,anchors};
}
