"""Compose four original Roadster cover layouts from transparent 3D renders."""
from pathlib import Path
import hashlib, json, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageCms

ROOT=Path(__file__).resolve().parent
PROJECT=ROOT.parents[1]
OUT=PROJECT/'output/covers/v01'
OUT.mkdir(parents=True,exist_ok=True)
FONT=PROJECT/'source/v05/public/fonts/NotoSansSC-VF.ttf'
LOGO=PROJECT/'source/v05/public/brand/logo.png'
CONFIG=json.loads((ROOT/'layouts.json').read_text(encoding='utf8'))
COLORS=CONFIG['colors']
ICC=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def font(size,weight=850):
    f=ImageFont.truetype(str(FONT),round(size))
    f.set_variation_by_axes([weight])
    return f
def text(im,value,x,y,size,color,weight=850):
    d=ImageDraw.Draw(im);f=font(size,weight)
    b=d.textbbox((0,0),value,font=f)
    d.text((x-b[0],y-b[1]),value,font=f,fill=color)
    return [round(x),round(y),round(x+b[2]-b[0]),round(y+b[3]-b[1])]
def intersect(a,b):return max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))
def background(w,h):
    # Render a continuous warm-white studio field at quarter resolution.
    sw,sh=w//4,h//4
    im=Image.new('RGB',(sw,sh));px=im.load()
    for y in range(sh):
      for x in range(sw):
        u,v=x/sw,y/sh
        halo=math.exp(-(((u-.74)/.55)**2+((v-.58)/.42)**2))
        edge=.55*(1-v)
        px[x,y]=(round(245-10*halo-2*edge),round(244-8*halo-2*edge),round(239-4*halo-2*edge))
    return im.resize((w,h),Image.Resampling.BICUBIC).convert('RGBA')

def compose(layout):
    w,h=layout['size'];im=background(w,h);s=min(w,h)/1080
    # Soft ground shadow, detached from the airborne car.
    sh=Image.new('RGBA',(w,h));d=ImageDraw.Draw(sh)
    cx,cy,rx,ry=layout['shadow'];d.ellipse([cx-rx/2,cy-ry/2,cx+rx/2,cy+ry/2],fill=(29,55,58,42))
    im=Image.alpha_composite(im,sh.filter(ImageFilter.GaussianBlur(26*s)))
    asset=ROOT/'assets'/f"hero-{layout['hero']}.png"
    if not asset.exists():asset=ROOT/'assets'/f"hero-{layout['hero']}-preview.png"
    hero=Image.open(asset).convert('RGBA');bbox=hero.getchannel('A').point(lambda p:255 if p>2 else 0).getbbox()
    hero=hero.crop(bbox)
    hx,hy,hw,hh=layout['heroBox'];scale=min(hw/hero.width,hh/hero.height)
    hero=hero.resize((round(hero.width*scale),round(hero.height*scale)),Image.Resampling.LANCZOS)
    ox=round(hx+(hw-hero.width)/2);oy=round(hy+(hh-hero.height)/2)
    # A single arc communicates the flip, without extra labels or force values.
    arc=Image.new('RGBA',(w,h));ad=ImageDraw.Draw(arc)
    arx=min(w-40*s,ox+hero.width+12*s);ary=oy+hero.height*.45
    pts=[]
    for i in range(81):
      t=i/80;angle=math.radians(75-137*t)
      pts.append((arx-100*s+100*s*math.cos(angle),ary+hero.height*.48*math.sin(angle)))
    ad.line(pts,fill=(187,142,78,125),width=max(3,round(4*s)))
    tip=pts[-1];prev=pts[-3];vx,vy=tip[0]-prev[0],tip[1]-prev[1];ln=math.hypot(vx,vy);ux,uy=vx/ln,vy/ln
    length=17*s;half=7*s
    ad.polygon([tip,(tip[0]-ux*length-uy*half,tip[1]-uy*length+ux*half),(tip[0]-ux*length+uy*half,tip[1]-uy*length-ux*half)],fill=(187,142,78,160))
    im=Image.alpha_composite(im,arc)
    im.alpha_composite(hero,(ox,oy))
    # Preserve the actual logo aspect, position and transparent outline.
    logo=Image.open(LOGO).convert('RGBA');lh=round(90*s);lw=round(lh*logo.width/logo.height)
    logo=logo.resize((lw,lh),Image.Resampling.LANCZOS);lx,ly=round(64*s),round(48*s)
    im.alpha_composite(logo,(lx,ly))
    f=font(44*s,650);lb=f.getbbox('rainbow鱼');th=lb[3]-lb[1]
    records=[{'type':'brand','text':'rainbow鱼','bbox':text(im,'rainbow鱼',lx+lw+20*s,ly+(lh-th)/2,44*s,COLORS['ink'],650)}]
    bx,by,bs=layout['badge'];f=font(bs,750);b=f.getbbox(CONFIG['series']);tw=b[2]-b[0];th=b[3]-b[1]
    pad=24*s;bh=th+36*s;bw=tw+2*pad
    assert bx+bw<=w-44*s,('Badge overflows',layout['ratio'],bx+bw,w)
    ImageDraw.Draw(im).rounded_rectangle([bx,by,bx+bw,by+bh],radius=12*s,fill=COLORS['badge'])
    records.append({'type':'series','text':CONFIG['series'],'bbox':[bx,by,bx+bw,by+bh],'textBox':text(im,CONFIG['series'],bx+pad,by+18*s,bs,'#ffffff',750)})
    for value,x,y,size,c in layout['title']:
      records.append({'type':'title','text':value,'bbox':text(im,value,x,y,size,COLORS[c])})
    assert ''.join(x[0] for x in layout['title'])==CONFIG['title']
    bodymask=hero.getchannel('A').point(lambda p:255 if p>150 else 0)
    overlaps=[]
    for row in records:
      b=row['bbox'];assert b[0]>=0 and b[1]>=0 and b[2]<=w and b[3]<=h,(layout['ratio'],row)
      if row['type']=='brand':continue
      region=[max(0,math.floor(b[0]-ox)),max(0,math.floor(b[1]-oy)),min(hero.width,math.ceil(b[2]-ox)),min(hero.height,math.ceil(b[3]-oy))]
      pixels=0
      if region[2]>region[0] and region[3]>region[1]:pixels=bodymask.crop(region).histogram()[255]
      overlaps.append({'text':row['text'],'opaqueHeroPixels':pixels})
      assert pixels==0,('Text overlaps opaque hero',layout['ratio'],row['text'],pixels)
    for i,a in enumerate(records):
      for b in records[i+1:]:assert intersect(a['bbox'],b['bbox'])==0,('Text collision',a,b)
    filename=f"Roadster_封面_{layout['ratio']}.jpg";p=OUT/filename
    im.convert('RGB').save(p,quality=95,subsampling=0,icc_profile=ICC)
    return {'ratio':layout['ratio'],'file':p.name,'size':[w,h],'sha256':sha(p),'mode':'RGB','icc':'sRGB','asset':str(asset.relative_to(PROJECT)),'assetSha256':sha(asset),'alphaSourceBox':bbox,'heroPlacement':[ox,oy,hero.width,hero.height],'textBoxes':records,'textModelOverlap':overlaps,'logo':[lx,ly,lw,lh],'manualReview':'pending'}

rows=[compose(l) for l in CONFIG['layouts']]
report={'title':CONFIG['title'],'series':CONFIG['series'],'tool':'Three.js original project model, Pillow precise typography','font':str(FONT.relative_to(PROJECT)),'fontSha256':sha(FONT),'logo':str(LOGO.relative_to(PROJECT)),'logoSha256':sha(LOGO),'layoutSha256':sha(ROOT/'layouts.json'),'covers':rows}
(ROOT/'layout-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
# Compact contact sheets at exact long-edge sizes for small-screen readability.
for edge in [320,160]:
    sheet=Image.new('RGB',(edge*4+100,edge+100),'#e8edeb');d=ImageDraw.Draw(sheet)
    for i,row in enumerate(rows):
      im=Image.open(OUT/row['file']);im.thumbnail((edge,edge),Image.Resampling.LANCZOS)
      x=20+i*(edge+20);sheet.paste(im,(x,52));d.text((x,12),row['ratio'],font=font(24,700),fill=COLORS['ink'])
    sheet.save(OUT/f'四比例缩图_{edge}.jpg',quality=95,subsampling=0,icc_profile=ICC)
print(json.dumps({'files':[r['file'] for r in rows],'checks':'dimensions, exact text, text collision, opaque hero collision, branding, ICC'},ensure_ascii=False))
