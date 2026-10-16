import * as T from 'three';

const VERTEX=/* glsl */`
uniform vec3 uA,uB;uniform float uWidth;varying vec2 vUv;
void main(){
 vUv=uv;vec4 a=modelViewMatrix*vec4(uA,1.),b=modelViewMatrix*vec4(uB,1.);
 vec2 d=b.xy-a.xy;float n=length(d);vec2 across=n>.00001?vec2(-d.y,d.x)/n:vec2(1.,0.);
 vec4 p=mix(a,b,uv.x);p.xy+=across*(uv.y*2.-1.)*uWidth;
 gl_Position=projectionMatrix*p;
}`;
const FRAGMENT=/* glsl */`
uniform vec3 uColour;uniform float uPortion,uOpacity,uTime,uPhase;
varying vec2 vUv;
void main(){
 if(uPortion<=0.||vUv.x>uPortion)discard;
 float crossRay=abs((vUv.y-.5)*2.);
 // A resolved tight core, colored shoulder, and very quiet broad air envelope.
 // There is no opaque cylinder and no glow geometry outside this exact segment.
 float core=exp(-pow(crossRay/.118,2.));
 float shoulder=exp(-pow(crossRay/.30,2.));
 float veil=exp(-pow(crossRay/.68,2.))*(1.-smoothstep(.79,1.,crossRay));
 float start=smoothstep(0.,.006,vUv.x);
 float end=1.-smoothstep(max(0.,uPortion-.015),uPortion,vUv.x);
 float phase=fract(vUv.x*.66-uTime*.115+uPhase);
 float packet=exp(-pow((phase-.5)/.17,2.));
 float alpha=uOpacity*(.94*core+.20*shoulder+.044*veil)*start*end*(.97+.03*packet);
 if(alpha<.000015)discard;
 float neutral=1.-smoothstep(.03,.16,max(uColour.r,max(uColour.g,uColour.b))-min(uColour.r,min(uColour.g,uColour.b)));
 vec3 radiance=mix(uColour,mix(uColour,vec3(1.19,1.21,1.23),neutral),core*.16);
 gl_FragColor=vec4(radiance,clamp(alpha,0.,1.));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Authored photographic radiance around supplied Snell endpoints, not irradiance data. */
export function createRadianceSegmentV14(a:T.Vector3,b:T.Vector3,width=.040):T.Mesh<T.BufferGeometry,T.ShaderMaterial>{
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(12),3));
 geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));geometry.setIndex([0,1,2,2,1,3]);
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,blending:T.NormalBlending,toneMapped:false,
 vertexShader:VERTEX,fragmentShader:FRAGMENT,uniforms:{uA:{value:a.clone()},uB:{value:b.clone()},uWidth:{value:Number.isFinite(width)?Math.max(.002,Math.min(.16,width)):.040},uColour:{value:new T.Color('#f7fbff')},uPortion:{value:0},uOpacity:{value:0},uTime:{value:0},uPhase:{value:0}}});
 const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=13;mesh.visible=false;
 mesh.name='v14-tight-photographic-light-on-verified-centreline';
 mesh.userData.provenance='Codex authored finite photographic light footprint; original Snell ray endpoints unchanged; illustrative display radiance';return mesh;
}
export function updateRadianceSegmentV14(mesh:T.Mesh<T.BufferGeometry,T.ShaderMaterial>,portion:number,opacity:number,colour:T.Color,frame:number,phase=0):void{
 const unit=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
 const u=mesh.material.uniforms;u.uPortion.value=unit(portion);u.uOpacity.value=unit(opacity);
 (u.uColour.value as T.Color).copy(colour);u.uTime.value=Number.isFinite(frame)?Math.max(0,frame)/30:0;u.uPhase.value=Number.isFinite(phase)?phase:0;
 mesh.visible=u.uPortion.value>.00001&&u.uOpacity.value>.00001;
}
