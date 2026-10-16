from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageCms, ImageFilter
import json, hashlib, math

ROOT=Path(__file__).resolve().parent
ART=ROOT/'cover_artwork'
OUT=ROOT/'delivery/episode3/covers_v2'
OUT.mkdir(parents=True,exist_ok=True)
LOGO=Path(r'C:/Users/zju/Desktop/logo/logo.png')
FONT_BOLD=Path(r'C:/Windows/Fonts/msyhbd.ttc')
FONT_REG=Path(r'C:/Windows/Fonts/msyh.ttc')
FONT_SERIF=Path(r'C:/Windows/Fonts/NotoSerifSC-VF.ttf')

specs={
  # Each ratio has its own label-safe band.  Labels sit in the open air above
  # the joint models rather than on top of the wood geometry.
  '16x9': {'size':(1920,1080),'scene':'scene_16x9.png','layout':'landscape','title_xy':(90,330),'title_size':112,'step':132,'capsule_y':224,'labels':[(.16,.595,'燕尾'),(.49,.705,'半搭接'),(.73,.595,'穿销')],'heat_label':(.73,.38)},
  '3x4': {'size':(1440,1920),'scene':'scene_3x4.png','layout':'portrait','title_xy':(92,270),'title_size':95,'step':115,'capsule_y':214,'labels':[(.16,.555,'燕尾'),(.49,.635,'半搭接'),(.74,.555,'穿销')],'heat_label':(.72,.37)},
  '4x3': {'size':(1920,1440),'scene':'scene_4x3.png','layout':'landscape','title_xy':(92,325),'title_size':92,'step':112,'capsule_y':250,'labels':[(.16,.585,'燕尾'),(.49,.685,'半搭接'),(.73,.585,'穿销')],'heat_label':(.73,.39)},
  '9x16': {'size':(1080,1920),'scene':'scene_9x16.png','layout':'portrait','title_xy':(72,282),'title_size':126,'step':150,'capsule_y':204,'labels':[(.19,.565,'燕尾'),(.50,.635,'半搭接'),(.76,.565,'穿销')],'heat_label':(.70,.37)},
}
INK='#17383a'; CREAM='#f7f0df'; TEAL='#4c8985'; BRASS='#b77b3e'; MUTED='#d5c9ad'

def font(path,size): return ImageFont.truetype(str(path),max(8,int(size)))
def sround(v,scale): return int(round(v*scale))
def add_left_wash(im, layout, scale):
    w,h=im.size
    ov=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(ov)
    if layout=='landscape':
        fade=int(1100*scale)
        for x in range(min(w,fade)):
            a=int(132*((1-x/fade)**1.35))
            d.line((x,0,x,h),fill=(247,240,223,a))
    else:
        fade=int(760*scale)
        for y in range(min(h,fade)):
            a=int(118*((1-y/fade)**1.3))
            d.line((0,y,w,y),fill=(247,240,223,a))
    return Image.alpha_composite(im.convert('RGBA'),ov)

def add_brand(im, scale):
    d=ImageDraw.Draw(im)
    mark=Image.open(LOGO).convert('RGBA')
    bh=sround(90,scale); bw=round(bh*mark.width/mark.height)
    x=sround(64,scale); y=sround(48,scale)
    im.alpha_composite(mark.resize((bw,bh),Image.Resampling.LANCZOS),(x,y))
    d=ImageDraw.Draw(im)
    d.text((x+bw+sround(20,scale),y+bh*.51),'rainbow鱼',font=font(FONT_BOLD,sround(44,scale)),fill=INK,anchor='lm')
    return {'x':x,'y':y,'width':bw,'height':bh,'gap':sround(20,scale),'font':sround(44,scale)}

def add_capsule(d,text,x,y,scale):
    f=font(FONT_BOLD,sround(30,scale)); bb=d.textbbox((0,0),text,font=f)
    padx=sround(18,scale); pady=sround(11,scale)
    box=(x,y,x+(bb[2]-bb[0])+padx*2,y+(bb[3]-bb[1])+pady*2)
    d.rounded_rectangle(box,radius=sround(14,scale),fill=INK)
    d.text((x+padx,y+pady-1),text,font=f,fill=CREAM)
    return box

def add_title(d, spec, scale):
    x=sround(spec['title_xy'][0],scale); y=sround(spec['title_xy'][1],scale)
    f=font(FONT_BOLD,sround(spec['title_size'],scale)); step=sround(spec['step'],scale)
    lines=['木头怎样','咬住木头？']
    for i,line in enumerate(lines):
        # very soft paper shadow keeps the title legible over a bright edge
        d.text((x+sround(2,scale),y+i*step+sround(3,scale)),line,font=f,fill=(247,240,223,120))
        d.text((x,y+i*step),line,font=f,fill=INK)
    return {'x':x,'y':y,'w':max(d.textbbox((x,y+i*step),line,font=f)[2]-x for i,line in enumerate(lines)),'h':step*2}

def add_labels(d,spec,scale):
    w,h=spec['size']; f=font(FONT_BOLD,sround(39 if spec['layout']=='landscape' else 42,scale))
    label_boxes=[]
    for xn,yn,label in spec['labels']:
        x=int(w*xn); y=int(h*yn)
        # A small teal point and a short line make the label feel connected to the object.
        r=sround(5,scale)
        d.ellipse((x-r,y-r,x+r,y+r),fill=TEAL)
        d.line((x+sround(12,scale),y,x+sround(74,scale),y),fill=TEAL,width=max(2,sround(3,scale)))
        d.text((x+sround(88,scale),y-sround(2,scale)),label,font=f,fill=INK,anchor='lm')
        label_boxes.append((label,x,y))
    return label_boxes

def add_heat_key(d,spec,scale):
    """A quiet, non-HUD legend that names the rigid wind-response pavilion."""
    w,h=spec['size']; xn,yn=spec['heat_label']; x=int(w*xn); y=int(h*yn)
    f=font(FONT_BOLD,sround(28 if spec['layout']=='landscape' else 30,scale))
    d.text((x,y), '风力响应', font=f, fill=INK, anchor='lm')
    x0=x+sround(132 if spec['layout']=='landscape' else 118,scale)
    width=sround(118 if spec['layout']=='landscape' else 100,scale)
    seg=max(2,width//5)
    colors=['#1b75bb','#34a9a2','#e5be45','#e47736','#be4436']
    for i,c in enumerate(colors):
        d.line((x0+i*seg,y,x0+(i+1)*seg,y),fill=c,width=sround(7,scale))
    return {'x':x,'y':y,'colors':colors}

def compose(name,spec):
    im=Image.open(ART/spec['scene']).convert('RGBA')
    assert im.size==spec['size'],(name,im.size,spec['size'])
    scale=min(spec['size'])/1080
    im=add_left_wash(im,spec['layout'],scale)
    brand=add_brand(im,scale)
    d=ImageDraw.Draw(im)
    cap=add_capsule(d,'每天5分钟科普 · 榫卯',sround(90 if spec['layout']=='landscape' else 72,scale),sround(spec['capsule_y'],scale),scale)
    title=add_title(d,spec,scale)
    labels=add_labels(d,spec,scale)
    heat_key=add_heat_key(d,spec,scale)
    # sRGB ICC and high quality JPG
    rgb=im.convert('RGB')
    icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    out=OUT/f'榫卯_封面_{name}.jpg'; rgb.save(out,'JPEG',quality=95,subsampling=0,optimize=True,icc_profile=icc)
    # Keep an editable PNG alongside the delivery JPG.
    im.save(OUT/f'榫卯_封面_{name}_排版源.png',format='PNG')
    return {'file':out.name,'size':list(spec['size']),'format':'JPEG','color':'RGB / sRGB ICC','quality':95,'scene':spec['scene'],'brand':brand,'capsule':cap,'title':title,'labels':labels,'heat_key':heat_key,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}

records=[compose(name,spec) for name,spec in specs.items()]
(OUT/'layout.json').write_text(json.dumps({'series':'每天5分钟科普','topic':'榫卯','hook':'木头怎样咬住木头？','composition':'左侧拆解亭 + 右侧刚性风力热力亭 + 底部三种榫卯','assets':{'scene':'真实Blender GLB拼排','logo':str(LOGO)},'formats':specs},ensure_ascii=False,indent=2),encoding='utf8')
(OUT/'source-record.json').write_text(json.dumps({'tool':'Blender 5.1.2 + Pillow','models':['crafted-pavilion.glb','dovetail.glb','half-lap.glb','pegged.glb'],'logo':str(LOGO),'notes':'无字底图为真实GLB构图；四比例分别设置相机与标签安全区。左侧亭子按屋顶、椽子、梁、栏杆分层爆炸，右侧亭子保持刚性并以蓝—红热力色表达风力响应；文字后期精确排版，已移除“拆开看”行。'},ensure_ascii=False,indent=2),encoding='utf8')
(OUT/'cover-manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
# contact sheet with each full preview and 320/160 long-edge thumbnails
sheet=Image.new('RGB',(2100,1900),(238,234,223)); sd=ImageDraw.Draw(sheet); sf=font(FONT_BOLD,28)
for i,row in enumerate(records):
    p=OUT/row['file']; img=Image.open(p).convert('RGB'); img.thumbnail((920,650),Image.Resampling.LANCZOS)
    col=i%2; rr=i//2; x=col*1040+(1040-img.width)//2; y=rr*900+40
    sheet.paste(img,(x,y)); sd.text((col*1040+40,rr*900+710),f"{row['file']}  {row['size'][0]}×{row['size'][1]}",font=sf,fill=INK)
    t320=Image.open(p).convert('RGB'); t320.thumbnail((320,320),Image.Resampling.LANCZOS)
    t160=Image.open(p).convert('RGB'); t160.thumbnail((160,160),Image.Resampling.LANCZOS)
    # Deliver the same current artwork at the two thumbnail checks used by
    # the cover skill; stale thumbnails are a common source of false QA wins.
    t320.save(OUT/f'{p.stem}_thumb320.jpg','JPEG',quality=92,optimize=True)
    t160.save(OUT/f'{p.stem}_thumb160.jpg','JPEG',quality=92,optimize=True)
    sheet.paste(t320,(col*1040+50,rr*900+755)); sheet.paste(t160,(col*1040+400,rr*900+790))
sheet.save(OUT/'榫卯_封面_总览与缩略图.jpg','JPEG',quality=92)
print(json.dumps(records,ensure_ascii=False,indent=2))



