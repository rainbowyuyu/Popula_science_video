"""Export real 3D RK4 pathlines from a solved SU2 VTU via VTK containment."""
from pathlib import Path
import argparse,json,hashlib,math
import numpy as np
HERE=Path(__file__).resolve().parent
DEPS=HERE/'_deps'
import sys;sys.path.insert(0,str(DEPS))
import vtk

def main():
 ap=argparse.ArgumentParser();ap.add_argument('case');ap.add_argument('--file',default=None);ap.add_argument('--count',type=int,default=36);ap.add_argument('--dt',type=float,default=.5);ap.add_argument('--duration',type=float,default=40);args=ap.parse_args()
 case=HERE/args.case;files=sorted(case.glob('flow_*.vtu'))
 f=case/(args.file or (files[-1].name if files else 'flow.vtu'));assert f.exists(),f
 rd=vtk.vtkXMLUnstructuredGridReader();rd.SetFileName(str(f));rd.Update();grid=rd.GetOutput();assert grid.GetNumberOfPoints()>0
 arr=grid.GetPointData().GetArray('Velocity');assert arr
 # SU2 INITIAL_VALUES scales Velocity by Uref=30m/s for this case.
 UREF=30.;vel=np.array([arr.GetTuple3(i) for i in range(arr.GetNumberOfTuples())],float)*UREF
 locator=vtk.vtkCellLocator();locator.SetDataSet(grid);locator.BuildLocator();gencell=vtk.vtkGenericCell()
 def v(q):
  p=[float(x) for x in q];pc=[0.,0.,0.];w=[0.]*64
  cid=grid.FindCell(p,gencell,-1,1e-7,vtk.reference(0),pc,w)
  if cid<0:return None
  cell=grid.GetCell(cid);ids=cell.GetPointIds();ww=w[:ids.GetNumberOfIds()]
  return sum((ww[k]*vel[ids.GetId(k)] for k in range(ids.GetNumberOfIds())),np.zeros(3))
 xmin,xmax,ymin,ymax,zmin,zmax=grid.GetBounds();
 # Seeds are in solver x,y,z, then emitted as Three XYZ/Y-up [x,z,-y].
 seeds=[]
 for z in np.linspace(max(12,zmin+8),min(620,zmax-8),6):
  for y in np.linspace(-220,220,6):seeds.append([-900.,float(y),float(z)])
 seeds=seeds[:args.count];lines=[]
 for seed in seeds:
  q=np.array(seed,float);pts=[];speeds=[];tt=[]
  for k in range(int(args.duration/args.dt)+1):
   a=v(q)
   if a is None:break
   pts.append([float(q[0]),float(q[2]),float(-q[1])]);speeds.append(float(np.linalg.norm(a)));tt.append(float(k*args.dt))
   b=v(q+a*args.dt/2);c=v(q+b*args.dt/2);d=v(q+c*args.dt)
   if b is None or c is None or d is None:break
   q+=args.dt*(a+2*b+2*c+d)/6
  if len(pts)>=2:lines.append({'seed_solver_xyz_m':seed,'points_m':pts,'speed_m_s':speeds,'travelTime_s':tt})
 status='provisional-not-converged';log=(case/'run.log').read_text(errors='replace') if (case/'run.log').exists() else '';hist=next(iter(case.glob('history*.csv')),None)
 manifest={'schema':'rainbow.computed-wind-paths/1','coordinates':'metres, Three.js XYZ, Y up','provenance':{'solver':'SU2 8.5.0 incompressible SA RANS','case':str(case),'meaning':'Actual velocity paths through one saved three-dimensional RANS snapshot under the prescribed power-law inlet; not measured full-scale atmospheric flow','sourceSHA256':hashlib.sha256(f.read_bytes()).hexdigest(),'sourceVTU':f.name},'quality':{'acceptedForFilm':False,'status':status,'reason':'Force/residual/y+ convergence audit not yet passed; do not bind to structural loads.'},'pathIntegrator':'RK4, fixed dt seconds, tetra/prism native cell interpolation via VTK FindCell','viewBounds_m':{'ThreeX':[-450,1000],'ThreeY':[0,750],'ThreeZ':[-300,300],'sourceSolverBounds':[xmin,xmax,ymin,ymax,zmin,zmax]},'seedConvention':'solver x=-900m, y lateral, z height; emitted Three [x,z,-y]','streamlines':[{'points_m':line['points_m'],'speed_m_s':line['speed_m_s'],'travelTime_s':line['travelTime_s']} for line in lines],'seedData':lines,'limitations':['Uniform isolated reconstructed tower geometry with prescribed power-law inlet; not measured Shanghai atmospheric flow.','Paths are only from this saved solution snapshot, not a time sequence unless source is URANS.','Keep rigid tower during flow shot; use structural deformation in a separate transition.']}
 (case/'computed-wind-paths.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'out':str(case/'computed-wind-paths.json'),'lines':len(lines),'source':f.name},indent=2))
if __name__=='__main__':main()
