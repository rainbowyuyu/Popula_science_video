/** V05 clean-sheet 2026 Roadster-inspired teaching model, not official CAD.
 * +X forward +Y up +Z left, metre scale, tyres y=0. Fixed procedural PBR textures.
 * Public Oct 15 front/side/rear references, not the 2017 convertible silhouette.
 */
import * as T from 'three';
export type ThrusterName='frontLeft'|'frontRight'|'rearLeft'|'rearRight';
type P=Array<[number,number]>;
const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const mix=(a:number,b:number,u:number)=>a+(b-a)*u;
const clamp=(x:number)=>Math.min(1,Math.max(0,x));
function at(p:P,x:number){
  if(x<=p[0][0])return p[0][1];if(x>=p[p.length-1][0])return p[p.length-1][1];
  let i=0;while(x>p[i+1][0])i++;
  const [x0,y0]=p[i],[x1,y1]=p[i+1],dx=x1-x0,u=(x-x0)/dx;
  const slope=(k:number)=>{if(k===0)return(p[1][1]-p[0][1])/(p[1][0]-p[0][0]);if(k===p.length-1)return(p[k][1]-p[k-1][1])/(p[k][0]-p[k-1][0]);const a=(p[k][1]-p[k-1][1])/(p[k][0]-p[k-1][0]),b=(p[k+1][1]-p[k][1])/(p[k+1][0]-p[k][0]);return a*b<=0?0:2*a*b/(a+b);};
  return(2*u**3-3*u*u+1)*y0+(u**3-2*u*u+u)*dx*slope(i)+(-2*u**3+3*u*u)*y1+(u**3-u*u)*dx*slope(i+1);
}
const W:P=[[-2.28,.85],[-1.6,.985],[-.9,.98],[.35,.95],[1.34,.985],[1.85,.96],[2.28,.84]];
const SHOULDER:P=[[-2.28,.87],[-1.45,.93],[-.7,.90],[.15,.845],[.85,.80],[1.42,.80],[1.8,.74],[2.28,.50]];
const CENTER:P=[[-2.28,.865],[-1.45,.91],[-.7,.85],[.5,.80],[1.05,.775],[1.4,.75],[1.85,.66],[2.28,.505]];
const w=(x:number)=>at(W,x),shoulder=(x:number)=>at(SHOULDER,x),center=(x:number)=>at(CENTER,x);
function topSurface(x:number,z:number){const t=Math.abs(z)/w(x);if(t<=.72)return center(x)+.008*(1-(t/.72)**2);if(t<=.92){const u=(t-.72)/.20;return mix(center(x),shoulder(x),u)+.006*Math.sin(u*Math.PI);}return shoulder(x)-.035*(t-.92)/.08;}
const WHEEL_X=[1.40,-1.42],R=.36,ARCH=.388;
function lower(x:number){for(const cx of WHEEL_X){const d=x-cx;if(Math.abs(d)<ARCH)return R+Math.sqrt(ARCH*ARCH-d*d);}if(x<-1.92)return mix(.22,.43,clamp((-x-1.92)/.36));if(x>1.95)return mix(.22,.30,clamp((x-1.95)/.33));return .22;}
function mesh(g:T.BufferGeometry,m:T.Material,name:string){const o=new T.Mesh(g,m);o.name=name;o.castShadow=true;o.receiveShadow=true;return o;}
function grid(nx:number,ny:number,f:(u:number,v:number)=>T.Vector3){const p:number[]=[],uv:number[]=[],ix:number[]=[];for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++){const q=f(i/nx,j/ny);p.push(q.x,q.y,q.z);uv.push(i/nx,j/ny);}for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const a=i*(ny+1)+j,b=a+ny+1;ix.push(a,b,a+1,b,b+1,a+1);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;}
function box(x:number,y:number,z:number,r=.01){r=Math.min(r,x*.3,y*.3,z*.3);const a=-x/2,b=-y/2,s=new T.Shape();s.moveTo(a+r,b);s.lineTo(a+x-r,b);s.quadraticCurveTo(a+x,b,a+x,b+r);s.lineTo(a+x,b+y-r);s.quadraticCurveTo(a+x,b+y,a+x-r,b+y);s.lineTo(a+r,b+y);s.quadraticCurveTo(a,b+y,a,b+y-r);s.lineTo(a,b+r);s.quadraticCurveTo(a,b,a+r,b);const g=new T.ExtrudeGeometry(s,{depth:z-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r*.7,bevelSegments:3,steps:1,curveSegments:6});g.translate(0,0,-z/2+r);g.computeVertexNormals();return g;}
function tube(points:T.Vector3[],r:number,m:T.Material,n:string,steps=48){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points,false,'centripetal'),steps,r,8,false),m,n);}
function bar(a:T.Vector3,b:T.Vector3,r:number,m:T.Material,n:string){const d=b.clone().sub(a),o=mesh(new T.CylinderGeometry(r,r,d.length(),12),m,n);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());return o;}
function quad(points:T.Vector3[],m:T.Material,n:string){const g=new T.BufferGeometry(),p:number[]=[],uv:number[]=[];points.forEach((v,i)=>{p.push(v.x,v.y,v.z);uv.push(i===1||i===2?1:0,i>=2?1:0);});g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));const idx=[];for(let i=1;i<points.length-1;i++)idx.push(0,i,i+1);g.setIndex(idx);g.computeVertexNormals();return mesh(g,m,n);}
function microtexture(kind:'carbon'|'rubber',rx:number,ry:number){const n=128,data=new Uint8Array(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){let v=0;if(kind==='carbon'){const a=Math.floor(x/8),b=Math.floor(y/8),over=(a+b)%2===0,q=over?x%8:y%8;v=31+13*Math.sin(Math.PI*q/8)+((x*13+y*7)%5);}else{v=224+((x*374761393+y*668265263)>>>0)%11-((x%32<2)?15:0);}const i=(y*n+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}const t=new T.DataTexture(data,n,n,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rx,ry);t.anisotropy=8;t.needsUpdate=true;t.name=`Procedural_${kind}_fixed_128`;return t;}

export class Car{
  readonly root=new T.Group();readonly wheels:T.Group[]=[];readonly shell:T.Mesh[]=[];
  readonly tank=new T.Group();readonly thrusterHardware=new T.Group();readonly underbody:T.Mesh[]=[];
  readonly thrusters:Record<ThrusterName,T.Vector3>={frontLeft:V(1.45,.255,.69),frontRight:V(1.45,.255,-.69),rearLeft:V(-1.45,.255,.69),rearRight:V(-1.45,.255,-.69)};
  readonly dimensions={length:4.6,width:2.0,height:1.245,wheelbase:2.82};
  private paint:T.MeshPhysicalMaterial;private glass:T.MeshPhysicalMaterial;private dark:T.MeshStandardMaterial;private metal:T.MeshStandardMaterial;private carbon:T.MeshPhysicalMaterial;
  private shellMaterials=new Set<T.Material>();private shellBaseOpacity=new Map<T.Material,number>();
  constructor(){
    this.root.name='Roadster_2026_teaching_V05';this.root.userData={source:'Original procedural reconstruction from public 2026 reveal references',units:'m',officialCAD:false,approximateSilhouette:true,mechanismConfiguration:'Illustrative four underside nozzles; not actual hardware specification'};
    this.paint=new T.MeshPhysicalMaterial({color:0x8a8e91,metalness:.76,roughness:.27,clearcoat:1,clearcoatRoughness:.17,side:T.DoubleSide});
    this.glass=new T.MeshPhysicalMaterial({color:0x060b11,metalness:.04,roughness:.22,clearcoat:.30,clearcoatRoughness:.22,envMapIntensity:.32,specularIntensity:.35,specularColor:0x8b939d,side:T.DoubleSide});
    this.dark=new T.MeshStandardMaterial({color:0x101419,metalness:.36,roughness:.38});
    this.metal=new T.MeshStandardMaterial({color:0xb8bdc3,metalness:.94,roughness:.23,side:T.DoubleSide});
    const weave=microtexture('carbon',16,10);this.carbon=new T.MeshPhysicalMaterial({color:0x6e747b,map:weave,bumpMap:weave,bumpScale:.0009,metalness:.25,roughness:.4,clearcoat:.8,clearcoatRoughness:.24,side:T.DoubleSide});
    this.body();this.cabin();this.wheelAssemblies();this.lightingAndTrim();this.pressureTank();this.nozzles();this.root.add(this.tank,this.thrusterHardware);this.tank.visible=false;this.thrusterHardware.visible=false;
  }
  private addShell(o:T.Mesh){this.root.add(o);this.shell.push(o);for(const m of Array.isArray(o.material)?o.material:[o.material]){this.shellMaterials.add(m);this.shellBaseOpacity.set(m,m.opacity);}return o;}
  private body(){
    const deck=(a:number,b:number,n:string)=>this.addShell(mesh(grid(56,24,(u,v)=>{const x=mix(a,b,u),z=(v*2-1)*w(x)*.72;return V(x,center(x)+.008*(1-(v*2-1)**2),z);}),this.paint,n));
    deck(.90,2.28,'Flat_wedge_front_hood');deck(-2.28,-1.70,'Fastback_rear_deck');
    for(const side of[-1,1]){
      this.addShell(mesh(grid(128,16,(u,v)=>{const x=mix(-2.28,2.28,u),z=side*w(x)*mix(.72,.92,v),y=mix(center(x),shoulder(x),v)+.006*Math.sin(v*Math.PI);return V(x,y,z);}),this.paint,'Clean_shouldered_upper_fender'));
      this.addShell(mesh(grid(160,6,(u,v)=>{const x=mix(-2.28,2.28,u),h=shoulder(x);return V(x,h-.035*v,side*w(x)*mix(.92,1,v));}),this.paint,'Continuous_chamfered_belt_edge'));
      this.addShell(mesh(grid(240,14,(u,v)=>{const x=mix(-2.28,2.28,u),top=shoulder(x)-.035,bottom=Math.min(top-.008,lower(x)),y=mix(top,bottom,v),inset=.021*Math.sin(v*Math.PI)+.032*v;return V(x,y,side*(w(x)-inset));}),this.paint,'Single_clean_door_and_arch_surface'));
      for(const cx of WHEEL_X){
        this.addShell(mesh(grid(80,4,(u,v)=>{const theta=Math.PI*u,r=ARCH+.007*v,x=cx+r*Math.cos(theta);return V(x,R+r*Math.sin(theta),side*(w(x)-.028+.004*v));}),this.paint,'Fine_wheel_arch_edge'));
        const wellmat=new T.MeshStandardMaterial({color:0x080b0f,roughness:.98,side:T.DoubleSide});const well=mesh(grid(64,8,(u,v)=>{const theta=Math.PI*u;return V(cx+ARCH*Math.cos(theta),R+ARCH*Math.sin(theta),side*mix(.85,.94,v));}),wellmat,'Recessed_smooth_wheel_liner');this.root.add(well);
      }
      const sill=mesh(box(2.00,.11,.11,.022),this.carbon,'Carbon_side_rocker');sill.position.set(0,.22,side*.92);this.root.add(sill);
    }
    this.addShell(mesh(grid(32,12,(u,v)=>{const z=(u*2-1)*.84,y=mix(.50,.30,v);return V(2.28-.025*v,y,z);}),this.paint,'Wedge_nose_fascia'));
    this.addShell(mesh(grid(40,12,(u,v)=>{const z=(u*2-1)*.85;return V(-2.28+.035*v,mix(.865,.44,v),z);}),this.paint,'Wide_flat_rear_fascia'));
    const floor=mesh(box(3.86,.065,1.52,.02),this.carbon.clone(),'Underbody_flat_floor');floor.position.y=.26;this.root.add(floor);this.underbody.push(floor);
  }
  private cabin(){
    const roof:P=[[-1.72,.913],[-1.18,1.18],[-.87,1.239],[-.12,1.245],[.13,1.205],[.90,.80]];
    const width:P=[[-1.72,.73],[-1.18,.66],[-.87,.63],[-.12,.62],[.13,.63],[.90,.70]];
    const belt=(x:number)=>center(x)+.006;
    const roofHeight=(x:number)=>x>.02?mix(1.237,.80,(x-.02)/.88)+.006*Math.sin(Math.PI*(x-.02)/.88):x<-1.0?mix(.913,1.235,(x+1.72)/.72):at(roof,x);
    const topAt=(x:number,z:number)=>roofHeight(x)-.018*(z/(at(width,x)||1))**2;
    this.addShell(mesh(grid(110,32,(u,v)=>{const x=mix(-1.72,.90,u),z=(v*2-1)*at(width,x);return V(x,topAt(x,z),z);}),this.glass,'One_piece_windscreen_roof_and_fastback_glass'));
    for(const side of[-1,1]){
      this.addShell(mesh(grid(110,12,(u,v)=>{const x=mix(-1.72,.90,u),h=topAt(x,at(width,x));return V(x,mix(belt(x),h,v),side*mix(w(x)*.76,at(width,x),v));}),this.glass,'Integrated_smoked_side_glass'));
      const edge=[];for(let i=0;i<=60;i++){const x=mix(-1.72,.90,i/60);edge.push(V(x,topAt(x,at(width,x))+.002,side*(at(width,x)+.002)));}this.addShell(tube(edge,.010,this.paint,'Slender_silver_roof_outline',70));
      const base=[];for(let i=0;i<=40;i++){const x=mix(-1.72,.9,i/40);base.push(V(x,belt(x)+.002,side*(w(x)*.762)));}this.addShell(tube(base,.006,this.dark.clone(),'Flush_window_base_gasket'));
      const x=-.55,h=topAt(x,at(width,x));this.addShell(bar(V(x,belt(x),side*w(x)*.76),V(x,h,side*at(width,x)),.008,this.dark.clone(),'Thin_side_window_division'));
    }
    const cabin=new T.Group();cabin.name='Interior_under_glass';this.root.add(cabin);const seatMat=new T.MeshStandardMaterial({color:0x373a3d,roughness:.88});
    for(const side of[-1,1]){const back=mesh(box(.16,.38,.39,.055),seatMat,'Sculpted_bucket_seat');back.position.set(-.55,.72,side*.30);back.rotation.z=-.22;cabin.add(back);const cushion=mesh(box(.46,.095,.39,.035),seatMat,'Seat_base');cushion.position.set(-.31,.49,side*.30);cabin.add(cushion);const head=mesh(box(.13,.14,.23,.035),seatMat,'Integrated_headrest');head.position.set(-.60,.96,side*.30);cabin.add(head);}
    const dash=mesh(box(.29,.12,1.22,.03),this.carbon.clone(),'Carbon_dashboard');dash.position.set(.43,.74,0);cabin.add(dash);
    const screen=mesh(box(.018,.22,.29,.012),new T.MeshStandardMaterial({color:0x081419,roughness:.19,emissive:0x07171c,emissiveIntensity:.3}),'Minimal_interior_display');screen.rotation.z=.15;screen.position.set(.27,.79,0);cabin.add(screen);
    const yoke=mesh(new T.TorusGeometry(.10,.012,8,32,Math.PI*1.7),this.dark,'Steering_yoke');yoke.rotation.y=Math.PI/2;yoke.position.set(.08,.77,.30);cabin.add(yoke);
  }
  private wheelAssemblies(){
    const rubberTex=microtexture('rubber',8,3),rubber=new T.MeshStandardMaterial({color:0x17191c,roughness:.98,roughnessMap:rubberTex,metalness:.015,bumpMap:rubberTex,bumpScale:.0015});
    const blackAlloy=new T.MeshStandardMaterial({color:0x171c23,metalness:.88,roughness:.26}),discMat=new T.MeshStandardMaterial({color:0x616870,metalness:.9,roughness:.56});
    for(const x of WHEEL_X)for(const side of[-1,1]){
      const g=new T.Group();g.name=`${x>0?'Front':'Rear'}_${side>0?'Left':'Right'}_wheel`;g.position.set(x,R,side*.86);this.wheels.push(g);this.root.add(g);
      const tyreProfile=[new T.Vector2(.275,-.116),new T.Vector2(.316,-.127),new T.Vector2(.343,-.113),new T.Vector2(.357,-.080),new T.Vector2(.36,-.041),new T.Vector2(.36,.041),new T.Vector2(.357,.080),new T.Vector2(.343,.113),new T.Vector2(.316,.127),new T.Vector2(.275,.116)];
      const tyre=mesh(new T.LatheGeometry(tyreProfile,96),rubber,'Low_profile_smooth_rubber_tyre');tyre.rotation.x=Math.PI/2;g.add(tyre);
      for(const z of[-.065,0,.065]){const groove=mesh(new T.TorusGeometry(.359,.0020,5,96),new T.MeshStandardMaterial({color:0x06080a,roughness:1}),'Fine_circumferential_tread');groove.position.z=z;g.add(groove);}
      for(const z of[-.119,.119]){const ring=mesh(new T.TorusGeometry(.318,.002,5,72),new T.MeshStandardMaterial({color:0x24282e,roughness:.7}),'Subtle_sidewall_mould_ring');ring.position.z=z;g.add(ring);}
      const barrel=mesh(new T.CylinderGeometry(.279,.279,.19,80,1,true),blackAlloy,'Deep_alloy_barrel');barrel.rotation.x=Math.PI/2;g.add(barrel);
      const outerZ=side*.127,lip=mesh(new T.TorusGeometry(.277,.008,8,80),this.metal,'Thin_machined_rim_edge');lip.position.z=outerZ;g.add(lip);
      const disc=mesh(new T.CylinderGeometry(.225,.225,.016,64),discMat,'Ventilated_carbon_ceramic_rotor');disc.rotation.x=Math.PI/2;disc.position.z=side*.04;g.add(disc);
      for(let k=0;k<5;k++){
        const a=k*Math.PI*2/5,point=(r:number,ang:number,z:number)=>V(Math.cos(ang)*r,Math.sin(ang)*r,z);
        const plate=quad([point(.075,a,outerZ-.012*side),point(.258,a+.10,outerZ-.015*side),point(.258,a+.72,outerZ-.015*side),point(.12,a+.56,outerZ-.010*side)],this.metal,'Brushed_triangular_aero_wheel_insert');g.add(plate);
        for(const off of[0,.17]){const a0=point(.055,a+off,outerZ+.005*side),a1=point(.269,a+off+.055,outerZ+.006*side),d=a1.clone().sub(a0),spoke=mesh(box(.041,d.length(),.025,.006),blackAlloy,'Forged_split_spoke');spoke.position.copy(a0).add(a1).multiplyScalar(.5);spoke.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());g.add(spoke);}
      }
      const hub=mesh(new T.CylinderGeometry(.064,.064,.035,32),blackAlloy,'Unbranded_hub_cap');hub.rotation.x=Math.PI/2;hub.position.z=outerZ;g.add(hub);
      for(let k=0;k<5;k++){const a=k*Math.PI*2/5,bolt=mesh(new T.SphereGeometry(.006,8,6),this.metal,'Recessed_lug');bolt.position.set(Math.cos(a)*.043,Math.sin(a)*.043,outerZ+side*.019);g.add(bolt);}
      const cal=mesh(box(.058,.16,.04,.015),new T.MeshStandardMaterial({color:0x92613d,metalness:.52,roughness:.35}),'Fixed_bronze_brake_caliper');cal.position.set(x+.18,.405,side*.919);this.root.add(cal);
    }
  }
  private lightingAndTrim(){
    const recess=new T.MeshStandardMaterial({color:0x05090e,roughness:.38,metalness:.3,side:T.DoubleSide}),led=new T.MeshStandardMaterial({color:0xd6f3ff,emissive:0xc1eaff,emissiveIntensity:1.8,roughness:.18,side:T.DoubleSide}),red=new T.MeshStandardMaterial({color:0xa41621,emissive:0xe9212d,emissiveIntensity:1.25,roughness:.25}),gap=new T.MeshStandardMaterial({color:0x242d34,metalness:.1,roughness:.6});
    for(const side of[-1,1]){
      const nose=[2.19,.585],inner=[1.84,.735],outer=[1.76,.87];
      this.addShell(mesh(grid(20,16,(u,v)=>{const x=mix(nose[0],mix(inner[0],outer[0],v),u),z=side*mix(nose[1],mix(inner[1],outer[1],v),u);return V(x,topSurface(x,z)+.004,z);}),recess.clone(),'Triangular_headlight_recess'));
      const edge=[];for(let i=0;i<=12;i++){const x=mix(inner[0],outer[0],i/12),z=side*mix(inner[1],outer[1],i/12);edge.push(V(x,topSurface(x,z)+.008,z));}
      this.addShell(tube(edge,.007,led.clone(),'Triangular_headlight_signature',20));
      for(let i=0;i<4;i++){const x=1.87+i*.043,z=side*(.750-i*.023),p=V(x,topSurface(x,z)+.007,z),lens=mesh(new T.SphereGeometry(.0075,10,8),led.clone(),'Projector_optic');lens.scale.set(1,.7,1);lens.position.copy(p);this.addShell(lens);}
      this.addShell(tube([V(.89,.806,side*.67),V(1.42,.750,side*.615),V(1.92,.638,side*.56),V(2.26,.515,side*.55)],.0025,gap.clone(),'Precision_hood_panel_gap'));
      this.addShell(tube([V(.76,.785,side*.945),V(.63,.62,side*.935),V(.50,.235,side*.92),V(-.57,.235,side*.938),V(-.72,.73,side*.963),V(-.68,.868,side*.975)],.0027,gap.clone(),'Flush_door_perimeter_gap',56));
      const handle=mesh(box(.10,.010,.012,.003),gap.clone(),'Subtle_flush_handle');handle.position.set(-.64,.816,side*.974);this.addShell(handle);
      const marker=mesh(box(.12,.017,.009,.003),new T.MeshStandardMaterial({color:0x9f4a23,emissive:0x56200c,emissiveIntensity:.12}),'Amber_fender_marker');marker.position.set(.84,.711,side*.963);this.addShell(marker);
      const camera=mesh(box(.055,.025,.020,.006),recess.clone(),'Flush_side_camera');camera.position.set(.72,.72,side*.964);this.addShell(camera);
    }
    this.addShell(tube([V(2.287,.505,-.565),V(2.30,.506,0),V(2.287,.505,.565)],.0055,led,'Nose_light_blade',40));
    const intake=quad([V(2.281,.450,-.70),V(2.281,.450,.70),V(2.263,.312,.745),V(2.263,.312,-.745)],recess.clone(),'Flush_trapezoidal_front_intake');this.root.add(intake);
    const innerSlat=quad([V(2.285,.370,-.70),V(2.285,.370,.70),V(2.282,.355,.70),V(2.282,.355,-.70)],this.carbon.clone(),'Recessed_intake_horizontal_blade');this.root.add(innerSlat);
    const splitter=mesh(grid(12,30,(u,v)=>{const z=mix(-.865,.865,v),end=.035*(Math.abs(z)/.865)**2;return V(mix(2.06,2.31-end,u),.298+.003*Math.sin(Math.PI*u),z);}),this.carbon.clone(),'Contoured_carbon_front_splitter');this.root.add(splitter);
    this.root.add(tube([V(2.274,.298,-.865),V(2.306,.298,-.45),V(2.311,.298,0),V(2.306,.298,.45),V(2.274,.298,.865)],.007,this.carbon.clone(),'Thin_carbon_splitter_edge'));
    const rearPanel=mesh(box(.034,.215,1.56,.016),this.carbon.clone(),'Rear_carbon_valance');rearPanel.position.set(-2.265,.405,0);this.root.add(rearPanel);
    this.addShell(tube([V(-2.294,.769,-.81),V(-2.31,.777,0),V(-2.294,.769,.81)],.012,recess.clone(),'Rear_light_recess',64));
    this.addShell(tube([V(-2.309,.772,-.80),V(-2.325,.780,0),V(-2.309,.772,.80)],.0055,red,'Continuous_red_tail_light',64));
    const lip=mesh(box(.10,.022,1.75,.006),this.paint.clone(),'Flush_rear_trailing_edge');lip.position.set(-2.22,.879,0);this.addShell(lip);
    const diffuser=mesh(box(.55,.050,1.48,.012),this.carbon.clone(),'Wide_underbody_diffuser');diffuser.position.set(-2.02,.255,0);diffuser.rotation.z=-.11;this.root.add(diffuser);
    for(let i=-3;i<=3;i++){const blade=mesh(box(.50,.095,.013,.003),this.carbon.clone(),'Diffuser_strake');blade.position.set(-2.02,.238,i*.21);blade.rotation.z=-.11;this.root.add(blade);}
  }
  private pressureTank(){
    this.tank.name='Illustrative_compressed_gas_tank';this.tank.userData={evidence:'illustrative',note:'Not Tesla hardware specification'};
    const cylinder=mesh(new T.CapsuleGeometry(.19,.76,12,40),new T.MeshStandardMaterial({color:0x405464,metalness:.8,roughness:.34}),'Pressure_vessel_capsule');cylinder.rotation.x=Math.PI/2;cylinder.position.set(-.56,.64,0);this.tank.add(cylinder);
    for(const z of[-.29,.29]){const band=mesh(new T.TorusGeometry(.195,.017,8,40),this.metal,'Pressure_tank_retaining_band');band.position.set(-.56,.64,z);this.tank.add(band);}
    const valve=mesh(new T.CylinderGeometry(.035,.035,.16,16),this.metal,'Tank_valve');valve.rotation.x=Math.PI/2;valve.position.set(-.56,.64,.65);this.tank.add(valve);
    const copper=new T.MeshStandardMaterial({color:0xbc9870,metalness:.8,roughness:.3});for(const socket of Object.values(this.thrusters)){this.tank.add(tube([V(-.56,.64,.61),V(-.30,.46,.45),V(socket.x,.37,socket.z),socket.clone()],.012,copper,'Illustrative_high_pressure_line'));}
  }
  private nozzles(){this.thrusterHardware.name='Illustrative_four_nozzle_configuration';for(const[name,p]of Object.entries(this.thrusters)){const nozzle=mesh(new T.CylinderGeometry(.055,.088,.12,32,1,true),this.metal,`Teaching_nozzle_${name}`);nozzle.position.copy(p);nozzle.position.y-=.035;this.thrusterHardware.add(nozzle);const throat=mesh(new T.CircleGeometry(.073,32),this.dark,`Nozzle_throat_${name}`);throat.rotation.x=Math.PI/2;throat.position.copy(p);throat.position.y-=.087;this.thrusterHardware.add(throat);}}
  setShellOpacity(opacity:number){const a=clamp(opacity);for(const m of this.shellMaterials){const transparent=a<.999;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.opacity=a*(this.shellBaseOpacity.get(m)??1);m.depthWrite=a>.88;}}
  setWheelSpin(radians:number){for(const w of this.wheels)w.rotation.z=radians;}
  setUnderbodyOpacity(opacity:number){for(const o of this.underbody){const m=o.material as T.MeshStandardMaterial,transparent=opacity<.999;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.opacity=opacity;m.depthWrite=opacity>.85;}}
  setTankVisible(visible:boolean){this.tank.visible=visible;}
  setThrustersVisible(visible:boolean){this.thrusterHardware.visible=visible;}
  dispose(){const gs=new Set<T.BufferGeometry>(),ms=new Set<T.Material>(),ts=new Set<T.Texture>();this.root.traverse(o=>{if(o instanceof T.Mesh){gs.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{ms.add(m);Object.values(m).forEach(v=>{if(v instanceof T.Texture)ts.add(v);});});}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}
}
export function buildCar(){return new Car();}
