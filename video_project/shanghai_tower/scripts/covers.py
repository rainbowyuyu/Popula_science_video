"""Exact brand and independently arranged title over same-model CPU renders."""
from PIL import Image,ImageDraw,ImageFont,ImageCms,ImageFilter
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'delivery/covers';OUT.mkdir(parents=True,exist_ok=True)
MANIFEST=json.loads((ROOT/'public/models/shanghai-tower-manifest.json').read_text(encoding='utf8'))
LOGO=Path('C:/Users/zju/.codex/skills/rainbow-science-short/assets/logo.png')
FONT='C:/Windows/Fonts/msyhbd.ttc';REG='C:/Windows/Fonts/msyh.ttc'
INK=(31,59,68);TEAL=(39,78,87)
LAYOUT={
 '16x9':{'size':[1920,1080],'pill':[68,237,40],'title':[66,355,144,168],'lines':['632米，','怎样站稳？']},
 '4x3':{'size':[1920,1440],'pill':[89,335,48],'title':[82,477,158,184],'lines':['632米，','怎样站稳？']},
 '3x4':{'size':[1440,1920],'pill':[88,254,46],'title':[80,356,140,154],'lines':['632米，','怎样站稳？']},
 '9x16':{'size':[1080,1920],'pill':[64,204,37],'title':[60,304,127,144],'lines':['632米，','怎样站稳？']}
}
def font(size,bold=True):return ImageFont.truetype(FONT if bold else REG,round(size))
def bg(w,h):
 im=Image.new('RGB',(w,h));pix=im.load()
 for y in range(h):
  for x in range(w):
   t=min(1,((x/w-.58)**2+(y/h-.52)**2)**.5)
   pix[x,y]=(round(249-13*t),round(248-11*t),round(242-7*t))
 return im.convert('RGBA')
reports=[]
for key,c in LAYOUT.items():
 w,h=c['size'];im=bg(w,h);scene=Image.open(ROOT/f'cover/tower-{key}.png').convert('RGBA');im.alpha_composite(scene)
 if key=='4x3' and (ROOT/'cover/tower-detail.png').exists():
  detail=Image.open(ROOT/'cover/tower-detail.png').convert('RGBA');detail.thumbnail((790,685),Image.Resampling.LANCZOS);im.alpha_composite(detail,(-40,900))
 dr=ImageDraw.Draw(im);s=min(w,h)/1080;logo=Image.open(LOGO).convert('RGBA');logo=logo.resize((round(90*s*347/410),round(90*s)),Image.Resampling.LANCZOS);im.alpha_composite(logo,(round(64*s),round(48*s)))
 dr=ImageDraw.Draw(im);f=font(44*s);txt='rainbow鱼';box=dr.textbbox((0,0),txt,font=f);dr.text((round(64*s)+logo.width+round(20*s),round(48*s)+(logo.height-(box[3]-box[1]))/2-box[1]),txt,font=f,fill=INK)
 x,y,sz=c['pill'];f=font(sz);text='每天5分钟科普·上海中心';bb=dr.textbbox((0,0),text,font=f);pw=bb[2]+round(sz*.95);ph=round(sz*1.68);dr.rounded_rectangle((x,y,x+pw,y+ph),radius=round(sz*.29),fill=TEAL);dr.text((x+sz*.48,y+(ph-(bb[3]-bb[1]))/2-bb[1]),text,font=f,fill=(255,255,251))
 x,y,sz,spacing=c['title'];f=font(sz);bounds=[]
 for i,line in enumerate(c['lines']):
  if dr.textlength(line,font=f)>w-x*2:
   f=font((w-x*2)/dr.textlength(line,font=f)*sz)
  bb=dr.textbbox((x,y+i*spacing),line,font=f);dr.text((x,y+i*spacing),line,font=f,fill=INK);bounds.append(bb)
 p=OUT/f'上海中心_封面_{key}.jpg';icc=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes();im.convert('RGB').save(p,quality=96,subsampling=0,icc_profile=icc)
 im.convert('RGB').resize((round(w*320/max(w,h)),round(h*320/max(w,h))),Image.Resampling.LANCZOS).save(ROOT/f'cover/thumb-{key}.jpg',quality=95)
 reports.append({'ratio':key,'path':str(p),'size':[w,h],'color':'RGB/sRGB','title_bounds':bounds,'brand_short_side_scale':s,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
sheet=Image.new('RGB',(1440,670),(239,238,231));d=ImageDraw.Draw(sheet)
for i,(key,c) in enumerate(LAYOUT.items()):
 img=Image.open(OUT/f'上海中心_封面_{key}.jpg');img.thumbnail((350,595));sheet.paste(img,(i*360+(350-img.width)//2,45));d.text((i*360+16,10),key,font=font(23),fill=INK)
sheet.save(ROOT/'cover/contact-sheet.jpg',quality=94)
(ROOT/'cover/layout.json').write_text(json.dumps(LAYOUT,ensure_ascii=False,indent=2),encoding='utf8')
(ROOT/'research/cover-qa.json').write_text(json.dumps({
 'covers':reports,
 'source':'Same editable Shanghai Tower Blender model, no generative imagery; no construction-BIM claim.',
 'source_manifest':'public/models/shanghai-tower-manifest.json',
 'manifest_schema':MANIFEST.get('schema'),
 'manifest_part_count':len(MANIFEST.get('parts', [])),
 'structural_graph_summary':MANIFEST.get('structuralGraphSummary'),
 'render_method':'Cycles CPU 32 sample architectural exploded render + Pillow brand composition',
 'visual_review':'Contact sheet regenerated after the current model rebuild; inspect cover/contact-sheet.jpg.'
},ensure_ascii=False,indent=2),encoding='utf8')
print('COVERS_WRITTEN',len(reports))
