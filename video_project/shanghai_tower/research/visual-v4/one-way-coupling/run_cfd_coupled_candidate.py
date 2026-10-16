"""Run a six-component CFD-to-structure candidate in an isolated directory.

This driver never calls ``scripts/physics/run_zwind.py:main`` and never writes
``public/``.  The ordinary production graph generator creates the old
synthetic Cp case, so this file instead reads a mapper candidate and reuses
only the model-building and state helpers.  A real run requires an accepted
CFD mapping QA report.  ``--synthetic-smoke`` is a quarantined chain test only.

Python 3.14 and the local Zwind OpenSees extension are required for solving.
The input wind wrench at every node is [Fx,Fy,Fz,Mx,My,Mz] in Three Y-up SI
coordinates.  A prescribed gust multiplier, if used, multiplies all six
components and is explicitly separate from CFD temporal data.
"""
from __future__ import annotations
import argparse, copy, datetime, hashlib, json, os, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[2]
SCRIPTS = PROJECT / 'scripts' / 'physics'
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))
import run_zwind as tower
from map_cfd_layers import read, write, sha, check_graph, topology_hash, map_layers, validate_mapped
from ops_load_adapter import six_dof_load, sum_external_wrenches

G = tower.G
EXPECTED_TOPOLOGY = '6cbc87924dcbde647b980879eb7488d602d047fb94b2b57b89067c05c1d30a40'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ensure_inside(path: Path) -> Path:
    path = path.resolve()
    if not path.is_relative_to(HERE):
        raise ValueError(f'candidate output must remain below {HERE}')
    if path.exists() and any(path.iterdir()):
        raise ValueError('candidate output must be empty; select a fresh isolated directory')
    return path


def require_candidate(graph: dict, qa: dict | None, synthetic: bool) -> None:
    by, _ = check_graph(graph)
    if topology_hash(graph) != EXPECTED_TOPOLOGY:
        raise ValueError('candidate graph does not match the frozen structural topology')
    provenance = graph.get('windLoadProvenance', {})
    accepted = provenance.get('acceptedForCoupling') is True
    if not accepted and not synthetic:
        raise ValueError('CFD candidate is not acceptedForCoupling=true; refusing a structural solve')
    if qa is None or qa.get('passed') is not True or qa.get('sourceAcceptedForCoupling') is not accepted:
        raise ValueError('run requires a passed mapping QA with the identical source acceptance status')
    if qa.get('topologySHA256') != topology_hash(graph):
        raise ValueError('mapping QA topology fingerprint does not match candidate graph')
    if qa.get('solverRun') is not False:
        raise ValueError('unexpected mapping QA solverRun flag')
    # A mapper QA report is deliberately not a CFD convergence report.  The
    # acceptedForCoupling bit is set only by the independent CFD gate.
    if provenance.get('coordinates') != 'THREE_Y_UP' or provenance.get('units') != {'force':'N','moment':'N m'}:
        raise ValueError('candidate wind provenance is missing the six-component SI contract')
    if any('moment' not in w for w in graph['windLoads']):
        raise ValueError('candidate graph contains force-only wind loads')
    for key in ['graph','cfd']:
        item=qa.get('inputs',{}).get(key,{})
        path=Path(item.get('path',''))
        if not path.is_file() or sha(path)!=item.get('sha256'):
            raise ValueError(f'mapping source {key} hash no longer matches the actual source file')
    source_graph=read(qa['inputs']['graph']['path']); source=read(qa['inputs']['cfd']['path'])
    if source.get('quality',{}).get('acceptedForCoupling') is not accepted:
        raise ValueError('CFD source acceptance does not match the mapped graph')
    if synthetic:
        if accepted or source.get('provenance',{}).get('kind')!='synthetic numerical fixture' or source.get('provenance',{}).get('solverRun') is not False:
            raise ValueError('--synthetic-smoke accepts only explicitly synthetic fixtures, never unaccepted real CFD')
    rebuilt,_=map_layers(source,source_graph,allow_unvalidated=synthetic)
    if rebuilt['windLoads']!=graph['windLoads'] or rebuilt['windLoadProvenance']!=provenance or rebuilt['assumptions']!=graph['assumptions']:
        raise ValueError('candidate loads/provenance/assumptions differ from a fresh source mapping')
    validate_mapped(source_graph,graph,qa)


def six_wrench(node_by_id: dict, node_id: str, value) -> np.ndarray:
    if node_id not in node_by_id:
        raise ValueError(f'load node {node_id} is absent from structural graph')
    v = np.asarray(value, dtype=float)
    if v.shape != (6,) or not np.isfinite(v).all():
        raise ValueError(f'invalid six-component load at {node_id}')
    return v


def apply_gravity_and_wind(ops, graph: dict, nodes: list[dict], *, wind: bool, gravity=True,
                           node_by_id: dict[str, dict]) -> dict[str, np.ndarray]:
    """Create one OpenSees load pattern and return applied six-vectors."""
    by = {n['id']: n for n in nodes}
    applied = {n['id']: np.r_[np.asarray(n['gravityLoad'], dtype=float) if gravity else np.zeros(3), [0., 0., 0.]] for n in nodes}
    ops.timeSeries('Linear', 1)
    ops.pattern('Plain', 1, 1)
    for n in nodes:
        ops.load(n['tag'], *applied[n['id']].tolist())
    if wind:
        for load in graph['windLoads']:
            if load['nodeId'] not in by:
                continue
            v = six_wrench(node_by_id, load['nodeId'], six_dof_load(load))
            ops.load(by[load['nodeId']]['tag'], *v.tolist())
            applied[load['nodeId']] += v
    return applied


def equilibrium(ops, graph: dict, nodes: list[dict], applied: dict[str, np.ndarray], *, dynamic=False) -> dict:
    """Report six-DOF base balance, retaining explicit nodal moments."""
    ops.reactions('-dynamic') if dynamic else ops.reactions()
    by = {n['id']: n for n in nodes}
    reaction_force = np.zeros(3); reaction_moment = np.zeros(3); records = []
    for node_id in graph['fixedNodeIds']:
        if node_id not in by:
            continue
        n = by[node_id]; v = np.asarray(ops.nodeReaction(n['tag']), dtype=float)
        if v.shape != (6,) or not np.isfinite(v).all():
            raise ValueError(f'invalid reaction at fixed node {node_id}')
        reaction_force += v[:3]
        reaction_moment += np.cross(np.asarray(n['xyz']), v[:3]) + v[3:]
        records.append({'nodeId': node_id, 'force_N': v[:3].tolist(), 'moment_Nm': v[3:].tolist()})
    external_force, external_moment = sum_external_wrenches(by, applied)
    force_residual = external_force + reaction_force
    moment_residual = external_moment + reaction_moment
    # A gravity-only case has an exact zero applied wind moment, while the
    # reaction summation still carries floating-point roundoff from billion-N
    # loads.  Scale that residual against a 1e-9 force*height budget rather
    # than rejecting a perfectly balanced zero-moment case.
    height_scale = max(1., max(float(np.linalg.norm(n['xyz'])) for n in nodes))
    moment_scale = max(1., float(np.linalg.norm(external_moment)),
                       float(np.linalg.norm(external_force))*height_scale*1e-9)
    relative_moment = float(np.linalg.norm(moment_residual) / moment_scale)
    return {
        'reactions': records,
        'externalForce_N': external_force.tolist(), 'reactionForce_N': reaction_force.tolist(),
        'forceResidual_N': force_residual.tolist(),
        'relativeForceResidual': float(np.linalg.norm(force_residual) / max(1., np.linalg.norm(external_force))),
        'externalMoment_Nm': external_moment.tolist(), 'reactionMoment_Nm': reaction_moment.tolist(),
        'momentResidual_Nm': moment_residual.tolist(),
        'relativeMomentResidual': relative_moment,
        'momentResidualScale_Nm': moment_scale,
        'dynamic': dynamic,
    }


def configure_analysis(ops, *, transient=False):
    ops.wipeAnalysis(); ops.constraints('Transformation'); ops.numberer('RCM'); ops.system('UmfPack')
    ops.test('NormUnbalance', 1e-4 if transient else 1e-5, 30)
    ops.algorithm('Linear')
    if transient:
        ops.integrator('Newmark', .5, .25); ops.analysis('Transient')
    else:
        ops.integrator('LoadControl', .1); ops.analysis('Static')


def solve_static(ops, graph: dict, *, wind: bool, gravity=True) -> tuple[dict, dict, dict, dict]:
    nodes, members = tower.build(ops, graph)
    by = {n['id']: n for n in nodes}
    applied = apply_gravity_and_wind(ops, graph, nodes, wind=wind, gravity=gravity, node_by_id=by)
    configure_analysis(ops)
    code = ops.analyze(10)
    if code:
        raise RuntimeError(f'static candidate analysis failed ({code}, wind={wind})')
    solved = tower.state(ops, nodes, members)
    eq = equilibrium(ops, graph, nodes, applied)
    if eq['relativeForceResidual'] >= 1e-6 or eq['relativeMomentResidual'] >= 1e-6:
        raise RuntimeError(f'static six-DOF balance failed: {eq}')
    return nodes, members, solved, eq


def gust_history(duration: float, dt: float) -> tuple[np.ndarray, np.ndarray]:
    if duration <= 0 or dt <= 0:
        raise ValueError('duration and dt must be positive')
    count = round(duration / dt)
    if abs(count * dt - duration) > 1e-10:
        raise ValueError('duration must be an integer multiple of dt')
    t = np.arange(count + 1, dtype=float) * dt
    ramp = np.clip(t / 10., 0., 1.); ramp = ramp*ramp*(3.-2.*ramp)
    factors = ramp * (1. + .12*np.sin(2*np.pi*.11*t) + .07*np.sin(2*np.pi*.19*t+.7) + .045*np.sin(2*np.pi*.043*t+1.1))
    return t, factors


def solve_dynamic_tmd(ops, graph: dict, duration: float, dt: float, *, with_tmd=True):
    nodes, members, gravity, gravity_eq = solve_static(ops, graph, wind=False)
    ops.loadConst('-time', 0.)
    eig = np.asarray(ops.eigen(4), dtype=float); omega = np.sqrt(eig)
    zeta = tower.ASSUMPTIONS['damping_ratio']; w1, w2 = omega[0], omega[2]
    top = next(n for n in nodes if n['role'] == 'core' and abs(n['level']-tower.PARAM['occupied_top']) < 1e-5)
    top_idx = next(i for i,n in enumerate(nodes) if n['id'] == top['id'])
    mass = tower.ASSUMPTIONS['tmd_mass_kg']; tmdtag = max(n['tag'] for n in nodes)+1
    spring = mass*w1*w1; dashpot = 2*tower.ASSUMPTIONS['tmd_damping_ratio_assumed']*mass*w1
    if with_tmd:
        ops.node(tmdtag, *top['xyz']); ops.mass(tmdtag, mass, 1e-5, 1e-5, 1e-5, 1e-5, 1e-5)
        ops.mass(top['tag'], max(1e-3, top['mass']-mass), top['mass'], top['mass'], 1e-5, 1e-5, 1e-5)
        ops.equalDOF(top['tag'], tmdtag, 2, 3, 4, 5, 6)
        ops.uniaxialMaterial('Elastic', 11, spring); ops.uniaxialMaterial('Viscous', 12, dashpot, 1.)
        ops.uniaxialMaterial('Parallel', 13, 11, 12)
        ops.element('zeroLength', max(m['tag'] for m in members)+1, top['tag'], tmdtag, '-mat', 13, '-dir', 1)
    am = 2*zeta*w1*w2/(w1+w2); bk = 2*zeta/(w1+w2); ops.rayleigh(am, 0, bk, 0)
    times, factors = gust_history(duration, dt)
    ops.timeSeries('Path', 2, '-dt', dt, '-values', *factors.tolist()); ops.pattern('Plain', 2, 2)
    by = {n['id']: n for n in nodes}
    base_wind = {}
    for load in graph['windLoads']:
        if load['nodeId'] not in by: continue
        base_wind[load['nodeId']] = six_dof_load(load)
        ops.load(by[load['nodeId']]['tag'], *base_wind[load['nodeId']].tolist())
    configure_analysis(ops, transient=True)
    all_u=[]; all_r=[]; all_ax=[]; all_ext=[]; codes=[]
    support=[]; massx=[]; relative=[]; base_resultants=[]
    previous_power=0.; energy=0.; dissipated=[]; residual_mass=[]
    for i in range(1, len(times)):
        code = ops.analyze(1, dt); codes.append(code)
        if code: raise RuntimeError(f'dynamic candidate analysis failed at {times[i]:g}s ({code})')
        st = tower.state(ops, nodes, members)
        all_u.append(st['u']-gravity['u']); all_r.append(st['r']-gravity['r']); all_ax.append(st['axialMPa']-gravity['axialMPa']); all_ext.append(st['extremeMPa'])
        sx = float(ops.nodeDisp(top['tag'],1)); mx = float(ops.nodeDisp(tmdtag,1)) if with_tmd else sx
        support.append(sx-gravity['u'][top_idx,0]); massx.append(mx); relative.append(mx-sx)
        f=factors[i]; totalF=np.zeros(3); totalM=np.zeros(3)
        for node_id,v in base_wind.items():
            totalF += f*v[:3]; totalM += f*(np.cross(by[node_id]['xyz'],v[:3])+v[3:])
        base_resultants.append(np.r_[totalF,totalM])
        if with_tmd:
            rv=float(ops.nodeVel(tmdtag,1)-ops.nodeVel(top['tag'],1)); power=dashpot*rv*rv; energy += (power+previous_power)*dt/2; previous_power=power
            residual_mass.append(float(ops.nodeAccel(tmdtag,1)*mass + ops.eleForce(max(m['tag'] for m in members)+1)[6] + am*mass*ops.nodeVel(tmdtag,1)))
        dissipated.append(energy)
    arr={
        'time_s':times[1:], 'windFactor':factors[1:], 'u_m':np.asarray(all_u), 'rotation_rad':np.asarray(all_r),
        'axialMPa':np.asarray(all_ax), 'extremeMPa':np.asarray(all_ext), 'supportX_m':np.asarray(support), 'massX_m':np.asarray(massx),
        'relativeX_m':np.asarray(relative), 'dissipatedEnergy_J':np.asarray(dissipated), 'baseWrench_N_Nm':np.asarray(base_resultants),
    }
    checks={'failedSteps':int(sum(c != 0 for c in codes)), 'steps':len(codes), 'finite':bool(all(np.isfinite(v).all() for v in arr.values())),
            'relativeIdentity_m':float(np.max(abs(arr['massX_m']-arr['supportX_m']-arr['relativeX_m']))) }
    if with_tmd:
        checks['massEquationResidual_N']=float(np.max(np.abs(np.asarray(residual_mass, dtype=float))))
    if checks['failedSteps'] or not checks['finite'] or checks['relativeIdentity_m']>1e-8:
        raise RuntimeError(f'dynamic QA failed: {checks}')
    return nodes, members, gravity, gravity_eq, arr, checks, {'omega_rad_s':omega,'firstPeriod_s':2*np.pi/w1,'tmdMass_kg':mass,'spring_N_m':spring,'dashpot_Ns_m':dashpot,'rayleigh_alphaM':am,'rayleigh_betaKinit':bk}


def main() -> None:
    ap=argparse.ArgumentParser()
    ap.add_argument('--graph', type=Path, required=True)
    ap.add_argument('--qa', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--duration', type=float, default=60.0)
    ap.add_argument('--dt', type=float, default=.05)
    ap.add_argument('--synthetic-smoke', action='store_true')
    ap.add_argument('--no-tmd', action='store_true')
    a=ap.parse_args(); out=ensure_inside(a.out)
    if out == a.graph.resolve().parent:
        raise ValueError('response output must be a separate candidate directory, not the mapper input directory')
    graph=read(a.graph); qa=read(a.qa) if a.qa else None; require_candidate(graph,qa,a.synthetic_smoke)
    out.mkdir(parents=True,exist_ok=True)
    source_hash=digest(a.graph); qa_hash=digest(a.qa) if a.qa else None
    # Keep backend logs, NPZ arrays and JSON summaries together under candidate.
    raw=out/'raw'; raw.mkdir(exist_ok=True)
    tower.PARAM=dict(graph['parameters']); tower.ASSUMPTIONS=dict(graph['assumptions'])
    ops,dll=tower.load_backend(); ops.logFile(str(raw/'opensees.log'),'-noEcho')
    started=datetime.datetime.now(datetime.timezone.utc).isoformat()
    benchmark=tower.verification(ops)
    if not benchmark['passed']: raise RuntimeError(f'backend cantilever verification failed: {benchmark}')
    nodes,members,gravity,eqg=solve_static(ops,graph,wind=False)
    _,_,combined,eqw=solve_static(ops,graph,wind=True)
    wind={k:combined[k]-gravity[k] for k in ['u','r','axialMPa','localForces']}
    nodes,members,grav2,geq,dyn,dc,tmd=solve_dynamic_tmd(ops,graph,a.duration,a.dt,with_tmd=not a.no_tmd)
    tmd_json={k:(v.tolist() if isinstance(v,np.ndarray) else v) for k,v in tmd.items()}
    np.savez_compressed(raw/'dynamic-cfd-candidate.npz',**dyn)
    np.savez_compressed(raw/'static-cfd-candidate.npz',gravity_u=gravity['u'],gravity_r=gravity['r'],gravity_axialMPa=gravity['axialMPa'],combined_u=combined['u'],combined_r=combined['r'],combined_axialMPa=combined['axialMPa'],wind_u=wind['u'],wind_r=wind['r'],wind_axialMPa=wind['axialMPa'])
    node_by_id={n['id']:n for n in graph['nodes']}
    load_meta={'nodeIds':[w['nodeId'] for w in graph['windLoads']], 'nodeXYZ_m':[node_by_id[w['nodeId']]['xyz'] for w in graph['windLoads']], 'baseForce_N':[w['force'] for w in graph['windLoads']], 'baseMoment_Nm':[w['moment'] for w in graph['windLoads']]}
    result={'schema':'rainbow.cfd-structure-candidate-response/1','status':'synthetic-smoke' if a.synthetic_smoke else 'accepted-cfd-candidate','solverRun':True,'productionAccepted':not a.synthetic_smoke,'units':{'length':'m','force':'N','moment':'N m','stress':'MPa','time':'s'},'coordinates':'Three Y-up','graphSHA256':topology_hash(graph),'inputGraphSHA256':source_hash,'mappingQASHA256':qa_hash,'windLoadProvenance':graph.get('windLoadProvenance'),'loads':load_meta,'static':{'gravityEquilibrium':eqg,'gravity':{'npz':'raw/static-cfd-candidate.npz'},'windPlusGravityEquilibrium':eqw,'npz':'raw/static-cfd-candidate.npz'},'dynamic':{'npz':'raw/dynamic-cfd-candidate.npz','checks':dc,'tmd':tmd_json,'timeCount':len(dyn['time_s']),'dt_s':a.dt},'backend':{'binary':str(tower.ZWIND/'bin/opensees.pyd'),'binarySHA256':digest(tower.ZWIND/'bin/opensees.pyd'),'scriptSHA256':digest(Path(__file__)),'python':sys.version},'scope':['One-way CFD steady-mean layer wrenches mapped conservatively to existing 132 nodes.','All six load components are applied; explicit node moments are retained in OpenSees.','Any prescribed gust factor is an assumption multiplying the CFD mean, not transient CFD.','Equivalent teaching structure; not an as-built safety calculation.']}
    write(out/'candidate-response.json',result); write(out/'candidate-summary.json',{'status':result['status'],'productionAccepted':result['productionAccepted'],'solverRun':True,'staticForceResidual_N':eqw['forceResidual_N'],'staticMomentResidual_Nm':eqw['momentResidual_Nm'],'dynamicChecks':dc,'inputGraphSHA256':source_hash,'candidateResponseSHA256':digest(out/'candidate-response.json')})
    ops.wipe(); dll.close(); print(json.dumps({'out':str(out),'status':result['status'],'productionAccepted':result['productionAccepted'],'steps':dc['steps'],'staticForceResidual_N':eqw['forceResidual_N'],'staticMomentResidual_Nm':eqw['momentResidual_Nm']},ensure_ascii=False))


if __name__=='__main__': main()
