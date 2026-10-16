"""Editable four-ratio covers using accepted local V15 Qwen artwork.

No API calls; source illustrations and brand originals remain untouched.
Run with the project Python, then inspect each original and its thumbnails.
"""
from pathlib import Path
import json, hashlib, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageCms

SCRIPT = Path(__file__).resolve()
# The same exact script works from scripts/ or its delivery/covers/ copy.
ROOT = SCRIPT.parents[3] if SCRIPT.parent.name == 'covers' else SCRIPT.parents[1]
OUT = ROOT / 'output-v15/delivery/covers'
CFG = ROOT / 'research/v15/cover-layouts-v15.json'
PORTABLE_ASSETS = OUT / 'assets'

def portable_asset(name, installed_path):
    local = PORTABLE_ASSETS / name
    return local if local.is_file() else Path(installed_path)

FONT = portable_asset('NotoSansSC-VF.ttf', 'C:/Windows/Fonts/NotoSansSC-VF.ttf')
LOGO = portable_asset('logo-approved-transparent.png', 'C:/Users/zju/.codex/skills/rainbow-science-short/assets/logo.png')
ORIGINAL_LOGO = portable_asset('logo-user-original.png', 'C:/Users/zju/Desktop/logo/logo.png')
INK = (34, 57, 61)
ICC = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()

DEFAULTS = {
    'title': '彩虹为什么是弧形？', 'series': '每天5分钟·彩虹',
    'font': str(FONT), 'logo': str(LOGO),
    'layouts': {
        '16x9': {'size': [1920,1080], 'source':'street_b_clean',
                  'plate': [1920,0,0], 'title_xy':[755,290],
                  'title_size':126, 'leading':150, 'series':[760,180,50]},
        '3x4': {'size': [1440,1920], 'source':'street_b_clean',
                 'plate': [1920,-180,840], 'title_xy':[100,308],
                 'title_size':190, 'leading':227, 'series':[104,762,66]},
        '4x3': {'size': [1920,1440], 'source':'street_a_final',
                 'plate': [2560,-300,0], 'title_xy':[760,382],
                 'title_size':156, 'leading':184, 'series':[765,255,62]},
        '9x16': {'size': [1080,1920], 'source':'street_b_clean',
                  'plate': [1920,-230,840], 'title_xy':[72,320],
                  'title_size':176, 'leading':215, 'series':[76,752,56]},
    }
}

def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def font(size, weight):
    f = ImageFont.truetype(str(FONT), round(size))
    f.set_variation_by_axes([weight])
    return f

def text(draw, xy, string, f, fill):
    box = draw.textbbox((0,0),string,font=f)
    x,y=map(round,xy)
    draw.text((x-box[0],y-box[1]),string,font=f,fill=fill)
    return [x,y,x+box[2]-box[0],y+box[3]-box[1]]

def source_path(name):
    return ROOT/'output-v15/work/qwen-art-v15/generated'/name/'keyframe-1920x1080.png'

def plate(cfg):
    w,h=cfg['size'];pw,px,py=cfg['plate']
    src=Image.open(source_path(cfg['source'])).convert('RGB')
    # The portrait negative space uses the original illustration's ivory paper
    # tone and fixed fine grain, not a separate flat colour panel.
    sample=np.asarray(src.crop((1050,285,1190,380)),dtype=np.float32)
    colour=np.median(sample.reshape(-1,3),axis=0)
    rng=np.random.default_rng(150312)
    grain=rng.normal(0,.45,(h,w,1))
    yy=np.linspace(0,1,h)[:,None,None]
    paper=np.broadcast_to(colour.reshape(1,1,3),(h,w,3)).copy()
    paper+=grain+np.cos(yy*np.pi)*.8
    bg=Image.fromarray(np.clip(paper,0,255).astype(np.uint8)).convert('RGBA')
    image=src.resize((pw,round(pw*src.height/src.width)),Image.Resampling.LANCZOS).convert('RGBA')
    if py>0:
        # Feather only the inserted sky's top; the rainbow and scenery remain
        # one coherent illustration. Uniform scale, no rainbow distortion.
        yy,xx=np.mgrid[0:image.height,0:image.width]
        # Left foliage enters as an organic watercolour wash rather than a
        # straight cropped treetop; the rainbow's clear sky edge stays intact.
        foliage=np.exp(-((xx-pw*.14)/(pw*.20))**2)
        softness=70+250*foliage
        edge=18+26*np.sin(xx/185.0)+13*np.sin(xx/79.0)
        t=np.clip((yy-edge)/softness,0,1)
        a=np.round(255*t*t*(3-2*t)).astype(np.uint8)
        image.putalpha(Image.fromarray(a))
    bg.alpha_composite(image,(px,py))
    # Soft reflected paper light protects the brand over the horizontal tree.
    # It has no edge/border and does not wash over the title or main fish.
    if w>=h:
        yy,xx=np.mgrid[0:h,0:w]
        alpha=np.exp(-((xx-w*.035)/(w*.27))**2-((yy-h*.015)/(h*.18))**2)*.89
        veil=np.zeros((h,w,4),np.uint8)
        veil[:,:,:3]=np.round(colour).astype(np.uint8)
        veil[:,:,3]=np.round(alpha*255).astype(np.uint8)
        bg.alpha_composite(Image.fromarray(veil))
    return bg

def overlap(a,b,pad=0):
    return not(a[2]+pad<=b[0] or b[2]+pad<=a[0] or a[3]+pad<=b[1] or b[3]+pad<=a[1])

def compose(name,cfg,config):
    w,h=cfg['size'];s=min(w,h)/1080
    im=plate(cfg);d=ImageDraw.Draw(im)
    logo=Image.open(LOGO).convert('RGBA')
    lx,ly=round(64*s),round(48*s);lh=round(90*s);lw=round(lh*logo.width/logo.height)
    im.alpha_composite(logo.resize((lw,lh),Image.Resampling.LANCZOS),(lx,ly))
    bf=font(44*s,600);b=d.textbbox((0,0),'rainbow鱼',font=bf)
    brand=text(d,(lx+lw+20*s,ly+(lh-b[3]+b[1])/2),'rainbow鱼',bf,INK)
    x,y,fs=cfg['series'];sf=font(fs,660);b=d.textbbox((0,0),config['series'],font=sf)
    pw=round(b[2]-b[0]+38*s);ph=round(b[3]-b[1]+25*s)
    capsule=[x,y,x+pw,y+ph]
    d.rounded_rectangle(capsule,radius=round(12*s),fill=(46,91,98))
    sb=text(d,(x+19*s,y+12.5*s),config['series'],sf,(255,255,250))
    tx,ty=cfg['title_xy'];tf=font(cfg['title_size'],830)
    lines=['彩虹为什么','是弧形？']
    title=[text(d,(tx,ty+i*cfg['leading']),line,tf,INK) for i,line in enumerate(lines)]
    boxes=[brand,capsule,*title]
    assert all(0<=b[0]<b[2]<=w and 0<=b[1]<b[3]<=h for b in boxes),(name,boxes)
    assert not any(overlap(capsule,b,14*s) for b in title),(name,'title overlaps series')
    assert not overlap(title[0],title[1],8*s),(name,'title lines overlap')
    out=OUT/f'rainbow-v15-cover-{name}.jpg'
    im.convert('RGB').save(out,quality=95,subsampling=0,icc_profile=ICC)
    for n in [320,160]:
        thumb=im.convert('RGB');thumb.thumbnail((n,n),Image.Resampling.LANCZOS)
        thumb.save(OUT/'review'/f'{name}-{n}.jpg',quality=95,subsampling=0,icc_profile=ICC)
    return {'ratio':name,'size':[w,h],'file':out.name,'sha256':sha(out),'bytes':out.stat().st_size,
            'logoBox':[lx,ly,lx+lw,ly+lh],'brandBox':brand,'titleBoxes':title,'seriesBox':capsule,
            'seriesTextBox':sb,'colourMode':'RGB','ICC':'sRGB','jpegQuality':95,'subsampling':'4:4:4',
            'visualReview':'pending actual full-frame and 320/160px inspection'}

def main():
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'review').mkdir(exist_ok=True)
    if not CFG.exists():
        CFG.parent.mkdir(parents=True,exist_ok=True)
        CFG.write_text(json.dumps(DEFAULTS,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    config=json.loads(CFG.read_text(encoding='utf-8'))
    records=[compose(name,cfg,config) for name,cfg in config['layouts'].items()]
    (OUT/'layout-audit-v15.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    shutil.copy2(CFG,OUT/'cover-layouts-v15.json')
    if SCRIPT != (OUT/'covers_v15.py').resolve():
        shutil.copy2(SCRIPT,OUT/'covers_v15.py')
    board=Image.new('RGB',(1540,960),(235,235,227));draw=ImageDraw.Draw(board)
    for i,r in enumerate(records):
        x=20+i*380
        draw.text((x,15),r['ratio'],font=font(28,650),fill=INK)
        pic=Image.open(OUT/r['file']);pic.thumbnail((350,820),Image.Resampling.LANCZOS)
        board.paste(pic,(x,65))
    board.save(OUT/'review/four-ratios-v15.jpg',quality=95,subsampling=0,icc_profile=ICC)
    for n in [320,160]:
        ww=n+30;board=Image.new('RGB',(ww*4,n+75),(235,235,227));draw=ImageDraw.Draw(board)
        for i,r in enumerate(records):
            draw.text((i*ww+12,12),r['ratio'],font=font(20,650),fill=INK)
            pic=Image.open(OUT/'review'/f"{r['ratio']}-{n}.jpg")
            board.paste(pic,(i*ww+12,50))
        board.save(OUT/'review'/f'thumbnails-{n}-v15.jpg',quality=95,subsampling=0,icc_profile=ICC)
    sources=[]
    for n in sorted({cfg['source'] for cfg in config['layouts'].values()}):
        p=source_path(n);prov=p.parent/'provenance.json';r=json.loads(prov.read_text(encoding='utf-8'))
        sources.append({'id':n,'path':str(p.relative_to(ROOT)),'sha256':sha(p),
                        'model':r['model'],'requestId':r['requestId'],'provenanceFile':str(prov.relative_to(ROOT)),
                        'sourceType':r['sourceType'],'normalization':'Independent proportional crop/position with top paper extension; unchanged source artwork'})
    manifest={'version':'V15','date':'2026-10-12','newPaidCalls':0,'artwork':sources,
              'title':config['title'],'series':config['series'],'font':{'family':'Noto Sans SC','license':'SIL OFL 1.1','path':str(FONT),'sha256':sha(FONT)},
              'logo':{'original':str(ORIGINAL_LOGO),'originalSHA256':sha(ORIGINAL_LOGO),'approvedTransparentDerivative':str(LOGO),'derivativeSHA256':sha(LOGO),
                      'placement':'left64/top48/logoH90/gap20/name44 multiplied by min(width,height)/1080; preserve complete logo aspect'},
              'scientificNote':'Generated atmospheric rainbow illustration; colours, scale and playful fish are artistic. Scientific angles are only in the deterministic film.',
              'reproducibleSource':['scripts/covers_v15.py','research/v15/cover-layouts-v15.json'],
              'portableAssets':[{'file':'assets/'+p.name,'sha256':sha(p),'bytes':p.stat().st_size}
                                for p in [FONT,LOGO,ORIGINAL_LOGO] if p.parent==PORTABLE_ASSETS],
              'portableAssetSelection':'Prefer exact local covers/assets font and logos; fall back to original installed global paths only if local copies are absent.'}
    manifest['reproducibleSourceSHA256']={p:sha(ROOT/p) for p in manifest['reproducibleSource']}
    manifest['deliveryScriptSHA256']=sha(OUT/'covers_v15.py')
    (OUT/'source-manifest-v15.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(records,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
