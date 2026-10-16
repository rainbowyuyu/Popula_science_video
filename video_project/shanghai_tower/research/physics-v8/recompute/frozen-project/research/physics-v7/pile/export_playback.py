"""Compact physical playback; conservative soil-force aggregation with couples."""
from pathlib import Path
import json,hashlib,datetime
import numpy as np
from solve_pile import fields,mesh,P,LAYERS
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[2]
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(name,x,compact=False):(OUT/name).write_text(json.dumps(x,ensure_ascii=False,allow_nan=False,indent=None if compact else 2,separators=(',',':') if compact else None)+'\n',encoding='utf8')
def r(x,d=7):return np.round(np.asarray(x),d).tolist()
case=json.loads((OUT/'case.json').read_text('utf8'));qa=json.loads((OUT/'validation.json').read_text('utf8'))
assert qa['passed'] and qa['selectedMeshTimeStep']['passed']
a=np.load(OUT/'dt0.01_mesh0.125.npz');m=mesh(.125);z=a['depth_m']
desired=np.unique(np.round(np.r_[np.arange(53),[v['top_m']-P['head_depth_below_grade_m'] for v in LAYERS if 0<v['top_m']-P['head_depth_below_grade_m']<52]],6))
ni=np.array([np.argmin(abs(z-d)) for d in desired]);assert np.max(abs(z[ni]-desired))<1e-6
ni=np.unique(ni);assert np.all(np.diff(ni)>0)
bound=(z[ni[:-1]]+z[ni[1:]])/2;bin_id=np.searchsorted(bound,z,side='right')
groups=[np.flatnonzero(bin_id==i) for i in range(len(ni))]
area=np.array([np.pi*P['diameter_m']*m['trib'][g].sum() for g in groups])
def pack(f):
 side=f['sideReactionOnPile_N'];agg=np.stack([side[:,g].sum(axis=1) for g in groups],axis=1)
 couple=np.stack([np.sum((z[g]-z[ni[i]])[None,:]*side[:,g,0],axis=1) for i,g in enumerate(groups)],axis=1)
 # Equivalent node forces plus these couples preserve the fine mesh moment.
 force_err=float(abs(agg.sum(axis=1)-side.sum(axis=1)).max())
 moment_err=float(abs((agg[:,:,0]*z[ni]+couple).sum(axis=1)-(side[:,:,0]*z).sum(axis=1)).max())
 assert force_err<1e-5 and moment_err<1e-4
 out=dict(nodeU_m=r(f['nodeU_m'][:,ni],9),nodeRotation_rad=r(f['nodeRotation_rad'][:,ni],9),
   soilForceOnPile_N=r(agg,4),soilEquivalentCouple_Nm=r(couple,4),shaftBinAverageTraction_Pa=r(agg[:,:,1]/area,3),toeReactionOnPile_N=r(f['toeReactionOnPile_N'],4))
 for key in ['axialTensionPositive_N','shearGlobalX_N','moment_Nm']:
  vals=f[key];out[key]=r(np.stack([np.stack((vals[:,left,0],vals[:,right-1,1]),axis=-1) for left,right in zip(ni[:-1],ni[1:])],axis=1),4)
 normal=abs(f['axialTensionPositive_N'])/m['A']+abs(f['moment_Nm'])*P['diameter_m']/2/m['I']
 out['segmentNormalStressEnvelope_MPa']=r(np.stack([normal[:,left:right].max(axis=(1,2))/1e6 for left,right in zip(ni[:-1],ni[1:])],axis=1),6)
 return out,dict(maxAggregationForceError_N=force_err,maxAggregationMomentError_Nm=moment_err)
it=np.arange(0,len(a['time_s']),5)
dyn_fields={k:a[k][it] for k in ['nodeU_m','nodeRotation_rad','sideReactionOnPile_N','toeReactionOnPile_N','axialTensionPositive_N','shearGlobalX_N','moment_Nm']}
dynamic,dq=pack(dyn_fields);static,sq=pack(fields(m,a['staticU'],np.zeros_like(a['staticU'])))
dynamic.update(time_s=r(a['time_s'][it],6),appliedHeadIncrement_N=r(a['appliedHeadIncrement_N'][it],4))
for key in ['strainEnergy_J','kineticEnergy_J','dissipatedEnergy_J','externalWork_J']:dynamic[key]=r(a[key][it],5)
static['loadFactor']=r(np.arange(41)/40,3)
payload=dict(schemaVersion=1,acceptedForFilm=True,scope=case['scope'],sourceCase=case['selectedCase'],
   physicalTime_s=40,playbackTimeStep_s=.05,solverTimeStep_s=.01,solverMaxElementLength_m=.125,
   nodeDepthBelowHead_m=r(z[ni],6),nodeXYZ_m=r(np.c_[np.zeros(len(ni)),-z[ni],np.zeros(len(ni))],6),
   headDepthBelowGrade_m=31.4,pileLength_m=52,diameter_m=1,headGravityLoad_N=8e6,pileSelfWeight_N=qa['base']['staticAppliedVertical_N']-8e6,
   soilLayers=LAYERS,binInterfaceArea_m2=r(area,6),
   signConvention=case['visualization']['sign'],coordinateSystem=case['coordinates'],
   fieldInterpretation=dict(soilForceOnPile_N='Actual fine-mesh spring+dashpot forces, grouped to the nearest displayed node. Applies to THIS independent pile only.',
    soilEquivalentCouple_Nm='Compensating couple from aggregation; combine with soilForceOnPile_N for exact global moment balance.',
    shaftBinAverageTraction_Pa='Interface vertical force / circumferential tributary area; not volumetric soil stress.',
    segmentNormalStressEnvelope_MPa='max(|N|/A+|M|D/(2I)) of all fine elements in each display segment. Nonnegative normal-stress envelope in the elastic pile.'),
   static=static,dynamic=dynamic,validation=dict(dynamicAggregation=dq,staticAggregation=sq,finite=all(np.isfinite(a[k]).all() for k in a.files)))
payload['validation']['finite']=bool(payload['validation']['finite'])
save('playback.json',payload,True)
# Compact the complete diagnostic JSON without changing numerical data.
for name in ['dynamic.json','static.json']:
 full=json.loads((OUT/name).read_text('utf8'));save(name,full,True)
provenance=dict(acceptedForFilm=True,acceptedForEngineeringDesign=False,decision='All numerical gates pass for the stated independent linear single-pile example.',
   solver=case['solver'],source=case['source'],assumptions=case['assumptions'],validation=qa,
   originalPublicPhysicsModified=False,upperTowerFiniteElementModelModified=False,
   fieldAuthority='Displacement and beam stress are executed FE results. Soil is represented by linear springs/dashpots; only interface traction is solved.',
   excludedClaims=['No actual Shanghai Tower pile-group dynamics.','No measured geotechnical stiffness or consolidated settlement prediction.','No CFD-derived load applied to this independent pile.','No Diffusion-trained pile inversion.'],
   diffusion=dict(used=False,compatible=False,
     inspected=['D:/python_project/OVOW/research/inverse_loads/neural_surrogate/README.md','D:/python_project/OVOW/research/inverse_loads/temporal_diffusion/README.zh-CN.md'],
     availableCheckpoints=['D:/python_project/OVOW/research/inverse_loads/neural_surrogate/results/offshore_rom_s17/diffusion_best.pt','D:/python_project/OVOW/research/inverse_loads/neural_surrogate/results/oc4_s43/diffusion_best.pt'],
     reason='Existing trained contracts are NREL5MW farm/OC4 offshore platform/6-turbine horizontal ROM, with fixed response channels. Unknown soil/structure explicitly unsupported. Pile axial/lateral DOFs and interface reaction fields do not match. No valid trained pile inverse model found; no inference claim made.'),
   artifacts={name:dict(path=f'research/physics-v7/pile/{name}',sha256=sha(OUT/name),bytes=(OUT/name).stat().st_size) for name in ['case.json','playback.json','dynamic.json','static.json','validation.json','fine-clock-qa.json','pile-analysis.png','solve_pile.py','verify_fine_clock.py','export_playback.py']},
   createdUTC=datetime.datetime.now(datetime.timezone.utc).isoformat())
save('acceptance-provenance.json',provenance)
print('ACCEPTED playback',len(it),'times',len(ni),'nodes',round((OUT/'playback.json').stat().st_size/1e6,2),'MB',dq)
