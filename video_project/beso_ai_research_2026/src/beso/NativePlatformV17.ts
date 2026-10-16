// @ts-nocheck
import * as T from 'three/webgpu';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);const source=(p:number[])=>V(p[0],p[2],-p[1]);
export class NativePlatformV17{
 readonly group=new T.Group();readonly platform=new T.Group();readonly upper=new T.Group();readonly structuralGroups={moorings:new T.Group()};readonly calloutAnchors:Record<string,{object:T.Object3D;label:string}>={};readonly lines:{line:number;mesh:T.Mesh;curve:T.CatmullRomCurve3;fairlead:T.Vector3}[]=[];
 ready:Promise<void>;info={time:0,surge:0,pitch:0,tension:0};private rows:any[]=[];layout:any;
 constructor(base:string,response:any){this.rows=response.records;this.group.name='v17 reference visual revision; archived response independent';this.group.add(this.platform,this.upper,this.structuralGroups.moorings);this.ready=this.load(base);}
 private anchor(id:string,p:T.Vector3,label=id){const object=new T.Object3D();object.position.copy(p);this.group.add(object);this.calloutAnchors[id]={object,label};}
 private async load(base:string){
 const [hull,machine,layout]=await Promise.all([new GLTFLoader().loadAsync(base+'assets/v17/reference-platform.glb'),new GLTFLoader().loadAsync(base+'assets/v17/turbine-upper.glb'),fetch(base+'assets/v17/visual-layout.json').then(r=>r.json())]);this.layout=layout;this.platform.add(hull.scene);this.upper.add(machine.scene);
 this.group.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
 this.anchor('platform-center',V(0,18,0));this.anchor('tower-base',V(0,28,0));this.anchor('tower-top',V(0,164.7,0));this.anchor('hub',V(0,24,0));
 const chainGeo=new T.TorusGeometry(.54,.145,8,24),chainMat=new T.MeshStandardMaterial({color:'#697877',roughness:.29,metalness:.85});
 for(const m of layout.moorings){const points=m.visualPolylineXYZ.map(source),curve=new T.CatmullRomCurve3(points);const mesh=new T.Mesh(new T.TubeGeometry(curve,140,.16,8,false),new T.MeshStandardMaterial({color:'#36575f',metalness:.6,roughness:.35}));mesh.name='Visual mooring '+m.line;mesh.userData={line:m.line,layoutRevision:true,notArchivedSolverPath:true};mesh.castShadow=true;this.structuralGroups.moorings.add(mesh);
 const fairlead=source(m.fairleadXYZ);this.anchor('fairlead-'+m.line,fairlead);this.anchor('anchor-'+m.line,source(m.anchorXYZ));this.lines.push({line:m.line,mesh,curve,fairlead});
 // Closely interlinked steel chain at the actual welded eye; cable continues seaward.
 for(let i=0;i<18;i++){const u=1-i*.00155,p=curve.getPoint(u),t=curve.getTangent(u);const chain=new T.Mesh(chainGeo,chainMat);chain.position.copy(p);chain.quaternion.setFromUnitVectors(V(0,1,0),t);chain.rotateY(i%2*Math.PI/2);chain.scale.y=1.48;chain.castShadow=true;chain.name=`Chain ${m.line}:${i}`;this.structuralGroups.moorings.add(chain);}
 }
 }
 sample(t:number){const a=this.rows[Math.max(0,this.rows.findLastIndex(r=>r.t<=t))],b=this.rows[Math.min(this.rows.length-1,this.rows.findIndex(r=>r.t>a.t))]??a;const q=Math.max(0,Math.min(1,(t-a.t)/Math.max(.0001,b.t-a.t)));const mix=(aa:number[],bb:number[])=>aa.map((v,i)=>v+(bb[i]-v)*q);return {t,platform:mix(a.platform,b.platform),mooringTensionN:mix(a.mooringTensionN,b.mooringTensionN)};}
 setTime(t:number){const r=this.sample(t);this.info={time:t,surge:r.platform[0],pitch:r.platform[4]*180/Math.PI,tension:Math.max(...r.mooringTensionN)};/* intentionally no pose displacement: changed visual layout is not this solve */}
 getMooringTension(n:number){return this.sample(this.info.time).mooringTensionN[n-1];}
 getCalloutAnchors(){return this.calloutAnchors;}
 getTowerCenter(q:number){return V(0,28+136.7*q,0).applyMatrix4(this.group.matrixWorld);}
 clonePlatform(){return this.platform.clone(true);}
 setMooringFocus(amount:number){for(const l of this.lines){const m=l.mesh.material as T.MeshStandardMaterial;m.color.set(l.line===1?'#a8854d':'#36575f');m.emissive.set(l.line===1?'#3b2508':'#000000');m.emissiveIntensity=amount*.18;}}
 dispose(){const gs=new Set<any>(),ms=new Set<any>();this.group.traverse(o=>{if(o instanceof T.Mesh){gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
}
