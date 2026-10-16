"""Deterministic local cover renderer shared by editor previews and exports."""
import json
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont, ImageOps

SIZES={'16:9':(1920,1080),'3:4':(1440,1920),'4:3':(1920,1440),'9:16':(1080,1920),'1:1':(1600,1600)}

def wrap(text,font,width,draw):
    lines=[];line=''
    for char in text:
        if char=='\n' or (line and draw.textlength(line+char,font=font)>width):
            lines.append(line);line='' if char=='\n' else char
        else:line+=char
    if line:lines.append(line)
    return lines

def render(spec):
    out=Path(spec['output']);out.mkdir(parents=True,exist_ok=True)
    style=spec.get('style',{});contract=spec.get('coverSpec',{})
    fonts={'Microsoft YaHei':'msyh.ttc','Microsoft YaHei UI':'msyh.ttc','SimSun':'simsun.ttc','STKaiti':'STKAITI.TTF','Arial':'arial.ttf'}
    font_name=contract.get('font','Microsoft YaHei')
    if font_name not in fonts:raise ValueError('请使用微软雅黑、宋体、华文楷体或Arial')
    font_path=Path('C:/Windows/Fonts')/fonts[font_name]
    if not font_path.exists():raise RuntimeError('Required font is missing')
    subject=ImageOps.exif_transpose(Image.open(spec['source'])).convert('RGB')
    logo=Image.open(spec['logo']).convert('RGBA');accent=style.get('accent','#365d79');background=style.get('background','#f6f3ec');layouts={}
    for ratio in spec.get('ratios',['16:9','3:4','4:3','9:16']):
        w,h=SIZES[ratio];rules=contract.get('ratios',{}).get(ratio,{})
        title_rule=rules.get('titleAnchor',{'x':.06,'y':.28,'maxWidth':.86,'fontSize':round(min(w,h)*.105),'lineHeight':1.22,'maxLines':3})
        badge=rules.get('badge',{'x':.06,'y':.18,'fontSize':round(min(w,h)*.04),'maxWidth':.88})
        lr=rules.get('logo',{'x':.045,'y':.035,'width':.05,'height':.07});br=rules.get('brand',{'x':.11,'y':.035,'fontSize':round(min(w,h)*.033)})
        image=Image.new('RGB',(w,h),background);draw=ImageDraw.Draw(image);font=ImageFont.truetype(str(font_path),int(title_rule['fontSize']))
        lines=wrap(spec['title'],font,w*title_rule.get('maxWidth',.84),draw)
        if len(lines)>title_rule.get('maxLines',3):raise ValueError('主标题过长，请缩短文字以保持系列字号与布局')
        text_bottom=round(h*title_rule['y']+len(lines)*font.size*title_rule.get('lineHeight',1.22))
        crop=spec.get('subject',{}).get(ratio,{});cx=float(crop.get('x',.5));cy=float(crop.get('y',.5));zoom=float(crop.get('zoom',1))
        presentation=spec.get('templateSpec',{}).get('layout',{}).get('presentation','immersive')
        top=max(round(h*.48),text_bottom+round(h*.035)) if presentation=='split' else 0
        if top>h*.82:raise ValueError('主标题过长，主体区域不足；请简化标题')
        rw,rh=w,h-top;scale=max(rw/subject.width,rh/subject.height)*zoom
        photo=subject.resize((max(1,round(subject.width*scale)),max(1,round(subject.height*scale))),Image.Resampling.LANCZOS)
        left=round(max(0,photo.width-rw)*cx);upper=round(max(0,photo.height-rh)*cy)
        photo=photo.crop((left,upper,left+rw,upper+rh))
        image.paste(photo,(0,top))
        wash=Image.new('RGB',(w,h),background);mask=Image.new('L',(1,h));px=mask.load()
        fade_end=min(h*.91,max(text_bottom+h*.15,h*.57))
        for y in range(h):
            if presentation=='split':opacity=1 if y<top else max(0,1-(y-top)/max(h*.09,1))
            else:opacity=.96 if y<h*.12 else max(0,.96*(1-(y-h*.12)/max(fade_end-h*.12,1)))
            px[0,y]=round(opacity*255)
        image.paste(wash,(0,0),mask.resize((w,h)))
        image.save(out/(ratio.replace(':','x')+'-background.png'))
        draw=ImageDraw.Draw(image);lsize=(max(1,round(lr['width']*w)),max(1,round(lr['height']*h)))
        brand_logo=logo.copy();brand_logo.thumbnail(lsize,Image.Resampling.LANCZOS);image.paste(brand_logo,(round(lr['x']*w),round(lr['y']*h)),brand_logo)
        brand_font=ImageFont.truetype(str(font_path),int(br['fontSize']));draw.text((round(br['x']*w),round(br['y']*h)),contract.get('brandText','rainbow鱼'),font=brand_font,fill=accent)
        badge_font=ImageFont.truetype(str(font_path),int(badge['fontSize']));label=contract.get('badgeText') or spec.get('series','每天5分钟科普')
        bw=draw.textlength(label,font=badge_font)+int(badge['fontSize'])*1.2
        if bw>w*badge.get('maxWidth',.88):raise ValueError('系列栏文字过长，请缩短以保持字号')
        bx,by=round(w*badge['x']),round(h*badge['y']);bh=int(badge['fontSize']*1.65)
        draw.rounded_rectangle((bx,by,bx+bw,by+bh),radius=round(bh*.13),fill=accent);draw.text((bx+badge['fontSize']*.6,by+badge['fontSize']*.14),label,font=badge_font,fill='white')
        tx,ty=round(w*title_rule['x']),round(h*title_rule['y'])
        for n,line in enumerate(lines):draw.text((tx,ty+n*font.size*title_rule.get('lineHeight',1.22)),line,font=font,fill=style.get('titleColor',accent))
        for fmt in spec.get('formats',['jpg']):
            image.save(out/(ratio.replace(':','x')+'.'+fmt),**({'quality':95,'subsampling':0} if fmt=='jpg' else {}))
        if spec.get('preview'):
            small=image.copy();small.thumbnail((640,640),Image.Resampling.LANCZOS);small.save(out/(ratio.replace(':','x')+'-preview.jpg'),quality=88)
        layouts[ratio]={'ratio':ratio,'title':spec['title'],'subtitle':label,'font':font_name,'background':background,'accent':accent,
          'positions':{'logo':{'x':lr['x'],'y':lr['y']},'subtitle':{'x':badge['x'],'y':badge['y']},'title':{'x':title_rule['x'],'y':title_rule['y']}},
          'fontSizes':{'title':font.size,'badge':badge_font.size,'brand':brand_font.size},'coverSpecVersion':contract.get('version',1),'subject':crop,
          'subjectSource':spec.get('sourcePath',spec['source']),'timeSec':spec.get('timeSec'),'renderedBy':'render_series_cover.py','templateSpec':spec.get('templateSpec',{})}
    (out/'layouts.json').write_text(json.dumps(layouts,ensure_ascii=False,indent=2),encoding='utf8')
    return layouts

if __name__=='__main__':
    render(json.loads(Path(sys.argv[1]).read_text(encoding='utf8')))
    print('Cover render complete.')
