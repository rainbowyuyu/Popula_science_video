/** V04 visual annotation layer: short, frame-driven labels for the active mechanism. */
import * as M from './ChemistryMechanismsV04';
type Ctx = CanvasRenderingContext2D;
type V2 = [number, number];
export type AnnotationState = {scene: string; elapsed: number; progress: number};

const fade = (p:number,a:number,b:number,f=.07) => M.ease((p-a)/f)*M.ease((b-p)/f);

/** A soft callout: one line, one breathing anchor, one compact label. */
function callout(c:Ctx,label:string,anchor:V2,slot:V2,amount:number,col:string,t:number){
  if(amount<=.002)return;
  const [sx,sy]=slot, dx=sx-anchor[0], dir=dx>=0?1:-1, w=Math.max(112,label.length*23+32), h=36;
  const left=dir>0?sx-6:sx-w+6, end:V2=[dir>0?left:left+w,sy];
  // Keep the label readable over the blue ground while the feathered amount
  // still prevents a hard pop at the semantic cue.
  c.save();c.globalAlpha*=.94*amount;
  M.path(c,[anchor,[anchor[0]+dx*.55,anchor[1]+(sy-anchor[1])*.18],end],col,1.15,.55);
  const pulse=1+.18*Math.sin(t*2.15);M.halo(c,anchor[0],anchor[1],13*pulse,col,.18);M.ball(c,anchor[0],anchor[1],3.5*pulse,col);
  c.fillStyle='rgba(4,17,27,.84)';c.strokeStyle=col;c.lineWidth=1;c.beginPath();c.roundRect(left,sy-h/2,w,h,10);c.fill();c.globalAlpha*=.92;c.stroke();
  M.text(c,label,left+w/2,sy+1,21,M.C.ink,'center',560);c.restore();
}
function rule(c:Ctx,label:string,x:number,y:number,a:number,col:string){if(a<=.002)return;c.save();c.globalAlpha*=.32*a;M.path(c,[[x-110,y],[x+110,y]],col,1,.45);M.text(c,label,x,y-14,18,col,'center',550);c.restore()}

/** Call after the mechanism drawer and before the world clip is restored. */
export function drawInfoAnnotationsV04(c:Ctx,s:AnnotationState){
  const {scene,elapsed:t,progress:p}=s;c.save();c.beginPath();c.rect(112,332,1696,552);c.clip();
  switch(scene){
    case 'catalyst':
      callout(c,'过渡态',[510,520],[245,462],fade(p,.04,.42),M.C.muted,t);
      callout(c,'较低能垒',[617,629],[438,740],fade(p,.28,.73),M.C.gold,t);
      callout(c,'配体环境',[1315,576],[1590,438],fade(p,.42,.86),M.C.cyan,t);
      callout(c,'催化剂回到原位',[1510,692],[1515,820],fade(p,.68,.98),M.C.gold,t);break;
    case 'kagan':
      callout(c,'R 配体池',[285,535],[174,410],fade(p,.04,.34),M.C.gold,t);
      callout(c,'R–R',[875,478],[1088,427],fade(p,.27,.57),M.C.gold,t);
      callout(c,'R–S：近乎失活',[875,640],[1090,682],fade(p,.44,.76),M.C.muted,t);
      callout(c,'S–S',[875,802],[1090,837],fade(p,.58,.92),M.C.cyan,t);
      rule(c,'两两配位后，再看哪些组合能反应',1410,410,fade(p,.34,.96),M.C.ink);break;
    case 'nonlinear':
      callout(c,'16 种等可能组合',[400,600],[220,410],fade(p,.03,.36),M.C.muted,t);
      callout(c,'RS 通路关闭',[580,782],[465,855],fade(p,.20,.53),M.C.rose,t);
      callout(c,'活性池：9 R + 1 S',[1258,555],[1500,415],fade(p,.36,.67),M.C.gold,t);
      callout(c,'ee = 两边占比之差',[502,792],[468,730],fade(p,.56,.91),M.C.gold,t);
      callout(c,'非线性曲线',[620,650],[720,785],fade(p,.75,.99),M.C.gold,t);break;
    case 'soai':
      callout(c,'平面羰基碳',[875,560],[610,420],fade(p,.02,.31),M.C.muted,t);
      callout(c,'四面体手性中心',[965,575],[1115,420],fade(p,.24,.57),M.C.gold,t);
      callout(c,'锌醇盐中间体',[1505,564],[1568,730],fade(p,.40,.76),M.C.cyan,t);
      // Keep this tag above the permanent tetrahedral caption at y≈839.
      callout(c,'水解后得到醇',[1185,675],[1080,748],fade(p,.53,.84),M.C.rose,t);
      callout(c,'催化剂继续工作',[1135,840],[1532,835],fade(p,.70,.99),M.C.cyan,t);break;
    case 'autocatalysis':
      callout(c,'原料进入',[310,528],[205,428],fade(p,.02,.28),M.C.cyan,t);
      callout(c,'新产物',[780,590],[612,420],fade(p,.23,.60),M.C.gold,t);
      callout(c,'加入下一轮',[1260,590],[1520,426],fade(p,.47,.84),M.C.gold,t);
      callout(c,'优势逐轮积累',[1130,755],[1520,820],fade(p,.71,.99),M.C.cyan,t);break;
    case 'result':
      callout(c,'独立补料',[270,600],[184,430],fade(p,.02,.28),M.C.muted,t);
      callout(c,'第 1 轮',[745,570],[745,430],fade(p,.20,.50),M.C.gold,t);
      callout(c,'第 3 轮',[1695,570],[1740,430],fade(p,.61,.91),M.C.gold,t);
      callout(c,'ee > 99.5%',[1220,770],[1220,858],fade(p,.75,.99),M.C.gold,t);break;
    case 'chance':
      callout(c,'37 次独立实验',[620,570],[294,423],fade(p,.02,.42),M.C.ink,t);
      callout(c,'18 次 R',[1265,620],[1510,425],fade(p,.40,.73),M.C.gold,t);
      callout(c,'19 次 S',[1495,740],[1730,822],fade(p,.68,.98),M.C.cyan,t);break;
    case 'frank':
      callout(c,'同类自我促进',[962,572],[960,425],fade(p,.18,.64),M.C.gold,t);
      callout(c,'异类相互抑制',[1515,640],[1690,425],fade(p,.48,.89),M.C.cyan,t);break;
    default:break;
  }
  c.restore();
}
