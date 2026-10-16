import type {ContinuousInfoV16} from './LaunchWorldV16';
export type ContinuousInfoV17=Omit<ContinuousInfoV16,'phase'>&{phase:'hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';studioMix:number;titlePlacement:'left'|'right'};
type Runtime={ready:Promise<void>;info:ContinuousInfoV17;render:(t:number,b?:boolean)=>Promise<void>;dispose:()=>void};
export class LaunchWorldV17{
 ready:Promise<void>;private instance:Runtime|null=null;private dead=false;
 constructor(canvas:HTMLCanvasElement,base:string){this.ready=(async()=>{const s=window as unknown as {LaunchWorldV17Runtime?:new(c:HTMLCanvasElement,b:string)=>Runtime;v17RuntimeLoad?:Promise<void>};if(!s.LaunchWorldV17Runtime){s.v17RuntimeLoad??=new Promise<void>((resolve,reject)=>{const e=document.createElement('script');e.src=base+'assets/v17/world-webgpu.js';e.onload=()=>resolve();e.onerror=()=>reject(Error('v17 runtime missing'));document.head.appendChild(e)});await s.v17RuntimeLoad;}if(this.dead)return;this.instance=new s.LaunchWorldV17Runtime!(canvas,base);await this.instance.ready;})();}
 get info(){return this.instance!.info;}async render(t:number,blueprint=false){if(!this.dead)await this.instance?.render(t,blueprint);}async renderBlueprint(t:number){await this.render(t,true);}dispose(){this.dead=true;this.instance?.dispose();}
}
