import * as T from 'three';

export type RainbowVolumeMode = 'sky' | 'spray' | 'patch';
const VOLUME_NAME = 'observer-centred-rainbow-rain-volume-v09';
const VOLUME_WEIGHTS = [.11, .08, .05, .035, .025] as const;
const CORE_WEIGHT = .70;

const vertexShader = /* glsl */`
  attribute vec3 color;
  varying vec3 vSpectrum;
  varying vec2 vRibbon;
  varying float vOpticalDistance;
  varying float vWorldY;
  uniform vec3 uOpticalOrigin;
  uniform float uDistanceScale;
  void main() {
    vSpectrum = color;
    vRibbon = uv;
    // Moving along an observer ray retains every wavelength's exact angle.
    vec3 samplePosition = uOpticalOrigin + (position-uOpticalOrigin)*uDistanceScale;
    vOpticalDistance = length(samplePosition-uOpticalOrigin);
    vWorldY=(modelMatrix*vec4(samplePosition,1.0)).y;
    gl_Position = projectionMatrix*modelViewMatrix*vec4(samplePosition,1.0);
  }
`;

const fragmentShader = /* glsl */`
  varying vec3 vSpectrum;
  varying vec2 vRibbon;
  varying float vOpticalDistance;
  varying float vWorldY;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uSecondary;
  uniform float uLayerWeight;
  uniform float uVeil;
  uniform float uPatch;
  void main() {
    float x = clamp(vRibbon.x,0.0,1.0);
    float feather = mix(.105,.18,uVeil);
    float edge = smoothstep(0.0,feather,x)*(1.0-smoothstep(1.0-feather,1.0,x));
    // Broad, seamless wet-air density. No random grain or sparkle.
    float phi = vRibbon.y*mix(6.28318530718,.35,uPatch);
    float density = .90 + .060*cos(2.0*phi+uTime*.014)
      + .025*sin(5.0*phi-uTime*.009);
    // Broad coherent haze instead of seven visible wires or grain particles.
    float radialDensity = .78 + .22*exp(-pow(abs((x-.34)/.55),2.0));
    float patchEnds = mix(smoothstep(0.0,1.5,vWorldY),
      smoothstep(0.0,.24,vRibbon.y)*(1.0-smoothstep(.76,1.0,vRibbon.y)),uPatch);
    float gain = mix(1.68,.95,uSecondary);
    float opticalDepth = max(0.0,uOpacity)*uLayerWeight*gain*edge*radialDensity*density*patchEnds;
    // An art-directed thin medium approximation, not a ray-marched volume.
    float extinction = exp(-min(vOpticalDistance*.0018,1.0));
    float alpha = (1.0-exp(-opticalDepth))*extinction;
    vec3 wetAir = vec3(.82,.90,.95);
    // Colour comes only from the computed, linear RGB geometry. In particular,
    // the secondary rainbow is reversed by its angles, never by this shader.
    vec3 radiance = mix(vSpectrum,wetAir,.13+.09*uSecondary+.07*uVeil)*1.12;
    gl_FragColor = vec4(radiance,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Continuous colour on computed angles; subdued light in wet air, no bloom. */
export function atmosphericRainbowMaterial(secondary=false):T.ShaderMaterial {
  const material = new T.ShaderMaterial({
    name:secondary?'secondary-atmosphere-v09':'primary-atmosphere-v09',
    transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,
    vertexColors:false,blending:T.NormalBlending,premultipliedAlpha:false,
    uniforms:{
      uOpacity:{value:secondary?.70:.92},uTime:{value:0},
      uSecondary:{value:secondary?1:0},uLayerWeight:{value:1},
      uVeil:{value:0},uPatch:{value:0},uOpticalOrigin:{value:new T.Vector3()},
      uDistanceScale:{value:1},
    },vertexShader,fragmentShader,
  });
  material.opacity=secondary?.70:.92;
  material.userData.rainbowAtmosphereV09=true;
  return material;
}

/**
 * Five translucent depth samples remain on the same observer rays. Their
 * angular footprint and RGB buffers are untouched. This conveys wet-air depth
 * without claiming participating-medium simulation. Idempotent and geometry
 * sharing: only the cloned materials belong to the attached group.
 */
export function attachAtmosphericRainbowVolume(
  mesh:T.Mesh,opticalOriginLocal:T.Vector3,mode:RainbowVolumeMode='sky',
):T.Group {
  const source=mesh.material as T.ShaderMaterial;
  if(!source.uniforms?.uDistanceScale)throw new Error('Use the V09 atmospheric rainbow material before attaching its volume');
  const old=mesh.children.find(child=>child.name===VOLUME_NAME) as T.Group|undefined;
  const patch=mode==='sky'?0:1;
  source.uniforms.uOpticalOrigin.value.copy(opticalOriginLocal);
  source.uniforms.uPatch.value=patch;
  source.uniforms.uLayerWeight.value=CORE_WEIGHT;
  if(old){
    old.children.forEach(child=>{
      const material=(child as T.Mesh).material as T.ShaderMaterial;
      material.uniforms.uOpticalOrigin.value.copy(opticalOriginLocal);
      material.uniforms.uPatch.value=patch;
    });
    return old;
  }
  const group=new T.Group();group.name=VOLUME_NAME;
  // Only a thin wet-air neighbourhood: wider deltas made five ghost rainbows
  // under the side camera. Every sample remains on the same observer ray.
  const scales=patch?[.997,.999,1.001,1.003,1.005]:[.996,.998,1.0015,1.003,1.005];
  VOLUME_WEIGHTS.forEach((weight,index)=>{
    const material=source.clone();material.name=`rainbow-atmosphere-depth-${index}`;
    material.uniforms.uLayerWeight.value=weight;material.uniforms.uVeil.value=1;
    material.uniforms.uDistanceScale.value=scales[index];
    const layer=new T.Mesh(mesh.geometry,material);layer.frustumCulled=false;
    layer.name=`rainbow-depth-sample-${index}`;
    layer.renderOrder=mesh.renderOrder;
    group.add(layer);
  });
  mesh.add(group);
  return group;
}

/** Absolute frame evaluation supports off-order offline rendering. */
export function updateAtmosphericRainbow(mesh:T.Mesh,frame:number):void {
  const source=mesh.material as T.ShaderMaterial;
  if(!source.uniforms?.uTime)return;
  const time=frame/30;
  source.uniforms.uTime.value=time;
  source.uniforms.uOpacity.value=source.opacity;
  const volume=mesh.children.find(child=>child.name===VOLUME_NAME);
  volume?.children.forEach(child=>{
    const material=(child as T.Mesh).material as T.ShaderMaterial;
    material.uniforms.uTime.value=time;
    material.uniforms.uOpacity.value=source.opacity;
  });
}

/** Dispose only depth-sample materials; the host continues to own geometry. */
export function detachAtmosphericRainbowVolume(mesh:T.Mesh):void {
  const group=mesh.children.find(child=>child.name===VOLUME_NAME);
  if(group){
    group.children.forEach(child=>((child as T.Mesh).material as T.ShaderMaterial).dispose());
    mesh.remove(group);
  }
  const source=mesh.material as T.ShaderMaterial;
  if(source.uniforms?.uLayerWeight)source.uniforms.uLayerWeight.value=1;
}
