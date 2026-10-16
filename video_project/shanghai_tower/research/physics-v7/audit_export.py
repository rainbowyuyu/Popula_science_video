"""Verify exported native CFD paths, masks, Cp conventions and field finiteness."""
from pathlib import Path
import argparse,json,numpy as np
from export_volume import NativeField,read_vtu,inverse,vtk,vtk_to_numpy

ap=argparse.ArgumentParser();ap.add_argument('case',type=Path);ap.add_argument('--volume',default='internal.vtu');ap.add_argument('--surface',default='boundary/tower.vtp');a=ap.parse_args();p=a.case
grid=read_vtu(p/a.volume);tower=read_vtu(p/a.surface);field=NativeField(grid,tower,'openfoam')
paths=json.loads((p/'computed-wind-paths.json').read_text(encoding='utf8'))
records=[]
for i,s in enumerate(paths['streamlines']):
 x=inverse(np.array(s['points_m']));t=np.array(s['travelTime_s']);v=np.array(s['speed_m_s'])
 samples=[]
 for p0,p1 in zip(x[:-1],x[1:]):
  n=max(2,int(np.ceil(np.linalg.norm(p1-p0)/.5))+1)
  samples.extend(np.linspace(p0,p1,n))
 vel,cp,solid,valid=field.probe(np.array(samples))
 records.append({'index':i,'points':len(x),'segmentSamples':len(samples),'insideSolidCount':int(solid.sum()),'outsideVolumeCount':int((~valid&~solid).sum()),'travelTimeStrictlyIncreasing':bool(np.all(np.diff(t)>0)),'finite':bool(np.isfinite(v).all() and np.isfinite(t).all()),'minimumSpeed_m_s':float(v.min()),'maxSegment_m':float(np.max(np.linalg.norm(np.diff(x,axis=0),axis=1)))})
slices=json.loads((p/'computed-flow-slices.json').read_text(encoding='utf8'));sm=[]
for s in slices['slices']:
 mask=np.array(s['validMask'],dtype=bool);inside=np.array(s['insideSolidMask'],dtype=bool)
 value=np.array([np.nan if x is None else x for x in s['speed_m_s']]);vectors=np.array([[np.nan]*3 if x is None else x for x in s['velocity_m_s']])
 sm.append({'id':s['id'],'validCount':int(mask.sum()),'solidCount':int(inside.sum()),'noSolidValues':bool(np.all(~mask[inside])),'validValuesFinite':bool(np.isfinite(value[mask]).all() and np.isfinite(vectors[mask]).all()),'speedVectorNormError':float(np.max(np.abs(value[mask]-np.linalg.norm(vectors[mask],axis=1))))})
pressure=json.loads((p/'computed-pressure.json').read_text(encoding='utf8'))
x=np.array(pressure['points_m']);tri=np.array(pressure['triangles']);n=np.array(pressure['outward_normals']);geon=np.cross(x[tri[:,1]]-x[tri[:,0]],x[tri[:,2]]-x[tri[:,0]])
winding=float(np.mean(np.sum(geon*n[tri].mean(1),axis=1)>0))
report={'paths':records,'slices':sm,'pressure':{'triangles':len(tri),'outwardTriangleFraction':winding,'normalLengthErrorMax':float(np.max(np.abs(np.linalg.norm(n,axis=1)-1))),'cpPressureIdentityError':float(np.max(np.abs(np.array(pressure['cp'])-np.array(pressure['pressure_Pa'])/(.5*1.225*30**2))))},'registrationAndExportOnly':True,'numericalAcceptance':False}
report['exportIntegrityPassed']=all(r['insideSolidCount']==0 and r['outsideVolumeCount']==0 and r['travelTimeStrictlyIncreasing'] and r['finite'] for r in records) and all(s['noSolidValues'] and s['validValuesFinite'] and s['speedVectorNormError']<1e-5 for s in sm) and winding>.999
(p/'export-integrity-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
