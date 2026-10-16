import json,cv2
from PIL import Image,ImageDraw,ImageFont
root='.'; tl=json.load(open('src/timeline.json',encoding='utf8')); wanted=[]
for c in tl['clips']:
 f=int(c['start']+c['duration']*.60); wanted.append((f,c['id'],c['view'],c['heading']))
cap=cv2.VideoCapture('delivery/如何科学减肥_从身体调节说起_V10_1080p.mp4'); wmap={f:(cid,v,h) for f,cid,v,h in wanted}; imgs={}; f=0
while wmap:
 ok,b=cap.read()
 if not ok:break
 if f in wmap:
  cid,v,h=wmap.pop(f); im=Image.fromarray(cv2.cvtColor(b,cv2.COLOR_BGR2RGB)).resize((480,270)); d=ImageDraw.Draw(im); d.rectangle((0,0,480,32),fill=(20,20,20)); font=ImageFont.truetype('C:/Windows/Fonts/NotoSansSC-VF.ttf',20);d.text((4,4),f'F{f} {f/30:.1f}s {cid} {v}',font=font,fill='white'); imgs[cid]=im
 f+=1
cap.release();
for si in range(0,len(wanted),15):
 chunk=wanted[si:si+15]; cols=3; rows=(len(chunk)+cols-1)//cols; out=Image.new('RGB',(cols*480,rows*270),(0,0,0))
 for i,(f,cid,v,h) in enumerate(chunk):
  if cid in imgs: out.paste(imgs[cid],((i%cols)*480,(i//cols)*270))
 out.save(f'tmp/audit-motion/reps-{si//15+1}.jpg',quality=92)
print('saved',len(imgs))