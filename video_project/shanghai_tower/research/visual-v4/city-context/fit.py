import numpy as np,json
from scipy.optimize import differential_evolution
from scipy.spatial import ConvexHull
P=np.array(json.load(open('research/visual-v4/city-context/glass-points.json')))[::2]
f=1080/(2*np.tan(np.deg2rad(17)))
target=np.array([85,1225,1330,1180,1420,1080,1570,963,1770.])
def project(v):
 d,cy,ty,az,shift,roll=v;c=np.array([d*np.cos(az),cy,d*np.sin(az)]);fw=np.array([0.,ty,0])-c;fw/=np.linalg.norm(fw);rr=np.cross(fw,[0,1,0]);rr/=np.linalg.norm(rr);up=np.cross(rr,fw);rr1=rr*np.cos(roll)+up*np.sin(roll);up1=-rr*np.sin(roll)+up*np.cos(roll);p=P-c;z=p@fw;x=960+shift+(p@rr1)/z*f;y=540-(p@up1)/z*f;xy=np.column_stack([x,y]);xy=xy[(z>.05)&(y<1400)&(y>-500)];h=xy[ConvexHull(xy).vertices];mn=h[:,1].min();out=[mn]
 for row in [110,300,600,1000]:
  hits=[]
  for a,b in zip(h,np.roll(h,-1,axis=0)):
   if (a[1]<=row<b[1])or(b[1]<=row<a[1]):hits.append(a[0]+(b[0]-a[0])*(row-a[1])/(b[1]-a[1]))
  if len(hits)<2:return np.ones(9)*1e5
  out.extend([min(hits),max(hits)])
 return np.array(out)
def fun(v):
 try:return np.mean((project(v)-target)**2)
 except:return 1e12
r=differential_evolution(fun,[(1,3),(.10,.6),(3.0,4.5),(0,6.28),(180,500),(-.22,.22)],popsize=10,maxiter=150,seed=11,tol=.001,polish=True)
print(r.fun,r.x,project(r.x));d,cy,ty,az,shift,roll=r.x;print('r,el,y,az,shift,roll',np.hypot(d,ty-cy),np.arctan2(cy-ty,d),ty,az,-shift,roll)
json.dump({'parameters':r.x.tolist(),'metrics':project(r.x).tolist(),'target':target.tolist(),'cost':r.fun},open('research/visual-v4/city-context/projection-fit.json','w'),indent=2)
