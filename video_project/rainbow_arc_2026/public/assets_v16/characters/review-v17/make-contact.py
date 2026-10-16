from pathlib import Path
from PIL import Image, ImageDraw
p=Path(__file__).resolve().parent
names=['front','front-threequarter','front-threequarter-wide','side','back-threequarter','swim-001','swim-031','swim-061','swim-091']
im=Image.new('RGB',(1200,984),'#f3f5f1');d=ImageDraw.Draw(im)
for i,n in enumerate(names):
    x,y=(i%3)*400,(i//3)*328
    a=Image.open(p/(n+'.png')).convert('RGB');a.thumbnail((400,300));im.paste(a,(x,y+28))
    d.text((x+12,y+8),n,fill='#153d3b')
im.save(p/'multiview-and-swim-contact.jpg',quality=94)
print(p/'multiview-and-swim-contact.jpg')
