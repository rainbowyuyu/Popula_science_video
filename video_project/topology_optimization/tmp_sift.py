import cv2, numpy as np
p=r'C:\Users\zju\AppData\Local\Temp\codex-clipboard-b7d0a510-2afa-4e16-a591-15360c1c908b.png'; tpl=cv2.imread(p)
sift=cv2.SIFT_create(); kp1,des1=sift.detectAndCompute(tpl,None); print('tpl',len(kp1))
cap=cv2.VideoCapture('output/metro/metro_safety_1080p.mp4'); bf=cv2.BFMatcher(); best=[]
for sec in np.arange(0,313,1.0):
 cap.set(cv2.CAP_PROP_POS_MSEC,float(sec*1000)); ok,fr=cap.read();
 if not ok: continue
 fr=cv2.resize(fr,(480,270)); kp2,des2=sift.detectAndCompute(fr,None)
 if des2 is None: continue
 ms=bf.knnMatch(des1,des2,k=2); good=[m for m,n in ms if m.distance<0.75*n.distance]; best.append((len(good),sec))
print(sorted(best,reverse=True)[:30])
