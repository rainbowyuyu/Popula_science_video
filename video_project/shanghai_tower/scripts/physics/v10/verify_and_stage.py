"""Independent cuts, linear load reversals, mesh sensitivity and staged gravity."""
import argparse,copy,json,time
import numpy as np
import solve_shell_tower as st

def cut_forces(g,state,loads):
    by={n['id']:n for n in g['nodes']};results=[]
    for low,high in zip(g['heights'][:-1],g['heights'][1:]):
        y=(low+high)/2;origin=np.array([0.,y,0.]);groups={k:np.zeros(6) for k in ['corewall','megacolumn','cornercolumn','outrigger','belt']}
        for m,forces in zip(g['members'],state['globalElementForces']):
            elev=[by[n]['level'] for n in m['nodeIds']]
            if min(elev)>=y or max(elev)<=y:continue
            for j,nid in enumerate(m['nodeIds']):
                if by[nid]['level']<=y:continue
                f=forces[j*6:j*6+6].copy();f[3:]+=np.cross(np.array(by[nid]['xyz'])-origin,f[:3]);groups[m['role']]+=f
        applied=np.zeros(6);scale=0.
        for nid,f in loads.items():
            if by[nid]['level']<=y:continue
            applied[:3]+=f;m=np.cross(np.array(by[nid]['xyz'])-origin,f);applied[3:]+=m;scale+=np.linalg.norm(m)
        total=sum(groups.values());residual=total-applied
        results.append(dict(height_m=y,total=total.tolist(),bySystem={k:v.tolist() for k,v in groups.items()},appliedAbove=applied.tolist(),residual=residual.tolist(),
                            relativeForce=float(np.linalg.norm(residual[:3])/max(1,np.linalg.norm(applied[:3]))),relativeMoment=float(np.linalg.norm(residual[3:])/max(1,scale))))
    return results

def staged_graph(g,height):
    h=copy.deepcopy(g);by={n['id']:n for n in h['nodes']}
    # Derive floor loads/masses by removing the original structural selfweight.
    for m in h['members']:
        share=m['mass']/len(m['nodeIds'])
        for nid in m['nodeIds']:
            n=by[nid];n['gravityLoad'][1]+=share*st.G
            for d in range(3):n['mass6'][d]-=share
    selected=[m for m in h['members'] if all(by[n]['level']<=height+1e-6 for n in m['nodeIds'])]
    used={nid for m in selected for nid in m['nodeIds']}|{n['id'] for n in h['nodes'] if n['role']=='diaphragm' and n['level']<=height+1e-6}
    # At a topology-change plane, a wall starting above the stage is absent.
    # Reallocate its share of floor gravity to the existing lower-stage walls.
    for n in h['nodes']:
        if n['id'] in used or n['level']>height+1e-6:continue
        targets=[q for q in h['nodes'] if q['id'] in used and q['role']=='wall' and q['level']==n['level']]
        if not targets:continue
        for q in targets:
            q['gravityLoad']=(np.array(q['gravityLoad'])+np.array(n['gravityLoad'])/len(targets)).tolist()
            q['mass6']=(np.array(q['mass6'])+np.array(n['mass6'])/len(targets)).tolist()
    h['members']=selected;h['nodes']=[n for n in h['nodes'] if n['id'] in used]
    for m in selected:
        share=m['mass']/len(m['nodeIds'])
        for nid in m['nodeIds']:
            n=by[nid];n['gravityLoad'][1]-=share*st.G
            for d in range(3):n['mass6'][d]+=share
    h['constraints']=[c for c in h['constraints'] if c['master'] in used and c['slave'] in used]
    h['fixedNodeIds']=[n for n in h['fixedNodeIds'] if n in used]
    h['heights']=[y for y in h['heights'] if y<=height+1e-6];h['windLoads']=[w for w in h['windLoads'] if w['nodeId'] in used]
    return h

def run(args):
    folder=st.OUT/args.model;g=json.loads((folder/'graph.json').read_text('utf8'));by={n['id']:n for n in g['nodes']}
    report={}
    for name,axis in [('gravity',None),('wind-x',0),('wind-z',2)]:
        archive=np.load(folder/(name+'.npz'));state={k:archive[k] for k in archive.files};loads={n['id']:np.array(n['gravityLoad'] if axis is None else [0.,0.,0.]) for n in g['nodes']}
        if axis is not None:
            for w in g['windLoads']:loads[w['nodeId']][axis]+=np.linalg.norm(w['force'])
        cuts=cut_forces(g,state,loads);st.save(folder/(name+'-cuts.json'),cuts)
        report[name]=dict(cuts=len(cuts),maxForceResidual=max(x['relativeForce'] for x in cuts),maxMomentResidual=max(x['relativeMoment'] for x in cuts))
    forward=np.load(folder/'wind-x.npz');half=np.load(folder/'wind-half.npz');reverse=np.load(folder/'wind-reverse.npz')
    report['linearChecks']={key:dict(halfMaxAbsolute=float(np.max(abs(half[key]-.5*forward[key]))),reverseMaxAbsolute=float(np.max(abs(reverse[key]+forward[key])))) for key in ['u','r','shellResultants','lineStressMPa','globalElementForces'] if key!='lineStressMPa'}
    other=st.OUT/'refined';rg=json.loads((other/'graph.json').read_text('utf8'));rindex={n['id']:i for i,n in enumerate(rg['nodes'])};cindex={n['id']:i for i,n in enumerate(g['nodes'])}
    common=[n['id'] for n in g['nodes'] if n['id'] in rindex and n['role']=='diaphragm']
    mesh=[]
    for name in ['gravity','wind-x','wind-z']:
        a=np.load(folder/(name+'.npz'));b=np.load(other/(name+'.npz'))
        selected=common if name!='gravity' else [n['id'] for n in g['nodes'] if n['id'] in rindex and n['role']=='wall']
        ua=np.array([a['u'][cindex[n]] for n in selected]);ub=np.array([b['u'][rindex[n]] for n in selected])
        mesh.append(dict(case=name,sampledRole='diaphragm' if name!='gravity' else 'wall',samples=len(selected),maximumCommonDisplacementDifference_m=float(np.max(abs(ub-ua))),relativeMaximumDisplacementDifference=float(np.max(abs(ub-ua))/max(1e-15,np.max(abs(ub))))))
    ca=np.load(folder/'modes.npz')['periods'];ra=np.load(other/'modes.npz')['periods']
    report['meshSensitivity']=dict(coarseNodes=len(g['nodes']),refinedNodes=len(rg['nodes']),commonMasterComparisons=mesh,periodCoarse_s=ca.tolist(),periodRefined_s=ra.tolist(),relativePeriodDifferences=((ra-ca)/ra).tolist(),scope='Horizontal wall subdivision5m→2.5m; global response sensitivity only, local joint stress convergence is not claimed.')
    st.save(st.OUT/'verification/structural-qa.json',report);print('QA',json.dumps(report),flush=True)
    if args.no_stages:return
    ops,dll=st.backend();stages=[]
    for height in g['parameters']['zone_boundaries'][1:]:
        sg=staged_graph(g,height);state,qa=st.static(ops,sg);name=f'gravity-{height:g}'
        path=folder/'stages';path.mkdir(exist_ok=True)
        np.savez_compressed(path/(name+'.npz'),**state)
        desc=dict(height=height,nodeIds=[n['id'] for n in sg['nodes']],memberIds=[m['id'] for m in sg['members'] if m['type']!='shell'],wallIds=[m['id'] for m in sg['members'] if m['type']=='shell'],file=name+'.npz',verification=qa,
                  scope='Independent static partial-height gravity model, not staged lock-in, creep or construction-history analysis.')
        stages.append(desc);print('STAGE',height,qa['equilibrium']['relativeForce'],flush=True)
    st.save(folder/'stages/index.json',stages);ops.wipe()

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--model',default='coarse');ap.add_argument('--no-stages',action='store_true');run(ap.parse_args())
