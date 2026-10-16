import * as T from 'three';
import {staticFile} from 'remotion';
import {WorldV08} from './WorldV08';
import {timeline} from './Timeline';
type Compat={create:(root:T.Group,options:object)=>T.Mesh;update:(mesh:T.Mesh,time:number,options:object)=>void;reflection:(context:object,mesh:T.Mesh)=>void;dispose:(mesh:T.Mesh)=>void;version:string};
let loaded:Promise<Compat>|undefined;
/** Licensed local WebGL adaptation. No FFT/SSR/WebGPU capability is claimed. */
export function loadWaterProV08(){
  if(loaded)return loaded;
  loaded=new Promise<Compat>((resolve,reject)=>{
    const host=window as unknown as {THREE:typeof T;WaterProCompat?:Compat};host.THREE=T;
    if(host.WaterProCompat){resolve(host.WaterProCompat);return;}
    const script=document.createElement('script');script.src=staticFile('assets_v07/vendor-water/waterpro-adapter-v07.min.js');
    script.onload=()=>host.WaterProCompat?resolve(host.WaterProCompat):reject(new Error('WaterPro adaptation loaded without API'));
    script.onerror=()=>reject(new Error('Could not load the licensed WaterPro adaptation'));document.head.appendChild(script);
  });return loaded;
}
export class WaterPoolV08{
  mesh:T.Mesh;group=new T.Group();
  constructor(private compat:Compat,private world:WorldV08,private renderer:T.WebGLRenderer,private scene:T.Scene,private camera:T.PerspectiveCamera){
    this.group.name='waterpro-optical-pool-v06';world.nature.add(this.group);
    this.mesh=compat.create(this.group,{size:3.12,scale:.025,worldScale:1});this.mesh.position.set(-3,.015,3);
    const material=this.mesh.material as T.ShaderMaterial;
    // The supplied renderer has the old Three.js encoding chunk name. The
    // shader change is local integration, with original attribution preserved.
    material.fragmentShader='uniform vec3 uPoolCenter;\n'+material.fragmentShader.replace('void main(){','void main(){float poolRadius=length(vRest-uPoolCenter.xy);if(poolRadius>uPoolCenter.z)discard;').replace('uAlpha*(1.-cutaway*.82)*shoreMask','uAlpha*(1.-cutaway*.82)*shoreMask*(1.-smoothstep(uPoolCenter.z-.065,uPoolCenter.z,poolRadius))').replace('#include <encodings_fragment>','#include <colorspace_fragment>');
    material.uniforms.uPoolCenter={value:new T.Vector3(-3,3,1.43)};material.needsUpdate=true;
    material.fragmentShader=material.fragmentShader
      .replace('float detail=noise', 'small+=normalize(vRest-uPoolCenter.xy+vec2(.0001))*(.018*sin(poolRadius*22.-uTime*2.9)*exp(-poolRadius*.65));float detail=noise')
      .replace('vec3 color=mix(transmitted,reflected,clamp(fresnel,.02,.98));','vec3 color=mix(transmitted,reflected,clamp(fresnel,.02,.98));color=mix(color,vec3(.10,.31,.34),.25);float rippleCrest=pow(.5+.5*sin(poolRadius*22.-uTime*2.9),14.)*smoothstep(.12,.38,poolRadius);color+=vec3(.055,.072,.069)*rippleCrest;');
    // Stay inside the actual masonry opening; overlapping the curved wall
    // caused visible saw-tooth reflection edges in the previous encode.
    const buffers=this.mesh.userData.waterpro as {target:T.WebGLRenderTarget;refraction:T.WebGLRenderTarget};
    buffers.target.samples=4;buffers.refraction.samples=4;
  }
  update(frame:number){
    this.world.water.visible=false;const drop=timeline.scenes.find(s=>s.id==='drop')!,back=timeline.scenes.find(s=>s.id==='return')!;const active=frame<drop.start+30||frame>=back.start-60;this.group.visible=active;if(!active){this.mesh.visible=false;return;}
    const material=this.mesh.material as T.ShaderMaterial;
    material.opacity=Number(this.world.waterMaterial.uniforms.uOpacity.value)*.92;
    this.compat.update(this.mesh,frame/30,{worldScale:1,displayScale:1,windSpeed:1.8,windDirection:.5,direction:.25,
      waves:[{k:6.4,omega:1.5,amplitude:.011,phase:.3},{k:13.9,omega:2.4,amplitude:.005,phase:1.7},{k:24.1,omega:3.3,amplitude:.0022,phase:3.9}],bodies:[]});
    this.mesh.visible=material.opacity>.03;
    if(this.mesh.visible){this.compat.reflection({renderer:this.renderer,scene:this.scene,camera:this.camera,mode:'film',channel:'optical-pool',progress:frame,kind:'rainbow-v06'},this.mesh);}
  }
  dispose(){this.compat.dispose(this.mesh);}
}
