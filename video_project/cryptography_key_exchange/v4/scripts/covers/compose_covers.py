"""Four independently laid out cryptography posters; art is Blender-rendered.

Run from project root: python scripts/covers/compose_covers.py [--draft]
No video/source/audio files are modified.
"""
from pathlib import Path
import argparse, hashlib, json, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageCms, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'delivery/covers'
SOURCE = ROOT / 'artwork/covers'
CONFIG = ROOT / 'scripts/covers/layouts.json'
FONT_PATHS = {
    'sans': Path('C:/Windows/Fonts/NotoSansSC-VF.ttf'),
    'serif': Path('C:/Windows/Fonts/NotoSerifSC-VF.ttf'),
}
INK = '#123F43'
SUB = '#25575B'
PROFILE = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def font(family, size, weight=600):
    saved = SOURCE / 'fonts' / f'{family}.ttf'
    f = ImageFont.truetype(str(saved if saved.exists() else FONT_PATHS[family]), round(size))
    try:
        axes = f.get_variation_axes()
        f.set_variation_by_axes([weight if a['name'] == b'Weight' else a['default'] for a in axes])
    except (AttributeError, OSError):
        pass
    return f


def prepare_fonts():
    from fontTools import subset
    target = SOURCE / 'fonts'
    target.mkdir(parents=True, exist_ok=True)
    chars = '密码学没约过，怎么保密？每天5分钟科普rainbow鱼16:943 /'
    for family, source in FONT_PATHS.items():
        dest = target / f'{family}.ttf'
        if dest.exists():
            continue
        options = subset.Options()
        options.name_IDs = ['*']
        options.name_languages = ['*']
        options.recalc_timestamp = False
        f = subset.load_font(str(source), options)
        s = subset.Subsetter(options=options)
        s.populate(text=chars)
        s.subset(f)
        subset.save_font(f, str(dest), options)
    shutil.copy2(ROOT / 'public/fonts/OFL.txt', target / 'OFL.txt')


def background(w, h):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    glow = np.exp(-((xx/w-.18)**2/.8+(yy/h-.16)**2/.7))
    edge = (xx/w) * .8 + (yy/h) * .5
    rng = np.random.default_rng(20261015)
    grain = rng.normal(0, .28, (h, w))
    base = np.array([238, 235, 226], np.float32)
    rgb = base + glow[..., None]*12 - edge[..., None]*1.2 + grain[..., None]
    return Image.fromarray(np.uint8(np.clip(rgb, 0, 255)), 'RGB').convert('RGBA')


def text(draw, xy, value, family, size, weight, color):
    f = font(family, size, weight)
    box = draw.textbbox((0, 0), value, font=f)
    pos = (round(xy[0]-box[0]), round(xy[1]-box[1]))
    draw.text(pos, value, font=f, fill=color)
    return [round(xy[0]), round(xy[1]), round(xy[0]+box[2]-box[0]), round(xy[1]+box[3]-box[1])]


def art_image(path):
    im = Image.open(path).convert('RGBA')
    alpha = np.array(im.getchannel('A'))
    # Ignore remote near-transparent shadow-catcher noise when framing the art.
    bbox = Image.fromarray(np.uint8(alpha > 24)*255).getbbox()
    p = round(im.width*.025)
    box = (max(0,bbox[0]-p), max(0,bbox[1]-p), min(im.width,bbox[2]+p), min(im.height,bbox[3]+p))
    im = im.crop(box)
    a = np.array(im.getchannel('A'), dtype=np.float32)
    a = np.where(a < 12, 0, (a-12)*255/243)
    yy,xx=np.mgrid[0:im.height,0:im.width]
    edge=np.minimum(np.minimum(xx,im.width-1-xx),np.minimum(yy,im.height-1-yy))
    a *= np.clip(edge/max(1,p*.6),0,1)
    im.putalpha(Image.fromarray(np.uint8(np.clip(a,0,255))))
    return im, list(box)


def intersect(a, b):
    return max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))


def compose(spec, draft):
    w, h = spec['size']
    canvas = background(w, h)
    variant = spec['hero']['variant']
    src = ROOT / ('work/cover-art' if draft else 'delivery/covers/artwork') / f'{variant}-draft.png'
    if not draft:
        candidates = [ROOT/'delivery/covers/artwork'/f'{variant}-hero.png', ROOT/'artwork/covers'/f'{variant}.png', ROOT/'delivery/covers/artwork'/f'{variant}.png', ROOT/'work/cover-art'/f'{variant}-final.png']
        src = next((p for p in candidates if p.exists()), src)
    hero, crop = art_image(src)
    art_w = spec['hero']['width']
    hero = hero.resize((art_w, round(art_w*hero.height/hero.width)), Image.Resampling.LANCZOS)
    hx, hy = spec['hero']['xy']
    canvas.alpha_composite(hero, (hx, hy))
    hero_mask = Image.new('L', (w,h))
    hero_mask.paste(hero.getchannel('A'), (hx,hy))
    d = ImageDraw.Draw(canvas)
    boxes = []
    s = min(w,h)/1080
    logo = Image.open(ROOT/'public/brand/logo.png').convert('RGBA')
    logo = logo.resize((round(90*s*logo.width/logo.height),round(90*s)),Image.Resampling.LANCZOS)
    lx,ly = round(64*s), round(48*s)
    canvas.alpha_composite(logo,(lx,ly))
    boxes.append({'id':'logo','box':[lx,ly,lx+logo.width,ly+logo.height]})
    f = font('sans',44*s,650)
    bb = d.textbbox((0,0),'rainbow鱼',font=f)
    brand_xy=(lx+logo.width+round(20*s),ly+(logo.height-(bb[3]-bb[1]))/2)
    boxes.append({'id':'brand','box':text(d,brand_xy,'rainbow鱼','sans',44*s,650,INK)})
    p=spec['pill']
    pf=font('sans',p['font'],650)
    pb=d.textbbox((0,0),'每天5分钟科普',font=pf)
    px,py=p['xy']; pw=pb[2]-pb[0]+p['pad']*2; ph=p['height']
    d.rounded_rectangle((px,py,px+pw,py+ph),radius=p.get('radius',12),fill=INK)
    boxes.append({'id':'series','box':[px,py,px+pw,py+ph]})
    text(d,(px+p['pad'],py+(ph-(pb[3]-pb[1]))/2),'每天5分钟科普','sans',p['font'],650,'#FFFFFF')
    title=spec['title']
    boxes.append({'id':'title','box':text(d,title['xy'],'密码学','serif',title['font'],850,INK)})
    hook=spec['hook']
    for i,line in enumerate(hook['lines']):
        boxes.append({'id':f'hook-{i}','box':text(d,(hook['xy'][0],hook['xy'][1]+i*hook['leading']),line,'sans',hook['font'],580,SUB)})
    issues=[]
    a=np.array(hero_mask)
    for b in boxes:
        x0,y0,x1,y1=b['box']
        if not(0<=x0<x1<=w and 0<=y0<y1<=h): issues.append(f"{b['id']}: outside canvas")
        region=a[max(0,y0):min(h,y1),max(0,x0):min(w,x1)]
        overlap=int(np.count_nonzero(region>220))
        b['opaqueHeroOverlapPixels']=overlap
        if overlap>0: issues.append(f"{b['id']}: overlaps hero by {overlap} opaque pixels")
    for i,b in enumerate(boxes):
        for c in boxes[i+1:]:
            if intersect(b['box'],c['box']): issues.append(f"{b['id']} / {c['id']}: text regions overlap")
    name=f"密码学_封面_{spec['id']}"
    dest=OUT/('drafts' if draft else '')
    dest.mkdir(parents=True,exist_ok=True)
    canvas=canvas.convert('RGB')
    canvas.save(dest/f'{name}.jpg',quality=96,subsampling=0,icc_profile=PROFILE,dpi=(144,144))
    for edge in [320,160]:
        small=canvas.copy();small.thumbnail((edge,edge),Image.Resampling.LANCZOS)
        (dest/'review').mkdir(exist_ok=True)
        small.save(dest/'review'/f'{name}_{edge}.png',icc_profile=PROFILE)
    return canvas,{'ratio':spec['id'],'size':[w,h],'artSource':str(src.relative_to(ROOT)),'artSha256':sha(src),'crop':crop,'heroBox':[hx,hy,hx+hero.width,hy+hero.height],'elements':boxes,'issues':issues,'jpgSha256':sha(dest/f'{name}.jpg')}


def contact(images, path):
    sheet=Image.new('RGB',(1800,1450),'#DDDCD7');d=ImageDraw.Draw(sheet)
    slots=[(40,60,940,570),(40,650,940,1370),(1010,60,1395,573),(1430,60,1745,620)]
    for (spec,im),slot in zip(images,slots):
        x0,y0,x1,y1=slot
        d.text((x0,y0-34),spec['id'].replace('x',':'),font=font('sans',25,600),fill=INK)
        clone=im.copy();clone.thumbnail((x1-x0,y1-y0),Image.Resampling.LANCZOS)
        sheet.paste(clone,(x0,y0))
    # Actual mobile-size checks are visible at their real output dimensions.
    for row,edge in enumerate([320,160]):
        y=700+row*440;x=1010
        for spec,im in images[2:]:
            clone=im.copy();clone.thumbnail((edge,edge),Image.Resampling.LANCZOS)
            sheet.paste(clone,(x,y));x+=clone.width+32
    sheet.save(path,quality=94,subsampling=0,icc_profile=PROFILE)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--draft',action='store_true');args=parser.parse_args()
    prepare_fonts()
    specs=json.loads(CONFIG.read_text(encoding='utf-8'))
    images=[];reports=[]
    for spec in specs:
        im,report=compose(spec,args.draft);images.append((spec,im));reports.append(report)
    dest=OUT/('drafts' if args.draft else '')
    contact(images,dest/'密码学_四比例预览.jpg')
    (dest/'layout-qa.json').write_text(json.dumps({'draft':args.draft,'covers':reports},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps([{'ratio':r['ratio'],'issues':r['issues']} for r in reports],ensure_ascii=False))


if __name__=='__main__':main()
