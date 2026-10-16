import * as T from 'three';
import {SpectralRibbonV14} from './SpectralRibbonV14';

export type MacroPathV14 = { points:T.Vector3[]; color:string; role:'primary'|'secondary' };
const bounded=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
const ease=(x:number)=>{const t=bounded(x);return t*t*(3-2*t);};

/** A clean authored three-softbox reflection map for optical explanation shots.
 * It deliberately removes miniature landscape/cloud reflections from a metre-scale
 * illustrative droplet; the outdoor scene can keep its photographic HDRI unchanged.
 */
export function createMacroStudioV14(renderer:T.WebGLRenderer):T.WebGLRenderTarget{
  const scene=new T.Scene();scene.background=new T.Color('#193137');
  const geometry:T.BufferGeometry[]=[],materials:T.Material[]=[];
  const rounded=(width:number,height:number,radius:number)=>{
    const w=width/2,h=height/2,r=Math.min(radius,w,h),shape=new T.Shape();
    shape.moveTo(-w+r,-h);shape.lineTo(w-r,-h);shape.quadraticCurveTo(w,-h,w,-h+r);
    shape.lineTo(w,h-r);shape.quadraticCurveTo(w,h,w-r,h);shape.lineTo(-w+r,h);shape.quadraticCurveTo(-w,h,-w,h-r);
    shape.lineTo(-w,-h+r);shape.quadraticCurveTo(-w,-h,-w+r,-h);return new T.ShapeGeometry(shape,32);
  };
  const panels:[number[],number,number,string][]=[
    [[-4.4,2.4,5.2],1.2,7.2,'#e9f7ff'],
    [[2.0,5.8,-3.8],5.2,.60,'#f3f3ed'],
    [[5.8,-.2,2.8],1.35,4.9,'#7bb6c3'],
  ];
  for(const [p,w,h,colour] of panels){
    const rig=new T.Group();rig.position.set(...p as [number,number,number]);rig.lookAt(0,0,0);
    for(let i=5;i>=0;i--){
      const spread=1+i*.055,g=rounded(w*spread,h*spread,.40),m=new T.MeshBasicMaterial({color:colour,transparent:true,opacity:i===0?.69:.044,depthWrite:false,toneMapped:false});
      const mesh=new T.Mesh(g,m);mesh.position.z=i*.002;mesh.renderOrder=6-i;rig.add(mesh);geometry.push(g);materials.push(m);
    }
    scene.add(rig);
  }
  const pmrem=new T.PMREMGenerator(renderer),map=pmrem.fromScene(scene,.040,.1,100);
  pmrem.dispose();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());return map;
}

const SURFACE_VERTEX=/* glsl */`
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocalNormal;
void main(){
  vec4 p=modelViewMatrix*vec4(position,1.0);
  vNormal=normalize(normalMatrix*normal);
  vView=normalize(-p.xyz);
  vLocalNormal=normal;
  gl_Position=projectionMatrix*p;
}`;
const SURFACE_FRAGMENT=/* glsl */`
uniform float uOpacity;
uniform float uReadability;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocalNormal;
void main(){
  vec3 n=normalize(vNormal),view=normalize(vView);
  float incidence=clamp(abs(dot(n,view)),0.,1.);
  // Schlick water-interface reflectance is cosmetic, not ray tracing.
  float fresnel=.02037+.97963*pow(1.-incidence,5.);
  float silhouette=pow(1.-incidence,3.4);
  float edge=pow(1.-incidence,15.);
  vec3 local=normalize(vLocalNormal);
  // Broad, quiet area-light response; no moving texture or spurious light path.
  float upper=pow(max(0.,dot(local,normalize(vec3(-.45,.67,.62)))),68.);
  float lower=pow(max(0.,dot(local,normalize(vec3(.58,-.31,-.73)))),84.);
  float stripe=exp(-pow(abs((local.x+.55)*19.),2.))*smoothstep(-.30,.42,local.y);
  vec3 shade=mix(vec3(.47,.70,.75),vec3(.97,1.,1.04),clamp(upper+stripe*.29+edge*.33,0.,1.));
  shade=mix(shade,vec3(.91,.93,.84),lower*.28);
  float a=(fresnel*.15+silhouette*.105+edge*.094+upper*.15+lower*.066+stripe*.032)*uOpacity;
  a*=mix(1.,.80,uReadability);
  gl_FragColor=vec4(shade,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const CONTACT_VERTEX=/* glsl */`
varying vec2 vUv;
void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(0.,0.,0.,1.);p.xy+=position.xy;gl_Position=projectionMatrix*p;}`;
const CONTACT_FRAGMENT=/* glsl */`
uniform vec3 uColour;uniform float uAlpha;varying vec2 vUv;
void main(){
 vec2 q=(vUv-.5)*2.;float r=length(q);
 float core=exp(-pow(r/.066,2.));
 float middle=exp(-pow(r/.225,2.));
 float veil=exp(-pow(r/.65,2.))*(1.-smoothstep(.72,1.,r));
 float streak=exp(-pow(q.y/.018,2.))*exp(-pow(q.x/.34,2.));
 float a=uAlpha*(.86*core+.13*middle+.018*veil+.080*streak);
 if(a<.00002)discard;
 vec3 c=mix(uColour,vec3(2.3,2.35,2.4),core*.78);
 gl_FragColor=vec4(c,clamp(a,0.,1.));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
type ContactV14={mesh:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>;role:'primary'|'secondary';pointIndex:number;segmentCount:number;strength:number;colour:T.Color};

/**
 * Authored photographic finish for an exact spherical interface.
 * Supplies no new ray vertices, no deformation, no particle noise.
 * The optional botanical reference leaves laterally before being hidden.
 */
export class MacroLookV14 {
  readonly group=new T.Group();
  readonly context=new T.Group();
  readonly waterMaterial:T.MeshPhysicalMaterial;
  readonly spectrum:SpectralRibbonV14;
  private readonly shell:T.Mesh<T.SphereGeometry,T.ShaderMaterial>;
  private readonly body:T.Mesh;
  private readonly originalMaterial:T.Material|T.Material[];
  private readonly legacyRim:T.Mesh;
  private readonly originalRimVisible:boolean;
  private readonly contextMaterials=new Set<T.Material>();
  private readonly contactGeometry=new T.PlaneGeometry(.24,.24);
  private readonly contacts:ContactV14[]=[];
  private readonly contactWhite=new T.Color('#f7fcff');
  private disposed=false;

  constructor(drop:T.Mesh,rim:T.Mesh,paths:MacroPathV14[]=[]){
    this.body=drop;this.legacyRim=rim;this.originalMaterial=drop.material;this.originalRimVisible=rim.visible;
    this.group.name='v14-exact-water-interface-photographic-finish';
    this.group.userData.provenance='Codex authored water photographic display look; exact spherical Snell radius preserved';
    this.waterMaterial=new T.MeshPhysicalMaterial({
      color:'#fcffff',roughness:.012,metalness:0,transmission:.994,ior:1.333,
      thickness:3.2,attenuationColor:new T.Color('#e7f5fa'),attenuationDistance:72,
      envMapIntensity:.96,clearcoat:.035,clearcoatRoughness:.028,
      specularIntensity:1,specularColor:new T.Color('#f7fcff'),
      transparent:true,opacity:.92,depthWrite:false,depthTest:true,side:T.FrontSide,
    });
    drop.material=this.waterMaterial;drop.renderOrder=4;
    const material=new T.ShaderMaterial({
      transparent:true,depthTest:true,depthWrite:false,side:T.FrontSide,
      blending:T.NormalBlending,uniforms:{uOpacity:{value:0},uReadability:{value:0}},
      vertexShader:SURFACE_VERTEX,fragmentShader:SURFACE_FRAGMENT,
    });
    this.shell=new T.Mesh(new T.SphereGeometry(1.6005,192,128),material);
    this.shell.name='v14-water-thin-Fresnel-silhouette';this.shell.renderOrder=9;
    this.context.name='botanical-macro-reference-leaves-off-screen';this.context.visible=false;
    this.spectrum=new SpectralRibbonV14(paths);
    this.group.add(this.shell,this.context,this.spectrum.group);
    for(const role of ['primary','secondary'] as const){
      const candidates=paths.filter(p=>p.role===role&&p.points.length>=3&&p.points.every(v=>v.toArray().every(Number.isFinite)));
      const path=candidates[Math.floor(candidates.length/2)];if(!path)continue;
      for(let i=1;i<path.points.length-1;i++){
        const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,blending:T.NormalBlending,toneMapped:false,
          vertexShader:CONTACT_VERTEX,fragmentShader:CONTACT_FRAGMENT,uniforms:{uColour:{value:this.contactWhite.clone()},uAlpha:{value:0}}});
        const mesh=new T.Mesh(this.contactGeometry,material);mesh.position.copy(path.points[i]);mesh.frustumCulled=false;mesh.renderOrder=18;mesh.visible=false;
        mesh.name=`v14-${role}-quiet-interface-flare-at-verified-vertex-${i}`;
        mesh.userData.provenance='Cosmetic finite highlight centred on one actual verified Snell interface point';
        this.contacts.push({mesh,role,pointIndex:i,segmentCount:path.points.length-1,strength:i===1?.64:i===path.points.length-2?.48:.29,colour:new T.Color(path.color)});this.group.add(mesh);
      }
    }
  }

  /** Add the local Blender GLB. This method owns the hanging-drop placement. */
  attachContext(leaf:T.Object3D):void{
    if(this.disposed)return;
    // This GLB was authored Y-up in Blender. -PI/2 intentionally flips the
    // recovered botanical reference above the spherical droplet; then the leaf
    // tip meets (0,1.6,0), not the leaf centre. Film must not add another offset.
    leaf.rotation.set(-Math.PI/2,0,0);
    const originalTipY=-1.705+.10*Math.cos(-4.7*.43)+.045*Math.sin(-4.7*.88);
    leaf.position.set(4.7,1.6+originalTipY,0);
    this.context.add(leaf);
    leaf.traverse(o=>{
      const mesh=o as T.Mesh;if(!mesh.isMesh)return;
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      const clones=materials.map(m=>{
        const c=m.clone();c.userData.macroV08BaseOpacity=c.opacity;
        const surface=c as T.MeshStandardMaterial;
        if(surface.isMeshStandardMaterial&&surface.name.includes('botanical')){
          // A thin, backlit leaf has gentle ambient translucency; no noisy bitmap.
          surface.emissive.set('#183c25');surface.emissiveIntensity=.14;
          surface.side=T.DoubleSide;surface.roughness=.39;
        }
        this.contextMaterials.add(c);return c;
      });
      mesh.material=Array.isArray(mesh.material)?clones:clones[0];
      mesh.castShadow=true;mesh.receiveShadow=true;
    });
  }

  update(frame:number,primaryReveal:number,primaryOpacity:number,secondaryReveal:number,secondaryOpacity:number,colourLevel:number,camera?:T.Camera,contextPresence=0):void{
    if(this.disposed)return;
    const visible=Math.max(bounded(primaryOpacity),bounded(secondaryOpacity));
    const read=ease(Math.max(primaryReveal,secondaryReveal)*2-.63)*ease(colourLevel+.30);
    this.group.visible=visible>.0001;
    // Read-through happens gently as the Snell path is explained, without clipping a fake hole.
    this.waterMaterial.opacity=visible*(.92-.21*read);
    this.waterMaterial.envMapIntensity=.96-.21*read;
    this.waterMaterial.roughness=.012+.011*read;
    this.shell.material.uniforms.uOpacity.value=visible;
    this.shell.material.uniforms.uReadability.value=read;
    // The imported Blender mesh is a unit sphere scaled to radius 1.6.
    // Keep that metric transform untouched: the exact Snell vertices use 1.6.
    // Liquid presence comes from camera/light motion, never a second silhouette.
    this.legacyRim.visible=false;
    this.spectrum.update(frame,primaryReveal,primaryOpacity,secondaryReveal,secondaryOpacity,colourLevel);
    for(const c of this.contacts){
      const reveal=bounded(c.role==='primary'?primaryReveal:secondaryReveal),opacity=bounded(c.role==='primary'?primaryOpacity:secondaryOpacity);
      const arrival=ease((reveal*c.segmentCount-c.pointIndex)/.065);
      c.mesh.material.uniforms.uAlpha.value=opacity*arrival*c.strength;
      (c.mesh.material.uniforms.uColour.value as T.Color).copy(this.contactWhite).lerp(c.colour,c.pointIndex===1?0:bounded(colourLevel)*.14);
      c.mesh.visible=c.mesh.material.uniforms.uAlpha.value>.00001;
    }

    const presence=bounded(contextPresence)*visible;
    const departure=1-ease(contextPresence);
    // Full leaf remains at the same optical scale; it exits far to camera-left before hiding.
    this.context.position.set(-departure*17,-departure*.6,-departure*.5);
    this.context.rotation.y=-.17-departure*.07;
    this.context.rotation.z=.13;
    this.context.rotation.x=.12;
    this.context.visible=contextPresence>.0001&&visible>.0001;
    for(const m of this.contextMaterials){
      m.opacity=(m.userData.macroV08BaseOpacity??1)*presence;
      const isTransparent=m.opacity<.995;
      if(m.transparent!==isTransparent){m.transparent=isTransparent;m.needsUpdate=true;}
      m.depthWrite=!isTransparent;
    }
    // Interface glow never gains width with frame/time. Camera argument is deliberately
    // accepted so the film can share the same API with the spectral field component.
    if(camera&&Number.isFinite(frame))this.shell.userData.lastCameraDistance=camera.position.distanceTo(this.body.getWorldPosition(new T.Vector3()));
  }

  dispose():void{
    if(this.disposed)return;this.disposed=true;
    if(this.body.material===this.waterMaterial)this.body.material=this.originalMaterial;
    this.legacyRim.visible=this.originalRimVisible;
    this.shell.geometry.dispose();this.shell.material.dispose();this.waterMaterial.dispose();
    this.spectrum.dispose();
    for(const c of this.contacts)c.mesh.material.dispose();this.contacts.length=0;this.contactGeometry.dispose();
    this.contextMaterials.forEach(m=>m.dispose());this.contextMaterials.clear();
    this.context.traverse(o=>{const mesh=o as T.Mesh;if(mesh.isMesh)mesh.geometry.dispose();});
    this.group.clear();
  }
}

