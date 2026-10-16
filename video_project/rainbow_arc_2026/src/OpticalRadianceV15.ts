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
 float r=abs((vUv.y-.5)*2.);
 // Resolved sharp photographic core above a smooth finite air-light envelope.
 // Both terminate at the supplied exact endpoint, never at a free flare point.
 float core=exp(-pow(r/.095,2.));
 float inner=exp(-pow(r/.245,2.));
 float outer=exp(-pow(r/.59,2.))*(1.-smoothstep(.83,1.,r));
 float start=smoothstep(0.,.0035,vUv.x);
 float end=1.-smoothstep(max(0.,uPortion-.010),uPortion,vUv.x);
 float pulse=exp(-pow((fract(vUv.x*.52-uTime*.075+uPhase)-.5)/.28,2.));
 float alpha=uOpacity*(core*.84+inner*.19+outer*.058)*start*end*(.986+.014*pulse);
 if(alpha<.000015)discard;
 float chroma=max(uColour.r,max(uColour.g,uColour.b))-min(uColour.r,min(uColour.g,uColour.b));
 float white=1.-smoothstep(.07,.22,chroma);
 vec3 radiance=uColour*(1.13+.27*core);
 radiance=mix(radiance,vec3(2.7,2.78,2.85),white*core*.63);
 gl_FragColor=vec4(radiance,clamp(alpha,0.,1.));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Finite display radiance centered on unchanged geometric light vertices. */
export function createRadianceSegmentV15(a:T.Vector3,b:T.Vector3,width=.052):T.Mesh<T.BufferGeometry,T.ShaderMaterial>{
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(12),3));
 geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));geometry.setIndex([0,1,2,2,1,3]);
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,blending:T.NormalBlending,toneMapped:false,
 vertexShader:VERTEX,fragmentShader:FRAGMENT,uniforms:{uA:{value:a.clone()},uB:{value:b.clone()},uWidth:{value:Number.isFinite(width)?Math.max(.003,Math.min(.19,width)):.052},uColour:{value:new T.Color('#f8fbff')},uPortion:{value:0},uOpacity:{value:0},uTime:{value:0},uPhase:{value:0}}});
 const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=15;mesh.visible=false;
 mesh.name='v15-photographic-white-core-and-soft-air-radiance';
 mesh.userData.provenance='Codex authored photographic display energy, not measured irradiance; exact supplied light centers and endpoints unchanged';return mesh;
}
export function updateRadianceSegmentV15(mesh:T.Mesh<T.BufferGeometry,T.ShaderMaterial>,portion:number,opacity:number,colour:T.Color,frame:number,phase=0):void{
 const unit=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;
 const u=mesh.material.uniforms;u.uPortion.value=unit(portion);u.uOpacity.value=unit(opacity);
 (u.uColour.value as T.Color).copy(colour);u.uTime.value=Number.isFinite(frame)?Math.max(0,frame)/30:0;u.uPhase.value=Number.isFinite(phase)?phase:0;
 mesh.visible=u.uPortion.value>.00001&&u.uOpacity.value>.00001;
}
