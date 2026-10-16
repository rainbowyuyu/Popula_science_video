"""Precise four-format cover typography over original Blender assets."""
from pathlib import Path
import json,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageCms
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/covers';OUT.mkdir(parents=True,exist_ok=True)
DRAFT='--draft' in sys.argv
FONT='C:/Windows/Fonts/NotoSansSC-VF.ttf'
LOGO='C:/Users/zju/Desktop/logo/logo.png'
SPECS={
 '16x9':dict(size=[1920,1080],title=[94,285],font=137,line=176,capsule=[98,698],capsize=42,art=[795,160,1100,900]),
 '4x3':dict(size=[1920,1440],title=[90,395],font=141,line=181,capsule=[94,822],capsize=44,art=[790,280,1110,1090]),
 '3x4':dict(size=[1440,1920],title=[85,270],font=165,line=205,capsule=[89,733],capsize=48,art=[20,930,1400,920]),
 '9x16':dict(size=[1080,1920],title=[64,260],font=133,line=177,capsule=[68,669],capsize=39,art=[20,910,1040,910])
}
INK='#112B45';BLUE='#244B90'
def font(n,weight=780):
 f=ImageFont.truetype(FONT,int(n))
 try:f.set_variation_by_axes([weight])
 except Exception:pass
 return f
def put(d,xy,label,size,color=INK,weight=780):
 f=font(size,weight);b=d.textbbox((0,0),label,font=f);d.text((xy[0]-b[0],xy[1]-b[1]),label,font=f,fill=color);return [xy[0],xy[1],xy[0]+b[2]-b[0],xy[1]+b[3]-b[1]]
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
reports=[]
for name,s in SPECS.items():
 path=OUT/'artwork'/(name+('-draft' if DRAFT else '')+'.png')
 if not path.exists():continue
 w,h=s['size'];yy,xx=np.mgrid[0:h,0:w];g=np.exp(-((xx/w-.20)**2/1.2+(yy/h-.18)**2/1.6));base=np.array([233,239,240]);rgb=base+g[...,None]*17;im=Image.fromarray(np.clip(rgb,0,255).astype('uint8'),'RGB').convert('RGBA')
 art=Image.open(path).convert('RGBA');a=np.array(art.getchannel('A'));box=Image.fromarray(np.uint8(a>85)*255).getbbox();pad=35;box=(max(0,box[0]-pad),max(0,box[1]-pad),min(art.width,box[2]+pad),min(art.height,box[3]+pad));art=art.crop(box)
 a=np.array(art.getchannel('A'),dtype=float);a=np.where(a<10,0,(a-10)*255/245)
 yy2,xx2=np.mgrid[0:art.height,0:art.width];edge=np.minimum(np.minimum(xx2,art.width-1-xx2),np.minimum(yy2,art.height-1-yy2));a*=np.clip(edge/25,0,1)
 art.putalpha(Image.fromarray(np.uint8(np.clip(a,0,255))))
 ax,ay,aw,ah=s['art'];factor=min(aw/art.width,ah/art.height);art=art.resize((round(art.width*factor),round(art.height*factor)),Image.Resampling.LANCZOS);apos=(round(ax+(aw-art.width)/2),round(ay+(ah-art.height)/2));im.alpha_composite(art,apos)
 d=ImageDraw.Draw(im);boxes=[];scale=min(w,h)/1080;lx=round(64*scale);ly=round(48*scale);lh=round(90*scale)
 logo=Image.open(LOGO).convert('RGBA');logo=logo.resize((round(lh*347/410),lh),Image.Resampling.LANCZOS);im.alpha_composite(logo,(lx,ly));bf=font(44*scale,640);bb=bf.getbbox('rainbow鱼');by=ly+(lh-(bb[3]-bb[1]))/2;boxes.append(put(d,(lx+logo.width+20*scale,by),'rainbow鱼',44*scale,weight=640))
 x,y=s['title'];boxes.append(put(d,(x,y),'指针，',s['font']));boxes.append(put(d,(x,y+s['line']),'到底指哪？',s['font']))
 cx,cy=s['capsule'];cf=font(s['capsize'],650);label='每天5分钟 · C语言指针';b=cf.getbbox(label);cw=b[2]-b[0]+54;ch=b[3]-b[1]+38;d.rounded_rectangle((cx,cy,cx+cw,cy+ch),radius=18*scale,fill=BLUE);boxes.append(put(d,(cx+27,cy+19),label,s['capsize'],'#FFFFFF',650))
 output=OUT/(f'C语言指针_封面_{name}'+('_预览' if DRAFT else '')+'.jpg');profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes();im.convert('RGB').save(output,quality=96,subsampling=0,icc_profile=profile)
 for edge in [320,160]:
  thumb=im.convert('RGB');thumb.thumbnail((edge,edge));thumb.save(OUT/(f'{name}_thumb{edge}'+('_draft' if DRAFT else '')+'.jpg'),quality=94)
 violations=[{'box':b,'reason':'outside image'} for b in boxes if b[0]<0 or b[1]<0 or b[2]>w or b[3]>h]
 # Layout-level object separation: masks are independently inspected in the final contact sheet.
 subject_mask=Image.new('L',(w,h),0);subject_mask.paste(art.getchannel('A'),apos);mask=np.array(subject_mask)
 collision=[]
 for b in boxes:
  x0,y0,x1,y1=map(round,b);occupied=int(np.count_nonzero(mask[max(0,y0):min(h,y1),max(0,x0):min(w,x1)]>190))
  if occupied:collision.append({'textBox':b,'foregroundPixels':occupied})
 reports.append({'layout':name,'size':[w,h],'mode':'RGB','profile':'sRGB','image':str(output.relative_to(ROOT)),'sha256':sha(output),'artSource':str(path.relative_to(ROOT)),'artCrop':box,'artPlacement':[*apos,art.width,art.height],'titleAndBrandBoxes':boxes,'logoBox':[lx,ly,lx+logo.width,ly+lh],'violations':violations,'opaqueArtTextCollisions':collision})
 print(name,'ready',violations)
(ROOT/'docs'/('cover-draft.json' if DRAFT else 'cover-layouts.json')).write_text(json.dumps({'specs':SPECS,'logoSource':LOGO,'logoSha256':sha(LOGO),'fontSource':FONT,'fontSha256':sha(FONT),'reports':reports},ensure_ascii=False,indent=2),encoding='utf8')
if reports:
 sheet=Image.new('RGB',(1600,1050),'#e4e8e9');ds=ImageDraw.Draw(sheet)
 for i,r in enumerate(reports):
  pic=Image.open(ROOT/r['image']);pic.thumbnail((770,480));xx=(i%2)*800+(800-pic.width)//2;yy=(i//2)*525+30;sheet.paste(pic,(xx,yy));ds.text((i%2*800+20,i//2*525+7),r['layout'],font=font(20,600),fill=INK)
 sheet.save(OUT/('四比例预览.jpg' if not DRAFT else '构图预览.jpg'),quality=94)
 if not DRAFT:
  contact=Image.new('RGB',(1280,560),'#e4e8e9')
  for i,r in enumerate(reports):
   for row,edge in enumerate([320,160]):
    pic=Image.open(OUT/(r['layout']+f'_thumb{edge}.jpg'));contact.paste(pic,(i*320+(320-pic.width)//2,row*350))
  contact.save(OUT/'手机缩略图检查.jpg',quality=95)
