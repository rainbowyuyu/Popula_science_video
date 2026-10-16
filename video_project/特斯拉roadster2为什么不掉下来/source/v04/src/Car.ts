/**
 * 2026 Roadster-inspired angular teaching vehicle, built at metre scale.
 * This is an illustrative silhouette, not a Tesla CAD model. The underbody
 * thruster positions and optional pressure tank are teaching configurations.
 * Coordinate convention: +X front, +Y up, +Z vehicle left. Tyres touch y=0.
 * Usage: const car=buildCar(); scene.add(car.root); car.setWheelSpin(frame*.02);
 */
import * as T from 'three';

export type ThrusterName = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

const smooth = (t:number) => t*t*(3-2*t);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
type Profile=Array<[number,number]>;
function profile(points:Profile,x:number):number {
  if(x<=points[0][0])return points[0][1];
  for(let i=1;i<points.length;i++)if(x<=points[i][0]){
    const a=points[i-1],b=points[i];
    return mix(a[1],b[1],smooth((x-a[0])/(b[0]-a[0])));
  }
  return points[points.length-1][1];
}
const widthProfile:Profile=[[-2.25,.67],[-2.02,.85],[-1.38,.94],[-.6,.91],[.5,.90],[1.35,.93],[1.85,.85],[2.25,.65]];
const heightProfile:Profile=[[-2.25,.64],[-1.98,.77],[-1.4,.83],[-.72,.81],[.40,.82],[1.25,.79],[1.85,.69],[2.25,.55]];
const halfWidth=(x:number)=>profile(widthProfile,x);
const deckHeight=(x:number)=>profile(heightProfile,x);
const wheelX=[1.40,-1.42];
function lowerEdge(x:number):number {
  for(const cx of wheelX){const dx=x-cx;if(Math.abs(dx)<.398)return .335+Math.sqrt(.398*.398-dx*dx);}
  return .265;
}

function mesh(geometry:T.BufferGeometry,material:T.Material,name:string):T.Mesh {
  const m=new T.Mesh(geometry,material);m.name=name;m.castShadow=true;m.receiveShadow=true;return m;
}
function roundedBox(w:number,h:number,d:number,r=.025,segments=4):T.BufferGeometry {
  // Bevelled extruded profile gives small parts highlights instead of razor edges.
  const shape=new T.Shape(),x=-w/2,y=-h/2;
  r=Math.min(r,w*.45,h*.45,d*.45);
  shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);
  shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);
  shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
  const geo=new T.ExtrudeGeometry(shape,{depth:Math.max(.001,d-r*2),bevelEnabled:true,bevelSegments:segments,steps:1,bevelSize:r*.65,bevelThickness:r,curveSegments:8});
  geo.translate(0,0,-d/2+r);geo.computeVertexNormals();return geo;
}
function gridGeometry(nx:number,ny:number,sample:(i:number,j:number)=>T.Vector3):T.BufferGeometry {
  const pos:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++){const p=sample(i/nx,j/ny);pos.push(p.x,p.y,p.z);uv.push(i/nx,j/ny);}
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const a=i*(ny+1)+j,b=a+ny+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function curveTube(points:T.Vector3[],radius:number,material:T.Material,name:string,segments=64):T.Mesh {
  return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),segments,radius,8,false),material,name);
}
function bar(a:T.Vector3,b:T.Vector3,r:number,material:T.Material,name:string):T.Mesh {
  const d=b.clone().sub(a),m=mesh(new T.CylinderGeometry(r,r,d.length(),12),material,name);
  m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return m;
}

export class Car {
  readonly root=new T.Group();
  readonly wheels:T.Group[]=[];
  readonly shell:T.Mesh[]=[];
  readonly tank=new T.Group();
  readonly thrusterHardware=new T.Group();
  readonly underbody:T.Mesh[]=[];
  readonly thrusters:Record<ThrusterName,T.Vector3>={
    frontLeft:new T.Vector3(1.45,.255,.69),frontRight:new T.Vector3(1.45,.255,-.69),
    rearLeft:new T.Vector3(-1.45,.255,.69),rearRight:new T.Vector3(-1.45,.255,-.69),
  };
  readonly dimensions={length:4.5,width:2.0,height:1.21,wheelbase:2.82};
  private readonly paint:T.MeshPhysicalMaterial;
  private readonly glass:T.MeshPhysicalMaterial;
  private readonly dark:T.MeshStandardMaterial;
  private readonly metal:T.MeshStandardMaterial;
  private readonly shellMaterials:T.Material[]=[];

  constructor(){
    this.root.name='Illustrative_Roadster_Metre_Scale';
    this.root.userData={source:'Procedural teaching model',units:'m',authenticCAD:false,configuration:'Four underside nozzles: illustrative only'};
    this.paint=new T.MeshPhysicalMaterial({color:0xa7a6a2,metalness:.78,roughness:.29,clearcoat:.8,clearcoatRoughness:.18,side:T.DoubleSide});
    this.glass=new T.MeshPhysicalMaterial({color:0x172d36,metalness:.25,roughness:.13,transparent:true,opacity:.88,clearcoat:1,clearcoatRoughness:.12,side:T.DoubleSide});
    this.dark=new T.MeshStandardMaterial({color:0x10161c,metalness:.45,roughness:.35});
    this.metal=new T.MeshStandardMaterial({color:0xadb8c5,metalness:.91,roughness:.23});
    this.buildBody();this.buildCanopy();this.buildWheels();this.buildDetails();this.buildTank();this.buildThrusters();
    this.root.add(this.tank,this.thrusterHardware);this.tank.visible=false;
    this.thrusterHardware.visible=false;
  }

  private addShell(m:T.Mesh){this.shell.push(m);this.root.add(m);if(!this.shellMaterials.includes(m.material as T.Material))this.shellMaterials.push(m.material as T.Material);return m;}

  private buildBody(){
    // A smooth lofted upper body, then curved side sheets with wheel openings.
    const deck=mesh(gridGeometry(160,48,(u,v)=>{
      const x=mix(-2.25,2.25,u),t=v*2-1;
      const at=Math.abs(t),shoulder=at<.63?0:(at<.80?(at-.63)/.17:(1-at)/.20);
      const facet=.075*shoulder*(x>.5?1:.35)-.085*Math.max(0,(at-.80)/.20);
      return new T.Vector3(x,deckHeight(x)+facet,halfWidth(x)*t);
    }),this.paint,'Sculpted_continuous_upper_body');this.addShell(deck);
    for(const side of[-1,1]){
      const panel=mesh(gridGeometry(240,16,(u,v)=>{
        const x=mix(-2.25,2.25,u),top=deckHeight(x)-.085,bottom=Math.min(top-.025,lowerEdge(x));
        const y=mix(top,bottom,v),z=side*(halfWidth(x)-.035*Math.sin(v*Math.PI*.85));
        return new T.Vector3(x,y,z);
      }),this.paint,`${side>0?'Left':'Right'}_fender_side_with_arch_openings`);this.addShell(panel);
      for(const cx of wheelX){
        const points=[];
        for(let i=0;i<=48;i++){const theta=Math.PI*i/48,x=cx+.400*Math.cos(theta);points.push(new T.Vector3(x,.335+.400*Math.sin(theta),side*(halfWidth(x)+.005)));}
        this.addShell(curveTube(points,.014,this.paint,'Rolled_fender_arch_lip'));
        const wellMat=new T.MeshStandardMaterial({color:0x111419,roughness:.98,side:T.DoubleSide});
        const well=mesh(gridGeometry(48,8,(u,v)=>{const theta=Math.PI*u;return new T.Vector3(cx+.391*Math.cos(theta),.335+.391*Math.sin(theta),side*mix(.64,.90,v));}),wellMat,'Dark_recessed_wheel_well');this.root.add(well);
      }
      // Sill stays between the wheel arches, never crosses the open tyres.
      this.root.add(curveTube([new T.Vector3(-.99,.285,side*.88),new T.Vector3(-.7,.245,side*.91),new T.Vector3(.35,.245,side*.91),new T.Vector3(.97,.285,side*.88)],.034,this.dark,'Carbon_side_sill'));
    }
    for(const end of[-1,1]){
      const x=end*2.25;
      this.addShell(mesh(gridGeometry(32,10,(u,v)=>{const t=u*2-1;return new T.Vector3(x, mix(deckHeight(x)-.085*Math.pow(Math.abs(t),3.8),.30,v),halfWidth(x)*t);}),this.paint,end>0?'Sculpted_nose':'Sculpted_rear_fascia'));
    }
    const floor=mesh(roundedBox(3.78,.075,1.45,.027),this.dark.clone(),'Underbody_flat_floor');floor.position.set(0,.285,0);this.root.add(floor);this.underbody.push(floor);
    // Precise fitted seams are geometric ink lines, not image textures.
    const seamMat=new T.MeshStandardMaterial({color:0x43484d,roughness:.7});
    for(const side of[-1,1]){
      this.root.add(curveTube([new T.Vector3(.43,.818,side*.60),new T.Vector3(1.03,.795,side*.57),new T.Vector3(1.68,.726,side*.55),new T.Vector3(1.98,.651,side*.49)],.0038,seamMat,'Hood_panel_gap'));
      this.root.add(curveTube([new T.Vector3(.61,.779,side*.895),new T.Vector3(.50,.57,side*.888),new T.Vector3(.46,.37,side*.881),new T.Vector3(-.77,.37,side*.887),new T.Vector3(-.91,.58,side*.907),new T.Vector3(-.86,.779,side*.922)],.004,seamMat,'Door_panel_gap'));
      const handle=mesh(roundedBox(.17,.018,.016,.006),this.dark,'Flush_door_handle');handle.position.set(-.63,.698,side*.917);this.root.add(handle);
    }
  }

  private buildCanopy(){
    const top:Profile=[[-1.05,.83],[-.83,1.055],[-.53,1.18],[-.08,1.205],[.24,1.165],[.63,.84]];
    const wide:Profile=[[-1.05,.51],[-.83,.60],[-.53,.62],[-.08,.61],[.24,.58],[.63,.58]];
    const canopy=mesh(gridGeometry(72,40,(u,v)=>{
      const x=mix(-1.05,.63,u),t=v*2-1,h=profile(top,x),w=profile(wide,x);
      const at=Math.abs(t),cross=at<.64?1-.055*at:Math.max(0,(1-at)/.36)*.965;
      return new T.Vector3(x,.825+(h-.825)*cross,w*t);
    }),this.glass,'Curved_smoked_glass_canopy');this.addShell(canopy);
    const trim=new T.MeshStandardMaterial({color:0x182027,metalness:.72,roughness:.28});
    // Slender glass framing follows the same surface coordinates.
    for(const side of[-1,1]){
      this.root.add(curveTube([new T.Vector3(-1.05,.835,side*.51),new T.Vector3(-.83,.85,side*.60),new T.Vector3(-.25,.85,side*.615),new T.Vector3(.28,.846,side*.583),new T.Vector3(.63,.835,side*.58)],.016,this.paint,'Lower_canopy_red_rail'));
      this.root.add(curveTube([new T.Vector3(.63,.843,side*.58),new T.Vector3(.45,1.01,side*.49),new T.Vector3(.24,1.168,side*.33)],.018,trim,'Windshield_A_pillar'));
      this.root.add(curveTube([new T.Vector3(-1.05,.845,side*.51),new T.Vector3(-.85,1.05,side*.43),new T.Vector3(-.56,1.17,side*.30)],.017,this.paint,'Rear_canopy_pillar'));
      // Side mirrors: narrow painted shells on metallic stalks.
      this.root.add(bar(new T.Vector3(.33,.86,side*.62),new T.Vector3(.30,.88,side*.91),.015,trim,'Mirror_arm'));
      const mirror=mesh(new T.SphereGeometry(1,24,16),this.paint,'Aerodynamic_mirror_shell');mirror.scale.set(.13,.055,.08);mirror.position.set(.28,.89,side*.94);this.root.add(mirror);
      const face=mesh(new T.SphereGeometry(1,20,12),this.metal,'Mirror_glass');face.scale.set(.008,.040,.061);face.position.set(.17,.89,side*.94);this.root.add(face);
    }
    // Upper windscreen border and dark roof spine give coherent reflections.
    const cross=[];for(let i=0;i<=24;i++){const t=i/12-1,at=Math.abs(t),c=at<.64?1-.055*at:Math.max(0,(1-at)/.36)*.965;cross.push(new T.Vector3(.24,.825+.34*c,.58*t));}
    this.root.add(curveTube(cross,.012,trim,'Windscreen_upper_frame'));
    const cabin=new T.Group();cabin.name='Interior_under_glass';
    for(const side of[-1,1]){
      const seatMat=new T.MeshStandardMaterial({color:0x272a2f,roughness:.85});
      const seat=mesh(roundedBox(.43,.38,.43,.065),seatMat,'Sculpted_bucket_seat_back');seat.position.set(-.36,.78,side*.31);seat.rotation.z=-.17;cabin.add(seat);
      const base=mesh(roundedBox(.48,.10,.43,.04),seatMat,'Seat_cushion');base.position.set(-.15,.55,side*.31);cabin.add(base);
      const head=mesh(roundedBox(.13,.16,.25,.04),seatMat,'Head_restraint');head.position.set(-.43,1.015,side*.31);cabin.add(head);
    }
    const dash=mesh(roundedBox(.21,.15,1.12,.04),this.dark,'Dashboard');dash.position.set(.39,.79,0);cabin.add(dash);
    const steering=mesh(new T.TorusGeometry(.13,.014,8,32),trim,'Steering_wheel');steering.rotation.y=Math.PI/2;steering.rotation.z=-.35;steering.position.set(.17,.84,.31);cabin.add(steering);
    this.root.add(cabin);
  }

  private buildWheels(){
    const rubber=new T.MeshStandardMaterial({color:0x121419,roughness:.91,metalness:.03});
    const sidewall=new T.MeshStandardMaterial({color:0x202329,roughness:.78});
    const wheelBlack=new T.MeshStandardMaterial({color:0x1b2028,roughness:.3,metalness:.78});
    const discMat=new T.MeshStandardMaterial({color:0x70767a,roughness:.57,metalness:.86});
    const treadMat=new T.MeshStandardMaterial({color:0x080b0e,roughness:.97});
    for(const x of wheelX)for(const side of[1,-1]){
      const g=new T.Group();g.name=`${x>0?'Front':'Rear'}_${side>0?'Left':'Right'}_wheel`;g.position.set(x,.335,side*.865);this.wheels.push(g);this.root.add(g);
      // Revolved profile makes a rounded tyre with a realistic square shoulder.
      const tyrePoints=[new T.Vector2(.230,-.105),new T.Vector2(.286,-.115),new T.Vector2(.322,-.099),new T.Vector2(.334,-.064),new T.Vector2(.335,.064),new T.Vector2(.322,.099),new T.Vector2(.286,.115),new T.Vector2(.230,.105)];
      const tyre=mesh(new T.LatheGeometry(tyrePoints,64),rubber,'Rounded_rubber_tyre');tyre.rotation.x=Math.PI/2;g.add(tyre);
      for(const z of[-.105,.105]){
        const ring=mesh(new T.TorusGeometry(.278,.003,6,64),sidewall,'Moulded_tyre_sidewall_ring');ring.position.z=z;g.add(ring);
      }
      // Shallow oblique tread cuts are dark geometry in the rubber, fixed seed-free.
      for(let i=0;i<44;i++){
        const a=i*Math.PI*2/44;
        const tread=mesh(roundedBox(.014,.001,.13,.0004),treadMat,'Tyre_tread_groove');tread.position.set(.3335*Math.cos(a),.3335*Math.sin(a),0);tread.rotation.z=a-Math.PI/2;tread.rotation.y=(i%2===0?1:-1)*.18;g.add(tread);
      }
      const barrel=mesh(new T.CylinderGeometry(.242,.242,.18,64,1,true),wheelBlack,'Rim_inner_barrel');barrel.rotation.x=Math.PI/2;g.add(barrel);
      const outerZ=side*.113;
      const lip=mesh(new T.TorusGeometry(.238,.010,8,64),this.metal,'Machined_rim_lip');lip.position.z=outerZ;g.add(lip);
      const disc=mesh(new T.CylinderGeometry(.196,.196,.016,64),discMat,'Ventilated_brake_rotor');disc.rotation.x=Math.PI/2;disc.position.z=side*.047;g.add(disc);
      for(let i=0;i<24;i++){
        const a=i*Math.PI*2/24;
        const hole=mesh(new T.CircleGeometry(.0065,7),wheelBlack,'Rotor_drill_hole');hole.position.set(Math.cos(a)*.16,Math.sin(a)*.16,side*.057);if(side<0)hole.rotation.y=Math.PI;g.add(hole);
      }
      for(let s=0;s<5;s++)for(const split of[-1,1]){
        const a=s*Math.PI*2/5+split*.085;
        const a0=new T.Vector3(Math.cos(a)*.058,Math.sin(a)*.058,outerZ);
        const a1=new T.Vector3(Math.cos(a+split*.10)*.221,Math.sin(a+split*.10)*.221,outerZ-.012*side);
        const spoke=bar(a0,a1,.014,this.metal,'Split_forged_alloy_spoke');g.add(spoke);
      }
      const hub=mesh(new T.CylinderGeometry(.058,.058,.031,32),wheelBlack,'Wheel_hub');hub.rotation.x=Math.PI/2;hub.position.z=outerZ;g.add(hub);
      const cap=mesh(new T.CylinderGeometry(.030,.030,.006,32),this.metal,'Plain_unbranded_center_cap');cap.rotation.x=Math.PI/2;cap.position.z=outerZ+side*.018;g.add(cap);
      for(let n=0;n<5;n++){const a=n*Math.PI*2/5;const bolt=mesh(new T.SphereGeometry(.007,8,6),this.metal,'Wheel_lug');bolt.position.set(Math.cos(a)*.043,Math.sin(a)*.043,outerZ+side*.017);g.add(bolt);}
      // Caliper belongs to chassis, so spinning wheels do not spin the brake.
      const caliper=mesh(roundedBox(.055,.145,.050,.015),new T.MeshStandardMaterial({color:0xc82a30,metalness:.4,roughness:.4}),'Fixed_red_brake_caliper');caliper.position.set(x+.158,.37,side*.931);this.root.add(caliper);
    }
  }

  private buildDetails(){
    const light=new T.MeshStandardMaterial({color:0xf1faff,emissive:0xb8dfff,emissiveIntensity:2.2,roughness:.2});
    const rearLight=new T.MeshStandardMaterial({color:0xff3043,emissive:0xff0a20,emissiveIntensity:1.8,roughness:.24});
    const recess=new T.MeshStandardMaterial({color:0x080d13,metalness:.25,roughness:.52});
    for(const side of[-1,1]){
      // Triangular lamp pockets and sharp leading shoulders echo the 2026 reveal.
      const triangle=new T.BufferGeometry();triangle.setAttribute('position',new T.Float32BufferAttribute([2.10,.576,side*.46,1.87,.744,side*.69,1.76,.721,side*.81],3));triangle.setIndex([0,1,2]);triangle.computeVertexNormals();
      const lampHousing=mesh(triangle,recess.clone(),'Triangular_headlamp_pocket');(lampHousing.material as T.MeshStandardMaterial).side=T.DoubleSide;this.root.add(lampHousing);
      const ledPts=[new T.Vector3(1.88,.749,side*.685),new T.Vector3(1.82,.738,side*.747),new T.Vector3(1.76,.726,side*.807)];
      this.root.add(curveTube(ledPts,.009,light,'Triangular_LED_upper_edge'));
      for(let i=0;i<4;i++){const lens=mesh(new T.SphereGeometry(.013,10,8),light,'Individual_projector_lens');lens.scale.set(1,.7,1);lens.position.set(1.90+i*.027,.722-i*.021,side*(.68-i*.028));this.root.add(lens);}
      const tail=[new T.Vector3(-2.256,.60,side*.10),new T.Vector3(-2.26,.60,side*.52),new T.Vector3(-2.17,.65,side*.73),new T.Vector3(-1.99,.70,side*.84)];
      this.root.add(curveTube(tail,.024,recess,'Tail_light_surround'));
      this.root.add(curveTube(tail.map(p=>p.clone().add(new T.Vector3(-.008,.004,0))),.009,rearLight,'Slim_rear_LED'));
      // Side vent is tucked below shoulder between cockpit and rear wheel.
      const vent=mesh(roundedBox(.24,.08,.018,.025),recess,'Side_cooling_inlet');vent.position.set(-.91,.55,side*.912);vent.rotation.z=-.2;this.root.add(vent);
      for(let n=0;n<3;n++){const slat=mesh(roundedBox(.16,.009,.012,.003),this.dark,'Side_vent_louvre');slat.position.set(-.91,.53+n*.022,side*.923);slat.rotation.z=-.2;this.root.add(slat);}
    }
    this.root.add(curveTube([new T.Vector3(2.25,.34,-.61),new T.Vector3(2.29,.31,0),new T.Vector3(2.25,.34,.61)],.033,this.dark,'Front_carbon_splitter'));
    this.root.add(bar(new T.Vector3(2.263,.553,-.43),new T.Vector3(2.263,.553,.43),.008,this.metal,'Precise_hood_leading_edge'));
    this.root.add(bar(new T.Vector3(-2.271,.610,-.60),new T.Vector3(-2.271,.610,.60),.009,rearLight,'Full_width_rear_light_bar'));
    const intake=mesh(roundedBox(.035,.095,1.11,.018),recess,'Lower_nose_air_intake');intake.position.set(2.264,.405,0);this.root.add(intake);
    for(let i=-6;i<=6;i++){const fin=mesh(roundedBox(.018,.060,.009,.003),this.dark,'Nose_intake_vertical_fin');fin.position.set(2.29,.403,i*.075);this.root.add(fin);}
    const diffuser=mesh(roundedBox(.30,.075,1.38,.025),this.dark,'Rear_diffuser');diffuser.position.set(-2.14,.285,0);diffuser.rotation.z=-.10;this.root.add(diffuser);
    for(let i=-2;i<=2;i++){const fin=mesh(roundedBox(.35,.115,.016,.006),this.dark,'Rear_diffuser_vertical_strake');fin.position.set(-2.09,.287,i*.25);fin.rotation.z=-.13;this.root.add(fin);}
    const lip=mesh(roundedBox(.13,.028,1.43,.009),this.paint,'Integrated_rear_deck_lip');lip.position.set(-1.95,.789,0);lip.rotation.z=-.10;this.root.add(lip);
  }

  private buildTank(){
    this.tank.name='Illustrative_compressed_gas_tank';this.tank.userData={evidence:'illustrative',note:'Not Tesla hardware specification'};
    const bodyMat=new T.MeshStandardMaterial({color:0x405464,metalness:.8,roughness:.34});
    const cylinder=mesh(new T.CapsuleGeometry(.19,.76,12,36),bodyMat,'Pressure_vessel_capsule');cylinder.rotation.x=Math.PI/2;cylinder.position.set(-.56,.64,0);this.tank.add(cylinder);
    for(const z of[-.29,.29]){const band=mesh(new T.TorusGeometry(.195,.017,8,40),this.metal,'Pressure_tank_retaining_band');band.position.set(-.56,.64,z);this.tank.add(band);}
    const valve=mesh(new T.CylinderGeometry(.035,.035,.16,16),this.metal,'Tank_valve');valve.rotation.x=Math.PI/2;valve.position.set(-.56,.64,.65);this.tank.add(valve);
    const copper=new T.MeshStandardMaterial({color:0xbc9870,metalness:.8,roughness:.3});
    for(const socket of Object.values(this.thrusters)){
      const points=[new T.Vector3(-.56,.64,.61),new T.Vector3(-.30,.46,.45),new T.Vector3(socket.x,.37,socket.z),socket.clone()];
      this.tank.add(curveTube(points,.014,copper,'Illustrative_high_pressure_line'));
    }
  }

  private buildThrusters(){
    this.thrusterHardware.name='Illustrative_four_nozzle_configuration';
    for(const [name,p]of Object.entries(this.thrusters)){
      const nozzle=mesh(new T.CylinderGeometry(.055,.088,.12,32,1,true),this.metal,`Teaching_nozzle_${name}`);nozzle.position.copy(p);nozzle.position.y-=.035;this.thrusterHardware.add(nozzle);
      const darkInterior=mesh(new T.CircleGeometry(.073,32),this.dark,`Nozzle_throat_${name}`);darkInterior.rotation.x=Math.PI/2;darkInterior.position.copy(p);darkInterior.position.y-=.087;this.thrusterHardware.add(darkInterior);
    }
  }

  /** Smooth alpha is intended for technical inspection; original materials retained. */
  setShellOpacity(opacity:number){
    const a=T.MathUtils.clamp(opacity,0,1);
    for(const material of this.shellMaterials){
      const m=material as T.MeshPhysicalMaterial,transparent=a<.999||m===this.glass;
      if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}
      m.opacity=a*(m===this.glass?.88:1);m.depthWrite=a>.85;
    }
  }
  setWheelSpin(radians:number){for(const w of this.wheels)w.rotation.z=radians;}
  setUnderbodyOpacity(opacity:number){for(const o of this.underbody){const m=o.material as T.MeshStandardMaterial,transparent=opacity<.999;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.opacity=opacity;m.depthWrite=opacity>.85;}}
  setTankVisible(visible:boolean){this.tank.visible=visible;}
  setThrustersVisible(visible:boolean){this.thrusterHardware.visible=visible;}
  dispose(){
    const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
    this.root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>materials.add(m));}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
}
export function buildCar(){return new Car();}
