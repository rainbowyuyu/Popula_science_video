import * as THREE from 'three';

/** Procedural Gaussian-sprite illustration; not scanned Gaussian splats. */
export function createMolecularTunnel(): {
 group:THREE.Group; update(timeSec:number):void; dispose():void;
} {
 const count=1536,group=new THREE.Group();group.name='molecular-tunnel';
 const positions=new Float32Array(count*3),grid=new Float32Array(count*3);
 const colors=new Float32Array(count*3),sizes=new Float32Array(count),alphas=new Float32Array(count);
 const jitter=new Float32Array(count*3);
 let seed=0x57bc2391;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const palette=[new THREE.Color('#258c8c'),new THREE.Color('#275d68'),new THREE.Color('#c79b50')];
 for(let i=0;i<count;i++){
  const j=i*3,col=i%48,row=Math.floor(i/48),tileX=Math.floor(col/16),tileY=Math.floor(row/16);
  grid[j]=(tileX-1)*2.4+(col%16-7.5)*.115;
  grid[j+1]=(tileY-.5)*2.75+(row%16-7.5)*.115;
  grid[j+2]=((tileX+tileY)%2-.5)*.42;
  for(let k=0;k<3;k++)jitter[j+k]=(random()-.5)*2;
  const color=palette[(i%17<4)?2:(i%7<2?1:0)];color.toArray(colors,j);
  sizes[i]=i>=1280?.029+random()*.012:.040+random()*.025;
  alphas[i]=i>=1280?.38:.76+random()*.14;
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
 geometry.setAttribute('aColor',new THREE.BufferAttribute(colors,3));
 geometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
 geometry.setAttribute('aAlpha',new THREE.BufferAttribute(alphas,1));
 geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),6);
 const material=new THREE.ShaderMaterial({
  transparent:true,depthTest:true,depthWrite:false,blending:THREE.NormalBlending,
  uniforms:{uResolutionY:{value:1080}},
  vertexShader:`
   attribute vec3 aColor;
   attribute float aSize;
   attribute float aAlpha;
   uniform float uResolutionY;
   varying vec3 vColor;
   varying float vAlpha;
   void main(){
    vec4 viewPosition=modelViewMatrix*vec4(position,1.0);
    gl_Position=projectionMatrix*viewPosition;
    gl_PointSize=clamp(aSize*uResolutionY*.5*projectionMatrix[1][1]/max(.1,-viewPosition.z),2.4,10.0);
    vColor=aColor;vAlpha=aAlpha;
   }`,
  fragmentShader:`
   varying vec3 vColor;
   varying float vAlpha;
   void main(){
    vec2 p=gl_PointCoord*2.0-1.0;
    float r2=dot(p,p);
    if(r2>1.0)discard;
    float alpha=exp(-3.8*r2)*vAlpha;
    gl_FragColor=vec4(vColor,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,
 });
 const points=new THREE.Points(geometry,material);points.frustumCulled=false;group.add(points);
 const smooth=(x:number)=>{const p=Math.max(0,Math.min(1,x));return p*p*p*(p*(p*6-15)+10);};
 const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
 let disposed=false;
 function update(timeSec:number){
  if(disposed)return;
  const time=Number.isFinite(timeSec)?Math.max(0,Math.min(6,timeSec)):0;
  const drift=smooth(time/6)*6;
  const release=smooth((time-.2)/2.6),fold=smooth((time-2.9)/3.1);
  for(let i=0;i<count;i++){
   const j=i*3,u=(i+.5)/count,side=i%2?1:-1;
   const ribbonX=3.6*(u*2-1);
   const ribbonY=1.05*Math.sin(u*Math.PI*2+drift*.16)+side*.24+jitter[j+1]*.075;
   const ribbonZ=.95*Math.sin(u*Math.PI*2+side*.72+drift*.09)+jitter[j+2]*.11;
   let hx:number,hy:number,hz:number;
   if(i<512){
    const v=(i%256)/255,theta=v*Math.PI*4+(i<256?0:Math.PI)+drift*.065;
    hy=(v-.5)*5.3;hx=Math.cos(theta)*1.24+Math.sin(hy*.7)*.17;hz=Math.sin(theta)*1.24;
    hx+=jitter[j]*.027;hy+=jitter[j+1]*.026;hz+=jitter[j+2]*.027;
   }else if(i<1280){
    const k=i-512,rung=Math.floor(k/24),v=rung/31,r=(k%24)/23*2-1,theta=v*Math.PI*4+drift*.065;
    hy=(v-.5)*5.3;hx=Math.cos(theta)*1.24*r+Math.sin(hy*.7)*.17;hz=Math.sin(theta)*1.24*r;
    hy+=jitter[j+1]*.027;hz+=jitter[j+2]*.025;
   }else{
    const v=(i-1280)/255,theta=v*Math.PI*4+drift*.065;
    hy=(v-.5)*5.45;hx=Math.cos(theta)*(1.52+jitter[j]*.16);hz=Math.sin(theta)*(1.52+jitter[j+2]*.16);
   }
   positions[j]=mix(mix(grid[j],ribbonX,release),hx,fold);
   positions[j+1]=mix(mix(grid[j+1],ribbonY,release),hy,fold);
   positions[j+2]=mix(mix(grid[j+2],ribbonZ,release),hz,fold);
  }
  geometry.getAttribute('position').needsUpdate=true;
 }
 function dispose(){if(disposed)return;disposed=true;group.remove(points);geometry.dispose();material.dispose();}
 update(0);return{group,update,dispose};
}
