import * as T from 'three';
import {SpectralRibbonV09} from './SpectralRibbonV09';

export type MacroPathV09 = { points:T.Vector3[]; color:string; role:'primary'|'secondary' };
const bounded=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
const ease=(x:number)=>{const t=bounded(x);return t*t*(3-2*t);};

/** A clean authored three-softbox reflection map for optical explanation shots.
 * It deliberately removes miniature landscape/cloud reflections from a metre-scale
 * illustrative droplet; the outdoor scene can keep its photographic HDRI unchanged.
 */
export function createMacroStudioV09(renderer:T.WebGLRenderer):T.WebGLRenderTarget{
  const scene=new T.Scene();scene.background=new T.Color('#3d5b68');
  const geometry:T.BufferGeometry[]=[],materials:T.Material[]=[];
  const rounded=(width:number,height:number,radius:number)=>{
    const w=width/2,h=height/2,r=Math.min(radius,w,h),shape=new T.Shape();
    shape.moveTo(-w+r,-h);shape.lineTo(w-r,-h);shape.quadraticCurveTo(w,-h,w,-h+r);
    shape.lineTo(w,h-r);shape.quadraticCurveTo(w,h,w-r,h);shape.lineTo(-w+r,h);shape.quadraticCurveTo(-w,h,-w,h-r);
    shape.lineTo(-w,-h+r);shape.quadraticCurveTo(-w,-h,-w+r,-h);return new T.ShapeGeometry(shape,32);
  };
  const panels:[number[],number,number,string][]=[
    [[-4.4,2.4,5.2],2.8,6.8,'#e8f4ff'],
    [[2.0,5.8,-3.8],5.2,1.35,'#eee7dc'],
    [[5.8,-.2,2.8],2.7,4.9,'#88b1be'],
  ];
  for(const [p,w,h,colour] of panels){
    const rig=new T.Group();rig.position.set(...p as [number,number,number]);rig.lookAt(0,0,0);
    for(let i=5;i>=0;i--){
      const spread=1+i*.055,g=rounded(w*spread,h*spread,.40),m=new T.MeshBasicMaterial({color:colour,transparent:true,opacity:i===0?.69:.044,depthWrite:false,toneMapped:false});
      const mesh=new T.Mesh(g,m);mesh.position.z=i*.002;mesh.renderOrder=6-i;rig.add(mesh);geometry.push(g);materials.push(m);
    }
    scene.add(rig);
  }
  const pmrem=new T.PMREMGenerator(renderer),map=pmrem.fromScene(scene,.065,.1,100);
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
  float silhouette=pow(1.-incidence,2.5);
  float edge=pow(1.-incidence,12.);
  vec3 local=normalize(vLocalNormal);
  // Broad, quiet area-light response; no moving texture or spurious light path.
  float upper=pow(max(0.,dot(local,normalize(vec3(-.45,.67,.62)))),45.);
  float lower=pow(max(0.,dot(local,normalize(vec3(.58,-.31,-.73)))),65.);
  float stripe=exp(-pow(abs((local.x+.55)*13.),2.))*smoothstep(-.30,.42,local.y);
  vec3 shade=mix(vec3(.34,.61,.68),vec3(.88,.96,1.),clamp(upper+stripe*.25,0.,1.));
  shade=mix(shade,vec3(.94,.91,.78),lower*.40);
  float a=(fresnel*.115+silhouette*.10+edge*.075+upper*.125+lower*.055+stripe*.022)*uOpacity;
  a*=mix(1.,.75,uReadability);
  gl_FragColor=vec4(shade,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Authored photographic finish for an exact spherical interface.
 * Supplies no new ray vertices, no deformation, no particle noise.
 * The optional botanical reference leaves laterally before being hidden.
 */
export class MacroLookV09 {
  readonly group=new T.Group();
  readonly context=new T.Group();
  readonly waterMaterial:T.MeshPhysicalMaterial;
  readonly spectrum:SpectralRibbonV09;
  private readonly shell:T.Mesh<T.SphereGeometry,T.ShaderMaterial>;
  private readonly body:T.Mesh;
  private readonly originalMaterial:T.Material|T.Material[];
  private readonly legacyRim:T.Mesh;
  private readonly originalRimVisible:boolean;
  private readonly contextMaterials=new Set<T.Material>();
  private disposed=false;

  constructor(drop:T.Mesh,rim:T.Mesh,paths:MacroPathV09[]=[]){
    this.body=drop;this.legacyRim=rim;this.originalMaterial=drop.material;this.originalRimVisible=rim.visible;
    this.group.name='v08-exact-water-interface-photographic-finish';
    this.waterMaterial=new T.MeshPhysicalMaterial({
      color:'#f2faff',roughness:.027,metalness:0,transmission:.963,ior:1.333,
      thickness:3.2,attenuationColor:new T.Color('#d3e8ee'),attenuationDistance:18,
      envMapIntensity:1.08,clearcoat:.24,clearcoatRoughness:.065,
      specularIntensity:.83,specularColor:new T.Color('#f3fbff'),
      transparent:true,opacity:.88,depthWrite:false,depthTest:true,side:T.FrontSide,
    });
    drop.material=this.waterMaterial;drop.renderOrder=4;
    const material=new T.ShaderMaterial({
      transparent:true,depthTest:true,depthWrite:false,side:T.FrontSide,
      blending:T.NormalBlending,uniforms:{uOpacity:{value:0},uReadability:{value:0}},
      vertexShader:SURFACE_VERTEX,fragmentShader:SURFACE_FRAGMENT,
    });
    this.shell=new T.Mesh(new T.SphereGeometry(1.605,192,128),material);
    this.shell.name='restrained-water-Fresnel-interface';this.shell.renderOrder=9;
    this.context.name='botanical-macro-reference-leaves-off-screen';this.context.visible=false;
    this.spectrum=new SpectralRibbonV09(paths);
    this.group.add(this.shell,this.context,this.spectrum.group);
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
    this.waterMaterial.opacity=visible*(.88-.22*read);
    this.waterMaterial.envMapIntensity=1.08-.23*read;
    this.waterMaterial.roughness=.027+.017*read;
    this.shell.material.uniforms.uOpacity.value=visible;
    this.shell.material.uniforms.uReadability.value=read;
    // The imported Blender mesh is a unit sphere scaled to radius 1.6.
    // Keep that metric transform untouched: the exact Snell vertices use 1.6.
    // Liquid presence comes from camera/light motion, never a second silhouette.
    this.legacyRim.visible=false;
    this.spectrum.update(frame,primaryReveal,primaryOpacity,secondaryReveal,secondaryOpacity,colourLevel);

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
    this.contextMaterials.forEach(m=>m.dispose());this.contextMaterials.clear();
    this.context.traverse(o=>{const mesh=o as T.Mesh;if(mesh.isMesh)mesh.geometry.dispose();});
    this.group.clear();
  }
}
