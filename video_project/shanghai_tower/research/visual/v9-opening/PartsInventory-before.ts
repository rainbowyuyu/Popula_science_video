import * as T from 'three';
import namesData from './parts-names.json';
import {V,pulse,ramp,clamp} from './visual';

type Named={nameChinese:string;labelChinese:string;locationChinese:string;category:string;categoryChinese:string;displayLines:string[]};
const names=namesData as Record<string,Named>;
export type InventoryPart={id:string;role:string;root:T.Group;center:T.Vector3;offset:T.Vector3};
type Item={part:InventoryPart;name:Named;rotation:T.Quaternion;center:T.Vector3;size:T.Vector3;target:T.Vector3;label:T.Vector3};
type Block={role:string;category:string;title:string;items:Item[];width:number;height:number;origin:T.Vector3};
export type InventoryMark={id:string;lines:string[];x:number;y:number;weight:number;kind:'part'|'family';width:number};
const roleOrder=['raft','piles','diaphragm_wall','basement','soil','plaza','core','megacolumn','cornercolumn','outrigger','belt','connection','floors','floorbeams','inspectionfloor','outerglass','mullions','innerfacade','innerframe','facadesupport','spiralrib','garden','sky_lobby','crown','damper','damper_support','damper_cables','damper_plate','damper_magnets'];
const categoryOrder=['foundation','core','column','outrigger','belt','floor','facade','atrium','crown','environment'];
const headings:Record<string,string>={raft:'筏板',piles:'桩群',diaphragm_wall:'地下连续墙',basement:'地下室',soil:'地层',plaza:'地面',core:'核心筒',megacolumn:'巨柱',cornercolumn:'角柱',outrigger:'伸臂桁架',belt:'环带桁架',connection:'连接节点',floors:'楼板',floorbeams:'楼面梁',inspectionfloor:'检查楼面',outerglass:'外幕墙',mullions:'幕墙竖梃',innerfacade:'内幕墙',innerframe:'内层框架',facadesupport:'幕墙支撑',spiralrib:'螺旋肋',garden:'花园',sky_lobby:'空中大堂',crown:'塔冠',damper:'阻尼器',damper_support:'支架',damper_cables:'悬索',damper_plate:'铜板',damper_magnets:'磁体'};

/** Actual model meshes, laid in deterministic nonoverlapping rows at their
 * original shared scale. Transforming the presentation never edits geometry,
 * the structural mapping, solver samples, or component names. */
export class PartsInventory{
 readonly items:Item[]=[];readonly blocks:Block[]=[];
 readonly anchors:Record<string,number[]>={};
 readonly bounds=new T.Box3();readonly centre=V();
 readonly studyRole=new Map<string,string>();
 constructor(parts:InventoryPart[]){
  const byRole=new Map<string,Item[]>();
  for(const part of parts){
   const name=names[part.id];if(!name)throw new Error('Unlabelled inventory component: '+part.id);
   const box=new T.Box3().setFromObject(part.root),size=box.getSize(V());
   const dimensions=size.toArray(),thin=dimensions.indexOf(Math.min(...dimensions));
   const rotation=new T.Quaternion();
   if(thin===0)rotation.setFromAxisAngle(V(0,0,1),Math.PI/2);
   if(thin===2)rotation.setFromAxisAngle(V(1,0,0),-Math.PI/2);
   const corners:T.Vector3[]=[];
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(V(x,y,z).sub(part.center).applyQuaternion(rotation));
   let flatBox=new T.Box3().setFromPoints(corners),flatSize=flatBox.getSize(V());
   if(flatSize.z>flatSize.x){rotation.premultiply(new T.Quaternion().setFromAxisAngle(V(0,1,0),Math.PI/2));corners.forEach(p=>p.applyAxisAngle(V(0,1,0),Math.PI/2));flatBox=new T.Box3().setFromPoints(corners);flatSize=flatBox.getSize(V());}
   const item:Item={part,name,rotation,center:flatBox.getCenter(V()),size:flatSize,target:V(),label:V()};
   this.items.push(item);if(!byRole.has(part.role))byRole.set(part.role,[]);byRole.get(part.role)!.push(item);
  }
  // Group related assemblies; each item retains its own reserved rectangle.
  // Five shallow columns make the overview read as an engineering parts table.
  const columnWidth=5.6,gap=.7,heights=Array(5).fill(0) as number[];
  for(const role of roleOrder){
   const items=(byRole.get(role)??[]).sort((a,b)=>a.part.id.localeCompare(b.part.id));if(!items.length)continue;
   let x=0,z=.55,row=0;
   for(const item of items){const w=Math.max(.30,item.size.x+.17),d=Math.max(.24,item.size.z+.24);
    if(x+w>columnWidth&&x>0){x=0;z+=row+.08;row=0;}
    item.target.set(x+w/2,.10+item.size.y/2,z+item.size.z/2);item.label.set(x+w/2,.12,z+item.size.z+.105);x+=w;row=Math.max(row,d);
   }
   const height=z+row+.25,col=heights.indexOf(Math.min(...heights)),origin=V(col*(columnWidth+gap),0,heights[col]);heights[col]+=height+gap;
   const block:Block={role,category:items[0].name.category,title:headings[role]??items[0].name.categoryChinese,items,width:columnWidth,height,origin};this.blocks.push(block);
   for(const item of items){item.target.add(origin);item.label.add(origin);this.bounds.expandByPoint(item.target.clone().add(V(item.size.x/2,item.size.y/2,item.size.z/2)));this.bounds.expandByPoint(item.target.clone().sub(V(item.size.x/2,item.size.y/2,item.size.z/2)));}
  }
  if(this.items.length!==parts.length||new Set(this.items.map(x=>x.part.id)).size!==parts.length)throw new Error('Inventory must contain every unique semantic part');
  const shift=this.bounds.getCenter(V()).setY(0);
  this.items.forEach(x=>{x.target.sub(shift);x.label.sub(shift);});this.blocks.forEach(b=>b.origin.sub(shift));this.bounds.translate(shift.clone().negate());this.bounds.getCenter(this.centre);
  this.anchors.inventoryOverview=this.centre.toArray().map(v=>v*100);
  for(const block of this.blocks)this.anchors['inventory_'+block.role]=block.origin.clone().add(V(block.width/2,.2,block.height/2)).toArray().map(v=>v*100);
  // A foreground study row reuses selected originals from the complete atlas,
  // without duplicating or enlarging geometry. It lets the camera read the
  // load-path families in one lateral motion, with clear space for names.
  const studies:Record<string,string[]>={
   outerglass:['ENVELOPE_Z04_S03_GLASS','ENVELOPE_Z04_S04_GLASS'],
   floors:['FLOORS_Z04_FRONT'],floorbeams:['FLOOR_BEAMS_Z04'],
   outrigger:['FE_M_Z04_C03_OB','FE_M_Z04_C03_OT','FE_M_Z04_C03_OX1','FE_M_Z04_C03_OX2'],
   belt:['FE_M_Z04_C03_BBA','FE_M_Z04_C03_BTA','FE_M_Z04_C03_BX1A','FE_M_Z04_C03_BX2A'],
   megacolumn:['MEGACOL_Z04_C03','MEGACOL_Z04_C04'],core:['CORE_Z04_W1','CORE_Z04_CELLS']};
  const studyZ=this.bounds.max.z+2.3;
  for(const [index,[role,ids]] of Object.entries(studies).entries()){
   const members=ids.map(id=>{const item=this.items.find(x=>x.part.id===id);if(!item)throw new Error('Missing atlas study '+id);return item;});
   const small=role==='outrigger'||role==='belt',cx=(index-3)*2.2+(role==='core'?.6:0);
   members.forEach((item,k)=>{
    this.studyRole.set(item.part.id,role);
    const x=members.length===1?cx:cx+(k%2-.5)*(small?.78:1.55),z=studyZ+Math.floor(k/2)*(small?.65:1.4);
    item.target.set(x,.10+item.size.y/2,z);item.label.set(x,.12,z+item.size.z/2+(small?.17:.16));
   });
   const focus=members.reduce((v,item)=>v.add(item.target),V()).multiplyScalar(1/members.length).setY(.18).add(V(0,0,.30));
   this.anchors['inventoryDetail_'+role]=focus.toArray().map(v=>v*100);
  }
  const bridge=this.items.find(x=>x.part.id==='MEGACOL_Z04_C05')!;
  this.studyRole.set(bridge.part.id,'columnBridge');
  bridge.target.set(-1.1,.10+bridge.size.y/2,studyZ+.3);bridge.label.set(-1.1,.12,studyZ+.3+bridge.size.z/2+.15);
  this.anchors.inventoryDetail_columnBridge=bridge.target.clone().setY(.18).add(V(0,0,.30)).toArray().map(v=>v*100);
  this.bounds.makeEmpty();for(const item of this.items){this.bounds.expandByPoint(item.target.clone().addScaledVector(item.size,.5));this.bounds.expandByPoint(item.target.clone().addScaledVector(item.size,-.5));}
  this.bounds.getCenter(this.centre);this.anchors.inventoryOverview=this.centre.toArray().map(v=>v*100);
 }
 weight(cue:number){return pulse(1.02,1.38,4.55,4.97,cue);}
 apply(cue:number){
  const weight=this.weight(cue);
  for(const item of this.items){const p=item.part;
   p.root.quaternion.identity().slerp(item.rotation,weight);
   const target=item.target.clone().sub(item.center).sub(p.center.clone().applyQuaternion(p.root.quaternion));
   p.root.position.lerp(target,weight);p.offset.copy(p.root.position);
   // Geological teaching volumes also occupy named slots in the full atlas.
   // They leave with the same geometry transform, never a random visibility cut.
   if(/^SOIL/.test(p.id))p.root.visible=weight>.00001;
  }
 }
 marks(camera:T.PerspectiveCamera,cue:number):InventoryMark[]{
  const weight=this.weight(cue)*pulse(1.30,1.38,4.45,4.55,cue);if(weight<.002)return [];
  const result:InventoryMark[]=[],boxes:number[][]=[];
  const project=(p:T.Vector3)=>{const q=p.clone().project(camera);return {x:(q.x+1)*960,y:(1-q.y)*540,z:q.z};};
  const fits=(x:number,y:number,w:number,h:number)=>x-w/2>62&&x+w/2<1860&&y>170&&y+h<908&&!boxes.some(([a,b,c,d])=>x-w/2<c+18&&x+w/2>a-18&&y<d+12&&y+h>b-12);
  // A nearby mesh receives its complete Chinese identifier. Distant geometry
  // stays visible; its labels resolve on approach instead of becoming tiny type.
  const windows:Record<string,[number,number,number,number]>={outerglass:[1.68,1.78,2.28,2.36],floors:[2.28,2.37,2.46,2.53],floorbeams:[2.43,2.50,2.62,2.70],columnBridge:[2.59,2.67,2.84,2.99],outrigger:[2.94,3.03,3.47,3.58],belt:[3.54,3.65,3.77,3.87],megacolumn:[3.75,3.85,3.94,4.02],core:[3.92,4.00,4.22,4.37]};
  const candidates=this.items.map(item=>{const p=project(item.label),edge=project(item.label.clone().add(V(Math.max(.32,item.size.x),0,0))),family=this.studyRole.get(item.part.id),focus=family?pulse(...windows[family],cue):0;return {item,p,focus,pixels:Math.hypot(edge.x-p.x,edge.y-p.y)};}).filter(x=>x.p.z>0&&x.p.z<1&&x.focus>.001).sort((a,b)=>b.focus-a.focus||Math.hypot(a.p.x-1060,a.p.y-510)-Math.hypot(b.p.x-1060,b.p.y-510));
  for(const {item,p,pixels,focus} of candidates){const lines=[item.name.labelChinese,item.name.locationChinese];const width=Math.max(...lines.map(x=>x.length))*36+20;
   if(result.length>=4||!fits(p.x,p.y,width,94))continue;
   const edge=ramp(25,55,p.x-width/2)*ramp(25,55,1920-p.x-width/2)*ramp(150,190,p.y)*ramp(0,45,916-p.y-94);result.push({id:item.part.id,lines,x:p.x,y:p.y,weight:weight*focus*edge,kind:'part',width});boxes.push([p.x-width/2,p.y,p.x+width/2,p.y+94]);
  }
  if(result.length)return result;
  // The wide establishing view shows a small, readable selection of headings.
  const overviewRoles=new Set(['core','megacolumn','outrigger','belt','floors','outerglass']);
  for(const b of this.blocks){const p=project(b.origin.clone().add(V(b.width/2,.15,.10))),left=project(b.origin),right=project(b.origin.clone().add(V(b.width,0,0))),pixels=Math.hypot(left.x-right.x,left.y-right.y),width=b.title.length*42+110;
   if(!overviewRoles.has(b.role)||result.length>=6)continue;
   if(p.z<0||p.z>1||pixels<140||!fits(p.x,p.y,width,52))continue;
   const headerWeight=weight*ramp(100,170,pixels);result.push({id:'group_'+b.role,lines:[b.title],x:p.x,y:p.y,weight:headerWeight,kind:'family',width});boxes.push([p.x-width/2,p.y,p.x+width/2,p.y+52]);
  }
  return result;
 }
}
