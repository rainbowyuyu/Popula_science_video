import * as T from 'three';
import{RoundedBoxGeometry}from'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import{paperPanel,paperTexture,drawPrintHeader,drawPrintRule,PAPER_FONT,PAPER_SANS,PAPER_MONO}from'./Paper';
import evidence from './crypto-evidence.json';
export{paperTexture,drawPrintHeader,drawPrintRule,PAPER_FONT,PAPER_SANS,PAPER_MONO}from'./Paper';
export const C={ink:'#173c44',teal:'#187e79',mint:'#64afa0',paper:'#f5f1e9',ivory:'#e7e0d2',muted:'#6e807f',yellow:'#efc853',red:'#d96766',blue:'#4c93be',orange:'#df9b53',green:'#87ac69',shared:'#947d65',coral:'#c66454'};
export function material(color:string,roughness=.38,metalness=0){return new T.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:.3,clearcoatRoughness:.25});}
export function mesh(parent:T.Object3D,g:T.BufferGeometry,m:T.Material,p=[0,0,0]){const o=new T.Mesh(g,m);o.position.set(p[0],p[1],p[2]);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
export function box(parent:T.Object3D,w:number,h:number,d:number,color:string,p=[0,0,0],r=.14){return mesh(parent,new RoundedBoxGeometry(w,h,d,5,Math.min(r,w/3,h/3,d/3)),material(color),p);}
export function tube(parent:T.Object3D,points:number[][],color:string,r=.04){const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return mesh(parent,new T.TubeGeometry(path,72,r,10,false),material(color,.3,.15));}
export function canvasTex(w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d')!;draw(ctx);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;return tex;}
export function txt(parent:T.Object3D,text:string,p:number[],w=3,color=C.ink,h=.65){const tex=canvasTex(1024,150,ctx=>{ctx.fillStyle=color;ctx.font=`600 124px ${PAPER_SANS}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,77,990);});const o=mesh(parent,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,transparent:true,toneMapped:false,depthWrite:false}),p);o.castShadow=false;o.receiveShadow=false;return o;}
export function rr(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
export function panel(parent:T.Object3D,w:number,h:number,tex:T.Texture){return paperPanel(parent,w,h,tex);}
export function chip(parent:T.Object3D,color=C.teal){
 const g=new T.Group();
 const body=box(g,1.15,.8,.2,color,[0,0,0],.12);
 Object.assign(body.material,{roughness:.45,metalness:0,clearcoat:.1,clearcoatRoughness:.45});
 const finish=(part:T.Mesh)=>{Object.assign(part.material,{metalness:.75,roughness:.28,clearcoat:.12,clearcoatRoughness:.28});};
 for(let i=0;i<4;i++){finish(box(g,.1,.22,.1,'#c4aa77',[-.4+i*.27,.48,0],.02));finish(box(g,.1,.22,.1,'#c4aa77',[-.4+i*.27,-.48,0],.02));}
 finish(box(g,.42,.34,.025,'#d8c8a0',[0,0,.12],.05));parent.add(g);return g;
}
const cipherPrintRows=[0,4].map(start=>evidence.display.shortCiphertext.split(' ').slice(start,start+4).join(' '));

/** Uncoated editorial print: one margin, two large body lines and a quiet footer. */
export function orderTexture(mode:'plain'|'cipher'|'received'|'failed'='plain'){return paperTexture(1200,680,ctx=>{
 const m=84;drawPrintHeader(ctx,1200,mode==='cipher'?'加密后的订单':mode==='failed'?'这份数据被改过':'生日蛋糕 · 订单备注');drawPrintRule(ctx,160,1200);
 ctx.fillStyle=C.ink;
 if(mode==='cipher'){
  ctx.font=`500 104px ${PAPER_MONO}`;ctx.fillText(cipherPrintRows[0],m,290);ctx.fillText(cipherPrintRows[1],m,410);
  drawPrintRule(ctx,465,1200);
  ctx.fillStyle='#997a46';ctx.font=`500 68px ${PAPER_FONT}`;ctx.fillText('认证标记',m,581);
  ctx.fillStyle=C.ink;ctx.font=`500 82px ${PAPER_MONO}`;ctx.fillText(evidence.display.shortTag,402,581);
 }else if(mode==='failed'){
  ctx.fillStyle=C.coral;ctx.font=`500 120px ${PAPER_MONO}`;ctx.fillText(`${evidence.originalByteHex}  →  ${evidence.modifiedByteHex}`,m,320);
  drawPrintRule(ctx,465,1200);ctx.font=`600 86px ${PAPER_FONT}`;ctx.fillText(evidence.display.failure,m,585);
 }else{
  ctx.font=`600 96px ${PAPER_FONT}`;ctx.fillText('送到幸福路八号',m,292);
  ctx.font=`500 86px ${PAPER_FONT}`;ctx.fillText('别按门铃，我下来拿',m,415);
  drawPrintRule(ctx,480,1200);ctx.fillStyle=C.teal;ctx.font=`500 78px ${PAPER_FONT}`;
  ctx.fillText(mode==='received'?'店家收到同一条备注':'给妈妈的惊喜',m,592);
 }
});}
export function disposeTree(root:T.Object3D){const gs=new Set<T.BufferGeometry>(),ms=new Set<T.Material>(),ts=new Set<T.Texture>();root.traverse(o=>{if(o instanceof T.Mesh){gs.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material])){ms.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)ts.add(v);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());root.removeFromParent();}
