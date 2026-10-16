import cv2, numpy as np, os, subprocess, tempfile
p=r'C:\Users\zju\AppData\Local\Temp\codex-clipboard-b7d0a510-2afa-4e16-a591-15360c1c908b.png'
tpl=cv2.imread(p)
cap=cv2.VideoCapture('output/metro/metro_safety_1080p.mp4')
fps=cap.get(cv2.CAP_PROP_FPS)
best=[]
for sec in np.arange(0,313,0.5):
 cap.set(cv2.CAP_PROP_POS_MSEC,float(sec*1000)); ok,fr=cap.read()
 if not ok: continue
 fr=cv2.resize(fr,(480,270))
 r=cv2.matchTemplate(fr,tpl,cv2.TM_CCOEFF_NORMED)
 _,mx,_,loc=cv2.minMaxLoc(r); best.append((mx,sec,loc))
print(sorted(best,reverse=True)[:20])
