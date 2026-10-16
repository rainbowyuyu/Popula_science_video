"""Verify the exported render payload and its provenance without rerunning FE."""
from pathlib import Path
import hashlib,json
import numpy as np

OUT=Path(__file__).resolve().parent
d=json.loads((OUT/'playback.json').read_text('utf8'))
p=json.loads((OUT/'acceptance-provenance.json').read_text('utf8'))
n=len(d['nodeDepthBelowHead_m']);nt=len(d['dynamic']['time_s'])
assert d['acceptedForFilm'] and p['acceptedForFilm'] and not p['acceptedForEngineeringDesign']
assert n==56 and nt==801
assert np.all(np.diff(d['nodeDepthBelowHead_m'])>0)
assert np.allclose(np.diff(d['dynamic']['time_s']),.05,rtol=0,atol=1e-12)
assert np.allclose(np.array(d['nodeXYZ_m'])[:,1],-np.array(d['nodeDepthBelowHead_m']))
assert d['headDepthBelowGrade_m']==31.4 and d['pileLength_m']==52
shapes={'nodeU_m':(n,2),'nodeRotation_rad':(n,),'soilForceOnPile_N':(n,2),
        'soilEquivalentCouple_Nm':(n,),'shaftBinAverageTraction_Pa':(n,),
        'axialTensionPositive_N':(n-1,2),'shearGlobalX_N':(n-1,2),'moment_Nm':(n-1,2),
        'segmentNormalStressEnvelope_MPa':(n-1,)}
ranges={}
for phase,count in [('static',41),('dynamic',801)]:
 for key,shape in shapes.items():
  a=np.array(d[phase][key]);assert a.shape==(count,*shape),(phase,key,a.shape)
  assert np.isfinite(a).all()
  ranges[f'{phase}.{key}']={'min':float(a.min()),'max':float(a.max())}
assert np.array_equal(d['static']['nodeU_m'][-1],d['dynamic']['nodeU_m'][0])
assert np.array_equal(d['static']['nodeRotation_rad'][-1],d['dynamic']['nodeRotation_rad'][0])
t=np.array(d['dynamic']['time_s']);load=np.array(d['dynamic']['appliedHeadIncrement_N'])
assert np.max(abs(load[t>=24]))==0
force=np.array(d['static']['soilForceOnPile_N'])[-1].sum(axis=0)
force[1]+=d['static']['toeReactionOnPile_N'][-1]
balance=abs(force[1]-d['headGravityLoad_N']-d['pileSelfWeight_N'])
assert balance<.01
sha=hashlib.sha256((OUT/'playback.json').read_bytes()).hexdigest()
assert sha==p['artifacts']['playback.json']['sha256']
checks=dict(passed=True,nodeCount=n,timeCount=nt,finite=True,strictlyIncreasingDepthAndTime=True,
 staticToDynamicPositionContinuous=True,loadsRemovedAfter_s=24,
 roundedStaticVerticalBalance_N=float(balance),playbackSHA256=sha,
 recommendedFixedDisplayRanges=dict(pileNormalStressEnvelope_MPa=[0,16],
  compressionAxialForce_MN=[0,8.5],bendingMoment_kNm=[-550,550],
  lateralSoilReaction_kN=[-100,100],shaftInterfaceVerticalTraction_kPa=[0,90]),
 ranges=ranges)
(OUT/'playback-qa.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in checks.items() if k!='ranges'},ensure_ascii=False))
