"""Same-location Cp/velocity sensitivity with native-cell sampling."""
from pathlib import Path
import argparse,json,numpy as np
from export_volume import NativeField,read_vtu,inverse,vtk,vtk_to_numpy
ap=argparse.ArgumentParser();ap.add_argument('reference',type=Path);ap.add_argument('candidate',type=Path);ap.add_argument('--out',type=Path,required=True);a=ap.parse_args()
def get(case):
 inlet=read_vtu(case/'boundary/inlet.vtp');size=vtk.vtkCellSizeFilter();size.SetInputData(inlet);size.ComputeAreaOn();size.Update();area=vtk_to_numpy(size.GetOutput().GetCellData().GetArray('Area'))
 pref=float(np.average(vtk_to_numpy(inlet.GetCellData().GetArray('p')),weights=area))*1.225
 f=NativeField(read_vtu(case/'internal.vtu'),read_vtu(case/'boundary/tower.vtp'),'openfoam',pref)
 return f,pref
f0,p0=get(a.reference);f1,p1=get(a.candidate)
report={'reference':str(a.reference),'candidate':str(a.candidate),'referencePressure_Pa':[p0,p1],'velocitySlices':[],'method':'Probe native finite volume fields at identical fixed positions; points invalid/in solid in either mesh excluded, no extrapolation.'}
for z in [100,300,500]:
 x,y=np.meshgrid(np.linspace(-200,700,181),np.linspace(-180,180,73));xyz=np.c_[x.ravel(),y.ravel(),np.full(x.size,z)]
 u0,c0,s0,v0=f0.probe(xyz);u1,c1,s1,v1=f1.probe(xyz);ok=v0&v1
 # Exclude immediate skin for medium-scale qualitative field comparison.
 delta=np.linalg.norm(u1[ok]-u0[ok],axis=1)/30.;ds=(np.linalg.norm(u1[ok],axis=1)-np.linalg.norm(u0[ok],axis=1))/30
 report['velocitySlices'].append({'height_m':z,'points':int(ok.sum()),'vectorRMSRelativeUref':float(np.sqrt(np.mean(delta**2))),'speedRMSRelativeUref':float(np.sqrt(np.mean(ds**2))),'vectorP95RelativeUref':float(np.quantile(delta,.95)),'CpRMS':float(np.sqrt(np.mean((c1[ok]-c0[ok])**2)))})
# Compare surface values through native closest cell interpolation; exact body
# meshes differ slightly, so query each native skin using nearest surface cell.
reference=json.loads((a.reference/'computed-pressure.json').read_text(encoding='utf8'));xyz=inverse(np.array(reference['points_m']));vals=[]
for f in [f0,f1]:
 pd=f.closed_tower;loc=vtk.vtkStaticCellLocator();loc.SetDataSet(pd);loc.BuildLocator();pressure=vtk_to_numpy(pd.GetPointData().GetArray('p'));cp=[];dist=[]
 for pt in xyz:
  q=[0.,0.,0.];cid=vtk.reference(0);sub=vtk.reference(0);d=vtk.reference(0.);loc.FindClosestPoint(pt,q,cid,sub,d);cell=pd.GetCell(int(cid));weights=[0.]*cell.GetNumberOfPoints();para=[0.,0.,0.];qq=[0.,0.,0.];dd=vtk.reference(0.);cell.EvaluatePosition(q,qq,sub,para,dd,weights)
  ids=cell.GetPointIds();pr=sum(weights[j]*pressure[ids.GetId(j)] for j in range(len(weights)))*1.225-f.reference_pressure_Pa;cp.append(pr/(.5*1.225*30**2));dist.append(float(d)**.5)
 vals.append((np.array(cp),np.array(dist)))
ok=(vals[0][1]<1.5)&(vals[1][1]<1.5);dif=vals[1][0][ok]-vals[0][0][ok]
report['surfaceCp']={'matchedPoints':int(ok.sum()),'coverage':float(ok.mean()),'RMSDeltaCp':float(np.sqrt(np.mean(dif**2))),'P95AbsoluteDeltaCp':float(np.quantile(np.abs(dif),.95)),'meanDeltaCp':float(dif.mean())}
report['quality']={'acceptedForFilm':False};a.out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
