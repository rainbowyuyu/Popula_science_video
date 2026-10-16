"""Conservative CFD mean-load mapping; no solver import or production writes.

Input moments must be integrated on the same tower surface as the forces.
Force-only height bins cannot establish conservation of bending/torsion.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[2]
EXPECTED = (1541, 1984, 132)
EXPECTED_TOPOLOGY_SHA256 = '6cbc87924dcbde647b980879eb7488d602d047fb94b2b57b89067c05c1d30a40'
R_CFD_TO_THREE = np.array([[1., 0., 0.], [0., 0., 1.], [0., -1., 0.]])
TOPOLOGY_KEYS = ('nodes', 'members', 'constraints', 'fixedNodeIds', 'heights', 'floorHeights', 'parameters', 'renderMapping')

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf8')

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def vec(value, name):
    a = np.asarray(value, dtype=float)
    if a.shape != (3,) or not np.isfinite(a).all():
        raise ValueError(f'{name} must contain three finite SI components')
    return a

def topology_hash(graph):
    data = {k:graph[k] for k in TOPOLOGY_KEYS}
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()

def check_graph(graph):
    actual = (len(graph['nodes']), len(graph['members']), len(graph['windLoads']))
    if actual != EXPECTED:
        raise ValueError(f'Frozen topology/count changed: expected {EXPECTED}, got {actual}')
    if topology_hash(graph) != EXPECTED_TOPOLOGY_SHA256:
        raise ValueError('Frozen structural fingerprint changed; do not silently alter geometry, properties, constraints or render mapping')
    if graph.get('coordinates') != 'Three Y-up' or graph.get('units') != {'length':'m','force':'N','mass':'kg','stress':'Pa'}:
        raise ValueError('Frozen structural coordinate/units contract changed')
    by = {n['id']:n for n in graph['nodes']}
    loads = graph['windLoads']
    if len({w['nodeId'] for w in loads}) != EXPECTED[2]:
        raise ValueError('Expected 132 unique existing wind-load nodes')
    points = np.array([vec(by[w['nodeId']]['xyz'], 'node xyz') for w in loads])
    if np.any(np.diff(points[:, 1]) <= 0):
        raise ValueError('Existing load nodes must be ordered by increasing height')
    if any(by[w['nodeId']]['role'] != 'core' for w in loads):
        raise ValueError('Wind loading contract expects existing core center nodes')
    return by, points

def components(record):
    """Require total F/M; optionally verify pressure + viscous decomposition."""
    force = vec(record['force_N'], 'force_N')
    if 'moment_Nm' not in record:
        raise ValueError('Missing moment_Nm: Fx/Fy/Fz alone cannot preserve torsion or eccentric loading')
    moment = vec(record['moment_Nm'], 'moment_Nm')
    if ('pressure' in record) != ('viscous' in record):
        raise ValueError('Provide both pressure and viscous components or neither')
    if 'pressure' in record:
        pf, pm = components(record['pressure']); vf, vm = components(record['viscous'])
        if not np.allclose(force, pf+vf, rtol=1e-8, atol=1e-5):
            raise ValueError('Total force does not equal pressure + viscous force')
        if not np.allclose(moment, pm+vm, rtol=1e-8, atol=1e-4):
            raise ValueError('Total moment does not equal pressure + viscous moment')
    return force, moment

def resultants(loads, graph):
    by = {n['id']:n for n in graph['nodes']}
    force = np.zeros(3); moment = np.zeros(3)
    for load in loads:
        f = vec(load['force'], 'nodal force'); m = vec(load['moment'], 'nodal moment')
        force += f
        moment += np.cross(vec(by[load['nodeId']]['xyz'], 'xyz'), f)+m
    return force, moment

def map_layers(cfd, graph, allow_unvalidated=False):
    by, points = check_graph(graph)
    if cfd.get('schema') != 'rainbow.cfd-layer-loads/1':
        raise ValueError('Unsupported CFD layer-load schema')
    if cfd.get('units') != {'length':'m', 'force':'N', 'moment':'N m'}:
        raise ValueError('Only dimensional SI loads are accepted; Cp/coefficient/nondimensional fields need explicit conversion first')
    if cfd.get('forceConvention') != 'fluid-on-solid' or cfd.get('bodySurface') != 'tower':
        raise ValueError('Require forces ON the tower only; exclude ground/farfield and reverse-reaction conventions')
    if cfd.get('temporalKind') != 'steady-mean':
        raise ValueError('This adapter handles steady CFD mean only; physical transient samples need independent per-DOF Path histories')
    accepted = cfd.get('quality', {}).get('acceptedForCoupling') is True
    if not accepted and not allow_unvalidated:
        raise ValueError('CFD source is not accepted for coupling; --allow-unvalidated is for quarantined mapping tests only')
    coordinate = cfd.get('coordinates')
    if coordinate == 'CFD_Z_UP':
        rotation = R_CFD_TO_THREE
    elif coordinate == 'THREE_Y_UP':
        rotation = np.eye(3)
    else:
        raise ValueError('coordinates must be CFD_Z_UP or THREE_Y_UP; prevent missing/double transformation')
    # Both supported transforms are proper rotations, so axial moments transform
    # exactly like forces. Reflections are deliberately not offered.
    assert abs(np.linalg.det(rotation)-1) < 1e-12
    origin = rotation @ vec(cfd['momentOrigin_m'], 'momentOrigin_m')
    translation = vec(cfd.get('translationToStructuralOrigin_m', [0,0,0]), 'translationToStructuralOrigin_m')
    origin += translation
    bins = cfd['bins']
    if not bins:
        raise ValueError('No height bins')
    expected_range = cfd.get('heightRange_m', [0.,632.])
    if len(expected_range) != 2 or not np.allclose(expected_range, [0.,632.], rtol=0, atol=1e-8):
        raise ValueError('Full tower surface coverage must be declared as heightRange_m [0,632]')
    next_height = 0.
    nodal_f = np.zeros((len(points),3)); nodal_m = np.zeros_like(nodal_f)
    total_f = np.zeros(3); total_m = np.zeros(3); assignment = []
    force_abs_scale = 0.; moment_abs_scale = 0.
    for index, band in enumerate(bins):
        low = float(band['heightMin_m']); high = float(band['heightMax_m'])
        if not np.isfinite([low,high]).all() or high <= low or abs(low-next_height)>1e-7:
            raise ValueError(f'Bin {index} is empty, overlapping, unordered or leaves a height gap')
        next_height = high
        f0,m0 = components(band)
        f = rotation @ f0
        m = rotation @ m0 + np.cross(origin, f) # moment about structural world zero
        h = (low+high)*.5 + translation[1]
        # Linear barycentric assignment is local and preserves height centroids.
        # Above 580m and below the first active load node, clamp the location and
        # retain the resulting residual bending couple explicitly.
        upper = int(np.searchsorted(points[:,1],h))
        if upper == 0: weights = [(0,1.)]
        elif upper == len(points): weights = [(len(points)-1,1.)]
        else:
            lower=upper-1; w=(h-points[lower,1])/(points[upper,1]-points[lower,1])
            weights=[(lower,1-w),(upper,w)]
        # Distribute only the residual couple after the weighted force centroid.
        # Computing w*M - r_i x (w*F) independently at each node would preserve
        # global balance but invent equal/opposite couples between adjacent nodes.
        # This form reproduces a centered force with zero spurious nodal couples.
        weighted_point = sum((w*points[k] for k,w in weights), np.zeros(3))
        residual_couple = m-np.cross(weighted_point,f)
        targets=[]
        for k,w in weights:
            if w <= 1e-15: continue
            fk=w*f; mk=w*residual_couple
            nodal_f[k]+=fk; nodal_m[k]+=mk
            targets.append({'nodeId':graph['windLoads'][k]['nodeId'],'weight':float(w)})
        assignment.append({'bin':band.get('id',index),'height_m':h,'targets':targets})
        total_f+=f;total_m+=m
        force_abs_scale += float(np.linalg.norm(f))
        moment_abs_scale += float(np.linalg.norm(m))
    if abs(next_height-632)>1e-7:
        raise ValueError('CFD bands do not cover the full 0..632m tower')
    # A separate full-surface integral is mandatory to catch omitted tower walls.
    if 'integratedTotal' not in cfd:
        raise ValueError('Require integratedTotal from an independent full-tower surface integration')
    cf,cm=components(cfd['integratedTotal']);expected_f=rotation@cf;expected_m=rotation@cm+np.cross(origin,expected_f)
    force_tol=max(1e-5,force_abs_scale*1e-8); moment_tol=max(1e-4,moment_abs_scale*1e-8)
    if np.max(np.abs(total_f-expected_f))>force_tol or np.max(np.abs(total_m-expected_m))>moment_tol:
        raise ValueError('Height-bin totals differ from independent whole-tower force/moment integral')
    loads=[{'nodeId':w['nodeId'],'height':float(points[k,1]),'force':nodal_f[k].tolist(),'moment':nodal_m[k].tolist()} for k,w in enumerate(graph['windLoads'])]
    output=copy.deepcopy(graph);output['windLoads']=loads
    source_kind='CFD steady mean, conservative one-way structural input' if accepted else 'UNVALIDATED mapping fixture/candidate; not an accepted CFD structural load'
    output['windLoadProvenance']={'kind':source_kind,'coordinates':'THREE_Y_UP','units':{'force':'N','moment':'N m'},'source':copy.deepcopy(cfd.get('provenance',{})),'acceptedForCoupling':accepted,'scope':'No motion feedback to CFD. No unsteady CFD time history. Existing tower topology and assumed properties unchanged. X-only TMD remains a single-axis educational device.','pressureViscousDecompositionChecked':all('pressure' in b for b in bins)}
    load_scope='Wind input replaced by an independently checked CFD steady mean; any subsequent prescribed gust is a separate assumption, not transient CFD.' if accepted else 'Wind input is an UNVALIDATED mapping fixture/candidate. It is not a production CFD result and must not be used in published structural-response claims.'
    output['scope']=[s for s in graph.get('scope',[]) if not s.startswith('Wind is prescribed')]+[load_scope]
    if topology_hash(output)!=topology_hash(graph):
        raise AssertionError('Frozen model topology changed')
    actual_f,actual_m=resultants(loads,output)
    ferr=actual_f-total_f;merr=actual_m-total_m
    if np.max(abs(ferr))>force_tol or np.max(abs(merr))>moment_tol:
        raise AssertionError('Nodal mapping failed force/moment conservation')
    no_couple_m=np.sum(np.cross(points,nodal_f),axis=0)
    report={'schema':'rainbow.cfd-structure-mapping-qa/1','passed':True,'sourceAcceptedForCoupling':accepted,'solverRun':False,'counts':{'nodes':len(graph['nodes']),'members':len(graph['members']),'windLoadNodes':len(loads),'cfdBins':len(bins)},'topologySHA256':topology_hash(graph),'transformationToThree':rotation.tolist(),'momentOriginInThree_m':origin.tolist(),'sourceForce_N':total_f.tolist(),'sourceMomentAboutStructuralOrigin_Nm':total_m.tolist(),'mappedForce_N':actual_f.tolist(),'mappedMomentAboutStructuralOrigin_Nm':actual_m.tolist(),'forceResidual_N':ferr.tolist(),'momentResidual_Nm':merr.tolist(),'tolerance':{'force_N':force_tol,'moment_Nm':moment_tol},'forceOnlyMomentError_Nm':(no_couple_m-total_m).tolist(),'maximumNodalCouple_Nm':float(np.max(np.linalg.norm(nodal_m,axis=1))),'requiresMomentDOFs':bool(np.any(abs(nodal_m)>moment_tol)),'assignment':assignment,'limitations':['Conservative equivalent layer wrench mapping; it does not reconstruct individual facade connection forces.','The 580–632 m crown maps to the existing 580 m node with its full additional bending/torsional couple.','Structural torsional stiffness remains the existing approximate equivalent J, not an independently calibrated as-built torsion model.']}
    return output,report

def validate_mapped(source, mapped, report):
    check_graph(source);check_graph(mapped)
    if topology_hash(source)!=topology_hash(mapped) or report['topologySHA256']!=topology_hash(mapped):
        raise ValueError('Source/output topology fingerprint mismatch')
    if [w['nodeId'] for w in source['windLoads']] != [w['nodeId'] for w in mapped['windLoads']]:
        raise ValueError('Original 132 load-node IDs/order changed')
    force,moment=resultants(mapped['windLoads'],mapped)
    if np.max(abs(force-vec(report['sourceForce_N'],'qa force')))>report['tolerance']['force_N']:
        raise ValueError('Independent total-force check failed')
    if np.max(abs(moment-vec(report['sourceMomentAboutStructuralOrigin_Nm'],'qa moment')))>report['tolerance']['moment_Nm']:
        raise ValueError('Independent total-moment check failed')
    return {'passed':True,'topologySHA256':topology_hash(mapped),'nodeLoadCount':len(mapped['windLoads']),'force_N':force.tolist(),'moment_Nm':moment.tolist(),'solverRun':False}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',type=Path,required=True);p.add_argument('--graph',type=Path,default=PROJECT/'public/physics/structural-graph.json');p.add_argument('--out',type=Path,required=True);p.add_argument('--allow-unvalidated',action='store_true');a=p.parse_args()
    out=a.out.resolve()
    if not out.is_relative_to(HERE):
        raise SystemExit('Output must remain inside research/visual-v4/one-way-coupling')
    out.mkdir(parents=True,exist_ok=True)
    mapped,report=map_layers(read(a.input),read(a.graph),a.allow_unvalidated)
    report['inputs']={'cfd':{'path':str(a.input.resolve()),'sha256':sha(a.input)},'graph':{'path':str(a.graph.resolve()),'sha256':sha(a.graph)}}
    write(out/'structural-graph.cfd-candidate.json',mapped);write(out/'mapping-qa.json',report)
    verified=validate_mapped(read(a.graph),read(out/'structural-graph.cfd-candidate.json'),read(out/'mapping-qa.json'))
    write(out/'independent-validation.json',verified)
    print(json.dumps({k:report[k] for k in ['passed','sourceAcceptedForCoupling','counts','forceResidual_N','momentResidual_Nm','requiresMomentDOFs','maximumNodalCouple_Nm']},ensure_ascii=False))

if __name__=='__main__':main()
