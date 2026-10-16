import * as T from 'three';

/** Frame-independent baked micro-surface maps. Standard PBR maps are supported
 * by the native WebGPU backend; onBeforeCompile GLSL hooks below are WebGL only. */
export function createMarineCoating(color:string,roughness=.38,metalness=.15){
 const size=128,n=new Uint8Array(size*size*4),r=new Uint8Array(size*size*4);
 const height=(x:number,y:number)=>{const a=x*Math.PI*2/size,b=y*Math.PI*2/size;return .40*Math.sin(a*10)*Math.cos(b*7)+.20*Math.sin(a*23+b*17)+.13*Math.cos(a*39-b*31);};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,dx=(height((x+1)%size,y)-height((x+size-1)%size,y))*.075,dy=(height(x,(y+1)%size)-height(x,(y+size-1)%size))*.075;
  const v=new T.Vector3(-dx,-dy,1).normalize();n[i]=Math.round((v.x*.5+.5)*255);n[i+1]=Math.round((v.y*.5+.5)*255);n[i+2]=Math.round((v.z*.5+.5)*255);n[i+3]=255;
  const value=Math.round(208+height(x,y)*24);r[i]=r[i+1]=r[i+2]=value;r[i+3]=255;
 }
 const tex=(bytes:Uint8Array)=>{const t=new T.DataTexture(bytes,size,size,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;t.generateMipmaps=true;t.anisotropy=8;t.repeat.set(9,5);t.needsUpdate=true;return t;};
 const material=new T.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:.18,clearcoatRoughness:.35,normalMap:tex(n),roughnessMap:tex(r),envMapIntensity:.72});material.normalScale.set(.16,.16);return material;
}

/** Small world-space PBR variations, evaluated from geometry rather than screen
 * pixels.  There is no wall-clock animation and no texture swimming on seeks. */
export function addSurfaceGrain(material:T.MeshStandardMaterial,options:{scale:number;amount:number;roughness:number;tint?:string}){
 const tint=new T.Color(options.tint??'#ffffff');
 material.onBeforeCompile=shader=>{
  shader.uniforms.uSurfaceGrain={value:new T.Vector3(options.scale,options.amount,options.roughness)};
  shader.uniforms.uSurfaceTint={value:tint};
  shader.vertexShader='varying vec3 vSurfacePosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvSurfacePosition=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader='varying vec3 vSurfacePosition;uniform vec3 uSurfaceGrain,uSurfaceTint;\nfloat surfaceHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\nfloat surfaceNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(surfaceHash(i),surfaceHash(i+vec3(1.,0.,0.)),f.x),mix(surfaceHash(i+vec3(0.,1.,0.)),surfaceHash(i+vec3(1.,1.,0.)),f.x),f.y),mix(mix(surfaceHash(i+vec3(0.,0.,1.)),surfaceHash(i+vec3(1.,0.,1.)),f.x),mix(surfaceHash(i+vec3(0.,1.,1.)),surfaceHash(i+vec3(1.,1.,1.)),f.x),f.y),f.z);}\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec3 grainP=vSurfacePosition*uSurfaceGrain.x;
    float grain=surfaceNoise(grainP)*.7+surfaceNoise(grainP*.23+vec3(14.1,3.2,5.))* .3;
    float grainStrength=uSurfaceGrain.y*(1.-smoothstep(.6,2.8,max(length(dFdx(grainP)),length(dFdy(grainP)))));
    diffuseColor.rgb*=mix(vec3(1.),uSurfaceTint*(.78+.44*grain),grainStrength);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(grain-.5)*uSurfaceGrain.z,0.08,1.);');
 };
 material.customProgramCacheKey=()=>`marine-grain-v5-${options.scale}-${options.amount}-${options.roughness}-${options.tint??'white'}`;
 material.needsUpdate=true;
 return material;
}

/** Geometry leaf, not a billboard: pointed oval with a shallow centre fold. */
export function createLeafGeometry(){
 const g=new T.BufferGeometry();
 const verts=[0,0,.035, -.46,.34,0, 0,1,0, .46,.34,0, 0,.43,.12];
 g.setAttribute('position',new T.Float32BufferAttribute(verts,3));
 g.setIndex([0,1,4,1,2,4,2,3,4,3,0,4]);g.computeVertexNormals();
 g.setAttribute('uv',new T.Float32BufferAttribute([.5,0,0,.34,.5,1,1,.34,.5,.43],2));
 return g;
}
