from pathlib import Path
import json, hashlib, math
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageEnhance, ImageFilter, ImageCms

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'delivery' / 'v4' / 'covers'
BG = ROOT / 'delivery' / 'v3' / 'covers' / 'cover-bg-topology.jpg'
LOGO = Path(r'C:/Users/zju/Desktop/logo/logo.png')
FONT = Path(r'C:/Windows/Fonts/msyhbd.ttc')

INK = '#143746'
CREAM = '#F5EFE3'
CORAL = '#E4775D'
TEAL = '#2B9D9C'

def font(size):
    return ImageFont.truetype(str(FONT), size)

def dashed_segment(draw, p1, p2, color, width, dash, gap):
    x1, y1 = p1; x2, y2 = p2
    dx, dy = x2-x1, y2-y1
    length = math.hypot(dx, dy)
    if length <= 0: return
    ux, uy = dx/length, dy/length
    pos = 0
    while pos < length:
        end = min(pos + dash, length)
        draw.line((x1+ux*pos, y1+uy*pos, x1+ux*end, y1+uy*end), fill=color, width=width)
        pos = end + gap

def dashed_path(draw, points, color, width, dash, gap, close=False):
    pts = list(points)
    if close: pts.append(pts[0])
    for a, b in zip(pts, pts[1:]):
        dashed_segment(draw, a, b, color, width, dash, gap)

def arrow(draw, p1, p2, color, width):
    draw.line((*p1, *p2), fill=color, width=width)
    ang = math.atan2(p2[1]-p1[1], p2[0]-p1[0])
    length = width * 4.5
    a = 0.48
    q1 = (p2[0]-length*math.cos(ang-a), p2[1]-length*math.sin(ang-a))
    q2 = (p2[0]-length*math.cos(ang+a), p2[1]-length*math.sin(ang+a))
    draw.polygon([p2, q1, q2], fill=color)

def grade(photo):
    photo = ImageEnhance.Contrast(photo).enhance(1.10)
    photo = ImageEnhance.Color(photo).enhance(1.18)
    photo = ImageEnhance.Sharpness(photo).enhance(1.12)
    return photo

def background(photo, size, layout, hero_top=0, crop=None):
    w, h = size
    paper = Image.new('RGB', size, '#EEF2F0')
    if layout == 'landscape':
        im = ImageOps.fit(photo, size, method=Image.Resampling.LANCZOS, centering=(0.55, 0.50))
        im = grade(im).convert('RGBA')
        # warm editorial veil on the text side; the bracket remains crisp on the right.
        veil = Image.new('RGBA', size, (0,0,0,0)); vd = ImageDraw.Draw(veil)
        for x in range(w):
            t = max(0.0, 1-x/(w*0.58))
            vd.line((x,0,x,h), fill=(245,239,227, int(210*t**0.55)))
        im = Image.alpha_composite(im, veil)
    else:
        top = hero_top
        im = paper.convert('RGBA')
        box = [round(n*photo.width) if i % 2 == 0 else round(n*photo.height) for i,n in enumerate(crop)]
        hero = ImageOps.fit(grade(photo.crop(box)), (w, h-top), method=Image.Resampling.LANCZOS, centering=(0.52,0.52)).convert('RGBA')
        im.alpha_composite(hero, (0, top))
        # soft dissolve between the clean text field and the rendered scene.
        veil = Image.new('RGBA', size, (0,0,0,0)); vd=ImageDraw.Draw(veil)
        fade = min(190, h-top)
        for y in range(top, top+fade):
            t = (y-top)/fade
            vd.line((0,y,w,y), fill=(245,239,227, int(225*(1-t)**1.8)))
        im = Image.alpha_composite(im, veil)
    return im

def add_brand(im, scale, left=64, top=48):
    d = ImageDraw.Draw(im)
    logo = Image.open(LOGO).convert('RGBA')
    height = round(78*scale)
    width = round(height*logo.width/logo.height)
    x, y = round(left*scale), round(top*scale)
    im.alpha_composite(logo.resize((width,height), Image.Resampling.LANCZOS), (x,y))
    d.text((x+width+round(18*scale), y+height*0.52), 'rainbow鱼', font=font(round(42*scale)), fill=INK, anchor='lm')

def add_titles(im, scale, layout, size, title_lines):
    d = ImageDraw.Draw(im)
    if layout == 'landscape':
        x, y = round(78*scale), round(222*scale)
        pill_size = round(29*scale)
        title_size = round(96*scale)
        line_gap = round(104*scale)
    else:
        x, y = round(78*scale), round(208*scale)
        pill_size = round(29*scale)
        title_size = round(92*scale)
        line_gap = round(102*scale)
    series = '每天5分钟·拓扑优化'
    bbox = d.textbbox((0,0), series, font=font(pill_size))
    pw = bbox[2]-bbox[0] + round(34*scale)
    ph = round(52*scale)
    d.rounded_rectangle((x, y, x+pw, y+ph), radius=round(17*scale), fill=INK)
    d.text((x+round(17*scale), y+ph/2), series, font=font(pill_size), fill=CREAM, anchor='lm')
    ty = y + ph + round(28*scale)
    for i, line in enumerate(title_lines):
        d.text((x, ty+i*line_gap), line, font=font(title_size), fill=INK, anchor='lt')

def add_process(im, scale, layout, hero_top=0):
    d = ImageDraw.Draw(im)
    w, h = im.size
    if layout == 'landscape':
        # A dashed triangular envelope is the material that disappears. It follows the
        # bracket geometry, so it reads as a process rather than a UI selection box.
        pts = [(round(w*.34), round(h*.41)), (round(w*.78), round(h*.41)),
               (round(w*.57), round(h*.80)), (round(w*.40), round(h*.80))]
        dashed_path(d, pts, CORAL, max(3,round(3*scale)), round(18*scale), round(12*scale), close=True)
        # removed material drifts out of the envelope
        dots = [(0.48,0.57,8),(0.52,0.61,11),(0.57,0.64,7),(0.62,0.57,5),(0.66,0.50,4)]
        for fx,fy,r in dots:
            cx,cy=round(w*fx),round(h*fy); rr=round(r*scale)
            d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr), fill=TEAL)
        arrow(d,(round(w*.66),round(h*.50)),(round(w*.60),round(h*.57)),TEAL,max(3,round(3*scale)))
    else:
        top = hero_top
        pts = [(round(w*.12), round(top+(h-top)*.23)), (round(w*.90), round(top+(h-top)*.23)),
               (round(w*.62), round(top+(h-top)*.82)), (round(w*.16), round(top+(h-top)*.82))]
        dashed_path(d, pts, CORAL, max(3,round(3*scale)), round(16*scale), round(11*scale), close=True)
        dots = [(0.37,0.56,7),(0.46,0.61,10),(0.56,0.66,7),(0.66,0.57,5),(0.73,0.48,4)]
        for fx,fy,r in dots:
            cx,cy=round(w*fx),round(top+(h-top)*fy); rr=round(r*scale)
            d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr), fill=TEAL)
        arrow(d,(round(w*.74),round(top+(h-top)*.48)),(round(w*.66),round(top+(h-top)*.58)),TEAL,max(3,round(3*scale)))

def render():
    OUT.mkdir(parents=True, exist_ok=True)
    photo = Image.open(BG).convert('RGB')
    formats = {
        '16x9': ((1920,1080),'landscape',1.0,None),
        '4x3': ((1920,1440),'landscape',1.0,None),
        '3x4': ((1440,1920),'portrait',690,[0.08,0.03,0.97,0.99]),
        '9x16': ((1080,1920),'portrait',700,[0.08,0.03,0.97,0.99]),
    }
    rows=[]
    for name,(size,layout,hero_top,crop) in formats.items():
        scale=min(size)/1080
        im=background(photo,size,layout,round(hero_top*scale),crop)
        add_brand(im,scale)
        add_titles(im,scale,layout,size,['支架怎么','瘦成这样？'])
        add_process(im,scale,layout,round(hero_top*scale))
        out=OUT/f'封面_{name}.jpg'
        icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
        im.convert('RGB').save(out,'JPEG',quality=96,subsampling=0,optimize=True,icc_profile=icc)
        with Image.open(out) as check:
            assert check.size==size and check.mode=='RGB' and check.format=='JPEG'
        rows.append({'file':out.name,'size':list(size),'format':'JPEG','color':'RGB / sRGB ICC','layers':['logo','series badge','two-line hook','dashed disappearing material envelope','removed-material particles','optimized bracket'],'sha256':hashlib.sha256(out.read_bytes()).hexdigest()})
    (OUT/'cover-manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
    sheet=Image.new('RGB',(1800,1160),'#EEF2F0'); sd=ImageDraw.Draw(sheet)
    for i,row in enumerate(rows):
        th=Image.open(OUT/row['file']); th.thumbnail((860,520),Image.Resampling.LANCZOS)
        x=(i%2)*900+(900-th.width)//2; y=(i//2)*580+12
        sheet.paste(th,(x,y)); sd.text(((i%2)*900+30,(i//2)*580+542),row['file']+'   '+str(row['size']),font=font(22),fill=INK)
    sheet.save(OUT/'封面总览.jpg',quality=94,icc_profile=icc)
    return rows

if __name__ == '__main__':
    print(json.dumps(render(),ensure_ascii=False,indent=2))
