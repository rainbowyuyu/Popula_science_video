import * as T from 'three';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {MarchingCubes} from 'three/examples/jsm/objects/MarchingCubes.js';
/** A continuous tailored garment, independent of the anatomical skin topology.
 * Dimensions are metres. Smooth connected hip/leg volumes provide fabric ease;
 * low amplitude vertical drape is decorative, not a cloth-solver result. */
export function createV7Shorts():T.BufferGeometry{
 const n=72,mc=new MarchingCubes(n,new T.MeshStandardMaterial(),false,false,50000);mc.isolation=0;
 const smoothMin=(a:number,b:number,k:number)=>{const h=T.MathUtils.clamp(.5+.5*(b-a)/k,0,1);return b+(a-b)*h-k*h*(1-h)};
 for(let iz=0;iz<n;iz++)for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++){
  const x=(ix/n-.5)*.50,y=.52+iy/n*.51,z=(iz/n-.5)*.36;
  const hip=(Math.sqrt((x/.182)**2+((y-.915)/(y>.915?.27:.163))**2+((z+.015)/.132)**2)-1)*.132;
  let d=hip;
  for(const side of [-1,1]){
   const rx=.073+.017*T.MathUtils.clamp((y-.63)/.19,0,1),rz=.093+.034*T.MathUtils.clamp((y-.63)/.19,0,1);
   const ring=(Math.sqrt(((x-side*.089)/rx)**2+((z+.005)/rz)**2)-1)*rx;
   const leg=Math.max(ring,y-.913,.545-y);d=smoothMin(d,leg,.020);
  }
  d=Math.max(d,y-1.002,.63-y);
  mc.field[ix+n*(iy+n*iz)]=-d;
 }
 mc.update();const pos=mc.geometry.getAttribute('position'),count=mc.geometry.drawRange.count,values=new Float32Array(count*3);
 for(let i=0;i<count;i++){
  const x=pos.getX(i)*.25,y=.775+pos.getY(i)*.255,z=pos.getZ(i)*.18;
  const clothFold=.00045*Math.sin(y*40+x*13)*Math.sin(x*32+z*8);
  values[i*3]=x;values[i*3+1]=y;values[i*3+2]=z+clothFold;
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(values,3));const smooth=mergeVertices(g,1e-5);smooth.computeVertexNormals();smooth.computeBoundingSphere();g.dispose();mc.geometry.dispose();(mc.material as T.Material).dispose();return smooth;
}
