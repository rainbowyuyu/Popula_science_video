import * as T from 'three';

const fract=(x:number)=>x-Math.floor(x);
const hash=(i:number)=>{let x=Math.imul(i+9,0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return ((x^(x>>>16))>>>0)/4294967296;};
/** Frame-driven ballistic fountain illustration; not a CFD measurement. */
export class FountainDetailV08{
  readonly group=new T.Group();
  private readonly spray:T.Points<T.BufferGeometry,T.ShaderMaterial>;
  private readonly tubes:{mesh:T.Mesh<T.BufferGeometry,T.MeshPhysicalMaterial>;phase:number}[]=[];
  constructor(){
    this.group.name='v08-fine-ballistic-jets-and-spray';
    const count=3600,seeds=new Float32Array(count*4);
    for(let i=0;i<count;i++){seeds[i*4]=hash(i*4);seeds[i*4+1]=hash(i*4+1);seeds[i*4+2]=hash(i*4+2);seeds[i*4+3]=hash(i*4+3);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(count*3),3));g.setAttribute('aSeed',new T.Float32BufferAttribute(seeds,4));
    this.spray=new T.Points(g,new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.NormalBlending,
      uniforms:{uTime:{value:0},uOpacity:{value:0},uRainbow:{value:0}},
      vertexShader:`attribute vec4 aSeed;uniform float uTime;uniform float uOpacity;uniform float uRainbow;varying float vAlpha;varying vec3 vColour;
        void main(){float life=fract(aSeed.x+uTime*(.47+.16*aSeed.y));float t=life*1.18;
          float azimuth=aSeed.z*6.2831853;float speed=.34+aSeed.w*.69;
          vec3 p=vec3(-3.,.86,3.)+vec3(cos(azimuth)*speed*t,(5.15+.75*aSeed.y)*t-4.905*t*t,sin(azimuth)*speed*t-.16*t*t);
          vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;
          float radius=.004+aSeed.w*.008;gl_PointSize=clamp(radius*1080./max(.1,-view.z),.65,5.5);
          float born=smoothstep(0.,.065,life);float death=1.-smoothstep(.81,1.,life);
          vAlpha=uOpacity*born*death*(p.y>0.?1.:0.)*(.24+.53*aSeed.w);
          vec3 eye=vec3(-2.1,1.55,5.);vec3 axis=normalize(vec3(.24,-.17,-.955));
          float theta=degrees(acos(clamp(dot(normalize(p-eye),axis),-1.,1.)));
          float selected=smoothstep(40.45,40.85,theta)*(1.-smoothstep(42.2,42.65,theta))*uRainbow;
          vec3 hue=.5+.5*cos(6.2831853*(clamp((42.43-theta)/1.73,0.,1.)+vec3(0.,.67,.33)));
          vColour=mix(vec3(.84,.95,1.),hue,selected*.72);
        }`,
      fragmentShader:`varying float vAlpha;varying vec3 vColour;void main(){vec2 p=gl_PointCoord-.5;float r=length(p);if(r>.5)discard;
        float soft=exp(-r*r*21.);float glint=exp(-dot(p+vec2(.13,-.15),p+vec2(.13,-.15))*160.);
        gl_FragColor=vec4(vColour+glint*.11,vAlpha*soft);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));this.spray.frustumCulled=false;this.group.add(this.spray);
    for(let k=0;k<9;k++){
      const phase=k*2*Math.PI/8;const vertical=k===8;const points=[];
      for(let i=0;i<=90;i++){const t=i/90*(vertical?1.09:.98);points.push(new T.Vector3(-3+Math.cos(phase)*(vertical?.02:.88)*t,.87+(vertical?5.7:4.8)*t-4.905*t*t,3+Math.sin(phase)*(vertical?.02:.88)*t));}
      const geometry=new T.TubeGeometry(new T.CatmullRomCurve3(points),90,vertical?.016:.0105,8,false);
      const material=new T.MeshPhysicalMaterial({color:'#d5e8eb',roughness:.15,metalness:0,transmission:.66,ior:1.333,thickness:.03,transparent:true,opacity:.32,depthWrite:false,envMapIntensity:.52});
      const mesh=new T.Mesh(geometry,material);mesh.name=`thin-continuous-water-jet-${k}`;this.tubes.push({mesh,phase});this.group.add(mesh);
    }
  }
  update(frame:number,opacity:number,rainbow:number){
    this.group.visible=opacity>.001;const t=frame/30;
    this.spray.material.uniforms.uTime.value=t;this.spray.material.uniforms.uOpacity.value=opacity;this.spray.material.uniforms.uRainbow.value=rainbow;
    for(const {mesh,phase} of this.tubes){mesh.material.opacity=opacity*(.33+.018*Math.sin(t*1.2+phase));}
  }
  dispose(){this.spray.geometry.dispose();this.spray.material.dispose();this.tubes.forEach(t=>{t.mesh.geometry.dispose();t.mesh.material.dispose();});}
}
