"""Actual Zwind/ZDyn native frame solve on the supplied pavilion contract.

Run with the installed Zwind CPython 3.12 environment, not system Python.
This is structural finite-element analysis with explicit engineering wind
pressure inputs. AeroDyn's rotor aerodynamics are NOT a building CFD solver.
All values are SI; input/model provenance is embedded in every result.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import time
import numpy as np
from scipy.linalg import expm
import zdynpywin.zdyn as z

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research/episode3v7/physics'
DEFAULT_INPUT = ROOT / 'research/episode3v7/frame-contract.json'
ZWIND = Path('D:/Zwind_example/Zwind_example/1/Zwind_example')


def save(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2,
                                   allow_nan=False), encoding='utf-8')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def floats(v):
    return [float(x) for x in v]


def section(m):
    s = m['section']
    if 'diameter' in s:
        d = float(s['diameter'])
        return dict(A=math.pi*d*d/4, Iy=math.pi*d**4/64,
                    Iz=math.pi*d**4/64, J=math.pi*d**4/32,
                    cy=d/2, cz=d/2, width=d)
    b, h = float(s['b']), float(s['h'])
    lo, hi = min(b, h), max(b, h)
    # Saint-Venant torsion constant for a solid rectangle.
    J = hi*lo**3*(1/3-.21*(lo/hi)*(1-lo**4/(12*hi**4)))
    return dict(A=b*h, Iy=b*h**3/12, Iz=h*b**3/12, J=J,
                cy=b/2, cz=h/2, width=max(b, h))


def polygon_geometry(p):
    v = np.asarray(p['vertices'], dtype=float)
    triangles = [(v[0], v[k], v[k+1]) for k in range(1, len(v)-1)]
    av = [np.cross(b-a, c-a)/2 for a, b, c in triangles]
    area = float(sum(np.linalg.norm(q) for q in av))
    normal = np.sum(av, axis=0)
    normal /= np.linalg.norm(normal)
    if normal[2] < 0:
        normal = -normal
    centroid = sum((a+b+c)/3*np.linalg.norm(q)
                   for (a, b, c), q in zip(triangles, av))/area
    return area, normal, centroid


def read_model(path):
    model = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    if model.get('units') != 'm':
        raise ValueError('frame contract must use metres and Blender Z-up')
    model['nodes'] = sorted(model['nodes'], key=lambda q: int(q['id']))
    model['members'] = sorted(model['members'], key=lambda q: int(q['id']))
    model.setdefault('roof_panels', model.get('roofPanels', []))
    model.setdefault('rigid_links', [])
    manifest=Path(path).parent/model.get('geometry_manifest','pavilion-manifest.json')
    if manifest.exists():
        visible=json.loads(manifest.read_text(encoding='utf-8-sig'))
        model.setdefault('part_mesh_map',{})
        for part in visible.get('parts',[]):
            model['part_mesh_map'].setdefault(part['id'],[part.get('mesh_name',part['id'])])
    node_ids = [int(n['id']) for n in model['nodes']]
    assert len(set(node_ids)) == len(node_ids), 'duplicate node ID'
    member_ids = [int(m['id']) for m in model['members']]
    assert len(set(member_ids)) == len(member_ids), 'duplicate member ID'
    xyz = {int(n['id']): np.asarray(n['xyz'], dtype=float) for n in model['nodes']}
    for m in model['members']:
        assert all(int(i) in xyz for i in m['nodes'])
        assert np.linalg.norm(xyz[int(m['nodes'][1])]-xyz[int(m['nodes'][0])]) > 1e-6
        m.setdefault('material', {})
        m['material'].setdefault('E', 10e9)
        m['material'].setdefault('G', .65e9)
        m['material'].setdefault('rho', 500.)
        m.setdefault('role', 'member')
        section(m)
    return model


def empty_loads(model):
    return {int(n['id']): np.zeros(6) for n in model['nodes']}


def distribute_panel(model, loads, panel, force):
    """Conserve resultant AND moment at the polygon's area centroid.

    Rigid roof substrate assumed. Equal force weights give the centroid when
    supports form the panel polygon. Otherwise explicit nodal moments carry
    the centroid offset; these moments are saved, not silently discarded.
    """
    ids = [int(i) for i in panel['support_nodes']]
    if not ids:
        raise ValueError('roof panel requires at least one support node')
    xyz = {int(n['id']): np.asarray(n['xyz'], float) for n in model['nodes']}
    _, _, center = polygon_geometry(panel)
    avg = np.mean([xyz[i] for i in ids], axis=0)
    moment = np.cross(center-avg, force)
    for i in ids:
        loads[i][:3] += force/len(ids)
        loads[i][3:] += moment/len(ids)


def make_loads(model, speed=12., direction_deg=0.):
    rho_air, gravity, cd = 1.225, 9.80665, 1.2
    q = .5*rho_air*speed**2
    a = math.radians(direction_deg)
    wind = np.array([math.cos(a), math.sin(a), 0.])
    xyz = {int(n['id']): np.asarray(n['xyz'], float) for n in model['nodes']}
    dead, wl = empty_loads(model), empty_loads(model)
    masses = {i: 0. for i in xyz}
    panel_metadata, basis = [], []
    for m in model['members']:
        i, j = map(int, m['nodes'])
        tangent = xyz[j]-xyz[i]
        L = np.linalg.norm(tangent)
        props = section(m)
        mass = float(m['material']['rho'])*props['A']*L
        for n in (i, j):
            dead[n][2] -= mass*gravity/2
            masses[n] += mass/2
        projected = L*props['width']*np.linalg.norm(np.cross(tangent/L, wind))
        # Explicit isolated-member drag idealization; no shield factor hidden.
        force = q*cd*projected*wind
        for n in (i, j):
            wl[n][:3] += force/2
    roof_mass = float(model.get('roof_mass_kg_m2', 35.))
    for p in model['roof_panels']:
        area, normal, centroid = polygon_geometry(p)
        dot = float(np.dot(normal, wind))
        # These are imposed educational pressure coefficients, NOT CFD output
        # and NOT a jurisdiction-specific design code load combination.
        cp = .6 if dot < -.08 else (-.4 if dot > .08 else -.5)
        force = -cp*q*area*normal
        distribute_panel(model, wl, p, force)
        unit = empty_loads(model)
        distribute_panel(model, unit, p, -q*area*normal)
        basis.append(unit)
        distribute_panel(model, dead, p, np.array([0., 0., -roof_mass*area*gravity]))
        for n in p['support_nodes']:
            masses[int(n)] += roof_mass*area/len(p['support_nodes'])
        panel_metadata.append(dict(id=p['id'], area_m2=area, normal=floats(normal),
                                   centroid_m=floats(centroid), Cp=cp,
                                   pressure_Pa=cp*q, force_N=floats(force),
                                   support_nodes=p['support_nodes']))
    meta = dict(wind_speed_m_s=speed, wind_direction_deg=direction_deg,
                rho_air_kg_m3=rho_air, dynamic_pressure_Pa=q,
                roof_mass_kg_m2=roof_mass, member_drag_coefficient=cd,
                pressure_model='Imposed roof Cp + isolated beam drag. No building CFD or code certification.',
                panels=panel_metadata)
    return dead, wl, masses, basis, meta


def build(model, masses, E_scale=1., rotation_k=None):
    z.wipe()
    z.model('BasicBuilder', '-ndm', 3, '-ndf', 6)
    xyz = {int(n['id']): np.asarray(n['xyz'], float) for n in model['nodes']}
    for n in model['nodes']:
        nid = int(n['id'])
        z.node(nid, *floats(n['xyz']))
        fix = n.get('fix', [0]*6)
        if any(fix):
            z.fix(nid, *map(int, fix))
        # Tiny rotational inertia removes a massless rotational block; the
        # actual translational mass is half-member + roof tributary mass.
        mass = max(masses[nid], 1e-5)
        z.mass(nid, mass, mass, mass, mass*1e-5, mass*1e-5, mass*1e-5)
    for link in model['rigid_links']:
        z.rigidLink('beam', int(link['master']), int(link['slave']))
    next_node = max(xyz)+1
    spring_ids = []
    aux = {}
    part_node_degree={}
    for m in model['members']:
        degrees=part_node_degree.setdefault(m['part_id'],{})
        for n in m['nodes']: degrees[int(n)]=degrees.get(int(n),0)+1
    for idx, m in enumerate(model['members']):
        props = section(m)
        E, G = float(m['material']['E'])*E_scale, float(m['material']['G'])*E_scale
        i, j = map(int, m['nodes'])
        ni, nj = i, j
        # Sensitivity only: isotropic rotational spring is a declared
        # approximation, not a measured mortise-tenon constitutive law.
        if rotation_k is not None and m['role'] in ('beam', 'tie', 'tie_beam', 'longitudinal_tie'):
            for end, original in enumerate((i, j)):
                # Only actual physical part endpoints are joints. Nodes used
                # solely to subdivide a continuous beam MUST NOT acquire an
                # artificial hinge just because the FE mesh is refined.
                if part_node_degree[m['part_id']][original]!=1: continue
                dup = next_node; next_node += 1
                z.node(dup, *floats(xyz[original]))
                tags = []
                for d in range(6):
                    mat = 100000+idx*20+end*6+d
                    z.uniaxialMaterial('Elastic', mat, 1e10 if d < 3 else float(rotation_k))
                    tags.append(mat)
                eid = 200000+idx*2+end
                z.element('zeroLength', eid, original, dup, '-mat', *tags, '-dir', 1,2,3,4,5,6)
                spring_ids.append(eid)
                aux[dup] = original
                if end == 0: ni = dup
                else: nj = dup
        tangent = xyz[j]-xyz[i]
        tangent /= np.linalg.norm(tangent)
        vec = np.asarray(m.get('roll_vec', [0.,0.,1.]), float)
        if np.linalg.norm(np.cross(tangent, vec)) < 1e-8:
            vec = np.array([0.,1.,0.])
        transf = idx+1
        z.geomTransf('Linear', transf, *floats(vec))
        z.element('elasticBeamColumn', int(m['id']), ni, nj,
                  props['A'], E, G, props['J'], props['Iy'], props['Iz'], transf)
    return spring_ids, aux


def pattern(loads, tag=1, series='Constant', values=None, dt=.01):
    if series == 'Path':
        z.timeSeries('Path', tag, '-dt', dt, '-values', *floats(values))
    else:
        z.timeSeries(series, tag)
    z.pattern('Plain', tag, tag)
    for n, force in loads.items():
        if np.linalg.norm(force) > 0:
            z.load(int(n), *floats(force))


def configure(kind='Static'):
    z.constraints('Transformation')
    z.numberer('RCM')
    z.system('BandGeneral')
    z.test('NormDispIncr', 1e-10, 30, 0)
    z.algorithm('Linear')
    if kind == 'Static':
        z.integrator('LoadControl', 1.)
    else:
        z.integrator('Newmark', .5, .25)
    z.analysis(kind)


def section_response(m, force, samples=True):
    f = np.asarray(force, float)
    p = section(m)
    values = []
    # No interior element loads: all distributed weights/wind have been
    # explicitly lumped at nodes, so these element section forces interpolate
    # exactly for the discretized problem (not a continuum contact solution).
    for s in np.linspace(0, 1, 11 if samples else 2):
        internal = -(1-s)*f[:6]+s*f[6:]
        N, Vy, Vz, T, My, Mz = internal
        bending = abs(My)*p['cz']/p['Iy']+abs(Mz)*p['cy']/p['Iz']
        values.append(dict(s=float(s), normalMinPa=float(N/p['A']-bending),
                           normalMaxPa=float(N/p['A']+bending),
                           shearMaxPa=float(1.5*math.hypot(Vy,Vz)/p['A'])))
    return dict(localEndForces=floats(f),
                sigmaMaxAbsPa=max(max(abs(v['normalMinPa']),abs(v['normalMaxPa'])) for v in values),
                sectionSamples=values)


def snapshot(model, samples=True, dynamic=False):
    if dynamic:
        z.reactions('-dynamic', '-rayleigh')
    else:
        z.reactions()
    disp, reaction, members, raw = {}, {}, {}, {}
    for n in model['nodes']:
        nid = int(n['id'])
        disp[str(nid)] = floats(z.nodeDisp(nid))
        if any(n.get('fix', [0]*6)):
            reaction[str(nid)] = floats(z.nodeReaction(nid))
    for m in model['members']:
        eid = int(m['id'])
        local = z.eleResponse(eid, 'localForce')
        sr = section_response(m, local, samples)
        sr['elementID'] = eid
        sr['nodes'] = m['nodes']
        part = members.setdefault(m['part_id'], dict(elementResults=[], sigmaMaxAbsPa=0.))
        part['elementResults'].append(sr)
        part['sigmaMaxAbsPa'] = max(part['sigmaMaxAbsPa'], sr['sigmaMaxAbsPa'])
        if samples:
            raw[str(eid)] = dict(globalEndForces=floats(z.eleForce(eid)),
                                  basicForces=floats(z.eleResponse(eid, 'basicForce')))
    out = dict(t=float(z.getTime()), nodalDisplacements=disp,
               members=members, supportReactions=reaction)
    if samples: out['rawElementResponse'] = raw
    return out


def balance(model, loads, snap):
    appliedF, appliedM = np.zeros(3), np.zeros(3)
    reactF, reactM = np.zeros(3), np.zeros(3)
    for n in model['nodes']:
        nid = int(n['id']); xyz = np.asarray(n['xyz'], float)
        f = loads[nid]
        appliedF += f[:3]
        appliedM += f[3:]+np.cross(xyz, f[:3])
        if str(nid) in snap['supportReactions']:
            r = np.asarray(snap['supportReactions'][str(nid)])
            reactF += r[:3]
            reactM += r[3:]+np.cross(xyz, r[:3])
    return dict(appliedForce_N=floats(appliedF), appliedMoment_Nm=floats(appliedM),
                supportForce_N=floats(reactF), supportMoment_Nm=floats(reactM),
                forceResidual_N=floats(appliedF+reactF),
                momentResidual_Nm=floats(appliedM+reactM),
                relativeForceResidual=float(np.linalg.norm(appliedF+reactF)/max(1.,np.linalg.norm(appliedF))),
                relativeMomentResidual=float(np.linalg.norm(appliedM+reactM)/max(1.,np.linalg.norm(appliedM))))


def solve(model, masses, loads, E_scale=1., rotation_k=None, samples=True):
    build(model, masses, E_scale, rotation_k)
    pattern(loads)
    configure()
    status = z.analyze(1)
    if status != 0:
        raise RuntimeError(f'Native static solve failed: {status}')
    snap = snapshot(model, samples)
    return dict(status=status, response=snap, equilibrium=balance(model, loads, snap))


def sum_loads(*load_sets):
    return {k: sum(ls[k] for ls in load_sets) for k in load_sets[0]}


def native_dynamic(model, masses, dead, wind, duration=12., dt=.01):
    build(model, masses)
    pattern(dead, 1)
    configure()
    if z.analyze(1) != 0:
        raise RuntimeError('Gravity initialization failed')
    z.loadConst('-time', 0.)
    z.wipeAnalysis()
    times = np.arange(0, duration+dt/2, dt)
    # Smooth onset + two resolved gust packets; wind pressure scales with U².
    speed_ratio = (1-np.exp(-(times/1.1)**3))*(.62+.38*np.exp(-((times-4.2)/1.3)**2)
                                           +.24*np.exp(-((times-8.0)/.85)**2))
    load_factor = speed_ratio**2
    pattern(wind, 2, 'Path', load_factor, dt)
    # Declared 3% damping near 2 and 10 Hz, no claim to measured timber damping.
    w1, w2, damping = 2*math.pi*2, 2*math.pi*10, .03
    alpha = 2*damping*w1*w2/(w1+w2)
    beta = 2*damping/(w1+w2)
    z.rayleigh(alpha, 0., beta, 0.)
    configure('Transient')
    snaps = [snapshot(model, False, True)]
    snaps[0]['pressureScale'] = float(load_factor[0])
    statuses = []
    for step in range(1,len(times)):
        status = z.analyze(1, dt)
        statuses.append(status)
        if status != 0: raise RuntimeError(f'dynamic step {step} failed {status}')
        if step % 10 == 0:
            ss = snapshot(model, False, True)
            ss['pressureScale'] = float(load_factor[step])
            snaps.append(ss)
    return dict(coordinates='Blender Z-up',
                units=dict(length='m',force='N',stress='Pa',time='s'),
                nodes=model['nodes'], members=model['members'],
                snapshots=snaps,
                solver=dict(version=z.version(),kind='ZDyn native elasticBeamColumn + Newmark transient',
                            dt_s=dt,duration_s=duration,steps=len(statuses),all_status_zero=all(s==0 for s in statuses)),
                load_time_history=dict(t_s=floats(times),pressure_scale=floats(load_factor)),
                damping=dict(kind='Rayleigh',alpha_mass=alpha,beta_initial_stiffness=beta,
                             assumed_ratio=damping,reference_frequencies_Hz=[2,10]),
                interpretation='Transient response of this idealized frame with imposed gust pressure. Fixed bases, rigid joints; no nonlinear joint contact/fracture.')


def inverse_diffusion(model, masses, panel_basis, meta):
    """Graph heat diffusion prior + linear native FE response inverse.

    A synthetic known pressure is passed through the NATIVE forward operator.
    We recover a low-dimensional roof Cp vector from noisy displacements.
    This does not assert unique inverse identification of every member force.
    """
    n = len(panel_basis)
    if n < 2:
        return dict(status='not applicable; at least two pressure panels required')
    fixed = {int(q['id']) for q in model['nodes'] if any(q.get('fix',[0]*6))}
    candidates = [(int(q['id']),d) for q in model['nodes'] if int(q['id']) not in fixed for d in range(3)]
    columns = []
    for loads in panel_basis:
        s = solve(model,masses,loads,samples=False)['response']
        columns.append([s['nodalDisplacements'][str(nid)][d] for nid,d in candidates])
    H = np.asarray(columns,float).T
    sensitivity = np.linalg.norm(H,axis=1)
    selected = np.where(sensitivity>max(sensitivity)*1e-5)[0]
    train = selected[np.arange(len(selected))%3 != 2]
    held = selected[np.arange(len(selected))%3 == 2]
    if not len(held): held=train[-1:]; train=train[:-1]
    # Adjacent pressure panels: use shared geometric vertices, otherwise their
    # centroid nearest neighbours. Diffusion time is dimensionless on this graph.
    coords = np.asarray([polygon_geometry(p)[2] for p in model['roof_panels']])
    W = np.zeros((n,n))
    for i in range(n):
        distance = np.linalg.norm(coords-coords[i],axis=1)
        neighbors = np.argsort(distance)[1:min(n,3)]
        for j in neighbors: W[i,j]=W[j,i]=1/max(distance[j],1e-3)
    L = np.diag(W.sum(axis=1))-W
    L /= max(np.linalg.eigvalsh(L).max(),1e-12)
    tau = .18
    diffusion = expm(-tau*L)
    base = np.asarray([p['Cp'] for p in meta['panels']])
    truth = diffusion@base
    noiseless = H@truth
    rng = np.random.default_rng(20261005)
    noise_std = max(float(np.sqrt(np.mean(noiseless[train]**2)))*.002,1e-10)
    observed = noiseless+rng.normal(0,noise_std,len(noiseless))
    scale = max(np.linalg.norm(H[train],2),1e-20)
    A, b = H[train]/scale, observed[train]/scale
    # Tikhonov regularization: ||H p - y||² + lambda ||L p||².
    lam = 1e-5
    recovered = np.linalg.lstsq(np.vstack([A, math.sqrt(lam)*L]),
                               np.r_[b, np.zeros(n)],rcond=None)[0]
    pred = H@recovered
    sv = np.linalg.svd(H[train],compute_uv=False)
    rank = int(np.linalg.matrix_rank(H[train]))
    residual = float(np.linalg.norm(pred[train]-observed[train])/max(np.linalg.norm(observed[train]),1e-20))
    held_error = float(np.linalg.norm(pred[held]-noiseless[held])/max(np.linalg.norm(noiseless[held]),1e-20))
    pressure_error = float(np.linalg.norm(recovered-truth)/max(np.linalg.norm(truth),1e-20))
    heat_steps = [dict(diffusion_time=float(t), Cp=floats(expm(-t*L)@base)) for t in np.linspace(0,tau,16)]
    # Re-run both load vectors through the native kernel. Member result colors
    # must come from these end-force solutions, never from graph-smoothed colors.
    true_loads = {nid: sum(truth[k]*panel_basis[k][nid] for k in range(n))
                  for nid in panel_basis[0]}
    recovered_loads = {nid: sum(recovered[k]*panel_basis[k][nid] for k in range(n))
                       for nid in panel_basis[0]}
    true_result = solve(model,masses,true_loads)
    recovered_result = solve(model,masses,recovered_loads)
    member_errors = {}
    for part, expected in true_result['response']['members'].items():
        estimated = recovered_result['response']['members'][part]
        ef = np.asarray([x['localEndForces'] for x in expected['elementResults']])
        rf = np.asarray([x['localEndForces'] for x in estimated['elementResults']])
        es,rs = expected['sigmaMaxAbsPa'], estimated['sigmaMaxAbsPa']
        member_errors[part] = dict(
          truth_sigma_max_Pa=es,recovered_sigma_max_Pa=rs,
          sigma_absolute_error_Pa=abs(rs-es),
          sigma_relative_error=None if es<1e-5 else abs(rs-es)/es,
          end_force_relative_l2_error=float(np.linalg.norm(rf-ef)/max(np.linalg.norm(ef),1e-9)))
    return dict(status='executed',
                method='Graph heat equation dCp/dtau = -L Cp; Tikhonov regularized inverse using native ZDyn influence matrix',
                objective='min_Cp ||H_train Cp - y_train||_2^2 + lambda ||L Cp||_2^2',
                units=dict(Cp='dimensionless',observations='m',diffusion_time='dimensionless graph time'),
                synthetic_validation=True,noise_seed=20261005,noise_std_m=noise_std,
                panel_ids=[p['id'] for p in model['roof_panels']],
                pressure_truth_Cp=floats(truth),pressure_recovered_Cp=floats(recovered),
                native_influence_matrix=H.tolist(),graph_laplacian=L.tolist(),
                diffusion_snapshots=heat_steps,
                sensors=[dict(node=nid,dof=d+1) for nid,d in candidates],
                train_indices=train.tolist(),holdout_indices=held.tolist(),
                observations_m=floats(observed),prediction_m=floats(pred),
                operator_normalization_m=float(scale),lambda_scaled=lam,
                lambda_unscaled_m2=float(lam*scale*scale),
                rank=rank,unknowns=n,singular_values=sv.tolist(),
                condition_number=float(sv[0]/sv[-1]) if sv[-1]>0 else None,
                training_relative_residual=residual,holdout_relative_error=held_error,
                pressure_relative_recovery_error=pressure_error,
                true_native_result=true_result,recovered_native_result=recovered_result,
                member_response_errors=member_errors,
                recovery_passed=bool(rank==n and pressure_error<.08 and held_error<.02),
                limitations=['Synthetic displacements, not field sensors.',
                             'Recovers only the specified roof pressure basis, not a unique arbitrary distributed load.',
                             'Diffusion is a numerical spatial prior, not moisture transport or a learned generative model.',
                             'Internal member stress is recalculated by native FE, never replaced by a smoothed color field.'])


def coverage(model):
    """Every visible part receives an honest analysis coverage record."""
    elements={}
    for m in model['members']:
        elements.setdefault(m['part_id'],[]).append(int(m['id']))
    panels={p['id']:p for p in model['roof_panels']}
    fixed=[n for n in model['nodes'] if any(n.get('fix',[0]*6))]
    records={}
    for part,meshes in model.get('part_mesh_map',{}).items():
        if part in elements:
            records[part]=dict(category='beam_solve',mesh_names=meshes,
              native_element_ids=elements[part],field='beam-section axial plus bending normal-stress envelope Pa',
              inverse='true_native_result and recovered_native_result members[part_id]',
              exclusions='Not local mortise, peg, bearing, or contact stress; no fracture/strength verdict.')
        elif part in panels or part.startswith('TILE_') and part.replace('TILE_','DECK_') in panels:
            panel=part if part in panels else part.replace('TILE_','DECK_')
            records[part]=dict(category='pressure_panel',mesh_names=meshes,panel_id=panel,
              field='imposed uniform pressure Pa, tributary mass; no local shell stress',
              support_nodes=panels[panel]['support_nodes'])
        elif part.startswith('STONE_'):
            # Model quadrants use FL, FR, BL, BR and Z-up coordinates.
            sx=-1 if part.endswith(('FL','BL')) else 1
            sy=-1 if part.endswith(('FL','FR')) else 1
            nodes=[int(n['id']) for n in fixed if n['xyz'][0]*sx>0 and n['xyz'][1]*sy>0]
            records[part]=dict(category='base_reaction',mesh_names=meshes,node_ids=nodes,
              field='support reaction N and moment N m; no stone material stress')
        elif part.startswith('PEG_'):
            records[part]=dict(category='connection_hardware_not_solved',mesh_names=meshes,
              field=None,reason='Peg is real structural connection hardware. Rigid baseline idealizes load transfer; pin shear/contact is not solved.')
        else:
            records[part]=dict(category='nonprimary_component_not_solved',mesh_names=meshes,
              field=None,reason='Outside the primary load-bearing frame idealization. No stress is assigned.')
    counts={}
    for r in records.values(): counts[r['category']]=counts.get(r['category'],0)+1
    return dict(parts=records,counts=counts,
      known_native_part_count=len(elements),mapped_visible_parts=len(records),
      all_native_parts_mapped=set(elements).issubset(records),
      rendering_rule='Use beam solve stress only on mapped beam parts; pressure color on panels must be separately labeled. Unsupported parts remain neutral.')


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--input',type=Path,default=DEFAULT_INPUT)
    ap.add_argument('--out',type=Path,default=OUT)
    ap.add_argument('--duration',type=float,default=12.)
    ap.add_argument('--provisional',action='store_true')
    args=ap.parse_args()
    started=time.time()
    model=read_model(args.input)
    args.out.mkdir(parents=True,exist_ok=True)
    provenance=dict(native_module=z.__file__,native_version=z.version(),
                    native_sha256=digest(z.__file__),input=str(args.input),input_sha256=digest(args.input),
                    script_sha256=digest(__file__),python=sys.version,provisional=args.provisional)
    part_coverage=coverage(model)
    part_coverage['provenance']=provenance
    save(args.out/'part-analysis-coverage.json',part_coverage)
    save(args.out/'capability.json',dict(**provenance,
      verified_api=['node','fix','rigidLink','elasticBeamColumn','Plain load','Static','Newmark transient','nodeDisp','nodeReaction','eleResponse'],
      Zwind_role='Uses the installed native ZDyn structural kernel shipped with Zwind.',
      AeroDyn_limit='Rotor/airfoil aerodynamics. No arbitrary-building CFD interface documented in this installation.',
      forbidden_source='No turbine demo reactions/forces are used or transferred to pavilion.',
      source_document=str(ZWIND/'docs/reference/Zwind_API_documentation_2026-09.md')))
    dead,wind,masses,basis,meta=make_loads(model)
    bc=dict(**provenance,coordinates='Blender Z-up',units='SI',
            boundary_nodes=[n for n in model['nodes'] if any(n.get('fix',[0]*6))],
            rigid_links=model['rigid_links'],wind=meta,
            joint_model='Perfectly connected linear frame for baseline; sensitivity compares explicit rotational springs.',
            timber='Longitudinal E and G as supplied; engineering beam idealization, not full orthotropic contact FE.',
            dead_loads={str(k):floats(v) for k,v in dead.items()},
            wind_loads={str(k):floats(v) for k,v in wind.items()},
            lumped_mass_kg={str(k):v for k,v in masses.items()},
            numerical_mass_regularization=dict(min_node_mass_kg=1e-5,
              rotational_inertia_per_node_mass_m2=1e-5,
              purpose='Avoid a massless rotational block; physical tributary masses are listed separately.'))
    save(args.out/'boundary-conditions.json',bc)
    cases={}
    for key,loads in [('gravity',dead),('wind',wind),('gravity_wind',sum_loads(dead,wind))]:
        cases[key]=solve(model,masses,loads)
        print('native static',key,'residual',cases[key]['equilibrium']['relativeForceResidual'],flush=True)
    for angle in [45.,90.]:
        _,w,_,_,me=make_loads(model,direction_deg=angle)
        cases[f'wind_{int(angle)}deg']=solve(model,masses,sum_loads(dead,w))
        cases[f'wind_{int(angle)}deg']['wind']=me
    save(args.out/'static-cases.json',dict(provenance=provenance,cases=cases,nodes=model['nodes'],members=model['members']))
    sensitivity=[]
    for k in [2e4,2e5,2e6]:
        result=solve(model,masses,sum_loads(dead,wind),rotation_k=k,samples=False)
        ds=result['response']['nodalDisplacements']
        sensitivity.append(dict(joint_rotation_stiffness_Nm_rad=k,
          max_displacement_m=max(float(np.linalg.norm(u[:3])) for u in ds.values()),
          max_normal_stress_Pa=max(p['sigmaMaxAbsPa'] for p in result['response']['members'].values()),
          equilibrium=result['equilibrium']))
    save(args.out/'joint-sensitivity.json',dict(
      interpretation='Assumed isotropic rotational springs at physical beam-part endpoints only; internal mesh subdivisions remain continuous. Not measured joint constitutive calibration.',cases=sensitivity))
    dyn=native_dynamic(model,masses,dead,wind,duration=args.duration)
    dyn['provenance']=provenance
    save(args.out/'dynamic-response.json',dyn)
    print('native dynamic',dyn['solver'],flush=True)
    inverse=inverse_diffusion(model,masses,basis,meta)
    inverse['provenance']=provenance
    save(args.out/'inverse-diffusion.json',inverse)
    worstF=max(c['equilibrium']['relativeForceResidual'] for c in cases.values())
    worstM=max(c['equilibrium']['relativeMomentResidual'] for c in cases.values())
    qa=dict(provenance=provenance,node_count=len(model['nodes']),element_count=len(model['members']),
      parts=len({m['part_id'] for m in model['members']}),
      worst_force_relative_residual=worstF,worst_moment_relative_residual=worstM,
      dynamic_all_steps_pass=dyn['solver']['all_status_zero'],
      inverse_recovery_pass=inverse.get('recovery_passed',False),
      max_transient_displacement_m=max(float(np.linalg.norm(u[:3])) for s in dyn['snapshots'] for u in s['nodalDisplacements'].values()),
      max_transient_normal_stress_Pa=max(p['sigmaMaxAbsPa'] for s in dyn['snapshots'] for p in s['members'].values()),
      duration_seconds=time.time()-started,
      input_unchanged_during_run=digest(args.input)==provenance['input_sha256'],
      passed=bool(worstF<1e-6 and worstM<1e-6 and dyn['solver']['all_status_zero'] and inverse.get('recovery_passed',False)))
    qa['passed']=qa['passed'] and qa['input_unchanged_during_run'] and part_coverage['all_native_parts_mapped']
    save(args.out/'qa.json',qa)
    summary=dict(provenance=provenance,coverage=part_coverage['counts'],
      static={name:dict(
        max_displacement_mm=1000*max(float(np.linalg.norm(u[:3])) for u in case['response']['nodalDisplacements'].values()),
        max_normal_stress_MPa=max(p['sigmaMaxAbsPa'] for p in case['response']['members'].values())/1e6,
        equilibrium=case['equilibrium']) for name,case in cases.items()},
      dynamic_max_displacement_mm=qa['max_transient_displacement_m']*1000,
      dynamic_max_normal_stress_MPa=qa['max_transient_normal_stress_Pa']/1e6,
      inverse={k:inverse[k] for k in ['rank','unknowns','condition_number','pressure_relative_recovery_error','holdout_relative_error','recovery_passed']},
      passed=qa['passed'])
    save(args.out/'result-summary.json',summary)
    print(json.dumps(qa,ensure_ascii=False,indent=2))
    z.wipe()


if __name__=='__main__':
    main()
