/**
 * Small deterministic water surface adapter for the film.
 *
 * It follows the public OVOW WaterProCompat presentation contract: a handful
 * of Gerstner components are evaluated in display space and can be sampled at
 * a floating body's contact point.  This is a WebGL/Remotion presentation
 * layer, not the commercial WaterPro FFT/SSR/WebGPU runtime and not a load
 * solver.  The response data remains the source of the platform motion.
 */
export type WaveComponent={amplitude:number; wavelength:number; direction:number; speed:number; phase?:number};
const TAU=Math.PI*2;
export const WATERPRO_WAVES:WaveComponent[]=[
  {amplitude:.42,wavelength:38,direction:.18,speed:1.08,phase:.2},
  {amplitude:.24,wavelength:19,direction:-.62,speed:1.48,phase:1.7},
  {amplitude:.12,wavelength:9.5,direction:1.18,speed:2.14,phase:3.1},
  {amplitude:.06,wavelength:4.8,direction:-1.42,speed:2.86,phase:4.8},
];
export function gerstnerHeight(x:number,z:number,time:number,waves=WATERPRO_WAVES){
  let y=0;
  for(const w of waves){
    const k=TAU/w.wavelength;
    y+=w.amplitude*Math.sin(k*(x*Math.cos(w.direction)+z*Math.sin(w.direction))-w.speed*time+(w.phase??0));
  }
  return y;
}
export function gerstnerNormal(x:number,z:number,time:number,waves=WATERPRO_WAVES){
  const e=.08;
  const dx=(gerstnerHeight(x+e,z,time,waves)-gerstnerHeight(x-e,z,time,waves))/(2*e);
  const dz=(gerstnerHeight(x,z+e,time,waves)-gerstnerHeight(x,z-e,time,waves))/(2*e);
  return {x:-dx,y:1,z:-dz};
}
