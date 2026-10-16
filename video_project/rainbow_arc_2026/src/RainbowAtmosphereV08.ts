import * as T from 'three';

/** Appearance only. The surface vertices retain the computed colour angles. */
export function atmosphericRainbowMaterial(secondary=false){
  const m=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
    uniforms:{uOpacity:{value:secondary?.40:.82},uTime:{value:0},uSecondary:{value:secondary?1:0}},
    vertexShader:`attribute vec3 color; varying vec3 vSpectrum; varying vec2 vRibbon; varying vec3 vWorld;
      void main(){vSpectrum=color;vRibbon=uv;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`varying vec3 vSpectrum;varying vec2 vRibbon;varying vec3 vWorld;
      uniform float uOpacity;uniform float uTime;uniform float uSecondary;
      void main(){
        float soft=smoothstep(0.,.105,vRibbon.x)*(1.-smoothstep(.79,1.,vRibbon.x));
        float azimuth=.91+.06*sin(vRibbon.y*18.+uTime*.035)+.03*sin(vRibbon.y*41.-uTime*.016);
        vec3 hue=mix(vSpectrum,vec3(.89,.96,1.),.16+uSecondary*.11);
        float alpha=soft*uOpacity*azimuth;
        gl_FragColor=vec4(hue,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  m.opacity=secondary?.48:.87;return m;
}

export function updateAtmosphericRainbow(mesh:T.Mesh,frame:number){
  const m=mesh.material as T.ShaderMaterial;
  m.uniforms.uOpacity.value=m.opacity;
  m.uniforms.uTime.value=frame/30;
}
