import * as T from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {BokehPass} from 'three/examples/jsm/postprocessing/BokehPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';

const clamp=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;

/** V19Motion: clear outdoor depth with optional sub-pixel near-field softness.
 * Optional world focus point may come from the current camera route. Micro
 * explanations retain sharp optical paths and neutral colour response.
 */
export class CinematicLensV19Motion {
  private readonly composer:EffectComposer;
  private readonly bokeh:BokehPass;
  private readonly bloom:UnrealBloomPass;
  private readonly finish:ShaderPass;
  private readonly renderer:T.WebGLRenderer;
  private readonly camera:T.PerspectiveCamera;
  private readonly originalExposure:number;
  private readonly splatPlate:T.WebGLRenderTarget;
  private readonly meshPlate:T.WebGLRenderTarget;
  private readonly copyMaterial:T.ShaderMaterial;
  private readonly blendMaterial:T.ShaderMaterial;
  private readonly plateQuad:FullScreenQuad;
  private disposed=false;

  constructor(renderer:T.WebGLRenderer,scene:T.Scene,camera:T.PerspectiveCamera){
    this.renderer=renderer;this.camera=camera;this.originalExposure=renderer.toneMappingExposure;
    const target=new T.WebGLRenderTarget(1920,1080,{type:T.HalfFloatType,depthBuffer:true});target.samples=4;
    this.composer=new EffectComposer(renderer,target);this.composer.addPass(new RenderPass(scene,camera));
    this.bokeh=new BokehPass(scene,camera,{focus:12,aperture:.00015,maxblur:.00032});
    // The old signed focus-distance blur softened every distant surface. A
    // landscape aerial shot needs its actor, meadow, rainbow and horizon in
    // the same deep focus. Only geometry within <=1.8 metres of the lens is
    // allowed a sub-pixel optical softness; all other pixels are exact copies.
    this.bokeh.materialBokeh.fragmentShader=this.bokeh.materialBokeh.fragmentShader.replace(
      'float factor = ( focus + viewZ );',
      `float nearLimit=min(focus*.10,1.8);
       if(viewZ<=-nearLimit){gl_FragColor=texture2D(tColor,vUv);return;}
       float factor=max(0.,nearLimit+viewZ);`
    );
    this.bokeh.materialBokeh.needsUpdate=true;
    this.composer.addPass(this.bokeh);
    // Half-float highlights can contain non-finite pixels. Repair those local
    // samples before the bloom pyramid spreads them across a large rectangle.
    // This changes display radiance only; no optical geometry/data is altered.
    this.composer.addPass(new ShaderPass({uniforms:{tDiffuse:{value:null},uPixel:{value:new T.Vector2(1/1920,1/1080)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform sampler2D tDiffuse;uniform vec2 uPixel;varying vec2 vUv;
        vec3 safeColor(vec3 c){return vec3(c.r>=0.?min(c.r,32.):0.,c.g>=0.?min(c.g,32.):0.,c.b>=0.?min(c.b,32.):0.);}
        bool usable(vec3 c){return c.r>=0.&&c.g>=0.&&c.b>=0.&&c.r<60000.&&c.g<60000.&&c.b<60000.;}
        void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;
          if(!usable(c)){c=.25*(safeColor(texture2D(tDiffuse,vUv+vec2(uPixel.x,0.)).rgb)
            +safeColor(texture2D(tDiffuse,vUv-vec2(uPixel.x,0.)).rgb)
            +safeColor(texture2D(tDiffuse,vUv+vec2(0.,uPixel.y)).rgb)
            +safeColor(texture2D(tDiffuse,vUv-vec2(0.,uPixel.y)).rgb));}
          gl_FragColor=vec4(safeColor(c),1.);}` }));
    this.bloom=new UnrealBloomPass(new T.Vector2(960,540),.075,.34,1.12);this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish=new ShaderPass({uniforms:{tDiffuse:{value:null},uFrame:{value:0},uMicro:{value:0}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform sampler2D tDiffuse;uniform float uFrame,uMicro;varying vec2 vUv;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;
          float l=dot(c,vec3(.2126,.7152,.0722));
          float outdoor=1.-uMicro,high=smoothstep(.62,.93,l),low=1.-smoothstep(.12,.38,l);
          c+=outdoor*(vec3(.0045,.0018,-.0028)*high+vec3(-.0018,.0009,.0035)*low);
          c=mix(c,(c-.5)*1.014+.5,outdoor*.55);
          c=mix(c,max(vec3(0.),c-vec3(.0015,.0015,.0010)),uMicro*.55);
          vec2 p=(vUv-.5)*vec2(1.10,1.);c*=1.-(.025+.017*uMicro)*smoothstep(.22,.73,dot(p,p));
          c+=(hash(vUv*vec2(1920.,1080.))-.5)*.00045;
          gl_FragColor=vec4(clamp(c,0.,1.),1.);}`});
    this.composer.addPass(this.finish);this.composer.setSize(1920,1080);
    // Completed photographic branches are blended, not partially opaque
    // world meshes. A barely visible opaque GLB previously wrote full depth
    // over the splats, and leaf alphaTest thresholds changed its silhouette.
    this.splatPlate=new T.WebGLRenderTarget(1920,1080,{type:T.HalfFloatType,depthBuffer:false});
    this.meshPlate=this.splatPlate.clone();
    const plateVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
    this.copyMaterial=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{tPlate:{value:null}},vertexShader:plateVertex,
      fragmentShader:'uniform sampler2D tPlate;varying vec2 vUv;void main(){gl_FragColor=texture2D(tPlate,vUv);}'});
    this.blendMaterial=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{tMesh:{value:this.meshPlate.texture},tSplat:{value:this.splatPlate.texture},uSplat:{value:0}},vertexShader:plateVertex,
      fragmentShader:'uniform sampler2D tMesh,tSplat;uniform float uSplat;varying vec2 vUv;void main(){gl_FragColor=vec4(mix(texture2D(tMesh,vUv).rgb,texture2D(tSplat,vUv).rgb,uSplat),1.);}'});
    this.plateQuad=new FullScreenQuad(this.copyMaterial);
  }

  /** Same camera/world, two complete render branches. At either endpoint the
   * existing single render is used; only the short handoff needs two renders.
   * prepare callbacks toggle only the garden mesh/splats and update reflection.
   */
  renderGardenHandoff(frame:number,micro:number,focusPoint:T.Vector3,splatStrength:number,prepare:{mesh:()=>void;splat:()=>void}):void{
    if(this.disposed)return;
    const weight=clamp(splatStrength);
    if(weight<=1e-7){prepare.mesh();this.render(frame,micro,focusPoint,0);return;}
    if(weight>=1-1e-7){prepare.splat();this.render(frame,micro,focusPoint,1);return;}
    const originalTarget=this.renderer.getRenderTarget(),originalToScreen=this.composer.renderToScreen;
    try{
      this.composer.renderToScreen=false;
      const capture=(target:T.WebGLRenderTarget)=>{
        this.copyMaterial.uniforms.tPlate.value=this.composer.readBuffer.texture;
        this.plateQuad.material=this.copyMaterial;
        this.renderer.setRenderTarget(target);this.renderer.clear();this.plateQuad.render(this.renderer);
      };
      prepare.splat();this.render(frame,micro,focusPoint,1);capture(this.splatPlate);
      prepare.mesh();this.render(frame,micro,focusPoint,0);capture(this.meshPlate);
      this.blendMaterial.uniforms.uSplat.value=weight;this.plateQuad.material=this.blendMaterial;
      this.renderer.setRenderTarget(originalTarget);this.renderer.clear();this.plateQuad.render(this.renderer);
    }finally{
      this.composer.renderToScreen=originalToScreen;this.renderer.setRenderTarget(originalTarget);
    }
  }

  render(frame:number,micro:number,focusPoint?:T.Vector3,splatStrength=0):void{
    if(this.disposed)return;
    const m=clamp(micro),outdoor=1-m;
    this.renderer.toneMappingExposure=1.00-.008*m;
    const focus=focusPoint??(m>.15?new T.Vector3(0,4,0):new T.Vector3(0,1.55,7));
    const forward=new T.Vector3();this.camera.getWorldDirection(forward);
    const distance=focus.clone().sub(this.camera.position).dot(forward);
    const uniforms=this.bokeh.uniforms as Record<string,T.IUniform>;
    uniforms.focus.value=Math.max(1,Math.min(100,Number.isFinite(distance)?distance:12));
    const focusReturn=clamp(1-splatStrength/.002);
    const focusGain=focusReturn*focusReturn*(3-2*focusReturn);
    uniforms.aperture.value=.00015*outdoor*outdoor*focusGain;
    uniforms.maxblur.value=.00032*outdoor*focusGain;
    // An override depth pass cannot reconstruct custom billboard centres.
    // Gaussian splats apply their own perspective/covariance defocus instead.
    this.bokeh.enabled=m<.999&&splatStrength<.002;
    // Broad mist and damp grass should not bloom into a white veil. The
    // narrower outdoor bloom is reserved for tiny actual specular highlights;
    // retain the previously approved optical-studio glow for the close-up.
    this.bloom.strength=.040+.180*m;this.bloom.threshold=1.24-.20*m;this.bloom.radius=.22+.155*m;
    this.finish.uniforms.uFrame.value=Number.isFinite(frame)?Math.max(0,frame):0;
    this.finish.uniforms.uMicro.value=m;
    this.composer.render(0);
  }

  dispose():void{
    if(this.disposed)return;this.disposed=true;
    this.composer.passes.forEach(p=>p.dispose?.());this.composer.dispose();
    this.splatPlate.dispose();this.meshPlate.dispose();this.copyMaterial.dispose();this.blendMaterial.dispose();this.plateQuad.dispose();
    this.renderer.toneMappingExposure=this.originalExposure;
  }
}

