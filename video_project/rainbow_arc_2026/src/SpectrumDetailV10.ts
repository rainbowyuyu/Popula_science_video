import * as T from 'three';
import {timeline,ease,clamp} from './Timeline';
import {SPECTRUM} from './optics';
import {OpticalEnergyV15 as OpticalEnergyV09} from './OpticalEnergyV15';
import {SpectralRibbonV15 as SpectralRibbonV09} from './SpectralRibbonV15';

type WaveRow={mesh:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;start:T.Vector3;end:T.Vector3;index:number;side:number};
type SmallDrop={rig:T.Group;water:T.Mesh;energy:OpticalEnergyV09;spectrum:SpectralRibbonV09;base:T.Vector3;index:number};
const WAVE_VERTEX=/* glsl */`
attribute vec3 previous;attribute vec3 next;attribute float edge;varying vec2 vUv;uniform float uWidth;
void main(){
 vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vec4 a=modelViewMatrix*vec4(previous,1.),b=modelViewMatrix*vec4(next,1.);
 vec2 d=b.xy-a.xy;float len=length(d);vec2 across=len>.00001?vec2(-d.y,d.x)/len:vec2(1.,0.);
 p.xy+=across*edge*uWidth;gl_Position=projectionMatrix*p;
}`;
const WAVE_FRAGMENT=/* glsl */`
uniform vec3 uColour;uniform float uAlpha;varying vec2 vUv;
void main(){
 float crossRay=(vUv.y-.5)*2.;float core=exp(-pow(crossRay/.26,2.)),halo=exp(-pow(crossRay/.65,2.));
 float ends=smoothstep(0.,.035,vUv.x)*(1.-smoothstep(.965,1.,vUv.x));
 gl_FragColor=vec4(mix(uColour,vec3(.96,.98,1.),core*.065),uAlpha*(core*.72+halo*.11)*ends);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const SPECTRUM_VERTEX=`attribute vec3 colour;varying vec3 c;varying vec2 q;void main(){c=colour;q=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const SPECTRUM_FRAGMENT=/* glsl */`
varying vec3 c;varying vec2 q;uniform float uAlpha,uScan;
void main(){
 float edge=smoothstep(0.,.11,q.y)*(1.-smoothstep(.89,1.,q.y))*smoothstep(0.,.045,q.x)*(1.-smoothstep(.955,1.,q.x));
 float packet=exp(-pow((q.x-uScan)/.17,2.));
 float l=dot(c,vec3(.2126,.7152,.0722));
 vec3 radiance=clamp(mix(vec3(l),c,1.64)*1.13,0.,1.);
 gl_FragColor=vec4(radiance,uAlpha*edge*(.94+.06*packet));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Relative wavelength and spectrum stay attached to the same refracted segment.
 * The transverse sample is deliberately magnified; it does not replace the exact rays. */
export class SpectrumDetailV10{
 readonly group=new T.Group();private readonly rows:WaveRow[]=[];
 private readonly band:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;private readonly many=new T.Group();
 private readonly small:SmallDrop[]=[];private readonly normal=new T.Vector3();private readonly direction=new T.Vector3();
 private disposed=false;
 constructor(paths:{points:T.Vector3[]}[]){
  this.group.name='v13-optical-detail-attached-to-refracted-light';
  const samples=128;
  for(const [rowIndex,index] of [0,3,6].entries()){
   const geometry=new T.BufferGeometry(),positions=new Float32Array((samples+1)*2*3),uv:number[]=[],edge:number[]=[],indices:number[]=[];
   for(let i=0;i<=samples;i++)for(let j=0;j<2;j++){uv.push(i/samples,j);edge.push(j?1:-1);if(i<samples&&j===0){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}}
   geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('previous',new T.BufferAttribute(new Float32Array(positions.length),3));geometry.setAttribute('next',new T.BufferAttribute(new Float32Array(positions.length),3));
   geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setAttribute('edge',new T.Float32BufferAttribute(edge,1));geometry.setIndex(indices);
   const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,toneMapped:false,uniforms:{uColour:{value:new T.Color(SPECTRUM[index].color)},uAlpha:{value:0},uWidth:{value:.0105}},vertexShader:WAVE_VERTEX,fragmentShader:WAVE_FRAGMENT});
   const mesh=new T.Mesh(geometry,material);mesh.name=`v13-relative-wavelength-${SPECTRUM[index].wavelengthNm}nm`;mesh.frustumCulled=false;mesh.renderOrder=19;this.group.add(mesh);
   this.rows.push({mesh,start:paths[index].points[1].clone(),end:paths[index].points[2].clone(),index,side:rowIndex-1});
  }
  const positions:number[]=[],colours:number[]=[],uv:number[]=[],indices:number[]=[];
  const along=64,spectral=72;
  for(let i=0;i<=spectral;i++){
   const spectralQ=i/spectral*6,k=Math.min(5,Math.floor(spectralQ)),p=spectralQ-k,c=new T.Color(SPECTRUM[k].color).lerp(new T.Color(SPECTRUM[k+1].color),p);
   const start=paths[k].points[1].clone().lerp(paths[k+1].points[1],p),end=paths[k].points[2].clone().lerp(paths[k+1].points[2],p);
   this.direction.subVectors(end,start).normalize();this.normal.set(-this.direction.y,this.direction.x,0).normalize();
   for(let j=0;j<=along;j++){
    const q=j/along,point=start.clone().lerp(end,q);
    // Width grows only in the middle; both ends remain on actual interface contacts.
    point.addScaledVector(this.normal,(i/spectral-.5)*.43*Math.sin(Math.PI*q));point.z+=.035*Math.sin(Math.PI*q);
    positions.push(point.x,point.y,point.z);colours.push(c.r,c.g,c.b);uv.push(q,i/spectral);
    if(i<spectral&&j<along){const n=i*(along+1)+j;indices.push(n,n+1,n+along+1,n+1,n+along+2,n+along+1);}
   }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('colour',new T.Float32BufferAttribute(colours,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);
  const m=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,toneMapped:false,uniforms:{uAlpha:{value:0},uScan:{value:0}},vertexShader:SPECTRUM_VERTEX,fragmentShader:SPECTRUM_FRAGMENT});
  this.band=new T.Mesh(g,m);this.band.frustumCulled=false;this.band.renderOrder=18;this.band.name='v13-transversely-magnified-spectrum-attached-to-same-beam';
  this.band.userData.provenance='Illustrative magnified transverse spectral sample, both ends on exact computed contact points; not physical intensity data';this.group.add(this.band);
  // A coherent three-drop procession, not an unrelated corner grid.
  for(let i=0;i<3;i++){
   const rig=new T.Group(),base=new T.Vector3(2.75+i*.48,-.20+i*.63,-.68-i*.60);rig.position.copy(base);
   const water=new T.Mesh(new T.SphereGeometry(.32,64,40),new T.MeshPhysicalMaterial({color:'#e5f5fc',roughness:.036,transmission:.94,ior:1.333,transparent:true,opacity:.62,depthWrite:false,envMapIntensity:.66,thickness:.64}));rig.add(water);
   const inputs=paths.map((p,index)=>({points:p.points.map(v=>v.clone().multiplyScalar(.20)),color:SPECTRUM[index].color,role:'primary' as const}));
   const energy=new OpticalEnergyV09(inputs),spectrum=new SpectralRibbonV09(inputs);rig.add(energy.group,spectrum.group);this.many.add(rig);this.small.push({rig,water,energy,spectrum,base,index:i});
  }
  this.group.add(this.many);
 }
 update(frame:number):void{
  const wave=timeline.clips.find(c=>c.id==='r042'),spec=timeline.clips.find(c=>c.id==='r043'),group=timeline.clips.find(c=>c.id==='r044');
  const a=wave?ease((frame-wave.start+15)/55)*(1-ease((frame-wave.end+10)/55)):0;
  const b=spec?ease((frame-spec.start+15)/55)*(1-ease((frame-spec.end+15)/55)):0;
  const c=group?ease((frame-group.start-group.duration*.24)/80)*(1-ease((frame-group.end+45)/95)):0;
  this.group.visible=Math.max(a,b,c)>.00001;this.band.visible=b>.00001;this.band.material.uniforms.uAlpha.value=b*.77;
  this.band.material.uniforms.uScan.value=spec?clamp((frame-spec.start)/spec.duration):0;this.many.visible=c>.00001;
  for(const s of this.small){
   const entry=group?ease((frame-group.start+15-s.index*18)/85):0,retire=group?ease((frame-group.end+10)/95):0;
   s.rig.position.copy(s.base);s.rig.position.x+=9*(1-entry)+10*retire;s.rig.rotation.y=.10-.025*s.index;
   (s.water.material as T.Material).opacity=.62*c;s.energy.update(frame,1,c*.75,0,0,1);s.spectrum.update(frame,1,c*.78,0,0,1);
  }
  for(const row of this.rows){
   row.mesh.visible=a>.00001;row.mesh.material.uniforms.uAlpha.value=a*.87;
   const p=row.mesh.geometry.getAttribute('position') as T.BufferAttribute,previous=row.mesh.geometry.getAttribute('previous') as T.BufferAttribute,next=row.mesh.geometry.getAttribute('next') as T.BufferAttribute;
   const count=p.count/2-1;this.direction.subVectors(row.end,row.start);this.normal.set(-this.direction.y,this.direction.x,0).normalize();
   const cycles=4*650/SPECTRUM[row.index].wavelengthNm;
   for(let i=0;i<=count;i++){
    const q=i/count,window=Math.sin(Math.PI*q)**2,waveOffset=Math.sin((q-frame/30*.085)*cycles*Math.PI*2)*.044*window*a;
    const spread=(row.side*.116+waveOffset)*window;
    const x=row.start.x+(row.end.x-row.start.x)*q+this.normal.x*spread,y=row.start.y+(row.end.y-row.start.y)*q+this.normal.y*spread,z=row.start.z+(row.end.z-row.start.z)*q+.025*window;
    p.setXYZ(i*2,x,y,z);p.setXYZ(i*2+1,x,y,z);
   }
   for(let i=0;i<=count;i++)for(let j=0;j<2;j++){
    const k=i*2+j,lo=Math.max(0,i-1)*2,hi=Math.min(count,i+1)*2;
    previous.setXYZ(k,p.getX(lo),p.getY(lo),p.getZ(lo));next.setXYZ(k,p.getX(hi),p.getY(hi),p.getZ(hi));
   }
   p.needsUpdate=previous.needsUpdate=next.needsUpdate=true;
  }
 }
 dispose():void{
  if(this.disposed)return;this.disposed=true;
  this.rows.forEach(r=>{r.mesh.geometry.dispose();r.mesh.material.dispose();});this.band.geometry.dispose();this.band.material.dispose();
  this.small.forEach(s=>{s.water.geometry.dispose();(s.water.material as T.Material).dispose();s.energy.dispose();s.spectrum.dispose();});this.group.clear();
 }
}

