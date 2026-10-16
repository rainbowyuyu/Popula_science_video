/** Exact CPU mirror of the launch ocean vertex displacement. Illustration
 * only: no force, fluid field or response is inferred from these waves. */
export function cinematicOceanHeight(x:number,z:number,time:number){
  return .94*Math.sin(.038*x+.025*z-time*.72)
    +.38*Math.sin(.089*x-.065*z-time*1.12)
    +.12*Math.sin(.24*x+.12*z-time*1.94);
}
