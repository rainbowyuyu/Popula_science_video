from pathlib import Path
import json, math, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageCms

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'delivery' / 'v3' / 'covers' / 'cover-bg-topology.jpg'
LOGO = Path(r'C:/Users/zju/Desktop/logo/logo.png')
FONT_BOLD = Path(r'C:/Windows/Fonts/msyhbd.ttc')
OUT = ROOT / 'delivery' / 'clickbait' / 'covers'

INK = (18, 53, 64)
CREAM = (255, 250, 235)
YELLOW = (237, 164, 60)
CORAL = (232, 106, 79)
CYAN = (42, 157, 156)

def font(size):
    return ImageFont.truetype(str(FONT_BOLD), int(size))

def lerp(a, b, t):
    return tuple(int(a[i]*(1-t)+b[i]*t) for i in range(3))

def light_canvas(size):
    w, h = size
    arr = np.zeros((h,w,3), dtype=np.uint8)
    for y in range(h):
        for x in range(w):
            # Warm paper at the text side, cool glassy light around the model.
            t=x/max(1,w-1)
            base=lerp((248,245,236),(231,241,242),t)
            dx=(x-w*.63)/(w*.64); dy=(y-h*.50)/(h*.75)
            glow=max(0.0,1.0-math.sqrt(dx*dx+dy*dy))
            arr[y,x]=lerp(base,(255,250,232),glow*.18)
    return Image.fromarray(arr,'RGB').convert('RGBA')

def dashed(draw, a, b, color, width, dash=18, gap=12):
    x1,y1=a; x2,y2=b; dx=x2-x1; dy=y2-y1; length=math.hypot(dx,dy)
    if not length: return
    ux,uy=dx/length,dy/length; p=0
    while p<length:
        q=min(p+dash,length)
        draw.line((x1+ux*p,y1+uy*p,x1+ux*q,y1+uy*q),fill=color,width=width)
        p=q+gap

def arrow(draw,a,b,color,width):
    draw.line((*a,*b),fill=color,width=width)
    ang=math.atan2(b[1]-a[1],b[0]-a[0]); L=width*5
    p1=(b[0]-L*math.cos(ang-.5), b[1]-L*math.sin(ang-.5))
    p2=(b[0]-L*math.cos(ang+.5), b[1]-L*math.sin(ang+.5))
    draw.polygon([b,p1,p2],fill=color)

def flow_arrow(draw, points, color, scale):
    """Draw a restrained cubic flow line with a chevron head, rather than a heavy UI arrow."""
    p0,p1,p2,p3=points
    samples=[]
    for i in range(31):
        t=i/30; u=1-t
        x=u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0]
        y=u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1]
        samples.append((round(x),round(y)))
    core=tuple(color)+(225,)
    core_w=max(3,round(4*scale))
    for a,b in zip(samples,samples[1:]):
        draw.line((*a,*b),fill=core,width=core_w)
    # Small source halo and a clean chevron at the destination.
    sr=max(3,round(5*scale)); sx,sy=samples[0]
    draw.ellipse((sx-sr,sy-sr,sx+sr,sy+sr),fill=(color[0],color[1],color[2],90))
    end=samples[-1]; prev=samples[-5]
    ang=math.atan2(end[1]-prev[1],end[0]-prev[0]); head=round(16*scale); spread=.52
    q1=(round(end[0]-head*math.cos(ang-spread)),round(end[1]-head*math.sin(ang-spread)))
    q2=(round(end[0]-head*math.cos(ang+spread)),round(end[1]-head*math.sin(ang+spread)))
    draw.line((*q1,*end),fill=core,width=core_w)
    draw.line((*q2,*end),fill=core,width=core_w)

def subject_rgba(src):
    # Pull the shelf/bracket from the clean Three.js frame without carrying its old text.
    crop=src.crop((430,170,1710,990)).convert('RGB')
    a=np.array(crop).astype(np.int16)
    sat=a.max(axis=2)-a.min(axis=2)
    dark=255-a.min(axis=2)
    alpha=np.clip((sat*4 + dark*1.45 - 95)*2.7,0,255).astype(np.uint8)
    # Keep the warm shelf and books, while suppressing the pale wall and floor.
    rgba=np.dstack([a.astype(np.uint8),alpha])
    out=Image.fromarray(rgba,'RGBA')
    out=out.filter(ImageFilter.GaussianBlur(0.25))
    return out

def recolor_subject(im):
    # Add contrast and a cyan rim so the final organic bracket reads at thumbnail size.
    rgb=im.convert('RGB')
    rgb=ImageEnhance.Contrast(rgb).enhance(1.35)
    rgb=ImageEnhance.Color(rgb).enhance(1.22)
    return Image.merge('RGBA',(*rgb.split(),im.getchannel('A')))

def design_domain(draw, box, scale):
    x1,y1,side=box; x2,y2=x1+side,y1+side
    # A true square design domain: a finite-element style field before material is removed.
    off=(round(25*scale),round(-22*scale))
    back=[(x1+off[0],y1+off[1]),(x2+off[0],y1+off[1]),(x2+off[0],y2+off[1]),(x1+off[0],y2+off[1])]
    front=[(x1,y1),(x2,y1),(x2,y2),(x1,y2)]
    draw.polygon(back,fill=(238,151,75,55))
    draw.polygon(front,fill=(238,151,75,92))
    draw.line(front+[front[0]],fill=(205,113,70,220),width=max(2,round(3*scale)))
    for a,b in zip(back,back[1:]+[back[0]]): dashed(draw,a,b,(205,113,70,170),max(2,round(2*scale)),round(13*scale),round(9*scale))
    for a,b in zip(front,back): draw.line((*a,*b),fill=(205,113,70,145),width=max(2,round(2*scale)))
    # Square grid communicates the discretized design variables without adding labels.
    for t in (.2,.4,.6,.8):
        xx=round(x1+side*t); yy=round(y1+side*t)
        dashed(draw,(xx,y1),(xx,y2),(205,113,70,125),max(1,round(2*scale)),round(10*scale),round(8*scale))
        dashed(draw,(x1,yy),(x2,yy),(205,113,70,125),max(1,round(2*scale)),round(10*scale),round(8*scale))
    for fx,fy in ((.25,.28),(.56,.45),(.76,.68),(.36,.78)):
        cx,cy=round(x1+side*fx),round(y1+side*fy); rr=round(4*scale)
        draw.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),fill=(255,176,90,220))

def add_brand(im, scale, dark=True):
    d=ImageDraw.Draw(im)
    logo=Image.open(LOGO).convert('RGBA')
    h=round(68*scale); w=round(h*logo.width/logo.height)
    x=round(48*scale); y=round(38*scale)
    # Cream chip lets the user logo remain the actual PNG even on the dark treatment.
    d.rounded_rectangle((x-round(10*scale),y-round(8*scale),x+w+round(190*scale),y+h+round(8*scale)),radius=round(16*scale),fill=(255,250,235,225))
    im.alpha_composite(logo.resize((w,h),Image.Resampling.LANCZOS),(x,y))
    d.text((x+w+round(18*scale),y+h*.52),'rainbow鱼',font=font(round(34*scale)),fill=INK,anchor='lm')

def add_text(im, scale, vertical=False):
    d=ImageDraw.Draw(im)
    w,h=im.size
    x=round(58*scale); y=round(142*scale) if not vertical else round(175*scale)
    series='每天5分钟·拓扑优化'
    sb=font(round(32*scale)); bb=d.textbbox((0,0),series,font=sb)
    pw=bb[2]-bb[0]+round(38*scale); ph=round(60*scale)
    d.rounded_rectangle((x,y,x+pw,y+ph),radius=round(14*scale),fill=(12,27,34,245))
    d.text((x+round(19*scale),y+ph/2),series,font=sb,fill=CREAM,anchor='lm')
    title=['支架凭什么','敢挖空？']
    ty=y+ph+round(22*scale)
    size=round(82*scale) if not vertical else round(86*scale)
    gap=round(90*scale)
    for i,line in enumerate(title): d.text((x,ty+i*gap),line,font=font(size),fill=INK)

def render_one(src, size, vertical=False):
    w,h=size; scale=min(size)/1080
    im=light_canvas(size)
    d=ImageDraw.Draw(im)
    # Very soft diagonal rhythm, almost invisible at thumbnail size.
    for i in range(-h,w,round(150*scale)):
        d.line((i,0,i+h*.35,h),fill=(79,131,133,18),width=max(1,round(1*scale)))
    add_brand(im,scale)
    add_text(im,scale,vertical)
    if not vertical:
        # before block left/bottom; optimized part dominates the right.
        side=round(420*scale)
        dx,dy=round(w*.10),round(h*.55)
        design_domain(d,(dx,dy,side),scale)
        hero=subject_rgba(src); hero=recolor_subject(hero)
        hero=hero.resize((round(w*.62),round(h*.66)),Image.Resampling.LANCZOS)
        im.alpha_composite(hero,(round(w*.39),round(h*.29)))
        d=ImageDraw.Draw(im)
        # The flow sits on the design-domain centreline and lands at the bracket's left root.
        midy=dy+side//2
        start=(dx+side+round(18*scale),midy)
        end=(round(w*.52),midy+round(12*scale))
        flow_arrow(d,[start,(start[0]+round(90*scale),midy-round(34*scale)),(end[0]-round(90*scale),end[1]-round(26*scale)),end],YELLOW,scale)
        # disappearing particles bridge the two states.
        for fx,fy,r in [(0.46,.58,7),(0.50,.53,5),(0.54,.57,4),(0.57,.50,3)]:
            cx,cy=round(w*fx),round(h*fy); rr=round(r*scale); d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),fill=CYAN)
    else:
        # Vertical thumbnail: text above, visual story below with a large diagonal split.
        hero=subject_rgba(src); hero=recolor_subject(hero)
        hero=hero.resize((round(w*.94),round(h*.46)),Image.Resampling.LANCZOS)
        im.alpha_composite(hero,(round(w*.03),round(h*.47)))
        d=ImageDraw.Draw(im)
        side=round(360*scale)
        dx,dy=round(w*.05),round(h*.72)
        design_domain(d,(dx,dy,side),scale)
        midy=dy+side//2
        start=(dx+side+round(12*scale),midy)
        end=(round(w*.66),midy-round(10*scale))
        flow_arrow(d,[start,(start[0]+round(70*scale),midy-round(28*scale)),(end[0]-round(70*scale),end[1]-round(24*scale)),end],YELLOW,scale)
        for fx,fy,r in [(0.43,.69,7),(0.49,.66,5),(0.55,.63,4)]:
            cx,cy=round(w*fx),round(h*fy); rr=round(r*scale); d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),fill=CYAN)
    return im

def render():
    OUT.mkdir(parents=True,exist_ok=True)
    src=Image.open(SOURCE).convert('RGB')
    formats={'16x9':(1920,1080,False),'4x3':(1920,1440,False),'3x4':(1440,1920,True),'9x16':(1080,1920,True)}
    rows=[]; icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    for name,(w,h,v) in formats.items():
        out=OUT/f'封面_{name}.jpg'; im=render_one(src,(w,h),v)
        im.convert('RGB').save(out,'JPEG',quality=96,subsampling=0,optimize=True,icc_profile=icc)
        rows.append({'file':out.name,'size':[w,h],'format':'JPEG','color':'RGB / sRGB ICC','concept':'solid material -> removed material -> optimized bracket','text':['每天5分钟·拓扑优化','支架凭什么敢挖空？'],'sha256':hashlib.sha256(out.read_bytes()).hexdigest()})
    (OUT/'cover-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
    sheet=Image.new('RGB',(1800,1160),'#08121c'); sd=ImageDraw.Draw(sheet)
    for i,row in enumerate(rows):
        th=Image.open(OUT/row['file']); th.thumbnail((860,520),Image.Resampling.LANCZOS); x=(i%2)*900+(900-th.width)//2; y=(i//2)*580+12
        sheet.paste(th,(x,y)); sd.text(((i%2)*900+30,(i//2)*580+542),row['file']+'  '+str(row['size']),font=font(22),fill=CREAM)
    sheet.save(OUT/'封面总览.jpg',quality=94,icc_profile=icc)
    Image.open(OUT/'封面_16x9.jpg').save(ROOT/'delivery'/'clickbait'/'封面.jpg',quality=96,icc_profile=icc)
    return rows

if __name__=='__main__': print(json.dumps(render(),ensure_ascii=False,indent=2))
