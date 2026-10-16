import * as T from 'three';
import {Line2} from 'three/examples/jsm/lines/Line2.js';
import {LineGeometry} from 'three/examples/jsm/lines/LineGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {ForceArrow} from './EnvironmentPlayback';
import {State,V,clamp,mix,ramp} from './visual';

type Ends=[number,number];
export type PileResultSeries={
 nodeU_m:Ends[][];nodeRotation_rad:number[][];soilForceOnPile_N:Ends[][];
 soilEquivalentCouple_Nm:number[][];toeReactionOnPile_N:number[];
 axialTensionPositive_N:Ends[][];moment_Nm:Ends[][];
};
export type PilePlaybackData={
 schemaVersion:1;acceptedForFilm:boolean;scope:string;sourceCase:string;
 coordinateSystem:string;signConvention:string;physicalTime_s:number;
 headDepthBelowGrade_m:number;pileLength_m:number;diameter_m:number;headGravityLoad_N:number;pileSelfWeight_N:number;
 nodeDepthBelowHead_m:number[];nodeXYZ_m:[number,number,number][];
 soilLayers:{id:string;name:string;top_m:number;bottom_m:number}[];
 static:PileResultSeries&{loadFactor:number[]};
 dynamic:PileResultSeries&{time_s:number[];appliedHeadIncrement_N:Ends[]};
 validation:{finite:boolean};
};
export type PileAcceptance={
 acceptedForFilm:boolean;acceptedForEngineeringDesign:boolean;solver:{name:string;version:string};
 validation:{passed:boolean;selectedMeshTimeStep?:{passed:boolean}};
 artifacts:Record<string,{sha256:string;path:string}>;
 excludedClaims?:string[];
};
export type PileMode='axial'|'reaction'|'moment';
export type PileVisualizationOptions={
 /** Required world anchor in Three XYZ metres; local head is (0,0,0). */
 worldHead_m:[number,number,number];worldUnitsPerMetre?:number;
 displacementMagnification?:number;
 /** Linear display scales, independent of the current sample. */
 axialRange_MN?:[number,number];momentRange_kNm?:[number,number];reactionRange_kN?:[number,number];
 entrance?:[number,number];exit?:[number,number];
 staticWindow?:[number,number];dynamicWindow?:[number,number];
 /** Soil is a background stratigraphy cut only, not a continuum stress field. */
 soilWidth_m?:number;soilThickness_m?:number;
};
export type PileSample={u_m:Ends[];rotation_rad:number[];soilForce_N:Ends[];soilCouple_Nm:number[];toeReaction_N:number;N_N:Ends[];M_Nm:Ends[];headLoad_N:Ends;time_s:number|null;loadFactor:number;};
export type PileLegend={
 scope:'独立单桩算例';scopeDetail:string;solver:string;mode:PileMode;
 quantity:string;unit:'MN'|'kN·m'|'kN';range:[number,number];ticks:number[];
 encoding:'pile-colour-and-section-diagram'|'arrow-length-and-direction';
 palette:{at:number;color:string}[];time_s:number|null;loadFactor:number;
 displacementMagnification:number;headDisplacement_mm:Ends;headLoad_N:Ends;
 soilForceSum_N:Ends;toeReaction_N:number;soilEquivalentCoupleSum_Nm:number;
 arrowScales_N_per_m:{head:number;shaft:number;toe:number};
 soilMeaning:'分层弹簧与阻尼器；未计算连续土体应力';sourceSHA256:string;
 acceptedForFilm:true;acceptedForEngineeringDesign:false;
};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const pair=(n:unknown):n is Ends=>Array.isArray(n)&&n.length===2&&n.every(finite);
const vector=(n:unknown):n is [number,number,number]=>Array.isArray(n)&&n.length===3&&n.every(finite);
const SIGNED=[{at:0,color:'#1a6c86'},{at:.5,color:'#dbe1df'},{at:1,color:'#c66a41'}];
const COMPRESSION=[{at:0,color:'#d9e0dc'},{at:.5,color:'#b8a180'},{at:1,color:'#b85f3d'}];

/** Static material grain only: these textures encode no computed soil field. */
function soilMaterialMaps(index:number,width_m:number,height_m:number){
 const n=256,colour=new Uint8Array(n*n*4),relief=new Uint8Array(n*n*4);let seed=(98471+index*7919)>>>0;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const grain=((seed>>>24)/255-.5),layer=Math.sin(y*.31+1.2*Math.sin(x*.019))+ .4*Math.sin(y*.83+x*.005);
  const v=230+grain*17+layer*3.4,h=128+grain*45+layer*7,k=(y*n+x)*4;
  colour[k]=v;colour[k+1]=v*.984;colour[k+2]=v*.949;colour[k+3]=255;
  relief[k]=h;relief[k+1]=h;relief[k+2]=h;relief[k+3]=255;
 }
 const map=new T.DataTexture(colour,n,n,T.RGBAFormat),bump=new T.DataTexture(relief,n,n,T.RGBAFormat);
 map.colorSpace=T.SRGBColorSpace;
 for(const texture of [map,bump]){texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(width_m/12,height_m/12);texture.offset.set(index*.237,index*.173);texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=true;texture.anisotropy=8;texture.needsUpdate=true;}
 return {map,bump};
}

export function validatePilePlayback(data:PilePlaybackData|null|undefined,acceptance:PileAcceptance|null|undefined,options:PileVisualizationOptions):string[]{
 const failures:string[]=[];
 if(!data||data.schemaVersion!==1)return ['Missing supported pile playback'];
 if(!data.acceptedForFilm||!acceptance?.acceptedForFilm||acceptance.acceptedForEngineeringDesign!==false||!acceptance.validation?.passed||!acceptance.validation?.selectedMeshTimeStep?.passed)failures.push('Independent pile numerical acceptance missing');
 if(!/^([a-fA-F0-9]{64})$/.test(acceptance?.artifacts?.['playback.json']?.sha256??''))failures.push('Pile playback provenance hash missing');
 if(!data.scope||!data.coordinateSystem?.includes('Y upward')||!data.validation?.finite)failures.push('Pile scope, coordinates or finite gate missing');
 if(!vector(options.worldHead_m)||Math.abs(options.worldHead_m[1]+data.headDepthBelowGrade_m)>1e-4)failures.push('Pile anchor must match the accepted ground datum');
 if(!(data.diameter_m>0)||!(data.pileLength_m>0))failures.push('Invalid pile dimensions');
 const n=data.nodeXYZ_m?.length??0,depth=data.nodeDepthBelowHead_m;
 if(n<3||!Array.isArray(depth)||depth.length!==n)return [...failures,'Invalid pile nodes'];
 if(depth.some((d,i)=>!finite(d)||(i>0&&d<=depth[i-1])))failures.push('Pile depths must increase strictly');
 if(Math.abs(depth[0])>1e-6||Math.abs(depth[n-1]-data.pileLength_m)>1e-5)failures.push('Pile length and node depth disagree');
 if(data.nodeXYZ_m.some((p,i)=>!vector(p)||Math.abs(p[0])+Math.abs(p[2])+Math.abs(p[1]+depth[i])>1e-5))failures.push('Pile local coordinates must retain accepted vertical datum');
 const check=(series:PileResultSeries,clock:number[],label:string)=>{
  if(!Array.isArray(clock)||clock.length<2||clock.some((v,i)=>!finite(v)||(i>0&&v<=clock[i-1]))){failures.push(label+' clock invalid');return;}
  const count=clock.length;
  for(const key of ['nodeU_m','soilForceOnPile_N','axialTensionPositive_N','moment_Nm'] as const){const a=series[key],size=key==='nodeU_m'||key==='soilForceOnPile_N'?n:n-1;if(!Array.isArray(a)||a.length!==count||a.some(row=>row.length!==size||row.some(v=>!pair(v))))failures.push(label+' '+key+' shape/value invalid');}
  for(const key of ['nodeRotation_rad','soilEquivalentCouple_Nm'] as const){const a=series[key];if(!Array.isArray(a)||a.length!==count||a.some(row=>row.length!==n||row.some(v=>!finite(v))))failures.push(label+' '+key+' shape/value invalid');}
  if(!Array.isArray(series.toeReactionOnPile_N)||series.toeReactionOnPile_N.length!==count||series.toeReactionOnPile_N.some(v=>!finite(v)))failures.push(label+' toe reaction invalid');
 };
 if(!data.static||!data.dynamic)return [...failures,'Pile static/dynamic series missing'];
 check(data.static,data.static.loadFactor,'static');check(data.dynamic,data.dynamic.time_s,'dynamic');
 if(data.dynamic.appliedHeadIncrement_N?.length!==data.dynamic.time_s.length||data.dynamic.appliedHeadIncrement_N.some(p=>!pair(p)))failures.push('Applied pile head load missing');
 if(!Array.isArray(data.soilLayers)||data.soilLayers.some(l=>!finite(l.top_m)||!finite(l.bottom_m)||l.bottom_m<=l.top_m))failures.push('Soil stratigraphy invalid');
 return failures;
}

/** Nonuniform-clock interpolation. No loop and no newly invented forcing. */
export function pileBracket(clock:number[],at:number):[number,number,number]{
 if(at<=clock[0])return [0,1,0];if(at>=clock.at(-1)!)return [clock.length-2,clock.length-1,1];
 let lo=0,hi=clock.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(clock[mid]<=at)lo=mid;else hi=mid;}
 return [lo,hi,(at-clock[lo])/(clock[hi]-clock[lo])];
}
export function samplePileResponse(data:PilePlaybackData,dynamic:boolean,at:number):PileSample{
 const source=dynamic?data.dynamic:data.static,clock=dynamic?data.dynamic.time_s:data.static.loadFactor,[a,b,f]=pileBracket(clock,at);
 const pairs=(key:'nodeU_m'|'soilForceOnPile_N'|'axialTensionPositive_N'|'moment_Nm')=>source[key][a].map((p,i)=>[mix(p[0],source[key][b][i][0],f),mix(p[1],source[key][b][i][1],f)] as Ends);
 const scalars=(key:'nodeRotation_rad'|'soilEquivalentCouple_Nm')=>source[key][a].map((v,i)=>mix(v,source[key][b][i],f));
 const factor=dynamic?1:mix(clock[a],clock[b],f);
 const fx=dynamic?mix(data.dynamic.appliedHeadIncrement_N[a][0],data.dynamic.appliedHeadIncrement_N[b][0],f):0;
 const fy=dynamic?mix(data.dynamic.appliedHeadIncrement_N[a][1],data.dynamic.appliedHeadIncrement_N[b][1],f):0;
 return {u_m:pairs('nodeU_m'),rotation_rad:scalars('nodeRotation_rad'),soilForce_N:pairs('soilForceOnPile_N'),soilCouple_Nm:scalars('soilEquivalentCouple_Nm'),toeReaction_N:mix(source.toeReactionOnPile_N[a],source.toeReactionOnPile_N[b],f),N_N:pairs('axialTensionPositive_N'),M_Nm:pairs('moment_Nm'),headLoad_N:[fx,-data.headGravityLoad_N*factor+fy],time_s:dynamic?mix(clock[a],clock[b],f):null,loadFactor:factor};
}
/** Accepted beam kinematics: dx/d(depth)=global Z rotation. */
export function pileHermiteAt(data:PilePlaybackData,s:PileSample,element:number,f:number):[number,number]{
 const L=data.nodeDepthBelowHead_m[element+1]-data.nodeDepthBelowHead_m[element],q=clamp(f),q2=q*q,q3=q2*q;
 const x=(2*q3-3*q2+1)*s.u_m[element][0]+(q3-2*q2+q)*L*s.rotation_rad[element]+(-2*q3+3*q2)*s.u_m[element+1][0]+(q3-q2)*L*s.rotation_rad[element+1];
 return [x,mix(s.u_m[element][1],s.u_m[element+1][1],q)];
}
function wideLine(points:T.Vector3[],color:string,width=2,dashed=false){
 const material=new LineMaterial({color,linewidth:width,worldUnits:false,transparent:true,opacity:.6,depthTest:true,depthWrite:false,dashed,dashSize:.018,gapSize:.014});material.resolution.set(1920,1080);material.toneMapped=false;
 const line=new Line2(new LineGeometry().setPositions(points.flatMap(p=>p.toArray())),material);line.computeLineDistances();line.frustumCulled=false;return line;
}
function replaceLine(line:Line2,points:T.Vector3[]){line.geometry.setPositions(points.flatMap(p=>p.toArray()));line.computeLineDistances();}
function drawLine(line:Line2,points:T.Vector3[],progress:number){
 const p=clamp(progress),count=points.length-1,limit=p*count,shown=Math.min(count,Math.ceil(limit));
 const displayed=points.map((v,i)=>i<shown?v:points[Math.floor(limit)]?.clone().lerp(points[Math.min(count,Math.ceil(limit))],limit%1)??v);
 replaceLine(line,displayed);line.geometry.instanceCount=shown;line.visible=shown>0;
}
const colorAt=(x:number,palette:{at:number;color:string}[])=>{const f=clamp(x);for(let i=1;i<palette.length;i++)if(f<=palette[i].at)return new T.Color(palette[i-1].color).lerp(new T.Color(palette[i].color),(f-palette[i-1].at)/(palette[i].at-palette[i-1].at));return new T.Color(palette.at(-1)!.color);};

/** One accepted, independently loaded pile. Soil layers are only material
 * context; spring/dashpot forces and beam section values are the solved fields.
 * The 947-pile building foundation is deliberately not inferred here. */
export class PileDynamicsVisualization{
 readonly root=new T.Group();readonly soil=new T.Group();readonly forceGroup=new T.Group();readonly diagramGroup=new T.Group();
 readonly accepted:boolean;readonly rejectionReasons:string[];readonly scale:number;readonly magnification:number;
 readonly soilArrows:ForceArrow[]=[];readonly springs:Line2[]=[];readonly arrowNodes:number[]=[];
 headArrow!:ForceArrow;toeArrow!:ForceArrow;
 pileMesh?:T.Mesh;reference?:Line2;diagram?:Line2;diagramZero?:Line2;
 current:PileSample|null=null;private legend:PileLegend|null=null;private disposed=false;private readonly materialTextures:T.Texture[]=[];
 private readonly head:T.Vector3;private readonly ranges:Record<PileMode,[number,number]>;
 private readonly rings:{element:number;f:number}[]=[];private readonly radialSegments=14;private readonly ringRadius:number;
 private readonly defaults:{entrance:[number,number];exit:[number,number];staticWindow:[number,number];dynamicWindow:[number,number]};
 constructor(scene:T.Scene,private data:PilePlaybackData|null|undefined,private acceptance:PileAcceptance|null|undefined,private options:PileVisualizationOptions){
  this.root.name='independent-single-pile-dynamics';this.root.visible=false;
  this.rejectionReasons=validatePilePlayback(data,acceptance,options);this.accepted=!this.rejectionReasons.length;
  this.scale=options.worldUnitsPerMetre??.01;this.magnification=options.displacementMagnification??300;
  if(!(this.scale>0)||!finite(this.scale)||!(this.magnification>0)||!finite(this.magnification))throw new Error('Invalid pile display scale');
  this.head=vector(options.worldHead_m)?V(...options.worldHead_m).multiplyScalar(this.scale):V();
  this.ranges={axial:options.axialRange_MN??[0,8.5],reaction:options.reactionRange_kN??[-100,100],moment:options.momentRange_kNm??[-550,550]};
  if(Object.values(this.ranges).some(r=>!pair(r)||r[0]>=r[1]))throw new Error('Invalid fixed pile legend range');
  this.defaults={entrance:options.entrance??[6.2,6.65],exit:options.exit??[7.95,8.45],staticWindow:options.staticWindow??[6.5,7],dynamicWindow:options.dynamicWindow??[7,7.95]};
  this.ringRadius=(data?.diameter_m??1)*this.scale*.5;
  if(!this.accepted||!data||!acceptance)return;
  this.headArrow=new ForceArrow('#bf6842',.001);this.toeArrow=new ForceArrow('#26889a',.001);
  this.root.add(this.soil,this.forceGroup,this.diagramGroup);scene.add(this.root);
  this.buildSoil();this.buildPile();this.buildForces();
 }
 private world(rest:T.Vector3){return rest.multiplyScalar(this.scale).add(this.head);}
 private node(k:number,s:PileSample){const d=this.data!;return this.world(V(d.nodeXYZ_m[k][0]+s.u_m[k][0]*this.magnification,d.nodeXYZ_m[k][1]+s.u_m[k][1]*this.magnification,d.nodeXYZ_m[k][2]));}
 private center(element:number,f:number,s:PileSample){const d=this.data!,u=pileHermiteAt(d,s,element,f),depth=mix(d.nodeDepthBelowHead_m[element],d.nodeDepthBelowHead_m[element+1],f);return this.world(V(u[0]*this.magnification,-depth+u[1]*this.magnification,0));}
 private buildSoil(){
  const d=this.data!,colors=['#c4b79d','#b4ac98','#a7a998','#969f93','#b0aa92'],width=(this.options.soilWidth_m??24)*this.scale,thickness=(this.options.soilThickness_m??5)*this.scale;
  d.soilLayers.forEach((layer,i)=>{
   const top=Math.max(layer.top_m,d.headDepthBelowGrade_m-2),bottom=Math.min(layer.bottom_m,d.headDepthBelowGrade_m+d.pileLength_m+2);if(bottom<=top)return;
   const {map,bump}=soilMaterialMaps(i,width/this.scale,bottom-top);this.materialTextures.push(map,bump);
   const material=new T.MeshStandardMaterial({color:colors[i%colors.length],map,bumpMap:bump,bumpScale:.025*this.scale,roughness:.98,metalness:0,transparent:true,opacity:.82,depthWrite:false});
   const mesh=new T.Mesh(new T.BoxGeometry(width,(bottom-top)*this.scale,thickness),material);mesh.name=`stratum-${layer.id}-${layer.name}`;
   mesh.position.set(this.head.x,this.head.y-(top+bottom-2*d.headDepthBelowGrade_m)*this.scale/2,this.head.z-thickness*.5-2.5*this.scale);mesh.receiveShadow=true;this.soil.add(mesh);
   const line=wideLine([V(mesh.position.x-width/2,mesh.position.y+(bottom-top)*this.scale/2,this.head.z-2.4*this.scale),V(mesh.position.x+width/2,mesh.position.y+(bottom-top)*this.scale/2,this.head.z-2.4*this.scale)],'#8e9389',1);line.material.opacity=.35;this.soil.add(line);
  });
 }
 private buildPile(){
  const d=this.data!,indices:number[]=[];
  for(let e=0;e<d.nodeXYZ_m.length-1;e++)for(let j=0;j<3;j++)this.rings.push({element:e,f:j/3});this.rings.push({element:d.nodeXYZ_m.length-2,f:1});
  const nr=this.rings.length,R=this.radialSegments;
  for(let k=0;k<nr-1;k++)for(let j=0;j<R;j++){const a=k*R+j,b=k*R+(j+1)%R,c=(k+1)*R+j,d=(k+1)*R+(j+1)%R;indices.push(a,c,b,b,c,d);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(nr*R*3),3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('normal',new T.BufferAttribute(new Float32Array(nr*R*3),3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('color',new T.BufferAttribute(new Float32Array(nr*R*3),3).setUsage(T.DynamicDrawUsage));geometry.setIndex(indices);
  this.pileMesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.42,metalness:.1,side:T.DoubleSide}));this.pileMesh.name='accepted-Hermite-pile';this.pileMesh.frustumCulled=false;this.pileMesh.castShadow=true;this.root.add(this.pileMesh);
  const rest=d.nodeXYZ_m.map(p=>this.world(V(...p)));this.reference=wideLine(rest,'#7c949b',1.6,true);this.reference.material.opacity=.65;this.root.add(this.reference);
  const diagramPoints=d.nodeDepthBelowHead_m.map(depth=>this.world(V(9,-depth,0)));
  this.diagram=wideLine(diagramPoints,'#258299',3.1);this.diagramZero=wideLine(diagramPoints,'#778d91',1.4,true);this.diagramGroup.add(this.diagram,this.diagramZero);
 }
 private buildForces(){
  const d=this.data!;
  for(const depth of [2,5,10,18,29,40,49]){
   let k=1;for(let i=1;i<d.nodeDepthBelowHead_m.length-1;i++)if(Math.abs(d.nodeDepthBelowHead_m[i]-depth)<Math.abs(d.nodeDepthBelowHead_m[k]-depth))k=i;
   if(this.arrowNodes.includes(k))continue;this.arrowNodes.push(k);
   const arrow=new ForceArrow('#258899',.0009);this.soilArrows.push(arrow);this.forceGroup.add(arrow.root);
   const spring=wideLine([this.world(V(-6,-depth,0)),this.world(V(0,-depth,0))],'#709197',1.9);spring.material.opacity=.45;this.springs.push(spring);this.forceGroup.add(spring);
  }
  this.forceGroup.add(this.headArrow.root,this.toeArrow.root);
 }
 private updatePile(s:PileSample,mode:PileMode,weight:number){
  const g=this.pileMesh!.geometry,pos=g.getAttribute('position') as T.BufferAttribute,norm=g.getAttribute('normal') as T.BufferAttribute,col=g.getAttribute('color') as T.BufferAttribute,range=this.ranges[mode];
  const neutral=new T.Color('#90a5a7'),R=this.radialSegments;
  this.rings.forEach(({element,f},k)=>{
   const p=this.center(element,f,s),a=this.center(element,Math.max(0,f-.001),s),b=this.center(element,Math.min(1,f+.001),s),tangent=b.sub(a).normalize(),normal=V(-tangent.y,tangent.x,0).normalize();
   const raw=mode==='axial'?-mix(...s.N_N[element],f)/1e6:mix(...s.M_Nm[element],f)/1000;
   const c=neutral.clone();
   if(mode!=='reaction')c.lerp(colorAt((raw-range[0])/(range[1]-range[0]),mode==='axial'?COMPRESSION:SIGNED),ramp(k/this.rings.length*.72,k/this.rings.length*.72+.28,weight));
   for(let j=0;j<R;j++){const ang=j/R*Math.PI*2,n=normal.clone().multiplyScalar(Math.cos(ang)).add(V(0,0,Math.sin(ang))),point=p.clone().addScaledVector(n,this.ringRadius),index=k*R+j;pos.setXYZ(index,point.x,point.y,point.z);norm.setXYZ(index,n.x,n.y,n.z);col.setXYZ(index,c.r,c.g,c.b);}
  });pos.needsUpdate=true;norm.needsUpdate=true;col.needsUpdate=true;
 }
 update(state:Pick<State,'n'|'u'|'time'>,camera:T.PerspectiveCamera,override:{cue?:number;time_s?:number;mode?:PileMode}={}){
  if(!this.accepted||this.disposed||!this.data)return;
  const d=this.data,u=override.cue??state.n+state.u,w=this.defaults;
  const enter=ramp(...w.entrance,u),leave=ramp(...w.exit,u),active=u>w.entrance[0]&&u<w.exit[1];
  this.root.visible=active;
  if(!active){if(this.legend)this.legend.time_s=null;return;}
  // Whole teaching assembly enters from outside the frame; all solved pieces,
  // arrows and strata share that transform. Registered pose is zero offset.
  const right=V().setFromMatrixColumn(camera.matrixWorld,0),distance=camera.position.distanceTo(this.head),out=Math.max(3,2.5*distance*Math.tan(T.MathUtils.degToRad(camera.fov)/2)*camera.aspect);
  this.root.position.copy(right).multiplyScalar(-out*(1-enter)+out*leave);
  const dynamic=u>=w.dynamicWindow[0],physicalTime=override.time_s??clamp((u-w.dynamicWindow[0])/(w.dynamicWindow[1]-w.dynamicWindow[0]))*d.dynamic.time_s.at(-1)!;
  const load=ramp(...w.staticWindow,u),s=samplePileResponse(d,dynamic,dynamic?physicalTime:load);this.current=s;
  const mode=override.mode??(dynamic?(u<7.32?'reaction':'moment'):'axial');
  // Metric highlights retract to neutral before a new physical quantity grows
  // down the same pile. Diagrams and springs draw/undraw along their paths.
  const reveal=override.mode?1:mode==='axial'?1-ramp(6.88,7,u):mode==='reaction'?ramp(7.04,7.18,u)*(1-ramp(7.23,7.31,u)):ramp(7.33,7.43,u);
  this.updatePile(s,mode,reveal);
  const head=this.node(0,s),toe=this.node(d.nodeXYZ_m.length-1,s),reaction=mode==='reaction',axial=mode==='axial';
  const headForce=axial?s.headLoad_N[1]:s.headLoad_N[0],headDirection=axial?V(0,Math.sign(headForce),0):V(Math.sign(headForce),0,0),headMax=axial?8.5e6:3e5;
  this.headArrow.set(head.clone().addScaledVector(headDirection,-10*this.scale*Math.abs(headForce)/headMax*reveal),head,reveal,camera);
  // Toe bearing has its own fixed 1 MN / 6 m display scale, disclosed in the
  // legend metadata. Do not imply that its arrow shares the head-load scale.
  this.toeArrow.set(toe.clone().add(V(0,-6*this.scale*Math.abs(s.toeReaction_N)/1e6*reveal,0)),toe,axial?reveal:0,camera);
  this.soilArrows.forEach((arrow,j)=>{
   const k=this.arrowNodes[j],point=this.node(k,s),F=s.soilForce_N[k][axial?1:0],limit=axial?3e5:Math.max(...this.ranges.reaction.map(Math.abs))*1000,dir=axial?V(0,Math.sign(F),0):V(Math.sign(F),0,0);
   // Shaft friction acts on the interface. Place its attachment on the actual
   // visible surface, otherwise a vertical glyph is buried inside the pile.
   const surface=camera.position.clone().sub(point).setY(0).normalize().multiplyScalar(this.ringRadius).add(point);
   const contact=axial?surface:point.clone().add(V(-Math.sign(F)*this.ringRadius,0,0));
   arrow.set(contact.clone().addScaledVector(dir,-7*this.scale*Math.abs(F)/limit*reveal),contact,axial||reaction?reveal:0,camera);
   const spring=this.springs[j],from=this.world(V(-6,-d.nodeDepthBelowHead_m[k],0)),points:T.Vector3[]=[];
   for(let n=0;n<=28;n++){const f=n/28,p=from.clone().lerp(point,f);if(n>2&&n<26)p.y+=(n%2?1:-1)*.40*this.scale;points.push(p);}
   drawLine(spring,points,reaction?reveal:0);
  });
  // The moment/axial diagram remains at the real depth alongside the pile.
  // It is a section diagram, not a painted soil stress field.
  const draw=mode==='moment'||axial;
  this.diagramGroup.visible=draw&&reveal>0;
  if(draw){const points:T.Vector3[]=[],zero:T.Vector3[]=[];for(let k=0;k<d.nodeXYZ_m.length;k++){const e=Math.min(k,d.nodeXYZ_m.length-2),end=k===d.nodeXYZ_m.length-1?1:0,value=axial?-s.N_N[e][end]/1e6:s.M_Nm[e][end]/1000,range=this.ranges[mode],extent=axial?range[1]:Math.max(Math.abs(range[0]),Math.abs(range[1]));points.push(this.world(V(9+value/extent*6,-d.nodeDepthBelowHead_m[k],0)));zero.push(this.world(V(9,-d.nodeDepthBelowHead_m[k],0)));}drawLine(this.diagram!,points,reveal);drawLine(this.diagramZero!,zero,reveal);this.diagram!.material.color.set(axial?'#b67143':'#207e95');}
  const range=this.ranges[mode],sums=s.soilForce_N.reduce((a,b)=>[a[0]+b[0],a[1]+b[1]] as Ends,[0,0]);
  this.legend={scope:'独立单桩算例',scopeDetail:d.scope,solver:`${this.acceptance!.solver.name} ${this.acceptance!.solver.version}`,mode,quantity:axial?'压轴力':reaction?'侧向土反力':'截面弯矩',unit:axial?'MN':reaction?'kN':'kN·m',range:[...range],ticks:axial?[0,range[1]*.5,range[1]]:[range[0],0,range[1]],encoding:reaction?'arrow-length-and-direction':'pile-colour-and-section-diagram',palette:reaction?[]:axial?COMPRESSION:SIGNED,time_s:s.time_s,loadFactor:s.loadFactor,displacementMagnification:this.magnification,headDisplacement_mm:[s.u_m[0][0]*1000,s.u_m[0][1]*1000],headLoad_N:s.headLoad_N,soilForceSum_N:sums,toeReaction_N:s.toeReaction_N,soilEquivalentCoupleSum_Nm:s.soilCouple_Nm.reduce((a,b)=>a+b,0),arrowScales_N_per_m:{head:headMax/10,shaft:(axial?3e5:Math.max(...this.ranges.reaction.map(Math.abs))*1000)/7,toe:1e6/6},soilMeaning:'分层弹簧与阻尼器；未计算连续土体应力',sourceSHA256:this.acceptance!.artifacts['playback.json'].sha256,acceptedForFilm:true,acceptedForEngineeringDesign:false};
 }
 getLegendMeta(){return this.root.visible?this.legend:null;}
 getFocusPoint(){return this.head.clone().add(V(0,-(this.data?.pileLength_m??52)*this.scale*.42,0)).add(this.root.position);}
 dispose(){
  if(this.disposed)return;this.disposed=true;this.root.removeFromParent();const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line||o instanceof Line2){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.materialTextures.forEach(t=>t.dispose());this.root.clear();this.current=null;this.legend=null;
 }
}
