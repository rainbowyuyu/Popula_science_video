import * as T from 'three';

export type MacroContactPathV12 = {points:T.Vector3[];color:string;role:'primary'|'secondary'};
export type MacroContactCueV12 = {
  role:'primary'|'secondary';pointIndex:number;arrivalFrame:number;
  approachFrames?:number;holdFrames?:number;releaseFrames?:number;strength?:number;
};
type Contact={
  cue:Required<MacroContactCueV12>;point:T.Vector3;incoming:T.Vector3;outgoing:T.Vector3;
  colour:T.Color;patch:T.Mesh<T.SphereGeometry,T.ShaderMaterial>;front:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>;
};
const clamp=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
const smooth=(x:number)=>{const t=clamp(x);return t*t*(3-2*t);};
const finite=(v:T.Vector3)=>v.toArray().every(Number.isFinite);
const sane=(x:number|undefined,fallback:number)=>Number.isFinite(x)?Math.max(1,Math.min(90,x!)):fallback;
const SURFACE_VERTEX=/* glsl */`
varying vec3 vLocalNormal;varying vec3 vNormal;varying vec3 vView;
void main(){
 vLocalNormal=normalize(normal);vec4 p=modelViewMatrix*vec4(position,1.);
 vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);gl_Position=projectionMatrix*p;
}`;
const SURFACE_FRAGMENT=/* glsl */`
uniform vec3 uColour;uniform vec3 uContactNormal;uniform float uAlpha;
varying vec3 vLocalNormal;varying vec3 vNormal;varying vec3 vView;
void main(){
 float angle=acos(clamp(dot(normalize(vLocalNormal),normalize(uContactNormal)),-1.,1.));
 // Curved, local illumination at the real interface, not a flat decal or ring.
 float footprint=exp(-pow(angle/.072,2.));
 float facing=.62+.38*abs(dot(normalize(vNormal),normalize(vView)));
 float a=uAlpha*footprint*facing;if(a<.00004)discard;
 gl_FragColor=vec4(uColour,a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const FRONT_VERTEX=/* glsl */`
varying vec2 vUv;
void main(){
 vUv=uv;vec4 c=modelViewMatrix*vec4(0.,0.,0.,1.);
 // The light packet is view-facing; its centre still follows the verified ray.
 c.xy+=position.xy;gl_Position=projectionMatrix*c;
}`;
const FRONT_FRAGMENT=/* glsl */`
uniform vec3 uColour;uniform float uAlpha;varying vec2 vUv;
void main(){
 vec2 q=(vUv-.5)*2.;float a=uAlpha*exp(-4.*dot(q,q))*(1.-smoothstep(.72,1.,length(q)));
 if(a<.00004)discard;gl_FragColor=vec4(uColour,a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Three one-shot curved-surface contacts; absolute-frame evaluation, exact centre. */
export class MacroContactV12{
 readonly group=new T.Group();private readonly contacts:Contact[]=[];
 private readonly frontGeometry=new T.PlaneGeometry(.095,.095);
 private readonly white=new T.Color('#fff4da');private disposed=false;
 constructor(paths:MacroContactPathV12[],cues:MacroContactCueV12[]=[]){
  this.group.name='v13-one-shot-curved-optical-interface-contact';
  const first=new Map<'primary'|'secondary',MacroContactPathV12>();
  for(const p of paths)if(!first.has(p.role))first.set(p.role,p);
  for(const cue of cues){
   const p=first.get(cue.role),i=cue.pointIndex;
   if(!p||!Number.isInteger(i)||i<1||i>=p.points.length-1||!Number.isFinite(cue.arrivalFrame))continue;
   const a=p.points[i-1],point=p.points[i],b=p.points[i+1];
   if(!finite(a)||!finite(point)||!finite(b)||point.lengthSq()<1e-10)continue;
   const incoming=point.clone().sub(a),outgoing=b.clone().sub(point);
   if(incoming.lengthSq()<1e-10||outgoing.lengthSq()<1e-10)continue;
   incoming.normalize();outgoing.normalize();
   const normal=point.clone().normalize(),common={transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,blending:T.NormalBlending,toneMapped:false};
   const patch=new T.Mesh(new T.SphereGeometry(point.length()+.002,96,64),new T.ShaderMaterial({
    ...common,vertexShader:SURFACE_VERTEX,fragmentShader:SURFACE_FRAGMENT,
    uniforms:{uColour:{value:this.white.clone()},uAlpha:{value:0},uContactNormal:{value:normal}},
   }));
   const front=new T.Mesh(this.frontGeometry,new T.ShaderMaterial({
    ...common,vertexShader:FRONT_VERTEX,fragmentShader:FRONT_FRAGMENT,
    uniforms:{uColour:{value:this.white.clone()},uAlpha:{value:0}},
   }));
   patch.name=`v13-${cue.role}-curved-contact-${i}`;front.name=`v13-${cue.role}-light-front-${i}`;
   patch.renderOrder=15;front.renderOrder=16;patch.frustumCulled=front.frustumCulled=false;
   patch.visible=front.visible=false;front.position.copy(point);this.group.add(patch,front);
   this.contacts.push({cue:{...cue,approachFrames:sane(cue.approachFrames,8),holdFrames:sane(cue.holdFrames,8),releaseFrames:sane(cue.releaseFrames,24),strength:clamp(cue.strength??.70)},point:point.clone(),incoming,outgoing,colour:new T.Color(p.color),patch,front});
  }
 }
 update(frame:number,primaryOpacity:number,secondaryOpacity:number,colourLevel:number):void{
  if(this.disposed)return;const f=Number.isFinite(frame)?frame:-1e9;let any=false;
  for(const c of this.contacts){
   const q=c.cue,dt=f-q.arrivalFrame,approach=smooth((dt+q.approachFrames)/q.approachFrames),release=1-smooth((dt-q.holdFrames)/q.releaseFrames);
   const a=approach*release*clamp(q.role==='primary'?primaryOpacity:secondaryOpacity)*q.strength;
   c.patch.visible=c.front.visible=a>.0001;any=any||c.patch.visible;
   c.patch.material.uniforms.uAlpha.value=a*.32;c.front.material.uniforms.uAlpha.value=a*.20;
   const colour=c.patch.material.uniforms.uColour.value as T.Color;colour.copy(this.white);
   if(q.pointIndex>1)colour.lerp(c.colour,clamp(colourLevel)*.22);
   (c.front.material.uniforms.uColour.value as T.Color).copy(colour);
   if(dt<=0)c.front.position.copy(c.point).addScaledVector(c.incoming,-.16*(1-approach));
   else c.front.position.copy(c.point).addScaledVector(c.outgoing,.23*smooth(dt/(q.holdFrames+q.releaseFrames)));
  }
  this.group.visible=any;
 }
 dispose():void{
  if(this.disposed)return;this.disposed=true;
  for(const c of this.contacts){c.patch.geometry.dispose();c.patch.material.dispose();c.front.material.dispose();}
  this.frontGeometry.dispose();this.contacts.length=0;this.group.clear();
 }
}
