import * as T from 'three';
import {Line2} from 'three/examples/jsm/lines/Line2.js';
import {LineGeometry} from 'three/examples/jsm/lines/LineGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {PhysicsPlayback, WIND_MAGNIFICATION} from './PhysicsPlayback';
import {MemberForceVisualization} from './MemberForceVisualization';
import {EnvironmentPlayback} from './EnvironmentPlayback';
import {C, V, State, Label, pulse, clamp, ramp} from './visual';

export type SpatialAnnotation={id:string;point:T.Vector3;title:string;value?:string;color?:string;weight:number;side?:number;lift?:number;offsetPx?:number;maxLabelY?:number};
type Board={root:T.Group;label:T.Mesh;texture:T.CanvasTexture;canvas:HTMLCanvasElement;leader:T.Mesh;dot:T.Mesh;last:string;inkHalf:number};

/** World anchors and world leaders; text is camera-facing to remain readable.
 * The physical point never moves to make room for a label. Only its label end
 * is offset in the current camera plane. No annotation is a screen dashboard. */
export class SpatialAnnotationLayer{
 root=new T.Group();boards=new Map<string,Board>();
 constructor(scene:T.Scene){this.root.name='registered-engineering-annotations';scene.add(this.root);}
 private board(id:string){
  let b=this.boards.get(id);if(b)return b;
  const canvas=document.createElement('canvas');canvas.width=800;canvas.height=216;
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  // Keep text legible through a foreground member. The depth-tested leader
  // and dot still identify the real physical anchor; only lettering is exempt.
  const material=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,side:T.DoubleSide});
  const label=new T.Mesh(new T.PlaneGeometry(1,216/800),material);
  label.renderOrder=100;
  const leader=new T.Mesh(new T.CylinderGeometry(1,1,1,12),new T.MeshBasicMaterial({color:C.teal,toneMapped:false}));
  const dot=new T.Mesh(new T.SphereGeometry(1,14,10),new T.MeshBasicMaterial({color:C.teal,toneMapped:false}));
  const root=new T.Group();root.name=id;root.add(leader,dot,label);this.root.add(root);
  b={root,label,texture,canvas,leader,dot,last:'',inkHalf:0};this.boards.set(id,b);return b;
 }
 update(camera:T.PerspectiveCamera,annotations:SpatialAnnotation[]){
  this.boards.forEach(b=>b.root.visible=false);
  const right=V().setFromMatrixColumn(camera.matrixWorld,0),up=V().setFromMatrixColumn(camera.matrixWorld,1),front=V().setFromMatrixColumn(camera.matrixWorld,2);
  for(const a of annotations){
   if(a.weight<=.001)continue;
   const clip=a.point.clone().project(camera);if(clip.z<0||clip.z>1)continue;
   const b=this.board(a.id),w=clamp(a.weight),depth=Math.max(.06,-a.point.clone().applyMatrix4(camera.matrixWorldInverse).z);
   const unit=2*depth*Math.tan(T.MathUtils.degToRad(camera.fov)/2)/1080;
   const side=a.side??(clip.x>.22?-1:1),width=a.value?420:360;
   let dx=side*(a.offsetPx??width*.48+64),dy=a.lift??75;
   // First protect the reading margins; as the anchor leaves the picture,
   // carry its lettering completely offscreen before culling it.
   const x=(clip.x+1)*960,y=(1-clip.y)*540;
   const travel=(d:number)=>Math.max(0,d)*ramp(0,100,d)*4;
   const labelX=T.MathUtils.clamp(x+dx,width*.5+36,1884-width*.5)-travel(100-x)+travel(x-1820);
   const labelY=T.MathUtils.clamp(y-dy,195,a.maxLabelY??840)-travel(100-y)+travel(y-900);
   if((x<0&&labelX+width/2<0)||(x>1920&&labelX-width/2>1920)||(y<0&&labelY+80<0)||(y>1080&&labelY-80>1080))continue;
   dx=labelX-x;dy=y-labelY;
   const end=a.point.clone().addScaledVector(right,dx*unit).addScaledVector(up,dy*unit).addScaledVector(front,unit*18);
   const tint=a.color??C.teal,key=[a.title,a.value??'',tint].join('|');
   if(key!==b.last){
    const ctx=b.canvas.getContext('2d')!;ctx.clearRect(0,0,800,216);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
    ctx.strokeStyle='rgba(243,241,236,.96)';ctx.lineWidth=10;
    ctx.font=`600 ${a.value?70:84}px "Rainbow Sans","Microsoft YaHei",sans-serif`;
    ctx.strokeText(a.title,400,a.value?68:110,778);ctx.fillStyle=C.ink;ctx.fillText(a.title,400,a.value?68:110,778);
    b.inkHalf=Math.min(778,ctx.measureText(a.title).width)/2;
    if(a.value){ctx.font='650 84px "Rainbow Sans","Microsoft YaHei",sans-serif';ctx.strokeText(a.value,400,160,780);ctx.fillStyle=tint;ctx.fillText(a.value,400,160,780);b.inkHalf=Math.max(b.inkHalf,Math.min(780,ctx.measureText(a.value).width)/2);}
    b.last=key;b.texture.needsUpdate=true;
   }
   b.root.visible=true;b.label.position.copy(end);b.label.quaternion.copy(camera.quaternion);
   b.label.scale.setScalar(unit*width*(.84+.16*w));(b.label.material as T.MeshBasicMaterial).opacity=w;
   // Meet the outside edge of the lettering, never run through the number.
   const leadEnd=end.clone().addScaledVector(right,-Math.sign(dx||side)*unit*(b.inkHalf*width/800+16));
   const target=a.point.clone().lerp(leadEnd,w),d=target.clone().sub(a.point),length=d.length();
   b.leader.position.copy(a.point).add(target).multiplyScalar(.5);b.leader.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());
   b.leader.scale.set(unit*1.25,Math.max(.00001,length),unit*1.25);
   (b.leader.material as T.MeshBasicMaterial).color.set(tint);b.dot.position.copy(a.point);b.dot.scale.setScalar(unit*4.5*w);(b.dot.material as T.MeshBasicMaterial).color.set(tint);
  }
 }
 dispose(){this.root.removeFromParent();this.boards.forEach(b=>{b.texture.dispose();for(const m of [b.label,b.leader,b.dot]){m.geometry.dispose();(m.material as T.Material).dispose();}});this.boards.clear();}
}

function line(color:string,width:number,dashed=false){
 const material=new LineMaterial({color,linewidth:width,transparent:true,opacity:1,depthTest:true,depthWrite:false,dashed,dashSize:.018,gapSize:.015});
 material.resolution.set(1920,1080);material.toneMapped=false;
 const l=new Line2(new LineGeometry().setPositions([0,0,0,.001,0,0]),material);l.frustumCulled=false;return l;
}
function points(l:Line2,p:T.Vector3[],weight=1){l.geometry.setPositions(p.flatMap(v=>v.toArray()));l.computeLineDistances();l.material.opacity=weight;l.visible=weight>.001;}
type DriftGlyph={node:number;reference:Line2;deformed:Line2;dimension:Line2;spoke:Line2;dot:T.Mesh};

/** Physical glyphs are sampled from the same solver arrays as the building.
 * The 48x enlargement applies only to displayed displacement, never the value. */
export class SpatialEngineering{
 root=new T.Group();annotations:SpatialAnnotationLayer;drifts:DriftGlyph[]=[];
 constructor(public scene:T.Scene,public physics:PhysicsPlayback){
  this.annotations=new SpatialAnnotationLayer(scene);
  this.root.name='computed-structural-spatial-glyphs';scene.add(this.root);
  for(const h of [100,300,580]){
   let node=-1,delta=Infinity;physics.data.nodes.forEach((n,i)=>{if((n.role==='core'||n.role==='diaphragm')&&Math.abs(n.xyz[1]-h)<delta){delta=Math.abs(n.xyz[1]-h);node=i;}});
   if(node<0)throw new Error('Missing computed core node for displacement section');
   const reference=line('#8a989c',2,true),deformed=line('#147e94',3.4),dimension=line('#be7e40',3.5),spoke=line('#147e94',2.4);
   const dot=new T.Mesh(new T.SphereGeometry(.016,16,12),new T.MeshBasicMaterial({color:'#147e94',toneMapped:false}));
   this.root.add(reference,deformed,dimension,spoke,dot);this.drifts.push({node,reference,deformed,dimension,spoke,dot});
  }
 }
 update(s:State,camera:T.PerspectiveCamera,baseLabels:Label[],memberForces:MemberForceVisualization|undefined,effects:EnvironmentPlayback|undefined,parts:{id:string;center:T.Vector3;root:T.Group}[],flow:SpatialAnnotation[]=[]){
  const cue=s.n+s.u,labels:SpatialAnnotation[]=baseLabels.map((l,i)=>({id:'part-'+l.text+String(i),point:l.point,title:l.text,color:l.color,weight:l.weight??1,side:l.side==='left'?-1:1,...(l.text==='筏板'?{offsetPx:425,lift:50}:l.text==='软黏土层'?{offsetPx:190,lift:12}:l.text==='固定铜板'?{offsetPx:360,lift:35}:{})}));
  const driftWeight=Math.max(pulse(13.05,13.18,13.72,13.99,cue),pulse(32.67,32.85,33.45,33.77,cue));
  this.root.visible=driftWeight>.001;
  const right=V().setFromMatrixColumn(camera.matrixWorld,0),front=V().setFromMatrixColumn(camera.matrixWorld,2).setY(0).normalize();
  this.drifts.forEach((g,i)=>{
   const node=this.physics.data.nodes[g.node],center=V(...node.xyz as [number,number,number]).multiplyScalar(.01),r=(.43-.16*center.y/6.32),shift=this.physics.displacementAt(center);
   const rest:T.Vector3[]=[],moved:T.Vector3[]=[];
   for(let k=0;k<=48;k++){const a=k/48*Math.PI*2,p=center.clone().add(V(Math.cos(a)*r,0,Math.sin(a)*r));rest.push(p);moved.push(p.clone().add(this.physics.displacementAt(p)));}
   // An explanatory measuring collar around the section, not a claimed mesh boundary.
   points(g.reference,rest,.50*driftWeight);points(g.deformed,moved,.94*driftWeight);
   const anchor=center.clone().addScaledVector(front,r),current=anchor.clone().add(shift);
   points(g.dimension,[anchor,current],driftWeight);g.dot.position.copy(current);g.dot.scale.setScalar(driftWeight);
   const raw=V(this.physics.currentU[g.node*3],this.physics.currentU[g.node*3+1],this.physics.currentU[g.node*3+2]);
   const value=1000*Math.hypot(raw.x,raw.z),stem=current.clone().addScaledVector(right,(i===1?-.16:.16));
   points(g.spoke,[current,stem],driftWeight);
   if(driftWeight>0)labels.push({id:'drift-'+i,point:stem,title:`${node.xyz[1].toFixed(0)} m · 侧移`,value:`${value.toFixed(0)} mm`,weight:driftWeight,color:'#147e94',side:i===1?-1:1,lift:28});
  });
  const member=memberForces?.getReadout();
  if(member){const a=V(...member.endpoints[0] as [number,number,number]),b=V(...member.endpoints[1] as [number,number,number]);labels.push({id:'selected-member-result',point:a.add(b).multiplyScalar(.5),title:`${member.name} · ${member.sign==='tension'?'拉向':'压向'}增量`,value:`${Math.abs(member.stressMPa).toFixed(2)} MPa`,color:member.sign==='tension'?'#087d9b':'#d75d37',weight:member.reveal,side:-1,lift:205,offsetPx:490});}
  const massWeight=pulse(36.05,36.30,37.72,37.95,cue),mass=parts.find(p=>p.id==='TMD_MASS');
  if(massWeight>0&&mass&&effects){const d=effects.tmd(s);labels.splice(0,labels.length,...labels.filter(l=>!l.title.includes('千吨')));labels.push({id:'tmd-spatial-displacement',point:mass.center.clone().add(mass.root.position),title:'质量块 · 相对位移',value:`${(d.relative*1000).toFixed(0)} mm`,color:C.teal,weight:massWeight,side:-1,lift:110,offsetPx:400});}
  labels.push(...flow);this.annotations.update(camera,labels);
 }
 dispose(){this.annotations.dispose();this.root.removeFromParent();this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
}
