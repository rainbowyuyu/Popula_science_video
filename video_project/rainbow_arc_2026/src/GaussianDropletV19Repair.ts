import {GaussianDropletV15} from './GaussianDropletV15';

/** Same preserved Lux3D centres/covariance; translucent display only. The
 * previous opaque white splats covered the glass during the native handoff. */
export class GaussianDropletV19Repair extends GaussianDropletV15{
  constructor(rows:number[][]){
    super(rows);
    this.material.fragmentShader=`varying vec2 vUv;varying vec3 vColour;varying float vAlpha;
      void main(){float d=dot(vUv,vUv);if(d>9.)discard;
      float a=exp(-.5*d)*vAlpha*.18;if(a<.002)discard;
      vec3 c=vec3(.025,.058,.066)+vColour*vec3(.085,.13,.145);
      gl_FragColor=vec4(c,a);}`;
    this.material.needsUpdate=true;
  }
}
