import * as T from 'three';
import {clamp,pulse,State} from './visual';

/** The adapter must already have converted the solver axes and pressure units.
 * Cp is dimensionless, one value per boundary point. No data is synthesized here.
 * Normals point from the building into the fluid, not into the solid. */
export type ComputedPressureData={
 referenceVelocity_m_s?:number;
 coordinates:'metres, Three.js XYZ, Y up';
 normalConvention:'body-outward';
 points_m:number[][];
 triangles:number[][];
 cp:number[];
 outward_normals?:number[][];
 pressure_Pa?:number[];
 provenance:Record<string,unknown>&{triangleWinding?:'outward'};
 quality?:{acceptedForFilm?:boolean;acceptedForCoupling?:boolean;notes?:string};
};
export type PressureOptions={
 geometryUnitsPerMetre?:number;
 maxProjectionDistanceM?:number;
 minimumCoverage?:number;
 cpRange?:[number,number];
 arrowHeightBands?:number;
 arrowAngularSlices?:number;
 arrowLengthMetresPerCp?:number;
 arrowRadiusM?:number;
 surfaceOffsetM?:number;
};
type Options=Required<PressureOptions>;
export type PressureMappingReport={
 meshId:string;vertices:number;accepted:number;coverage:number;
 maxDistanceM:number;rmsDistanceM:number;p95DistanceM:number;
 maxAcceptedDistanceM:number;maxProjectionDistanceM:number;
 passed:boolean;method:'closest boundary triangle, barycentric nodal Cp';
};
export type PressureSample={
 point_m:T.Vector3;normal:T.Vector3;cp:number;distanceM:number;
 triangle:number;barycentric:T.Vector3;
};
type Face={index:number;ids:number[];a:T.Vector3;b:T.Vector3;c:T.Vector3;normal:T.Vector3;box:T.Box3;center:T.Vector3};
type Node={box:T.Box3;faces?:Face[];left?:Node;right?:Node};
type Binding={meshId:string;geometry:T.BufferGeometry;report:PressureMappingReport;attribute:T.BufferAttribute;priorAttribute?:T.BufferAttribute|T.InterleavedBufferAttribute};
type MaterialPatch={material:T.MeshStandardMaterial;uniform:{value:number};priorCompile:T.Material['onBeforeCompile'];priorKey:T.Material['customProgramCacheKey'];compile:T.Material['onBeforeCompile'];key:T.Material['customProgramCacheKey'];};
type Glyph={point:T.Vector3;normal:T.Vector3;cp:number;root:T.Group;shaft:T.Mesh;head:T.Mesh;bead:T.Mesh;material:T.MeshStandardMaterial;};
const UP=new T.Vector3(0,1,0);
const POSITIVE=new T.Color('#d7653e'),NEGATIVE=new T.Color('#07869f'),NEUTRAL=new T.Color('#e5e8e2');
const ATTRIBUTE='computedPressureRgba';
const finite3=(p:number[])=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);

/**
 * Non-invasive pressure display on the actual exterior glass geometry.
 *
 * - A BVH projects undeformed display vertices to the nearest CFD boundary
 *   triangle. Cp and outward normals are barycentrically interpolated there.
 * - The bind report is a GEOMETRIC registration check, not CFD error validation.
 *   Vertices outside the supplied distance tolerance are never extrapolated.
 * - Shader attributes leave PhysicsPlayback's `color` buffer and material color
 *   untouched. restore() only sets this component's shader blend to zero.
 * - No geometry deformation occurs. The caller must keep the u29–31.5 tower
 *   undeformed or at true scale: a magnified structural displacement would
 *   invalidate this pressure registration and the fixed surface arrow origins.
 * - With null/undefined data the component is inert, including all arrows.
 */
export class ComputedPressureVisualization{
 readonly root=new T.Group();
 readonly options:Options;
 readonly available:boolean;
 readonly cpExtrema:{min:number;max:number}|null;
 private readonly faces:Face[]=[];
 private tree?:Node;
 private readonly bindings=new Map<T.BufferGeometry,Binding>();
 private readonly patches=new Map<T.MeshStandardMaterial,MaterialPatch>();
 private readonly candidates=new Map<string,PressureSample>();
 private readonly glyphs:Glyph[]=[];
 private glyphsDirty=false;
 private disposed=false;
 private readonly bounds=new T.Box3();
 private readonly triangle=new T.Triangle();
 private readonly closest=new T.Vector3();
 private readonly shaftGeometry=new T.CylinderGeometry(1,1,1,10);
 private readonly headGeometry=new T.ConeGeometry(1,1,16);
 private readonly beadGeometry=new T.SphereGeometry(1,10,8);

 constructor(scene:T.Scene,readonly data:ComputedPressureData|null|undefined,options:PressureOptions={}){
  this.options={geometryUnitsPerMetre:.01,maxProjectionDistanceM:1,minimumCoverage:.995,cpRange:[-3,1.25],arrowHeightBands:5,arrowAngularSlices:8,arrowLengthMetresPerCp:32,arrowRadiusM:1.1,surfaceOffsetM:.35,...options};
  const o=this.options;
  if(!(o.geometryUnitsPerMetre>0&&o.maxProjectionDistanceM>0&&o.minimumCoverage>0&&o.minimumCoverage<=1&&o.cpRange[0]<0&&o.cpRange[1]>0&&o.arrowLengthMetresPerCp>0&&o.arrowRadiusM>0&&o.surfaceOffsetM>=0&&Number.isInteger(o.arrowHeightBands)&&o.arrowHeightBands>0&&Number.isInteger(o.arrowAngularSlices)&&o.arrowAngularSlices>2))throw new Error('Invalid computed pressure display options');
  this.root.name='computed-boundary-pressure';this.root.visible=false;scene.add(this.root);
  this.available=!!data;this.cpExtrema=null;
  if(!data)return;
  this.validate(data);
  let cpMin=Infinity,cpMax=-Infinity;for(const cp of data.cp){cpMin=Math.min(cpMin,cp);cpMax=Math.max(cpMax,cp);}this.cpExtrema={min:cpMin,max:cpMax};
  const points=data.points_m.map(p=>new T.Vector3(...p as [number,number,number]));points.forEach(p=>this.bounds.expandByPoint(p));
  data.triangles.forEach((ids,index)=>{
   const a=points[ids[0]],b=points[ids[1]],c=points[ids[2]],normal=new T.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a));
   if(normal.lengthSq()<1e-18)throw new Error(`Degenerate pressure boundary triangle ${index}`);
   normal.normalize();
   if(data.outward_normals){const average=new T.Vector3();ids.forEach(i=>average.add(new T.Vector3(...data.outward_normals![i] as [number,number,number])));if(normal.dot(average)<0)normal.negate();}
   this.faces.push({index,ids,a,b,c,normal,box:new T.Box3().setFromPoints([a,b,c]),center:a.clone().add(b).add(c).multiplyScalar(1/3)});
  });
  this.tree=this.makeTree(this.faces.slice());
 }

 private validate(d:ComputedPressureData){
  if(d.coordinates!=='metres, Three.js XYZ, Y up')throw new Error('Pressure data needs exactly one verified conversion to metres, Three.js XYZ, Y up');
  if(d.normalConvention!=='body-outward')throw new Error('Pressure normals must use normalConvention: body-outward (solid to fluid, not fluid-domain outward)');
  if(!d.provenance||typeof d.provenance!=='object'||Array.isArray(d.provenance))throw new Error('Missing pressure solver provenance');
  if(!d.points_m.length||d.cp.length!==d.points_m.length||!d.triangles.length||!d.points_m.every(finite3)||!d.cp.every(Number.isFinite))throw new Error('Invalid pressure boundary points/Cp');
  if(!d.triangles.every(t=>t.length===3&&t.every(i=>Number.isInteger(i)&&i>=0&&i<d.points_m.length)))throw new Error('Invalid pressure boundary connectivity');
  if(d.outward_normals){if(d.outward_normals.length!==d.points_m.length||!d.outward_normals.every(n=>finite3(n)&&Math.hypot(...n)>.9&&Math.hypot(...n)<1.1))throw new Error('Pressure normals must be outward unit vectors, one per point');}
  else if(d.provenance.triangleWinding!=='outward')throw new Error('Pressure arrows need outward_normals or verified triangleWinding: outward');
  if(d.pressure_Pa&&(d.pressure_Pa.length!==d.cp.length||!d.pressure_Pa.every(Number.isFinite)))throw new Error('Invalid dimensional pressure array');
 }

 private makeTree(faces:Face[]):Node{
  const box=new T.Box3();faces.forEach(f=>box.union(f.box));
  if(faces.length<=12)return {box,faces};
  const size=box.getSize(new T.Vector3()),axis=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
  faces.sort((a,b)=>a.center[axis]-b.center[axis]);const split=Math.floor(faces.length/2);
  return {box,left:this.makeTree(faces.slice(0,split)),right:this.makeTree(faces.slice(split))};
 }

 /** Pure geometric query; useful for preflight verification against the solver. */
 sampleSurface(point_m:T.Vector3):PressureSample|null{
  if(!this.tree||!this.data||this.disposed)return null;
  let best=Infinity,face:Face|undefined;const nearest=new T.Vector3();
  const visit=(node:Node)=>{
   const bound=node.box.distanceToPoint(point_m);if(bound*bound>best)return;
   if(node.faces){for(const f of node.faces){this.triangle.set(f.a,f.b,f.c).closestPointToPoint(point_m,this.closest);const d=this.closest.distanceToSquared(point_m);if(d<best){best=d;face=f;nearest.copy(this.closest);}}return;}
   const a=node.left!,b=node.right!;if(a.box.distanceToPoint(point_m)<b.box.distanceToPoint(point_m)){visit(a);visit(b);}else{visit(b);visit(a);}
  };
  visit(this.tree);if(!face)return null;const f=face as Face;
  const barycentric=this.triangle.set(f.a,f.b,f.c).getBarycoord(nearest,new T.Vector3());if(!barycentric)throw new Error('Invalid pressure triangle barycentric coordinates');
  const weights=barycentric.toArray();let cp=0;const normal=new T.Vector3();
  for(let k=0;k<3;k++){cp+=weights[k]*this.data.cp[f.ids[k]];if(this.data.outward_normals)normal.addScaledVector(new T.Vector3(...this.data.outward_normals[f.ids[k]] as [number,number,number]),weights[k]);}
  if(normal.lengthSq()<1e-12)normal.copy(f.normal);else normal.normalize();
  return {point_m:nearest,normal,cp,distanceM:Math.sqrt(best),triangle:f.index,barycentric};
 }

 /** Bind REST geometry after its world matrix and 1:100 scale are baked.
 * Only true exterior ENVELOPE...GLASS meshes should be bound. Throws on poor
 * registration rather than silently showing pressure on unrelated geometry. */
 bind(meshId:string,geometry:T.BufferGeometry):PressureMappingReport|null{
  if(!this.available||this.disposed)return null;
  if(this.bindings.has(geometry))return this.bindings.get(geometry)!.report;
  if(!/ENVELOPE.*GLASS/.test(meshId))throw new Error(`Pressure display only binds exterior glass: ${meshId}`);
  const pos=geometry.getAttribute('position');if(!pos?.count)throw new Error('Pressure binding has no rest positions');
  const colors=new Float32Array(pos.count*4),distances:number[]=[],samples:PressureSample[]=[],p=new T.Vector3(),color=new T.Color();let accepted=0,sumSquared=0,maxAccepted=0;
  for(let k=0;k<pos.count;k++){
   p.fromBufferAttribute(pos,k).divideScalar(this.options.geometryUnitsPerMetre);const sample=this.sampleSurface(p);if(!sample)throw new Error('Pressure boundary lookup failed');
   const d=sample.distanceM;distances.push(d);sumSquared+=d*d;
   this.cpColor(sample.cp,color);colors[k*4]=color.r;colors[k*4+1]=color.g;colors[k*4+2]=color.b;
   if(d<=this.options.maxProjectionDistanceM){colors[k*4+3]=1;accepted++;maxAccepted=Math.max(maxAccepted,d);samples.push(sample);}
  }
  distances.sort((a,b)=>a-b);
  const coverage=accepted/pos.count,report:PressureMappingReport={meshId,vertices:pos.count,accepted,coverage,maxDistanceM:distances.at(-1)!,rmsDistanceM:Math.sqrt(sumSquared/pos.count),p95DistanceM:distances[Math.min(distances.length-1,Math.floor(.95*distances.length))],maxAcceptedDistanceM:maxAccepted,maxProjectionDistanceM:this.options.maxProjectionDistanceM,passed:coverage>=this.options.minimumCoverage,method:'closest boundary triangle, barycentric nodal Cp'};
  if(!report.passed)throw new Error(`Pressure surface registration failed: ${JSON.stringify(report)}`);
  const attribute=new T.BufferAttribute(colors,4),priorAttribute=geometry.getAttribute(ATTRIBUTE);geometry.setAttribute(ATTRIBUTE,attribute);
  this.bindings.set(geometry,{meshId,geometry,report,attribute,priorAttribute});samples.forEach(sample=>this.chooseArrowCandidate(sample));this.glyphsDirty=true;
  return report;
 }

 private cpColor(cp:number,out:T.Color){
  const bound=cp>=0?this.options.cpRange[1]:-this.options.cpRange[0];
  // Linear fixed global legend, not per-mesh auto-normalization.
  return out.copy(NEUTRAL).lerp(cp>=0?POSITIVE:NEGATIVE,clamp(Math.abs(cp)/bound));
 }

 private chooseArrowCandidate(sample:PressureSample){
  if(Math.abs(sample.cp)<1e-8||Math.abs(sample.normal.y)>.78)return;
  const center=this.bounds.getCenter(new T.Vector3()),height=this.bounds.max.y-this.bounds.min.y;
  const y=clamp((sample.point_m.y-this.bounds.min.y)/Math.max(height,1e-9));
  const angle=(Math.atan2(sample.point_m.z-center.z,sample.point_m.x-center.x)+Math.PI*2)%(Math.PI*2);
  const row=Math.min(this.options.arrowHeightBands-1,Math.floor(y*this.options.arrowHeightBands)),column=Math.min(this.options.arrowAngularSlices-1,Math.floor(angle/Math.PI/2*this.options.arrowAngularSlices));
  const score=(s:PressureSample)=>{const sy=(s.point_m.y-this.bounds.min.y)/Math.max(height,1e-9),sa=(Math.atan2(s.point_m.z-center.z,s.point_m.x-center.x)+Math.PI*2)%(Math.PI*2);return (sy-(row+.5)/this.options.arrowHeightBands)**2*4+(sa/(Math.PI*2)-(column+.5)/this.options.arrowAngularSlices)**2;};
  const key=`${row}:${column}`,prior=this.candidates.get(key);if(!prior||score(sample)<score(prior))this.candidates.set(key,sample);
 }

 private makeGlyphs(){
  for(const g of this.glyphs){g.root.removeFromParent();g.material.dispose();}this.glyphs.length=0;
  for(const s of this.candidates.values()){
   const color=s.cp>=0?POSITIVE:NEGATIVE,material=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.28,roughness:.42,metalness:.12,transparent:true,opacity:.96,depthWrite:false,depthTest:true});
   const root=new T.Group(),shaft=new T.Mesh(this.shaftGeometry,material),head=new T.Mesh(this.headGeometry,material),bead=new T.Mesh(this.beadGeometry,material);root.add(shaft,head,bead);this.root.add(root);
   this.glyphs.push({point:s.point_m.clone().multiplyScalar(this.options.geometryUnitsPerMetre),normal:s.normal.clone(),cp:s.cp,root,shaft,head,bead,material});
  }
  this.glyphsDirty=false;
 }

 /** No modification of `color`, vertexColors, clipping, opacity or deformation. */
 updateMaterial(geometry:T.BufferGeometry,material:T.MeshStandardMaterial,state:State,weight=this.weightAt(state)){
  if(!this.available||this.disposed||!this.bindings.has(geometry))return;
  let patch=this.patches.get(material);
  if(!patch){
   const uniform={value:0},priorCompile=material.onBeforeCompile,priorKey=material.customProgramCacheKey;
   const compile:T.Material['onBeforeCompile']=function(this:T.Material,shader,renderer){
    priorCompile.call(this,shader,renderer);
    if(!shader.vertexShader.includes('#include <begin_vertex>')||!shader.fragmentShader.includes('#include <color_fragment>')||!shader.fragmentShader.includes('#include <tonemapping_fragment>'))throw new Error('Pressure shader cannot safely compose with the existing material hook');
    shader.uniforms.computedPressureWeight=uniform;
    shader.vertexShader='attribute vec4 '+ATTRIBUTE+';\nvarying vec4 vComputedPressureRgba;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvComputedPressureRgba = '+ATTRIBUTE+';');
    shader.fragmentShader='uniform float computedPressureWeight;\nvarying vec4 vComputedPressureRgba;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vComputedPressureRgba.rgb, computedPressureWeight * vComputedPressureRgba.a);');
    // A scientific colour layer must remain legible when the architectural
    // glass uses transmission, clearcoat and a bright sky reflection. Blend
    // after its lighting/tone mapping, before the shared linear-to-display
    // colour conversion. This changes no geometry, Cp, opacity, material
    // parameters or the structural playback's independent vertex colours.
    // Subtle view-normal shading keeps the 3D form; reflections cannot turn
    // a positive-pressure orange region back into blue glass.
    shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>','#include <tonemapping_fragment>\nfloat cpFormShade = .88 + .12 * abs(normal.z);\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vComputedPressureRgba.rgb * cpFormShade, computedPressureWeight * vComputedPressureRgba.a);');
   };
   const key:T.Material['customProgramCacheKey']=function(this:T.Material){return priorKey.call(this)+'|computed-boundary-cp-v2';};
   patch={material,uniform,priorCompile,priorKey,compile,key};this.patches.set(material,patch);material.onBeforeCompile=compile;material.customProgramCacheKey=key;material.needsUpdate=true;
  }
  patch.uniform.value=clamp(weight);
 }

 weightAt(state:State){return pulse(29,29.2,29.76,30.03,state.n+state.u);}
 getLegendMeta(){return this.available&&this.data?{range:[...this.options.cpRange] as [number,number],referenceVelocity_m_s:Number.isFinite(this.data.referenceVelocity_m_s)?this.data.referenceVelocity_m_s!:null,meaning:String(this.data.provenance.meaning??'')}:null;}

 /** Surface arrows: positive Cp pushes inward; negative Cp pulls outward.
 * They grow along the actual surface normals, never drift in from world axes. */
 update(state:State,camera?:T.Camera,weight=this.weightAt(state)){
  if(!this.available||this.disposed){this.root.visible=false;return;}
  if(this.glyphsDirty)this.makeGlyphs();
  const w=clamp(weight);this.root.visible=w>1e-6;if(!this.root.visible)return;
  const units=this.options.geometryUnitsPerMetre,view=new T.Vector3(),direction=new T.Vector3(),start=new T.Vector3(),end=new T.Vector3();
  for(const g of this.glyphs){
   const facing=camera?clamp((view.copy(camera.position).sub(g.point).normalize().dot(g.normal)-.05)/.25):1;
   // Back surfaces remain hidden by depth testing; only grazing-angle glyphs
   // gently shrink, avoiding sudden screen-space culling during the orbit.
   const amount=w*facing,length=Math.abs(g.cp)*this.options.arrowLengthMetresPerCp*units*amount;
   const radius=this.options.arrowRadiusM*units*Math.min(1,amount*4),offset=this.options.surfaceOffsetM*units;
   g.root.visible=length>1e-7;if(!g.root.visible)continue;
   start.copy(g.point).addScaledVector(g.normal,offset);end.copy(start).addScaledVector(g.normal,length);
   if(g.cp>=0){const tmp=start.clone();start.copy(end);end.copy(tmp);}
   direction.copy(end).sub(start).normalize();g.root.quaternion.setFromUnitVectors(UP,direction);g.root.position.copy(start);
   const headLength=Math.min(length*.32,Math.max(radius*4,length*.19)),shaftLength=Math.max(0,length-headLength);
   g.shaft.position.set(0,shaftLength/2,0);g.shaft.scale.set(radius*.55,shaftLength,radius*.55);
   g.head.position.set(0,length-headLength/2,0);g.head.scale.set(radius*1.8,headLength,radius*1.8);
   // This bead encodes direction only, not a transient pressure oscillation.
   const phase=(state.time*.65)%1;g.bead.position.set(0,phase*shaftLength,0);g.bead.scale.setScalar(radius*.88);
  }
 }

 get mappingReports(){return Array.from(this.bindings.values(),b=>({...b.report}));}

 /** Safe at any point in a frame: PhysicsPlayback's live colors stay intact. */
 restore(material?:T.MeshStandardMaterial){
  if(material){const p=this.patches.get(material);if(p)p.uniform.value=0;}
  else{for(const p of this.patches.values())p.uniform.value=0;this.root.visible=false;}
 }

 dispose(){
  if(this.disposed)return;this.restore();this.disposed=true;
  for(const p of this.patches.values()){
   // Do not overwrite a later owner's shader hook.
   if(p.material.onBeforeCompile===p.compile)p.material.onBeforeCompile=p.priorCompile;
   if(p.material.customProgramCacheKey===p.key)p.material.customProgramCacheKey=p.priorKey;
   p.material.needsUpdate=true;
  }
  for(const b of this.bindings.values())if(b.geometry.getAttribute(ATTRIBUTE)===b.attribute){if(b.priorAttribute)b.geometry.setAttribute(ATTRIBUTE,b.priorAttribute);else b.geometry.deleteAttribute(ATTRIBUTE);}
  this.root.removeFromParent();for(const g of this.glyphs)g.material.dispose();this.root.clear();this.glyphs.length=0;
  this.shaftGeometry.dispose();this.headGeometry.dispose();this.beadGeometry.dispose();this.bindings.clear();this.patches.clear();this.candidates.clear();
 }
}
