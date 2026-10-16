
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageCms, ImageFilter
import json, hashlib
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'delivery/episode3/covers_v6'
LOGO=Path(r'C:/Users/zju/.codex/skills/rainbow-science-short/assets/logo.png')
FONT_BOLD=Path(r'C:/Windows/Fonts/msyhbd.ttc')
INK=(22,54,57,255); CREAM=(248,242,228,255)
SPECS={
 '16x9': {'size':(1920,1080),'title':(90,330,122),'pill':(90,222),'brand':(64,48)},
 '4x3': {'size':(1920,1440),'title':(100,335,118),'pill':(100,238),'brand':(85,64)},
 '3x4': {'size':(1440,1920),'title':(70,210,118),'pill':(70,152),'brand':(58,24)},
 '9x16': {'size':(1080,1920),'title':(52,190,98),'pill':(52,132),'brand':(48,28)},
}
def ft(size): return ImageFont.truetype(str(FONT_BOLD),int(size))
def brand(im,xy,scale):
 d=ImageDraw.Draw(im,'RGBA'); x,y=xy; mark=Image.open(LOGO).convert('RGBA'); h=int(88*scale); w=round(h*mark.width/mark.height)
 im.alpha_composite(mark.resize((w,h),Image.Resampling.LANCZOS),(x,y)); tx=x+w+round(18*scale); ty=y+h//2
 d.text((tx+1,ty+2),'rainbow鱼',font=ft(42*scale),anchor='lm',fill=(255,250,237,150)); d.text((tx,ty),'rainbow鱼',font=ft(42*scale),anchor='lm',fill=INK)
 return {'x':x,'y':y,'icon_w':w,'icon_h':h}
def pill(im,xy,scale):
 d=ImageDraw.Draw(im,'RGBA'); x,y=xy; label='每天5分钟科普 · 榫卯'; f=ft(31*scale); bb=d.textbbox((0,0),label,font=f); px=18*scale; py=10*scale
 box=(x,y,x+bb[2]-bb[0]+2*px,y+bb[3]-bb[1]+2*py); d.rounded_rectangle(box,radius=round(15*scale),fill=INK); d.text((x+px,y+py-1),label,font=f,fill=CREAM)
 return {'box':list(map(int,box)),'text':label}
def title(im,xy,size,scale):
 d=ImageDraw.Draw(im,'RGBA'); x,y=xy; f=ft(size*scale); step=round((size+20)*scale); lines=['木头怎样','咬住木头？']
 for i,t in enumerate(lines): yy=y+i*step; d.text((x+2,yy+3),t,font=f,fill=(250,245,232,110)); d.text((x,yy),t,font=f,fill=INK)
 return {'x':x,'y':y,'size':size,'lines':lines,'step':step}
def save_rgb(im,p):
 rgb=im.convert('RGB'); icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes(); rgb.save(p,'JPEG',quality=97,subsampling=0,optimize=True,icc_profile=icc)
def main():
 rec=[]
 for ratio,s in SPECS.items():
  src=Image.open(OUT/f'scene_{ratio}.png').convert('RGBA').resize(s['size'],Image.Resampling.LANCZOS); scale=min(s['size'])/1080
  b=brand(src,s['brand'],scale); c=pill(src,s['pill'],scale); t=title(src,s['title'][:2],s['title'][2],scale)
  gray=Image.effect_noise(s['size'],2).convert('L').filter(ImageFilter.GaussianBlur(0.25)); alpha=gray.point(lambda v:int(v*0.045)); grain=Image.merge('RGBA',(gray,gray,gray,alpha)); src=Image.alpha_composite(src,grain)
  jpg=OUT/f'榫卯_爆炸亭封面_{ratio}.jpg'; png=OUT/f'榫卯_爆炸亭封面_{ratio}_排版源.png'; save_rgb(src,jpg); src.save(png,'PNG')
  thumb=src.convert('RGB'); thumb.thumbnail((320,320),Image.Resampling.LANCZOS); thumb.save(OUT/f'榫卯_爆炸亭封面_{ratio}_thumb320.jpg','JPEG',quality=95,optimize=True)
  thumb2=src.convert('RGB'); thumb2.thumbnail((160,160),Image.Resampling.LANCZOS); thumb2.save(OUT/f'榫卯_爆炸亭封面_{ratio}_thumb160.jpg','JPEG',quality=95,optimize=True)
  rec.append({'ratio':ratio,'size':list(s['size']),'jpg':jpg.name,'png':png.name,'brand':b,'pill':c,'title':t,'sha256':hashlib.sha256(jpg.read_bytes()).hexdigest()})
 (OUT/'cover-layout-v6.json').write_text(json.dumps({'schema':'rainbow.cover.layout.v6','series':'每天5分钟科普','topic':'榫卯','hook':'木头怎样咬住木头？','text_policy':'仅保留系列胶囊与两行主标题；不叠加公式、标签或旧视频字幕','renders':rec},ensure_ascii=False,indent=2),encoding='utf-8')
 sheet=Image.new('RGB',(1680,420),(244,237,222))
 for i,r in enumerate(rec):
  im=Image.open(OUT/r['jpg']); im.thumbnail((400,350),Image.Resampling.LANCZOS); sheet.paste(im,(i*420+(400-im.width)//2,25))
 sheet.save(OUT/'covers_v6_contact.jpg','JPEG',quality=95,optimize=True)
 print('COMPOSED',json.dumps(rec,ensure_ascii=False))
if __name__=='__main__':main()
