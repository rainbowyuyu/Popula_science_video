"""Time-step convergence at the exact 0.125m mesh selected for playback."""
import numpy as np
from solve_pile import OUT,backend,solve,save
import json

ops,dll=backend.load_backend()
fine=solve(ops,.005,.125)
with np.load(OUT/'dt0.01_mesh0.125.npz') as coarse:
 a=coarse['nodeDisp'][:,0,0];b=fine['u'][::2,0]
 c_m=float(np.max(abs(coarse['moment_Nm'])));f_m=float(np.max(abs(fine['fields']['moment_Nm'])))
 c_v=float(np.max(abs(coarse['shearGlobalX_N'])));f_v=float(np.max(abs(fine['fields']['shearGlobalX_N'])))
 check=dict(mesh_m=.125,dtCoarse_s=.01,dtFine_s=.005,
   headLateralRelativeL2=float(np.linalg.norm(a-b)/np.linalg.norm(b)),
   headLateralPeakDifferenceRatio=float(abs(a-b).max()/abs(b).max()),
   peakMomentRelativeDifference=abs(c_m/f_m-1),peakShearRelativeDifference=abs(c_v/f_v-1))
check['passed']=all(check[x]<.01 for x in ['headLateralRelativeL2','headLateralPeakDifferenceRatio','peakMomentRelativeDifference','peakShearRelativeDifference'])
assert check['passed'],check
save('fine-clock-qa.json',check)
for name in ['case.json','validation.json']:
 d=json.loads((OUT/name).read_text('utf8'));target=d['validation'] if name=='case.json' else d
 target['selectedMeshTimeStep']=check
 save(name,d)
print('FINE_CLOCK_VALIDATED',json.dumps(check),flush=True)
