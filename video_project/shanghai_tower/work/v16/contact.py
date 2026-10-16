from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
p=Path('tmp/v16/batch2-stills');files=sorted(p.glob('frame-*.jpg'),key=lambda p:int(p.stem.split('-')[1]))
canvas=Image.new('RGB',(1440,((len(files)+2)//3)*300),'#e6e6e2');d=ImageDraw.Draw(canvas)
for i,f in enumerate(files):
 im=Image.open(f);im.thumbnail((480,270));x=i%3*480;y=i//3*300;canvas.paste(im,(x,y));d.text((x+14,y+277),f.stem,fill='black')
canvas.save('work/v16/qa/batch2-contact.jpg',quality=92)
