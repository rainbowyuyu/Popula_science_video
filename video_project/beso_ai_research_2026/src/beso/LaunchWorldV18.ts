import type {ContinuousInfoV16} from './LaunchWorldV16';
export type ContinuousInfoV18=Omit<ContinuousInfoV16,'phase'>&{phase:'hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';studioMix:number;titlePlacement:'left'|'right'};
type Runtime={ready:Promise<void>;info:ContinuousInfoV18;render:(t:number,b?:boolean)=>Promise<void>;dispose:()=>void};
export class LaunchWorldV18{
 ready:Promise<void>;private instance:Runtime|null=null;private dead=false;
 constructor(canvas:HTMLCanvasElement,base:string){this.ready=(async()=>{const s=window as unknown as {LaunchWorldV18Runtime?:new(c:HTMLCanvasElement,b:string)=>Runtime;v18RuntimeLoad?:Promise<void>};if(!s.LaunchWorldV18Runtime){s.v18RuntimeLoad??=new Promise<void>((resolve,reject)=>{const e=document.createElement('script');e.src=base+'assets/v18/world-webgpu.js';e.onload=()=>resolve();e.onerror=()=>reject(Error('v18 runtime missing'));document.head.appendChild(e)});await s.v18RuntimeLoad;}if(this.dead)return;this.instance=new s.LaunchWorldV18Runtime!(canvas,base);await this.instance.ready;})();}
 get info(){return this.instance!.info;}async render(t:number,blueprint=false){if(!this.dead)await this.instance?.render(t,blueprint);}async renderBlueprint(t:number){await this.render(t,true);}dispose(){this.dead=true;this.instance?.dispose();}
}
