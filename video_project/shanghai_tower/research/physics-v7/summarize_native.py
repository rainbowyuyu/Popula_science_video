"""Area-weighted native boundary audit, physical limits, no approval decisions."""
from pathlib import Path
import argparse,json,numpy as np
from export_volume import read_vtu,vtk,vtk_to_numpy
ap=argparse.ArgumentParser();ap.add_argument('case',type=Path);a=ap.parse_args();p=a.case
g=read_vtu(p/'internal.vtu');s=read_vtu(p/'boundary/tower.vtp')
sizes=vtk.vtkCellSizeFilter();sizes.SetInputData(s);sizes.ComputeAreaOn();sizes.Update();area=vtk_to_numpy(sizes.GetOutput().GetCellData().GetArray('Area'))
report={'case':p.name,'surfaceArea_m2':float(area.sum()),'pointFieldNames':[g.GetPointData().GetArrayName(i) for i in range(g.GetPointData().GetNumberOfArrays())],'nativeCellFieldRanges':{},'boundary':{},'quality':{'acceptedForFilm':False}}
for name in ['p','U','k','omega','nut']:
 arr=g.GetCellData().GetArray(name)
 if arr is None:continue
 v=vtk_to_numpy(arr);v=np.linalg.norm(v,axis=1) if v.ndim==2 else v
 report['nativeCellFieldRanges'][name]={'min':float(v.min()),'max':float(v.max()),'finite':bool(np.isfinite(v).all()),'negativeCount':int(np.sum(v<0))}
for name in ['yPlus','k','omega','nut','p']:
 arr=s.GetCellData().GetArray(name)
 if arr is None:continue
 v=vtk_to_numpy(arr);idx=np.argsort(v);cum=np.cumsum(area[idx])/area.sum()
 data={'min':float(v.min()),'max':float(v.max()),'areaMean':float(np.average(v,weights=area)),'areaWeightedP01_P05_P50_P95_P99':np.interp([.01,.05,.5,.95,.99],cum,v[idx]).tolist()}
 if name=='yPlus':
  data['areaFractions']={key:float(area[mask].sum()/area.sum()) for key,mask in [('below5',v<5),('below30',v<30),('30to300',(v>=30)&(v<=300)),('above300',v>300),('above500',v>500)]}
 report['boundary'][name]=data
(p/'native-field-summary.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
