import * as T from 'three';
import {chapters,smoothstep} from './timeline';
export type MachineAnatomyFocus='whole'|'rotor'|'generator'|'converter'|'cable';
type Entry={object:T.Mesh;materials:T.Material[];base:number[];role:string;blade:boolean;surface:{roughness:number;envMapIntensity:number;clearcoat:number}[]};
function lineage(o:T.Object3D){let s='';for(let p:T.Object3D|null=o;p;p=p.parent)s+=' '+p.name;return s.toLowerCase();}
function classify(o:T.Object3D){const s=lineage(o);if(/bearinghousing|bearingouterring/.test(s))return 'bearingShell';if(/tower/.test(s))return 'tower';if(/nacelleshell/.test(s))return 'shell';if(/generator|magnet|copper|winding|stator/.test(s))return 'generator';if(/powercabinet|converter|rectifier|inverter/.test(s))return 'converter';if(/blade|rotor|hub|shaft|brake|bearing|coupling/.test(s))return 'rotor';return 'other';}
function window(id:string,t:number,r=2.8){const c=chapters.find(x=>x.id===id);return c?smoothstep(c.start-r,c.start+r,t)*(1-smoothstep(c.end-r,c.end+r,t)):0;}
/** The baseline is direct drive: hub, main shaft and PM rotor share one axis.
 * These bearing rollers occupy the actual annular clearance between the shaft
 * and two support housings; they are not a separate enlarged floating diagram. */
function addDrivetrainDetails(model:T.Object3D){
 const existing=model.getObjectByName('DrivetrainServiceDetailV7');if(existing)return {group:existing,rollers:[] as T.Group[]};
 const group=new T.Group();group.name='DrivetrainServiceDetailV7';model.add(group);
 const steel=new T.MeshStandardMaterial({color:'#92a4aa',metalness:.82,roughness:.27}),race=new T.MeshStandardMaterial({color:'#344d56',metalness:.68,roughness:.38}),copper=new T.MeshStandardMaterial({color:'#9b613b',metalness:.76,roughness:.32});
 const rollers:T.Group[]=[];
 for(const x of [7.8,11.1]){
  const cage=new T.Group();cage.name='MainBearingRollerCage';cage.position.set(x,150,0);group.add(cage);rollers.push(cage);
  for(let k=0;k<20;k++){
   const a=k*Math.PI*2/20,roller=new T.Mesh(new T.CylinderGeometry(.115,.115,.58,12),steel);roller.name='MainBearingRoller';roller.rotation.z=Math.PI/2;roller.position.set(0,1.425*Math.cos(a),1.425*Math.sin(a));roller.castShadow=true;cage.add(roller);
  }
  for(const xx of [x-.3,x+.3]){const ring=new T.Mesh(new T.TorusGeometry(1.43,.028,6,48),race);ring.name='MainBearingCageRing';ring.rotation.y=Math.PI/2;ring.position.set(xx,150,0);group.add(ring);}
 }
 // Copper bus conductors start at the stator terminals, following the bedplate
 // into the converter bay. An insulated support every 1.6m gives route/scale.
 for(let phase=0;phase<3;phase++){
  const z=2.85+phase*.20,curve=new T.CatmullRomCurve3([new T.Vector3(-.55,148.1,z),new T.Vector3(-2.1,147.95,z),new T.Vector3(-4.0,147.70,z),new T.Vector3(-7.3,147.70,z)]);
  const wire=new T.Mesh(new T.TubeGeometry(curve,32,.058,8,false),copper);wire.name='ConverterThreePhaseBus_'+phase;wire.castShadow=true;group.add(wire);
 }
 for(let k=0;k<4;k++){const foot=new T.Mesh(new T.BoxGeometry(.10,.16,.85),race);foot.name='ConverterCableSupport';foot.position.set(-2-k*1.65,147.58,3.05);foot.castShadow=true;group.add(foot);}
 group.userData={relationship:'Direct-drive coaxial hub/main-shaft/PM-generator; two main bearings; three-phase route to converter',limit:'Authored explanatory rollers and terminal routing, not manufacturer CAD; cage speed is qualitative'};
 return {group,rollers};
}
export function createMachineAnatomyController(model:T.Object3D){
 const detail=addDrivetrainDetails(model);
 const entries:Entry[]=[];
 model.traverse(o=>{const m=o as T.Mesh;if(!m.isMesh)return;const source=Array.isArray(m.material)?m.material:[m.material];const materials=source.map(x=>x.clone());const blade=/blade/i.test(lineage(o));m.material=Array.isArray(m.material)?materials:materials[0];materials.forEach(x=>{x.transparent=true;x.side=T.FrontSide;if(blade&&(x as T.MeshPhysicalMaterial).isMeshPhysicalMaterial){const physical=x as T.MeshPhysicalMaterial;physical.transmission=0;physical.thickness=0;}});m.renderOrder=2;entries.push({object:m,materials,base:materials.map(x=>x.opacity),role:classify(o),blade,surface:materials.map(x=>({roughness:(x as T.MeshStandardMaterial).roughness??.8,envMapIntensity:(x as T.MeshStandardMaterial).envMapIntensity??1,clearcoat:(x as T.MeshPhysicalMaterial).clearcoat??0}))});});
 const shellParts=['NacelleShellRoof','NacelleShellPort','NacelleShellStarboard'].map((name,i)=>{const object=model.getObjectByName(name);return object?{object,base:object.position.clone(),direction:new T.Vector3(...([[0,7.5,0],[0,1,-7],[0,1,7]][i] as [number,number,number]))}:null;}).filter(Boolean);
 let focus:MachineAnatomyFocus='whole';
 return {
  setFocus(f:MachineAnatomyFocus,_t:number){focus=f;},
  update(t:number){
   const rs=chapters.find(x=>x.id==='rotor')!,gs=chapters.find(x=>x.id==='generator')!,cs=chapters.find(x=>x.id==='converter')!;
   // Keep the complete machine while the camera approaches; reveal begins only
   // after the rotor chapter is established. Never dissolve the distant tower.
   const inside=smoothstep(rs.start+5,rs.start+14,t)*(1-smoothstep(cs.end+1,cs.end+8,t));
   // Shell panels separate along their outward normals before transparency:
   // a diagrammatic service view that retains the intact drivetrain axis.
   const spread=smoothstep(rs.start+4,rs.start+12,t)*(1-smoothstep(cs.end-4,cs.end+8,t));
   shellParts.forEach(p=>{if(p)p.object.position.copy(p.base).addScaledVector(p.direction,spread);});
   detail.rollers.forEach((g,i)=>g.rotation.x=t*.085+i*.16);
   const gw=window('generator',t),cw=window('converter',t),cable=window('cable',t,4);
   // One continuous hold, rather than max(two chapter windows): the old
   // envelopes both dipped to ~0.5 around 205s and made a huge blade white
   // again precisely while it crossed the mechanism. Complete the reveal
   // before the generator handoff and hold it until the camera leaves.
   const bladeGhost=smoothstep(gs.start-5,gs.start-2,t)*(1-smoothstep(cs.end+1,cs.end+8,t));
   for(const e of entries){
    let a=1;
    if(e.role==='shell')a=1-inside*.94;
    if(e.role==='tower')a=1-cable*.30;
    if(e.role==='bearingShell')a=1-inside*window('rotor',t,3)*.76;
    if(e.role==='rotor')a=1-Math.max(gw*.82,cw*.84);
    // The very large blades cross the close-up foreground. Retain a trace of
    // their parent assembly without washing out the copper and bearing details.
    if(e.blade)a=1-bladeGhost*.975;
    if(e.role==='generator'){
     a=1-cw*.72;
     // The steel yoke remains ghosted, with copper and magnets fully visible.
     if(/yoke|outer.*shell|drum/i.test(e.object.name))a*=1-gw*.70;
    }
    if(e.role==='converter')a=1-gw*.65;
    if(e.role==='other')a=1-inside*.50;
    e.object.visible=true;
    e.object.castShadow=a>.96;
    for(let j=0;j<e.materials.length;j++){const m=e.materials[j];m.opacity=e.base[j]*a;m.depthWrite=a>.985;
     if(e.role==='shell'&&(m as T.MeshStandardMaterial).isMeshStandardMaterial){const surface=m as T.MeshStandardMaterial;surface.roughness=T.MathUtils.lerp(e.surface[j].roughness,.85,inside);surface.envMapIntensity=T.MathUtils.lerp(e.surface[j].envMapIntensity,.04,inside);if((surface as T.MeshPhysicalMaterial).isMeshPhysicalMaterial)(surface as T.MeshPhysicalMaterial).clearcoat=T.MathUtils.lerp(e.surface[j].clearcoat,0,inside);}
     if(e.blade&&(m as T.MeshStandardMaterial).isMeshStandardMaterial){const surface=m as T.MeshStandardMaterial;surface.roughness=T.MathUtils.lerp(e.surface[j].roughness,.88,bladeGhost);surface.envMapIntensity=T.MathUtils.lerp(e.surface[j].envMapIntensity,.06,bladeGhost);if((surface as T.MeshPhysicalMaterial).isMeshPhysicalMaterial)(surface as T.MeshPhysicalMaterial).clearcoat=T.MathUtils.lerp(e.surface[j].clearcoat,.0001,bladeGhost);}
    }
   }
  },
  get focus(){return focus;},
  dispose(){entries.forEach(e=>e.materials.forEach(m=>m.dispose()));detail.group.traverse(o=>{const m=o as T.Mesh;if(m.isMesh)m.geometry.dispose();});detail.group.removeFromParent();}
 };
}
