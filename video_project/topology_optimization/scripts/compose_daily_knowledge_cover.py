from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageOps,ImageEnhance,ImageCms
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'delivery'/'daily-life-knowledge'; OUT.mkdir(parents=True,exist_ok=True)
hero=Image.open(OUT/'generated_collection_hero_v2.png').convert('RGB').resize((2048,2048),Image.Resampling.LANCZOS)
canvas=hero.convert('RGBA')
# Softened upper copy veil keeps the typography readable without covering the generated still life.
veil=Image.new('RGBA',(2048,2048),(0,0,0,0));vd=ImageDraw.Draw(veil)
for y in range(0,760):
    a=int(132*(1-y/760)**1.3)
    vd.line((0,y,2048,y),fill=(250,247,238,a))
canvas=Image.alpha_composite(canvas,veil)
d=ImageDraw.Draw(canvas)
font_path=Path(r'C:/Windows/Fonts/msyhbd.ttc')
reg_path=Path(r'C:/Windows/Fonts/msyh.ttc')
def f(size,bold=True): return ImageFont.truetype(str(font_path if bold else reg_path),size)
ink=(20,49,60,255); teal=(8,127,133,255); cream=(255,252,243,255)
# Brand mark with the user-provided logo. The source PNG has an opaque white
# canvas, so remove near-white pixels first and place the mark directly on the
# image. This keeps the logo light and integrated instead of adding another
# competing block of color.
logo=Image.open(Path(r'C:/Users/zju/Desktop/logo/logo.png')).convert('RGBA')
pix=logo.load()
for yy in range(logo.height):
    for xx in range(logo.width):
        rr,gg,bb,aa=pix[xx,yy]
        if rr>245 and gg>245 and bb>245:
            pix[xx,yy]=(rr,gg,bb,0)
lh=128; lw=int(lh*logo.width/logo.height)
canvas.alpha_composite(logo.resize((lw,lh),Image.Resampling.LANCZOS),(78,66))
d.text((78+lw+30,130),'rainbow鱼',font=f(54),fill=ink,anchor='lm')
# Main title, set into the calm cyan circle.
d.text((1024,320),'每天5分钟',font=f(180),fill=ink,anchor='mm')
d.text((1024,500),'生活中的新知识',font=f(112),fill=ink,anchor='mm')
# One restrained metadata line; the two large title lines carry the hierarchy.
# A soft lower veil makes the larger auxiliary text readable without creating
# a hard card or a second visual block over the still life.
lower=Image.new('RGBA',(2048,2048),(0,0,0,0)); ld=ImageDraw.Draw(lower)
for yy in range(1770,2048):
    t=(yy-1770)/278
    a=int(112*(1-t)**1.35)
    ld.line((0,yy,2048,yy),fill=(20,49,60,a))
lower=lower.filter(ImageFilter.GaussianBlur(28))
canvas=Image.alpha_composite(canvas,lower)
d=ImageDraw.Draw(canvas)
label='物理   ·   机械   ·   生物   ·   日常'
d.text((1024,1885),label,font=f(48,False),fill=(255,252,243,238),anchor='mm',stroke_width=2,stroke_fill=(20,49,60,150))
# Color and export.
canvas=ImageEnhance.Color(canvas).enhance(1.04)
rgb=canvas.convert('RGB');icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
rgb.save(OUT/'合集封面_1x1.jpg','JPEG',quality=97,subsampling=0,optimize=True,icc_profile=icc)
rgb.save(OUT/'合集封面_1x1.png','PNG',optimize=True)
print(OUT/'合集封面_1x1.jpg')
