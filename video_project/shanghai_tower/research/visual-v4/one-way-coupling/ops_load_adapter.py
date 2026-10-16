"""Small integration helpers for a FUTURE isolated Zwind run.

Importing this module does not import OpenSees, create a domain, or run a solve.
Each load is [Fx,Fy,Fz,Mx,My,Mz] in structural Three Y-up SI axes.
"""
import numpy as np

def six_dof_load(load):
    if 'moment' not in load:
        raise ValueError('CFD-mapped load is missing moment; refusing force-only truncation')
    v=np.r_[load['force'],load['moment']].astype(float)
    if v.shape!=(6,) or not np.isfinite(v).all():
        raise ValueError('Expected six finite SI nodal force/moment components')
    return v

def apply_wind_loads(ops,graph,node_by_id,applied=None):
    """Call after the intended Plain pattern; do not create a time series here."""
    for load in graph['windLoads']:
        node=node_by_id.get(load['nodeId'])
        if node is None:
            raise ValueError('Missing original load node '+str(load['nodeId']))
        v=six_dof_load(load)
        ops.load(node['tag'],*v.tolist())
        if applied is not None:
            old=np.asarray(applied.get(node['id'],np.zeros(6)),dtype=float)
            if old.shape==(3,):old=np.r_[old,[0.,0.,0.]]
            applied[node['id']]=old+v

def sum_external_wrenches(node_by_id,applied):
    """Use in reactions(), preserving explicit moments as well as r cross F."""
    force=np.zeros(3);moment=np.zeros(3)
    for node_id,value in applied.items():
        v=np.asarray(value,dtype=float)
        if v.shape==(3,):v=np.r_[v,[0.,0.,0.]]
        if v.shape!=(6,) or not np.isfinite(v).all():raise ValueError('Invalid applied vector')
        force+=v[:3]
        moment+=np.cross(node_by_id[node_id]['xyz'],v[:3])+v[3:]
    return force,moment

def load_metadata(graph,node_by_id):
    return {'nodeIds':[w['nodeId'] for w in graph['windLoads']],
            'nodeXYZ_m':[node_by_id[w['nodeId']]['xyz'] for w in graph['windLoads']],
            'baseForce_N':[w['force'] for w in graph['windLoads']],
            'baseMoment_Nm':[w['moment'] for w in graph['windLoads']],
            'semantics':'Steady CFD mean layer wrenches conservatively mapped to existing structural nodes. A separately declared load-time multiplier affects all six components. No transient CFD or two-way fluid-structure interaction is implied.'}
