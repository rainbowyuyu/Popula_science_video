"""Time-integrated native control-volume momentum balance, including storage."""
from pathlib import Path
import argparse,json,numpy as np
ap=argparse.ArgumentParser();ap.add_argument('case',type=Path);ap.add_argument('--start',type=float,required=True);ap.add_argument('--end',type=float,required=True);a=ap.parse_args();r=a.case/'postProcessing'
def rows(name,filename):
 out={}
 for path in (r/name).glob('*/'+filename):
  for line in path.read_text().splitlines():
   if line.startswith('#') or not line.strip():continue
   x=np.fromstring(line.replace('(','').replace(')',''),sep=' ')
   if len(x)>1:out[float(x[0])]=x[1:]
 return np.array(sorted(out)),np.array([out[k] for k in sorted(out)])
def at(tx,t):
 tt,x=tx
 if not(len(tt)>1 and tt[0]<=t<=tt[-1]):raise ValueError(f'Window endpoint {t} not available in native output ({tt[0] if len(tt) else None}..{tt[-1] if len(tt) else None})')
 return np.array([np.interp(t,tt,x[:,i]) for i in range(x.shape[1])])
def mean(tx):
 tt,x=tx;t=np.r_[a.start,tt[(tt>a.start)&(tt<a.end)],a.end];v=np.array([at(tx,q) for q in t]);return np.trapz(v,t,axis=0)/(a.end-a.start)
patches=['inlet','outlet','ground','sides','ceiling'];body=mean(rows('forcesBody','force.dat'))[:3];outer=mean(rows('forcesOuter','force.dat'))[:3]
adv=1.225*sum((mean(rows('momentum_'+p,'surfaceFieldValue.dat')) for p in patches),start=np.zeros(3))
volume=rows('volumeMomentum','volFieldValue.dat');storage=1.225*(at(volume,a.end)-at(volume,a.start))/(a.end-a.start)
flux={p:float(mean(rows('flux_'+p,'surfaceFieldValue.dat'))[0]) for p in patches}
res=body+outer+adv+storage
report={'case':a.case.name,'window_s':[a.start,a.end],'bodyForceMean_N':body.tolist(),'outerForceMean_N':outer.tolist(),'advectiveMomentumFluxMean_N':adv.tolist(),'volumeMomentumStorageMean_N':storage.tolist(),'integratedMomentumResidual_N':res.tolist(),'momentumRelativeBodyForce':float(np.linalg.norm(res)/np.linalg.norm(body)),'boundaryVolumeFluxMean_m3_s':flux,'massRelativeInlet':float(abs(sum(flux.values()))/abs(flux['inlet'])),'method':'Trapezoid integrate actual native function-object outputs at physical times; include rho*(integral U dV_end - integral U dV_start)/window. Linear interpolation only at existing time interval endpoints.','quality':{'acceptedForFilm':False}}
out=a.case/f'window-audit-{a.start:g}-{a.end:g}.json';out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
