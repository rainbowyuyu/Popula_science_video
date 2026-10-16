import cv2,numpy as np,json
p='delivery/如何科学减肥_从身体调节说起_V10_1080p.mp4'
cap=cv2.VideoCapture(p); rows=[]; prev=None; f=0
while True:
 ok,b=cap.read()
 if not ok: break
 g=cv2.cvtColor(cv2.resize(b[120:960,720:1880],(160,120)),cv2.COLOR_BGR2GRAY)
 if prev is not None:
  d=cv2.absdiff(g,prev); rows.append((f,float(d.mean()),float((d>32).mean())))
 prev=g; f+=1
cap.release(); a=np.array(rows)
print('frames',f,'median',np.median(a[:,1]),'p95',np.percentile(a[:,1],95),'max',a[:,1].max())
for r in sorted(rows,key=lambda x:x[1],reverse=True)[:100]: print(r[0],round(r[0]/30,3),round(r[1],2),round(r[2],3))