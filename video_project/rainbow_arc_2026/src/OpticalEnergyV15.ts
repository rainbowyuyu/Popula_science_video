import * as T from 'three';
import {createRadianceSegmentV15,updateRadianceSegmentV15} from './OpticalRadianceV15';

type InputPath={points:T.Vector3[];color:string;role:'primary'|'secondary'};
type Segment={mesh:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;index:number;input:boolean};
type Photon={core:T.Mesh<T.SphereGeometry,T.MeshBasicMaterial>;glow:T.Mesh<T.SphereGeometry,T.ShaderMaterial>;phase:number};
type Path={source:InputPath;colour:T.Color;points:T.Vector3[];cumulative:number[];length:number;segments:Segment[];photons:Photon[];first:boolean;last:boolean;index:number};
const clamp=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
const smooth=(x:number)=>{const q=clamp(x);return q*q*(3-2*q);};
const fract=(x:number)=>x-Math.floor(x);
const GLOW_VERTEX=`varying vec3 vN;varying vec3 vV;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`;
const GLOW_FRAGMENT=`uniform vec3 uColour;uniform float uAlpha;varying vec3 vN;varying vec3 vV;void main(){float f=max(0.,dot(normalize(vN),normalize(vV)));gl_FragColor=vec4(uColour,uAlpha*pow(f,2.7));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** Soft finite radiance centred on unchanged Snell vertices, absolute-frame evaluated. */
export class OpticalEnergyV15{
 readonly group=new T.Group();private readonly paths:Path[]=[];
 private readonly geometries=new Set<T.BufferGeometry>();private readonly materials=new Set<T.Material>();
 private readonly white=new T.Color('#f6fbff');private readonly tempColour=new T.Color();
 private readonly tangent=new T.Vector3();private readonly up=new T.Vector3(0,1,0);private disposed=false;
 constructor(inputs:InputPath[],options:{drawIncoming?:boolean}={}){
  this.group.name='v15-photographic-radiance-on-verified-Snell-paths';
  this.group.userData.provenance='Codex locally authored photographic beam envelopes on unchanged Snell endpoints, illustrative display radiance';
  const bead=new T.SphereGeometry(1,20,12);this.geometries.add(bead);
  const seen=new Set<string>();
  inputs.forEach((input,index)=>{
   if(input.points.length<2||input.points.some(p=>!p.toArray().every(Number.isFinite)))return;
   const points=input.points.map(p=>p.clone()),source={...input,points},cumulative=[0];
   for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+points[i].distanceTo(points[i-1]));
   const length=cumulative.at(-1)!;if(length<1e-6)return;
   const first=!seen.has(input.role);seen.add(input.role);
   const last=!inputs.slice(index+1).some(p=>p.role===input.role);
   const path:Path={source,points,cumulative,length,colour:new T.Color(input.color),segments:[],photons:[],first,last,index};
   for(let i=0;i<points.length-1;i++){
    if(cumulative[i+1]-cumulative[i]<1e-6||i===0&&(!first||options.drawIncoming===false))continue;
    const mesh=createRadianceSegmentV15(points[i],points[i+1],i===0?.079:input.role==='primary'?.059:.052);
    mesh.name=`v15-${input.role}-radiance-${index}-segment-${i}`;
    this.geometries.add(mesh.geometry);this.materials.add(mesh.material);this.group.add(mesh);path.segments.push({mesh,index:i,input:i===0});
   }
   // Only the two spectral boundaries carry a quiet packet. Avoid 28 glittering beads.
   if(first||last){
    const coreMat=new T.MeshBasicMaterial({color:this.white,transparent:true,opacity:0,depthWrite:false,toneMapped:false});
    const haloMat=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,blending:T.NormalBlending,toneMapped:false,vertexShader:GLOW_VERTEX,fragmentShader:GLOW_FRAGMENT,uniforms:{uColour:{value:this.white.clone()},uAlpha:{value:0}}});
    this.materials.add(coreMat);this.materials.add(haloMat);
    const core=new T.Mesh(bead,coreMat),glow=new T.Mesh(bead,haloMat);
    core.scale.set(.0055,.028,.0055);glow.scale.set(.018,.061,.018);core.renderOrder=17;glow.renderOrder=16;
    core.frustumCulled=glow.frustumCulled=false;this.group.add(core,glow);path.photons.push({core,glow,phase:first?.13:.46});
   }
   this.paths.push(path);
  });
 }
 update(frame:number,primaryReveal:number,primaryOpacity:number,secondaryReveal:number,secondaryOpacity:number,colourLevel:number):void{
  if(this.disposed)return;const time=Number.isFinite(frame)?Math.max(0,frame)/30:0,colour=clamp(colourLevel);
  for(const p of this.paths){
   const n=p.points.length-1,reveal=clamp(p.source.role==='primary'?primaryReveal:secondaryReveal)*n,base=clamp(p.source.role==='primary'?primaryOpacity:secondaryOpacity);
   const spectralOpacity=base*(p.first?.94:p.last?.64:.30)*(p.first?1:smooth(colour));
   for(const segment of p.segments){
    const a=segment.input?base:colour<.0001?(p.first?base:0):spectralOpacity;
    this.tempColour.copy(this.white);if(!segment.input)this.tempColour.lerp(p.colour,colour);
    updateRadianceSegmentV15(segment.mesh,reveal-segment.index,a,this.tempColour,frame,p.index*.041+segment.index*.113);
   }
   for(const packet of p.photons){
    const d=fract(time*.12+packet.phase)*p.length;let s=0;while(s<n-1&&d>p.cumulative[s+1])s++;
    const local=(d-p.cumulative[s])/Math.max(1e-8,p.cumulative[s+1]-p.cumulative[s]);
    const inherited=s===0?(p.first?base:0):colour<.0001?(p.first?base:0):spectralOpacity;
    const a=inherited*smooth((reveal-s-local)/.065)*smooth(d/.18)*smooth((p.length-d)/.22);
    packet.core.visible=packet.glow.visible=a>.0001;
    packet.core.position.lerpVectors(p.points[s],p.points[s+1],local);packet.glow.position.copy(packet.core.position);
    this.tangent.subVectors(p.points[s+1],p.points[s]).normalize();packet.core.quaternion.setFromUnitVectors(this.up,this.tangent);packet.glow.quaternion.copy(packet.core.quaternion);
    this.tempColour.copy(this.white);if(s>0)this.tempColour.lerp(p.colour,colour);
    packet.core.material.color.copy(this.tempColour);packet.core.material.opacity=a*.28;
    packet.glow.material.uniforms.uColour.value.copy(this.tempColour);packet.glow.material.uniforms.uAlpha.value=a*.105;
   }
  }
  this.group.visible=clamp(primaryOpacity)+clamp(secondaryOpacity)>.0001;
 }
 dispose():void{
  if(this.disposed)return;this.disposed=true;this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());
  this.group.clear();this.paths.length=0;this.geometries.clear();this.materials.clear();
 }
}

