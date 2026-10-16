import * as T from 'three';
import {SpectralRibbonV15} from './SpectralRibbonV15';

export type MacroPathV15={points:T.Vector3[];color:string;role:'primary'|'secondary'};
const unit=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
const ease=(x:number)=>{const t=unit(x);return t*t*(3-2*t);};

/** Dark photographic studio. Actual softbox geometry supplies curved reflections
 * through a PMREM map; the sphere itself has no decorative rainbow rim. */
export function createMacroStudioV15(renderer:T.WebGLRenderer):T.WebGLRenderTarget{
 const scene=new T.Scene();scene.background=new T.Color('#060a0e');
 const resources:{geometry:T.BufferGeometry;material:T.Material}[]=[];
 const rounded=(width:number,height:number,radius:number)=>{
  const w=width/2,h=height/2,r=Math.min(radius,w,h),s=new T.Shape();
  s.moveTo(-w+r,-h);s.lineTo(w-r,-h);s.quadraticCurveTo(w,-h,w,-h+r);
  s.lineTo(w,h-r);s.quadraticCurveTo(w,h,w-r,h);s.lineTo(-w+r,h);s.quadraticCurveTo(-w,h,-w,h-r);
  s.lineTo(-w,-h+r);s.quadraticCurveTo(-w,-h,-w+r,-h);return new T.ShapeGeometry(s,32);
 };
 const panels:[T.Vector3,number,number,string,number][]=[
  [new T.Vector3(-4.4,2.4,5.0),1.55,7.0,'#e8f6ff',1.52],
  [new T.Vector3(1.6,5.6,-4.5),5.4,.72,'#fbf8ed',1.22],
  [new T.Vector3(5.8,-.3,2.5),.85,5.4,'#90c9d4',1.10],
  [new T.Vector3(-2.8,-5.8,-1.8),3.3,.25,'#b7e2eb',.40],
 ];
 for(const [p,w,h,colour,intensity] of panels){
  const rig=new T.Group();rig.position.copy(p);rig.lookAt(0,0,0);
  for(let i=4;i>=0;i--){
   const spread=1+i*.045,g=rounded(w*spread,h*spread,.3);
   const m=new T.MeshBasicMaterial({color:new T.Color(colour).multiplyScalar(intensity),transparent:true,opacity:i===0?.86:.035,depthWrite:false,toneMapped:false});
   const mesh=new T.Mesh(g,m);mesh.position.z=i*.003;mesh.renderOrder=5-i;rig.add(mesh);resources.push({geometry:g,material:m});
  }scene.add(rig);
 }
 const pmrem=new T.PMREMGenerator(renderer),map=pmrem.fromScene(scene,.035,.1,100);
 pmrem.dispose();resources.forEach(r=>{r.geometry.dispose();r.material.dispose();});return map;
}

const SURFACE_VERTEX=/* glsl */`
varying vec3 vNormal,vView,vLocalNormal;
void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);vLocalNormal=normal;gl_Position=projectionMatrix*p;}`;
const SURFACE_FRAGMENT=/* glsl */`
uniform float uOpacity,uReadability;varying vec3 vNormal,vView,vLocalNormal;
void main(){
 vec3 n=normalize(vNormal),view=normalize(vView),local=normalize(vLocalNormal);
 float incidence=clamp(abs(dot(n,view)),0.,1.);
 float edge=pow(1.-incidence,11.5),shoulder=pow(1.-incidence,3.7);
 // The rim is strongest where a softbox illuminates it. A full bright ring
 // would read as a thin soap bubble, rather than a volumetric water sphere.
 float key=pow(max(0.,dot(local,normalize(vec3(-.62,.48,.62)))),.8);
 float fill=pow(max(0.,dot(local,normalize(vec3(.78,-.21,-.59)))),1.1);
 float strip=exp(-pow((local.x+.56)*19.,2.))*smoothstep(-.52,.35,local.y);
 float cap=pow(max(0.,dot(local,normalize(vec3(-.42,.74,.52)))),95.);
 float lower=pow(max(0.,dot(local,normalize(vec3(.44,-.46,-.76)))),140.);
 float lit=.15+.72*key+.25*fill;
 float a=(edge*.30*lit+shoulder*.08*lit+strip*.105+cap*.35+lower*.10)*uOpacity;
 a*=mix(1.,.78,uReadability);
 vec3 colour=mix(vec3(.48,.73,.79),vec3(1.6,1.68,1.72),clamp(strip*.55+cap*.94+edge*.31*key,0.,1.));
 gl_FragColor=vec4(colour,clamp(a,0.,.72));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const CONTACT_VERTEX=`varying vec2 vUv;void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(0.,0.,0.,1.);p.xy+=position.xy;gl_Position=projectionMatrix*p;}`;
const CONTACT_FRAGMENT=/* glsl */`
uniform vec3 uColour;uniform float uAlpha;varying vec2 vUv;
void main(){vec2 q=(vUv-.5)*2.;float r=length(q);
 float core=exp(-pow(r/.085,2.)),middle=exp(-pow(r/.28,2.));
 float halo=exp(-pow(r/.68,2.))*(1.-smoothstep(.8,1.,r));
 float streak=exp(-pow(q.y/.017,2.))*exp(-pow(q.x/.42,2.));
 float a=uAlpha*(core*.80+middle*.12+halo*.016+streak*.12);
 if(a<.00002)discard;
 gl_FragColor=vec4(mix(uColour,vec3(3.0,3.08,3.13),core*.25),clamp(a,0.,1.));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
type Contact={mesh:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>;role:'primary'|'secondary';pointIndex:number;segmentCount:number;strength:number;colour:T.Color;spectralIndex:number;sharedEntry:boolean};

/** Exact spherical water interface with a deliberately photographic display look.
 * Geometric radius, path vertices and Snell data are owned by the calling world. */
export class MacroLookV15 {
 readonly group=new T.Group();readonly context=new T.Group();readonly waterMaterial:T.MeshPhysicalMaterial;readonly spectrum:SpectralRibbonV15;
 private readonly shell:T.Mesh<T.SphereGeometry,T.ShaderMaterial>;private readonly body:T.Mesh;
 private readonly originalMaterial:T.Material|T.Material[];private readonly rim:T.Mesh;private readonly originalRimVisible:boolean;
 private readonly contactGeometry=new T.PlaneGeometry(.18,.18);private readonly contacts:Contact[]=[];
 private readonly contextMaterials=new Set<T.Material>();private readonly white=new T.Color('#f6fcff');private disposed=false;
 constructor(drop:T.Mesh,rim:T.Mesh,paths:MacroPathV15[]=[]){
  this.body=drop;this.rim=rim;this.originalMaterial=drop.material;this.originalRimVisible=rim.visible;
  this.group.name='v15-crystalline-water-studio-interface';this.group.userData.provenance='Codex authored water studio finish; no displacement or new optical path; shell is cosmetic';
  this.waterMaterial=new T.MeshPhysicalMaterial({color:'#fbffff',roughness:.009,metalness:0,transmission:.986,ior:1.333,
   thickness:3.2,attenuationColor:new T.Color('#d5f2f7'),attenuationDistance:36,envMapIntensity:1.30,
   clearcoat:0,clearcoatRoughness:.025,specularIntensity:1,specularColor:new T.Color('#f8fdff'),
   transparent:true,opacity:.965,depthWrite:false,depthTest:true,side:T.FrontSide});
  drop.material=this.waterMaterial;drop.renderOrder=4;
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.FrontSide,blending:T.NormalBlending,toneMapped:false,
   uniforms:{uOpacity:{value:0},uReadability:{value:0}},vertexShader:SURFACE_VERTEX,fragmentShader:SURFACE_FRAGMENT});
  this.shell=new T.Mesh(new T.SphereGeometry(1.6004,192,128),material);this.shell.name='v15-directionally-lit-water-edge';this.shell.renderOrder=10;
  this.context.name='v15-optional-botanical-scale-context';this.context.visible=false;
  this.spectrum=new SpectralRibbonV15(paths);this.group.add(this.shell,this.context,this.spectrum.group);
  for(const role of ['primary','secondary'] as const){
   const rows=paths.filter(p=>p.role===role&&p.points.length>=3&&p.points.every(v=>v.toArray().every(Number.isFinite)));if(!rows.length)continue;
   const sharedEntry=rows.every(p=>p.points[1].distanceTo(rows[0].points[1])<1e-8);
   rows.forEach((p,spectralIndex)=>{for(let i=1;i<p.points.length-1;i++){
    // A single white incident ray genuinely shares its entrance. Reflection
    // and exit points remain separate for every wavelength, even if very close.
    if(i===1&&sharedEntry&&spectralIndex!==0)continue;
    const m=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,blending:T.NormalBlending,toneMapped:false,
     vertexShader:CONTACT_VERTEX,fragmentShader:CONTACT_FRAGMENT,uniforms:{uColour:{value:this.white.clone()},uAlpha:{value:0}}});
    const mesh=new T.Mesh(this.contactGeometry,m);mesh.position.copy(p.points[i]);mesh.frustumCulled=false;mesh.renderOrder=20;mesh.visible=false;
    mesh.name=`v16-${role}-spectral-${spectralIndex}-interface-contact-${i}`;mesh.userData.provenance='Cosmetic interface radiance at this wavelength’s own Snell vertex; not irradiance simulation';
    mesh.userData.spectralIndex=spectralIndex;mesh.userData.pointIndex=i;mesh.userData.role=role;mesh.userData.sharedEntry=i===1&&sharedEntry;
    this.contacts.push({mesh,role,pointIndex:i,segmentCount:p.points.length-1,strength:i===1&&sharedEntry?.72:(i===p.points.length-2?.56:.43)/Math.sqrt(rows.length),colour:new T.Color(p.color),spectralIndex,sharedEntry:i===1&&sharedEntry});this.group.add(mesh);
   }});
  }
 }
 attachContext(leaf:T.Object3D):void{
  if(this.disposed)return;leaf.rotation.set(-Math.PI/2,0,0);
  const originalTipY=-1.705+.10*Math.cos(-4.7*.43)+.045*Math.sin(-4.7*.88);leaf.position.set(4.7,1.6+originalTipY,0);this.context.add(leaf);
  leaf.traverse(o=>{const m=o as T.Mesh;if(!m.isMesh)return;const originals=Array.isArray(m.material)?m.material:[m.material];
   const clones=originals.map(original=>{const c=original.clone();c.userData.macroV15BaseOpacity=c.opacity;this.contextMaterials.add(c);return c;});m.material=Array.isArray(m.material)?clones:clones[0];});
 }
 update(frame:number,primaryReveal:number,primaryOpacity:number,secondaryReveal:number,secondaryOpacity:number,colourLevel:number,camera?:T.Camera,contextPresence=0):void{
  if(this.disposed)return;const visible=Math.max(unit(primaryOpacity),unit(secondaryOpacity)),read=ease(Math.max(primaryReveal,secondaryReveal)*2-.63)*ease(colourLevel+.30);
  this.group.visible=visible>.0001;this.waterMaterial.opacity=visible*(.965-.17*read);this.waterMaterial.envMapIntensity=1.30-.28*read;this.waterMaterial.roughness=.009+.009*read;
  this.shell.material.uniforms.uOpacity.value=visible;this.shell.material.uniforms.uReadability.value=read;this.rim.visible=false;
  this.spectrum.update(frame,primaryReveal,primaryOpacity,secondaryReveal,secondaryOpacity,colourLevel);
  for(const c of this.contacts){const reveal=unit(c.role==='primary'?primaryReveal:secondaryReveal),opacity=unit(c.role==='primary'?primaryOpacity:secondaryOpacity),arrival=ease((reveal*c.segmentCount-c.pointIndex)/.055);
   const spectralVisibility=c.sharedEntry||c.spectralIndex===0?1:unit(colourLevel);
   c.mesh.material.uniforms.uAlpha.value=opacity*arrival*c.strength*spectralVisibility;(c.mesh.material.uniforms.uColour.value as T.Color).copy(this.white).lerp(c.colour,c.pointIndex===1?0:unit(colourLevel)*.82);c.mesh.visible=c.mesh.material.uniforms.uAlpha.value>.00001;}
  const presence=unit(contextPresence)*visible,departure=1-ease(contextPresence);this.context.position.set(-departure*17,-departure*.6,-departure*.5);this.context.rotation.set(.12,-.17-departure*.07,.13);this.context.visible=contextPresence>.0001&&visible>.0001;
  for(const m of this.contextMaterials){m.opacity=(m.userData.macroV15BaseOpacity??1)*presence;const transparent=m.opacity<.995;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.depthWrite=!transparent;}
  if(camera&&Number.isFinite(frame))this.shell.userData.lastCameraDistance=camera.position.distanceTo(this.body.getWorldPosition(new T.Vector3()));
 }
 dispose():void{
  if(this.disposed)return;this.disposed=true;if(this.body.material===this.waterMaterial)this.body.material=this.originalMaterial;this.rim.visible=this.originalRimVisible;
  this.shell.geometry.dispose();this.shell.material.dispose();this.waterMaterial.dispose();this.spectrum.dispose();this.contacts.forEach(c=>c.mesh.material.dispose());this.contacts.length=0;this.contactGeometry.dispose();this.contextMaterials.forEach(m=>m.dispose());this.contextMaterials.clear();this.context.traverse(o=>{const m=o as T.Mesh;if(m.isMesh)m.geometry.dispose();});this.group.clear();
 }
}
