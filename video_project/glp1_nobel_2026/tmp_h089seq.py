import cv2
from PIL import Image,ImageDraw,ImageFont
p='delivery/如何科学减肥_从身体调节说起_V10_1080p.mp4'; frames=list(range(26103,26379,20));cap=cv2.VideoCapture(p);font=ImageFont.truetype('C:/Windows/Fonts/NotoSansSC-VF.ttf',20);imgs=[]
for f in frames:
 cap.set(cv2.CAP_PROP_POS_FRAMES,f);ok,b=cap.read();
 if not ok: continue
 im=Image.fromarray(cv2.cvtColor(b,cv2.COLOR_BGR2RGB)).resize((480,270));d=ImageDraw.Draw(im);d.rectangle((0,0,480,28),fill=(20,20,20));d.text((4,2),f'F{f} {f/30:.2f}s',font=font,fill='white');imgs.append(im)
cap.release();cols=4;rows=(len(imgs)+cols-1)//cols;out=Image.new('RGB',(cols*480,rows*270),(0,0,0))
for i,im in enumerate(imgs):out.paste(im,((i%cols)*480,(i//cols)*270))
out.save('tmp/audit-motion/h089seq.jpg',quality=92)