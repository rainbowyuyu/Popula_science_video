import cv2
from PIL import Image,ImageDraw,ImageFont
p='delivery/如何科学减肥_从身体调节说起_V10_1080p.mp4'; frames=list(range(6400,6901,20));cap=cv2.VideoCapture(p);font=ImageFont.truetype('C:/Windows/Fonts/NotoSansSC-VF.ttf',20);imgs=[]
for f in frames:
 cap.set(cv2.CAP_PROP_POS_FRAMES,f);ok,b=cap.read()
 if not ok:continue
 im=Image.fromarray(cv2.cvtColor(b,cv2.COLOR_BGR2RGB)).resize((384,216));d=ImageDraw.Draw(im);d.rectangle((0,0,384,26),fill=(20,20,20));d.text((4,2),f'F{f} {f/30:.2f}s',font=font,fill='white');imgs.append(im)
cap.release();cols=5;rows=(len(imgs)+cols-1)//cols;out=Image.new('RGB',(cols*384,rows*216),(0,0,0))
for i,im in enumerate(imgs):out.paste(im,((i%cols)*384,(i//cols)*216))
out.save('tmp/audit-motion/h23-25-labeled.jpg',quality=92)