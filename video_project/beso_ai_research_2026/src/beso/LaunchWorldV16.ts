import type {ContinuousInfoV8} from './ContinuousLaunchWorldV8';
export type ContinuousInfoV16=ContinuousInfoV8;
type Runtime={ready:Promise<void>;info:ContinuousInfoV16;render:(t:number,b?:boolean)=>Promise<void>;renderBlueprint:(t:number)=>Promise<void>;dispose:()=>void};
/** Production native WaterPro renderer is isolated with its required Three.js
 * version, so the project's older WebGL compositions remain reproducible. */
export class LaunchWorldV16{
 ready:Promise<void>;private instance:Runtime|null=null;private dead=false;
 constructor(canvas:HTMLCanvasElement,base:string){this.ready=(async()=>{const scope=window as unknown as {LaunchWorldV16Runtime?:new(c:HTMLCanvasElement,b:string)=>Runtime;v16RuntimeLoad?:Promise<void>};
  if(!scope.LaunchWorldV16Runtime){scope.v16RuntimeLoad??=new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src=base+'assets/v16/world-webgpu.js';s.onload=()=>resolve();s.onerror=()=>reject(Error('Native WaterPro runtime load failed'));document.head.appendChild(s)});await scope.v16RuntimeLoad;}
  if(this.dead)return;this.instance=new scope.LaunchWorldV16Runtime!(canvas,base);await this.instance.ready;
 })();}
 get info(){return this.instance!.info;}
 async render(time:number,blueprint=false){if(!this.dead)await this.instance?.render(time,blueprint);}
 async renderBlueprint(time:number){await this.render(time,true);}
 dispose(){this.dead=true;this.instance?.dispose();}
}
export {LaunchWorldV16 as ContinuousLaunchWorldV16};
