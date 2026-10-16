"""Full assembled-shell Newmark dynamics, not rescaled static shapes or a modal cartoon."""
from pathlib import Path
import argparse,json,math,time
import numpy as np
import solve_shell_tower as st

def run(args):
    folder=st.OUT/args.model;g=json.loads((folder/'graph.json').read_text('utf8'))
    eig=np.load(folder/'modes.npz')['eigenvalues'];omega=np.sqrt(eig)
    ops,dll=st.backend();gravity,gravity_report=st.static(ops,g)
    ops.loadConst('-time',0.);by={n['id']:n for n in g['nodes']}
    core=[n for n in g['nodes'] if n['role']=='diaphragm'];core.sort(key=lambda n:n['level'])
    support=core[-1];mass=st.A['tmdMass'];wt=omega[0];k=mass*wt**2;c=2*.08*mass*wt
    tmdtag=max(n['tag'] for n in g['nodes'])+1;tmd_element=max(m['tag'] for m in g['members'])+1
    mass_by_tag={n['tag']:np.array(n['mass6'],float) for n in g['nodes']}
    if not args.no_tmd:
        modified=mass_by_tag[support['tag']].copy();modified[0]-=mass
        ops.mass(support['tag'],*modified);mass_by_tag[support['tag']]=modified
        ops.node(tmdtag,*support['xyz']);ops.fix(tmdtag,0,1,1,1,1,1);ops.mass(tmdtag,mass,0.,0.,0.,0.,0.)
        ops.uniaxialMaterial('Elastic',10001,k);ops.uniaxialMaterial('Viscous',10002,c,1.)
        ops.uniaxialMaterial('Parallel',10003,10001,10002)
        ops.element('zeroLength',tmd_element,support['tag'],tmdtag,'-mat',10003,'-dir',1,'-doRayleigh',0)
        mass_by_tag[tmdtag]=np.array([mass,0.,0.,0.,0.,0.])
    zeta=st.A['dampingRatio'];w1,w2=omega[0],omega[2]
    alpha=2*zeta*w1*w2/(w1+w2);beta=2*zeta/(w1+w2)
    ops.rayleigh(alpha,0.,beta,0.)
    time_grid=np.arange(round(args.duration/args.dt)+1)*args.dt
    factor=np.minimum(time_grid/10,1.);factor=(.5-.5*np.cos(math.pi*factor))*(1+.12*np.sin(2*math.pi*.11*time_grid)+.07*np.sin(2*math.pi*.19*time_grid+.7)+.045*np.sin(2*math.pi*.043*time_grid+1.1))
    # Hold the last sample: floating point committedTime may exceed the final
    # knot by 1e-12; a default Path would otherwise spuriously drop load to zero.
    ops.timeSeries('Path',2,'-dt',args.dt,'-values',*factor.tolist(),'-useLast');ops.pattern('Plain',2,2)
    for w in g['windLoads']:ops.load(by[w['nodeId']]['tag'],*w['force'],0.,0.,0.)
    ops.wipeAnalysis();ops.constraints('Transformation');ops.numberer('RCM');ops.system('UmfPack')
    ops.test('NormUnbalance',1e-4,20);ops.algorithm('Linear','-factorOnce');ops.integrator('Newmark',.5,.25);ops.analysis('Transient')
    count=len(time_grid);walls=[m for m in g['members'] if m['type']=='shell'];lines=[m for m in g['members'] if m['type']!='shell'];nodes=g['nodes']
    raw=folder/('dynamic-no-tmd' if args.no_tmd else args.name);raw.mkdir(parents=True,exist_ok=True)
    # On-disk arrays bound peak RAM and preserve every actual solution step.
    arrays={}
    for name,shape in ([] if args.trace_only else [('u',(count,len(nodes),3)),('r',(count,len(nodes),3)),('axialMPa',(count,len(lines))),('verticalMPa',(count,len(walls)))]):
        arrays[name]=np.lib.format.open_memmap(raw/(name+'.npy'),mode='w+',dtype='<f4',shape=shape);arrays[name][0]=0.
    baseline_stress=gravity['lineStressMPa'][:,0];baseline_wall=gravity['wallVerticalMPa'].mean(axis=1)
    sparse_stress=[];sparse_time=[];trace=[];qa=[];started=time.time();last_progress=started
    node_index={n['id']:i for i,n in enumerate(nodes)};supportidx=node_index[support['id']]
    totalwind=sum(np.array(w['force']) for w in g['windLoads'])
    for i,t in enumerate(time_grid):
        if i:
            code=ops.analyze(1,args.dt)
            if code:raise RuntimeError(f'Transient failed at {t}s code={code}')
            if not args.trace_only:
                state=st.fields(ops,g)
                arrays['u'][i]=state['u']-gravity['u'];arrays['r'][i]=state['r']-gravity['r']
                arrays['axialMPa'][i]=state['lineStressMPa'][:,0]-baseline_stress
                arrays['verticalMPa'][i]=state['wallVerticalMPa'].mean(axis=1)-baseline_wall
        else:state=gravity
        sx=ops.nodeDisp(support['tag'],1)-gravity['u'][supportidx,0];sv=ops.nodeVel(support['tag'],1)
        tx=ops.nodeDisp(tmdtag,1) if not args.no_tmd else sx;tv=ops.nodeVel(tmdtag,1) if not args.no_tmd else sv
        rel=tx-sx;relv=tv-sv
        ta=ops.nodeAccel(tmdtag,1) if not args.no_tmd else ops.nodeAccel(support['tag'],1)
        actual_force=-ops.eleForce(tmd_element)[0] if not args.no_tmd else 0.
        trace.append([sx,tx,rel,relv,k*rel+c*relv,c*relv,factor[i],sv,ta,tv,actual_force])
        if i%max(1,round(1/args.dt))==0:
            if not args.trace_only:sparse_stress.append(state['shellResultants']);sparse_time.append(t)
            # Global dynamic linear momentum balance, with all actual lumped masses.
            # This backend accepts exactly ONE reaction flag. -dynamic already
            # includes element inertia and damping; two flags silently choose static.
            ops.reactions('-dynamic');reaction=np.zeros(3)
            for nid in g['fixedNodeIds']:reaction+=np.array(ops.nodeReaction(by[nid]['tag']))[:3]
            inertia=np.zeros(3);massdamping=np.zeros(3)
            for tag,md in mass_by_tag.items():
                inertia+=md[:3]*np.array(ops.nodeAccel(tag))[:3];massdamping+=alpha*md[:3]*np.array(ops.nodeVel(tag))[:3]
            external=np.array([0.,-sum(-n['gravityLoad'][1] for n in nodes),0.])+factor[i]*totalwind
            residual=external+reaction-inertia-massdamping
            qa.append(dict(time=float(t),residual_N=residual.tolist(),relativeToWind=float(np.linalg.norm(residual)/max(1,np.linalg.norm(totalwind))),inertia_N=inertia.tolist()))
        if time.time()-last_progress>20:
            print('DYNAMIC',round(float(t),3),'/',args.duration,'elapsed',round(time.time()-started,1),flush=True);last_progress=time.time()
    for a in arrays.values():a.flush()
    trace=np.array(trace);power=c*trace[:,3]**2;energy=np.r_[0.,np.cumsum((power[1:]+power[:-1])*.5)*args.dt]
    if not args.trace_only:np.savez_compressed(raw/'shell-integrations-1s.npz',time=np.array(sparse_time),resultants=np.array(sparse_stress))
    np.savez_compressed(raw/'trace.npz',time=time_grid,supportX_m=trace[:,0],massX_m=trace[:,1],relativeX_m=trace[:,2],relativeVelocity_m_s=trace[:,3],forceOnSupport_N=trace[:,4],damperForceOnSupport_N=trace[:,5],windFactor=factor,supportVelocity_m_s=trace[:,7],dissipatedEnergy_J=energy,massAccelerationX_m_s2=trace[:,8],massVelocityX_m_s=trace[:,9],actualElementForceOnSupport_N=trace[:,10],massRayleighForce_N=alpha*mass*trace[:,9])
    report=dict(schema='rainbow.shell-newmark/10',finishedUTC=st.stamp(),time=dict(start=0.,end=args.duration,dt=args.dt,count=count),
                seconds=time.time()-started,method='Full assembled OpenSees Newmark gamma=.5 beta=.25 with constant linear factorization',
                convergence=dict(steps=count-1,failedSteps=0,analysisCode=0),nodeIds=[n['id'] for n in nodes],memberIds=[m['id'] for m in lines],wallIds=[m['id'] for m in walls],
                damping=dict(alphaM=alpha,betaKinit=beta,targetDamping=zeta,targetModes=[1,3]),
                tmd=dict(active=not args.no_tmd,mass_kg=mass,stiffness_N_m=k,damping_N_s_m=c,tuning_rad_s=wt,internalDampingRatio=.08,supportNodeId=support['id'],
                         additionalAbsoluteMassDamping_N_s_m=alpha*mass,
                         scope='Illustrative spring tuned to this reconstructed tower first mode; not installed TMD constants. X mass removed once from support. Global Rayleigh alphaM also creates the explicitly recorded absolute-velocity damping on the TMD node; 8% refers only to the internal relative-motion dashpot.'),
                dynamicForceBalance=qa,maximumDynamicForceResidual=float(max(x['relativeToWind'] for x in qa)),
                tmdEquation=dict(maxResidual_N=float(np.max(abs(mass*trace[:,8]+trace[:,4]+alpha*mass*trace[:,9]))),maxSpringDamperVsElement_N=float(np.max(abs(trace[:,10]-trace[:,4])))),
                provenance=dict(scriptSHA256=st.sha(__file__),modelScriptSHA256=st.sha(st.__file__),graphSHA256=st.sha(folder/'graph.json'),backendSHA256=st.sha(st.ZWIND/'bin/opensees.pyd')))
    st.save(raw/'summary.json',report);print('DYNAMIC_COMPLETE',report['seconds'],report['maximumDynamicForceResidual'],flush=True);ops.wipe()

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--model',default='coarse');ap.add_argument('--name',default='dynamic');ap.add_argument('--duration',type=float,default=60.)
    ap.add_argument('--dt',type=float,default=.05);ap.add_argument('--no-tmd',action='store_true');ap.add_argument('--trace-only',action='store_true');run(ap.parse_args())
