"""Reusable four-aspect JPG covers; Pillow required. Layout values use short-edge /1080 units."""
from pathlib import Path
import argparse,json,hashlib
from PIL import Image,ImageDraw,ImageFont,ImageOps,ImageCms,ImageColor

SKILL=Path(__file__).resolve().parents[1]
def fnt(path,size): return ImageFont.truetype(path,size)
def arrow(d,x1,y1,x2,y2,fill,width):
 d.line((x1,y1,x2,y2),fill=fill,width=width)
 import math
 a=math.atan2(y2-y1,x2-x1);h=max(10,width*4)
 d.polygon([(x2,y2),(x2-h*math.cos(a-.45),y2-h*math.sin(a-.45)),(x2-h*math.cos(a+.45),y2-h*math.sin(a+.45))],fill=fill)
def dashed_line(d,p1,p2,fill,width,dash=18,gap=12):
 import math
 x1,y1=p1;x2,y2=p2;dx=x2-x1;dy=y2-y1;length=math.hypot(dx,dy)
 if length<=0:return
 ux,uy=dx/length,dy/length;pos=0
 while pos<length:
  a=pos;b=min(pos+dash,length)
  d.line((x1+ux*a,y1+uy*a,x1+ux*b,y1+uy*b),fill=fill,width=width)
  pos=b+gap
def topology_overlay(im,d,config,scale,layout,width,height,hero_top=0):
 # The old solid volume appears as a faint dashed ghost; the rendered hollow bracket remains the answer.
 ghost=(225,112,88,190);accent=(47,139,143,210);paper=(248,239,219,225)
 if layout=='landscape':
  x1,y1,x2,y2=round(width*.31),round(height*.39),round(width*.79),round(height*.79)
 else:
  top=hero_top+round((height-hero_top)*.12);bottom=hero_top+round((height-hero_top)*.86)
  x1,x2=round(width*.10),round(width*.92);y1,y2=top,bottom
 # ghost envelope: material that disappears during optimization
 for a,b in [((x1,y1),(x2,y1)),((x2,y1),(x2,y2)),((x2,y2),(x1,y2)),((x1,y2),(x1,y1))]:
  dashed_line(d,a,b,ghost,max(2,round(3*scale)),dash=round(17*scale),gap=round(12*scale))
 # A soft trail of removed material, deliberately sparse and decorative.
 for i in range(7):
  cx=round(x1+(x2-x1)*(.26+.08*i));cy=round(y1+(y2-y1)*(.42+.045*i))
  r=max(3,round((5+(i%3)*2)*scale));d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=accent)
 # One curved-looking segmented arrow points from the ghost volume to the final load path.
 ax1,ay1=round(x2*.86),round(y1+(y2-y1)*.2);ax2,ay2=round(x2*.75),round(y1+(y2-y1)*.38)
 dashed_line(d,(ax1,ay1),(ax2,ay2),accent,max(2,round(3*scale)),dash=round(14*scale),gap=round(10*scale))
 arrow(d,ax2,ay2,ax2-round(12*scale),ay2+round(2*scale),accent,max(2,round(4*scale)))
def principle_overlay(im,d,config,scale,layout,width,height,hero_top=0):
 # A line-and-arrow annotation follows the rendered bracket; there is no detached panel.
 ink='#193643';teal='#3aa9a5';coral='#e27a59';paper='#f8efdb';
 labels=config.get('principle',['固定','受力','留材'])
 if layout=='landscape':
  y=height-round(120*scale); xs=[round(v*scale) for v in (115,370,650)]
  d.text((xs[0],y-round(54*scale)),"原理",font=fnt(config['font'],round(30*scale)),fill=ink)
  for i,label in enumerate(labels):
   d.text((xs[i],y),label,font=fnt(config['font'],round(34*scale)),fill=ink,anchor='lm')
   if i<2: arrow(d,xs[i]+round(90*scale),y,xs[i+1]-round(25*scale),y,teal,max(2,round(4*scale)))
  arrow(d,round(width*.76),round(height*.22),round(width*.76),round(height*.40),coral,max(2,round(5*scale)))
  d.text((round(width*.76)+round(16*scale),round(height*.20)),"100 N",font=fnt(config['font'],round(27*scale)),fill=coral)
  d.text((round(width*.53),round(height*.69)),"留下主承力路径",font=fnt(config['font'],round(30*scale)),fill=teal)
  d.text((xs[0],y+round(42*scale)),config.get('proof','100 N · 35% 材料 · SIMP'),font=fnt(config['font'],round(24*scale)),fill=ink)
 else:
  # Vertical covers place the same chain in the breathing space above the hero image.
  y=round((hero_top-60)*scale/scale); x=round(75*scale)
  line_y=y-round(58*scale)
  d.text((x,line_y),"原理",font=fnt(config['font'],round(28*scale)),fill=ink)
  centers=[x+round(v*scale) for v in (150,430,710)]
  for i,label in enumerate(labels):
   d.text((centers[i],y),label,font=fnt(config['font'],round(30*scale)),fill=ink,anchor='lm')
   if i<2: arrow(d,centers[i]+round(80*scale),y,centers[i+1]-round(22*scale),y,teal,max(2,round(3*scale)))
  arrow(d,centers[1],y-round(90*scale),centers[1],y-round(36*scale),coral,max(2,round(4*scale)))
  d.text((centers[1]+round(15*scale),y-round(102*scale)),"100 N",font=fnt(config['font'],round(23*scale)),fill=coral)
  d.text((x,y+round(38*scale)),config.get('proof','100 N · 35% 材料 · SIMP'),font=fnt(config['font'],round(23*scale)),fill=ink)
def render(config,source,logo,output):
 output=Path(output);output.mkdir(parents=True,exist_ok=True)
 photo=Image.open(source).convert('RGB');mark=Image.open(logo).convert('RGBA')
 icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
 ink=config['colors']['ink'];paper=ImageColor.getrgb(config['colors']['paper']);records=[]
 for name,spec in config['formats'].items():
  w,h=spec['size'];scale=min(w,h)/config['brand']['baseShortEdge'];px=lambda v:round(v*scale)
  if spec['layout']=='landscape':
   im=ImageOps.fit(photo,(w,h),method=Image.Resampling.LANCZOS,centering=tuple(spec['focus'])).convert('RGBA')
   veil=Image.new('RGBA',(w,h));d=ImageDraw.Draw(veil);fade=px(spec['fadeWidth'])
   for x in range(min(w,fade)):
    a=round(246*max(0,1-x/fade)**.48);d.line((x,0,x,h),fill=(*paper,a))
   im=Image.alpha_composite(im,veil)
  else:
   im=Image.new('RGBA',(w,h),(*paper,255));top=px(spec['heroTop'])
   box=[round(n*(photo.width if i%2==0 else photo.height)) for i,n in enumerate(spec['heroCrop'])]
   hero=ImageOps.fit(photo.crop(box),(w,h-top),method=Image.Resampling.LANCZOS)
   im.paste(hero,(0,top));veil=Image.new('RGBA',(w,h));d=ImageDraw.Draw(veil)
   # Soft photographic handoff, with no rectangular frame around the image.
   for y in range(top,min(h,top+px(170))):
    a=round(255*(1-(y-top)/px(170))**1.7);d.line((0,y,w,y),fill=(*paper,a))
   im=Image.alpha_composite(im,veil)
  b=config['brand'];bh=px(b['height']);bw=round(bh*mark.width/mark.height);x=px(b['left']);y=px(b['top'])
  im.alpha_composite(mark.resize((bw,bh),Image.Resampling.LANCZOS),(x,y));d=ImageDraw.Draw(im)
  wordfont=ImageFont.truetype(config['font'],px(b['fontSize']))
  d.text((x+bw+px(b['gap']),y+bh/2),b['text'],font=wordfont,fill=ink,anchor='lm')
  tx,ty,size,step=spec['title'];font=ImageFont.truetype(config['font'],px(size))
  # Minimal cover hierarchy: series badge + one playful title + one visual process.
  chapter=config.get('chapter','科普章节');
  d.rounded_rectangle((px(tx),px(ty-68),px(tx)+d.textlength(chapter,font=fnt(config['font'],px(30)))+px(34),px(ty-20)),radius=px(12),fill=ink)
  d.text((px(tx)+px(17),px(ty-44)),chapter,font=fnt(config['font'],px(30)),fill='#f8efdb',anchor='lm')
  assert len(config['title'])<=2,'Use at most two short title lines'
  bounds=[]
  for i,line in enumerate(config['title']):
   bbox=d.textbbox((px(tx),px(ty+i*step)),line,font=font,anchor='lt');assert bbox[2]<w-px(48),'Rewrite title; do not shrink it'
   d.text((px(tx),px(ty+i*step)),line,font=font,fill=ink,anchor='lt');bounds.append(bbox)
  if not config.get('minimal'):
   hook_y=px(ty+len(config['title'])*step+34)
   d.text((px(tx),hook_y),config.get('hook','问题 → 机制 → 结果'),font=fnt(config['font'],px(38)),fill=ink)
   principle_overlay(im,d,config,scale,spec['layout'],w,h,px(spec.get('heroTop',0)))
  else:
   topology_overlay(im,d,config,scale,spec['layout'],w,h,px(spec.get('heroTop',0)))
  dest=output/f'封面_{name}.jpg';im.convert('RGB').save(dest,'JPEG',quality=95,subsampling=0,optimize=True,icc_profile=icc)
  with Image.open(dest) as check:
   assert check.size==(w,h) and check.mode=='RGB' and check.format=='JPEG' and check.info.get('icc_profile')
  records.append({'file':dest.name,'size':[w,h],'format':'JPEG','color':'RGB / sRGB ICC','quality':95,'brand':{'left':x,'top':y,'height':bh,'imageWidth':bw,'gap':px(b['gap']),'fontSize':px(b['fontSize'])},'titleBounds':bounds,'contentLayers':['series badge','playful hook','dashed disappearing volume','optimized hollow bracket'],'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
 (output/'cover-manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
 sheet=Image.new('RGB',(1800,1160),'#eef0eb');d=ImageDraw.Draw(sheet)
 for i,row in enumerate(records):
  thumb=Image.open(output/row['file']);thumb.thumbnail((860,520),Image.Resampling.LANCZOS);x=(i%2)*900+(900-thumb.width)//2;y=(i//2)*580+12
  sheet.paste(thumb,(x,y));d.text(((i%2)*900+30,(i//2)*580+542),row['file']+'   '+str(row['size']),font=ImageFont.truetype(config['font'],22),fill=ink)
 sheet.save(output/'封面总览.jpg',quality=92,icc_profile=icc)
 return records
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--image',required=True);p.add_argument('--output',required=True);p.add_argument('--config',default=str(SKILL/'assets/cover-template.json'));p.add_argument('--logo',default=str(SKILL/'assets/logo.png'));a=p.parse_args()
 print(json.dumps(render(json.loads(Path(a.config).read_text('utf8')),a.image,a.logo,a.output),ensure_ascii=False,indent=2))
