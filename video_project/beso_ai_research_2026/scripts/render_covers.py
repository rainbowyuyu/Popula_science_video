"""Independent four-ratio cover layouts from the film's true model renders."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageCms
R=Path(__file__).resolve().parents[1];O=R/'delivery/covers';O.mkdir(parents=True,exist_ok=True)
FONT='C:/Windows/Fonts/msyhbd.ttc';REG='C:/Windows/Fonts/msyh.ttc'
INK='#153d57';BLUE='#07519a';TEAL='#217e91';BG=(241,244,245)
def font(n,bold=True):return ImageFont.truetype(FONT if bold else REG,int(n))
def cutout(p):
    im=Image.open(p).convert('RGBA');a=np.array(im);rgb=a[:,:,:3].astype(float)
    # Select the saturated genuine model, preserve its internal native silhouette.
    # No topology, response or shape is synthesized for the cover.
    color=(rgb[:,:,2]-rgb[:,:,0]>15)&(rgb[:,:,1]-rgb[:,:,0]>10)&(rgb[:,:,0]<180)
    yy,xx=np.where(color)
    if len(xx)==0:raise ValueError('No model found in '+str(p))
    b=(max(0,xx.min()-18),max(0,yy.min()-18),min(im.width,xx.max()+19),min(im.height,yy.max()+19))
    alpha=Image.fromarray((color*255).astype('uint8')).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(.45))
    im.putalpha(alpha);return im.crop(b)
def paste(im,asset,box):
    x,y,w,h=box;s=min(w/asset.width,h/asset.height);a=asset.resize((round(asset.width*s),round(asset.height*s)),Image.Resampling.LANCZOS)
    x+=round((w-a.width)/2);y+=round((h-a.height)/2)
    shadow=Image.new('RGBA',im.size);sil=a.getchannel('A').filter(ImageFilter.GaussianBlur(20))
    sh=Image.new('RGBA',a.size,(28,68,89,40));sh.putalpha(sil.point(lambda v:round(v*.14)))
    shadow.alpha_composite(sh,(x+7,y+24));im.alpha_composite(shadow);im.alpha_composite(a,(x,y))
def mark(d,im,s):
    logo=Image.open(R/'public/brand/zju-university-logo.png').convert('RGBA').resize((round(89*s),round(89*s)),Image.Resampling.LANCZOS)
    im.alpha_composite(logo,(round(64*s),round(43*s)))
    d.text((174*s,43*s),'浙江大学',font=font(42*s),fill=BLUE)
    d.text((176*s,100*s),'ZHEJIANG UNIVERSITY',font=font(18*s),fill=BLUE)
def text(d,xy,txt,size,color=INK,bold=True):d.text(xy,txt,font=font(size,bold),fill=color,stroke_width=0)
def capsule(d,xy,txt,size):
    f=font(size);b=d.textbbox((0,0),txt,font=f);w=b[2]+38;h=size+28;x,y=xy
    d.rounded_rectangle((x,y,x+w,y+h),radius=11,fill=BLUE);d.text((x+19,y+7),txt,font=f,fill='white')
beso=cutout(R/'output/cover-source-beso.png' if (R/'output/cover-source-beso.png').exists() else R/'public/generated/bridge-last.png')
layouts=[('16x9',1920,1080),('4x3',1920,1440),('3x4',1440,1920),('9x16',1080,1920)]
manifest=[]
for name,w,h in layouts:
    s=min(w,h)/1080;portrait=h>w
    im=Image.new('RGBA',(w,h),BG+(255,));d=ImageDraw.Draw(im)
    # Wide, subtle engineering grid gives depth without decorative panels.
    for y in range(round(h*.64),h,round(80*s)):d.line([(0,y),(w,y-round(70*s))],fill=(218,230,234,255),width=max(1,round(s)))
    if portrait:
        if w==1080:
            cap=(64,214);title=(62,326);f=123;step=151;model=(38,698,1004,1010);sub=(68,1757)
        else:
            cap=(85,234);title=(79,356);f=145;step=179;model=(85,760,1270,1040);sub=(91,1824)
        capsule(d,cap,'AI Engineer · 海上风电',round(35*s))
        text(d,title,'让设计',f);text(d,(title[0],title[1]+step),'带着证据',f,BLUE)
        paste(im,beso,model);d=ImageDraw.Draw(im)
        text(d,sub,'BESO  →  Zwind  →  工程审查',round(32*s),TEAL)
    else:
        capsule(d,(70*s,212*s),'AI Engineer · 海上风电',37*s)
        titleY=324*s
        text(d,(66*s,titleY),'让设计',120*s);text(d,(66*s,titleY+152*s),'带着证据',120*s,BLUE)
        box=(int(w*.42),int(h*.19),int(w*.55),int(h*.75))
        if name=='4x3':box=(int(w*.40),int(h*.31),int(w*.58),int(h*.62))
        paste(im,beso,box);d=ImageDraw.Draw(im)
        text(d,(72*s,h-119*s),'BESO  →  Zwind  →  工程审查',32*s,TEAL)
    mark(d,im,s)
    p=O/f'AI-Engineer-{name}.jpg';rgb=im.convert('RGB');icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes();rgb.save(p,quality=95,subsampling=0,icc_profile=icc)
    check=Image.open(p);assert check.size==(w,h) and check.mode=='RGB' and check.format=='JPEG' and check.info.get('icc_profile')
    manifest.append(dict(file=p.name,width=w,height=h,ratio=name,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),source='Real BESO VTK boundary render; institution mark from original SVG'))
(O/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf8')
thumbs=[]
for item in manifest:
    a=Image.open(O/item['file']);a.thumbnail((480,650));thumbs.append(a)
sheet=Image.new('RGB',(sum(a.width for a in thumbs),max(a.height for a in thumbs)),BG);x=0
for a in thumbs:sheet.paste(a,(x,0));x+=a.width
sheet.save(O/'contact-sheet.jpg',quality=93)
print(O)
