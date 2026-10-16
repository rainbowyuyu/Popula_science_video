import * as T from 'three';

export type RibbonInputV08={points:T.Vector3[];color:string;role:'primary'|'secondary'};
type Field={mesh:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;segment:number;segmentCount:number;role:'primary'|'secondary'};
const unit=(n:number)=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
const VERTEX=/* glsl */`
attribute vec3 spectralColour;
varying vec2 vUv;
varying vec3 vColour;
void main(){vUv=uv;vColour=spectralColour;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;
const FRAGMENT=/* glsl */`
uniform float uOpacity;
uniform float uPortion;
uniform float uColourLevel;
uniform float uTime;
uniform float uSeed;
uniform float uExit;
varying vec2 vUv;
varying vec3 vColour;
void main(){
  if(uPortion<=0.||vUv.x>uPortion)discard;
  float spectralEdge=smoothstep(0.,.065,vUv.y)*(1.-smoothstep(.935,1.,vUv.y));
  float ends=smoothstep(0.,.013,vUv.x)*(1.-smoothstep(max(0.,uPortion-.012),uPortion,vUv.x));
  float wave=fract(vUv.x*.65-uTime*.16+uSeed);
  float pulse=exp(-pow((wave-.5)/.105,2.));
  float middle=.66+.34*exp(-pow((vUv.y-.5)/.36,2.));
  float alpha=uOpacity*spectralEdge*ends*middle*(.79+.21*pulse)*mix(.095,.185,uExit);
  vec3 colour=mix(vec3(.96,.95,.90),vColour,uColourLevel);
  gl_FragColor=vec4(colour,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** A visual continuous spectrum between the supplied discrete, verified rays.
 * Every surface point is on the linear interpolation of real segment endpoints.
 * The faint sheet is explanatory colour, not a simulated intensity measurement.
 */
export class SpectralRibbonV08{
  readonly group=new T.Group();
  private fields:Field[]=[];
  private disposed=false;
  constructor(inputs:RibbonInputV08[]){
    this.group.name='v08-continuous-spectrum-on-verified-Snell-segments';
    this.group.userData.provenance='Locally authored by Codex; no incomplete Opus code integrated';
    for(const role of ['primary','secondary'] as const){
      const rows=inputs.filter(p=>p.role===role&&p.points.length>=3&&p.points.every(v=>v.toArray().every(Number.isFinite))).map(p=>({points:p.points.map(v=>v.clone()),colour:new T.Color(p.color)}));
      if(rows.length<2)continue;
      const count=Math.min(...rows.map(p=>p.points.length))-1;
      // The shared white incoming ray is already rendered once by OpticalEnergyV07.
      for(let segment=1;segment<count;segment++){
        const positions:number[]=[],colours:number[]=[],uv:number[]=[],indices:number[]=[];
        const spectralSteps=(rows.length-1)*8,alongSteps=16;
        for(let i=0;i<=spectralSteps;i++){
          const spectral=i/spectralSteps,inter=spectral*(rows.length-1),a=Math.min(rows.length-2,Math.floor(inter)),portion=inter-a;
          const start=rows[a].points[segment].clone().lerp(rows[a+1].points[segment],portion),end=rows[a].points[segment+1].clone().lerp(rows[a+1].points[segment+1],portion);
          const colour=rows[a].colour.clone().lerp(rows[a+1].colour,portion);
          for(let j=0;j<=alongSteps;j++){
            const p=start.clone().lerp(end,j/alongSteps);positions.push(p.x,p.y,p.z);colours.push(colour.r,colour.g,colour.b);uv.push(j/alongSteps,spectral);
            if(i<spectralSteps&&j<alongSteps){const n=i*(alongSteps+1)+j;indices.push(n,n+1,n+alongSteps+1,n+1,n+alongSteps+2,n+alongSteps+1);}
          }
        }
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('spectralColour',new T.Float32BufferAttribute(colours,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeBoundingSphere();
        const m=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,toneMapped:false,blending:T.NormalBlending,uniforms:{uOpacity:{value:0},uPortion:{value:0},uColourLevel:{value:0},uTime:{value:0},uSeed:{value:segment*.117+(role==='secondary'?.24:0)},uExit:{value:segment===count-1?1:0}},vertexShader:VERTEX,fragmentShader:FRAGMENT});
        const mesh=new T.Mesh(g,m);mesh.name=`continuous-${role}-spectrum-segment-${segment}`;mesh.renderOrder=11;mesh.frustumCulled=false;this.group.add(mesh);this.fields.push({mesh,segment,segmentCount:count,role});
      }
    }
  }
  update(frame:number,primaryReveal:number,primaryOpacity:number,secondaryReveal:number,secondaryOpacity:number,colourLevel:number):void{
    if(this.disposed)return;
    const colour=unit(colourLevel),time=Number.isFinite(frame)?Math.max(0,frame)/30:0;
    for(const f of this.fields){
      const opacity=unit(f.role==='primary'?primaryOpacity:secondaryOpacity),reveal=unit(f.role==='primary'?primaryReveal:secondaryReveal);
      const portion=unit(reveal*f.segmentCount-f.segment),u=f.mesh.material.uniforms;
      u.uOpacity.value=opacity*(f.role==='secondary'?1:colour);u.uPortion.value=portion;u.uTime.value=time;u.uColourLevel.value=f.role==='secondary'?1:colour;
      f.mesh.visible=opacity>.0001&&portion>.0001&&(f.role==='secondary'||colour>.0001);
    }
    this.group.visible=this.fields.some(f=>f.mesh.visible);
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    for(const f of this.fields){f.mesh.geometry.dispose();f.mesh.material.dispose();}this.fields=[];this.group.clear();
  }
}
