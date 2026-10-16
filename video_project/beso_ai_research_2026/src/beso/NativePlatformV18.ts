// @ts-nocheck
import * as T from 'three/webgpu';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const source=(p:number[])=>V(p[0],p[2],-p[1]);

// A continuous rounded steel link. The long axis is local Y; wire diameter
// stays circular (scaling a torus would distort its steel cross-section).
class LinkCentreline extends T.Curve<T.Vector3>{
 getPoint(t:number,target=new T.Vector3()){
  const radius=.42,straight=.72,arc=Math.PI*radius,perimeter=2*arc+2*straight;
  let s=t*perimeter;
  if(s<arc){const a=s/radius;return target.set(radius*Math.cos(a),straight/2+radius*Math.sin(a),0);}
  s-=arc;if(s<straight)return target.set(-radius,straight/2-s,0);
  s-=straight;if(s<arc){const a=Math.PI+s/radius;return target.set(radius*Math.cos(a),-straight/2+radius*Math.sin(a),0);}
  s-=arc;return target.set(radius,-straight/2+s,0);
 }
}

export class NativePlatformV18{
 readonly group=new T.Group();readonly platform=new T.Group();readonly upper=new T.Group();
 readonly structuralGroups={moorings:new T.Group()};
 readonly calloutAnchors:Record<string,{object:T.Object3D;label:string}>={};
 readonly lines:{line:number;mesh:T.InstancedMesh;meshes:T.InstancedMesh[];curve:T.CatmullRomCurve3;fairlead:T.Vector3;linkCount:number;lengthM:number;pitchM:number}[]=[];
 ready:Promise<void>;info={time:0,surge:0,pitch:0,tension:0};private rows:any[]=[];layout:any;
 constructor(base:string,response:any){this.rows=response.records;this.group.name='v18 three-column visual revision; archived response independent';this.group.add(this.platform,this.upper,this.structuralGroups.moorings);this.ready=this.load(base);}
 private anchor(id:string,p:T.Vector3,label=id){const object=new T.Object3D();object.position.copy(p);this.group.add(object);this.calloutAnchors[id]={object,label};}
 private async load(base:string){
  const [hull,machine,layout]=await Promise.all([new GLTFLoader().loadAsync(base+'assets/v18/reference-platform.glb'),new GLTFLoader().loadAsync(base+'assets/v18/turbine-upper.glb'),fetch(base+'assets/v18/visual-layout.json').then(r=>r.json())]);
  this.layout=layout;this.platform.add(hull.scene);this.upper.add(machine.scene);
  this.group.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
  const names:string[]=[];this.platform.traverse(o=>names.push(o.name));
  if(names.some(n=>/CentralKeel|CentralFoot/.test(n)))throw Error('v18 contains a forbidden fourth central support');
  if(names.filter(n=>/^OuterColumn_\d+$/.test(n)).length!==3)throw Error('v18 requires exactly three outer columns');
  this.anchor('platform-center',V(0,18,0));this.anchor('tower-base',V(0,28,0));this.anchor('tower-top',V(0,164.7,0));this.anchor('hub',V(0,24,0));
  const detailedLink=new T.TubeGeometry(new LinkCentreline(),40,.14,8,true);
  const distantLink=new T.TubeGeometry(new LinkCentreline(),20,.14,6,true);
  const dummy=new T.Object3D(),localLongAxis=V(0,1,0);
  for(const m of layout.moorings){
   const curve=new T.CatmullRomCurve3(m.visualPolylineXYZ.map(source));curve.arcLengthDivisions=4096;curve.updateArcLengths();
   const lengthM=curve.getLength();
   // Equal arc-length centres with a 1.00 m link pitch keep adjacent rings
   // interlocked. Geometry remains chain even hundreds of metres underwater.
   const pitchTarget=1.00,firstCentreM=.62,linkCount=Math.ceil((lengthM-firstCentreM)/pitchTarget)+1,pitchM=(lengthM-firstCentreM)/(linkCount-1);
   const nearCount=Math.min(linkCount,Math.ceil(90/pitchM)),counts=[nearCount,linkCount-nearCount];
   const material=new T.MeshStandardMaterial({color:'#9aa7a5',roughness:.32,metalness:.86});
   const meshes=counts.map((count,part)=>{const mesh=new T.InstancedMesh(part===0?detailedLink:distantLink,material,count);mesh.name=`FullAnchorChain_${m.line}_${part===0?'near':'subsea'}`;mesh.castShadow=part===0;mesh.receiveShadow=true;mesh.userData={line:m.line,completeAnchorChain:true,source:'visual layout only',firstLink:part===0?0:nearCount,linkCount:count};this.structuralGroups.moorings.add(mesh);return mesh;});
   for(let i=0;i<linkCount;i++){
    const distanceFromFairlead=firstCentreM+i*pitchM,u=1-distanceFromFairlead/lengthM;
    const p=curve.getPointAt(Math.max(0,u)),tangent=curve.getTangentAt(Math.max(0,u));
    dummy.position.copy(p);dummy.quaternion.setFromUnitVectors(localLongAxis,tangent);dummy.rotateY(i%2*Math.PI/2);dummy.scale.set(1,1,1);dummy.updateMatrix();
    const part=i<nearCount?0:1;meshes[part].setMatrixAt(i-(part?nearCount:0),dummy.matrix);
   }
   for(const mesh of meshes){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();}
   const fairlead=source(m.fairleadXYZ);this.anchor('fairlead-'+m.line,fairlead);this.anchor('anchor-'+m.line,source(m.anchorXYZ));
   this.lines.push({line:m.line,mesh:meshes[0],meshes,curve,fairlead,linkCount,lengthM,pitchM});
  }
  this.group.userData.chainQA={lineCount:this.lines.length,linkCount:this.lines.reduce((n,l)=>n+l.linkCount,0),allLinksAreMeshes:true,tubeCableSegments:0,detailBoundaryM:90,LOD:'fixed link tessellation, no temporal visibility switch',lines:this.lines.map(l=>({line:l.line,lengthM:l.lengthM,linkCount:l.linkCount,pitchM:l.pitchM,nearCount:l.meshes[0].count,subseaCount:l.meshes[1].count,fairleadEndpointErrorM:l.curve.getPointAt(1).distanceTo(l.fairlead),anchorEndpointErrorM:l.curve.getPointAt(0).distanceTo(source(layout.moorings.find(m=>m.line===l.line).anchorXYZ))}))};
 }
 sample(t:number){const a=this.rows[Math.max(0,this.rows.findLastIndex(r=>r.t<=t))],b=this.rows[Math.min(this.rows.length-1,this.rows.findIndex(r=>r.t>a.t))]??a;const q=Math.max(0,Math.min(1,(t-a.t)/Math.max(.0001,b.t-a.t)));const mix=(aa:number[],bb:number[])=>aa.map((v,i)=>v+(bb[i]-v)*q);return {t,platform:mix(a.platform,b.platform),mooringTensionN:mix(a.mooringTensionN,b.mooringTensionN)};}
 setTime(t:number){const r=this.sample(t);this.info={time:t,surge:r.platform[0],pitch:r.platform[4]*180/Math.PI,tension:Math.max(...r.mooringTensionN)};/* revised display model is not displaced using an unrelated archived solve */}
 getMooringTension(n:number){return this.sample(this.info.time).mooringTensionN[n-1];}
 getCalloutAnchors(){return this.calloutAnchors;}
 getTowerCenter(q:number){return V(0,28+136.7*q,0).applyMatrix4(this.group.matrixWorld);}
 clonePlatform(){return this.platform.clone(true);}
 setMooringFocus(amount:number){for(const l of this.lines){const m=l.mesh.material as T.MeshStandardMaterial;m.color.set(l.line===1?'#b39b72':'#9aa7a5');m.emissive.set(l.line===1?'#3b2508':'#000000');m.emissiveIntensity=amount*.15;}}
 dispose(){const gs=new Set<any>(),ms=new Set<any>();this.group.traverse(o=>{if(o instanceof T.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
}
