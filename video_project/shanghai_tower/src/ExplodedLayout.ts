import * as T from 'three';
import {V,pulse} from './visual';

/** Presentation transforms of existing named meshes. Never edits solver
 * coordinates, deforms a joint, or manufactures an unmodelled component. */
export function explodedOffset(id:string,role:string,center:T.Vector3,zone:number,u:number){
 const weight=pulse(2.10,2.72,3.52,4.16,u);
 const result=V();if(weight<=0)return result;
 const core=role==='core',column=/megacolumn|cornercolumn/.test(role);
 const floor=role==='floors'||role==='inspectionfloor',beam=role==='floorbeams';
 const truss=role==='outrigger'||role==='belt'||role==='connection';
 if(!core&&!column&&!floor&&!beam&&!truss)return result;
 const radial=V(center.x,0,center.z);
 const referenceRight=V(-Math.sin(2.42),0,Math.cos(2.42));
 if(radial.lengthSq()<.0001)radial.copy(referenceRight).multiplyScalar(zone%2===0?1:-1);
 radial.normalize();
 // Three rings, with a quiet central wall assembly and a lifted floor fan.
 // Physical neighbouring members share the same principal direction; small
 // chord-level offsets reveal the joints without scattering random fragments.
 // Keep the exploded assembly inside a readable camera envelope. The parts
 // still separate along their structural directions, but no longer dissolve
 // into a distant row of pale blocks during the opening handoff.
 const spread=core?.54:column?1.58:truss?2.18:floor?3.05:2.58;
 result.addScaledVector(radial,spread);
 const level=(zone-1)/8;
 result.y+=(level-.2)*1.08;
 if(core){
  const wall=Number(/_W(\d+)/.exec(id)?.[1]??0);
  result.y+=(wall%2===0?.06:-.06);
 }else if(truss){
  const top=/_OT$|_BT[AB]$/.test(id),bottom=/_OB$|_BB[AB]$/.test(id);
  result.y+=top?.075:bottom?-.075:0;
  if(/_OX|_BX/.test(id))result.addScaledVector(V(-radial.z,0,radial.x),id.includes('X1')?.07:-.07);
 }else if(floor){
  result.y+=id.endsWith('FRONT')?.09:-.09;
 }else if(beam){result.y-=.17;}
 return result.multiplyScalar(weight);
}

/** Four real members of the near-side Z04 outrigger separate before the
 * force close-up, then return fully to their FE/connection coordinates. */
export function outriggerDetailOffset(id:string,u:number){
 if(!/^FE_M_Z04_C03_O(?:B|T|X1|X2)$/.test(id))return V();
 // Spoken order: chords first, diagonals next, return on “合起来以后”.
 const diagonal=/_OX[12]$/.test(id);
 const weight=diagonal?pulse(18.27,18.37,18.66,18.86,u):pulse(18.10,18.22,18.66,18.86,u);
 const offset=V(0,0,-.18);
 if(id.endsWith('_OT'))offset.y=.12;
 if(id.endsWith('_OB'))offset.y=-.12;
 if(id.endsWith('_OX1'))offset.x=.10;
 if(id.endsWith('_OX2'))offset.x=-.10;
 return offset.multiplyScalar(weight);
}

