"""Read native function-object integrals; do not infer body force from plot colors."""
from pathlib import Path
import argparse,numpy as np,json
ap=argparse.ArgumentParser();ap.add_argument('case',type=Path);ap.add_argument('--transient',action='store_true');a=ap.parse_args();r=a.case/'postProcessing'
def rows(name,filename):
 out={}
 for path in (r/name).glob('*/'+filename):
  for line in path.read_text().splitlines():
   if line.startswith('#') or not line.strip():continue
   x=np.fromstring(line.replace('(','').replace(')',''),sep=' ')
   if len(x)>1:out[float(x[0])]=x[1:]
 return out
patches=['inlet','outlet','ground','sides','ceiling']
flux={p:rows('flux_'+p,'surfaceFieldValue.dat') for p in patches}
momentum={p:rows('momentum_'+p,'surfaceFieldValue.dat') for p in patches}
body=rows('forcesBody','force.dat');outer=rows('forcesOuter','force.dat')
common=sorted(set(body)&set(outer)&set.intersection(*(set(x) for x in flux.values()))&set.intersection(*(set(x) for x in momentum.values())))
results=[]
volume=rows('volumeMomentum','volFieldValue.dat') if a.transient else {}
vt=np.array(sorted(volume));vm=np.array([volume[t] for t in vt])
def interp_m(t):
 return np.array([np.interp(t,vt,vm[:,i]) for i in range(3)])
for t in common[-40:]:
 mass=sum(float(x[t][0]) for x in flux.values());adv=1.225*sum((x[t] for x in momentum.values()),start=np.zeros(3));fb=body[t][:3];fo=outer[t][:3];res=fb+fo+adv
 record={'timeOrIteration':t,'inletVolumeFlux_m3_s':float(flux['inlet'][t][0]),'netVolumeFlux_m3_s':mass,'relativeMassImbalance':float(abs(mass)/abs(flux['inlet'][t][0])),'bodyForce_N':fb.tolist(),'outerForce_N':fo.tolist(),'advectiveMomentumFlux_N':adv.tolist(),'steadyMomentumResidual_N':res.tolist(),'steadyMomentumImbalanceRelativeBodyForce':float(np.linalg.norm(res)/np.linalg.norm(fb))}
 if a.transient and len(vt)>=3 and t>=vt[0]+1 and t<=vt[-1]-1:
  storage=1.225*(interp_m(t+1)-interp_m(t-1))/2
  residual=res+storage
  record.update(momentumStorage_N=storage.tolist(),transientMomentumResidual_N=residual.tolist(),transientMomentumImbalanceRelativeBodyForce=float(np.linalg.norm(residual)/np.linalg.norm(fb)),storageDifferenceWindow_s=2)
 results.append(record)
report={'case':a.case.name,'equation':'F_body + F_outer + rho * sum(phi U) = 0 for converged steady flow; URANS additionally needs volume momentum storage','results':results,'quality':{'acceptedForFilm':False}}
(a.case/'integral-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(case=a.case.name,last=results[-1] if results else None)))
