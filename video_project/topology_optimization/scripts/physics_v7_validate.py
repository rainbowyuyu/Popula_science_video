"""Final provenance and numerical result checks, independent of the renderer."""
from pathlib import Path
import hashlib
import json
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'research/episode3v7/physics'
CONTRACT=ROOT/'research/episode3v7/frame-contract.json'

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))

expected=sha(CONTRACT)
checks={}
for name in ('capability','boundary-conditions','static-cases','dynamic-response','inverse-diffusion','qa','part-analysis-coverage','result-summary'):
    d=read(OUT/(name+'.json'));prov=d.get('provenance',d)
    checks[name+'_input_hash']=prov.get('input_sha256')==expected
    checks[name+'_not_provisional']=prov.get('provisional') is False
    checks[name+'_script_hash']=prov.get('script_sha256')==sha(ROOT/'scripts/physics_v7_native.py')
qa=read(OUT/'qa.json');checks['native_qa']=qa['passed'] and qa['input_unchanged_during_run']
coverage=read(OUT/'part-analysis-coverage.json')
checks['all_native_parts_mapped']=coverage['all_native_parts_mapped']
inv=read(OUT/'inverse-diffusion.json')
checks['inverse_full_rank']=inv['rank']==inv['unknowns']==4
checks['inverse_recovery']=inv['recovery_passed']
checks['inverse_native_members_match']=set(inv['true_native_result']['response']['members'])==set(inv['recovered_native_result']['response']['members'])
checks['inverse_recovered_equilibrium']=inv['recovered_native_result']['equilibrium']['relativeForceResidual']<1e-6
pegs=read(OUT/'peg-connection-demands.json')
checks['peg_input_hash']=pegs['provenance']['input_sha256']==expected
checks['peg_script_hash']=pegs['provenance']['script_sha256']==sha(ROOT/'scripts/physics_v7_pin_demands.py')
checks['peg_native_force_transform']=pegs['passed'] and pegs['native_local_to_global_max_absolute_difference']<1e-7
checks['peg_result_trace']=pegs['provenance']['static_source_sha256']==sha(OUT/'static-cases.json')
checks['peg_inverse_trace']=pegs['provenance']['inverse_source_sha256']==sha(OUT/'inverse-diffusion.json')
checks['peg_coverage_trace']=coverage['connection_demand_extension']['sha256']==sha(OUT/'peg-connection-demands.json')
for sub in ('','central'):
    path=OUT/sub;prefix=sub or 'front'
    flow=read(path/'flow.json');lbm=read(path/'lbm-qa.json');raw=np.load(path/'lbm-raw.npz')
    checks[prefix+'_flow_input_hash']=flow['input_sha256']==expected==lbm['input_sha256']
    checks[prefix+'_flow_not_provisional']=flow.get('provisional') is False
    checks[prefix+'_flow_script_hash']=flow['script_sha256']==sha(ROOT/'scripts/physics_v7_lbm.py')
    checks[prefix+'_flow_qa']=lbm['passed'] and flow['passed'] and lbm['input_unchanged_during_run']
    points=np.concatenate([np.asarray(q,float) for q in flow['streamlines']],axis=0)
    x,z=raw['x_m'],raw['z_m'];dx=x[1]-x[0]
    ix=np.rint((points[:,0]-x[0])/dx).astype(int);iz=np.rint((points[:,1]-z[0])/dx).astype(int)
    inside=(ix>=0)&(ix<len(x))&(iz>=0)&(iz<len(z))
    checks[prefix+'_streamlines_finite']=bool(np.isfinite(points).all())
    checks[prefix+'_streamlines_in_domain']=bool(inside.all())
    checks[prefix+'_streamlines_avoid_solid']=bool(inside.all() and not raw['solid'][iz,ix].any())
report=dict(input_sha256=expected,checks=checks,passed=all(checks.values()))
(OUT/'final-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
raise SystemExit(0 if report['passed'] else 1)
