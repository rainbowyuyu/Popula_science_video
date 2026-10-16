"""Trace native beam-end resultants to explicit nominal wooden-peg demands.

No contact FE is claimed. Moment transfer and actual load sharing between
shoulders, mortise faces and peg require a calibrated contact/joint model.
"""
from pathlib import Path
import hashlib
import json
import math
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'research/episode3v7/physics'
CONTRACT=ROOT/'research/episode3v7/frame-contract.json'
MANIFEST=ROOT/'research/episode3v7/pavilion-manifest.json'

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def save(p,d): p.write_text(json.dumps(d,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
def vec(v):return [float(x) for x in v]

m=read(CONTRACT);manifest=read(MANIFEST)
nodes={int(n['id']):np.asarray(n['xyz'],float) for n in m['nodes']}
elements={int(e['id']):e for e in m['members']}
parts={p['id']:p for p in manifest['parts']}
joints=[j for j in manifest['joints'] if j.get('peg')]
sources={}
for j in joints:
    candidates=[]
    for e in m['members']:
        if e['part_id']!=j['male']:continue
        for end,n in enumerate(e['nodes']):
            candidates.append((np.linalg.norm(nodes[n]-j['focus_blender']),e,end))
    distance,e,end=min(candidates,key=lambda q:q[0])
    if distance>1e-6:raise ValueError(f"joint not at actual beam end: {j['id']}, {distance}")
    local_x=nodes[e['nodes'][1]]-nodes[e['nodes'][0]];local_x/=np.linalg.norm(local_x)
    ref=np.asarray(e.get('roll_vec',[0,0,1]),float)
    if np.linalg.norm(np.cross(ref,local_x))<1e-8:ref=np.array([0.,1.,0.])
    local_y=np.cross(ref,local_x);local_y/=np.linalg.norm(local_y)
    local_z=np.cross(local_x,local_y)
    R=np.column_stack((local_x,local_y,local_z))
    axis=np.asarray(j['peg_axis_blender'],float);axis/=np.linalg.norm(axis)
    width=np.asarray(parts[j['female']]['bbox_blender'][1])-np.asarray(parts[j['female']]['bbox_blender'][0])
    post_width=float(width[np.argmax(abs(axis))])
    tenon_thick=float(j['tenon_section_m'][0]);mortise_thick=float(j['mortise_section_m'][0])
    sources[j['peg']]=dict(joint=j,element=e,end=end,R=R,axis=axis,
      diameter=2*float(j['peg_radius_m']),tenon_thick=tenon_thick,
      cheek_thick=(post_width-mortise_thick)/2,post_width=post_width)

raw_check_max=0.
def snapshot_demands(snapshot):
    global raw_check_max
    results={}
    for peg,s in sources.items():
        j=s['joint'];e=s['element'];eid=int(e['id']);end=s['end']
        sr=next(r for r in snapshot['members'][e['part_id']]['elementResults'] if r['elementID']==eid)
        f=np.asarray(sr['localEndForces'][end*6:end*6+6],float)
        F=s['R']@f[:3];M=s['R']@f[3:]
        raw=snapshot.get('rawElementResponse',{}).get(str(eid))
        if raw is not None:
            direct=np.asarray(raw['globalEndForces'][end*6:end*6+6])
            raw_check_max=max(raw_check_max,float(np.linalg.norm(np.r_[F,M]-direct)))
        peg_axis=s['axis'];V=float(np.linalg.norm(F-peg_axis*np.dot(F,peg_axis)))
        withdrawal=float(abs(np.dot(F,np.asarray(j['axis_blender'],float))))
        d=s['diameter'];A=math.pi*d*d/4;t=s['tenon_thick'];cheek=s['cheek_thick']
        def nominal(force):
            return dict(force_N=force,double_shear_average_Pa=force/(2*A),
              tenon_bearing_average_Pa=force/(d*t),
              each_post_cheek_bearing_average_Pa=(force/2)/(d*cheek))
        results[peg]=dict(joint_id=j['id'],beam_part_id=e['part_id'],native_element_id=eid,
          native_element_end=end,node_id=e['nodes'][end],
          global_connection_force_N=vec(F),global_connection_moment_Nm=vec(M),
          peg_parallel_force_N=float(np.dot(F,peg_axis)),
          withdrawal_component_scenario=nominal(withdrawal),
          all_perpendicular_force_scenario=nominal(V))
    return dict(t=snapshot.get('t'),parts=results)

static=read(OUT/'static-cases.json');inverse=read(OUT/'inverse-diffusion.json');dynamic=read(OUT/'dynamic-response.json')
expected=sha(CONTRACT)
for d in (static,inverse,dynamic):
    if d['provenance']['input_sha256']!=expected:raise ValueError('native results do not match final geometry')

result=dict(
  provenance=dict(input_sha256=expected,manifest_sha256=sha(MANIFEST),script_sha256=sha(Path(__file__)),
    static_source_sha256=sha(OUT/'static-cases.json'),inverse_source_sha256=sha(OUT/'inverse-diffusion.json'),
    dynamic_source_sha256=sha(OUT/'dynamic-response.json'),provisional=False),
  method='Analytical nominal wooden-peg shear and timber bearing demand from actual native beam-end resultants.',
  coordinates='Blender Z-up',units=dict(force='N',moment='N m',stress='Pa',length='m'),
  formulas=dict(peg_double_shear='tau_avg=V/(2*pi*d^2/4)',
    tenon_bearing='sigma_bearing=V/(d*t_tenon)',post_cheek_bearing='sigma_bearing=(V/2)/(d*t_cheek)'),
  assumptions=[
    'Two nominal shear planes, symmetric post-cheek force sharing.',
    'Withdrawal-component scenario assigns the absolute beam-axis resultant to the pin.',
    'All-perpendicular-force scenario assigns the complete connection force normal to pin axis to the pin.',
    'Actual shoulders/mortise/peg load sharing is not solved; neither scenario is claimed to be a rigorous upper bound.',
    'Native connection moments are retained separately and are NOT transformed into an invented pin force.',
    'Average shear/bearing demand only, not local contact FE, splitting/yield failure, strength capacity or a safety verdict.'],
  geometry={peg:dict(joint_id=s['joint']['id'],peg_axis_blender=vec(s['axis']),diameter_m=s['diameter'],
    tenon_thickness_m=s['tenon_thick'],post_cheek_thickness_m=s['cheek_thick'],post_width_m=s['post_width'],
    mapped_native_element=int(s['element']['id']),mapped_native_end=s['end']) for peg,s in sources.items()},
  static={key:snapshot_demands(case['response']) for key,case in static['cases'].items()},
  inverse_known=snapshot_demands(inverse['true_native_result']['response']),
  inverse_recovered=snapshot_demands(inverse['recovered_native_result']['response']),
  transient=[snapshot_demands(s) for s in dynamic['snapshots']])
result['native_local_to_global_max_absolute_difference']=raw_check_max
result['passed']=raw_check_max<1e-7 and len(sources)==8
save(OUT/'peg-connection-demands.json',result)
coverage=read(OUT/'part-analysis-coverage.json')
for peg in sources:
    coverage['parts'][peg]=dict(category='connection_hardware_analytic_nominal_demand',mesh_names=[peg],
      result_file='peg-connection-demands.json',field='nominal average double-shear / timber-bearing demand Pa',
      native_element_id=int(sources[peg]['element']['id']),
      exclusions='Not a local contact FE stress field; force-sharing and moment-transfer limitations are explicit in result file.')
for part,entry in coverage['parts'].items():
    if entry['category']=='nonprimary_component_not_solved':
        entry['reason']=(
          'Platform is represented by fixed column support conditions; no separate soil/stone plate model or stress.' if part=='PLINTH' else
          'Apex ornamental finial is outside the primary timber frame; mass included only in the uniform roof allowance, no local finial stress.' if part=='FINIAL' else
          'Railing/baluster self-supporting enclosure is outside the roof-to-column wind/gravity system; railing-specific human horizontal loads and connection checks are not included.')
coverage['counts']={}
for entry in coverage['parts'].values():
    c=entry['category'];coverage['counts'][c]=coverage['counts'].get(c,0)+1
coverage['connection_demand_extension']=dict(file='peg-connection-demands.json',sha256=sha(OUT/'peg-connection-demands.json'))
save(OUT/'part-analysis-coverage.json',coverage)
summary=read(OUT/'result-summary.json');summary['coverage']=coverage['counts']
summary['peg_nominal_demands']=dict(parts=8,passed=result['passed'],
  max_gravity_wind_double_shear_MPa=max(r['all_perpendicular_force_scenario']['double_shear_average_Pa']/1e6 for r in result['static']['gravity_wind']['parts'].values()),
  limitation='Force assignment scenario, not local contact FE or a capacity check.')
save(OUT/'result-summary.json',summary)
print(json.dumps(dict(passed=result['passed'],raw_global_force_check=raw_check_max,summary=summary['peg_nominal_demands']),indent=2))
