import {C, paperTexture, drawPrintHeader, drawPrintRule, PAPER_FONT, PAPER_SANS, PAPER_MONO} from './Design';
import evidence from './crypto-evidence.json';

const MARGIN=84;
const cipherRows=[0,4].map(start=>evidence.display.shortCiphertext.split(' ').slice(start,start+4).join(' '));

export function observerTexture(plain:boolean){
  return paperTexture(1200,680,ctx=>{
    drawPrintHeader(ctx,1200,'线路旁的抄件');
    drawPrintRule(ctx,160,1200);
    ctx.fillStyle=C.ink;ctx.font=`600 ${plain?96:104}px ${plain?PAPER_FONT:PAPER_MONO}`;
    ctx.fillText(plain?'送到幸福路八号':cipherRows[0],MARGIN,292);
    ctx.font=`500 ${plain?86:104}px ${plain?PAPER_FONT:PAPER_MONO}`;
    ctx.fillText(plain?'别按门铃，我下来拿':cipherRows[1],MARGIN,415);
    drawPrintRule(ctx,465,1200);
    ctx.fillStyle=C.teal;ctx.font=`500 78px ${PAPER_FONT}`;
    ctx.fillText(plain?'地址可以直接读懂':'密文，读不出备注',MARGIN,585);
  });
}

export function certificateTexture(stage:number){
  return paperTexture(1200,925,ctx=>{
    drawPrintHeader(ctx,1200,'网站身份证书');
    drawPrintRule(ctx,160,1200);
    ctx.fillStyle=C.ink;ctx.font=`600 86px ${PAPER_SANS}`;ctx.fillText('cake.example',MARGIN,280);
    drawPrintRule(ctx,335,1200);
    const rows=['可信签发者','网址一致','持有身份私钥'];
    for(let i=0;i<3;i++){
      const checked=stage>i,y=449+i*128;
      ctx.strokeStyle=checked?C.teal:'#a9aca1';ctx.lineWidth=2.5;
      ctx.strokeRect(MARGIN,y-43,44,44);
      if(checked){ctx.save();ctx.strokeStyle=C.teal;ctx.lineWidth=5;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(MARGIN+8,y-22);ctx.lineTo(MARGIN+20,y-10);ctx.lineTo(MARGIN+39,y-36);ctx.stroke();ctx.restore();}
      ctx.fillStyle=checked?C.ink:'#76847c';ctx.font=`500 72px ${PAPER_FONT}`;ctx.fillText(rows[i],164,y);
    }
    drawPrintRule(ctx,759,1200);
    ctx.fillStyle=C.teal;ctx.font=`500 72px ${PAPER_FONT}`;
    ctx.fillText(stage>=4?'身份核验完成':'浏览器正在核对',MARGIN,855);
  });
}

export function fakeCertificateTexture(){
  return paperTexture(960,660,ctx=>{
    drawPrintHeader(ctx,960,'证书复印件');
    drawPrintRule(ctx,146,960);
    ctx.fillStyle=C.ink;ctx.font=`600 78px ${PAPER_FONT}`;ctx.fillText('缺少身份私钥',960*.07,302);
    drawPrintRule(ctx,390,960);
    ctx.fillStyle=C.coral;ctx.font=`500 72px ${PAPER_FONT}`;ctx.fillText('身份验证失败',960*.07,520);
  });
}

export function tamperTexture(stage:number){
  return paperTexture(1200,680,ctx=>{
    drawPrintHeader(ctx,1200,'数据核验单');
    drawPrintRule(ctx,160,1200);
    ctx.fillStyle=C.coral;ctx.font=`500 112px ${PAPER_MONO}`;ctx.fillText(`${evidence.originalByteHex}  →  ${evidence.modifiedByteHex}`,MARGIN,290);
    ctx.fillStyle='#997a46';ctx.font=`500 72px ${PAPER_FONT}`;ctx.fillText('原标记',MARGIN,410);
    ctx.fillStyle=C.ink;ctx.font=`500 82px ${PAPER_MONO}`;ctx.fillText(evidence.display.shortTag,366,410);
    drawPrintRule(ctx,462,1200);
    ctx.fillStyle=stage===2?C.coral:C.teal;ctx.font=`500 78px ${PAPER_FONT}`;
    ctx.fillText(stage===2?'不匹配 · 拒收':stage===1?'网站用密钥核验':'等待网站核验',MARGIN,585);
  });
}
