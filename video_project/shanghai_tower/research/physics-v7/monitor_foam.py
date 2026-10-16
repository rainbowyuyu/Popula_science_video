from pathlib import Path
import re,json,argparse,numpy as np
ap=argparse.ArgumentParser();ap.add_argument('cases',nargs='+',type=Path);a=ap.parse_args()
for case in a.cases:
 report={'case':case.name,'quality':{'acceptedForFilm':False}}
 log=case/'run.log'
 if not log.exists():print(json.dumps(dict(report,state='no solver log')));continue
 s=log.read_text(errors='replace');steps=re.split(r'\nTime = ',s)[1:]
 if not steps:print(json.dumps(dict(report,state='no steps',tail=s[-500:])));continue
 report['lastTime']=float(steps[-1].splitlines()[0]);report['ended']='\nEnd\n' in s
 report['timeMeaning']='physical seconds' if 'pimpleFoam' in s[:6000] else 'SIMPLE iteration index'
 report['boundingKLast200']=sum('bounding k' in t for t in steps[-200:])
 report['boundingOmegaLast200']=sum('bounding omega' in t for t in steps[-200:])
 report['residuals']={}
 for name in ['Ux','Uy','Uz','p','k','omega']:
  vals=[]
  for step in steps[-200:]:
   m=re.search(r'Solving for '+name+r', Initial residual = ([^,]+)',step)
   if m:vals.append(float(m[1]))
  if vals:report['residuals'][name]={'last':vals[-1],'maxLast200':max(vals),'medianLast200':float(np.median(vals))}
 cd=[]
 for step in steps:
  m=re.search(r'Cd\s+: ([^\s]+)',step)
  if m:cd.append([float(step.splitlines()[0]),float(m[1])])
 report['CdWindows']={}
 for n in [200,400,800]:
  if len(cd)<n:continue
  b=np.array(cd[-n:]);c,d=np.array_split(b[:,1],2)
  report['CdWindows'][str(n)]={'timeRange':b[[0,-1],0].tolist(),'mean':float(b[:,1].mean()),'std':float(b[:,1].std()),'range':float(np.ptp(b[:,1])),'halfWindowDriftFraction':float(abs(d.mean()-c.mean())/abs(b[:,1].mean()))}
 for pattern,key in [(r'ExecutionTime = ([^ ]+) s','wallSeconds'),(r'Courant Number mean: [^ ]+ max: ([^\n]+)','maxCourant'),(r'deltaT = ([^\n]+)','deltaT'),(r'patch tower y\+ : min = ([^,]+), max = ([^,]+), average = ([^\n]+)','yPlus')]:
  m=list(re.finditer(pattern,s))
  if m:report[key]=[float(x) for x in m[-1].groups()]
 (case/'monitor.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
