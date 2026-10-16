"""Actual Q4 plane-stress FEM + filtered SIMP/OC, SI-like N/mm/MPa units.
No invented iteration data. Consistent element/node order: BL,BR,TR,TL.
"""
from pathlib import Path
import json, numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve
R=Path(__file__).resolve().parents[1]
OUT=R/'public/v3'; OUT.mkdir(parents=True,exist_ok=True)
nx,ny=80,40; hx=hy=5.; E=70000.; nu=.3; thick=8.; vol=.35; penal=3.; emin=1e-6
D=E/(1-nu*nu)*np.array([[1,nu,0],[nu,1,0],[0,0,(1-nu)/2]])
def bmatrix(xi,eta):
    dx=np.array([-(1-eta),1-eta,1+eta,-(1+eta)])/(2*hx)
    dy=np.array([-(1-xi),-(1+xi),1+xi,1-xi])/(2*hy)
    b=np.zeros((3,8)); b[0,0::2]=dx; b[1,1::2]=dy; b[2,0::2]=dy; b[2,1::2]=dx
    return b
ke=np.zeros((8,8))
for xi in [-1/np.sqrt(3),1/np.sqrt(3)]:
 for eta in [-1/np.sqrt(3),1/np.sqrt(3)]:
    b=bmatrix(xi,eta); ke+=b.T@D@b*thick*hx*hy/4
nodes=np.arange((nx+1)*(ny+1)).reshape(ny+1,nx+1)
en=np.stack([nodes[:-1,:-1].ravel(),nodes[:-1,1:].ravel(),nodes[1:,1:].ravel(),nodes[1:,:-1].ravel()],axis=1)
edof=np.empty((nx*ny,8),dtype=int); edof[:,0::2]=en*2; edof[:,1::2]=en*2+1
ir=np.repeat(edof,8,axis=1).ravel(); jc=np.tile(edof,(1,8)).ravel(); ndof=2*nodes.size
fixed=np.ravel(np.column_stack([2*nodes[:,0],2*nodes[:,0]+1])); free=np.setdiff1d(np.arange(ndof),fixed)
force=np.zeros(ndof); force[2*nodes[-3:,-1]+1]=-100/3
def solve(rho,load=force):
    fac=emin+(1-emin)*rho**penal
    K=coo_matrix((np.outer(fac,ke.ravel()).ravel(),(ir,jc)),shape=(ndof,ndof)).tocsc()
    u=np.zeros(ndof); u[free]=spsolve(K[free,:][:,free],load[free])
    ce=np.einsum('ij,jk,ik->i',u[edof],ke,u[edof])
    res=K@u-load
    return u,ce,float(load@u),float(np.linalg.norm(res[free])/np.linalg.norm(load)),float(res[fixed[1::2]].sum())
radius=2.5; hr=[]; hc=[]; hv=[]
for y in range(ny):
 for x in range(nx):
  for yy in range(max(0,y-2),min(ny,y+3)):
   for xx in range(max(0,x-2),min(nx,x+3)):
    w=max(0,radius-np.hypot(x-xx,y-yy))
    if w: hr.append(y*nx+x); hc.append(yy*nx+xx); hv.append(w)
H=coo_matrix((hv,(hr,hc)),shape=(nx*ny,nx*ny)).tocsr(); hs=np.asarray(H.sum(axis=1)).ravel()
x=np.full(nx*ny,vol); history=[]
for it in range(101):
 u,ce,c,res,react=solve(x)
 if it%2==0 or it==100:
  history.append(dict(iteration=it,compliance=c,volume=float(x.mean()),density=np.round(x,4).tolist(),tipMm=float(-np.mean(u[2*nodes[-3:,-1]+1]))))
 if it%20==0: print('iteration',it,'compliance',round(c,6),'volume',round(x.mean(),6),flush=True)
 if it==100: break
 dc=-penal*(1-emin)*x**(penal-1)*ce; dc=np.asarray(H@(x*dc))/hs/np.maximum(.001,x)
 lo,hi=0.,1e9
 while (hi-lo)/(hi+lo+1e-15)>1e-5:
  mid=(lo+hi)/2
  new=np.maximum(.001,np.maximum(x-.15,np.minimum(1,np.minimum(x+.15,x*np.sqrt(-dc/mid)))))
  if new.mean()>vol:lo=mid
  else:hi=mid
 x=new
solid=np.ones(nx*ny)
# Same nominal material budget: a uniform horizontal top strip, 14 of 40 rows.
strip=np.zeros((ny,nx)); strip[-14:,:]=1; strip=strip.ravel()
u,ce,c,res,react=solve(x)
stress=np.einsum('ab,eb->ea',D@bmatrix(0,0),u[edof])*(emin+(1-emin)*x[:,None]**penal)
vm=np.sqrt(stress[:,0]**2-stress[:,0]*stress[:,1]+stress[:,1]**2+3*stress[:,2]**2)
def summary(d):
 uu,_,cc,rr,re=solve(d);return dict(compliance=cc,tipMm=float(-np.mean(uu[2*nodes[-3:,-1]+1])),volume=float(d.mean()),residual=rr,reactionN=re,displacement=np.round(uu.reshape(-1,2),8).tolist())
comparisons=dict(solid=summary(solid),strip=summary(strip),optimized=summary(x))
double=solve(x,2*force)
checks=dict(relativeResidual=res,reactionN=react,loadN=100,volumeFraction=float(x.mean()),doubleLoadLinearity=float(np.max(np.abs(double[0]-2*u))),stiffnessSymmetry=float(np.max(np.abs(ke-ke.T))),minDensity=float(x.min()),maxDensity=float(x.max()))
assert res<1e-6 and abs(react-100)<1e-4 and abs(x.mean()-vol)<1e-4
assert comparisons['optimized']['compliance']<comparisons['strip']['compliance']
data=dict(nx=nx,ny=ny,widthMm=nx*hx,heightMm=ny*hy,thicknessMm=thick,youngMPa=E,poisson=nu,loadN=100,volumeTarget=vol,penalty=penal,filterRadiusCells=radius,history=history,displacement=np.round(u.reshape(-1,2),8).tolist(),vonMisesMPa=np.round(vm,6).tolist(),comparisons=comparisons,checks=checks,method='Q4 plane stress; 2x2 Gauss; sensitivity filter; SIMP p=3; OC; left edge fixed; top-right 3 nodes share vertical 100 N')
(OUT/'simulation.json').write_text(json.dumps(data,separators=(',',':')),encoding='utf8')
(R/'research/v3').mkdir(exist_ok=True)
(R/'research/v3/experiment.json').write_text(json.dumps({k:v for k,v in data.items() if k not in ['history','displacement','vonMisesMPa']},indent=2),encoding='utf8')
print(json.dumps(comparisons,indent=2)); print(json.dumps(checks,indent=2))
