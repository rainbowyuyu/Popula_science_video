"""Exact Chinese typography + supplied image logo on independently rendered covers."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageCms
import json,hashlib,argparse,math

ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'cover-v5';ART=BASE/'artwork';DEST=BASE/'covers'
FONT=Path('C:/Windows/Fonts/NotoSansSC-VF.ttf');LOGO=Path('C:/Users/zju/Desktop/logo/logo.png')
INK='#153e48';TEAL='#237d7d';PILL='#174b52'
LAYOUTS={
 '16x9':{'size':[1920,1080],'series':[96,255,38],'title':[94,375,142,181]},
 '4x3':{'size':[1920,1440],'series':[96,280,44],'title':[95,422,132,178]},
 '3x4':{'size':[1440,1920],'series':[86,246,48],'title':[83,360,168,208]},
 '9x16':{'size':[1080,1920],'series':[64,218,37],'title':[62,345,142,181]},
}
def font(sz,weight=800):
 f=ImageFont.truetype(str(FONT),round(sz));f.set_variation_by_axes([weight]);return f
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def intersects(a,b,g=0):return max(a[0],b[0]-g)<min(a[2],b[2]+g) and max(a[1],b[1]-g)<min(a[3],b[3]+g)
def create(ratio,cfg,preview=False):
 w,h=cfg['size'];S=2;s=min(w,h)/1080;source=ART/f'beauty-{ratio}{"-preview" if preview else ""}.png'
 im=Image.open(source).convert('RGB').resize((w*S,h*S),Image.Resampling.LANCZOS).convert('RGBA');d=ImageDraw.Draw(im);boxes=[]
 def label(text,x,y,size,color,weight,ident):
  f=font(size*S,weight);b=d.textbbox((x*S,y*S),text,font=f,anchor='lt');d.text((x*S,y*S),text,font=f,anchor='lt',fill=color)
  box=[v/S for v in b];boxes.append({'id':ident,'text':text,'box':box,'fontSize':size,'fontWeight':weight});return box
 # The original image is already transparent; no re-drawing or white backing.
 logo=Image.open(LOGO).convert('RGBA');lh=round(90*s*S);lw=round(lh*logo.width/logo.height);lx,ly=64*s,48*s
 im.alpha_composite(logo.resize((lw,lh),Image.Resampling.LANCZOS),(round(lx*S),round(ly*S)))
 boxes.append({'id':'logo','box':[lx,ly,lx+lw/S,ly+lh/S]})
 bf=font(44*s*S,650);bb=d.textbbox((0,0),'rainbow鱼',font=bf,anchor='lt');by=ly+(90*s-(bb[3]-bb[1])/S)/2
 label('rainbow鱼',lx+lw/S+20*s,by,44*s,INK,650,'brand')
 # One chapter capsule, with a single consistent font and generous ink padding.
 bx,by,fs=cfg['series'];text='每天5分钟科普 · DNA存储';f=font(fs*S,700);tb=d.textbbox((0,0),text,font=f,anchor='lt')
 tw,th=(tb[2]-tb[0])/S,(tb[3]-tb[1])/S;padx=22*s;pady=17*s;rect=[bx,by,bx+tw+padx*2,by+th+pady*2]
 d.rounded_rectangle(tuple(round(v*S) for v in rect),radius=14*s*S,fill=PILL)
 label(text,bx+padx,by+pady,fs,'#ffffff',700,'series');boxes[-1]['capsuleBox']=rect
 x,y,fs,step=cfg['title']
 label('弄丢几块',x,y,fs,INK,850,'hook-1')
 label('还能找回？',x,y+step,fs,TEAL,850,'hook-2')
 projected=json.loads((ART/f'projection-{ratio}.json').read_text(encoding='utf8'))
 protected=[{'id':k,'box':b} for k,b in projected['regions'].items()]
 errors=[]
 for i,a in enumerate(boxes):
  b=a.get('capsuleBox',a['box'])
  if min(b)<0 or b[2]>w or b[3]>h:errors.append(a['id']+' outside canvas')
  for c in boxes[i+1:]:
   if intersects(b,c.get('capsuleBox',c['box'])):errors.append(a['id']+' overlaps '+c['id'])
  for r in protected:
   if intersects(b,r['box'],12*s):errors.append(a['id']+' obscures '+r['id'])
 if errors:raise ValueError(ratio+': '+str(errors))
 out=BASE/('previews' if preview else 'covers');out.mkdir(parents=True,exist_ok=True)
 name='DNA存储_V5封面_'+ratio;final=im.convert('RGB').resize((w,h),Image.Resampling.LANCZOS);icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
 for ext in ['jpg','png']:
  p=out/(name+'.'+ext);final.save(p,icc_profile=icc,**({'quality':95,'subsampling':0,'optimize':True} if ext=='jpg' else {}))
 for n in [320,160]:
  t=final.copy();t.thumbnail((n,n),Image.Resampling.LANCZOS);t.save(out/(name+f'-thumb-{n}.jpg'),quality=95,subsampling=0,icc_profile=icc)
 report={'ratio':ratio,'size':[w,h],'mode':'RGB','icc':'sRGB','jpegQuality':95,'subsampling':'4:4:4','brandScale':s,'boxes':boxes,'protectedRegions':protected,'layoutChecks':'pass','artwork':str(source.relative_to(ROOT)),'artworkSha256':sha(source),'font':str(FONT),'fontSha256':sha(FONT),'logo':str(LOGO),'logoSha256':sha(LOGO),'rules':[]}
 (out/f'layout-{ratio}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps({'ratio':ratio,'checks':'pass','file':str((out/(name+'.jpg')).resolve())},ensure_ascii=True))

def contacts(folder):
 paths=list(folder.glob('DNA存储_V5封面_*.jpg'));paths=[p for p in paths if 'thumb' not in p.name]
 sheet=Image.new('RGB',(2000,1580),'#e8eee9');d=ImageDraw.Draw(sheet)
 placements={'16x9':(24,52,1120,630),'4x3':(24,790,1000,750),'3x4':(1170,52,490,654),'9x16':(1500,765,435,774)}
 for p in paths:
  ratio=p.stem.split('_')[-1];x,y,w,h=placements[ratio];im=Image.open(p);im.thumbnail((w,h),Image.Resampling.LANCZOS);sheet.paste(im,(x,y));d.text((x,y-30),ratio.replace('x',':'),font=font(22,650),fill=INK)
 sheet.save(folder/'四比例预览.jpg',quality=94,subsampling=0)
 # Exact mobile-size checks, not enlarged thumbnails.
 sheet=Image.new('RGB',(1440,720),'#dde6e1');d=ImageDraw.Draw(sheet)
 for i,ratio in enumerate(LAYOUTS):
  d.text((i*360+10,8),ratio.replace('x',':'),font=font(20,650),fill=INK)
  for n,y in [(320,45),(160,425)]:
   p=folder/f'DNA存储_V5封面_{ratio}-thumb-{n}.jpg'
   if p.exists():sheet.paste(Image.open(p),(i*360+10,y))
 sheet.save(folder/'手机缩略图检查.jpg',quality=96,subsampling=0)

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--preview',action='store_true');ap.add_argument('--ratio');a=ap.parse_args()
 for ratio,cfg in LAYOUTS.items():
  if a.ratio and a.ratio!=ratio:continue
  create(ratio,cfg,a.preview)
 contacts(BASE/('previews' if a.preview else 'covers'))
 (BASE/'layout-config.json').write_text(json.dumps({'title':['弄丢几块','还能找回？'],'series':'每天5分钟科普 · DNA存储','formats':LAYOUTS},ensure_ascii=False,indent=2),encoding='utf8')
