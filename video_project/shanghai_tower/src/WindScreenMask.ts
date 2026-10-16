import * as T from 'three';

/**
 * Keep explanatory wind paths away from the editorial chrome (logo, title,
 * readouts and the left stress legend).  This is a fragment-space alpha mask:
 * it only affects wind materials, so it cannot erase or dim the tower itself.
 * The rectangle coordinates are normalized to the 1920x1080 composition and
 * the actual drawing-buffer size is supplied by Three at shader compilation
 * (the film renders at dpr=2, therefore 3840x2160 here).
 */
export function installWindScreenMask(material:T.Material){
 const priorCompile=material.onBeforeCompile;
 const priorKey=material.customProgramCacheKey;
 const compile:T.Material['onBeforeCompile']=function(this:T.Material,shader,renderer){
  priorCompile.call(this,shader,renderer);
  const size=new T.Vector2(3840,2160);
  renderer.getDrawingBufferSize(size);
  const uniform={value:size};
  shader.uniforms.windScreenSize=uniform;
  const guard=`
uniform vec2 windScreenSize;
float windSoftRect(vec2 p, vec4 r, float feather){
  float x = (r.x<=0.0 ? 1.0 : smoothstep(r.x-feather,r.x+feather,p.x)) * (r.z>=1.0 ? 1.0 : 1.0-smoothstep(r.z-feather,r.z+feather,p.x));
  float y = (r.y<=0.0 ? 1.0 : smoothstep(r.y-feather,r.y+feather,p.y)) * (r.w>=1.0 ? 1.0 : 1.0-smoothstep(r.w-feather,r.w+feather,p.y));
  return x*y;
}
float windEditorialAlpha(){
  vec2 p=gl_FragCoord.xy/windScreenSize;
  p.y=1.0-p.y;
  // Keep a broad, soft lane free for the engineering readout and a second
  // cap for the logo. Outside these regions alpha remains unchanged.
  float chart=windSoftRect(p,vec4(0.0,0.09,0.355,0.89),0.014);
  float logo=windSoftRect(p,vec4(0.0,0.0,0.34,0.15),0.014);
  float subtitle=windSoftRect(p,vec4(0.0,0.87,1.0,1.0),0.014);
  return 1.0-clamp(max(chart,max(logo,subtitle)),0.0,1.0);
}
`;
  shader.fragmentShader=guard+shader.fragmentShader;
  const marker='#include <tonemapping_fragment>';
  if(shader.fragmentShader.includes(marker))shader.fragmentShader=shader.fragmentShader.replace(marker,'gl_FragColor.a *= windEditorialAlpha();\n'+marker);
  else shader.fragmentShader=shader.fragmentShader.replace('gl_FragColor =','gl_FragColor.a *= windEditorialAlpha();\n gl_FragColor =');
 };
 const key:T.Material['customProgramCacheKey']=function(this:T.Material){return priorKey.call(this)+'|wind-editorial-screen-mask-v3';};
 material.onBeforeCompile=compile;
 material.customProgramCacheKey=key;
 material.needsUpdate=true;
}
