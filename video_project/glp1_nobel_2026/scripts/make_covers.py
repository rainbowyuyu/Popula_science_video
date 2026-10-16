"""Four independent Pillow covers from real film renders; no image generation.

Usage: python scripts/make_covers.py
Only writes docs/cover-layouts.json (if requested manually) and delivery/covers.
Edit docs/cover-layouts.json to adjust text, colors, source crops and placements.
"""
from pathlib import Path
import argparse,hashlib,json,math,shutil
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageCms,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'delivery/covers'

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,d):Path(p).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n','utf8')
def rgb(s):return tuple(int(s[i:i+2],16) for i in (1,3,5))
def font(path,size,weight):
    f=ImageFont.truetype(path,round(size))
    try:f.set_variation_by_axes([weight])
    except (OSError,AttributeError):pass
    return f
def inkbox(draw,xy,text,f):return list(draw.textbbox(xy,text,font=f,anchor='lt'))
def overlap(a,b):return max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))

def extract(source,crop,matte=(3,13)):
    im=Image.open(source).convert('RGB');full=np.asarray(im,dtype=np.float32)
    # Blank field is sampled outside the actual subject, not inferred by AI.
    background=np.median(full[10:140,1550:1850].reshape(-1,3),axis=0)
    part=np.asarray(im.crop(tuple(crop)),dtype=np.float32)
    difference=np.max(abs(part-background),axis=2)
    alpha=np.clip((difference-matte[0])/matte[1],0,1)
    # Only remove the paper field. Existing anatomy and ribbons retain the
    # rendered shape; no filling, inpainting or anatomical retouch is performed.
    alpha=Image.fromarray(np.uint8(alpha*255)).filter(ImageFilter.GaussianBlur(.45))
    result=Image.fromarray(part.astype('uint8')).convert('RGBA');result.putalpha(alpha)
    return result,background.tolist()

def background(w,h,paper):
    yy,xx=np.mgrid[0:h,0:w];base=np.empty((h,w,3),np.float32);base[:]=paper
    glow=np.exp(-(((xx-w*.76)/(w*.44))**2+((yy-h*.51)/(h*.55))**2))
    base+=glow[:,:,None]*np.array([-3.5,0,-1.5])
    return Image.fromarray(np.clip(base,0,255).astype('uint8')).convert('RGBA')

def place(canvas,layer,config):
    factor=config['height']/layer.height
    target=layer.resize((round(layer.width*factor),round(config['height'])),Image.Resampling.LANCZOS)
    x,y=round(config['x']),round(config['y']);canvas.alpha_composite(target,(x,y))
    # Return effective subject bounds, excluding 8-bit nearly transparent field.
    alpha=np.asarray(target.getchannel('A'));ys,xs=np.where(alpha>30)
    return [int(x+xs.min()),int(y+ys.min()),int(x+xs.max()+1),int(y+ys.max()+1)]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--config',type=Path,default=ROOT/'docs/cover-layouts.json');args=ap.parse_args()
    cfg=json.loads(args.config.read_text('utf8'));OUT.mkdir(parents=True,exist_ok=True)
    for key,s in cfg['sources'].items():
        archive=OUT/f'source-{key}.jpg'
        if (ROOT/s['path']).exists():
            if (ROOT/s['path']).resolve()!=archive.resolve():shutil.copy2(ROOT/s['path'],archive)
        elif not archive.exists():raise FileNotFoundError('Waiting for real clean film render: '+s['path'])
    art={};source_records={}
    for key,s in cfg['sources'].items():
        archive=OUT/f'source-{key}.jpg'
        art[key],bg=extract(archive,s['crop'],s.get('matte',[3,13]));art[key].save(OUT/f'{key}-cutout.png')
        source_records[key]=dict(path=s['path'],archive=archive.relative_to(ROOT).as_posix(),sha256=sha(archive),crop=s['crop'],sampledPaperRGB=bg,matte=s.get('matte',[3,13]),frame=s.get('frame'),clip=s.get('clip'),renderEntry=s.get('renderEntry'),backgroundMethod=s.get('backgroundMethod'),operations='rectangular crop; measured paper matte; uniform resize')
    profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    logo=Image.open(ROOT/cfg['brand']['source']).convert('RGBA')
    assert logo.size==(347,410),'Original PNG aspect ratio changed'
    report={};images={}
    for key,layout in cfg['formats'].items():
        w,h=layout['size'];canvas=background(w,h,rgb(cfg['colors']['paper']))
        bodybox=place(canvas,art['body'],layout['body'])
        # Save each independently composed no-text artwork for future reflow.
        canvas.convert('RGB').save(OUT/f'artwork-{key}.jpg',quality=95,subsampling=0,icc_profile=profile)
        draw=ImageDraw.Draw(canvas);ink=cfg['colors']['ink'];accent=cfg['colors']['accent'];s=min(w,h)/1080
        b=cfg['brand'];bh=round(b['height']*s);bw=round(bh*347/410);bx=round(b['left']*s);by=round(b['top']*s)
        canvas.alpha_composite(logo.resize((bw,bh),Image.Resampling.LANCZOS),(bx,by))
        bf=font(cfg['font'],b['fontSize']*s,b['weight']);namebox=draw.textbbox((0,0),b['text'],font=bf,anchor='lt')
        namex=bx+bw+round(b['gap']*s);namey=by+round((bh-(namebox[3]-namebox[1]))/2)
        draw.text((namex,namey),b['text'],font=bf,fill=ink,anchor='lt')
        brandtext=inkbox(draw,(namex,namey),b['text'],bf)
        cp=layout['capsule'];cf=font(cfg['font'],cp['fontSize'],600)
        cb=draw.textbbox((0,0),cfg['series'],font=cf,anchor='lt');cw=cb[2]-cb[0]+2*cp['padX'];ch=cb[3]-cb[1]+2*cp['padY']
        capsule=[cp['x'],cp['y'],cp['x']+cw,cp['y']+ch]
        draw.rounded_rectangle(capsule,radius=ch/2,fill=cfg['colors']['capsule'])
        draw.text((cp['x']+cp['padX'],cp['y']+cp['padY']),cfg['series'],font=cf,fill='#fffdf7',anchor='lt')
        title=layout['title'];tf=font(cfg['font'],title['fontSize'],cfg['fontWeight']);textboxes=[];panels=[]
        y=title['y']
        for i,line in enumerate(cfg['title']):
            box=inkbox(draw,(title['x'],y),line,tf);textboxes.append(box)
            if i==cfg.get('highlightIndex'):
                pad=title['highlightPad'];panel=[box[0]-pad,box[1]-pad,box[2]+pad,box[3]+pad]
                draw.rounded_rectangle(panel,radius=title['radius'],fill=accent);panels.append(panel)
                draw.text((title['x'],y),line,font=tf,fill='#fffdf7',anchor='lt')
            else:draw.text((title['x'],y),line,font=tf,fill=ink,anchor='lt')
            y+=title['fontSize']+title['lineGap']
        protected=[bodybox];collisions=[]
        for label,box in [('capsule',capsule)]+[(f'title-{i}',b) for i,b in enumerate(textboxes)]+[(f'panel-{i}',b) for i,b in enumerate(panels)]:
            assert box[0]>=48*s and box[2]<=w-48*s and box[1]>=0 and box[3]<=h-48*s,(key,label,box)
            for subject,pbox in zip(['body'],protected):
                if overlap(box,pbox)>0:collisions.append([label,subject])
        # Normal bounding boxes are deliberately conservative; a collision
        # requires moving the artwork or text, never disabling the check.
        if collisions:raise RuntimeError(f'{key}: protected area collision {collisions}')
        dst=OUT/f'{cfg["prefix"]}-{key}.jpg';flat=canvas.convert('RGB');flat.save(dst,quality=95,subsampling=0,icc_profile=profile)
        for edge in (320,160):
            small=flat.copy();small.thumbnail((edge,edge),Image.Resampling.LANCZOS);small.save(OUT/f'{cfg["prefix"]}-{key}-{edge}.jpg',quality=95,subsampling=0,icc_profile=profile)
        images[key]=flat
        check=Image.open(dst)
        assert check.format=='JPEG' and check.mode=='RGB' and check.size==(w,h) and check.info.get('icc_profile')
        assert check.layer==[(1,1,1,0),(2,1,1,1),(3,1,1,1)],'JPEG must use 4:4:4'
        report[key]=dict(size=[w,h],format=check.format,mode=check.mode,icc='sRGB',quality=95,chroma='4:4:4',sha256=sha(dst),
            logoBox=[bx,by,bx+bw,by+bh],brandTextBox=brandtext,brandGap=round(b['gap']*s),titleBoxes=textboxes,
            capsuleBox=capsule,titlePanelBoxes=panels,bodyProtectionBox=bodybox,collisionCount=0)
    for edge in (640,320,160):
        cellw=edge+40;cellh=edge+85;sheet=Image.new('RGB',(cellw*4,cellh),'#e1ded6');sd=ImageDraw.Draw(sheet)
        lf=font(cfg['font'],max(16,round(edge*.035)),600)
        for i,(key,im) in enumerate(images.items()):
            sm=im.copy();sm.thumbnail((edge,edge),Image.Resampling.LANCZOS)
            xx=i*cellw+(cellw-sm.width)//2;yy=50+(edge-sm.height)//2;sheet.paste(sm,(xx,yy))
            sd.text((i*cellw+20,14),key.replace('x',':')+'  '+str(im.width)+'×'+str(im.height),font=lf,fill=cfg['colors']['ink'])
        sheet.save(OUT/f'contact-sheet-{edge}.jpg',quality=95,subsampling=0,icc_profile=profile)
    save(OUT/'layout-report.json',dict(revision=cfg['version'],title=cfg['title'],series=cfg['series'],timelineSHA256=sha(ROOT/'src/timeline.json'),sourceFacts=cfg['sourceFacts'],layoutSHA256=sha(args.config),logoSHA256=sha(ROOT/cfg['brand']['source']),fontSHA256=sha(cfg['font']),
        imageGenerationUsed=False,sources=source_records,formats=report,visualReview=dict(fullSize=False,thumbnail320=False,thumbnail160=False)))
    (OUT/'README.md').write_text('# 科学减重 · 读懂三高｜四比例封面\n\n采用 V4 正片同一人体模型，以封面镜头和透明度单独渲染，再用 Pillow 精确排版，未调用生图。所有器官共享原始米制坐标，没有单独移动或缩放。\n\n'
        '四个 cardiometabolic-cover-比例.jpg 为正式封面，320/160 后缀为手机缩图。artwork 为各比例无字合成底图；body-cutout.png 为裁切及纸底遮罩素材。\n\n'
        '排版参数：../../docs/cover-layouts.json；可编辑脚本：../../scripts/make_covers.py。复现：python scripts/make_covers.py。源图可复现：node delivery/covers/editable/render-source.mjs；封面镜头入口 editable/CoverAnatomy.tsx。\n\n'
        '真人体参考：BodyParts3D © The Database Center for Life Science，CC BY 4.0；经 Human Atlas © 2026 ashemag MIT 版本转换。单一人体解剖主视觉，全部器官保留原模型共享坐标和相对比例。标题使用统一 Noto Sans SC，深青底白字；原透明 Logo 与 rainbow鱼固定左上。\n',encoding='utf8')
    print(json.dumps(dict(covers=list(report),output=str(OUT),collisionCount=0),ensure_ascii=False),flush=True)

if __name__=='__main__':main()
