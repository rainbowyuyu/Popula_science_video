import * as T from 'three';
/** A deterministic artistic water material, authored for this project. Not WaterPro source. */
export function makeDroplet(radius=1){
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0},uColor:{value:new T.Color('#6eccc7')}},vertexShader:`
 uniform float uTime; varying vec3 vN; varying vec3 vP; varying vec3 vWorld;
 void main(){vec3 p=position; float w=.017*sin(p.y*8.+uTime*1.7)*cos(p.x*7.-uTime*.8); p+=normal*w; vN=normalize(normalMatrix*normal);vP=(modelViewMatrix*vec4(p,1.)).xyz;vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*vec4(vP,1.);}`,
 fragmentShader:`uniform float uTime;uniform vec3 uColor;varying vec3 vN;varying vec3 vP;varying vec3 vWorld;
 void main(){vec3 N=normalize(vN);vec3 V=normalize(-vP);float rim=pow(1.-abs(dot(N,V)),2.5);float spec=pow(max(dot(reflect(normalize(vec3(-.6,-1.,-.7)),N),V),0.),90.);float band=pow(max(0.,sin(dot(N,normalize(vec3(.8,1.,.7)))*3.)),16.);vec3 col=mix(uColor,vec3(.94,1.,.98),rim*.66+spec*.8);col+=band*.13;gl_FragColor=vec4(col,.14+rim*.65+spec*.5);}`});
 const mesh=new T.Mesh(new T.SphereGeometry(radius,64,40),material);mesh.scale.y=1.08;return mesh;
}
export function gaussianCloud(count=1400){
 const geo=new T.BufferGeometry();const positions=new Float32Array(count*3),colors=new Float32Array(count*3);let seed=8173;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<count;i++){const a=rand()*Math.PI*2,r=Math.sqrt(rand())*2.2;positions.set([Math.cos(a)*r,(rand()-.5)*3.2,Math.sin(a)*r],i*3);const c=new T.Color(i%4===0?'#d4a45f':i%3===0?'#b4dcd4':'#4ba7a5');colors.set([c.r,c.g,c.b],i*3);}
 geo.setAttribute('position',new T.BufferAttribute(positions,3));geo.setAttribute('color',new T.BufferAttribute(colors,3));
 const m=new T.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,uniforms:{uTime:{value:0},uMorph:{value:0},uAlpha:{value:.7}},vertexShader:`uniform float uTime;uniform float uMorph;varying vec3 vCol;void main(){vCol=color;vec3 p=position;float a=p.y*2.4+uTime*.12;vec3 helix=vec3(cos(a)*1.1,p.y,sin(a)*1.1);p=mix(p,helix,uMorph);p.x+=.04*sin(uTime+p.y);vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(48./-mv.z,1.,14.);gl_Position=projectionMatrix*mv;}`,fragmentShader:`uniform float uAlpha;varying vec3 vCol;void main(){vec2 d=gl_PointCoord-.5;float a=exp(-dot(d,d)*18.)*uAlpha;gl_FragColor=vec4(vCol,a);}`});return new T.Points(geo,m);
}
