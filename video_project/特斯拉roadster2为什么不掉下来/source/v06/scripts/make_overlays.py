from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

R=Path(__file__).resolve().parents[1];P=R.parents[1];OLD=R.parent/'v05'
OUT=P/'assets/v06/overlays';OUT.mkdir(parents=True,exist_ok=True)
fontfile=OLD/'public/fonts/NotoSansSC-VF.ttf'
def font(n,weight=650):
    f=ImageFont.truetype(str(fontfile),n);f.set_variation_by_axes([weight]);return f
def put(im,txt,x,y,n,color,weight=650):
    f=font(n,weight);d=ImageDraw.Draw(im);b=d.textbbox((0,0),txt,font=f);d.text((x-b[0],y-b[1]),txt,font=f,fill=color)
for mode,color in [('light','#f9faf6'),('dark','#243337')]:
    im=Image.new('RGBA',(1920,1080));icon=Image.open(OLD/'public/brand/logo.png').convert('RGBA').resize((62,72),Image.Resampling.LANCZOS)
    if mode=='light':
      flat=Image.new('RGBA',icon.size,color);flat.putalpha(icon.getchannel('A'));icon=flat
    im.alpha_composite(icon,(62,39));put(im,'rainbow鱼',139,62,36,color)
    im.save(OUT/f'brand-{mode}.png')
for name,label,color in [('source','Tesla 官方演示','#f9faf6'),('generated','AI 转场 · 原理示意','#f9faf6'),('series','每天5分钟科普 · 车辆力学','#6c7a7d')]:
    im=Image.new('RGBA',(1920,1080));f=font(30,500);b=f.getbbox(label);x=1855-(b[2]-b[0])
    if name=='generated':ImageDraw.Draw(im).rounded_rectangle((x-18,47,1873,104),radius=10,fill=(25,37,40,190))
    put(im,label,x,60,30,color,500);im.save(OUT/f'{name}.png')
print('Overlays saved')
