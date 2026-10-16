import * as T from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Restrained optical finish. DOM labels and captions stay sharp above it. */
export class CinematicLensV08{
  private readonly composer:EffectComposer;
  private readonly bloom:UnrealBloomPass;
  private readonly finish:ShaderPass;
  constructor(renderer:T.WebGLRenderer,scene:T.Scene,camera:T.PerspectiveCamera){
    const target=new T.WebGLRenderTarget(1920,1080,{type:T.HalfFloatType,depthBuffer:true});target.samples=4;
    this.composer=new EffectComposer(renderer,target);
    this.composer.addPass(new RenderPass(scene,camera));
    this.bloom=new UnrealBloomPass(new T.Vector2(960,540),.19,.24,.91);
    this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
    this.finish=new ShaderPass({uniforms:{tDiffuse:{value:null},uFrame:{value:0}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform sampler2D tDiffuse;uniform float uFrame;varying vec2 vUv;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;
          vec2 p=(vUv-.5)*vec2(1.15,1.);float vignette=1.-.085*smoothstep(.12,.66,dot(p,p));
          c*=vignette;c+=(hash(vUv*vec2(1920.,1080.)+vec2(mod(uFrame,31.)))-.5)*.0024;
          gl_FragColor=vec4(c,1.);}`});
    this.composer.addPass(this.finish);this.composer.setSize(1920,1080);
  }
  render(frame:number,micro:number){this.finish.uniforms.uFrame.value=frame;this.bloom.strength=.11+.12*micro;this.composer.render();}
  dispose(){this.composer.passes.forEach(p=>p.dispose?.());this.composer.dispose();}
}
