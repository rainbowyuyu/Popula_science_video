import React,{useLayoutEffect,useMemo,useRef} from 'react';
import {AbsoluteFill,continueRender,delayRender,useCurrentFrame,useVideoConfig} from 'remotion';
import * as T from 'three';

export const MIST_RANGE_V13={start:31,plateauStart:55,plateauEnd:120,end:147,minPlateauAlpha:.999997} as const;
const unit=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
const smooth=(x:number)=>{const q=unit(x);return q*q*(3-2*q);};
/** Absolute-frame mist envelope, not a global footage-opacity animation. */
export function mistStrengthAtV13(frame:number):number{
 const r=MIST_RANGE_V13;
 if(!Number.isFinite(frame)||frame<=r.start||frame>=r.end)return 0;
 return smooth((frame-r.start)/(r.plateauStart-r.start))*(1-smooth((frame-r.plateauEnd)/(r.end-r.plateauEnd)));
}
export function mistParametersAtV13(frame:number){
 const f=Number.isFinite(frame)?frame:-1;
 const r=MIST_RANGE_V13;
 return {strength:mistStrengthAtV13(f),enter:smooth((f-r.start)/(r.plateauStart-r.start)),exit:smooth((f-r.plateauEnd)/(r.end-r.plateauEnd)),coverAll:f>=r.plateauStart&&f<=r.plateauEnd,frame:f};
}
const VERTEX=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const FRAGMENT=/* glsl */`
precision highp float;
uniform float uTime,uEnter,uExit,uStrength,uCoverAll;uniform vec2 uResolution;
uniform vec3 uBase,uShade,uLight;varying vec2 vUv;
float hash3(vec3 p){p=fract(p*.1031+vec3(.137,.071,.019));p+=dot(p,p.yzx+31.32);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fieldNoise(vec3 p){return .58*noise3(p)+.29*noise3(p*2.03+vec3(11.7,3.1,5.2))+.13*noise3(p*4.11+vec3(2.3,17.8,9.4));}
float cloudDensity(vec3 p){
 vec3 advected=p+vec3(-uTime*.27,uTime*.055,0.);
 float n=fieldNoise(advected*.88);
 float a=1.-length((p-vec3(-1.1,.5,3.5))/vec3(6.4,3.8,2.5));
 float b=1.-length((p-vec3(2.,-.6,3.2))/vec3(4.8,3.1,2.2));
 float body=max(a,b);return max(0.,body)*mix(.55,1.12,n);
}
void main(){
 vec2 q=vUv*2.-1.;q.x*=uResolution.x/uResolution.y;
 vec3 direction=normalize(vec3(q*.49,1.));
 float opticalDepth=0.,detail=0.,weight=0.;vec3 radiance=vec3(0.);
 // Finite ellipsoidal fog bodies, advected only by requested frame time.
 for(int i=0;i<20;i++){
  float distance=1.15+(float(i)+.5)*.265;vec3 p=direction*distance;
  float density=cloudDensity(p);float extinction=density*.265*3.8;
  float alpha=1.-exp(-extinction);float transmittance=exp(-opticalDepth);
  float n=fieldNoise(p*.72+vec3(-uTime*.18,0.,2.));
  float light=clamp(.42+.26*p.y+.21*n,0.,1.);
  vec3 c=mix(uShade,uBase,.40+.40*n);c=mix(c,uLight,light*.33);
  radiance+=c*alpha*transmittance;weight+=alpha*transmittance;opticalDepth+=extinction;detail+=n*.05;
 }
 vec3 colour=radiance/max(weight,.00001);
 // Natural cloud-edge wobble moves with wind. The two sides cross the viewport,
 // while the enclosed plateau is fully opaque in every pixel.
 float edgeNoise=fieldNoise(vec3(vUv*3.6,uTime*.12))-.5;
 float diagonal=vUv.x+vUv.y*.17;
 float front=mix(-.48,1.96,uEnter)+edgeNoise*.35;
 float rear=mix(-.46,1.69,uExit)+edgeNoise*.30;
 float mask=(1.-smoothstep(front-.30,front+.30,diagonal))*smoothstep(rear-.30,rear+.30,diagonal);
 float volumeAlpha=1.-exp(-opticalDepth);
 float alpha=mask*mix(volumeAlpha,.999997,uCoverAll);
 // Fine close-lens haze and out-of-focus wet glints are inside the fog colour,
 // never transparent holes through to the rejected background.
 float veil=fieldNoise(vec3(vUv*8.5,uTime*.07+8.));
 // Visible near-cloud laminae retain depth under full occlusion. A flat RGB
 // fill would hide the buildings but would fail the intended mist shot.
 vec2 nearFlow=vUv*vec2(4.4,3.1)+vec2(-uTime*.52,uTime*.09);
 vec2 farFlow=vUv*vec2(3.1,2.4)+vec2(-uTime*.19,-uTime*.025);
 vec2 fold=vec2(fieldNoise(vec3(nearFlow*.68,8.1+uTime*.08)),fieldNoise(vec3(nearFlow*.68+vec2(13.,5.),2.2+uTime*.05)))-.5;
 vec2 nearDomain=nearFlow+fold*1.25;
 float nearBody=fieldNoise(vec3(nearDomain,6.2+uTime*.13));
 float farBody=fieldNoise(vec3(farFlow+fold*.37,12.+uTime*.04));
 float body=smoothstep(.31,.66,mix(farBody,nearBody,.78));
 // Low-angle sunlight picks the leading edge of each folded billow. Close
 // wisps use a faster flow and thinner, anisotropic coordinates than the body.
 float litBody=fieldNoise(vec3(nearDomain+vec2(-.13,.085),6.2+uTime*.13));
 float sideLight=clamp((litBody-nearBody)*4.5,-.27,.27);
 vec2 wispDomain=vec2(nearDomain.x*1.25+nearDomain.y*.42,nearDomain.y*2.5-nearDomain.x*.18);
 float thin=fieldNoise(vec3(wispDomain+vec2(-uTime*.28,uTime*.045),18.2+uTime*.12));
 float thread=pow(clamp(1.-abs(thin*2.-1.),0.,1.),8.);
 float shapeLight=clamp(.08+.79*body+sideLight+.10*(thread-.45)+.055*(veil-.5),0.,1.);
 vec3 frontLight=mix(uShade,uLight,shapeLight);
 // Never boost to white; rain-cloud silver is bounded by uLight.
 colour=mix(colour,frontLight,.96);
 for(int i=0;i<4;i++){
  float k=float(i),x=fract(.183+k*.271+uTime*.004),y=fract(.247+k*.173-uTime*.015);
  vec2 d=(vUv-vec2(x,y))*vec2(uResolution.x/uResolution.y,1.);float radius=.030+.008*k;
  float lens=exp(-dot(d,d)/(radius*radius));colour=mix(colour,uLight,lens*.065);
 }
 gl_FragColor=vec4(colour,clamp(alpha,0.,1.));
 #include <colorspace_fragment>
}`;

type Stage={renderer:T.WebGLRenderer;scene:T.Scene;camera:T.OrthographicCamera;mesh:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>};
/** GPU volume curtain above imagery and below branded text. No real-time loop. */
export const ForegroundMistV13:React.FC<{frame?:number}>=({frame:givenFrame})=>{
 const currentFrame=useCurrentFrame(),{width,height}=useVideoConfig(),frame=givenFrame??currentFrame;
 const canvas=useRef<HTMLCanvasElement>(null),stage=useRef<Stage|undefined>(undefined);
 const handle=useMemo(()=>delayRender(`V13 deterministic foreground volume frame ${frame}`),[frame]);
 useLayoutEffect(()=>{
  const renderer=new T.WebGLRenderer({canvas:canvas.current!,alpha:true,antialias:false,premultipliedAlpha:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  renderer.setSize(width,height,false);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;
  const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,toneMapped:false,uniforms:{uTime:{value:0},uEnter:{value:0},uExit:{value:0},uStrength:{value:0},uCoverAll:{value:0},uResolution:{value:new T.Vector2(width,height)},uBase:{value:new T.Color('#bed3d0')},uShade:{value:new T.Color('#718e91')},uLight:{value:new T.Color('#dae5e0')}},vertexShader:VERTEX,fragmentShader:FRAGMENT});
  const mesh=new T.Mesh(new T.PlaneGeometry(2,2),material),scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);mesh.frustumCulled=false;scene.add(mesh);stage.current={renderer,scene,camera,mesh};
  return ()=>{stage.current=undefined;mesh.geometry.dispose();material.dispose();renderer.dispose();renderer.forceContextLoss();};
 },[width,height]);
 useLayoutEffect(()=>{
  try{
   const s=stage.current;if(!s)throw new Error('V13 foreground mist WebGL stage is unavailable');
   const p=mistParametersAtV13(frame),u=s.mesh.material.uniforms;u.uTime.value=frame/30;u.uEnter.value=p.enter;u.uExit.value=p.exit;u.uStrength.value=p.strength;u.uCoverAll.value=p.coverAll?1:0;
   if(frame>MIST_RANGE_V13.start&&frame<MIST_RANGE_V13.end)s.renderer.render(s.scene,s.camera);else s.renderer.clear();
  }finally{continueRender(handle);}
 },[frame,handle,width,height]);
 const active=frame>MIST_RANGE_V13.start&&frame<MIST_RANGE_V13.end;
 return <AbsoluteFill style={{zIndex:4,pointerEvents:'none',display:active?'block':'none'}}><canvas ref={canvas} width={width} height={height} style={{width:'100%',height:'100%'}}/></AbsoluteFill>;
};
