import * as T from 'three';
import {WorldV10} from './WorldV10';
import {timeline} from './Timeline';
import {loadWaterProV09} from './WaterProV09';
export {loadWaterProV09};
type Compat=Awaited<ReturnType<typeof loadWaterProV09>>;

/** Natural rain-fed optical demonstration pool. The licensed local adapter
 * provides deterministic Gerstner/capillary waves, actual reflected and
 * refracted scene buffers and dielectric Fresnel; it is visual water, not CFD. */
export class WaterPoolV16 {
  readonly mesh:T.Mesh;readonly group=new T.Group();
  private readonly material:T.ShaderMaterial;
  private readonly solar=new T.Vector3(0,.21,.98).normalize();
  constructor(private compat:Compat,private world:Pick<WorldV10,'nature'|'water'|'waterMaterial'>,
    private renderer:T.WebGLRenderer,private scene:T.Scene,private camera:T.PerspectiveCamera){
    this.group.name='v16-natural-irregular-rain-pool';world.nature.add(this.group);
    this.mesh=compat.create(this.group,{size:4.80,scale:.025,worldScale:1});this.mesh.position.set(-3,.025,3);
    this.material=this.mesh.material as T.ShaderMaterial;
    const boundary=/* glsl */`
uniform vec4 uNaturalPool;
float naturalEdge(float a){return 1.+.083*sin(3.*a+.4)+.045*cos(5.*a-.6)+.026*sin(7.*a+1.3);}
`;
    this.material.fragmentShader=boundary+this.material.fragmentShader
      .replace('void main(){',`void main(){
        vec2 shoreLocal=(vRest-uNaturalPool.xy)/uNaturalPool.zw;
        float edge=naturalEdge(atan(shoreLocal.y,shoreLocal.x));
        float poolRatio=length(shoreLocal)/edge;
        if(poolRatio>1.)discard;
        float naturalShore=1.-smoothstep(.968,1.,poolRatio);`)
      .replace('vec3 clear=exp(-vec3(.17,.055,.035)*thickness),intrinsic=vec3(.015,.105,.125);',
        'vec3 clear=exp(-vec3(.38,.22,.18)*thickness),intrinsic=vec3(.012,.060,.070);')
      .replace('vec3 color=mix(transmitted,reflected,clamp(fresnel,.02,.98));',
        'vec3 color=mix(transmitted*vec3(.34,.78,.80),reflected,clamp(fresnel,.24,.86));color=mix(color,vec3(.012,.085,.100),.26*(1.-poolRatio*.25));')
      .replace('uAlpha*(1.-cutaway*.82)*shoreMask','uAlpha*(1.-cutaway*.82)*shoreMask*naturalShore')
      .replace('#include <encodings_fragment>','#include <colorspace_fragment>');
    // Match the authored Blender bed and graded shore exactly. The irregular
    // edge is the same deterministic function used by build-environment-v16.py
    // (radii 1.57 × 1.34 in world metres); no runtime primitive may cover it.
    this.material.uniforms.uNaturalPool={value:new T.Vector4(-3,3,1.57,1.34)};
    this.material.needsUpdate=true;
    const buffers=this.mesh.userData.waterpro as {target:T.WebGLRenderTarget;refraction:T.WebGLRenderTarget};
    buffers.target.samples=4;buffers.refraction.samples=4;
  }
  setSolarDirection(direction:T.Vector3){
    if(direction.lengthSq()<1e-10||![direction.x,direction.y,direction.z].every(Number.isFinite))throw new Error('Water solar direction must be finite');
    this.solar.copy(direction).normalize();
  }
  /** layerKey makes the reflection buffer distinguish mesh and splat passes. */
  update(frame:number,layerKey='mesh'){
    this.world.water.visible=false;
    const drop=timeline.scenes.find(s=>s.id==='drop')!,back=timeline.scenes.find(s=>s.id==='return')!;
    const active=frame<drop.start+30||frame>=back.start-60;this.group.visible=active;
    if(!active){this.mesh.visible=false;return;}
    this.material.uniforms.uSun.value.copy(this.solar);
    this.material.opacity=Number(this.world.waterMaterial.uniforms.uOpacity.value)*1.08;
    this.mesh.userData.layerKey=layerKey;
    this.compat.update(this.mesh,frame/30,{worldScale:1,displayScale:1,windSpeed:1.8,windDirection:.52,direction:.37,
      waves:[{k:4.3,omega:.93,amplitude:.0060,phase:.3},{k:10.7,omega:1.72,amplitude:.0030,phase:1.7},{k:20.3,omega:2.73,amplitude:.0011,phase:3.9}],bodies:[]});
    this.mesh.visible=this.material.opacity>.03;
    if(this.mesh.visible)this.compat.reflection({renderer:this.renderer,scene:this.scene,camera:this.camera,
      mode:'film',channel:'natural-pool-v16',progress:frame,kind:'rainbow-v16'},this.mesh);
  }
  dispose(){this.compat.dispose(this.mesh);this.mesh.geometry.dispose();this.material.dispose();this.group.removeFromParent();}
}
