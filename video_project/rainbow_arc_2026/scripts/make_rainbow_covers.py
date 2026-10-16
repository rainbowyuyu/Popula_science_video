from pathlib import Path
import json, hashlib, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageCms

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'delivery'/'covers'
OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'public/sources/commons-complete-double-rainbow-lupuslupus26.jpg'
LOGO=ROOT/'public/brand/logo.png'
FONT=Path('C:/Windows/Fonts/NotoSansSC-VF.ttf')
TITLE='彩虹为什么是弯的？'
SERIES='每天5分钟·彩虹的秘密'
INK=(24,48,52)
TEAL=(36,92,90)
SCALE=1
LAYOUTS={
 '16x9': {'size':[1920,1080],'photo_width':1980,'photo_x':-25,'photo_y':100,'title_lines':['彩虹为什么是弯的？'],'title_size':146,'title_xy':[122,188],'line_gap':18,'pill_xy':[1230,64],'pill_size':37,'pill_padding':[27,15],'sky_veil':0.17},
 '4x3': {'size':[1920,1440],'photo_width':2200,'photo_x':-128,'photo_y':351,'title_lines':['彩虹为什么','是弯的？'],'title_size':170,'title_xy':[114,220],'line_gap':18,'pill_xy':[1115,86],'pill_size':43,'pill_padding':[30,18],'sky_veil':0.14},
 '3x4': {'droplet':[990,1260,250],'size':[1440,1920],'photo_width':2910,'photo_x':-735,'photo_y':480,'title_lines':['彩虹为什么','是弯的？'],'title_size':185,'title_xy':[89,310],'line_gap':18,'pill_xy':[91,213],'pill_size':42,'pill_padding':[28,16],'sky_veil':0.17},
 '9x16': {'droplet':[690,1270,218],'size':[1080,1920],'photo_width':2880,'photo_x':-899,'photo_y':495,'title_lines':['彩虹为什么','是弯的？'],'title_size':167,'title_xy':[67,282],'line_gap':18,'pill_xy':[68,182],'pill_size':35,'pill_padding':[23,15],'sky_veil':0.17},
}

def font(size,weight=800):
 f=ImageFont.truetype(str(FONT),round(size))
 try:f.set_variation_by_axes([weight])
 except Exception:pass
 return f

def text_box(draw,xy,text,f,fill):
 box=draw.textbbox((0,0),text,font=f)
 # xy defines top-left of visible ink, independent of font ascent.
 draw.text((xy[0]-box[0],xy[1]-box[1]),text,font=f,fill=fill,stroke_width=0)
 return [xy[0],xy[1],xy[0]+box[2]-box[0],xy[1]+box[3]-box[1]]

def background(cfg):
 w,h=cfg['size']; photo=Image.open(SOURCE).convert('RGB')
 photo=ImageEnhance.Color(photo).enhance(1.13)
 photo=ImageEnhance.Contrast(photo).enhance(1.04)
 ph=round(photo.height*cfg['photo_width']/photo.width)
 photo=photo.resize((cfg['photo_width'],ph),Image.Resampling.LANCZOS)
 x,y=cfg['photo_x'],cfg['photo_y']
 # Extend only the original sky at its edge. No invented rainbow is drawn.
 edge=photo.crop((max(0,-x),0,min(photo.width,w-x),min(110,ph))).resize((w,400),Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(65))
 bg=edge.resize((w,h),Image.Resampling.BICUBIC)
 bg.paste(photo,(x,y))
 # Blend the sky edge over 110 px; the rainbow itself starts well below this.
 if y>0:
  over=Image.new('RGB',(w,h));over.paste(bg)
  over.paste(edge.resize((w,y+140)),(0,0))
  mask=Image.new('L',(w,h),0);md=ImageDraw.Draw(mask)
  for yy in range(y+140):
   a=255 if yy<y else round(255*(1-(yy-y)/140)**2)
   md.line((0,yy,w,yy),fill=a)
  bg=Image.composite(over,bg,mask)
 # Soft illumination in the upper title area, without a panel or frame.
 veil=Image.new('RGBA',(w,h),(240,244,239,0));vd=ImageDraw.Draw(veil)
 vh=max(350,round(h*.43))
 for yy in range(vh):
  a=round(255*cfg['sky_veil']*(1-yy/vh)**1.7)
  vd.line((0,yy,w,yy),fill=(243,246,241,a))
 return Image.alpha_composite(bg.convert('RGBA'),veil).convert('RGB')


def refraction(d, normal, n_from, n_to):
 normal=np.array(normal,dtype=float);d=np.array(d,dtype=float)
 c=-float(np.dot(d,normal))
 if c<0:normal=-normal;c=-c
 eta=n_from/n_to
 return eta*d+(eta*c-math.sqrt(max(0,1-eta*eta*(1-c*c))))*normal

def primary_path(n,b):
 entry=np.array([-math.sqrt(1-b*b),b])
 inside=refraction([1,0],entry,1.0003,n)
 reflection=entry-2*np.dot(entry,inside)*inside
 turned=inside-2*np.dot(inside,reflection)*reflection
 exit=reflection-2*np.dot(reflection,turned)*turned
 outgoing=refraction(turned,exit,n,1.0003)
 assert abs(np.linalg.norm(reflection)-1)<1e-9
 assert abs(np.linalg.norm(exit)-1)<1e-9
 return [entry,reflection,exit,exit+outgoing*1.02]

def add_droplet(bg, spec):
 cx,cy,r=spec;w,h=bg.size
 # A magnified, spherical teaching droplet. Its path is solved with Snell's law,
 # not drawn as a decorative triangular prism or teardrop.
 arr=np.array(bg,dtype=np.float32)
 yy,xx=np.mgrid[0:h,0:w]
 nx=(xx-cx)/r;ny=(yy-cy)/r;rr=nx*nx+ny*ny
 inside=rr<=1;z=np.sqrt(np.clip(1-rr,0,1))
 # Shallow background lens distortion plus soft Fresnel rim; only the glass
 # material is illustrative, while the colored light path uses exact geometry.
 factor=1-.19*z
 sx=np.clip(np.rint(cx+(xx-cx)*factor),0,w-1).astype(int)
 sy=np.clip(np.rint(cy+(yy-cy)*factor),0,h-1).astype(int)
 lens=arr[sy,sx]
 fres=(1-z)**4
 edge=np.exp(-((np.sqrt(rr)-.987)/.023)**2)
 sheen=np.exp(-((nx+.34)**2/.25+(ny+.48)**2/.075))*0.21
 dark=np.clip(nx*.35+ny*.5,0,.48)*(1-z)*.52
 colored=lens*(1-dark[...,None])
 color=np.array([225,243,245],dtype=float)
 a=np.clip(.08+fres*.30+sheen,0,.72)
 colored=colored*(1-a[...,None])+color*a[...,None]
 rim_a=np.clip(edge*.60,0,.6)
 colored=colored*(1-rim_a[...,None])+np.array([253,255,250])*rim_a[...,None]
 arr[inside]=colored[inside]
 result=Image.fromarray(np.clip(arr,0,255).astype('uint8')).convert('RGBA')
 # Anti-aliased light geometry is composited as a continuous path, no frame/card.
 q=2
 lines=Image.new('RGBA',(w*q,h*q),(0,0,0,0));ld=ImageDraw.Draw(lines)
 def pts(path):return [(round((cx+p[0]*r)*q),round((cy-p[1]*r)*q)) for p in path]
 paths=[]
 for ni,b,color in [(1.331,.8620714385305106,(243,86,62,255)),(1.343,.8558490336626936,(116,85,181,255))]:
  path=primary_path(ni,b); paths.append((path,color))
  ld.line(pts(path),fill=color,width=round(3.0*q),joint='curve')
 # Neutral sunlight arrives along the same axis; the spectrum separates inside.
 red=paths[0][0][0];purple=paths[1][0][0]
 entry=(red+purple)/2;start=np.array([-2.43,entry[1]])
 ld.line(pts([start,entry]),fill=(255,254,237,255),width=round(4*q))
 # One small travel cue is part of the beam, not a free-floating infographic arrow.
 def arrow(p0,p1,color,frac=.70):
  p0=np.array(p0);p1=np.array(p1);d=p1-p0;d=d/np.linalg.norm(d)
  p=p0+(p1-p0)*frac;normal=np.array([-d[1],d[0]])
  aa=p-d*.064+normal*.030;bb=p-d*.064-normal*.030
  ld.polygon(pts([p,aa,bb]),fill=color)
 arrow(start,entry,(255,254,237,255),.57)
 arrow(paths[0][0][1],paths[0][0][2],(243,86,62,255),.52)
 # A broad, smooth reflection and a sharp crescent provide volume.
 bbox=[round((cx-r*.956)*q),round((cy-r*.956)*q),round((cx+r*.956)*q),round((cy+r*.956)*q)]
 ld.arc(bbox,194,271,fill=(250,255,255,215),width=round(2.6*q))
 glow=lines.filter(ImageFilter.GaussianBlur(3.4*q))
 glow.putalpha(glow.getchannel('A').point(lambda a:round(a*.36)))
 result=Image.alpha_composite(result,glow.resize((w,h),Image.Resampling.LANCZOS))
 result=Image.alpha_composite(result,lines.resize((w,h),Image.Resampling.LANCZOS))
 return result.convert('RGB')

icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
reports={}
for ratio,cfg in LAYOUTS.items():
 w,h=cfg['size'];s=min(w,h)/1080
 bg=background(cfg)
 if cfg.get('droplet'):bg=add_droplet(bg,cfg['droplet'])
 bg.save(OUT/f'rainbow_{ratio}_background.jpg',quality=96,subsampling=0,icc_profile=icc)
 img=bg.convert('RGBA');draw=ImageDraw.Draw(img)
 logo=Image.open(LOGO).convert('RGBA');lh=round(90*s);lw=round(lh*347/410)
 logo=logo.resize((lw,lh),Image.Resampling.LANCZOS)
 lx,ly=round(64*s),round(48*s)
 img.alpha_composite(logo,(lx,ly));draw=ImageDraw.Draw(img)
 fbrand=font(44*s,600); b=draw.textbbox((0,0),'rainbow鱼',font=fbrand)
 brand_xy=[round(lx+lw+20*s),round(ly+(lh-(b[3]-b[1]))/2)]
 brand_box=text_box(draw,brand_xy,'rainbow鱼',fbrand,INK)
 px,py=cfg['pill_xy'];pf=font(cfg['pill_size'],680);pb=draw.textbbox((0,0),SERIES,font=pf)
 pad_x,pad_y=cfg['pill_padding'];pw=pb[2]-pb[0]+2*pad_x;ph=pb[3]-pb[1]+2*pad_y
 draw.rounded_rectangle((px,py,px+pw,py+ph),radius=round(ph*.25),fill=TEAL)
 text_box(draw,(px+pad_x,py+pad_y),SERIES,pf,(255,255,250))
 ftitle=font(cfg['title_size'],850); tx,ty=cfg['title_xy'];title_boxes=[]
 for line in cfg['title_lines']:
  box=text_box(draw,(tx,ty),line,ftitle,INK);title_boxes.append(box)
  ty=box[3]+cfg['line_gap']
 img=img.convert('RGB')
 out=OUT/f'彩虹为什么是弯的_{ratio}.jpg'
 img.save(out,quality=96,subsampling=0,icc_profile=icc)
 thumbs={}
 for maxdim in [320,160]:
  thumb=img.copy();thumb.thumbnail((maxdim,maxdim),Image.Resampling.LANCZOS)
  thumb.save(OUT/f'rainbow_{ratio}_{maxdim}px.jpg',quality=94,icc_profile=icc)
  thumbs[str(maxdim)]=list(thumb.size)
 reports[ratio]={**cfg,'brand':{'logo_xy':[lx,ly],'logo_size':[lw,lh],'name_box':brand_box},'title_boxes':title_boxes,'pill_box':[px,py,px+pw,py+ph],'thumbnails':thumbs}
 assert all(0<=x<=w for box in title_boxes for x in [box[0],box[2]])
 assert all(0<=y<=h for box in title_boxes for y in [box[1],box[3]])
 assert px+pw<w

(OUT/'layout.json').write_text(json.dumps({'version':1,'title':TITLE,'series':SERIES,'font':str(FONT),'photo':str(SOURCE),'license':'CC BY-SA 4.0','layout':reports},ensure_ascii=False,indent=2),encoding='utf-8')
# Contact sheet combines the independently rendered images; not a published cover.
cellw,cellh=680,670
sheet=Image.new('RGB',(cellw*2,cellh*2),(244,245,240));d=ImageDraw.Draw(sheet)
for i,ratio in enumerate(LAYOUTS):
 col,row=i%2,i//2
 im=Image.open(OUT/f'彩虹为什么是弯的_{ratio}.jpg');im.thumbnail((650,610),Image.Resampling.LANCZOS)
 sheet.paste(im,(col*cellw+(cellw-im.width)//2,row*cellh+43))
 d.text((col*cellw+20,row*cellh+9),ratio,font=font(25,650),fill=INK)
sheet.save(OUT/'四比例封面总览.jpg',quality=94,icc_profile=icc)
thumbsheet=Image.new('RGB',(1020,850),(244,245,240));d=ImageDraw.Draw(thumbsheet)
for i,ratio in enumerate(LAYOUTS):
 col,row=i%2,i//2; bx=col*510;by=row*420
 d.text((bx+15,by+10),ratio+' / 320 px & 160 px',font=font(21,600),fill=INK)
 for md,dx in [(320,15),(160,345)]:
  im=Image.open(OUT/f'rainbow_{ratio}_{md}px.jpg');thumbsheet.paste(im,(bx+dx,by+52))
thumbsheet.save(OUT/'手机缩略图检查.jpg',quality=94,icc_profile=icc)
sha={str(p.relative_to(OUT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(OUT.glob('*.jpg'))}
(OUT/'hashes.json').write_text(json.dumps(sha,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({r:{'size':v['size'],'title_boxes':v['title_boxes'],'pill_box':v['pill_box']} for r,v in reports.items()},ensure_ascii=False,indent=2))
