import cv2,numpy as np,json
p='delivery/如何科学减肥_从身体调节说起_V10_1080p.mp4'; tl=json.load(open('src/timeline.json',encoding='utf8'))
cap=cv2.VideoCapture(p); prev=None; out=[]; f=0
while True:
 ok,b=cap.read()
 if not ok: break
 g=cv2.cvtColor(cv2.resize(b[120:960,720:1880],(160,120)),cv2.COLOR_BGR2GRAY)
 if prev is not None:
  d=cv2.absdiff(g,prev); out.append((f,float(d.mean()),float((d>32).mean())))
 prev=g; f+=1
cap.release()
for c in tl['clips']:
 x=[r for r in out if abs(r[0]-c['start'])<=30]
 if x:
  r=max(x,key=lambda z:z[1]); print(c['id'],c['start'],round(c['start']/30,3),'maxnear',r[0],round(r[1],2),round(r[2],3))