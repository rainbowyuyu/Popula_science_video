import data from './narration.json';
export const timeline=data;
export const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export const ease=(v:number)=>{const x=clamp(v);return x*x*(3-2*x);};
export const sections=[...data.groups.map((g,i)=>({id:g.id,start:i===0?0:g.startSec,end:i+1<data.groups.length?data.groups[i+1].startSec:data.coda.startSec})),{id:'coda',start:data.coda.startSec,end:data.durationSec}];
export function section(id:string){return sections.find(s=>s.id===id)??sections[0];}
export function getSection(t:number){const s=sections.find(s=>t>=s.start&&t<s.end)??sections[sections.length-1];return {...s,u:clamp((t-s.start)/(s.end-s.start))};}
export function cueAt(t:number){return data.cues.find(c=>t>=c.startSec&&t<c.endSec);}
