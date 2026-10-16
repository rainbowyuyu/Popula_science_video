import * as T from 'three';
import namesData from './parts-names.json';
import {OPENING_FLOOR,type OpeningStudyKey} from './OpeningCamera';
import {V,pulse,ramp,Timeline} from './visual';

export type InventoryPart={id:string;role:string;root:T.Group;center:T.Vector3;offset:T.Vector3};
export type InventoryMark={id:string;lines:string[];x:number;y:number;weight:number;kind:'part'|'family';width:number;anchor?:{x:number;y:number}};
export type OpeningSection={active:number;minY:number;maxY:number;focusWeight:number};
type Study={key:OpeningStudyKey;ids:string[];move:T.Vector3;legacyAnchor:T.Vector3;enter:[number,number];return:[number,number];label:[number,number,number,number];title:string;parts:InventoryPart[];pivot:T.Vector3;target:T.Vector3};
type StudyDefinition=Omit<Study,'parts'|'pivot'|'target'>;
const names=namesData as Record<string,{labelChinese:string;locationChinese:string}>;
const frameRoles=new Set(['megacolumn','cornercolumn','outrigger','belt','connection']);
const studyDefinitions:StudyDefinition[]=[
 {key:'outerglass',ids:['ENVELOPE_Z04_S03_GLASS','ENVELOPE_Z04_S03_MULLIONS','ENVELOPE_Z04_S04_GLASS','ENVELOPE_Z04_S04_MULLIONS'],legacyAnchor:V(4.50,2.10,2.30),enter:[488,535],return:[604,652],label:[521,542,604,627],title:'外幕墙 · 玻璃与边框',move:V(-.15,.018,.085)},
 {key:'floors',ids:['FLOORS_Z04_FRONT','FLOORS_Z04_BACK'],legacyAnchor:V(4.50,2.16,2.30),enter:[616,656],return:[690,735],label:[645,660,690,712],title:'楼板',move:V(0,.115,.065)},
 {key:'floorbeams',ids:['FLOOR_BEAMS_Z04'],legacyAnchor:V(4.50,2.13,2.30),enter:[695,734],return:[755,797],label:[724,739,755,778],title:'楼面梁',move:V(0,-.055,0)},
 {key:'columnBridge',ids:['MEGACOL_Z04_C05'],legacyAnchor:V(4.50,2.13,2.30),enter:[757,797],return:[885,928],label:[784,799,885,908],title:'巨柱',move:V(-.115,.020,0)},
 {key:'outrigger',ids:['FE_M_Z04_C03_OB','FE_M_Z04_C03_OT','FE_M_Z04_C03_OX1','FE_M_Z04_C03_OX2'],legacyAnchor:V(4.50,2.32,2.30),enter:[904,955],return:[1225,1274],label:[939,966,1225,1245],title:'伸臂桁架',move:V(0,.008,-.15)},
 {key:'belt',ids:['FE_M_Z04_C03_BBA','FE_M_Z04_C03_BTA','FE_M_Z04_C03_BX1A','FE_M_Z04_C03_BX2A'],legacyAnchor:V(4.50,2.32,2.30),enter:[1232,1265],return:[1310,1352],label:[1251,1270,1310,1332],title:'环带桁架',move:V(-.065,.006,-.075)},
 {key:'megacolumn',ids:['MEGACOL_Z04_C03','MEGACOL_Z04_C04'],legacyAnchor:V(4.50,2.14,2.30),enter:[1303,1344],return:[1399,1442],label:[1330,1348,1395,1414],title:'巨柱',move:V(0,.008,-.065)},
 {key:'core',ids:['CORE_Z04_W1','CORE_Z04_W2','CORE_Z04_W3','CORE_Z04_W4','CORE_Z04_CELLS'],legacyAnchor:V(4.50,2.13,2.30),enter:[1435,1478],return:[1628,1692],label:[1462,1485,1621,1645],title:'核心筒',move:V(0,.032,0)},
];
/** Authored screen-space reading positions for each camera study. The source
 * anchor still follows the real component, but neither text nor leader side
 * depends on which side of the exact screen centre that anchor projects to.
 * In particular, the core is centred on the optical axis: numerical noise
 * there must never turn into a 1070 px left/right label jump. Fixed positions
 * also remain identical on reverse seeks and parallel Remotion renders. */
const studyLabelPositions:Record<OpeningStudyKey,{x:number;y:number}>={
 outerglass:{x:420,y:735},
 floors:{x:420,y:735},
 floorbeams:{x:1490,y:735},
 columnBridge:{x:420,y:735},
 outrigger:{x:420,y:735},
 belt:{x:420,y:735},
 megacolumn:{x:420,y:735},
 core:{x:420,y:235},
};

/** Intersect actual triangles with both local horizontal planes. Box3 clamped
 * in Y is insufficient: the twisted 65 m facade's broad bounds are not those
 * of the visible story, and would pull labels away from their true anchor. */
function sectionBounds(root:T.Group,minY:number,maxY:number):T.Box3{
 const box=new T.Box3();root.updateMatrixWorld(true);
 root.traverse(object=>{
  if(!(object instanceof T.Mesh))return;
  const position=object.geometry.getAttribute('position'),index=object.geometry.getIndex();
  if(!position)return;
  const vertex=(i:number)=>V(position.getX(i),position.getY(i),position.getZ(i)).applyMatrix4(object.matrixWorld);
  const clip=(polygon:T.Vector3[],height:number,above:boolean)=>{
   const result:T.Vector3[]=[];
   for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],ia=above?a.y>=height:a.y<=height,ib=above?b.y>=height:b.y<=height;
    if(ia)result.push(a);
    if(ia!==ib)result.push(a.clone().lerp(b,(height-a.y)/(b.y-a.y)));
   }
   return result;
  };
  const count=index?index.count:position.count;
  for(let i=0;i<count;i+=3){
   const triangle=[vertex(index?index.getX(i):i),vertex(index?index.getX(i+1):i+1),vertex(index?index.getX(i+2):i+2)];
   for(const p of clip(clip(triangle,minY,true),maxY,false))box.expandByPoint(p);
  }
 });
 return box;
}

/** Choreography of ONE original storey. All parts keep their source vertices,
 * solver IDs and scale. Moving clipping planes follow the original root, so
 * local disassembly never reveals another storey or substitutes a replica. */
export class PartsInventory{
 readonly items:{part:InventoryPart}[]=[];readonly anchors:Record<string,number[]>={};
 readonly bounds=new T.Box3();readonly centre=V();readonly studies:Study[]=[];
 private readonly selected=new Map<string,Study>();private readonly motions=new Map<string,T.Vector3>();
 private readonly frameCache=new Map<number,number>();private readonly partById=new Map<string,InventoryPart>();
 private readonly storyBounds=new Map<string,T.Box3>();private readonly strengthBounds=new Map<string,T.Box3>();
 constructor(parts:InventoryPart[],private readonly timeline?:Timeline){
  for(const part of parts){
   if(!names[part.id])throw new Error('Unlabelled component '+part.id);
   if(this.partById.has(part.id))throw new Error('Duplicate component '+part.id);
   this.partById.set(part.id,part);this.items.push({part});this.bounds.union(new T.Box3().setFromObject(part.root));
   if(/_Z04(?:_|$)/.test(part.id)){
    this.storyBounds.set(part.id,sectionBounds(part.root,OPENING_FLOOR.minY,OPENING_FLOOR.maxY));
    if(frameRoles.has(part.role))this.strengthBounds.set(part.id,sectionBounds(part.root,OPENING_FLOOR.minY,OPENING_FLOOR.strengthMaxY));
   }
  }
  this.bounds.getCenter(this.centre);
  for(const p of parts)this.motions.set(p.id,this.makeMotion(p));
  for(const d of studyDefinitions){
   const selected=d.ids.map(id=>{const p=this.partById.get(id);if(!p)throw new Error('Missing opening study '+id);return p;});
   const box=new T.Box3();selected.forEach(p=>box.union(this.sourceBounds(p,d.key==='outrigger'||d.key==='belt')));
   if(box.isEmpty())throw new Error('No actual geometry in floor study '+d.key);
   const pivot=box.getCenter(V()),study:Study={...d,parts:selected,pivot,target:pivot.clone().add(d.move)};
   this.studies.push(study);selected.forEach(p=>this.selected.set(p.id,study));
   this.anchors['inventoryDetail_'+d.key]=d.legacyAnchor.toArray().map(v=>v*100);
  }
  this.anchors.inventoryOverview=[0,300,0];
 }
 private sourceBounds(p:InventoryPart,strength=false){return (strength?this.strengthBounds.get(p.id):undefined)??this.storyBounds.get(p.id)??new T.Box3();}
 private frameAt(cue:number){
  const cached=this.frameCache.get(cue);if(cached!==undefined)return cached;
  const n=Math.floor(cue),clip=this.timeline?.clips.find(c=>Number(c.id.slice(1))===n),fallback=[0,12,488,904,1435,1786];
  const value=clip?clip.start+(clip.end-clip.start)*(cue-n):n>=5?1786:n<1?0:fallback[n]+(fallback[n+1]-fallback[n])*(cue-n);
  this.frameCache.set(cue,value);return value;
 }
 weight(cue:number){return cue>=5?0:1-ramp(1628,1692,this.frameAt(cue));}
 materialWeight(cue:number){return cue>=5?0:pulse(170,230,1628,1692,this.frameAt(cue));}
 sectionFor(cue:number,role?:string):OpeningSection|null{
  if(cue>=5)return null;const f=this.frameAt(cue);if(f<448||f>=1786)return null;
  // The opening first lands on the complete tower, then explodes it as a
  // spatial overview. As the fan-out settles, the crop planes ease from the
  // full-height bounds into the measured 230 m story over the same final
  // camera approach. This prevents a white rim or a hard crop flash at the
  // handoff to the first-floor component explanation.
  const active=f<488?ramp(448,488,f):f<1628?1:1-ramp(1628,1692,f),strength=frameRoles.has(role??'')?pulse(864,955,1399,1460,f):0;
  return {active,minY:T.MathUtils.lerp(-1.1,OPENING_FLOOR.minY,active),maxY:T.MathUtils.lerp(6.8,T.MathUtils.lerp(OPENING_FLOOR.maxY,OPENING_FLOOR.strengthMaxY,strength),active),focusWeight:active};
 }
 private studyWeight(study:Study,f:number){return pulse(...study.enter,...study.return,f);}
 studyWeightFor(id:string,cue:number){const s=this.selected.get(id);return cue>=5||!s?0:this.studyWeight(s,this.frameAt(cue));}
 opacityFor(id:string,cue:number){
  if(cue>=5)return 1;const p=this.partById.get(id);if(!p)return 1;
  const f=this.frameAt(cue),material=this.materialWeight(cue),study=this.selected.get(id),active=study?this.studyWeight(study,f):0;
  let subdued=1,focused=1;
  if(p.role==='outerglass'||p.role==='innerfacade'){subdued=.14;focused=.70;}
  else if(p.role==='mullions'||p.role==='spiralrib'||p.role==='innerframe'||p.role==='facadesupport'){subdued=.40;focused=.94;}
  if(p.role==='floors')subdued*=1-.76*pulse(686,734,835,904,f);
  if(p.role==='core'&&/_W[24]$/.test(id))focused*=1-.78*pulse(1462,1498,1602,1628,f);
  return 1-material*(1-(subdued+(focused-subdued)*active));
 }
 focusFor(cue:number):{key:OpeningStudyKey;source:T.Vector3;target:T.Vector3;weight:number}|null{
  if(cue>=5)return null;const f=this.frameAt(cue),current=this.studies.map(study=>({study,weight:pulse(...study.label,f)})).sort((a,b)=>b.weight-a.weight)[0];
  if(!current||current.weight<.001)return null;
  return {key:current.study.key,source:current.study.pivot.clone(),target:current.study.target.clone(),weight:current.weight};
 }
 private makeMotion(p:InventoryPart){
  const v=V();if(!/_Z04(?:_|$)/.test(p.id))return v;
  const box=this.sourceBounds(p),center=box.isEmpty()?p.center:box.getCenter(V()),radial=V(center.x,0,center.z);
  if(radial.lengthSq()>1e-9)radial.normalize();
  if(p.role==='outerglass'||p.role==='mullions'||p.role==='spiralrib')v.addScaledVector(radial,.18);
  else if(p.role==='innerfacade'||p.role==='innerframe')v.addScaledVector(radial,.09);
  else if(p.role==='floors')v.set(/_FRONT$/.test(p.id)?.045:-.045,.11,/_FRONT$/.test(p.id)?.055:-.055);
  else if(p.role==='floorbeams')v.y=-.055;
  else if(p.role==='megacolumn'||p.role==='cornercolumn')v.addScaledVector(radial,.085);
  else if(p.role==='core'&&/_W\d$/.test(p.id))v.addScaledVector(radial,.05);
  return v;
 }
 private superExplodeOffset(p:InventoryPart,weight:number){
  if(weight<=.0001)return V();
  // A restrained radial fan keeps the entire registered tower recognizable
  // while separating the real zone groups.  The offset is presentation-only;
  // source vertices, solver coordinates and part proportions stay untouched.
  const radial=V(p.center.x-this.centre.x,0,p.center.z-this.centre.z);
  const zone=Number(/_Z(\d+)/.exec(p.id)?.[1]??1);
  if(radial.lengthSq()<1e-8)radial.set(Math.cos(zone*.9),0,Math.sin(zone*.9));
  radial.normalize();
  const role=p.role;
  const spread=role==='core' ? .24 :
    (role==='floors'||role==='floorbeams') ? .42 :
    (role==='outrigger'||role==='belt'||role==='connection') ? .62 :
    (role==='megacolumn'||role==='cornercolumn') ? .52 :
    (role==='outerglass'||role==='innerfacade'||role==='mullions'||role==='spiralrib') ? .34 : .20;
  const level=T.MathUtils.clamp((p.center.y-this.centre.y)*.22,-.52,.52);
  return radial.multiplyScalar(spread*weight).add(V(0,level*weight,0));
 }
 apply(cue:number){
  // World resets original rigid transforms before invoking this override.
  // Later physics owns those transforms after this isolated opening ends.
  if(cue>=5)return;const f=this.frameAt(cue),overview=pulse(216,294,415,488,f),superExplode=pulse(230,300,418,488,f);
  for(const {part:p} of this.items){
   p.root.quaternion.identity();p.root.position.copy(this.motions.get(p.id)!).multiplyScalar(overview);
   p.root.position.add(this.superExplodeOffset(p,superExplode));
   const study=this.selected.get(p.id),out=study?this.studyWeight(study,f):0;
   if(study)p.root.position.addScaledVector(study.move,out);
   if(p.role==='floors'&&/_Z04(?:_|$)/.test(p.id))p.root.position.y+=.10*pulse(686,734,835,904,f);
   if(study?.key==='core'&&/_W\d$/.test(p.id)){
    const box=this.sourceBounds(p),radial=box.getCenter(V()).sub(study.pivot).setY(0).normalize();
    p.root.position.addScaledVector(radial,.045*pulse(1490,1518,1602,1626,f)*out);
   }
   const spread=study?.key==='outrigger'?.022*pulse(968,993,1114,1148,f)*out:study?.key==='belt'?.014*pulse(1248,1262,1268,1284,f)*out:0;
   if(spread){
    if(/_OT$|_BTA$/.test(p.id))p.root.position.y+=spread;
    if(/_OB$|_BBA$/.test(p.id))p.root.position.y-=spread;
    if(/X1/.test(p.id))p.root.position.x+=spread*.45;
    if(/X2/.test(p.id))p.root.position.x-=spread*.45;
   }
   p.offset.copy(p.root.position);if(/^SOIL/.test(p.id))p.root.visible=false;
  }
 }
 marks(camera:T.PerspectiveCamera,cue:number):InventoryMark[]{
  if(cue>=5)return [];const f=this.frameAt(cue),overview=pulse(286,307,405,424,f);
  if(overview>.005)return [{id:'overview_floor',lines:['全楼拆解','九个竖向分区'],x:1470,y:195,weight:overview,kind:'family',width:550}];
  const current=this.studies.map(study=>({study,weight:pulse(...study.label,f)})).filter(v=>v.weight>.005).sort((a,b)=>b.weight-a.weight)[0];
  if(!current)return [];const {study,weight}=current,box=new T.Box3(),strength=study.key==='outrigger'||study.key==='belt'||(frameRoles.has(study.parts[0].role)&&f>955&&f<1399);
  study.parts.forEach(p=>{p.root.updateMatrixWorld(true);box.union(this.sourceBounds(p,strength).clone().applyMatrix4(p.root.matrixWorld));});
  if(box.isEmpty())return [];
  const center=box.getCenter(V()).project(camera);if(center.z<0||center.z>1)return [];
  const anchor={x:(center.x+1)*960,y:(1-center.y)*540},{x,y}=studyLabelPositions[study.key];
  return [{id:'study_'+study.key,lines:[study.title,study.key==='outrigger'||study.key==='belt'?'第四区 · 两层加强区':'第四区 · 约230米层'],x,y,weight,kind:'part',width:560,anchor}];
 }
}
