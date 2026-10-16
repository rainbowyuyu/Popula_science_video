"""Precise rainbow fish brand layout on native Blender artwork."""
from pathlib import Path
import json, hashlib, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageCms, ImageFilter

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'delivery/hypertension/covers'
FONT=Path('C:/Windows/Fonts/msyhbd.ttc');REG=Path('C:/Windows/Fonts/msyh.ttc')
CFG={
 '16x9':{'size':(1920,1080),'series':(64,218),'seriesSize':38,'title':(62,343),'titleSize':117,'gap':30},
 '4x3':{'size':(1920,1440),'series':(85,289),'seriesSize':42,'title':(80,421),'titleSize':124,'gap':34},
 '3x4':{'size':(1440,1920),'series':(85,255),'seriesSize':43,'title':(78,365),'titleSize':133,'gap':27},
 '9x16':{'size':(1080,1920),'series':(64,220),'seriesSize':35,'title':(59,309),'titleSize':111,'gap':25},
}
def font(size,bold=True):return ImageFont.truetype(str(FONT if bold else REG),round(size))
def ink(draw,xy,text,f,fill):
 b=draw.textbbox((0,0),text,font=f);x,y=xy;draw.text((x-b[0],y-b[1]),text,font=f,fill=fill);return [x,y,x+b[2]-b[0],y+b[3]-b[1]]
icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
report={};preview='preview' in sys.argv
for ratio,c in CFG.items():
 w,h=c['size'];art=OUT/('art-'+ratio+('-preview' if preview else '')+'.png')
 if not art.exists():continue
 im=Image.open(art).convert('RGBA').resize((w,h),Image.Resampling.LANCZOS)
 yy,xx=np.mgrid[0:h,0:w];d=((xx/w-.68)**2*1.5+(yy/h-.58)**2)**.5
 top=np.array([248,246,240.]);base=np.array([238,233,222.]);t=np.clip(d*.50+yy/h*.32,0,1)[...,None];rgb=(top[None,None,:]*(1-t)+base[None,None,:]*t).astype('uint8');bg=Image.fromarray(rgb,'RGB').convert('RGBA')
 # Gentle diffused shadow anchors the floating cutaway without a card or frame.
 shadow=Image.new('RGBA',(w,h));sd=ImageDraw.Draw(shadow);cx=.71*w if w>=h else .54*w;cy=.88*h if w>=h else .87*h
 sd.ellipse((cx-.20*w,cy-.03*h,cx+.20*w,cy+.035*h),fill=(115,88,70,28));shadow=shadow.filter(ImageFilter.GaussianBlur(w*.026));bg.alpha_composite(shadow);bg.alpha_composite(im)
 dr=ImageDraw.Draw(bg);s=min(w,h)/1080;logo=Image.open(ROOT/'public/hypertension/logo.png').convert('RGBA');lh=round(90*s);lw=round(lh*347/410);logo=logo.resize((lw,lh),Image.Resampling.LANCZOS);lx,ly=round(64*s),round(48*s);bg.alpha_composite(logo,(lx,ly));bf=font(44*s);bb=dr.textbbox((0,0),'rainbow鱼',font=bf);bh=bb[3]-bb[1];brand=ink(dr,(lx+lw+round(20*s),ly+(lh-bh)/2),'rainbow鱼',bf,(52,67,67,255))
 series='每天5分钟科普 · 高血压';sf=font(c['seriesSize'],False);seriesbox=ink(dr,c['series'],series,sf,(76,100,99,255))
 titleboxes=[];x,y=c['title'];tf=font(c['titleSize']);title=['血压为什么','悄悄升高？']
 for i,line in enumerate(title):
  box=ink(dr,(x,y),line,tf,(40,59,60,255) if i==0 else (144,60,62,255));titleboxes.append(box);y=box[3]+c['gap']
 tag='-preview' if preview else '';file=OUT/('高血压_封面_'+ratio+tag+'.jpg');rgbim=bg.convert('RGB');rgbim.save(file,'JPEG',quality=96,subsampling=0,icc_profile=icc)
 for length in(320,160):
  thumb=rgbim.copy();thumb.thumbnail((length,length),Image.Resampling.LANCZOS);thumb.save(OUT/('thumb-'+ratio+'-'+str(length)+tag+'.jpg'),quality=93,icc_profile=icc)
 report[ratio]={'dimensions':[w,h],'brandLogo':[lx,ly,lx+lw,ly+lh],'brandText':brand,'series':seriesbox,'title':titleboxes,'layout':c,'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'format':'RGB JPEG','icc':'sRGB','sourceArtwork':art.name}
 # All type ink must remain inside the cover.
 for box in [brand,seriesbox]+titleboxes:assert box[0]>=0 and box[1]>=0 and box[2]<=w and box[3]<=h,(ratio,box)
contact=Image.new('RGB',(1440,1100),(243,240,232));d=ImageDraw.Draw(contact)
for i,(ratio,r) in enumerate(report.items()):
 im=Image.open(OUT/r['file']);im.thumbnail((660,470),Image.Resampling.LANCZOS);cellx=(i%2)*720;celly=(i//2)*550;x=cellx+(720-im.width)//2;y=celly+45;contact.paste(im,(x,y));d.text((cellx+28,celly+12),ratio.replace('x',':'),font=font(23),fill='black')
contact.save(OUT/('covers-contact'+('-preview' if preview else '')+'.jpg'),quality=94,icc_profile=icc)
(OUT/('layout'+('-preview' if preview else '')+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:{'file':v['file'],'dimensions':v['dimensions']} for k,v in report.items()},ensure_ascii=False))

