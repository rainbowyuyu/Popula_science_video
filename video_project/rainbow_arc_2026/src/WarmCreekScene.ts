import * as T from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {BokehPass} from 'three/examples/jsm/postprocessing/BokehPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {createLandscape} from './WarmCreekLandscape';
import {createCabin} from './WarmCreekCabin';

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const x=clamp(n);return x*x*(3-2*x);};
const blend=(a:string,b:string,c:string,g:number,n:number)=>new T.Color(a).lerp(new T.Color(b),g).lerp(new T.Color(c),n);

function skyMaterial(){
  return new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{uTop:{value:new T.Color('#4c92bd')},uHorizon:{value:new T.Color('#c7ded9')},uWarm:{value:0},uNight:{value:0}},vertexShader:'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 vPos;uniform vec3 uTop,uHorizon;uniform float uWarm,uNight;void main(){vec3 d=normalize(vPos);float h=smoothstep(-.1,.72,d.y);vec3 c=mix(uHorizon,uTop,h);vec3 sun=vec3(1.,.55,.20);float disc=pow(max(0.,dot(d,normalize(vec3(-.35,.50,-1.)))),90.);c+=sun*disc*(.18+.66*uWarm);c=mix(c,vec3(.035,.08,.16),uNight);gl_FragColor=vec4(c,1.);}`});
}

export class WarmCreekScene{
  readonly renderer:T.WebGLRenderer; readonly scene:T.Scene; readonly camera:T.PerspectiveCamera;
  private readonly landscape:ReturnType<typeof createLandscape>; private readonly cabin:ReturnType<typeof createCabin>;
  private readonly composer:EffectComposer; private readonly bokeh:BokehPass; private readonly bloom:UnrealBloomPass; private readonly finish:ShaderPass;
  private readonly sky:T.Mesh; private readonly sun:T.DirectionalLight; private readonly fill:T.HemisphereLight; private readonly rim:T.DirectionalLight;
  private readonly fireflies:T.Points; private readonly baseFly:Float32Array;
  constructor(canvas:HTMLCanvasElement,width:number,height:number){
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(1);this.renderer.setSize(width,height,false);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.02;
    this.scene=new T.Scene();this.scene.fog=new T.FogExp2('#abc9c5',.0105);this.camera=new T.PerspectiveCamera(54,width/height,.05,220);
    this.sky=new T.Mesh(new T.SphereGeometry(175,48,32),skyMaterial());this.scene.add(this.sky);
    this.sun=new T.DirectionalLight('#fff1d3',3.1);this.sun.position.set(-15,24,-18);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.camera.left=-28;this.sun.shadow.camera.right=28;this.sun.shadow.camera.top=30;this.sun.shadow.camera.bottom=-30;this.sun.shadow.camera.far=130;this.sun.shadow.normalBias=.03;this.scene.add(this.sun);
    this.fill=new T.HemisphereLight('#c9e7f1','#4f6344',1.42);this.scene.add(this.fill);
    this.rim=new T.DirectionalLight('#88b5c0',.58);this.rim.position.set(8,10,16);this.scene.add(this.rim);
    this.landscape=createLandscape(this.scene);this.cabin=createCabin(this.scene);
    this.baseFly=new Float32Array(96*3);for(let i=0;i<96;i++){this.baseFly[i*3]=(Math.sin(i*18.2)*.5)*7;this.baseFly[i*3+1]=.4+(Math.sin(i*2.8)*.5+.5)*3.2;this.baseFly[i*3+2]=8-(Math.sin(i*9.1)*.5+.5)*72;}
    const flyGeo=new T.BufferGeometry();flyGeo.setAttribute('position',new T.BufferAttribute(this.baseFly.slice(),3));
    const flyMat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{uTime:{value:0},uNight:{value:0}},vertexShader:'uniform float uTime;varying float a;void main(){vec4 p=modelViewMatrix*vec4(position,1.);a=.4+.6*sin(position.x*8.+uTime*1.5);gl_PointSize=clamp(30./-p.z,1.,6.);gl_Position=projectionMatrix*p;}',fragmentShader:'uniform float uNight;varying float a;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(1.,.78,.30,exp(-d*d*22.)*uNight*a*.75);}'});this.fireflies=new T.Points(flyGeo,flyMat);this.scene.add(this.fireflies);
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bokeh=new BokehPass(this.scene,this.camera,{focus:17,aperture:.0006,maxblur:.008});this.composer.addPass(this.bokeh);
    this.bloom=new UnrealBloomPass(new T.Vector2(width/2,height/2),.18,.62,1.16);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
    this.finish=new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,1.08);vec2 p=(vUv-.5)*vec2(1.08,1.);c*=1.-.14*smoothstep(.2,.72,dot(p,p));gl_FragColor=vec4(c,1.);}'});this.composer.addPass(this.finish);this.composer.setSize(width,height);
  }
  update(t:number){
    const p=clamp(t/24),gold=smooth((p-.30)/.17)*(1-smooth((p-.53)/.13)),night=smooth((p-.50)/.16)*(1-smooth((p-.86)/.12));
    const z=9-p*31;this.camera.position.set(Math.sin(t*.21)*.13,.73+Math.sin(t*.17)*.018,z);this.camera.lookAt(Math.sin(t*.12)*.10,1.02,z-18.8);this.camera.fov=53.5+Math.sin(t*.1)*.7;this.camera.updateProjectionMatrix();
    this.sky.position.copy(this.camera.position);const sm=this.sky.material as T.ShaderMaterial;sm.uniforms.uTop.value.copy(blend('#4b94be','#6f83aa','#152b4a',gold,night));sm.uniforms.uHorizon.value.copy(blend('#c4dedb','#f1c08c','#4a5e80',gold,night));sm.uniforms.uWarm.value=gold;sm.uniforms.uNight.value=night;
    const fog=(this.scene.fog as T.FogExp2);fog.color.copy(blend('#a9c7c1','#d5ae82','#253b57',gold,night));fog.density=.0105+night*.004;
    const sunY=25-14*gold-8*night;this.sun.position.set(-14+gold*8,sunY,-20);this.sun.color.copy(blend('#fff1d3','#ffd08e','#a3bfdf',gold,night));this.sun.intensity=2.9*(1-night)+.42*night;
    this.fill.color.copy(blend('#c8e5ee','#d5c3b6','#759dca',gold,night));this.fill.groundColor.copy(blend('#52673f','#6d553d','#17263a',gold,night));this.fill.intensity=1.38*(1-night)+.64*night;this.rim.intensity=.58*(1-night)+.22*night;
    this.landscape.update(t,gold,night);this.cabin.update(t,night);
    const pos=this.fireflies.geometry.getAttribute('position') as T.BufferAttribute;for(let i=0;i<96;i++){pos.setXYZ(i,this.baseFly[i*3]+Math.sin(t*.32+i)*.16,this.baseFly[i*3+1]+Math.sin(t*.61+i*1.7)*.13,this.baseFly[i*3+2]);}pos.needsUpdate=true;(this.fireflies.material as T.ShaderMaterial).uniforms.uTime.value=t;(this.fireflies.material as T.ShaderMaterial).uniforms.uNight.value=smooth((night-.12)/.72);
    (this.bokeh.uniforms as Record<string,T.IUniform>).focus.value=17+p*4;this.bloom.strength=.18+gold*.13+night*.15;this.renderer.toneMappingExposure=1.02+night*.09;this.composer.render(0);
  }
  dispose(){this.landscape.dispose();this.cabin.dispose();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points){o.geometry.dispose();const m=o.material;if(Array.isArray(m))m.forEach(x=>x.dispose());else m.dispose();}});this.composer.passes.forEach(p=>p.dispose?.());this.composer.dispose();this.renderer.dispose();this.renderer.forceContextLoss();}
}
