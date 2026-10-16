import * as T from 'three';
import {MarchingCubes} from 'three/examples/jsm/objects/MarchingCubes.js';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
/** Closed, dorsal-up precision grip, in metres and at the atlas wrist scale.
 * Palm and phalanges are one smooth surface, not disconnected toy digits. */
export function createV7GripHand(material:T.Material):T.Mesh{
 const n=48,mc=new MarchingCubes(n,material,false,false,40000);mc.isolation=0;
 const segments:{a:T.Vector3;b:T.Vector3;r:number;endR:number}[]=[];
 const add=(a:number[],b:number[],r:number,endR=r)=>segments.push({a:new T.Vector3(...a),b:new T.Vector3(...b),r,endR});
 for(const [x,len,r] of [[-.025,1,.009],[-.008,1.06,.0095],[.011,.98,.009],[.028,.80,.008]]){
  const base=[x,.073,0],p1=[x,.073+.026*len,-.016],p2=[x,.074+.014*len,-.039],tip=[x,.056,-.037];
  add(base,p1,r);add(p1,p2,r*.94);add(p2,tip,r*.84);
 }
 add([-.030,.031,-.006],[-.046,.051,-.018],.011);add([-.046,.051,-.018],[-.024,.070,-.034],.010);add([-.024,.070,-.034],[-.002,.069,-.031],.0085);
 add([0,-.025,0],[0,.024,0],.0145,.018);
 const smoothMin=(a:number,b:number,k:number)=>{const h=T.MathUtils.clamp(.5+.5*(b-a)/k,0,1);return b+(a-b)*h-k*h*(1-h)};
 for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const p=new T.Vector3((x/n-.5)*.14,-.060+y/n*.195,-.062+z/n*.102);
  let d=(Math.sqrt((p.x/.035)**2+((p.y-.041)/.043)**2+(p.z/.017)**2)-1)*.017;
  for(const s of segments){const ab=s.b.clone().sub(s.a),t=T.MathUtils.clamp(p.clone().sub(s.a).dot(ab)/ab.lengthSq(),0,1);const q=s.a.clone().addScaledVector(ab,t);d=smoothMin(d,p.distanceTo(q)-T.MathUtils.lerp(s.r,s.endR,t),.0045)}
  mc.field[x+n*(y+n*z)]=-d;
 }
 mc.update();const raw=mc.geometry.getAttribute('position'),count=mc.geometry.drawRange.count,values=new Float32Array(count*3);
 for(let i=0;i<count;i++){values[i*3]=raw.getX(i)*.07;values[i*3+1]=.0375+raw.getY(i)*.0975;values[i*3+2]=-.011+raw.getZ(i)*.051}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(values,3));const smooth=mergeVertices(g,1e-5);smooth.computeVertexNormals();g.dispose();mc.geometry.dispose();
 const hand=new T.Mesh(smooth,material);hand.name='V7 connected palm and articulated precision grip';hand.castShadow=true;hand.receiveShadow=true;return hand;
}
