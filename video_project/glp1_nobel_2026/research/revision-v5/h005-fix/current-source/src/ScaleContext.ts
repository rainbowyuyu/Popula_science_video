import * as T from 'three';
import {V,mat} from './visual';

/** Explicit teaching context at intervening physical scales, not patient histology. */
export function pancreaticTissue(){
 const root=new T.Group();root.name='exocrine-tissue-context-metres';
 const positions:T.Vector3[]=[];
 for(let y=-12;y<=12;y++)for(let x=-16;x<=16;x++){
  const p=V(x*85e-6+(y%2)*42e-6,y*76e-6,Math.sin(x*9+y*7)*18e-6-60e-6);
  if(p.length()<145e-6||p.length()>1.35e-3)continue;positions.push(p);
 }
 const mesh=new T.InstancedMesh(new T.IcosahedronGeometry(39e-6,2),mat('#d9b99a',.95,.63),positions.length);
 const dummy=new T.Object3D();positions.forEach((p,i)=>{dummy.position.copy(p);dummy.rotation.set(i*.75,i*.37,i*.15);dummy.scale.set(1,1,.65+.1*Math.sin(i));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new T.Color('#d3a890').lerp(new T.Color('#e5caae'),.5+.5*Math.sin(i*2.399)));});root.add(mesh);
 root.userData={representation:'Teaching exocrine acinar context. Approximate 78 µm acini; the central 150 µm islet is endocrine.',units:'metres'};
 return root;
}

export function plasmaContext(){
 const root=new T.Group();root.name='plasma-erythrocyte-scale-context';
 const profile=[[0,.18],[1.2,.23],[2.4,.75],[3.1,.9],[3.6,.55],[3.8,0],[3.6,-.55],[3.1,-.9],[2.4,-.75],[1.2,-.23],[0,-.18]];
 const geometry=new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r*1e-6,y*1e-6)),40);
 for(let i=0;i<22;i++){
  const mesh=new T.Mesh(geometry,mat(i%2?'#bd8177':'#bc726c',.90,.48));
  const a=i*2.399,r=12e-6+Math.sqrt(i)*7e-6;
  mesh.position.set(Math.cos(a)*r,Math.sin(a)*r,Math.sin(i*8)*5e-6-8e-6);
  mesh.rotation.set(.5+i*.18,i*.73,.1);root.add(mesh);
 }
 root.userData={representation:'Representative 7.6 µm erythrocytes around a plasma viewing region. Not simulated blood flow.',units:'metres'};
 return root;
}

export function intestinalTissue(){
 const root=new T.Group();root.name='intestinal-villus-context-metres';
 const profile=[[0,0],[80e-6,0],[88e-6,130e-6],[65e-6,430e-6],[36e-6,530e-6],[0,550e-6]];
 const geometry=new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),28);
 for(let i=-4;i<=4;i++)for(let j=-2;j<=2;j++){
  if(i===0&&j===0)continue;
  const mesh=new T.Mesh(geometry,mat('#d4a496',.95,.59));mesh.position.set(i*260e-6+(j%2)*110e-6,-550e-6,j*260e-6-160e-6);mesh.rotation.z=.055*Math.sin(i*7+j*13);root.add(mesh);
 }
 root.userData={representation:'Representative 0.55 mm villi orient the epithelial zoom; not measured patient villi.',units:'metres'};
 return root;
}
