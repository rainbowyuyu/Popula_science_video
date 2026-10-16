"""Surface Cp / wall shear audit for an SU2 surface VTU.

Uses actual pressure and skin-friction vectors. The tower normal convention is
body-outward; SU2's surface exterior winding is reversed using a centroid test
and checked against the integrated dimensionless force in history.csv.
"""
from pathlib import Path
import argparse,json,hashlib,re,struct,csv
import numpy as np
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from export_fields import read_vtu,sha

HERE=Path(__file__).resolve().parent
def main():
 ap=argparse.ArgumentParser();ap.add_argument('case');ap.add_argument('--file',default=None);args=ap.parse_args()
 case=HERE/args.case
 files=sorted(case.glob('surface_flow*.vtu')) if args.file is None else [case/args.file]
 assert files, f'No surface VTU in {case}'
 f=files[-1]; points,cells,data=read_vtu(f)
 print('surface arrays',len(points),cells.keys(),data.keys())
 tris=cells['connectivity'].reshape(-1,3);typ=cells['types'];assert np.all(typ==5),np.unique(typ)
 p=points[tris,:3];a=p[:,1]-p[:,0];b=p[:,2]-p[:,0];cross=np.cross(a,b);area=np.linalg.norm(cross,axis=1)/2
 nw=cross/np.maximum(2*area[:,None],1e-20);cent=p.mean(1)
 # The current surface output is tower + ground. Tower is identified by
 # normals/height and the reconstructed body radius at each z; ground is z=0.
 tower=cent[:,2]>0.05
 # For side/top tower patches, outward body normal has positive radial dot;
 # top membrane points upward. Flip each face to body-outward.
 radial=np.column_stack((cent[:,0],cent[:,1],np.zeros(len(cent))))
 # The crown is a sloped membrane, so a pure +Z guess would flip some rim
 # facets.  Use a radial-plus-up target above the OCC level (580m), which is
 # the known exterior direction of the closed reconstruction.
 target=radial.copy();target[:,2]=np.maximum(cent[:,2]-580.,0.)
 targetnorm=np.linalg.norm(target,axis=1);target/=np.maximum(targetnorm[:,None],1e-12)
 flip=np.sum(nw*target,axis=1)<0;n_s=np.where(flip[:,None],-nw,nw)
 assert np.mean(np.sum(n_s[tower]*target[tower],axis=1)>0.0)>0.995
 # Export one body-outward unit normal per boundary node.  SU2 gives the
 # surface connectivity as triangles; keeping the face normals here would
 # make the film adapter reject the data (and would cause discontinuous arrow
 # directions at every triangle edge).  Area-weighted accumulation is the
 # standard finite-volume/graphics vertex-normal construction and preserves
 # the orientation audited above.
 node_normals=np.zeros_like(points[:,:3],dtype=float)
 for tri,normal,tri_area in zip(tris,n_s,area):
  node_normals[tri]+=normal*tri_area
 node_lengths=np.linalg.norm(node_normals,axis=1)
 if np.any(node_lengths<1e-12):
  raise ValueError('Boundary node has no valid area-weighted normal')
 node_normals/=node_lengths[:,None]
 rho=1.225;u=30.;q=.5*rho*u*u
 cp=np.asarray(data.get('Pressure_Coefficient'));prs=np.asarray(data.get('Pressure'))
 cf=np.asarray(data.get('Skin_Friction_Coefficient'))
 # SU2 primitive pressure is p/(rho Uref^2) with this INITIAL_VALUES setup;
 # the explicit q below is used to convert force. Cf uses q convention.
 pnode=prs*rho*u*u if prs is not None else cp*q*2
 pt=pnode[tris].mean(1);cft=cf[tris].mean(1) if cf is not None else np.zeros((len(tris),3))
 Fp=(-pt[:,None]*n_s*area[:,None]);Fv=(cft*q*area[:,None]);Ft=Fp+Fv
 r=cent;Mp=np.cross(r,Fp);Mv=np.cross(r,Fv);Mt=Mp+Mv
 heights=np.linspace(0,632,80+1);bins=[]
 for lo,hi in zip(heights[:-1],heights[1:]):
  m=tower&(cent[:,2]>=lo)&(cent[:,2]<hi if hi<632 else cent[:,2]<=hi)
  bins.append({'heightMin_m':float(lo),'heightMax_m':float(hi),'triangles':int(m.sum()),'pressure':{'force_N':Fp[m].sum(0).tolist(),'moment_Nm':Mp[m].sum(0).tolist()},'viscous':{'force_N':Fv[m].sum(0).tolist(),'moment_Nm':Mv[m].sum(0).tolist()},'force_N':Ft[m].sum(0).tolist(),'moment_Nm':Mt[m].sum(0).tolist(),'area_m2':float(area[m].sum())})
 total={'force_N':Ft[tower].sum(0).tolist(),'moment_Nm':Mt[tower].sum(0).tolist(),'pressure':{'force_N':Fp[tower].sum(0).tolist(),'moment_Nm':Mp[tower].sum(0).tolist()},'viscous':{'force_N':Fv[tower].sum(0).tolist(),'moment_Nm':Mv[tower].sum(0).tolist()},'area_m2':float(area[tower].sum()),'triangles':int(tower.sum())}
 # Persist the exact last history row alongside this surface snapshot. This
 # prevents readers from mistaking a stable-looking force snapshot for a
 # converged RANS mean.
 last_history=None
 hp=case/'history.csv'
 if hp.exists():
  with hp.open(encoding='utf-8-sig') as fh:
   rows=list(csv.DictReader(fh,skipinitialspace=True))
  if rows:
   rr={k.strip():v.strip() for k,v in rows[-1].items()};last_history=rr
 out={'schema':'rainbow.cfd-layer-loads/1','units':{'length':'m','force':'N','moment':'N m','pressure':'Pa','velocity':'m/s'},'coordinates':'CFD_Z_UP','forceConvention':'fluid-on-solid','bodySurface':'tower','temporalKind':'steady-mean-at-final-snapshot','momentOrigin_m':[0,0,0],'heightRange_m':[0,632],'quality':{'acceptedForCoupling':False,'status':'surface postprocess only; require residual/force/y+ audit before coupling','whyFalse':'fullscale RANS field/force history has not passed residual convergence and stationarity gates'},'provenance':{'solver':'SU2 8.5.0','case':str(case),'surfaceVTU':f.name,'surfaceVTUSHA256':sha(f),'normalConvention':'body-outward','pressureForce':'-p*n_body_outward','wallShear':'skin-friction coefficient vector multiplied by q_ref','referenceDensity_kg_m3':rho,'referenceSpeed_m_s':u,'dynamicPressure_Pa':q,'sourceFieldUnits':'SU2 INITIAL_VALUES pressure x rho*Uref^2, Cf x q_ref','historyLastRow':last_history},'bins':bins,'integratedTotal':total,'surfaceGeometry':{'points_m':points.tolist(),'triangles':tris.tolist(),'normalConvention':'body-outward','outward_normals':node_normals.tolist(),'face_outward_normals':n_s.tolist(),'centroids_m':cent.tolist(),'cp':cp.tolist(),'pressure_Pa':pnode.tolist(),'yPlus':data.get('Y_Plus',np.zeros(len(points))).tolist(),'wallShearCoefficient':cf.tolist() if cf is not None else None},'limitations':['Only final saved surface snapshot; this is not a time mean until force/field convergence is demonstrated.','The smooth reconstructed envelope uses a closed crown membrane and isolated ground.','Input U500=30 m/s power-law is an explicit illustrative condition, not measured Shanghai design wind.','Pressure force sign is fluid-on-solid with body-outward normals; inspect normal quality before any structural coupling.']}
 (case/'surface-loads.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'case':str(case),'source':f.name,'towerTriangles':int(tower.sum()),'total':total,'out':str(case/'surface-loads.json')},indent=2))
if __name__=='__main__':main()
