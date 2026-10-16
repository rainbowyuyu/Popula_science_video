from PIL import Image,ImageDraw,ImageFont,ImageCms
from pathlib import Path
import numpy as np,json
R=Path(__file__).resolve().parents[1];D=R/'delivery/episode3/covers';D.mkdir(parents=True,exist_ok=True)
hero=Image.open(R.parent/'episode3/blender/crafted-pavilion.png').convert('RGBA');hero=hero.crop(hero.getbbox());logo=Image.open(R/'public/episode3/logo.png').convert('RGBA')
font=lambda s,b=False:ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if b else 'C:/Windows/Fonts/STSONG.TTF',round(s))
profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes();rows=[]
for ratio,w,h in [('16x9',1920,1080),('3x4',1440,1920),('4x3',1920,1440),('9x16',1080,1920)]:
 s=min(w,h)/1080;im=Image.new('RGBA',(w,h),'#eee7d8');d=ImageDraw.Draw(im);mark=logo.copy();mark.thumbnail((round(76*s),round(90*s)));im.alpha_composite(mark,(round(64*s),round(48*s)));d.text((160*s,66*s),'rainbow鱼',font=font(44*s,True),fill='#293a32')
 d.rounded_rectangle((85*s,190*s,w-85*s if h>w else 735*s,264*s),radius=12*s,fill='#293a32');d.text((110*s,201*s),'每天5分钟知识 · 榫卯',font=font(40*s,True),fill='#fff8e8')
 if w>h:
  d.text((90*s,350*s),'木头怎样',font=font(105*s),fill='#293a32');d.text((90*s,485*s),'咬住木头？',font=font(105*s),fill='#293a32');hm=hero.copy();hm.thumbnail((round(w*.61),round(h*.70)));im.alpha_composite(hm,(round(w-hm.width-40*s),round(h-hm.height-42*s)))
 else:
  d.text((85*s,340*s),'木头怎样',font=font(118*s),fill='#293a32');d.text((85*s,500*s),'咬住木头？',font=font(118*s),fill='#293a32');hm=hero.copy();hm.thumbnail((round(w*.94),round(h-720*s)));im.alpha_composite(hm,(round((w-hm.width)/2),round(h-hm.height-65*s)))
 out=D/f'榫卯_封面_{ratio}.jpg';im.convert('RGB').save(out,quality=95,subsampling=0,icc_profile=profile);rows.append({'file':out.name,'size':[w,h],'format':'JPEG','ratio':ratio,'colorSpace':'sRGB'})
(D/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8');print('4 covers generated')
