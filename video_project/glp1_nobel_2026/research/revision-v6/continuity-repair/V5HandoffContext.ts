import * as T from 'three';
import {V,mat,smooth,visibility,Label,Timeline} from './visual';

// Visibility is driven by semantic spans in the current audio timeline.
const spanWeight=(tl:Timeline,frame:number,view:string)=>Math.max(0,...tl.clips.map((c,i)=>{if((c as any).view!==view)return 0;const a=tl.clips[i-1]?.duration??150,b=tl.clips[i+1]?.duration??150;return gate(frame,c.start-a*.48,c.end+b*.72,Math.min(60,a*.25));}));
const closer=(d:number,near:number,far:number)=>1-smooth(Math.log(Math.max(d,1e-12)/near)/Math.log(far/near));
const gate=(frame:number,start:number,end:number,ramp=45)=>smooth((frame-start)/ramp)*(1-smooth((frame-end+ramp)/ramp));

/** Local optical hand-offs only; no camera, audio, timeline or model resizing.
 * Resting platelets are representative 2.5 µm discs in the SAME plasma volume.
 * They are scale context, not aggregation or a claim about measured blood.
 * Reticles are annotations with screen-size strokes, never physical particles.
 */
export class V5HandoffContext{
 readonly root=new T.Group();
 readonly platelets=new T.Group();
 private plasmaCue:T.Mesh;
 private wallCue:T.Mesh;
 private plateletLabelPoint=V();
 private plateletLabelVisible=false;
 private bloodAnchor=V();private wallAnchor=V();
 private bloodWeight=0;private bloodExitWeight=0;private wallWeight=0;private plateletWeight=0;
 private plasmaCueWeight=0;private wallCueWeight=0;
 constructor(private tl:Timeline){
  this.root.name='bounded-cross-scale-optical-handoffs';this.root.visible=false;
  this.platelets.name='resting-platelets-2point5-micrometres';this.root.add(this.platelets);
  const centers=[V(-4.1e-6,2.3e-6,-1.6e-6),V(4.8e-6,1.4e-6,-2.2e-6),V(1.2e-6,-1.3e-6,-2.7e-6)];
  centers.forEach((point,i)=>{
   const platelet=new T.Group();platelet.name=`resting-platelet-context-${i}`;platelet.position.copy(point);
   platelet.rotation.set(.72+i*.13,.12*i,.25*i);
   const surface=new T.Mesh(new T.SphereGeometry(1.25e-6,32,20),mat('#a79b9e',.68,.63));
   surface.scale.set(1,.24,1);platelet.add(surface);
   const center=new T.Mesh(new T.SphereGeometry(.48e-6,20,14),mat('#9c8996',.36,.62));center.scale.set(1,.38,1);platelet.add(center);
   for(let j=0;j<7;j++){
    const a=j*2.39996,r=.38e-6+.18e-6*(j%2);
    const granule=new T.Mesh(new T.SphereGeometry(.115e-6,12,8),mat('#887d90',.50,.58));
    granule.position.set(Math.cos(a)*r,.09e-6,Math.sin(a)*r);platelet.add(granule);
   }
   this.platelets.add(platelet);
  });
  const reticle=(name:string)=>{
   const geometry=new T.RingGeometry(1,1.055,64),material=new T.MeshBasicMaterial({color:'#397f7b',opacity:.74,transparent:true,depthWrite:false,depthTest:false,side:T.DoubleSide});
   const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.renderOrder=1900;mesh.userData.annotation=true;this.root.add(mesh);return mesh;
  };
  this.plasmaCue=reticle('same-plasma-location-screen-annotation');this.wallCue=reticle('same-wall-location-screen-annotation');
  this.root.userData={plateletDiameterMetres:2.5e-6,plateletThicknessMetres:.6e-6,positionsFixed:true,reticles:'screen-size annotations, not molecular geometry',support:'current semantic timeline spans'};
 }
 setAnchors(blood:T.Vector3,wall:T.Vector3){
  this.bloodAnchor.copy(blood);this.wallAnchor.copy(wall);this.platelets.position.copy(blood);
  this.plasmaCue.position.copy(blood);this.wallCue.position.copy(wall);
  this.plateletLabelPoint.copy(blood).add(V(-4.1e-6,2.3e-6,-1.6e-6));
 }
 update(frame:number,distance:number,camera:T.PerspectiveCamera){
  this.bloodWeight=spanWeight(this.tl,frame,'lipoprotein');
  // h042 is a lipoprotein view through the camera's semantic override,
  // although the narration timeline calls its broad organ 'liver'. Restore
  // the same fixed blood-context field during this bounded return only.
  this.bloodWeight=Math.max(this.bloodWeight,gate(frame,12070,12195,25));
  this.bloodExitWeight=this.bloodWeight;
  this.wallWeight=spanWeight(this.tl,frame,'lipid_wall');
  const plasmaWeight=Math.max(this.bloodWeight,this.bloodExitWeight);
  this.root.visible=plasmaWeight>0||this.wallWeight>0;
  this.plateletWeight=plasmaWeight*closer(distance,18e-6,90e-6)*(1-closer(distance,1.6e-6,4e-6));
  visibility(this.platelets,this.plateletWeight);
  this.plateletLabelVisible=false;
  for(const platelet of this.platelets.children){
   const point=platelet.position.clone().add(this.bloodAnchor),screen=point.clone().project(camera);
   const x=(screen.x+1)*960,y=(1-screen.y)*540;
   if(x>=760&&x<=1700&&y>=240&&y<=760){this.plateletLabelPoint.copy(point);this.plateletLabelVisible=true;break;}
  }
  this.plasmaCueWeight=plasmaWeight*closer(distance,.060,.150)*(1-closer(distance,.60e-6,3e-6));
  this.wallCueWeight=this.wallWeight*closer(distance,.003,.015)*(1-closer(distance,12e-6,55e-6));
  for(const [cue,weight] of [[this.plasmaCue,this.plasmaCueWeight],[this.wallCue,this.wallCueWeight]] as const){
   cue.quaternion.copy(camera.quaternion);cue.scale.setScalar(distance*.013);visibility(cue,weight);
  }
 }
 liverOpacity(original:number,distance:number){
  // The real atlas liver surface is crossed near 55 mm lens distance. Its
  // shell must already be translucent BEFORE near-plane clipping crosses it.
  const local=Math.max(this.bloodWeight,this.bloodExitWeight);
  const cap=.02+.98*(1-closer(distance,.075,.30));
  return original*(1-local+local*cap);
 }
 wallShellOpacity(original:number,distance:number){
  // Match the preceding plaque opacity; entering lipid_wall must never
  // restore an opaque wall. Clear the parent before the 20 µm cells resolve.
  const continuous=.22*(1-closer(distance,.00030,.006));
  return original+(continuous-original)*this.wallWeight;
 }
 wallMarkerReplacement(){return this.wallWeight;}
 wallLabelWeight(){return this.wallWeight;}
 plaqueReturnWeight(frame:number){return 1;}
 plaqueLabelWeight(frame:number,point:T.Vector3,camera:T.PerspectiveCamera){
  
  const screen=point.clone().project(camera),y=(1-screen.y)*540;
  // The fixed lower-right ruler has priority. Show the plaque label once
  // its true anchor has risen clear of that overlay, without moving the anchor.
  return smooth((810-y)/80);
 }
 labels(distance:number):Label[]{
  if(this.plateletWeight>.28&&distance>2e-6&&this.plateletLabelVisible)return[{text:'血小板 · 尺度参照',point:this.plateletLabelPoint.clone(),side:'right',weight:this.plateletWeight}];
  if(this.plasmaCueWeight>.35&&distance>3e-6)return[{text:'同一处血浆',point:this.bloodAnchor.clone(),side:'right',weight:this.plasmaCueWeight}];
  if(this.wallCueWeight>.25&&distance>20e-6)return[{text:'同一处管壁',point:this.wallAnchor.clone(),side:'right',weight:this.wallCueWeight}];
  return[];
 }
}
