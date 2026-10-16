import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';

export const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export const smooth=(n:number)=>{const x=clamp(n);return x*x*x*(x*(x*6-15)+10)};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export type DNAState={scene:string;progress:number;time:number;previous?:string;elapsed?:number;line?:number;lineProgress?:number};
const C={ink:0x142a35,cream:0xf3f0e7,blue:0x43a7bd,cyan:0x8de3d4,gold:0xe4ad5b,coral:0xe47161,purple:0x8b7dd8,green:0x4db58d,red:0xe35e5e,slate:0x395867};
const mat=(c:number,rough=.5,metal=0)=>new THREE.MeshStandardMaterial({color:c,roughness:rough,metalness:metal});
const basic=(c:number,o=1)=>new THREE.MeshBasicMaterial({color:c,transparent:o<1,opacity:o,depthWrite:o>.7});
function line(points:THREE.Vector3[],color:number,opacity=1){return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),basic(color,opacity));}
function tube(points:THREE.Vector3[],color:number,r=.018,opacity=1){const c=new THREE.CatmullRomCurve3(points);return new THREE.Mesh(new THREE.TubeGeometry(c,80,r,8,false),new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity}));}

export class DNAWorld{
 renderer:THREE.WebGLRenderer; scene=new THREE.Scene(); camera:THREE.OrthographicCamera;
 root=new THREE.Group(); backdrop=new THREE.Group(); file=new THREE.Group(); encode=new THREE.Group(); constraint=new THREE.Group(); fountain=new THREE.Group(); read=new THREE.Group(); decode=new THREE.Group(); llm=new THREE.Group();
 helix=new THREE.Group(); baseDots:THREE.Mesh[]=[]; blocks:THREE.Mesh[]=[]; droplets:THREE.Group[]=[]; reads:THREE.Group[]=[]; heat:THREE.Mesh[]=[]; tokenBars:THREE.Mesh[]=[]; scanBars:THREE.Mesh[]=[];
 constructor(canvas:HTMLCanvasElement,width=1920,height=1080){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setSize(width,height,false);this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.08;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const pmrem=new THREE.PMREMGenerator(this.renderer),env=pmrem.fromScene(new RoomEnvironment(),.04);this.scene.environment=env.texture;pmrem.dispose();this.scene.background=new THREE.Color(C.cream);this.camera=new THREE.OrthographicCamera(-8,8,4.5,-4.5,.1,100);this.scene.add(new THREE.HemisphereLight(0xf8ffff,0x243e49,1.8));const key=new THREE.DirectionalLight(0xffead0,3);key.position.set(-5,8,8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);this.scene.add(key);const fill=new THREE.DirectionalLight(0x9de9ff,1.4);fill.position.set(8,3,-5);this.scene.add(fill);this.scene.add(this.root);this.root.add(this.backdrop,this.file,this.encode,this.constraint,this.fountain,this.read,this.decode,this.llm);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(42,24),mat(0xe6e9e4,.95));floor.rotation.x=-Math.PI/2;floor.position.y=-3.75;this.root.add(floor);
  this.buildBackdrop();this.buildFile();this.buildHelix();this.buildConstraint();this.buildFountain();this.buildRead();this.buildDecode();this.buildLLM();this.root.traverse(o=>{const m=o as THREE.Mesh;if((m as any).isMesh&&m.parent!==this.backdrop)m.castShadow=true;});
 }
 buildBackdrop(){
  const ring1=new THREE.Mesh(new THREE.TorusGeometry(6.8,.018,12,160),basic(0xc8d9d4,.35));ring1.position.set(1.2,.15,-3.2);this.backdrop.add(ring1);
  const ring2=new THREE.Mesh(new THREE.TorusGeometry(5.45,.012,12,160),basic(0xd8c9a8,.24));ring2.position.set(-2.8,-.45,-3.3);this.backdrop.add(ring2);
  const pts=new Float32Array(90*3);for(let i=0;i<90;i++){pts[i*3]=((i*37)%180)/10-9;pts[i*3+1]=((i*61)%90)/10-4.5;pts[i*3+2]=-2.8-((i*17)%24)/10;}const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pts,3));this.backdrop.add(new THREE.Points(pg,new THREE.PointsMaterial({color:0x9fb8b5,size:.028,transparent:true,opacity:.3,sizeAttenuation:true})));
 }
 buildFile(){
  const page=new THREE.Mesh(new THREE.BoxGeometry(2.15,1.42,.12),mat(0xf9fbf7,.55));page.position.set(-4.5,1.25,-.25);this.file.add(page);for(let i=0;i<4;i++){const l=new THREE.Mesh(new THREE.BoxGeometry(1.45,.045,.025),basic(i===3?C.coral:0xb5c6c1,.65));l.position.set(-4.95,.9-i*.22,-.16);this.file.add(l);} 
  for(let i=0;i<24;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(.34,.34,.34),mat([C.blue,C.cyan,C.gold,C.coral][i%4],.28,.08));b.position.set(-5.6+(i%8)*.6,1.1-Math.floor(i/8)*.6,0);b.castShadow=true;this.file.add(b);this.blocks.push(b);}
  const disk=new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.35,.22,64),mat(C.slate,.25,.25));disk.rotation.x=Math.PI/2;disk.position.set(-3.9,-.4,0);this.file.add(disk);const ring=new THREE.Mesh(new THREE.TorusGeometry(1.02,.055,12,64),basic(C.cyan,.75));ring.rotation.x=Math.PI/2;ring.position.copy(disk.position);this.file.add(ring);
  const arrow=tube([new THREE.Vector3(-2.7,.35,.1),new THREE.Vector3(-1.8,.35,.22),new THREE.Vector3(-.8,.35,.1)],C.gold,.045,.85);this.file.add(arrow);
 }
 buildHelix(){
  const a:THREE.Vector3[]=[],b:THREE.Vector3[]=[];for(let i=0;i<=140;i++){const t=i/140*Math.PI*5.6,x=-.5+t*.6,y=Math.sin(t)*1.35,z=Math.cos(t)*.72;a.push(new THREE.Vector3(x,y,z));b.push(new THREE.Vector3(x,-y,-z));if(i%5===0){const c=[C.blue,C.cyan,C.gold,C.coral][(i/5)%4];const m=new THREE.Mesh(new THREE.SphereGeometry(.115,20,14),new THREE.MeshPhysicalMaterial({color:c,roughness:.22,metalness:.08,clearcoat:.9,clearcoatRoughness:.18,emissive:c,emissiveIntensity:.045}));m.position.copy(a[a.length-1]);this.encode.add(m);this.baseDots.push(m);const n=m.clone();n.position.copy(b[b.length-1]);this.encode.add(n);this.baseDots.push(n);this.encode.add(tube([a[a.length-1],b[b.length-1]],C.slate,.012,.42));}}
  this.encode.add(tube(a,C.blue,.045,.95));this.encode.add(tube(b,C.coral,.045,.95));
 }
 buildConstraint(){
  const panel=new THREE.Mesh(new THREE.BoxGeometry(6.8,3.9,.18),mat(0xf8fbf6,.58));panel.position.set(0,0,-.9);this.constraint.add(panel);this.constraint.add(line([new THREE.Vector3(-3.25,1.82,.18),new THREE.Vector3(3.25,1.82,.18),new THREE.Vector3(3.25,-1.82,.18),new THREE.Vector3(-3.25,-1.82,.18),new THREE.Vector3(-3.25,1.82,.18)],C.cyan,.25));
  const g=new THREE.Group();for(let i=0;i<28;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.16,.34,.08),mat(i%2?C.cyan:C.gold,.35));m.position.set(-2.4+(i%14)*.36,1.0-Math.floor(i/14)*.5,0);g.add(m);}this.constraint.add(g);
  const bars=[{y:-.65,v:.74,c:C.blue},{y:-1.15,v:.52,c:C.gold},{y:-1.65,v:.25,c:C.coral}];for(const q of bars){const bg=new THREE.Mesh(new THREE.BoxGeometry(5.25,.09,.05),basic(0xd4dbd3,.8));bg.position.set(0,q.y,.2);this.constraint.add(bg);const fg=new THREE.Mesh(new THREE.BoxGeometry(5.25*q.v,.12,.08),basic(q.c,.95));fg.position.set(-2.625+2.625*q.v,q.y,.25);this.constraint.add(fg);}
  const scan=new THREE.Mesh(new THREE.BoxGeometry(.06,2.5,.05),basic(C.gold,.7));scan.position.set(-2.7,.0,.3);this.constraint.add(scan);this.scanBars.push(scan);
  this.constraint.add(line([new THREE.Vector3(-2.5,.6,.35),new THREE.Vector3(-2.5,-2.05,.35)],C.coral,.35));
 }
 buildFountain(){
  for(let i=0;i<8;i++){const g=new THREE.Group();g.position.set(-3.2+(i%4)*2.1,1.2-Math.floor(i/4)*2.1,0);const core=new THREE.Mesh(new THREE.SphereGeometry(.28,24,16),new THREE.MeshPhysicalMaterial({color:C.gold,roughness:.18,metalness:.12,clearcoat:.95,emissive:C.gold,emissiveIntensity:.07}));g.add(core);const halo=new THREE.Mesh(new THREE.TorusGeometry(.5,.018,10,64),basic(C.gold,.34));halo.rotation.x=Math.PI/2;g.add(halo);for(let j=0;j<4;j++){const c=[C.blue,C.cyan,C.purple,C.coral][j];const m=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.3),new THREE.MeshPhysicalMaterial({color:c,roughness:.24,metalness:.08,clearcoat:.7,emissive:c,emissiveIntensity:.04}));m.position.set(-.7+j*.46,(j%2?-.2:.2),.15);g.add(m);g.add(tube([new THREE.Vector3(0,0,0),m.position.clone()],C.gold,.012,.42));}this.fountain.add(g);this.droplets.push(g);}
  this.fountain.add(tube([new THREE.Vector3(-4.7,-.05,.35),new THREE.Vector3(-2.2,.55,.1),new THREE.Vector3(0,-.05,.35),new THREE.Vector3(2.2,.55,.1),new THREE.Vector3(4.7,-.05,.35)],C.gold,.018,.38));
  this.fountain.add(line([new THREE.Vector3(-4.8,-.05,.4),new THREE.Vector3(4.8,-.05,.4)],C.gold,.25));
 }
 buildRead(){
  for(let r=0;r<5;r++){const g=new THREE.Group();g.position.set(-4.5,1.8-r*.82,0);for(let i=0;i<20;i++){const c=i%7===0?C.red:[C.blue,C.cyan,C.gold,C.coral][(i+r)%4];const m=new THREE.Mesh(new THREE.SphereGeometry(.12,16,10),new THREE.MeshPhysicalMaterial({color:c,roughness:.2,metalness:.06,clearcoat:.8,emissive:c,emissiveIntensity:i%7===0?.06:.025}));m.position.x=i*.42;g.add(m);if(i>0)g.add(tube([new THREE.Vector3((i-1)*.42,0,0),new THREE.Vector3(i*.42,0,0)],C.slate,.009,.26));}this.read.add(g);this.reads.push(g);}
  const tubeMesh=tube([new THREE.Vector3(-4,-2.5,.4),new THREE.Vector3(-1.8,-2.5,.4),new THREE.Vector3(-.2,-1.8,.4),new THREE.Vector3(2,-1.8,.4),new THREE.Vector3(4,-1.9,.4)],C.blue,.085,.55);this.read.add(tubeMesh);this.read.add(new THREE.Mesh(new THREE.TorusGeometry(1.2,.025,10,96),basic(C.cyan,.28)));
 }
 buildDecode(){
  const grid=new THREE.Group();for(let y=0;y<6;y++){for(let x=0;x<8;x++){const c=[C.blue,C.cyan,C.gold,C.coral][(x+y)%4];const m=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.1),new THREE.MeshPhysicalMaterial({color:c,roughness:.26,metalness:.05,clearcoat:.65,emissive:c,emissiveIntensity:.035}));m.position.set(-1.65+x*.48,1.48-y*.48,0);grid.add(m);}}this.decode.add(grid);this.decode.add(line([new THREE.Vector3(-1.9,1.8,.16),new THREE.Vector3(2.1,1.8,.16),new THREE.Vector3(2.1,-1.45,.16),new THREE.Vector3(-1.9,-1.45,.16),new THREE.Vector3(-1.9,1.8,.16)],C.cyan,.32));
  for(let x=0;x<8;x++){const m=new THREE.Mesh(new THREE.BoxGeometry(.38,.38,.08),basic(C.green,.95));m.position.set(-1.5+x*.45,-1.7,0);this.decode.add(m);}
  for(let i=0;i<9;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.12),basic(C.red,.8));m.position.set(-2.7+(i%3)*.5,-2.55-Math.floor(i/3)*.38,.2);this.decode.add(m);}
 }
 buildLLM(){
  const nodes=[[-4,1.8,'DESIGN'],[-1.5,1.8,'CHECK'],[1,1.8,'READ'],[3.6,1.8,'FIX'],[-1.5,-1.1,'MODEL'],[1,-1.1,'VERIFY']];for(const [x,y] of nodes){const n=new THREE.Mesh(new THREE.BoxGeometry(.9,.48,.12),new THREE.MeshPhysicalMaterial({color:C.ink,roughness:.3,metalness:.12,clearcoat:.7,emissive:C.ink,emissiveIntensity:.025}));n.position.set(x as number,y as number,.2);this.llm.add(n);const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.98,.56,.14)),basic(C.cyan,.55));outline.position.copy(n.position);this.llm.add(outline);}
  const pts=[[ -3.5,1.8],[-1.95,1.8],[.55,1.8],[2.9,1.8],[-1.95,-1.1],[.55,-1.1]];for(let i=0;i<pts.length-1;i++){this.llm.add(line([new THREE.Vector3(pts[i][0],pts[i][1],0),new THREE.Vector3(pts[i+1][0],pts[i+1][1],0)],C.gold,.55));}
  for(let i=0;i<30;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.14,.14,.06),basic([C.cyan,C.blue,C.gold,C.purple][i%4],.9));m.position.set(-4.6+(i%15)*.48,-2.3-Math.floor(i/15)*.35,.25);this.llm.add(m);this.tokenBars.push(m);}
  for(let y=0;y<5;y++)for(let x=0;x<5;x++){const m=new THREE.Mesh(new THREE.PlaneGeometry(.4,.4),basic(C.purple,.08+(x+y)/18));m.position.set(2.5+x*.43,-.9-y*.43,.18);this.llm.add(m);this.heat.push(m);}
  const att=new THREE.Mesh(new THREE.TorusGeometry(1.28,.022,12,96),basic(C.purple,.42));att.rotation.x=Math.PI/2;att.position.set(3.36,-1.76,.16);this.llm.add(att);
  for(let i=0;i<12;i++){const dot=new THREE.Mesh(new THREE.SphereGeometry(.045,10,8),basic(i%2?C.cyan:C.gold,.62));dot.position.set(3.36+Math.cos(i/12*Math.PI*2)*1.5,-1.76+Math.sin(i/12*Math.PI*2)*1.5,.25);this.llm.add(dot);}
 }
 render(s:DNAState){
  const scene=s.scene,p=clamp(s.progress);
  // Keep the outgoing stage alive while the camera hands off to the next one.
  // This prevents a hard pop when a new algorithmic layer enters frame.
  const outgoing=s.previous&&s.previous!==scene&&(s.elapsed??2)<1.2?s.previous:undefined;
  const vis=(g:THREE.Group,v:boolean)=>g.visible=v;
  const wants=(id:string)=>id===scene||id===outgoing||((scene==='return'||outgoing==='return')&&['hook','encode','fountain','decode'].includes(id));
  vis(this.file,wants('hook')||scene==='return');
  vis(this.encode,wants('encode')||scene==='return');
  vis(this.constraint,wants('constraint'));
  vis(this.fountain,wants('fountain')||scene==='return');
  vis(this.read,wants('read'));
  vis(this.decode,wants('decode')||scene==='return');
  vis(this.llm,wants('llm'));this.backdrop.visible=scene!=='references';
  // Motion handoff: the next layer enters from the right as the previous
  // layer exits left. The short overlap preserves continuity without a
  // slideshow-like cut or a global fade.
  const transitionQ=outgoing?smooth(clamp((s.elapsed??0)/1.2)):1;
  const stages:{id:string;g:THREE.Group}[]=[
   {id:'hook',g:this.file},{id:'encode',g:this.encode},{id:'constraint',g:this.constraint},
   {id:'fountain',g:this.fountain},{id:'read',g:this.read},{id:'decode',g:this.decode},{id:'llm',g:this.llm}
  ];
  stages.forEach(({id,g})=>{g.position.x=0;if(outgoing&&scene!== 'return'){if(id===scene)g.position.x=(1-transitionQ)*10;if(id===outgoing)g.position.x=-transitionQ*10;}});
  const scales:Record<string,number>={hook:1.08,encode:1.1,constraint:1.12,fountain:1.14,read:1.13,decode:1.16,llm:1.12,return:1.06};stages.forEach(({id,g})=>{const active=id===scene||id===outgoing;const z=scales[id]??1;g.scale.setScalar(active?z:1);});
  this.blocks.forEach((b,i)=>{const q=smooth(p+i*.02);b.position.x=-5.6+(i%8)*.6+(scene==='hook'?q*3.6:0);b.position.y=1.1-Math.floor(i/8)*.6+Math.sin((s.time+i)*.45)*.03;});this.baseDots.forEach((m,i)=>{m.scale.setScalar(.75+.35*smooth(p*1.3+i*.015));});this.droplets.forEach((g,i)=>{const q=smooth(p*1.2);g.position.y=(i<4?1.2:-.9)-Math.sin(q*Math.PI)*.4;g.rotation.z=(i%2?-.2:.2)*q;});this.reads.forEach((g,i)=>{g.position.x=-4.5+Math.min(1,p*1.7)*.9;g.rotation.z=(i%2?-.02:.02)*p;});this.heat.forEach((m,i)=>{const q=.08+.82*smooth(p*1.4-(i%5)*.05);(m.material as THREE.MeshBasicMaterial).opacity=q;});this.tokenBars.forEach((m,i)=>m.scale.y=.6+.8*smooth(p*1.4-(i%15)*.03));this.scanBars.forEach((m,i)=>m.position.x=-2.7+5.4*smooth((p+i*.08)%1));this.encode.rotation.y=.065*Math.sin(s.time*.42);this.fountain.rotation.z=.012*Math.sin(s.time*.38);this.read.rotation.y=.035*Math.sin(s.time*.26);this.llm.rotation.z=.006*Math.sin(s.time*.3);this.backdrop.rotation.z=.012*Math.sin(s.time*.13);this.backdrop.position.x=.12*Math.sin(s.time*.08);
  const presets:Record<string,[number,number,number,number]>={hook:[0,0,16,1],encode:[0,.15,12,1.2],constraint:[0,0,15,1.05],fountain:[0,.1,13,1.1],read:[0,-.2,12.5,1.12],decode:[0,.15,13,1.1],llm:[0,.1,14,1.03],return:[0,.1,16,1],references:[0,0,16,1]};let [cx,cy,cz,zoom]=presets[scene]||presets.hook;if(s.previous&&s.previous!==scene&&(s.elapsed??2)<1.2){const v=presets[s.previous]||presets.hook;const q=smooth((s.elapsed??0)/1.2);cx=mix(v[0],cx,q);cy=mix(v[1],cy,q);cz=mix(v[2],cz,q);zoom=mix(v[3],zoom,q);}this.camera.position.set(cx,cy,cz);this.camera.zoom=zoom;this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();this.root.rotation.z=.008*Math.sin(s.time*.3);this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.scene.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose();const ma=(m as any).material;if(ma){for(const a of (Array.isArray(ma)?ma:[ma]))a.dispose();}});this.renderer.dispose();this.renderer.forceContextLoss();}
}
