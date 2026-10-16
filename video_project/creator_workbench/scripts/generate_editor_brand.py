"""Deterministic R/fish + play + AI identity derived from rainbow鱼's supplied logo.
Run from any directory. Requires Pillow and numpy. Original brand files stay intact.
"""
from __future__ import annotations
import hashlib, json, shutil, os
from pathlib import Path
from xml.sax.saxutils import escape
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from brand_fusion_geometry import OUTLINE, HEAD, UPPER, PLAY, SPARK, EYE, TRANSFORM, contours
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'web/assets'
WORK=ROOT/'work/brand-fusion'
SOURCE=Path(os.getenv('RAINBOW_LOGO_SOURCE',str(ROOT/'web/assets/rainbow-source.svg')))
NAVY='#163846'; TEAL='#74E4D0'; WHITE='#F7FAF5'; GOLD='#EACB91'

def font(size,bold=False):
 return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc',size)
def rgb(color):return tuple(int(color[i:i+2],16) for i in (1,3,5))

def svg(kind='icon',style='outline'):
 light=kind=='glyph' or style=='light'
 stroke=NAVY if light else WHITE
 accent='#258D91' if light else TEAL
 bg='' if kind=='glyph' else '<rect x="4" y="4" width="120" height="120" rx="30" fill="'+('#EFF5F4' if light else 'url(#sea)')+'"/><rect x="4.6" y="4.6" width="118.8" height="118.8" rx="29.4" fill="none" stroke="#FFFFFF" stroke-opacity=".10"/>'
 defs='<defs><linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#284A59"/><stop offset="1" stop-color="#102934"/></linearGradient><linearGradient id="spark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F1DBAC"/><stop offset="1" stop-color="#D6B47A"/></linearGradient></defs>'
 filled=style=='filled'
 fill=WHITE if filled else 'none'
 inner=NAVY if filled else stroke
 # Preserve the original monogram proportions and interior fish-tail connection.
 body=f'<g transform="translate(17 17) scale(.216)" stroke-linejoin="round" stroke-linecap="round"><path d="{OUTLINE}" fill="{fill}" stroke="{stroke}" stroke-width="18"/><path d="{HEAD}" fill="none" stroke="{inner}" stroke-width="18"/><path d="{UPPER}" fill="none" stroke="{inner}" stroke-width="16"/><circle cx="232" cy="167" r="11.3" fill="none" stroke="{inner}" stroke-width="13"/><path d="{PLAY}" fill="{accent}"/></g>'
 spark=f'<path d="{SPARK}" fill="'+('#B88C49' if light else 'url(#spark)')+'"/>'
 return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="rainbow鱼 AI视频编辑"><title>rainbow鱼 · AI视频编辑</title>{defs}{bg}{body}{spark}</svg>\n'

def icon(size,glyph=False,style='outline'):
 ss=4;w=size*ss;unit=w/128
 im=Image.new('RGBA',(w,w))
 light=glyph or style=='light';stroke=NAVY if light else WHITE;accent='#258D91' if light else TEAL
 if not glyph:
  mask=Image.new('L',(w,w));ImageDraw.Draw(mask).rounded_rectangle((4*unit,4*unit,124*unit,124*unit),30*unit,fill=255)
  if light:background=Image.new('RGBA',(w,w),'#EFF5F4')
  else:
   ys,xs=np.ogrid[:w,:w];t=(xs+ys)/max(1,2*w-2)
   a=np.array(rgb('#284A59'));b=np.array(rgb('#102934'))
   arr=np.empty((w,w,4),dtype=np.uint8);arr[:,:,:3]=np.rint(a[None,None,:]*(1-t[:,:,None])+b[None,None,:]*t[:,:,None]);arr[:,:,3]=255
   background=Image.fromarray(arr)
  im.paste(background,(0,0),mask)
 d=ImageDraw.Draw(im)
 def points(path):return [[((x*.216+17)*unit,(y*.216+17)*unit) for x,y in segment] for segment in contours(path)]
 def line(path,color,width):
  radius=width*.216*unit/2
  for part in points(path):
   d.line(part,fill=color,width=round(radius*2),joint='curve')
   for x,y in part:d.ellipse((x-radius,y-radius,x+radius,y+radius),fill=color)
 filled=style=='filled'
 if filled:d.polygon(points(OUTLINE)[0],fill=WHITE)
 inner=NAVY if filled else stroke
 line(OUTLINE,stroke,18);line(HEAD,inner,18);line(UPPER,inner,16)
 cx,cy,r=EYE;cx=(cx*.216+17)*unit;cy=(cy*.216+17)*unit;r=r*.216*unit;thick=13*.216*unit
 d.ellipse((cx-r-thick/2,cy-r-thick/2,cx+r+thick/2,cy+r+thick/2),outline=inner,width=round(thick))
 d.polygon(points(PLAY)[0],fill=accent)
 d.polygon([(x*unit,y*unit) for x,y in contours(SPARK)[0]],fill='#B88C49' if light else GOLD)
 return im.resize((size,size),Image.Resampling.LANCZOS)

def board():
 sheet=Image.new('RGB',(1440,930),'#F2F5F4');d=ImageDraw.Draw(sheet)
 d.text((60,35),'rainbow鱼 · AI视频编辑',font=font(38,True),fill=NAVY)
 d.text((62,94),'原生 R 鱼轮廓   /   视频播放   /   AI 星芒',font=font(19),fill='#6D8388')
 for i,(style,title) in enumerate([('outline','01  深海轮廓'),('filled','02  实心鱼形'),('light','03  浅色轮廓')]):
  x=40+i*465;d.rounded_rectangle((x,154,x+430,688),24,fill='white')
  im=icon(330,style=style);sheet.paste(im,(x+50,180),im)
  d.text((x+42,550),title,font=font(24,True),fill=NAVY)
  for j,size in enumerate((24,32,48,64)):
   small=icon(size,style=style);sheet.paste(small,(x+45+j*90,610+(64-size)//2),small)
 d.text((62,740),'保留原始鱼眼、R 弧线与鱼尾；播放符号嵌入鱼身。',font=font(24),fill=NAVY)
 d.text((62,796),'一套标识，统一网页、浏览器页签与桌面启动入口。',font=font(20),fill='#6D8388')
 WORK.mkdir(parents=True,exist_ok=True);sheet.save(WORK/'concepts.png')

def main():
 OUT.mkdir(exist_ok=True);WORK.mkdir(parents=True,exist_ok=True)
 for name,kind in [('editor-icon.svg','icon'),('editor-favicon.svg','icon'),('editor-glyph.svg','glyph')]:
  (OUT/name).write_text(svg(kind),encoding='utf8')
 sizes=(16,24,32,48,64,128,256);rasters={n:icon(n) for n in sizes}
 rasters[256].save(OUT/'editor-icon.ico',format='ICO',sizes=[(n,n) for n in sizes],append_images=[rasters[n] for n in sizes if n!=256])
 shutil.copy2(OUT/'editor-icon.ico',OUT/'editor-rainbow-v2.ico')
 icon(1024).save(OUT/'editor-icon.png');icon(512,glyph=True).save(OUT/'editor-glyph.png')
 rasters[32].save(OUT/'editor-favicon-32.png');icon(180).save(OUT/'editor-apple-touch.png')
 inner=svg().split('>',1)[1].rsplit('</svg>',1)[0]
 (OUT/'editor-wordmark.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 100" role="img" aria-label="rainbow鱼 AI视频编辑"><svg x="0" y="4" width="92" height="92" viewBox="0 0 128 128">{inner}</svg><text x="110" y="47" fill="{NAVY}" font-family="Microsoft YaHei,Segoe UI,sans-serif" font-size="35" font-weight="700">rainbow鱼</text><text x="112" y="79" fill="#607E88" font-family="Microsoft YaHei,Segoe UI,sans-serif" font-size="20" letter-spacing="1.5">AI 视频编辑</text></svg>',encoding='utf8')
 wm=Image.new('RGBA',(960,200));wm.alpha_composite(icon(184),(0,8));d=ImageDraw.Draw(wm);d.text((220,20),'rainbow鱼',font=font(70,True),fill=NAVY);d.text((224,119),'AI 视频编辑',font=font(38),fill='#607E88');wm.save(OUT/'editor-wordmark.png')
 board()
 assets=[{'path':p.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in sorted(OUT.glob('editor-*')) if p.suffix!='.json']
 manifest={'name':'rainbow鱼 · AI视频编辑','version':2,'source':str(SOURCE),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'license':'User-provided rainbow鱼 brand; adapted locally for its editor. Original source retained.','design':'Original R/fish monogram, eye and tail; integrated play aperture, single AI spark.','generator':'scripts/generate_editor_brand.py + brand_fusion_geometry.py; deterministic Pillow and SVG','palette':{'deepSea':NAVY,'mint':TEAL,'ivory':WHITE,'warmGold':GOLD},'icoSizes':list(sizes),'assets':assets}
 (OUT/'editor-brand-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
 with Image.open(OUT/'editor-icon.ico') as ico:assert ico.ico.sizes()=={(n,n) for n in sizes}
 print(json.dumps({'assets':len(assets),'review':str(WORK/'concepts.png')},ensure_ascii=False))

if __name__=='__main__':main()
