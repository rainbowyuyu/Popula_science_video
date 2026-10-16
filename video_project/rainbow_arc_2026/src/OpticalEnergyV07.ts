import * as T from 'three';

type InputPath = {points:T.Vector3[]; color:string; role:'primary'|'secondary'};
type Segment = {mesh:T.Mesh<T.CylinderGeometry,T.ShaderMaterial>; index:number; input:boolean};
type Photon = {core:T.Mesh<T.SphereGeometry,T.MeshBasicMaterial>; glow:T.Mesh<T.SphereGeometry,T.ShaderMaterial>; phase:number};
type Event = {ring:T.Mesh<T.RingGeometry,T.MeshBasicMaterial>; dot:T.Mesh<T.SphereGeometry,T.MeshBasicMaterial>; index:number; phase:number};
type Path = {source:InputPath; colour:T.Color; points:T.Vector3[]; cumulative:number[]; length:number; segments:Segment[]; photons:Photon[]; events:Event[]; first:boolean; index:number};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const fract=(n:number)=>n-Math.floor(n);
const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
const BEAM_VERTEX=`varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`;
const BEAM_FRAGMENT=`uniform vec3 uColour;uniform float uAlpha;uniform float uReveal;uniform float uTime;
uniform float uSegment;uniform float uDistance;uniform float uLength;uniform float uHalo;uniform float uPhase;
varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){float end=clamp(uReveal-uSegment,0.0,1.0);if(vUv.y>end||end<=0.0)discard;
float facing=abs(dot(normalize(vN),normalize(vV)));float edge=pow(facing,mix(.45,1.4,uHalo));
float d=uDistance+vUv.y*uLength;float cycle=fract(d*.83-uTime*.65+uPhase);
float pulse=pow(max(0.0,1.0-abs(cycle-.5)*2.0),20.0);
float endFeather=1.0-smoothstep(max(0.0,end-.009),end,vUv.y);
float alpha=uAlpha*edge*endFeather*mix(.76+.24*pulse,.13+.13*pulse,uHalo);
gl_FragColor=vec4(uColour,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const GLOW_FRAGMENT=`uniform vec3 uColour;uniform float uAlpha;varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){float f=max(0.0,dot(normalize(vN),normalize(vV)));gl_FragColor=vec4(uColour,uAlpha*pow(f,2.2));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

/** Frame-driven illustrative energy riding exact supplied Snell vertices. */
export class OpticalEnergyV07 {
  readonly group=new T.Group();
  private readonly paths:Path[]=[];
  private readonly geometries=new Set<T.BufferGeometry>();
  private readonly materials=new Set<T.Material>();
  private readonly white=new T.Color('#fff5df');
  private readonly tempColour=new T.Color();
  private readonly tangent=new T.Vector3();
  private readonly up=new T.Vector3(0,1,0);
  private readonly normal=new T.Vector3();
  private disposed=false;

  constructor(inputs:InputPath[]) {
    this.group.name='v07-optical-energy-on-verified-rays';
    const bead=new T.SphereGeometry(1,16,10),ring=new T.RingGeometry(.63,1,48);
    this.geometries.add(bead);this.geometries.add(ring);
    const seen=new Set<string>();
    inputs.forEach((source,index)=>{
      if(source.points.length<2)return;
      const points=source.points.map(p=>p.clone()),cumulative=[0];
      for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+points[i].distanceTo(points[i-1]));
      const length=cumulative[cumulative.length-1];if(length<1e-6)return;
      const first=!seen.has(source.role);seen.add(source.role);
      const path:Path={source,points,cumulative,length,colour:new T.Color(source.color),segments:[],photons:[],events:[],first,index};
      for(let i=0;i<points.length-1;i++) {
        const span=cumulative[i+1]-cumulative[i];if(span<1e-6||i===0&&!first)continue;
        const radius=source.role==='primary'?.0055:.0060;
        for(const halo of [true,false]) {
          const geometry=new T.CylinderGeometry(halo?radius*3.6:radius,halo?radius*3.6:radius,span,16,1,true);
          this.geometries.add(geometry);
          const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,blending:T.NormalBlending,toneMapped:false,vertexShader:BEAM_VERTEX,fragmentShader:BEAM_FRAGMENT,uniforms:{
            uColour:{value:this.white.clone()},uAlpha:{value:0},uReveal:{value:0},uTime:{value:0},uSegment:{value:i},uDistance:{value:cumulative[i]},uLength:{value:span},uHalo:{value:halo?1:0},uPhase:{value:index*.037}
          }});
          this.materials.add(material);const mesh=new T.Mesh(geometry,material);
          mesh.position.copy(points[i]).lerp(points[i+1],.5);
          this.tangent.subVectors(points[i+1],points[i]).normalize();mesh.quaternion.setFromUnitVectors(this.up,this.tangent);
          mesh.renderOrder=halo?12:14;mesh.frustumCulled=false;this.group.add(mesh);path.segments.push({mesh,index:i,input:i===0});
        }
      }
      for(let i=0;i<2;i++) {
        const material=new T.MeshBasicMaterial({color:this.white,transparent:true,opacity:0,depthWrite:false,toneMapped:false});this.materials.add(material);
        const core=new T.Mesh(bead,material);core.scale.set(.011,.038,.011);core.renderOrder=17;
        const haloMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,blending:T.NormalBlending,toneMapped:false,vertexShader:BEAM_VERTEX,fragmentShader:GLOW_FRAGMENT,uniforms:{uColour:{value:this.white.clone()},uAlpha:{value:0}}});this.materials.add(haloMaterial);
        const glow=new T.Mesh(bead,haloMaterial);glow.scale.set(.030,.075,.030);glow.renderOrder=13;
        this.group.add(core,glow);path.photons.push({core,glow,phase:i/2});
      }
      for(let i=1;i<points.length-1;i++) {
        if(i===1&&!first)continue;
        const ringMaterial=new T.MeshBasicMaterial({color:this.white,transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false,toneMapped:false});this.materials.add(ringMaterial);
        const disk=new T.Mesh(ring,ringMaterial);disk.position.copy(points[i]);this.normal.copy(points[i]).normalize();
        disk.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),this.normal);disk.renderOrder=15;
        const dotMaterial=new T.MeshBasicMaterial({color:this.white,transparent:true,opacity:0,depthWrite:false,toneMapped:false});this.materials.add(dotMaterial);
        const dot=new T.Mesh(bead,dotMaterial);dot.position.copy(points[i]);dot.scale.setScalar(.016);dot.renderOrder=16;
        this.group.add(disk,dot);path.events.push({ring:disk,dot,index:i,phase:i*.17+index*.017});
      }
      this.paths.push(path);
    });
  }

  update(frame:number,primaryReveal:number,primaryOpacity:number,secondaryReveal:number,secondaryOpacity:number,colourLevel:number):void {
    if(this.disposed)return;
    const time=Math.max(0,frame)/30,colour=clamp(colourLevel);
    for(const path of this.paths) {
      const n=path.points.length-1,reveal=clamp(path.source.role==='primary'?primaryReveal:secondaryReveal)*n;
      const base=clamp(path.source.role==='primary'?primaryOpacity:secondaryOpacity);
      const spectralOpacity=path.first?base:base*smooth(colour);
      for(const {mesh,input} of path.segments) {
        const a=input?base:spectralOpacity;mesh.visible=a>.0001&&reveal>mesh.material.uniforms.uSegment.value;
        this.tempColour.copy(this.white);if(!input)this.tempColour.lerp(path.colour,colour);
        mesh.material.uniforms.uColour.value.copy(this.tempColour);mesh.material.uniforms.uAlpha.value=a;
        mesh.material.uniforms.uReveal.value=reveal;mesh.material.uniforms.uTime.value=time;
      }
      for(const photon of path.photons) {
        const d=fract(time*.19+photon.phase)*path.length;let segment=0;
        while(segment<n-1&&d>path.cumulative[segment+1])segment++;
        const local=(d-path.cumulative[segment])/Math.max(1e-8,path.cumulative[segment+1]-path.cumulative[segment]);
        const inherited=segment===0?(path.first?base:0):spectralOpacity;
        const a=inherited*smooth((reveal-segment-local)/.045)*smooth(d/.15)*smooth((path.length-d)/.18);
        photon.core.visible=photon.glow.visible=a>.0001;
        photon.core.position.lerpVectors(path.points[segment],path.points[segment+1],local);photon.glow.position.copy(photon.core.position);
        this.tangent.subVectors(path.points[segment+1],path.points[segment]).normalize();photon.core.quaternion.setFromUnitVectors(this.up,this.tangent);photon.glow.quaternion.copy(photon.core.quaternion);
        this.tempColour.copy(this.white);if(segment>0)this.tempColour.lerp(path.colour,colour);
        photon.core.material.color.copy(this.tempColour);photon.core.material.opacity=a*.88;
        photon.glow.material.uniforms.uColour.value.copy(this.tempColour);photon.glow.material.uniforms.uAlpha.value=a*.29;
      }
      for(const event of path.events) {
        const reached=smooth((reveal-event.index)/.055),a=(event.index===1?base:spectralOpacity)*reached;
        const pulse=fract(time*.58+event.phase);event.ring.scale.setScalar(.050+.066*pulse);
        event.ring.visible=event.dot.visible=a>.0001;event.ring.material.opacity=a*.32*(1-pulse)**1.5;event.dot.material.opacity=a*.61;
        this.tempColour.copy(this.white);if(event.index>1)this.tempColour.lerp(path.colour,colour);
        event.ring.material.color.copy(this.tempColour);event.dot.material.color.copy(this.tempColour);
      }
    }
    this.group.visible=clamp(primaryOpacity)+clamp(secondaryOpacity)>.0001;
  }

  dispose():void {
    if(this.disposed)return;this.disposed=true;
    this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.group.clear();
    this.paths.length=0;this.geometries.clear();this.materials.clear();
  }
}
