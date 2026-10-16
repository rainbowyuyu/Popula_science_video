import * as T from 'three';

const VERTEX=/* glsl */`
uniform vec3 uA;uniform vec3 uB;uniform float uWidth;varying vec2 vUv;
void main(){
 vUv=uv;vec4 a=modelViewMatrix*vec4(uA,1.),b=modelViewMatrix*vec4(uB,1.);
 vec2 d=b.xy-a.xy;float norm=length(d);vec2 across=norm>.00001?vec2(-d.y,d.x)/norm:vec2(1.,0.);
 vec4 p=mix(a,b,uv.x);p.xy+=across*(uv.y*2.-1.)*uWidth;
 gl_Position=projectionMatrix*p;
}`;
const FRAGMENT=/* glsl */`
uniform vec3 uColour;uniform float uPortion;uniform float uOpacity;uniform float uTime;uniform float uPhase;
varying vec2 vUv;
void main(){
 if(uPortion<=0.||vUv.x>uPortion)discard;
 float crossRay=(vUv.y-.5)*2.;
 float core=exp(-pow(crossRay/.20,2.));
 float veil=exp(-pow(crossRay/.62,2.))*(1.-smoothstep(.75,1.,abs(crossRay)));
 float source=smoothstep(0.,.012,vUv.x);
 float end=1.-smoothstep(max(0.,uPortion-.020),uPortion,vUv.x);
 float phase=fract(vUv.x*.70-uTime*.12+uPhase);
 float packet=exp(-pow((phase-.5)/.16,2.));
 float alpha=clamp(uOpacity*(.70*core+.105*veil)*source*end*(.91+.09*packet),0.,1.);
 if(alpha<.00002)discard;
 vec3 radiance=mix(uColour,vec3(.97,.98,1.),core*.09);
 gl_FragColor=vec4(radiance,alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Art-directed finite light footprint centred on a verified optical segment. */
export function createRadianceSegmentV13(a:T.Vector3,b:T.Vector3,width=.038):T.Mesh<T.BufferGeometry,T.ShaderMaterial>{
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0],3));
 geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));geometry.setIndex([0,1,2,2,1,3]);
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,blending:T.NormalBlending,toneMapped:false,
  vertexShader:VERTEX,fragmentShader:FRAGMENT,uniforms:{uA:{value:a.clone()},uB:{value:b.clone()},uWidth:{value:Number.isFinite(width)?Math.max(.002,Math.min(.16,width)):.038},uColour:{value:new T.Color('#fff4dc')},uPortion:{value:0},uOpacity:{value:0},uTime:{value:0},uPhase:{value:0}},
 });
 const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=13;mesh.visible=false;
 mesh.name='v13-view-facing-radiance-on-verified-centreline';mesh.userData.provenance='Codex local authored radiance envelope; exact supplied segment endpoints; not an intensity simulation';return mesh;
}
export function updateRadianceSegmentV13(mesh:T.Mesh<T.BufferGeometry,T.ShaderMaterial>,portion:number,opacity:number,colour:T.Color,frame:number,phase=0):void{
 const finiteUnit=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
 const u=mesh.material.uniforms;u.uPortion.value=finiteUnit(portion);u.uOpacity.value=finiteUnit(opacity);
 (u.uColour.value as T.Color).copy(colour);u.uTime.value=Number.isFinite(frame)?Math.max(0,frame)/30:0;u.uPhase.value=Number.isFinite(phase)?phase:0;
 mesh.visible=u.uPortion.value>.00001&&u.uOpacity.value>.00001;
}
