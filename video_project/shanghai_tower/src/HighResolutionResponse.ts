import {clamp} from './visual';
import type {SolverResponse} from './PhysicsPlayback';

type Field={offsetBytes:number;shape:number[];length:number};
type Metadata={schema:string;bytes:number;time:{start:number;end:number;dt:number;count:number};fields:Record<'u'|'r'|'axialMPa',Field>;nodeIds:(string|number)[];memberIds:(string|number)[];binary:string};

/** Views of actual archived OpenSees samples, not a smoother or new solver. */
export class HighResolutionResponse{
 fields:Record<'u'|'r'|'axialMPa',Float32Array>;
 constructor(public metadata:Metadata,buffer:ArrayBuffer){
  if(metadata.schema!=='rainbow.cinematic-response/1'||buffer.byteLength!==metadata.bytes)throw new Error('Incomplete high resolution response');
  this.fields=Object.fromEntries(Object.entries(metadata.fields).map(([k,f])=>[k,new Float32Array(buffer,f.offsetBytes,f.length)])) as typeof this.fields;
 }
 static async load(base:string){
  const meta=await fetch(base+'physics/cinematic-response.json');if(!meta.ok)throw new Error('Missing high resolution metadata');
  const metadata=await meta.json() as Metadata;
  const response=await fetch(base+metadata.binary);if(!response.ok)throw new Error('Missing high resolution response data');
  return new HighResolutionResponse(metadata,await response.arrayBuffer());
 }
 validate(data:SolverResponse){
  for(const [kind,rows]of [['nodeIds',data.nodes],['memberIds',data.members]] as const){
   const ids=this.metadata[kind];if(ids.length!==rows.length||rows.some((r,i)=>r.id!==ids[i]))throw new Error('Solver/render high resolution ID mismatch: '+kind);
  }
 }
 sample(time:number,u:Float32Array,r:Float32Array,stress:Float32Array){
  const {start,dt,count}=this.metadata.time,x=clamp((time-start)/(dt*(count-1)))*(count-1),i=Math.min(count-2,Math.floor(x)),f=x-i;
  const lerp=(field:'u'|'r'|'axialMPa',out:Float32Array)=>{
   const input=this.fields[field],a=i*out.length,b=(i+1)*out.length;
   for(let k=0;k<out.length;k++)out[k]=input[a+k]+(input[b+k]-input[a+k])*f;
  };
  lerp('u',u);lerp('r',r);lerp('axialMPa',stress);
 }
}
