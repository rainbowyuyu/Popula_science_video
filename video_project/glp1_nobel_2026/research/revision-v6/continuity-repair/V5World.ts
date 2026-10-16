import * as T from 'three';
import {World} from './World';
import {V5CameraPath,V5Clip,V5View,viewOf} from './V5CameraPath';
import {C,V,mat,tube,visibility,smooth,clamp,Timeline,FrameState,Label} from './visual';
import {V5CardioDetail} from './V5CardioDetail';
import {V5Measure} from './V5Measure';
import {V5HandoffContext} from './V5HandoffContext';
import {V5Person,neutralizeBodyGeometry,PersonAction} from './V5Person';
import {V5Mechanisms} from './V5Mechanisms';
import {V5Regulation} from './V5Regulation';
import {V5MealActions} from './V5MealActions';
import {V5Atrium} from './V5Atrium';
import {V5Airway} from './V5Airway';

type Weights={gut:number;islet:number;beta:number;receptor:number;drug:number;artery:number;arteriole:number;lipid:number;lipidWall:number;nephron:number};
const closer=(d:number,near:number,far:number)=>1-smooth(Math.log(Math.max(d,1e-12)/near)/Math.log(far/near));

// Locate a teaching patch beneath an actual atlas surface. A bounding-box
// centre can lie outside an irregular organ (or between two separate legs).
function anteriorInterior(object:T.Object3D,reference:T.Vector3,inset:number){
 object.updateWorldMatrix(true,true);
 const bounds=new T.Box3().setFromObject(object);
 const ray=new T.Ray(V(reference.x,reference.y,bounds.max.z+.05),V(0,0,-1));
 const hits:number[]=[],a=V(),b=V(),c=V(),hit=V();
 object.traverse(node=>{
  if(!(node instanceof T.Mesh))return;
  const positions=node.geometry.getAttribute('position'),indices=node.geometry.index;
  for(let i=0;i<(indices?.count??positions.count);i+=3){
   a.fromBufferAttribute(positions,indices?indices.getX(i):i).applyMatrix4(node.matrixWorld);
   b.fromBufferAttribute(positions,indices?indices.getX(i+1):i+1).applyMatrix4(node.matrixWorld);
   c.fromBufferAttribute(positions,indices?indices.getX(i+2):i+2).applyMatrix4(node.matrixWorld);
   if(ray.intersectTriangle(a,b,c,false,hit))hits.push(hit.z);
  }
 });
 const crossings=hits.sort((a,b)=>b-a).filter((z,i,all)=>i===0||Math.abs(z-all[i-1])>1e-7);
 if(crossings.length<2||crossings[0]-crossings[1]<inset*2)throw new Error('Atlas teaching patch has insufficient tissue clearance');
 return V(reference.x,reference.y,crossings[0]-inset);
}

/** Single atlas-coordinate world. Macro meshes, teaching histology and molecular
 * structures keep their positions and SI dimensions for the entire film. */
export class V5World extends World{
 declare cameraPath:V5CameraPath;
 cardio=new V5CardioDetail();
 handoff:V5HandoffContext;person?:V5Person;mechanisms=new V5Mechanisms();regulation=new V5Regulation();mealActions:V5MealActions;
 atrium?:V5Atrium;atrialMechanisms=new V5Mechanisms();
 airway:V5Airway;
 measure?:V5Measure;
 private weights:Weights={gut:0,islet:0,beta:0,receptor:0,drug:0,artery:0,arteriole:0,lipid:0,lipidWall:0,nephron:0};
 private pancreaticField=new T.Group();
 private gutField=new T.Group();
 private plasmaField=new T.Group();
 private drugPlasmaBridge=new T.Group();
 private sortedIsletCells:{batch:T.InstancedMesh;individual:T.Group}[]=[];
 private selectedIsletCue:T.Mesh;
 private selectedBetaCue:T.Mesh;
 private selectedReceptorCue:T.Mesh;
 private selectedWallCue:T.Mesh;
 private nerveWeight=0;
 private weightFrame=-1;
 private weightCache=new Map<V5View,number>();
 constructor(scene:T.Scene,camera:T.PerspectiveCamera,renderer:T.WebGLRenderer,base:string,tl:Timeline){
  super(scene,camera,renderer,base,tl,(a,t)=>new V5CameraPath(a,t));
  this.handoff=new V5HandoffContext(tl);this.root.add(this.mechanisms.root,this.regulation.root);
  this.mealActions=new V5MealActions(this.meal);
  this.airway=new V5Airway(base);this.root.add(this.airway.root);
  this.root.add(this.atrialMechanisms.root);
  this.root.add(this.cardio.root,this.pancreaticField,this.gutField,this.plasmaField,this.handoff.root);
  // Transparent instances are sorted as one colour batch, which can swap a
  // whole layer at a depth-write threshold. Retain the exact instance matrices
  // but provide individually sortable cells for the two beta-cell handoffs.
  for(const batch of [...this.islet.root.children])if(batch instanceof T.InstancedMesh&&batch.name.startsWith('mixed-islet-cell-type-')){
   const individual=new T.Group(),matrix=new T.Matrix4();individual.name=batch.name+'-individually-sorted';individual.visible=false;
   for(let i=0;i<batch.count;i++){batch.getMatrixAt(i,matrix);const cell=new T.Mesh(batch.geometry,batch.material);cell.matrix.copy(matrix);cell.matrixAutoUpdate=false;individual.add(cell);}
   this.islet.root.add(individual);this.sortedIsletCells.push({batch,individual});
  }
  this.pancreaticField.name='millimetre-pancreatic-lobular-context';
  this.gutField.name='millimetre-intestinal-mucosal-context';
  // There is now visible tissue at every decade of the zoom. These lobules
  // fill an 18 mm patch without changing scale as the camera approaches.
  const lobules:T.Vector3[]=[];
  for(let y=-13;y<=13;y++)for(let x=-15;x<=15;x++){
   const p=V(x*.00064+(y%2)*.00032,y*.00057,-.0009-.00016*Math.sin(x*3+y*7));
   if(p.length()>.0095||Math.hypot(p.x,p.y)<.0012)continue;lobules.push(p);
  }
  const field=new T.InstancedMesh(new T.IcosahedronGeometry(.00039,3),mat('#d9bba4',.28,.80),lobules.length),dummy=new T.Object3D();
  lobules.forEach((p,i)=>{dummy.position.copy(p);dummy.rotation.set(i*.6,i*.8,i*.19);dummy.scale.set(1,.86,.49);dummy.updateMatrix();field.setMatrixAt(i,dummy.matrix)});
  this.pancreaticField.add(field);
  for(let i=-9;i<=9;i++){
   const points=Array.from({length:25},(_,j)=>V((j-12)*.0007,i*.0008+.00015*Math.sin(j*.7+i),-.0010+.00012*Math.cos(j*.8+i)));
   this.gutField.add(tube(points,.00024,'#d9b9a5',.67));
  }
  this.selectedIsletCue=new T.Mesh(new T.RingGeometry(.00011,.000111,96),new T.MeshBasicMaterial({color:'#397f7b',transparent:true,opacity:.8,depthWrite:false,side:T.DoubleSide}));
  this.selectedIsletCue.name='150-micrometre-islet-location-cue';this.root.add(this.selectedIsletCue);
  const cue=(r:number,name:string)=>{const mesh=new T.Mesh(new T.RingGeometry(r,r*1.012,96),new T.MeshBasicMaterial({color:'#397f7b',transparent:true,opacity:.72,depthWrite:false,side:T.DoubleSide}));mesh.name=name;mesh.userData.annotation=true;this.root.add(mesh);return mesh;};
  this.selectedBetaCue=cue(8.2e-6,'selected-beta-cell-annotation');this.selectedReceptorCue=cue(.60e-6,'selected-membrane-location-annotation');
  this.selectedWallCue=cue(.00028,'selected-endothelial-location-annotation');(this.selectedWallCue.material as T.MeshBasicMaterial).depthTest=false;
  // Representative 7.5 µm erythrocytes bridge the millimetre lumen and the
  // existing 50 µm plasma context. The central corridor remains clear.
  const profile=[[0,.16],[1.1,.22],[2.5,.77],[3.3,.72],[3.75,0],[3.3,-.72],[2.5,-.77],[1.1,-.22],[0,-.16]];
  const erythrocytes=new T.InstancedMesh(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r*1e-6,y*1e-6)),16),mat('#b67b72',.72,.56),850);
  for(let i=0;i<850;i++){
   const r=60e-6+Math.sqrt((i+.5)/850)*.0011,a=i*2.399963;
   dummy.position.set(Math.cos(a)*r,Math.sin(a)*r,-40e-6-15e-6*Math.sin(i*.83));dummy.rotation.set(.35*Math.sin(i*.3),i*.19,.30*Math.cos(i));dummy.scale.set(1,1,1);dummy.updateMatrix();erythrocytes.setMatrixAt(i,dummy.matrix);
  }
  this.plasmaField.add(erythrocytes);this.plasmaField.userData={units:'metres',erythrocyteDiameter:7.5e-6,representation:'Sparse teaching plasma context, not simulated haematocrit or flow'};
  // Intermediate objects retain their physical sizes. They give a continuous
  // plasma environment between a 7.5 µm blood cell and a nanometre peptide.
  const bridgeCell=new T.Mesh(erythrocytes.geometry,mat('#ba7c73',.42,.60));
  bridgeCell.position.set(5.6e-6,-2.8e-6,-4.2e-6);bridgeCell.rotation.set(.35,.25,.9);
  bridgeCell.name='7.5-micrometre-reference-erythrocyte';this.drugPlasmaBridge.add(bridgeCell);
  const proteins=new T.InstancedMesh(new T.IcosahedronGeometry(3.5e-9,2),mat('#a3b9ab',.54,.67),420);
  let proteinSeed=72193;
  const proteinRandom=()=>{proteinSeed=(Math.imul(proteinSeed,1664525)+1013904223)>>>0;return proteinSeed/4294967296};
  for(let i=0;i<proteins.count;i++){
   const radius=18e-9*Math.pow(80,proteinRandom()),a=proteinRandom()*Math.PI*2;
   dummy.position.set(Math.cos(a)*radius,Math.sin(a)*radius,-radius*(.22+proteinRandom()*1.6));
   dummy.rotation.set(i*.2,i*.39,i*.12);dummy.scale.set(1,.74,.55);dummy.updateMatrix();proteins.setMatrixAt(i,dummy.matrix);
  }
  proteins.name='representative-plasma-proteins-7nm';this.drugPlasmaBridge.add(proteins);this.root.add(this.drugPlasmaBridge);
  this.drugPlasmaBridge.userData={units:'metres',representation:'Sparse schematic plasma context with representative 7 nm proteins. Positions and abundance are illustrative; not molecular dynamics.'};
  this.ready=this.ready.then(async()=>{
   await this.airway.ready;Object.assign(this.anchors,this.airway.anchors);
   for(const [name,color] of [['leftKidney','#a9746c'],['rightKidney','#ad7e71'],['adrenals','#d6ba86']])this.organs[name]?.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof T.MeshStandardMaterial)m.color.set(color)});
   this.anchors.kidney=this.anchors.leftKidney.clone();
   const rectus=this.organs.thighMuscles?.getObjectByName('FJ1433M_Left_rectus_femoris');
   if(!rectus)throw new Error('Left rectus femoris atlas mesh is required');
   this.anchors.muscle=anteriorInterior(rectus,new T.Box3().setFromObject(rectus).getCenter(V()),.004);
   rectus.userData.teachingAnchor={sourceID:'FJ1433M',position:this.anchors.muscle.toArray(),surfaceInsetMetres:.004};
   neutralizeBodyGeometry(this.organs.body);this.person=new V5Person(this.organs.body);this.root.add(this.person.root);Object.assign(this.anchors,this.person.anchors);this.anchors.mealPerson??=V(.05,.77,.18);
   this.measure=new V5Measure(this.organs.body);this.root.add(this.measure.root);Object.assign(this.anchors,this.measure.anchors);
   this.pancreaticField.position.copy(this.anchors.islet);this.gutField.position.copy(this.anchors.intestinal);
   this.selectedIsletCue.position.copy(this.anchors.islet).add(V(0,0,.00006));
   this.selectedBetaCue.position.copy(this.anchors.beta).add(V(0,0,8e-6));this.selectedReceptorCue.position.copy(this.anchors.receptor);
   // Follow a validated centreline point in the descending aorta. The 10 mm
   // artery cutaway is a representative local teaching section at this site.
   const aortic=this.routes?.routes.find(r=>r.id==='descending_aorta')??this.routes?.routes.find(r=>r.id.includes('aorta'));
   const arterialPoint=aortic?new T.Vector3(...aortic.points[Math.floor(aortic.points.length*.55)]):this.anchors.aorta.clone().add(V(0,-.02,0));
   this.cardio.arteryRoot.position.copy(arterialPoint);
   this.cardio.arteryRoot.rotation.z=-Math.PI/2;
   this.cardio.arterioleRoot.position.copy(arterialPoint).add(V(.014,-.004,.003));
   // Lipoproteins are inspected in actual vascular space, not a separate
   // giant liver or floating centimetre-sized protein representation.
   // Fixed hepatic tissue/sinusoidal teaching patch: a hepatocyte surface must
   // not sit in the centre of the atlas's large hepatic vein.
   const lipidPoint=this.anchors.liver.clone().add(V(.028,.009,.015));
   this.cardio.lipidRoot.userData.location='Representative hepatic tissue / sinusoidal interface, not an atlas-segmented hepatocyte or large hepatic vein endothelium';
   this.cardio.lipidRoot.position.copy(lipidPoint);
   this.cardio.nephronRoot.position.copy(anteriorInterior(this.organs.leftKidney,this.anchors.leftKidney.clone().add(V(.021,.012,0)),.0025));
   this.cardio.nephronRoot.userData.location='Representative cortical segment, 2.5 mm beneath the actual left-kidney anterior surface';
   this.root.updateMatrixWorld(true);
   Object.assign(this.anchors,this.cardio.getAnchors());
   this.cardio.lipidWallRoot.position.copy(this.anchors.foamCell).add(V(0,0,20e-6));
   this.root.updateMatrixWorld(true);Object.assign(this.anchors,this.cardio.getAnchors());
   this.selectedWallCue.position.copy(this.anchors.lipidWall);
   this.handoff.setAnchors(this.anchors.lipid,this.anchors.lipidWall);
   this.anchors.kidney=this.anchors.leftKidney.clone();
   this.anchors.lipid_liver=this.anchors.liver.clone();
   this.mechanisms.setAnchors(this.anchors.muscle,this.anchors.thrombus);Object.assign(this.anchors,this.mechanisms.getAnchors());
   this.atrium=new V5Atrium(this.organs.heart);this.root.add(this.atrium.root);Object.assign(this.anchors,this.atrium.getAnchors());
   this.atrialMechanisms.setAnchors(this.anchors.muscleCell,this.anchors.atrialClot);
   this.mealActions.connectDessert(this.meal);this.regulation.setAnchors(this.anchors);this.cameraPath=new V5CameraPath(this.anchors,tl);
   this.root.userData.v4={units:'metres',camera:'stationary physical anchors; logarithmic camera dolly; C2 stop-and-observe transitions',microGeometry:'representative teaching morphology',arterialDetail:'representative 10 mm cutaway, not exact patient lumen',nerve:'landmark-constrained reference, not a traced nerve mesh'};
  });
 }
 private viewWeight(s:FrameState,views:V5View[]){
  // Extend visibility around an editorial boundary so the outgoing parent is
  // still present throughout the camera pull-out and the next one is ready.
  if(this.weightFrame!==s.frame){this.weightFrame=s.frame;this.weightCache.clear();}
  for(const view of views){if(this.weightCache.has(view))continue;let weight=0;
  this.tl.clips.forEach((clip,i)=>{if(view!==viewOf(clip))return;
   const before=this.tl.clips[i-1],after=this.tl.clips[i+1];
   const start=clip.start-(before?.duration??120)*.38,end=clip.end+(after?.duration??120)*.58;
   const enter=i===0?1:smooth((s.frame-start)/Math.max(45,(before?.duration??120)*.35));
   const exit=1-smooth((s.frame-clip.end)/Math.max(75,end-clip.end));
   weight=Math.max(weight,enter*exit);
  });this.weightCache.set(view,weight);}
  return Math.max(0,...views.map(view=>this.weightCache.get(view)??0));
 }
 private contiguousProgress(s:FrameState,predicate:(c:V5Clip)=>boolean){
  let index=this.tl.clips.findIndex(c=>c.id===s.clip.id);if(index<0)return 0;let lo=index,hi=index;while(lo>0&&predicate(this.tl.clips[lo-1] as V5Clip))lo--;while(hi<this.tl.clips.length-1&&predicate(this.tl.clips[hi+1] as V5Clip))hi++;return clamp((s.frame-this.tl.clips[lo].start)/(this.tl.clips[hi].end-this.tl.clips[lo].start));
 }
 private phaseThrough(s:FrameState,predicate:(c:V5Clip)=>boolean){
  const matches=this.tl.clips.map((c,i)=>predicate(c as V5Clip)?i:-1).filter(i=>i>=0);if(!matches.length)return 0;
  const active=this.tl.clips.findIndex(c=>c.id===s.clip.id);let pivot=matches.includes(active)?active:matches.filter(i=>this.tl.clips[i].start<=s.frame).at(-1)??matches[0];
  let lo=pivot,hi=pivot;while(lo>0&&predicate(this.tl.clips[lo-1] as V5Clip))lo--;while(hi+1<this.tl.clips.length&&predicate(this.tl.clips[hi+1] as V5Clip))hi++;
  return clamp((s.frame-this.tl.clips[lo].start)/(this.tl.clips[hi].end-this.tl.clips[lo].start));
 }
 update(s:FrameState){
  this.lastState=s;const pose=this.cameraPath.apply(s.frame,this.camera),d=pose.distance,view=viewOf(s.clip);
  const clipIndex=this.tl.clips.findIndex(c=>c.id===s.clip.id);
  const nextClip=clipIndex>=0?this.tl.clips[clipIndex+1] as V5Clip|undefined:undefined;
  const nextView=nextClip?viewOf(nextClip):undefined;
  const outgoingToMacro=!!nextView&&['meal','action_meal','torso','homecheck'].includes(nextView)&&['kidney','nephron','arteriole','pressure','lcell','islet','beta','receptor','secretion','liver','lipoprotein','lipid_wall','plaque','thrombus','brainheart','drug','muscle_cell','clot_detail'].includes(view);
  // A macro hand-off begins before the clip boundary. Fade the outgoing
  // teaching field with the camera pull-out instead of leaving a solid
  // foreground layer over the returning person.
  const macroExit=outgoingToMacro?1-smooth((s.frame-(s.clip.end-90))/120):1;
  this.handoff.update(s.frame,d,this.camera);
  const near=(a:string,r=1)=>{const p=this.anchors[a];return p?1-smooth(pose.focus.distanceTo(p)/Math.max(d*r,1e-9)):0};
  const pancreasFamily=this.viewWeight(s,['pancreas','islet','beta','receptor','secretion']);
  const gutFamily=this.viewWeight(s,['gut','lcell']);
  // Optical entry starts before the drug sentence. Reveal the existing
  // metre-based plasma context as the lens reaches it, so early travel does
  // not pass through an empty field waiting for the narration boundary.
  const drugLead=Math.max(0,...this.tl.clips.filter(c=>viewOf(c)==='drug').map(c=>smooth((s.frame-c.start+480)/120)*(1-smooth((s.frame-c.start)/90))))*closer(d,.008,.060)*near('drug',2);
  const drugFamily=Math.max(this.viewWeight(s,['drug']),drugLead);
  const arteryFamily=this.viewWeight(s,['pressure','plaque','lipid_wall','thrombus','clot_detail']);
  const arterioleFamily=this.viewWeight(s,['arteriole']);
  const lipidFamily=this.viewWeight(s,['lipoprotein']);
  const wallFamily=this.viewWeight(s,['lipid_wall']);
  const renalFamily=this.viewWeight(s,['kidney','nephron']);
  const neural=this.viewWeight(s,['autonomic']);
  const wp=pancreasFamily*Math.max(near('islet',5),near('beta',5),near('receptor',5),near('secretion',5)),wg=gutFamily*near('intestinal',5);
  const islet=wp*closer(d,.0007,.015)*(1-closer(d,30e-6,110e-6));
  const beta=wp*closer(d,90e-6,400e-6)*(1-closer(d,60e-9,1.5e-6));
  // Keep a faint membrane-scale cue while the lens leaves the nanometre
  // field so the receptor explanation does not end on an empty frame.
  const receptor=pancreasFamily*near('receptor',5)*closer(d,150e-9,8e-6);
  const gut=wg*closer(d,.00060,.004);
  const drug=drugFamily*near('drug',5)*closer(d,150e-9,15e-6);
  const artery=arteryFamily*Math.max(near('artery',4),wallFamily*near('foamCell',5))*closer(d,.080,.35);
  const arteriole=arterioleFamily*near('arteriole',4)*closer(d,.007,.045);
  const lipid=lipidFamily*near('lipid',5)*closer(d,1.2e-6,25e-6);
  const lipidWall=wallFamily*near('lipidWall',5)*closer(d,4e-6,15e-6);
  // The 2.4 mm nephron segment must resolve before the kidney fills the lens.
  // Reveal it at centimetre distance while retaining the original macro
  // suppression envelope; changing display alpha must not erase all context.
  const renalClose=renalFamily*near('nephron',4)*closer(d,.005,.04)*macroExit;
  const nephron=renalFamily*near('nephron',4)*closer(d,.035,.14)*macroExit;
  this.weights={gut,islet,beta,receptor,drug,artery,arteriole,lipid,lipidWall,nephron};
  const muscleFamily=this.viewWeight(s,['muscle_cell']),clotFamily=this.viewWeight(s,['clot_detail']);
  const customMicro=Math.max(muscleFamily*near('muscleCell',5),clotFamily*Math.max(near('clotDetail',5),near('atrialClot',5)))*closer(d,.0006,.05);
  const localMicro=Math.max(customMicro,wp,wg,drugFamily*near('drug',5),lipidFamily*near('lipid',5),arterioleFamily*near('arteriole',4),renalFamily*near('nephron',4))*closer(d,.0006,.12);
  // Maintain parent shapes longer. They become translucently readable first,
  // then the camera passes their surface while the anchored child is visible.
  const anatomy=1-closer(d,.008,.10);
  const focus:Record<V5View,string[]>={meal:[],action_meal:[],torso:['heart','liver','pancreas','small_intestine'],homecheck:['heart','aorta','leftKidney','rightKidney'],stomach:['stomach','esophagus'],gut:['small_intestine','stomach'],lcell:['small_intestine'],pancreas:['pancreas','small_intestine'],islet:['pancreas'],beta:['pancreas'],receptor:['pancreas'],secretion:['pancreas'],liver:['liver','pancreas'],lipid_liver:['liver','veins'],pressure:['heart','aorta'],arteriole:['aorta','heart'],kidney:['leftKidney','rightKidney','aorta','adrenals'],nephron:['leftKidney','rightKidney'],autonomic:['brainstem','aorta','heart','leftKidney','rightKidney'],lipoprotein:['liver','veins'],lipid_wall:['aorta'],plaque:['aorta','heart'],thrombus:['aorta','heart'],brainheart:['heart','brain','aorta'],drug:['liver','veins'],muscle:['thighMuscles'],muscle_cell:['thighMuscles'],clot_detail:['aorta'],};
  const mealWeight=this.viewWeight(s,['meal','action_meal']);
  // Preview the incoming table/person during the last two seconds of a
  // nephron-to-meal hand-off.  The camera is already pulling back at this
  // point; bringing the macro scene along the same physical route avoids a
  // pale empty interval while keeping the anatomy legible until it recedes.
  const mealPreview=outgoingToMacro&&nextView==='meal'
   ? smooth((s.frame-(s.clip.end-60))/60)
   : 0;
  const mealRenderWeight=Math.max(mealWeight,mealPreview);
  const measurementWeight=this.viewWeight(s,['homecheck']);
  const measurementClip=this.tl.clips.findIndex(c=>viewOf(c)==='homecheck'&&s.frame>=c.start-180&&s.frame<=c.end+180);
  const diningToMeasurement=measurementClip>0&&viewOf(this.tl.clips[measurementClip-1])==='meal';
  const actionWeight=this.viewWeight(s,['muscle']);
  const personWeight=Math.max(mealRenderWeight,actionWeight,measurementWeight);
  const semantic=s.clip as V5Clip;
  const semanticWeight=(names:string[])=>Math.max(0,...this.tl.clips.filter(c=>names.includes((c as V5Clip).mechanism??'')).map(c=>smooth((s.frame-c.start+80)/140)*(1-smooth((s.frame-c.end)/120))));
  const atrialWeight=semanticWeight(['atrial_stasis','anticoagulant']);
  const airwayWeight=semanticWeight(['sleep_apnea','cpap_airway']);
  // Retain the child clot until this outward camera move has cleared the
  // atlas myocardium; restore the physical heart only at readable scale.
  const cardiacSurfaceReturn=Math.max(0,...this.tl.clips.filter(c=>['h073','h077'].includes(c.id)).map(c=>smooth((s.frame-c.start+90)/45)*(1-smooth((s.frame-c.start-150)/45))));
  const actionOf=(c:V5Clip):PersonAction=>['meal','action_meal'].includes(c.view??'')?'eat':c.view==='muscle'?(/muscle_training/.test(c.mechanism??'')?'sitStand':/preservation/.test(c.mechanism??'')?'resistance':/statin/.test(c.mechanism??'')?'stand':'walk'):'stand';
  const action=actionOf(semantic),personActions:Partial<Record<PersonAction,number>>={eat:mealRenderWeight};
  for(const c of this.tl.clips){if(viewOf(c)!=='muscle')continue;const a=actionOf(c as V5Clip),enter=smooth((s.frame-c.start+90)/135),exit=1-smooth((s.frame-c.end+15)/120);personActions[a]=Math.max(personActions[a]??0,enter*exit*actionWeight);}
  const actionTotal=Object.values(personActions).reduce((a,b)=>a+b,0);if(actionTotal>1)for(const a of Object.keys(personActions) as PersonAction[])personActions[a]!/=actionTotal;
  const slimming=this.tl.clips.filter(c=>(c as V5Clip).mechanism==='weight_feedback');
  const adiposity=slimming.length?.68*(1-smooth((s.frame-slimming[0].start)/(slimming.at(-1)!.end-slimming[0].start))):.68;
  // The camera must leave the millimetre tissue field before a metre-sized
  // body, garment or chair returns. The gate follows lens distance in both
  // directions, rather than a clip boundary or a one-frame visibility switch.
  const personOpticalBase=1-closer(d,.18,.70);
  // Macro subjects can enter while the camera is still finishing a deep
  // pull-out. Let the incoming figure/table become a soft, physically sized
  // staging layer sooner; it still remains gated by the measured dolly and
  // never jumps in at a clip boundary.
  const macroPreviewOptical=outgoingToMacro
   // Only stage the macro figure once the physical dolly has cleared its
   // close-up range; otherwise a half-transparent face can fill the frame
   // while the camera is still inside the outgoing nephron.
   ? (d>.65 ? .52*smooth((s.frame-(s.clip.end-75))/75) : 0)
   : 0;
  // A seated measurement figure uses a different external pose from the
  // standing atlas. Establish a broad view before revealing that pose;
  // an already seated dining figure can keep its continuous hand-off.
  const measurementOptical=diningToMeasurement?1:1-smooth(measurementWeight/.03)*closer(d,.80,1.50);
  // The standing organ atlas and the seated exterior share one identity but
  // different poses. During these four anatomical returns, first restore a
  // broad view; only then reveal the seated person. Retire this entry gate
  // during the existing broad lateral move to the bowl, so the later 1.12 m
  // dining close-up remains fully opaque. No organ or camera is relocated.
  const mealEntryOptical=Math.min(1,...this.tl.clips.filter(c=>['h012','h030','h040','h052'].includes(c.id)).map(c=>{
   const bowl=this.anchors.mealBowl;
   const broadArrival=bowl?(this.cameraPath as V5CameraPath).knots.find(k=>k.frame>=c.start&&k.frame<c.end&&k.distance>=1.5&&k.focus.distanceTo(bowl)<1e-6):undefined;
   if(!broadArrival)return 1;
   const entryWindow=smooth((s.frame-c.start+240)/60)*(1-smooth((s.frame-(broadArrival.frame-30))/30));
   return 1-entryWindow*smooth(mealRenderWeight/.03)*closer(d,.80,1.50);
  }));
  const muscleReturnClip=this.tl.clips.find(c=>c.id==='h016');
  const muscleReturnWindow=muscleReturnClip?smooth((s.frame-muscleReturnClip.start+250)/90)*(1-smooth((s.frame-muscleReturnClip.start-180)/90)):0;
  const muscleReturnFigure=1-muscleReturnWindow*closer(d,1.20,2.40);
  const personOptical=Math.max(personOpticalBase,macroPreviewOptical)*measurementOptical*mealEntryOptical*muscleReturnFigure;
  // The standing atlas and a seated exterior cannot share an intermediate
  // pose. Preserve the established early retirement in those protected
  // broad-view hand-offs while letting ordinary anatomical views stay useful.
  const seatedConflict=Math.max(measurementWeight,...this.tl.clips.filter(c=>['h012','h030','h040','h052'].includes(c.id)).map(c=>smooth((s.frame-c.start+240)/60)*(1-smooth((s.frame-c.end)/90))));
  const organRetireThreshold=.50-.46*smooth(seatedConflict/.05);
  const visiblePerson=personWeight*personOptical;
  this.person?.update({time:s.time,action,actionWeights:personActions,adiposity,weight:1,seatedWeight:mealRenderWeight>0?mealRenderWeight:undefined,measurementWeight,opacity:personWeight*personOptical,propsOpacity:Math.max(mealRenderWeight,actionWeight)*personOptical,wardrobeOpacity:personWeight*personOptical});
  if(measurementWeight>.000001){this.measure?.update(measurementWeight,true);visibility(this.measure!.root,measurementWeight*personOptical);}else visibility(this.measure!.root,0);
  this.person?.syncWardrobeToSkin();
  // This asset represents the vagus. The sympathetic passage must not use a
  // parasympathetic route as if they were interchangeable anatomy.
  const sympathetic=view==='autonomic'&&(/交感|升压/.test(s.clip.text));
  this.nerveWeight=neural*(1-localMicro)*(sympathetic?0:1);
  for(const [name,o] of Object.entries(this.organs)){
   const relevant=(Object.keys(focus) as V5View[]).filter(v=>focus[v].includes(name));
   const emphasis=this.viewWeight(s,relevant);
   // The incoming person cannot replace anatomical context until the lens
   // actually shows that person. Semantic pre-roll alone used to hide both.
   // Retire internal context over the visible body reveal, not its first 6%:
   // otherwise a pale silhouette is left without an anatomical reference.
   let alpha=name==='body'?(personWeight+(1-personWeight)*.065):(.10+.88*emphasis)*(1-.999*smooth(visiblePerson/organRetireThreshold));
   // Parent tissue already recedes continuously with visiblePerson above.
   // A clip-local exit multiplier would reset on the next sentence and make
   // the same kidney jump from 31% to 98% opacity at a continuous camera pose.
   // Organ close-ups and their teaching anchors share the unposed atlas.
   // Keep that registration while the anatomy dissolves into the seated
   // exterior; semantic pre-roll must not move organs ahead of the camera.
   if(name!=='body')o.position.y=0;
   if(name==='brain')alpha*=1-.90*neural;
   if(name==='brainstem')alpha=Math.max(alpha,.95*neural);
   if(name==='pancreatic_ducts')alpha=0;
   if(name==='thighMuscles')alpha=Math.max(muscleFamily,muscleReturnWindow*(1-muscleReturnFigure))*anatomy*(1-customMicro);
   else if(name!=='body')alpha*=1-.99*muscleReturnWindow;
   
   if(name==='esophagus'&&neural>.1)alpha*=.3;
   alpha*=name==='body'?Math.pow(anatomy,2)*personOptical:anatomy;
   if(['pancreas','small_intestine','liver','veins','aorta','leftKidney','rightKidney'].includes(name))alpha*=1-localMicro*.78;
   // Keep the heart/aorta shell until the clot detail has entered its optical
   // range. The previous .25 threshold made a short near-empty interval
   // between the macro atrium and the 75 µm clot; .025 overlaps the first
   // visible clot markers before the shell retires.
   if(name==='aorta')alpha*=(1-artery*.88)*(1-.95*atrialWeight*closer(d,.025,.70));
   // Keep the heart's context while the camera enters its real atrial cavity.
   // The reference wall in V5Atrium then carries the visible boundary.
   if(name==='heart')alpha*=1-.97*atrialWeight*closer(d,.025,.70);
   if(name==='heart')alpha*=1-cardiacSurfaceReturn*closer(d,.13,.28);
   if(name==='heart')alpha*=1-.96*Math.max(arterioleFamily,renalFamily)*closer(d,.16,.60);
   if(name==='aorta')alpha*=1-.93*arterioleFamily*near('arteriole',6)*closer(d,.016,.12);
   if(airwayWeight>0)alpha*=1-airwayWeight*(name==='body'?.97:.94);
   if(name!=='body')alpha*=1-.999*Math.max(artery,arteriole,renalClose,lipidWall);
   // The child is 2.5 mm beneath the kidney's actual anterior surface. Fade
   // its near parent at 25-160 mm dolly range, before the surface covers the
   // field. The same distance policy applies on entry and on return.
   if(name==='leftKidney'||name==='rightKidney')alpha*=1-renalFamily*near('nephron',4)*.965*closer(d,.025,.16);
   if(name==='liver')alpha=this.handoff.liverOpacity(alpha,d);
   this.setOpacity(o,clamp(alpha));o.traverse(node=>{if(node.userData.duplicateBrainstem)node.visible=false;});
  }
  this.mealScene.update(s.time);
  const swap=this.tl.clips.find(c=>/甜饮换成水|甜饮换水/.test(c.text));
  this.mealActions.update(swap?clamp((s.frame-swap.start)/(swap.duration*.7)):0);
  // Physical dolly, not a visibility toggle: the table lowers only as it
  // leaves the macro framing, and returns before a closing meal shot.
  this.meal.position.y=-.225-2.2*(1-mealRenderWeight);
  this.meal.position.x=diningToMeasurement?-2.2*smooth(measurementWeight/.6):0;
  this.measure?.setFurnitureArrival(diningToMeasurement?measurementWeight:1);
  this.meal.visible=d>.018||mealPreview>.02;
  visibility(this.floor,smooth((d-.22)/.35));
  visibility(this.pancreaticField,wp*closer(d,.06,.2)*(1-closer(d,.00030,.0016)));
  visibility(this.tissueContext,.28*wp*closer(d,.009,.07)*(1-closer(d,30e-6,150e-6)));
  visibility(this.gutField,wg*closer(d,.05,.18)*(1-closer(d,.00035,.003)));
  // Keep a faint tissue/blood-wall context through the final millimetre of
  // the intestinal hand-off. It establishes where the L-cell is before the
  // camera resolves the cell-scale surface.
  visibility(this.gutContext,wg*closer(d,.006,.045)*(1-closer(d,30e-6,500e-6)));
  visibility(this.selectedIsletCue,wp*closer(d,.002,.016)*(1-closer(d,.00045,.003)));
  this.selectedIsletCue.quaternion.copy(this.camera.quaternion);this.selectedBetaCue.quaternion.copy(this.camera.quaternion);this.selectedReceptorCue.quaternion.copy(this.camera.quaternion);
  visibility(this.selectedBetaCue,wp*closer(d,.0005,.0012)*(1-closer(d,50e-6,150e-6)));
  visibility(this.selectedReceptorCue,pancreasFamily*near('receptor',5)*closer(d,60e-6,180e-6)*(1-closer(d,.7e-6,4e-6)));
  this.selectedWallCue.quaternion.copy(this.camera.quaternion);
  const wallStart=this.tl.clips.find(c=>viewOf(c)==='lipid_wall')?.start??Infinity;
  visibility(this.selectedWallCue,arteryFamily*(1-smooth((s.frame-wallStart)/90))*(1-closer(d,.001,.007))*(1-this.handoff.wallMarkerReplacement()));
  modulate(this.intestinal.root,gut,()=>this.intestinal.render(s.time,.10+.85*this.phaseThrough(s,c=>c.view==='lcell')));
  modulate(this.islet.root,islet,()=>this.islet.render(s.time));
  // Enter/exit the alternate draw layout only while the cells are completely
  // opaque or invisible. Individual cells keep one depth policy throughout;
  // geometry, material colours and alpha animation remain the same.
  const sortIslet=true;
  for(const {batch,individual} of this.sortedIsletCells){
   batch.visible=!sortIslet;individual.visible=sortIslet;
   if(sortIslet)for(const material of Array.isArray(batch.material)?batch.material:[batch.material]){material.transparent=true;material.depthWrite=true;}
  }
  const secretionStart=this.tl.clips.find(c=>(c as V5Clip).mechanism==='insulin_secretion')?.start??Infinity;
  const betaProgress=s.frame>=secretionStart?.40+.57*this.phaseThrough(s,c=>c.mechanism==='insulin_secretion'):.13+.27*this.phaseThrough(s,c=>c.view==='beta');
  modulate(this.beta.root,beta,()=>this.beta.render(s.time,betaProgress));
  // At molecular magnification the beta-cell location glyph must not remain
  // as a huge false receptor next to the measured 5VAI structure.
  for(const name of ['membrane-GLP1-receptor-symbol','extracellular-GLP1-ligand']){
   const object=this.beta.root.getObjectByName(name);if(object)object.visible=false;
  }
  visibility(this.membranePatch,pancreasFamily*near('receptor',5)*closer(d,3e-6,14e-6));
  modulate(this.receptor.root,receptor,()=>this.receptor.render(s.time,.15+.80*this.phaseThrough(s,c=>c.view==='receptor')));
  visibility(this.circuit.root,0);
  visibility(this.bloodContext,Math.max(drugFamily*near('drug',5),lipidFamily*near('lipid',5))*closer(d,.0003,.006)*(1-closer(d,100e-9,1e-6)));
  if(lipidFamily>drugFamily)this.bloodContext.position.copy(this.anchors.lipid);else this.bloodContext.position.copy(this.anchors.drug);
  this.plasmaField.position.copy(this.bloodContext.position);
  visibility(this.plasmaField,Math.max(drugFamily*near('drug',5),lipidFamily*near('lipid',5))*closer(d,.004,.030)*(1-closer(d,12e-6,80e-6)));
  this.drugPlasmaBridge.position.copy(this.anchors.drug);
  const drugBridgeWeight=drugFamily*near('drug',5);
  visibility(this.drugPlasmaBridge.children[0],drugBridgeWeight*closer(d,35e-6,180e-6)*(1-closer(d,2e-6,10e-6)));
  visibility(this.drugPlasmaBridge.children[1],drugBridgeWeight*closer(d,3e-6,20e-6)*(1-closer(d,40e-9,120e-9)));
  const drugClips=this.tl.clips.filter(c=>viewOf(c)==='drug'),drugIndex=drugClips.findIndex(c=>c.id===s.clip.id);
  const drugProgress=drugIndex<0?0:clamp((drugIndex+s.clipProgress)/Math.max(1,drugClips.length));
  modulate(this.drug.root,drug,()=>this.drug.render(s.time,drugProgress));
  const mechanismViews:V5View[]=['pressure','arteriole','nephron','lipoprotein','lipid_wall','plaque','thrombus','clot_detail'];
  const mechanismClip=mechanismViews.includes(view)?s.clip:this.tl.clips.filter(c=>c.start<=s.frame&&mechanismViews.includes(viewOf(c))).at(-1);
  const activeView=mechanismClip?viewOf(mechanismClip):view,activeText=mechanismClip?.text??s.clip.text;
  const activeMechanism=(mechanismClip as V5Clip|undefined)?.mechanism??'';
  const mode=activeView==='arteriole'?'resistance':activeView==='nephron'?(/salt_reabsorption|raas/.test(activeMechanism)?'salt':'renal'):activeView==='lipoprotein'?(/ldl_clearance|statin_receptor/.test(activeMechanism)?'clearance':'lipid'):activeView==='lipid_wall'?'lipid_wall':activeView==='plaque'?'plaque':['thrombus','clot_detail'].includes(activeView)?'thrombus':'pressure';
  const wallEnd=this.tl.clips.filter(c=>viewOf(c)==='lipid_wall').at(-1)?.end??Infinity;
  const mechanismProgress=mode==='lipid'?this.phaseThrough(s,c=>c.view==='lipoprotein'&&!/接回来|清除/.test(c.text)):mode==='clearance'?this.phaseThrough(s,c=>c.view==='lipoprotein'&&/接回来|清除/.test(c.text)):mode==='resistance'?this.phaseThrough(s,c=>c.view==='arteriole'):mode==='lipid_wall'?this.phaseThrough(s,c=>c.view==='lipid_wall'):mode==='plaque'?(s.frame>=wallEnd?.85+.15*s.clipProgress:.22):mode==='thrombus'?this.phaseThrough(s,c=>['platelet_plug','fibrin_clot','antiplatelet'].includes(c.mechanism??'')):mode==='renal'||mode==='salt'?this.phaseThrough(s,c=>c.view==='nephron'):.35;
  const mechanism=(s.clip as V5Clip).mechanism??'';const mechProgress=this.contiguousProgress(s,c=>c.mechanism===mechanism);
  const airwayClip=['sleep_apnea','cpap_airway'].includes(mechanism)?s.clip:this.tl.clips.filter(c=>['sleep_apnea','cpap_airway'].includes((c as V5Clip).mechanism??'')).sort((a,b)=>Math.abs(a.start-s.frame)-Math.abs(b.start-s.frame))[0];
  const airwayMode=(airwayClip as V5Clip|undefined)?.mechanism??'sleep_apnea';
  const airwayProgress=airwayClip?clamp((s.frame-airwayClip.start)/airwayClip.duration):0;
  this.airway.update(s.time,airwayWeight*near('airway',4),airwayProgress,airwayMode);
  // The treatment comparison approaches the existing wall before its next
  // spoken sentence. Cross-fade optical roles over that camera move; do not
  // create a plaque or erase a vessel at the editorial clip boundary.
  const riskClip=this.tl.clips.find(c=>(c as V5Clip).mechanism==='bleeding_risk');
  const riskBoundary=riskClip?.start??Infinity;
  const riskHandoff=s.frame>=riskBoundary-60&&s.frame<=riskBoundary+60;
  const riskMix=smooth((s.frame-riskBoundary+60)/120);
  const arterialContext=riskHandoff?{pressureWeight:1-riskMix,plaqueProgress:1,clotProgress:1,lesionVisibility:riskMix}:undefined;
  this.cardio.update(s.time,mode,mode==='lipid'||mode==='clearance'?mechProgress:mechanismProgress,mechanism,mechProgress,arterialContext);
  const continuityProgress=this.contiguousProgress(s,c=>c.view===view);
  const cardiacClot=mechanism==='anticoagulant';
  const localMuscleProgress=mechanism==='insulin_resistance'?this.phaseThrough(s,c=>c.mechanism==='insulin_resistance'&&viewOf(c)==='muscle_cell'):mechProgress;
  this.mechanisms.update(s.time,mechanism,localMuscleProgress,d,muscleFamily,clotFamily*near('clotDetail',5),continuityProgress);
  this.atrialMechanisms.update(s.time,mechanism,mechProgress,d,0,clotFamily*near('atrialClot',5),.9);
  // Keep one anatomical chamber through the stasis/anticoagulant passage.
  // A mechanism-name branch formerly switched 1 -> .35 -> 0 at sentence
  // boundaries and restarted the existing clot. Couple its retirement to
  // measured optical scale; the treatment comparison remains in the real
  // centimetre-sized chamber rather than repeating an unneeded molecular zoom.
  const atrialContext=atrialWeight*(1-closer(d,.0003,.012));
  const atrialFormation=this.phaseThrough(s,c=>c.mechanism==='atrial_stasis');
  const atrialMarker=atrialWeight*(.24+.76*(1-closer(d,.008,.030)))*(1-closer(d,.00016,.0006));
  const atrialTreatment=this.phaseThrough(s,c=>c.mechanism==='anticoagulant');
  this.atrium?.update(s.time,clamp(atrialContext),atrialFormation,atrialMarker,atrialTreatment);
  const regulationModes=['raas','arb','sympathetic'];
  const regulationClip=regulationModes.includes(mechanism)?s.clip:this.tl.clips.filter(c=>regulationModes.includes((c as V5Clip).mechanism??'')).sort((a,b)=>Math.min(Math.abs(a.start-s.frame),Math.abs(a.end-s.frame))-Math.min(Math.abs(b.start-s.frame),Math.abs(b.end-s.frame)))[0];
  const regulationMode=(regulationClip as V5Clip|undefined)?.mechanism??'raas';
  const regulationWeight=semanticWeight(regulationModes)*(1-localMicro)*(1-personWeight);
  this.regulation.update(s.time,regulationMode,regulationWeight,this.phaseThrough(s,c=>c.mechanism===regulationMode));
  if(clotFamily>.01){visibility(this.cardio.arteryRoot,artery*(1-customMicro));}
  this.cardio.setVisibility({artery:artery*(1-customMicro),arteriole,lipid,lipidWall,nephron});
  // A 10 mm lumen has an outer wall at 6.1 mm radius. Retire its shell
  // before the lens enters that scale; retain the separately anchored plaque.
  // lipid_wall remains a translucent-wall state during its exit to a meal.
  const shellRole=riskHandoff?1-.78*riskMix:(['plaque','thrombus','lipid_wall'].includes(mode)?.22:1);
  const arteryShell=shellRole*(1-closer(d,.0065,.026));
  this.cardio.setArteryShellVisibility(this.handoff.wallShellOpacity(arteryShell,d));
  // At micrometre range the retained particles need an unobstructed wall
  // fragment. On the return, the accumulated millimetre plaque is the same
  // physical parent, already present at its fixed arterial anchor. Restore
  // its optical weight smoothly rather than returning only isolated cells.
  if(mode==='lipid_wall'){
   const aggregate=smooth((.45*mechanismProgress)/(.94-.28));
   const parentWeight=aggregate*artery*(1-customMicro)*(1-closer(d,.00065,.004));
   for(const name of ['aggregated-lipid-pool','fibrous-cap'])this.cardio.root.getObjectByName(name)?.traverse(object=>{
    if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])material.opacity=(material.userData.baseAlpha??1)*parentWeight;
   });
  }
  const plaqueReturn=this.handoff.plaqueReturnWeight(s.frame);
  if(plaqueReturn<1)for(const name of ['aggregated-lipid-pool','fibrous-cap'])this.cardio.root.getObjectByName(name)?.traverse(object=>{
   if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])material.opacity*=plaqueReturn;
  });
  // h070: keep the existing millimetre plaque readable until its fixed-size
  // microscopic tissue patch resolves. This is a bounded optical hand-off;
  // neither object is moved/resized and the camera/audio timeline is unchanged.
  const clotEntryBridge=smooth((s.frame-19620)/24)*(1-smooth((s.frame-19722)/30));
  if(clotEntryBridge>0){
   const parentAlpha=.28*clotEntryBridge*(1-closer(d,.00045,.00230));
   if(parentAlpha>0){
    this.cardio.arteryRoot.visible=true;
    for(const name of ['aggregated-lipid-pool','fibrous-cap'])this.cardio.root.getObjectByName(name)?.traverse(object=>{
     if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])material.opacity=Math.max(material.opacity,(material.userData.baseAlpha??1)*parentAlpha);
    });
   }
   const tissue=this.mechanisms.clot.children[0];
   const childAlpha=.90*clotEntryBridge*closer(d,.0015,.006)*near('clotDetail',5);
   if(tissue instanceof T.Mesh&&childAlpha>0){
    this.mechanisms.clot.visible=true;
    for(const material of Array.isArray(tissue.material)?tissue.material:[tissue.material])material.opacity=Math.max(material.opacity,(material.userData.baseOpacity??.46)*childAlpha);
   }
  }
  // The reverse platelet-to-artery hand-off must expose its existing parent
  // before the 65 micrometre tissue patch becomes unreadably small. Only
  // optical opacity is bridged; position, dimensions and camera stay fixed.
  const clotExitBridge=smooth((s.frame-20430)/20)*(1-smooth((s.frame-20510)/25));
  if(clotExitBridge>0){
   const parentAlpha=.12*clotExitBridge*(1-closer(d,.00020,.00070));
   if(parentAlpha>0){
    this.cardio.arteryRoot.visible=true;
    for(const name of ['aggregated-lipid-pool','fibrous-cap','contiguous-platelet-fibrin-clot'])this.cardio.root.getObjectByName(name)?.traverse(object=>{
     if(object instanceof T.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])material.opacity=Math.max(material.opacity,(material.userData.baseAlpha??1)*parentAlpha);
    });
   }
   const tissue=this.mechanisms.clot.children[0];
   const childAlpha=.85*clotExitBridge*closer(d,.00070,.0020)*near('clotDetail',5);
   if(tissue instanceof T.Mesh&&childAlpha>0){
    this.mechanisms.clot.visible=true;
    for(const material of Array.isArray(tissue.material)?tissue.material:[tissue.material])material.opacity=Math.max(material.opacity,(material.userData.baseOpacity??.46)*childAlpha);
   }
  }
  // Atlas vessel tubes and surface highlights are centimetre context. They
  // must not reappear as an opaque wall while the camera is still inside a
  // microscopic field during a pull-out to a different organ or daily action.
  const routeOptical=1-closer(d,.018,.12);
  this.routes?.update(s.time,{blood:(1-personWeight)*(1-localMicro)*routeOptical*Math.max(this.viewWeight(s,['gut','pancreas','liver','pressure','kidney','lipid_liver','brainheart']),.25),nerve:this.nerveWeight*(1-personWeight)*routeOptical,showLumenMarkers:true});
  const foodAlpha=this.viewWeight(s,['stomach'])*(1-localMicro);
  for(let i=0;i<this.stomachFood.length;i++){
   const q=(s.time*.023+i/this.stomachFood.length)%1,at=q*this.gastricPoints.length,index=Math.floor(at);
   const point=this.gastricPoints.length?this.gastricPoints[index].clone().lerp(this.gastricPoints[(index+1)%this.gastricPoints.length],at-index):this.anchors.stomach;
   this.stomachFood[i].position.copy(point);this.setOpacity(this.stomachFood[i],foodAlpha);
  }
  this.scene.updateMatrixWorld(true);
 }
 labels(s:FrameState):Label[]{
  const airway=this.airway.labels();if(airway.length)return airway;
  const custom=this.mechanisms.labels();if(custom.length)return custom;
  const cardiac=this.atrialMechanisms.labels();if(cardiac.length)return cardiac;
  const atrium=this.atrium?.labels();if(atrium?.length)return atrium;
  const regulation=this.regulation.labels();if(regulation.length)return regulation;
  const handoffLabels=this.handoff.labels(this.cameraPath.sample(s.frame).distance);
  if(handoffLabels.length)return handoffLabels;
  const view=viewOf(s.clip),a=this.anchors,w=this.weights,loc=(root:T.Object3D,p:T.Vector3)=>root.localToWorld(p.clone());
  const opacityOf=(object:T.Object3D|undefined)=>{let opacity=0;if(!object?.visible)return 0;object.traverseVisible(o=>{if(o instanceof T.Mesh&&!o.userData.skinDepth)for(const m of Array.isArray(o.material)?o.material:[o.material])opacity=Math.max(opacity,m.opacity)});return opacity;};
  const personReveal=Math.max(this.viewWeight(s,['meal','action_meal','homecheck']),this.viewWeight(s,['muscle']));
  const macro=(text:string,key:string,side:'left'|'right'='right'):Label=>{
   let weight=1-Math.max(w.gut,w.islet,w.beta,w.drug,w.lipid,w.arteriole,w.nephron);
   // Atlas organs keep standing coordinates. Labels recover only after the
   // moving external figure has become an anatomical view again.
   weight*=1-smooth(personReveal/.08);
   const object=this.organs[key==='kidney'?'leftKidney':key];
   weight*=smooth((opacityOf(object)-.06)/.24);
   let point=a[key].clone();
   if(key==='stomach')point.add(V(.021,-.029,.023));
   if(key==='aorta'){
    const route=this.routes?.getRoute('descending_aorta');
    if(route)point=V(...route.points[Math.min(route.points.length-1,Math.floor(route.points.length*.84))]);
   }
   // Put the dot on the selected organ's actual visible surface. Occluding
   // organs attenuate the annotation instead of claiming their own surface
   // is the hidden organ (notably the liver in front of the stomach/aorta).
   if(object&&(key==='stomach'||key==='aorta')&&weight>.00001){
    const direction=point.clone().sub(this.camera.position).normalize(),ray=new T.Raycaster(this.camera.position,direction);
    const own=ray.intersectObject(object,true).find(hit=>hit.object.visible&&!hit.object.userData.skinDepth);
    if(own){
     point=own.point.clone();ray.far=Math.max(0,own.distance-.0005);
     let cover=0;
     for(const [name,other] of Object.entries(this.organs))if(other!==object&&name!=='body'&&other.visible){
      const opacity=opacityOf(other);if(opacity>.06&&ray.intersectObject(other,true).length)cover=Math.max(cover,opacity);
     }
     weight*=1-smooth((cover-.08)/.48);
    }else weight=0;
   }
   return{text,point,side,weight};
  };
  if(view==='meal'||view==='action_meal')return[];
  if(view==='muscle')return[];
  if(view==='homecheck')return[{text:'袖带贴合上臂',point:a.measureCuff,side:'right'},{text:'前臂得到支撑',point:a.measureForearm,side:'right'}];
  if(view==='lcell')return[{text:'肠壁上的 L 细胞',point:loc(this.intestinal.root,V(.61,.08,.55)),color:C.teal,side:'right',weight:w.gut},{text:'毛细血管',point:loc(this.intestinal.root,V(1,-1,.6)),side:'right',weight:w.gut}];
  if(['islet','beta','receptor','secretion'].includes(view)){
   if(w.receptor>.25)return[{text:'GLP-1',point:loc(this.receptor.root,this.receptor.getLigandAnchor()),side:'right',color:C.gold,weight:w.receptor},{text:'膜上的受体',point:loc(this.receptor.root,V(-.3,.1,.2)),side:'left',weight:w.receptor}];
   if(w.beta>.55){const secreting=(s.clip as V5Clip).mechanism==='insulin_secretion';return[{text:'β 细胞',point:loc(this.beta.root,V(.67,.77,.60)),side:'right',weight:w.beta},{text:secreting?'释放胰岛素':'膜上的接收位置',point:secreting?a.secretion:a.receptor,side:'right',color:C.gold,weight:w.beta}];}
   if(w.islet>.1)return[{text:'胰岛',point:a.islet,side:'right',weight:w.islet},{text:'β 细胞',point:a.beta,side:'left',weight:w.islet}];
   return[macro('胰腺','pancreas')];
  }
  if(['pressure','arteriole','lipoprotein','lipid_wall','plaque','thrombus','kidney','nephron'].includes(view)){
   if(view==='plaque'&&s.frame<(this.tl.clips.find(c=>viewOf(c)==='lipid_wall')?.start??Infinity))return[{text:'选中的管壁位置',point:a.lipidWall,side:'right',weight:w.artery}];
   if(view==='lipid_wall'&&this.handoff.wallLabelWeight()>0){
    // Select labels from the geometry the lens actually resolves. The return
    // to the 20 micrometre foam cell must not retain endothelial labels.
    const membrane=w.lipidWall,foam=w.artery*(1-smooth(membrane));
    return[
     {...this.cardio.getFoamLabels()[0],weight:foam},
     ...this.cardio.getLabels('lipid_wall').map(label=>({...label,weight:membrane})),
    ];
   }
   if(view==='lipid_wall'&&this.cameraPath.sample(s.frame).distance>20e-6)return this.cardio.getFoamLabels().map(l=>({...l,weight:w.artery}));
   const mode=view==='arteriole'?'resistance':view==='kidney'||view==='nephron'?'renal':view==='lipoprotein'?(/ldl_clearance|statin_receptor/.test((s.clip as V5Clip).mechanism??'')?'clearance':'lipid'):view==='lipid_wall'?'lipid_wall':view==='pressure'?'pressure':view==='thrombus'?'thrombus':'plaque';
   const opacity=view==='arteriole'?w.arteriole:view==='kidney'||view==='nephron'?w.nephron:view==='lipoprotein'?w.lipid:view==='lipid_wall'?Math.max(w.lipidWall,w.artery):w.artery;
   if(opacity>.35)return this.cardio.getLabels(mode).slice(0,2).map(l=>({...l,weight:opacity*(mode==='plaque'?this.handoff.plaqueLabelWeight(s.frame,l.point,this.camera):1)}));
  }
  if(view==='drug'){
   // Labels retire with the nanometre object during the pull-out; this keeps
   // a tiny annotation from floating alone while the lens is already leaving
   // the molecular field. The molecule remains at its real teaching scale.
   const d=this.cameraPath.sample(s.frame).distance;
   const detailWeight=T.MathUtils.clamp(1-smooth(Math.log(Math.max(d,45e-9)/45e-9)/Math.log(130e-9/45e-9)),0,1);
   return this.drug.getLabels(detailWeight).filter(l=>l.opacity>.5).slice(0,2).map(l=>({text:l.text,point:loc(this.drug.root,V(...l.position)),color:l.color,weight:w.drug*l.opacity,side:'right'}));
  }
  if(view==='autonomic'){const route=this.routes?.getRoute('vagus_left_reference');return /交感|升压/.test(s.clip.text)?[macro('脑干','brainstem'),macro('心脏','heart')]:[macro('脑干','brainstem'),{text:'迷走神经参考路径',point:route?V(...route.points[Math.floor(route.points.length*.48)]):a.brainstem,side:'right',weight:this.nerveWeight,color:'#898c57'}]}
  const map:Partial<Record<V5View,[string,string][]>>={stomach:[['胃','stomach']],gut:[['小肠','small_intestine']],pancreas:[['胰腺','pancreas']],liver:[['肝脏','liver']],lipid_liver:[['肝脏','liver']],kidney:[['肾脏','kidney']],pressure:[['心脏','heart'],['主动脉','aorta']],brainheart:[['大脑','brain'],['心脏','heart']],homecheck:[['心脏','heart']]};
  return(map[view]??[]).map(([text,key])=>macro(text,key));
 }
}

function modulate(root:T.Object3D,k:number,render:()=>void){
 const materials=new Set<T.Material>();root.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)});
 for(const material of materials)if(material.userData.v4Unmodulated!==undefined)material.opacity=material.userData.v4Unmodulated;
 render();root.visible=k>.0001;
 for(const material of materials){material.userData.v4Unmodulated=material.opacity;material.opacity*=k;material.transparent=true;material.depthWrite=material.opacity>.96;}
}
