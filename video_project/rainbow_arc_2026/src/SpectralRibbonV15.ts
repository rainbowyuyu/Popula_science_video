import * as T from 'three';
import {interpolateDisplayedSpectralPath} from './optics';

export type RibbonInputV15={points:T.Vector3[];color:string;role:'primary'|'secondary'};
type Field={mesh:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;segment:number;count:number;role:'primary'|'secondary';layer:number};
const unit=(x:number)=>Number.isFinite(x)?Math.max(0,Math.min(1,x)):0;

const VERTEX=/* glsl */`
attribute vec3 spectralColour;varying vec3 vColour;varying vec2 vUv;
void main(){vColour=spectralColour;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const FRAGMENT=/* glsl */`
uniform float uOpacity,uPortion,uColourLevel,uTime,uLayer,uExit;
varying vec3 vColour;varying vec2 vUv;
void main(){
 if(uPortion<=0.||vUv.x>uPortion)discard;
 float edge=smoothstep(0.,.065,vUv.y)*(1.-smoothstep(.935,1.,vUv.y));
 float end=smoothstep(0.,.007,vUv.x)*(1.-smoothstep(max(0.,uPortion-.012),uPortion,vUv.x));
 float crossVolume=pow(max(0.,sin(vUv.y*3.14159265)),.38);
 float depth=exp(-uLayer*uLayer*.42);
 float pulse=exp(-pow((fract(vUv.x*.46-uTime*.044)-.5)/.25,2.));
 // A silky bright cross section, quiet outer layers and a thin leading sheet.
 // It is an authored exposure/display envelope, not a simulated energy field.
 float leading=exp(-pow((vUv.x-uPortion+.014)/.018,2.));
 float alpha=uOpacity*edge*end*(.16+.48*crossVolume)*depth*(.986+.014*pulse);
 alpha+=uOpacity*edge*leading*end*.065*depth;
 if(alpha<.00002)discard;
 float luminance=dot(vColour,vec3(.2126,.7152,.0722));
 vec3 saturated=max(vec3(0.),mix(vec3(luminance),vColour,1.28));
 vec3 colour=mix(vec3(1.26,1.30,1.32),saturated*(1.22+.18*crossVolume+.16*leading),uColourLevel);
 gl_FragColor=vec4(colour,clamp(alpha,0.,1.));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

/** Every spectral row follows its independently computed Snell contacts. Soft
 * skins add depth only: they do not push colours sideways, merge their reflection
 * points, or remove the genuine crossing of the reflected rays. */
export class SpectralRibbonV15 {
 readonly group=new T.Group();private readonly fields:Field[]=[];private disposed=false;
 constructor(inputs:RibbonInputV15[]){
  this.group.name='v15-layered-continuous-optical-spectrum-volume';
  this.group.userData.provenance='V16 independently traced spectral rows with photographic depth skins; not physical irradiance';
  this.group.userData.maxArtisticEnvelope=.038;this.group.userData.contactOffsets=0;this.group.userData.transverseOpticalOffsets=0;
  for(const role of ['primary','secondary'] as const){
   const rows=inputs.filter(p=>p.role===role&&p.points.length>=3&&p.points.every(v=>v.toArray().every(Number.isFinite))).map(p=>({points:p.points.map(v=>v.clone()),colour:new T.Color(p.color)}));
   if(rows.length<2)continue;const count=Math.min(...rows.map(p=>p.points.length))-1;
   for(let segment=1;segment<count;segment++){
    const centerA=rows[Math.floor(rows.length/2)].points[segment],centerB=rows[Math.floor(rows.length/2)].points[segment+1];
    const direction=centerB.clone().sub(centerA);if(direction.lengthSq()<1e-12)continue;direction.normalize();
    const across=new T.Vector3(-direction.y,direction.x,0);if(across.lengthSq()<1e-8)across.crossVectors(direction,new T.Vector3(1,0,0));across.normalize();
    const normal=new T.Vector3().crossVectors(direction,across).normalize();
    // Exact spectral sheet plus soft depth skins; no in-plane spreading.
    for(const layer of [-2,-1,0,1,2]){
     const positions:number[]=[],colours:number[]=[],uv:number[]=[],indices:number[]=[];
     const spectra=(rows.length-1)*14,along=40;
     for(let i=0;i<=spectra;i++){
      const spectral=i/spectra,r=spectral*(rows.length-1),a=Math.min(rows.length-2,Math.floor(r)),q=r-a;
      const spectralPath=interpolateDisplayedSpectralPath(rows[a].points,rows[a+1].points,q),start=spectralPath[segment],finish=spectralPath[segment+1];
      const c=rows[a].colour.clone().lerp(rows[a+1].colour,q);
      for(let j=0;j<=along;j++){
       const progress=j/along,p=start.clone().lerp(finish,progress),window=Math.sin(Math.PI*progress);
       if(layer!==0)p.addScaledVector(normal,layer*.019*window);
       positions.push(p.x,p.y,p.z);colours.push(c.r,c.g,c.b);uv.push(progress,spectral);
       if(i<spectra&&j<along){const n=i*(along+1)+j;indices.push(n,n+1,n+along+1,n+1,n+along+2,n+along+1);}
      }
     }
     const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('spectralColour',new T.Float32BufferAttribute(colours,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeBoundingSphere();
     const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,toneMapped:false,blending:T.NormalBlending,
      uniforms:{uOpacity:{value:0},uPortion:{value:0},uColourLevel:{value:0},uTime:{value:0},uLayer:{value:Math.abs(layer)},uExit:{value:segment===count-1?1:0}},vertexShader:VERTEX,fragmentShader:FRAGMENT});
     const mesh=new T.Mesh(geometry,material);mesh.name=`v15-${role}-spectrum-${segment}-layer-${layer}`;mesh.frustumCulled=false;mesh.renderOrder=12+(2-Math.abs(layer));
     mesh.userData.exactCenterSheet=layer===0;mesh.userData.independentSnellRows=true;mesh.userData.transverseOpticalOffsets=0;mesh.userData.spectralSteps=spectra;mesh.userData.alongSteps=along;mesh.userData.cosmeticContactTaper=layer!==0;mesh.userData.segment=segment;mesh.userData.layer=layer;this.group.add(mesh);this.fields.push({mesh,segment,count,role,layer});
    }
   }
  }
 }
 update(frame:number,primaryReveal:number,primaryOpacity:number,secondaryReveal:number,secondaryOpacity:number,colourLevel:number):void{
  if(this.disposed)return;const colour=unit(colourLevel),time=Number.isFinite(frame)?Math.max(0,frame)/30:0;
  for(const f of this.fields){const opacity=unit(f.role==='primary'?primaryOpacity:secondaryOpacity),reveal=unit(f.role==='primary'?primaryReveal:secondaryReveal),portion=unit(reveal*f.count-f.segment),u=f.mesh.material.uniforms;
   u.uOpacity.value=opacity*(f.role==='primary'?colour:1)*(f.layer===0?.91:1);u.uPortion.value=portion;u.uTime.value=time;u.uColourLevel.value=f.role==='primary'?colour:1;
   f.mesh.visible=opacity>.0001&&portion>.0001&&(f.role==='secondary'||colour>.0001);}
  this.group.visible=this.fields.some(f=>f.mesh.visible);
 }
 dispose():void{if(this.disposed)return;this.disposed=true;this.fields.forEach(f=>{f.mesh.geometry.dispose();f.mesh.material.dispose();});this.fields.length=0;this.group.clear();}
}
