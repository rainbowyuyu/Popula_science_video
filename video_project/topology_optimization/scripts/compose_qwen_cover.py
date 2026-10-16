from pathlib import Path
import json, math, hashlib
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter, ImageEnhance, ImageCms

ROOT=Path(__file__).resolve().parents[1]
HERO=ROOT/'delivery/clickbait/generated_topology_hero.png'
LOGO=Path(r'C:/Users/zju/Desktop/logo/logo.png')
FONT=Path(r'C:/Windows/Fonts/msyhbd.ttc')
OUT=ROOT/'delivery/qwen-v2/covers'
INK=(17,52,64); PAPER=(249,246,237); TEAL=(38,139,151); AMBER=(225,150,61); CREAM=(255,250,238)

def ft(n): return ImageFont.truetype(str(FONT),int(n))
def dash(d,a,b,color,w,dash=15,gap=10):
    x1,y1=a;x2,y2=b;dx=x2-x1;dy=y2-y1;L=math.hypot(dx,dy)
    if L<1:return
    ux,uy=dx/L,dy/L;p=0
    while p<L:
        q=min(p+dash,L);d.line((x1+ux*p,y1+uy*p,x1+ux*q,y1+uy*q),fill=color,width=w);p=q+gap
def flow(d,pts,scale):
    p0,p1,p2,p3=pts; samples=[]
    for i in range(35):
        t=i/34;u=1-t
        samples.append((round(u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0]),round(u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1])))
    col=(*AMBER,235); w=max(3,round(4*scale))
    for a,b in zip(samples,samples[1:]):d.line((*a,*b),fill=col,width=w)
    # tapered endpoint, very small and quiet
    e=samples[-1];q=samples[-5];ang=math.atan2(e[1]-q[1],e[0]-q[0]);L=round(13*scale)
    q1=(round(e[0]-L*math.cos(ang-.5)),round(e[1]-L*math.sin(ang-.5)));q2=(round(e[0]-L*math.cos(ang+.5)),round(e[1]-L*math.sin(ang+.5)))
    d.line((*q1,*e),fill=col,width=w);d.line((*q2,*e),fill=col,width=w)
def square_domain(d,x,y,s,scale):
    # translucent square with a subtle glass edge and finite-element grid
    d.rounded_rectangle((x,y,x+s,y+s),radius=round(14*scale),fill=(230,154,72,56),outline=(205,125,58,220),width=max(2,round(3*scale)))
    for i in range(1,5):
        xx=x+round(s*i/5); yy=y+round(s*i/5)
        dash(d,(xx,y),(xx,y+s),(205,125,58,155),max(1,round(2*scale)),round(10*scale),round(8*scale))
        dash(d,(x,yy),(x+s,yy),(205,125,58,155),max(1,round(2*scale)),round(10*scale),round(8*scale))
    # fading cells: the void is readable without a label
    for fx,fy,r in ((.27,.32,5),(.58,.48,4),(.38,.72,3)):
        cx=x+round(s*fx);cy=y+round(s*fy);rr=round(r*scale);d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),fill=(239,174,92,220))
    # ghost outline of a removed cell
    gx=x+round(s*.58);gy=y+round(s*.18);gs=round(s*.24)
    dash(d,(gx,gy),(gx+gs,gy),(255,220,168,220),max(1,round(2*scale)),round(9*scale),round(7*scale))
    dash(d,(gx+gs,gy),(gx+gs,gy+gs),(255,220,168,220),max(1,round(2*scale)),round(9*scale),round(7*scale))
def add_brand(im,scale):
    d=ImageDraw.Draw(im); logo=Image.open(LOGO).convert('RGBA'); h=round(68*scale);w=round(h*logo.width/logo.height);x=round(48*scale);y=round(34*scale)
    d.rounded_rectangle((x-round(10*scale),y-round(8*scale),x+w+round(190*scale),y+h+round(8*scale)),radius=round(15*scale),fill=(255,250,238,225))
    im.alpha_composite(logo.resize((w,h),Image.Resampling.LANCZOS),(x,y));d.text((x+w+round(18*scale),y+h*.52),'rainbow鱼',font=ft(round(34*scale)),fill=INK,anchor='lm')
def add_title(im,scale,vertical):
    d=ImageDraw.Draw(im);x=round(58*scale); y=round(145*scale) if not vertical else round(168*scale)
    # The series tag is intentionally the strongest typographic block after the title:
    # large, high-contrast and with generous breathing room so it reads at thumbnail size.
    label='每天5分钟·拓扑优化'; f=ft(round(44*scale)); bb=d.textbbox((0,0),label,font=f)
    pw=bb[2]+round(52*scale); ph=round(78*scale)
    d.rounded_rectangle((x,y,x+pw,y+ph),radius=round(18*scale),fill=(8,22,29,250))
    d.text((x+round(26*scale),y+ph/2),label,font=f,fill=(255,255,250),anchor='lm')
    title=['支架凭什么','敢挖空？']; ty=y+ph+round(24*scale); size=round(82*scale) if not vertical else round(86*scale); gap=round(90*scale)
    for i,line in enumerate(title):d.text((x,ty+i*gap),line,font=ft(size),fill=INK)
def base_bg(size,vertical=False):
    im=Image.open(HERO).convert('RGB');w,h=size
    if vertical:
        # Bring the hero closer to the title so the vertical cover reads as one composition.
        top=round(h*.42); hero=ImageOps.fit(im,(w, h-top),method=Image.Resampling.LANCZOS,centering=(.42,.55)).convert('RGBA');canvas=Image.new('RGBA',size,PAPER+(255,));canvas.alpha_composite(hero,(0,top))
        # warm upper field and a soft transition
        ov=Image.new('RGBA',size,(0,0,0,0));d=ImageDraw.Draw(ov)
        for y in range(top,min(h,top+180)):
            a=round(235*(1-(y-top)/180)**1.6);d.line((0,y,w,y),fill=PAPER+(a,))
        return Image.alpha_composite(canvas,ov)
    return ImageOps.fit(im,size,method=Image.Resampling.LANCZOS,centering=(.52,.55)).convert('RGBA')
def render_one(size,vertical=False):
    w,h=size;scale=min(size)/1080;im=base_bg(size,vertical);d=ImageDraw.Draw(im)
    # calm ivory veil leaves title readable while keeping the generated metal visible
    if not vertical:
        # A single broad veil keeps the photo present under the copy and lets it
        # dissolve naturally into the light background instead of creating a hard split.
        veil=Image.new('RGBA',size,(0,0,0,0)); vd=ImageDraw.Draw(veil)
        fade_start=round(w*.30); fade_end=round(w*.62)
        for xx in range(fade_end):
            if xx <= fade_start: a=220
            else: a=round(220*(1-(xx-fade_start)/(fade_end-fade_start))**1.15)
            vd.line((xx,0,xx,h),fill=PAPER+(max(0,min(230,a)),))
        im=Image.alpha_composite(im,veil);d=ImageDraw.Draw(im)
    add_brand(im,scale);add_title(im,scale,vertical)
    return im
def main():
    OUT.mkdir(parents=True,exist_ok=True);icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes();rows=[]
    formats={'16x9':(1920,1080,False),'4x3':(1920,1440,False),'3x4':(1440,1920,True),'9x16':(1080,1920,True)}
    for n,(w,h,v) in formats.items():
        p=OUT/f'封面_{n}.jpg';render_one((w,h),v).convert('RGB').save(p,'JPEG',quality=96,subsampling=0,optimize=True,icc_profile=icc);rows.append({'file':p.name,'size':[w,h],'format':'JPEG','color':'RGB / sRGB ICC','text':['每天5分钟·拓扑优化','支架凭什么敢挖空？'],'visual_source':'Qwen Image generated topology bracket + local typography/compositing','sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    (OUT/'cover-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
    sheet=Image.new('RGB',(1800,1160),'#172a31');sd=ImageDraw.Draw(sheet)
    for i,row in enumerate(rows):
        th=Image.open(OUT/row['file']);th.thumbnail((860,520),Image.Resampling.LANCZOS);x=(i%2)*900+(900-th.width)//2;y=(i//2)*580+12;sheet.paste(th,(x,y));sd.text(((i%2)*900+30,(i//2)*580+542),row['file']+'  '+str(row['size']),font=ft(22),fill=CREAM)
    sheet.save(OUT/'封面总览.jpg',quality=94,icc_profile=icc);Image.open(OUT/'封面_16x9.jpg').save(ROOT/'delivery/qwen-v2/封面.jpg',quality=96,icc_profile=icc)
if __name__=='__main__':main()
