"""Independently laid out four-format covers, using film-derived 3D studies."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageCms
ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'research/revision-v6/covers'
OUT=ROOT/'research/revision-v11/covers'
OUT.mkdir(parents=True,exist_ok=True)
FONT=Path('C:/Windows/Fonts/NotoSansSC-VF.ttf')
INK='#1d3535'
ICC=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
LAYOUTS={
 '16x9':dict(subtitle=[80,737,53],size=[1920,1080],title=[78,332,144,170],capsule=[78,218,40],
  objects={'glucose':[978,190,530],'lipid':[1502,392,327],'pressure':[850,737,950]},
  labels={'glucose':[1030,125],'lipid':[1515,320],'pressure':[1160,730]},labelSize=49),
 '4x3':dict(subtitle=[100,846,61],size=[1920,1440],title=[98,380,166,192],capsule=[98,247,44],
  objects={'glucose':[1058,270,650],'lipid':[1415,938,345],'pressure':[235,1055,1090]},
  labels={'glucose':[1130,200],'lipid':[1460,1310],'pressure':[315,975]},labelSize=55),
 '3x4':dict(subtitle=[94,774,63],size=[1440,1920],title=[92,329,175,205],capsule=[92,228,45],
  objects={'glucose':[105,943,666],'lipid':[882,976,397],'pressure':[192,1560,1090]},
  labels={'glucose':[134,866],'lipid':[954,899],'pressure':[790,1495]},labelSize=59),
 '9x16':dict(subtitle=[67,711,53],size=[1080,1920],title=[65,313,153,181],capsule=[65,208,39],
  objects={'glucose':[66,905,580],'lipid':[661,1000,313],'pressure':[88,1550,902]},
  labels={'glucose':[96,823],'lipid':[708,922],'pressure':[130,1470]},labelSize=54),
}
def font(size,weight=650):
 f=ImageFont.truetype(str(FONT),round(size));f.set_variation_by_axes([weight]);return f
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bg(w,h):
 y,x=np.mgrid[0:h,0:w];p=np.full((h,w,3),[247,245,239],np.float32)
 a=np.exp(-(((x-w*.70)/(w*.5))**2+((y-h*.69)/(h*.57))**2))
 p+=a[:,:,None]*np.array([-15,-8,-8]);return Image.fromarray(np.uint8(np.clip(p,0,255))).convert('RGBA')
def trim(im):
 a=im.getchannel('A');b=a.point(lambda x:255 if x>10 else 0).getbbox();return im.crop(b)
def place(c,im,p):
 x,y,w=p;h=round(im.height*w/im.width);im=im.resize((w,h),Image.Resampling.LANCZOS)
 shadow=Image.new('RGBA',c.size);s=ImageDraw.Draw(shadow);s.ellipse((x+w*.15,y+h*.82,x+w*.89,y+h*1.04),fill=(48,71,65,25));c.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(34)))
 c.alpha_composite(im,(x,y));return [x,y,x+w,y+h]
def save(im,p):im.convert('RGB').save(p,quality=96,subsampling=0,icc_profile=ICC)
def main():
 art={n:trim(Image.open(ART/f'{n}.png').convert('RGBA')) for n in ('glucose','pressure','lipid')}
 logo=Image.open(ROOT/'public/brand/logo.png').convert('RGBA');assert logo.size==(347,410)
 report={'title':'如何科学减肥？从身体调节说起','series':'5分钟科普 · 血压血糖血脂','formats':{},'sourceHashes':{n:sha(ART/f'{n}.png') for n in art},'logoSHA256':sha(ROOT/'public/brand/logo.png'),'fontSHA256':sha(FONT),'models':'Same IsletDetail / ArterioleDetail / V5CardioDetail as film; cover-only camera/materials and lipid shell opening. Independent magnifications, not shared scale.','imageGenerationUsed':False}
 images={}
 for key,L in LAYOUTS.items():
  w,h=L['size'];c=bg(w,h);bounds={n:place(c,art[n],p) for n,p in L['objects'].items()}
  save(c,OUT/f'artwork-{key}.jpg');d=ImageDraw.Draw(c);s=min(w,h)/1080
  bx,by,bh=round(64*s),round(48*s),round(90*s);bw=round(bh*347/410);c.alpha_composite(logo.resize((bw,bh),Image.Resampling.LANCZOS),(bx,by))
  f=font(44*s,600);d.text((bx+bw+round(20*s),by+round((bh-f.getbbox('rainbow鱼',anchor='lt')[3])/2)),'rainbow鱼',font=f,fill=INK,anchor='lt')
  x,y,fs=L['capsule'];f=font(fs,600);label='5分钟科普 · 血压血糖血脂';bb=d.textbbox((0,0),label,font=f,anchor='lt');cb=[x,y,x+bb[2]+36,y+bb[3]+28]
  d.rounded_rectangle(cb,radius=10*s,fill='#3c746f');d.text((x+18,y+14),label,font=f,fill='#ffffff',anchor='lt')
  x,y,fs,step=L['title'];f=font(fs,800);tb=[]
  for i,line in enumerate(['如何科学','减肥？']):
   p=(x,y+i*step);d.text(p,line,font=f,fill=INK,anchor='lt');tb.append(d.textbbox(p,line,font=f,anchor='lt'))
  sx,sy,sfs=L['subtitle'];f=font(sfs,600);d.text((sx,sy),'从身体调节说起',font=f,fill='#477570',anchor='lt');tb.append(d.textbbox((sx,sy),'从身体调节说起',font=f,anchor='lt'))
  for n,label in [('glucose','胰岛调血糖'),('pressure','血管调血压'),('lipid','脂蛋白')]:
   d.text(tuple(L['labels'][n]),label,font=font(L['labelSize'],650),fill={'glucose':'#397c77','pressure':'#9b554d','lipid':'#9d7d3f'}[n],anchor='lt')
  final=OUT/f'cardiometabolic-cover-{key}.jpg';save(c,final);images[key]=c.convert('RGB')
  for edge in (320,160):
   thumb=c.copy();thumb.thumbnail((edge,edge),Image.Resampling.LANCZOS);save(thumb,OUT/f'cardiometabolic-cover-{key}-{edge}.jpg')
  for box in tb+[cb]:
   assert 0<=box[0]<box[2]<=w and 0<=box[1]<box[3]<=h,(key,box)
   for name,b in bounds.items():assert max(0,min(box[2],b[2])-max(box[0],b[0]))*max(0,min(box[3],b[3])-max(box[1],b[1]))==0,(key,'title overlap',name)
  report['formats'][key]={'size':[w,h],'sha256':sha(final),'modelBounds':bounds,'titleBounds':tb,'capsuleBounds':cb,'layout':L,'visualReview':'pending'}
 for edge in (640,320,160):
  sheet=Image.new('RGB',((edge+40)*4,edge+90),'#dfdfd7');d=ImageDraw.Draw(sheet)
  for i,(key,im) in enumerate(images.items()):
   thumb=im.copy();thumb.thumbnail((edge,edge),Image.Resampling.LANCZOS);sheet.paste(thumb,(i*(edge+40)+20+(edge-thumb.width)//2,55+(edge-thumb.height)//2));d.text((i*(edge+40)+20,12),key.replace('x',':'),font=font(24),fill=INK)
  save(sheet,OUT/f'contact-sheet-{edge}.jpg')
 (OUT/'layouts.json').write_text(json.dumps(LAYOUTS,ensure_ascii=False,indent=2),'utf8')
 (OUT/'layout-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8');print('Four covers composed')
if __name__=='__main__':main()
