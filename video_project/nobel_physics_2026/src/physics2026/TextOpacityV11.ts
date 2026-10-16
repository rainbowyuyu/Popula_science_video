/** Separate explanatory lettering from the continuous object dissolve. */
export function withTextOpacityV11(c:CanvasRenderingContext2D,opacity:number,draw:()=>void){
 const saved=c.fillText;
 const original=saved.bind(c);
 c.fillText=(...args:Parameters<CanvasRenderingContext2D['fillText']>)=>{
  c.save();c.globalAlpha*=Math.max(0,Math.min(1,opacity));
  try{original(...args);}finally{c.restore();}
 };
 try{draw();}finally{c.fillText=saved;}
}
