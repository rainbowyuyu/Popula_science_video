import cv2,numpy as np
p='delivery/如何科学减肥_从身体调节说起_V10_1080p.mp4';cap=cv2.VideoCapture(p); frames=[]
for f in range(26103,26378,15):
 cap.set(cv2.CAP_PROP_POS_FRAMES,f);ok,b=cap.read();
 if ok: frames.append((f,b[120:1000,950:1700]))
cap.release();
for (a,(f,x)) in enumerate(frames[1:],1):
 g=cv2.cvtColor(cv2.resize(x,(150,120)),cv2.COLOR_BGR2GRAY);p0=cv2.cvtColor(cv2.resize(frames[a-1][1],(150,120)),cv2.COLOR_BGR2GRAY);d=cv2.absdiff(g,p0);print(f,round(float(d.mean()),2),round(float((d>15).mean()),3))