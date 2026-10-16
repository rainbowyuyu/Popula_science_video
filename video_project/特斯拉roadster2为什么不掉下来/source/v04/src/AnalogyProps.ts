/** Human-scale physical analogies. Progress is deterministic 0..1.
 * World owns placement, camera and entrance/exit; these props never teleport.
 */
import * as T from 'three';
export interface MechanismProp {root:T.Group;update:(progress:number)=>void;dispose:()=>void;}
const ease=(x:number)=>{const t=T.MathUtils.clamp(x,0,1);return t*t*(3-2*t);};
const sm=(g:T.BufferGeometry,m:T.Material,n:string)=>{const o=new T.Mesh(g,m);o.name=n;o.castShadow=true;o.receiveShadow=true;return o;};
const cleanup=(root:T.Group)=>()=>{const gs=new Set<T.BufferGeometry>(),ms=new Set<T.Material>();root.traverse(o=>{if(o instanceof T.Mesh){gs.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());};
const mat=(color:number,metalness=0,roughness=.35)=>new T.MeshStandardMaterial({color,metalness,roughness});
function connector(a:T.Vector3,b:T.Vector3,r:number,m:T.Material,name:string){const d=b.clone().sub(a),o=sm(new T.CylinderGeometry(r,r,d.length(),16),m,name);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;}

/** Upright ceramic tile on XY; amber cup seals on its camera-facing +Z side. */
export function createSuctionCup():MechanismProp {
  const root=new T.Group();root.name='Everyday_suction_cup_analogy';
  const ceramic=mat(0xe9e5dc,.10,.23),metal=mat(0x8d9399,.8,.24);
  const tile=sm(new T.BoxGeometry(.88,1.05,.055),ceramic,'Glazed_ceramic_tile');tile.position.z=-.03;root.add(tile);
  const back=sm(new T.BoxGeometry(.94,1.11,.035),metal,'Tile_fine_frame');back.position.z=-.072;root.add(back);
  const amber=new T.MeshPhysicalMaterial({color:0xdf9b3e,roughness:.2,metalness:.05,transmission:.22,transparent:true,opacity:.78,thickness:.06,side:T.DoubleSide,clearcoat:1});
  const points=[new T.Vector2(.035,.30),new T.Vector2(.07,.28),new T.Vector2(.115,.24),new T.Vector2(.18,.17),new T.Vector2(.26,.08),new T.Vector2(.31,.035),new T.Vector2(.325,.022),new T.Vector2(.32,.008),new T.Vector2(.29,.018),new T.Vector2(.235,.06),new T.Vector2(.16,.14),new T.Vector2(.09,.21),new T.Vector2(.035,.24)];
  const cup=new T.Group();cup.name='Flexible_amber_cup';root.add(cup);
  const shell=sm(new T.LatheGeometry(points,80),amber,'Translucent_flexible_skirt');shell.rotation.x=Math.PI/2;cup.add(shell);
  const lip=sm(new T.TorusGeometry(.315,.014,12,72),amber,'Soft_sealing_lip');lip.position.z=.018;cup.add(lip);
  const handle=sm(new T.TorusGeometry(.09,.021,12,40,Math.PI*1.75),metal,'Cup_pull_ring');handle.position.set(0,.02,.31);handle.rotation.y=Math.PI/2;cup.add(handle);
  const air=new T.Group();air.name='Escaping_air';root.add(air);const bubbles:T.Mesh[]=[];
  const bubbleMat=new T.MeshPhysicalMaterial({color:0xb8dce9,transparent:true,opacity:.52,roughness:.1,metalness:.1});
  for(let i=0;i<16;i++){const b=sm(new T.SphereGeometry(.012+(i%3)*.004,10,8),bubbleMat.clone(),'Air_particle');air.add(b);bubbles.push(b);}
  function update(progress:number){const p=ease(progress),press=ease(Math.min(1,p*2));cup.position.z=.13*(1-press);cup.scale.z=1-.46*press;cup.scale.x=cup.scale.y=1+.025*press;
    bubbles.forEach((b,i)=>{const a=i/16*Math.PI*2,r=.20+.42*((p*1.2+i*.037)%1);b.position.set(Math.cos(a)*r,Math.sin(a)*r,.025);(b.material as T.MeshPhysicalMaterial).opacity=.5*(1-ease((p-.55)/.35));});}
  update(0);return{root,update,dispose:cleanup(root)};
}

/** Balloon nozzle points -X, expelled gas -X, body recoils +X. */
export function createBalloon():MechanismProp {
  const root=new T.Group();root.name='Balloon_reaction_analogy';const body=new T.Group();root.add(body);
  const latex=new T.MeshPhysicalMaterial({color:0xdb9a3b,roughness:.29,metalness:.08,clearcoat:1,clearcoatRoughness:.2});
  const balloon=sm(new T.SphereGeometry(1,48,32),latex,'Latex_balloon');balloon.scale.set(.36,.29,.29);body.add(balloon);
  const neck=sm(new T.CylinderGeometry(.044,.019,.11,24),latex,'Open_balloon_neck');neck.rotation.z=Math.PI/2;neck.position.x=-.38;body.add(neck);
  const rim=sm(new T.TorusGeometry(.023,.008,10,32),latex,'Rolled_balloon_rim');rim.rotation.y=Math.PI/2;rim.position.x=-.435;body.add(rim);
  const dark=sm(new T.CircleGeometry(.017,24),mat(0x614725),'Balloon_opening');dark.rotation.y=-Math.PI/2;dark.position.x=-.442;body.add(dark);
  const gas:T.Mesh[]=[];for(let i=0;i<24;i++){const m=new T.MeshBasicMaterial({color:0x8ab5bf,transparent:true,opacity:.35,depthWrite:false});const p=sm(new T.SphereGeometry(.014,8,6),m,'Escaping_gas_particle');root.add(p);gas.push(p);}
  function update(progress:number){const p=T.MathUtils.clamp(progress,0,1),e=ease(p);body.position.x=.66*e;balloon.scale.set(.36*(1-.23*e),.29*(1-.28*e),.29*(1-.28*e));
    gas.forEach((g,i)=>{const q=(p*2+i/24)%1,a=i*2.39996;g.position.set(body.position.x-.44-q*.95,Math.sin(a)*q*.13,Math.cos(a)*q*.13);g.scale.setScalar(1+q*1.6);(g.material as T.MeshBasicMaterial).opacity=.48*(1-q)*Math.sin(Math.PI*Math.min(1,p*3));});}
  update(0);return{root,update,dispose:cleanup(root)};
}

/** Door starts in XY, hinge on local -X. Handle push swings about Y. */
export function createDoor():MechanismProp {
  const root=new T.Group();root.name='Door_torque_analogy';const wood=mat(0x947558,.05,.45),dark=mat(0x3c4146,.65,.28),brass=mat(0xc5a161,.80,.25);
  const frame=new T.Group();root.add(frame);
  for(const x of[-.50,.50]){const f=sm(new T.BoxGeometry(.045,1.36,.075),dark,'Thin_metal_door_jamb');f.position.set(x,.68,0);frame.add(f);}
  const lintel=sm(new T.BoxGeometry(1.045,.045,.075),dark,'Door_lintel');lintel.position.y=1.36;frame.add(lintel);
  const base=sm(new T.BoxGeometry(1.30,.035,.46),mat(0xc3c4bd,.25,.38),'Demonstrator_base');base.position.y=-.025;root.add(base);
  const hinge=new T.Group();hinge.position.set(-.46,0,0);root.add(hinge);
  const panel=sm(new T.BoxGeometry(.91,1.28,.045),wood,'Warm_wood_door_panel');panel.position.set(.455,.675,0);hinge.add(panel);
  // Inset lines suggest joinery without relying on a low-resolution texture.
  const inset=mat(0x68513e,.05,.55);for(const y of[.30,.70,1.10]){const line=sm(new T.BoxGeometry(.76,.007,.003),inset,'Fine_door_inset_line');line.position.set(.455,y,.024);hinge.add(line);}
  for(const y of[.28,1.05]){const h=sm(new T.CylinderGeometry(.022,.022,.13,20),brass,'Visible_hinge');h.position.set(0,y,.014);hinge.add(h);}
  const stem=connector(new T.Vector3(.79,.66,.025),new T.Vector3(.79,.66,.085),.018,brass,'Handle_stem');hinge.add(stem);
  hinge.add(connector(new T.Vector3(.79,.66,.085),new T.Vector3(.66,.66,.085),.014,brass,'Lever_handle'));
  // A restrained contact pad marks the handle force point without extra text.
  const contact=sm(new T.SphereGeometry(.040,20,16),new T.MeshStandardMaterial({color:0xe4b553,emissive:0x9b6a18,emissiveIntensity:.12,roughness:.28}),'Handle_contact_force_point');contact.position.set(.79,.66,.11);hinge.add(contact);
  function update(progress:number){const p=ease(progress);hinge.rotation.y=-p*1.08;contact.scale.setScalar(.85+.15*Math.sin(p*Math.PI));}
  update(0);return{root,update,dispose:cleanup(root)};
}
