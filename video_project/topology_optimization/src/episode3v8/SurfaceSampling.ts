import * as T from 'three';

/** Add display samples on the exact existing triangle planes. The boundary,
 * notches, UVs and assembly envelope stay unchanged. A long exported quad
 * otherwise interpolates endpoint colors across several native beam elements,
 * erasing interior bending sign changes. This is sampling, not a new FE mesh.
 */
export function refineStressSurface(source:T.BufferGeometry,maxEdge=.07){
 const attributes=Object.entries(source.attributes),offsets:number[]=[];
 let stride=0;for(const [,attribute] of attributes){offsets.push(stride);stride+=attribute.itemSize;}
 const positionOffset=offsets[attributes.findIndex(([name])=>name==='position')];
 const index=source.getIndex(),count=index?.count??source.getAttribute('position').count;
 const values=attributes.map(()=>[] as number[]);
 const read=(i:number)=>attributes.flatMap(([,attribute])=>Array.from({length:attribute.itemSize},(_,k)=>attribute.getComponent(i,k)));
 const lengthSq=(a:number[],b:number[])=>{let n=0;for(let k=0;k<3;k++)n+=(a[positionOffset+k]-b[positionOffset+k])**2;return n;};
 const write=(v:number[])=>attributes.forEach(([,attribute],i)=>{for(let k=0;k<attribute.itemSize;k++)values[i].push(v[offsets[i]+k]);});
 const split=(a:number[],b:number[],c:number[],depth=0)=>{
  const lengths=[lengthSq(a,b),lengthSq(b,c),lengthSq(c,a)],longest=Math.max(...lengths);
  if(longest<=maxEdge*maxEdge||depth>=16){write(a);write(b);write(c);return;}
  const edge=lengths.indexOf(longest),vertices=[a,b,c],u=vertices[edge],v=vertices[(edge+1)%3],opposite=vertices[(edge+2)%3],mid=u.map((n,k)=>(n+v[k])*.5);
  split(u,mid,opposite,depth+1);split(mid,v,opposite,depth+1);
 };
 for(let i=0;i<count;i+=3)split(read(index?index.getX(i):i),read(index?index.getX(i+1):i+1),read(index?index.getX(i+2):i+2));
 const result=new T.BufferGeometry();attributes.forEach(([name,attribute],i)=>result.setAttribute(name,new T.Float32BufferAttribute(values[i],attribute.itemSize,attribute.normalized)));
 result.computeBoundingBox();result.computeBoundingSphere();return result;
}
