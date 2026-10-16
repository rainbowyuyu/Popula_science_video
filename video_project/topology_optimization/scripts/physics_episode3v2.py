"""Reproducible teaching models: elastic beam, moisture diffusion, 2D LBM flow."""
from pathlib import Path
import json,numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve
R=Path(__file__).resolve().parents[1];P=R/'public/episode3v2/physics';P.mkdir(parents=True,exist_ok=True)
Q=R/'research/episode3v2'
def save(name,obj):(P/name).write_text(json.dumps(obj,separators=(',',':')),encoding='utf8')
# Orthotropic plane stress, simply supported beam, downward load on upper edge.
nx,ny=49,13;L,H,thickness=4.8,.7,.3
xy=np.array([(x,y) for y in np.linspace(0,H,ny) for x in np.linspace(0,L,nx)])
tris=[]
for j in range(ny-1):
 for i in range(nx-1):
  a=j*nx+i;tris.extend([(a,a+1,a+nx+1),(a,a+nx+1,a+nx)])
E1,E2,G,nu=10e9,.65e9,.55e9,.35
D=np.linalg.inv(np.array([[1/E1,-nu/E1,0],[-nu/E1,1/E2,0],[0,0,1/G]]))
ii=[];jj=[];vv=[];elements=[]
for tri in tris:
 pts=xy[list(tri)];area=np.linalg.det(np.column_stack([np.ones(3),pts]))/2
 b=np.roll(pts[:,1],-1)-np.roll(pts[:,1],-2);c=np.roll(pts[:,0],-2)-np.roll(pts[:,0],-1)
 B=np.zeros((3,6));B[0,::2]=b;B[1,1::2]=c;B[2,::2]=c;B[2,1::2]=b;B/=2*area
 dofs=np.array([[2*i,2*i+1] for i in tri]).flatten();ke=thickness*area*B.T@D@B
 ii.extend(np.repeat(dofs,6));jj.extend(np.tile(dofs,6));vv.extend(ke.ravel());elements.append((dofs,B,area))
K=coo_matrix((vv,(ii,jj)),shape=(len(xy)*2,)*2).tocsr();F=np.zeros(len(xy)*2)
top=np.arange(nx*(ny-1),nx*ny);w=np.ones(nx);w[[0,-1]]=.5;F[top*2+1]=-3000*w/w.sum()
fixed=np.array([0,1,(nx-1)*2+1]);free=np.setdiff1d(np.arange(len(F)),fixed);u=np.zeros_like(F);u[free]=spsolve(K[free][:,free],F[free]);reaction=K@u-F
stress=np.zeros((len(xy),3));weights=np.zeros(len(xy))
for tri,(dofs,B,area) in zip(tris,elements):
 s=D@B@u[dofs]
 for i in tri:stress[i]+=s*area;weights[i]+=area
stress/=weights[:,None]
error=float(abs(reaction[1::2].sum()-3000)/3000);assert error<1e-7 and float(u@K@u)>0
save('beam.json',{'xy':xy.round(6).tolist(),'triangles':tris,'displacement':u.reshape(-1,2).tolist(),'sigmaX':stress[:,0].tolist(),'displayGain':float(.23/np.max(abs(u[1::2]))),'length':L,'height':H,'thickness':thickness,'maxStress':float(np.max(abs(stress[:,0]))),'reactionError':error})
print('Beam FEM solved, balance error',error,flush=True)
# Relative water uptake in a transverse section, Dirichlet exposure on all sides.
mw,mh=56,48;c=np.zeros((mh,mw));moist=[];means=[];steps=4000
for step in range(steps+1):
 c[[0,-1],:]=1;c[:,[0,-1]]=1
 if step%80==0:moist.append(np.round(c,4).flatten().tolist());means.append(float(c.mean()))
 c[1:-1,1:-1]+=.13*(c[1:-1,2:]+c[1:-1,:-2]-2*c[1:-1,1:-1])+.065*(c[2:,1:-1]+c[:-2,1:-1]-2*c[1:-1,1:-1])
assert c.min()>=0 and c.max()<=1.000001 and np.all(np.diff(means)>=0)
save('moisture.json',{'nx':mw,'ny':mh,'frames':moist,'meanUptake':means,'initialMC':8,'boundaryMC':18,'betaPerPercent':{'longitudinal':.0001,'radial':.0015,'tangential':.0025},'displayGain':4,'time':'nondimensional; accelerated teaching illustration, not a species-specific drying forecast'})
print('Moisture diffusion solved',flush=True)
# D2Q9 BGK flow around a 2D pavilion elevation. Low Reynolds demonstrator.
W,Hg=200,110;dx=.1;xx,yy=np.meshgrid(np.arange(W)*dx-10,np.arange(Hg)*dx)
roofTop=5.15-1.55*np.abs(xx/3.2)+.55*np.abs(xx/3.2)**4
solid=((abs(xx)<3.25)&(yy<roofTop)&(yy>roofTop-.25))|((abs(abs(xx)-2)<.18)&(yy<3.5))|((abs(xx)<2.25)&(yy>3.28)&(yy<3.6))|(yy<.3)
cx=np.array([0,1,0,-1,0,1,-1,-1,1]);cy=np.array([0,0,1,0,-1,1,1,-1,-1]);wt=np.array([4/9]+[1/9]*4+[1/36]*4);opp=[0,3,4,1,2,7,8,5,6]
speed=.055;tau=.78
def eq(rho,ux,uy):
 cu=ux[...,None]*cx+uy[...,None]*cy
 return rho[...,None]*wt*(1+3*cu+4.5*cu*cu-1.5*(ux*ux+uy*uy)[...,None])
f=eq(np.ones((Hg,W)),np.full((Hg,W),speed),np.zeros((Hg,W)));flow=[];mins=[]
for it in range(1601):
 rho=f.sum(axis=2);ux=(f*cx).sum(axis=2)/rho;uy=(f*cy).sum(axis=2)/rho;ux[solid]=0;uy[solid]=0
 if it>=400 and it%50==0:
  flow.append({'u':np.round(ux[::2,::2]/speed,4).flatten().tolist(),'v':np.round(uy[::2,::2]/speed,4).flatten().tolist(),'p':np.round((rho[::2,::2]-1)/(3*speed*speed),4).flatten().tolist()})
  mins.append(float(rho.min()))
 f+=(eq(rho,ux,uy)-f)/tau
 for k in range(9):f[:,:,k]=np.roll(np.roll(f[:,:,k],cx[k],axis=1),cy[k],axis=0)
 f[solid,:]=f[solid,:][:,opp]
 f[:,0,:]=eq(np.ones(Hg),np.full(Hg,speed),np.zeros(Hg));f[:,-1,:]=f[:,-2,:]
 f[-1,:,:]=eq(np.ones(W),np.full(W,speed),np.zeros(W))
assert np.isfinite(f).all() and min(mins)>.8 and rho.max()<1.2
save('wind.json',{'nx':W//2,'ny':Hg//2,'dx':dx*2,'x0':-10,'y0':0,'solid':solid[::2,::2].astype(int).flatten().tolist(),'frames':flow,'latticeU':speed,'tau':tau,'model':'D2Q9 BGK, 2D pavilion silhouette, prescribed inlet, bounce-back solids, outlet extrapolation','rhoRange':[float(rho.min()),float(rho.max())],'time':'lattice units, non-dimensional flow demonstration; not atmospheric wind design'})
audit={'beam':{'method':'constant strain triangular FEM, orthotropic plane stress','E_long_Pa':E1,'E_trans_Pa':E2,'G_Pa':G,'nu_LT':nu,'loadN':3000,'boundary':'pin bottom-left, roller bottom-right','nodes':len(xy),'elements':len(tris),'forceBalanceRelativeError':error,'strainEnergyJ':float(.5*u@K@u)},'moisture':{'method':'explicit 2D anisotropic Fick diffusion','bounded':True,'monotoneMean':True,'calibration':'illustrative coefficients; no real-time species prediction'},'wind':{'method':'D2Q9 BGK','grid':[W,Hg],'steps':1600,'rhoRange':[float(rho.min()),float(rho.max())],'finite':True,'notAFullScaleCFDDesign':True}}
(Q/'physics-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf8');print('LBM complete',audit['wind'],flush=True)
