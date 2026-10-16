import * as T from 'three';

/** Dense, textured, normal-oriented 3-D Gaussian surface scene. This is an
 * authored artistic surface-splat representation, not a photographed/trained
 * 3DGS reconstruction. Every ellipse uses projected 3-D covariance and actual
 * displaced camera depth; it is not a two-dimensional screen overlay. */
export type GaussianMetadataV16 = {
  /** V18 keeps the V16 binary layout/API so the renderer remains reusable. */
  version: 'V16'|'V18'|'V19'; count: number; stride: 16; encoding: 'float32-le';
  representation: string; coordinates: string; sourceGLB: string;
  bounds: {min: number[]; max: number[]};
};
export type GaussianStateV16 = {
  opacity?: number; gather?: number; scatter?: number;
  focus?: T.Vector3 | [number, number, number]; radius?: number;
  pointScale?: number; focusDistance?: number; aperturePixels?: number;
};
export const GAUSSIAN_SCENE_V16_ASSET = 'assets_v19/gaussian/rain-garden-v19.splats.bin';
export const GAUSSIAN_SCENE_V16_METADATA = 'assets_v19/gaussian/rain-garden-v19.splats.json';

const vertex = /* glsl */`
attribute vec3 aCenter;attribute vec3 aColour;attribute float aAlpha;
attribute vec3 aSigma;attribute vec4 aRotation;attribute float aSeed;attribute float aCategory;
uniform vec2 uViewport;uniform float uOpacity;uniform float uScatter;
uniform float uPointScale;uniform float uFocusDistance;uniform float uAperture;
uniform vec3 uFocus;uniform float uRadius;
varying vec2 vGaussian;varying vec3 vColour;varying float vAlpha;
mat3 quaternion(vec4 q){
 vec3 v=q.xyz;float w=q.w;
 return mat3(1.-2.*(v.y*v.y+v.z*v.z),2.*(v.x*v.y+v.z*w),2.*(v.x*v.z-v.y*w),
  2.*(v.x*v.y-v.z*w),1.-2.*(v.x*v.x+v.z*v.z),2.*(v.y*v.z+v.x*w),
  2.*(v.x*v.z+v.y*w),2.*(v.y*v.z-v.x*w),1.-2.*(v.x*v.x+v.y*v.y));
}
void main(){
 float distanceToFocus=length(aCenter-uFocus);
 float influence=smoothstep(uRadius*.23,uRadius*.63,distanceToFocus)*(1.-smoothstep(uRadius*.78,uRadius,distanceToFocus));
 // Category gains are part of the frozen V16 artistic splat recipe. They
 // control only the authored gather/scatter displacement, never the source
 // colours or covariance and never whether the scene loads.
 float categoryGain=aCategory<.5?.03:aCategory<1.5?.10:aCategory<2.5?.02:aCategory<3.5?.52:aCategory<4.5?.08:.32;
 vec3 dir=normalize(vec3(sin(aSeed*131.7),sin(aSeed*413.1+.23),cos(aSeed*237.3)));
 vec3 p=aCenter+dir*uScatter*influence*categoryGain*(.55+.65*aSeed);
 vec4 view=modelViewMatrix*vec4(p,1.);vec4 clip=projectionMatrix*view;
 // A covariance linearisation is local to its visible centre. Very near but
 // far-offscreen terrain samples would otherwise make enormous ellipses whose
 // tails cover the whole image. Reject them before projection, like 3DGS.
 if(view.z>-.18||abs(clip.x)>abs(clip.w)*1.45||abs(clip.y)>abs(clip.w)*1.45){
  gl_Position=vec4(2.,2.,2.,1.);vGaussian=vec2(4.);vColour=vec3(0.);vAlpha=0.;return;
 }
 float z=max(.05,-view.z);
 mat3 orient=mat3(modelViewMatrix)*quaternion(aRotation);
 vec3 sigma=aSigma*uPointScale*(1.+uScatter*.07*influence);
 mat3 size=mat3(sigma.x,0.,0.,0.,sigma.y,0.,0.,0.,sigma.z);
 mat3 transform=orient*size;mat3 covariance=transform*transpose(transform);
 float fx=projectionMatrix[0][0]*uViewport.x*.5;
 float fy=projectionMatrix[1][1]*uViewport.y*.5;
 float boundedX=clamp(view.x/z,-1.3/projectionMatrix[0][0],1.3/projectionMatrix[0][0]);
 float boundedY=clamp(view.y/z,-1.3/projectionMatrix[1][1],1.3/projectionMatrix[1][1]);
 vec3 jx=vec3(fx/z,0.,fx*boundedX/z);
 vec3 jy=vec3(0.,fy/z,fy*boundedY/z);
 float defocus=min(9.,abs(z-uFocusDistance)/max(z,.1)*uAperture);
 float lowpass=.24+defocus*defocus;
 float a=dot(jx,covariance*jx)+lowpass;
 float b=dot(jx,covariance*jy);
 float c=dot(jy,covariance*jy)+lowpass;
 float mean=.5*(a+c),discriminant=sqrt(max(1e-8,.25*(a-c)*(a-c)+b*b));
 float lambda1=max(.24,mean+discriminant),lambda2=max(.24,mean-discriminant);
 vec2 major=abs(b)>1e-5?normalize(vec2(b,lambda1-a)):(a>=c?vec2(1.,0.):vec2(0.,1.));
 vec2 minor=vec2(-major.y,major.x);
 vec2 offset=3.*(major*sqrt(lambda1)*position.x+minor*sqrt(lambda2)*position.y);
 // The optical depth stays attached to the actual 3-D centre. The ellipse only
 // expands in clip x/y; 3 sigma finite support keeps the raster workload bounded.
 clip.xy+=offset/uViewport*2.*clip.w;clip.z-=.000013*clip.w;
 gl_Position=clip;vGaussian=position.xy*3.;vColour=aColour;
 vAlpha=aAlpha*uOpacity*(view.z<-.05?1.:0.);
}`;
 const fragment = /* glsl */`
varying vec2 vGaussian;varying vec3 vColour;varying float vAlpha;
void main(){float exponent=dot(vGaussian,vGaussian);if(exponent>9.)discard;
 float alpha=exp(-.5*exponent)*vAlpha;if(alpha<.003)discard;
 // V19 hand-painted grade: gently compress wet highlights while retaining the
 // mint foliage hue. This is a display grade only; geometry and optical data
 // remain the authored Gaussian records.
 vec3 rainGrade=clamp(vColour,0.0,1.0);
 float luma=dot(rainGrade,vec3(0.2126,0.7152,0.0722));
 rainGrade=mix(vec3(luma),rainGrade,0.90);
 rainGrade=rainGrade*vec3(1.045,1.020,0.985)+vec3(0.004,0.010,0.006);
 rainGrade=rainGrade/(1.0+max(rainGrade-0.72,0.0)*0.55);
 // Preserve a little headroom in the pale V19 ground so the optical arc and
 // character remain separated during the high aerial circle shot.
 rainGrade*=vec3(.92,.95,.94);
 gl_FragColor=vec4(clamp(rainGrade,0.0,1.0),alpha);
 #include <colorspace_fragment>
}`;

const clamp = (x:number) => Math.max(0, Math.min(1,x));
export class GaussianSceneV16 extends T.Group {
  readonly metadata: GaussianMetadataV16;
  readonly count: number;
  readonly geometry: T.InstancedBufferGeometry;
  readonly material: T.ShaderMaterial;
  readonly mesh: T.Mesh<T.InstancedBufferGeometry, T.ShaderMaterial>;
  private readonly source: Float32Array;
  private readonly sorted: Float32Array;
  private readonly stream: T.InstancedInterleavedBuffer;
  private readonly order: Uint32Array;
  private readonly depths: Float32Array;
  private readonly focus = new T.Vector3(0,1,-8);
  private readonly viewModel = new T.Matrix4();
  private readonly temp = new T.Vector3();
  private readonly displacement = new T.Vector3();
  private disposed = false;
  lastState = {frame:0,opacity:0,scatter:0,radius:8,pointScale:1};

  constructor(buffer:ArrayBuffer, metadata:GaussianMetadataV16) {
    super();
    if (!['V16','V18','V19'].includes(metadata.version)||metadata.stride!==16||metadata.encoding!=='float32-le') throw new Error('Unsupported Gaussian metadata');
    if (buffer.byteLength!==metadata.count*16*4) throw new Error('Gaussian byte/count mismatch');
    this.name=`${metadata.version}-authored-dense-anisotropic-rain-garden`;this.metadata=metadata;
    this.source=new Float32Array(buffer);this.count=metadata.count;
    if (!this.count || this.source.some(x=>!Number.isFinite(x))) throw new Error('Invalid Gaussian values');
    this.sorted=new Float32Array(this.source.length);this.stream=new T.InstancedInterleavedBuffer(this.sorted,16,1).setUsage(T.DynamicDrawUsage);
    this.order=new Uint32Array(this.count);this.depths=new Float32Array(this.count);
    for(let i=0;i<this.count;i++)this.order[i]=i;
    this.geometry=new T.InstancedBufferGeometry();
    this.geometry.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
    this.geometry.setIndex([0,1,2,0,2,3]);this.geometry.instanceCount=this.count;
    for (const [name,size,offset] of [
      ['aCenter',3,0],['aColour',3,3],['aAlpha',1,6],['aSigma',3,7],['aRotation',4,10],['aSeed',1,14],['aCategory',1,15],
    ] as [string,number,number][]) this.geometry.setAttribute(name,new T.InterleavedBufferAttribute(this.stream,size,offset));
    this.material=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,depthTest:true,depthWrite:false,side:T.DoubleSide,toneMapped:false,
      uniforms:{uViewport:{value:new T.Vector2(1920,1080)},uOpacity:{value:0},uScatter:{value:0},uFocus:{value:this.focus},uRadius:{value:8},uPointScale:{value:1},uFocusDistance:{value:18},uAperture:{value:1.2}}});
    this.mesh=new T.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.name=`${metadata.version}-perspective-covariance-depth-sorted-Gaussians`;this.add(this.mesh);this.visible=false;
    this.userData.representation=metadata.representation;
  }

  static async load(binaryURL:string, metadataURL:string):Promise<GaussianSceneV16> {
    const [binary,meta]=await Promise.all([fetch(binaryURL),fetch(metadataURL)]);
    if(!binary.ok||!meta.ok)throw new Error(`Gaussian scene fetch failed: ${binary.status}/${meta.status}`);
    const [buffer,metadata]=await Promise.all([binary.arrayBuffer(),meta.json() as Promise<GaussianMetadataV16>]);
    return new GaussianSceneV16(buffer,metadata);
  }
  setViewport(width:number,height:number){
    if(!(width>0&&height>0))throw new Error('Gaussian viewport must be positive');
    this.material.uniforms.uViewport.value.set(width,height);
  }
  /** Absolute-frame seeking; never Date.now, Math.random, time deltas or RAF.
   * opacity must be authored >0 in the chosen Gaussian shot. Hide the opaque
   * source GLB supports ground/tree continuity via setGaussianSupportVisibility.
   * The group is already in world Y-up metres; scale=1. */
  update(camera:T.Camera,frame:number,state:GaussianStateV16={}){
    if(this.disposed)return;
    const opacity=clamp(state.opacity??1);
    const scatter=Math.min(.45,state.scatter??((1-clamp(state.gather??1))*.32));
    const radius=state.radius??8,pointScale=state.pointScale??1;
    if(![frame,opacity,scatter,radius,pointScale].every(Number.isFinite)||radius<=0||scatter<0||pointScale<=0)throw new Error('Invalid Gaussian frame/state');
    if(state.focus)this.focus.copy(Array.isArray(state.focus)?new T.Vector3(...state.focus):state.focus);
    const u=this.material.uniforms;u.uOpacity.value=opacity;u.uScatter.value=scatter;u.uRadius.value=radius;u.uPointScale.value=pointScale;
    u.uFocusDistance.value=state.focusDistance??18;u.uAperture.value=state.aperturePixels??1.2;
    this.lastState={frame,opacity,scatter,radius,pointScale};this.visible=opacity>.002;
    if(!this.visible)return;
    camera.updateMatrixWorld(true);this.updateMatrixWorld(true);
    this.viewModel.multiplyMatrices(camera.matrixWorldInverse,this.matrixWorld);
    // Sort actual moved centres, not the undisplaced input or a 2-D layer.
    for(let i=0;i<this.count;i++){
      const k=i*16,seed=this.source[k+14];this.temp.set(this.source[k],this.source[k+1],this.source[k+2]);
      const distance=this.temp.distanceTo(this.focus),a=clamp((distance-radius*.23)/(radius*.40)),b=clamp((distance-radius*.78)/(radius*.22));
      const influence=a*a*(3-2*a)*(1-b*b*(3-2*b));
      const category=this.source[k+15],gain=category<.5?.03:category<1.5?.10:category<2.5?.02:category<3.5?.52:category<4.5?.08:.32;
      this.displacement.set(Math.sin(seed*131.7),Math.sin(seed*413.1+.23),Math.cos(seed*237.3)).normalize().multiplyScalar(scatter*influence*gain*(.55+.65*seed));
      this.temp.add(this.displacement).applyMatrix4(this.viewModel);this.depths[i]=this.temp.z;
    }
    this.order.sort((a,b)=>this.depths[a]-this.depths[b]||a-b);
    for(let i=0;i<this.count;i++){
      const sourceOffset=this.order[i]*16,destinationOffset=i*16;
      for(let j=0;j<16;j++)this.sorted[destinationOffset+j]=this.source[sourceOffset+j];
    }
    this.stream.needsUpdate=true;
  }
  /** Optional reproducible diagnostic, suitable for reverse-seek QA. */
  sortedIndices(){return new Uint32Array(this.order);}
  dispose(){if(this.disposed)return;this.disposed=true;this.removeFromParent();this.geometry.dispose();this.material.dispose();}
}

/** Suggested independent preview path: slow movement toward the creek while
 * a local tree/ground patch scatters and gathers, preserving all depth planes. */
export function gaussianPreviewCameraV16(camera:T.PerspectiveCamera,frame:number,fps=30){
  const t=clamp(frame/(fps*8));const q=t*t*(3-2*t);
  camera.position.set(3.4-5.4*q,2.45+.32*Math.sin(q*Math.PI),15.2-6.1*q);
  camera.lookAt(-2.1-.9*q,1.7,-8.2);camera.fov=47;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const scatter=.26*Math.sin(Math.PI*q)**2;
  return {opacity:.72,gather:1-scatter/.26,scatter,focus:new T.Vector3(-7,1,-3),radius:9,pointScale:.78,focusDistance:18,aperturePixels:.65} satisfies GaussianStateV16;
}

