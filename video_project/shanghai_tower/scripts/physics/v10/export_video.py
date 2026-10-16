"""Build a reviewable production-shaped export in research/physics-v10/export.

Does not mutate public. Raw integration-point results and all actual solver
samples remain in the model run directory. No response is synthesized here.
"""
import argparse,json,math,shutil
import numpy as np
import solve_shell_tower as st

def rounded(a,n=8):return np.round(np.asarray(a),n).tolist()
def nice(v):
    if v<=0:return 1.
    scale=10**math.floor(math.log10(v));return next((x*scale for x in [1,2,3,5,8,10] if x*scale>=v),10*scale)
def recover_line_extreme(nodes,lines,u,r,axial):
    """Elastic end moments from actual solved DOFs, checked against OpenSees.
    Three-dimensional LinearCrdTransf with vecxz=(0,0,1), as in the solver.
    """
    ix={n['id']:i for i,n in enumerate(nodes)};out=np.abs(axial).astype(float).copy()
    for k,m in enumerate(lines):
        if m['type']!='beam':continue
        i,j=[ix[n] for n in m['nodeIds']];d=np.array(nodes[j]['xyz'])-nodes[i]['xyz'];L=float(np.linalg.norm(d));ex=d/L
        ey=np.cross([0.,0.,1.],ex);ey/=np.linalg.norm(ey);ez=np.cross(ex,ey);s=m['section']
        dv=(u[:,i]-u[:,j])@ey;dw=(u[:,i]-u[:,j])@ez
        ryi=r[:,i]@ey;ryj=r[:,j]@ey;rzi=r[:,i]@ez;rzj=r[:,j]@ez
        my0=s['E']*s['Iy']*(-6*dw/L**2+4*ryi/L+2*ryj/L);my1=s['E']*s['Iy']*(-6*dw/L**2+2*ryi/L+4*ryj/L)
        mz0=s['E']*s['Iz']*(6*dv/L**2+4*rzi/L+2*rzj/L);mz1=s['E']*s['Iz']*(6*dv/L**2+2*rzi/L+4*rzj/L)
        out[:,k]+=np.maximum(abs(my0)*s['cz']/s['Iy']+abs(mz0)*s['cy']/s['Iz'],abs(my1)*s['cz']/s['Iy']+abs(mz1)*s['cy']/s['Iz'])/1e6
    return out
def pack(path,fields,common):
    offset=0;desc={}
    with path.open('wb') as file:
        for key,arr in fields.items():
            a=np.asarray(arr,dtype='<f4');desc[key]=dict(offsetBytes=offset,length=a.size,shape=list(a.shape));chunk=a.tobytes();file.write(chunk);offset+=len(chunk)
    return dict(**common,fields=desc,bytes=offset,sha256=st.sha(path),dtype='little-endian float32',binary='physics/'+path.name)

def run(args):
    folder=st.OUT/args.model;raw=folder/'dynamic';out=st.OUT/'export';out.mkdir(exist_ok=True)
    g=json.loads((folder/'graph.json').read_text('utf8'));run=json.loads((folder/'run-summary.json').read_text('utf8'))
    dyn=json.loads((raw/'summary.json').read_text('utf8'));qa=json.loads((st.OUT/'verification/structural-qa.json').read_text('utf8'))
    if dyn['convergence']['failedSteps'] or dyn['maximumDynamicForceResidual']>1e-6:raise RuntimeError('Unaccepted dynamics')
    arrays={k:np.load(raw/(k+'.npy'),mmap_mode='r') for k in ['u','r','axialMPa','verticalMPa']}
    if any(not np.isfinite(v).all() for v in arrays.values()):raise RuntimeError('Non-finite binary field')
    if any(np.max(abs(v[0]))!=0 for v in arrays.values()):raise RuntimeError('Initial wind increments not zero')
    trace=np.load(raw/'trace.npz');times=trace['time'];sample=np.arange(0,len(times),round(1/dyn['time']['dt']))
    nodes=g['nodes'];lines=[m for m in g['members'] if m['type']!='shell'];shells=[m for m in g['members'] if m['type']=='shell']
    nids=[n['id'] for n in nodes];mids=[m['id'] for m in lines];wids=[m['id'] for m in shells]
    walls=[dict(id=m['id'],tag=m['tag'],nodeIds=m['nodeIds'],meshIds=m['meshIds'],thickness_m=m['section']['thickness'],localAxes=m['localAxes'],zone=m['zone'],role='corewall') for m in shells]
    grav=np.load(folder/'gravity.npz');wind=np.load(folder/'wind-x.npz');windz=np.load(folder/'wind-z.npz')
    def state(a):return dict(u=rounded(a['u'],10),r=rounded(a['r'],10),axialMPa=rounded(a['lineStressMPa'][:,0],7),extremeMPa=rounded(a['lineStressMPa'][:,1],7))
    gs=state(grav);ws=state(wind);zs=state(windz)
    recover_check=recover_line_extreme(nodes,lines,wind['u'][None],wind['r'][None],wind['lineStressMPa'][None,:,0])[0]
    recovery_error=float(np.max(abs(recover_check-wind['lineStressMPa'][:,1])))
    if recovery_error>1e-6:raise RuntimeError('Elastic end-moment recovery disagrees with OpenSees: '+str(recovery_error))
    dynamic_extreme=recover_line_extreme(nodes,lines,np.asarray(arrays['u'][sample],float),np.asarray(arrays['r'][sample],float),np.asarray(arrays['axialMPa'][sample],float))
    combined=dict(u=rounded(grav['u']+wind['u'],10),r=rounded(grav['r']+wind['r'],10),axialMPa=rounded(grav['lineStressMPa'][:,0]+wind['lineStressMPa'][:,0],7))
    combined['extremeMPa']=rounded(recover_line_extreme(nodes,lines,(grav['u']+wind['u'])[None],(grav['r']+wind['r'])[None],(grav['lineStressMPa'][:,0]+wind['lineStressMPa'][:,0])[None])[0],7)
    zero={k:np.zeros_like(v).tolist() for k,v in gs.items()}
    wall_gravity=grav['wallVerticalMPa'].mean(axis=1);wall_wind=wind['wallVerticalMPa'].mean(axis=1)
    common=dict(time=dyn['time'],semantics='Signed physical wind increments relative to the converged gravity state. The t=0 increment is exactly zero. Rendering may interpolate but may not renormalize the response.')
    high=pack(out/'cinematic-response.f32',{k:arrays[k] for k in ['u','r','axialMPa']},dict(schema='rainbow.cinematic-response/1',nodeIds=nids,memberIds=mids,units=dict(u='m',r='rad',axialMPa='MPa'),**common))
    st.save(out/'cinematic-response.json',high)
    shell_limit=nice(float(np.max(abs(arrays['verticalMPa']))));gravity_limit=nice(float(np.max(abs(wall_gravity))))
    sh=pack(out/'shell-response.f32',dict(verticalMPa=arrays['verticalMPa']),dict(schema='rainbow.shell-response/10',wallIds=wids,units=dict(verticalMPa='MPa'),displayLimitMPa=shell_limit,
            gravityDisplayLimitMPa=gravity_limit,displayRangeScope='Fixed symmetric limit for full-duration signed vertical membrane-stress increments; independent fixed gravity limit. No capacity limit implied.',**common))
    st.save(out/'shell-response.json',sh)
    stages=[]
    for desc in json.loads((folder/'stages/index.json').read_text('utf8')):
        a=np.load(folder/'stages'/desc['file']);s=state(a)
        stages.append(dict(height=desc['height'],nodeIds=desc['nodeIds'],memberIds=desc['memberIds'],wallIds=desc['wallIds'],**s,wallVerticalMPa=rounded(a['wallVerticalMPa'].mean(axis=1),7),equilibrium=desc['verification']['equilibrium'],scope=desc['scope']))
    scope=g['scope']+['At the239.4m square-to-chamfer transition, eight new chamfer-wall lower-edge interior nodes transfer through their shell panels to shared wall endpoints. No explicit transition beam/slab model; local transition stresses are not design conclusions.',
                      'Real solver stresses are stresses of this documented idealization, not certified local reinforcement/connection stress or as-built safety verification.']
    response=dict(schema='rainbow.shanghai-physics/1',modelVersion=10,units=dict(length='m',force='N',stress='MPa',time='s'),coordinates='Three Y-up',nodes=nodes,members=lines,walls=walls,
                  static=dict(nodeIds=nids,memberIds=mids,zero=zero,gravity=gs,windOnly=ws,windZOnly=zs,windPlusGravity=combined,
                              gravityAppliedForces_N=[n['gravityLoad'] for n in nodes],windAppliedForces=[dict(nodeId=w['nodeId'],force=w['force']) for w in g['windLoads']],
                              wallStress=dict(wallIds=wids,gravity=dict(verticalMPa=rounded(wall_gravity,7)),windOnly=dict(verticalMPa=rounded(wall_wind,7)),windPlusGravity=dict(verticalMPa=rounded(wall_gravity+wall_wind,7)))),
                  stages=stages,dynamic=dict(dt=1.,time=rounded(times[sample],6),nodeIds=nids,memberIds=mids,u=rounded(arrays['u'][sample],9),r=rounded(arrays['r'][sample],10),
                                            axialMPa=rounded(arrays['axialMPa'][sample],7),extremeMPa=rounded(dynamic_extreme,7),extremeMPaSemantics='Elastic beam end stress envelope recovered from actual nodal DOFs; recovery checked against raw OpenSees static force queries. Truss values are absolute axial stress.',
                                            modalPeriods_s=run['modal']['periods_s'],convergence=dyn['convergence']),
                  visualization=dict(displacementsAlwaysPhysicalMetres=True,rotationsRadians=True,axialPositive='tension',axialNegative='compression',incrementsMayRemainCompressive='A positive wind stress increment can reduce pre-existing gravity compression; it does not alone prove net tension.',wallStress='mean4Gauss N22/thickness, signed vertical membrane stress'),
                  provenance=dict(**run['provenance'],dynamicScriptSHA256=dyn['provenance']['scriptSHA256'],modelType='actual connected ShellMITC4 wall + elastic column beams + axial steel trusses',assumptions=g['assumptions'],scope=scope),
                  validation=dict(patchTests=json.loads((st.OUT/'verification/shell-patch-tests.json').read_text('utf8')),bendingTests=json.loads((st.OUT/'verification/shell-bending-and-beam-tests.json').read_text('utf8')),modal=json.loads((st.OUT/'verification/modal-qa.json').read_text('utf8')),structural=qa,dynamicConvergence=dyn['convergence'],dynamicForceBalanceMaximum=dyn['maximumDynamicForceResidual'],beamEndStressRecoveryVsOpenSees_MPa=recovery_error))
    st.save(out/'response.json',response)
    graph=dict(g);graph['scope']=scope;st.save(out/'structural-graph.json',graph)
    core=[(i,n) for i,n in enumerate(nodes) if n['role']=='diaphragm'];core.sort(key=lambda item:item[1]['level']);core_ix=[i for i,n in core]
    supportid=dyn['tmd']['supportNodeId'];supportix=nids.index(supportid)
    supportdiff=float(np.max(abs(arrays['u'][:,supportix,0]-trace['supportX_m'])))
    if supportdiff>1e-6:raise RuntimeError('TMD/main field displacement mismatch')
    dt=dyn['time']['dt'];power=dyn['tmd']['additionalAbsoluteMassDamping_N_s_m']*trace['massVelocityX_m_s']**2
    rayleigh_energy=np.r_[0.,np.cumsum((power[1:]+power[:-1])*.5)*dt]
    tmd={k:rounded(trace[k],8 if not(k.endswith('_N') or k.endswith('_J')) else 5) for k in trace.files}
    tmd.update(dt=dt,nodeIds=[n['id'] for _,n in core],nodeXYZ_m=[n['xyz'] for _,n in core],nodeU=rounded(arrays['u'][:,core_ix],9),supportNodeId=supportid,supportXYZ_m=nodes[supportix]['xyz'],
               mass_kg=dyn['tmd']['mass_kg'],spring_N_m=dyn['tmd']['stiffness_N_m'],dashpot_Ns_m=dyn['tmd']['damping_N_s_m'],modalPeriods_s=run['modal']['periods_s'],rayleigh=dyn['damping'],
               springForceOnSupport_N=rounded(trace['forceOnSupport_N']-trace['damperForceOnSupport_N'],5),rayleighMassDissipatedEnergy_J=rounded(rayleigh_energy,5),
               windLoads=dict(nodeIds=[w['nodeId'] for w in g['windLoads']],nodeXYZ_m=[next(n['xyz'] for n in nodes if n['id']==w['nodeId']) for w in g['windLoads']],baseForce_N=[w['force'] for w in g['windLoads']],
                              semantics='Actual assigned nodal forces multiplied by matching windFactor; independent of qualitative CFD.'),
               semantics=dict(nodeU='Actual wall-shell model diaphragm-master wind increments.',relativeX_m='Actual mass minus support translation.',massRayleighForce_N='Positive alphaM*m*vMass is the damping resistance on the equation left side; physical force exerted on the moving mass is its negative.',dissipatedEnergy_J='Trapezoid integral of c*vRelative^2 only.',rayleighMassDissipatedEnergy_J='Additional explicit alphaM*m*vMass^2 dissipation, separate from relative dashpot.'),
               assumptions=[dyn['tmd']['scope'],'Physical support node at580m; displayed TMD geometry583.5m is a visualization mapping, not surveyed installation coordinates.'],
               validation=dict(mainFieldMaxDifference_m=supportdiff,**dyn['tmdEquation'],sameCaseWithinNumericalTolerance=supportdiff<1e-6))
    stats={}
    for role in sorted(set(m['role'] for m in lines)):
        ix=[i for i,m in enumerate(lines) if m['role']==role];values=np.asarray(arrays['axialMPa'][:,ix]);peak=float(np.max(abs(values)))
        stats[role]=dict(minMPa=float(values.min()),maxMPa=float(values.max()),peakAbsoluteMPa=peak,fixedFullRangeMPa=nice(peak),samples=values.size)
    # Preserve only this explicitly independent previously solved pile submodel.
    old_environment=json.loads((st.ROOT/'public/physics/environment-response.json').read_text('utf8'))
    pile=old_environment['pile'];pile['couplingStatus']='Independent previously solved single-pile illustration. Not attached to the V10 fixed-base tower, not a prediction of tower settlement.'
    environment=dict(schema='rainbow.shanghai-environment/1',modelVersion=10,tmd=tmd,pile=pile,memberStressStats=dict(byMemberRole=stats),
                     provenance=dict(towerModel='actual connected wall shells and beam/truss structure',dynamicSummarySHA256=st.sha(raw/'summary.json'),pileSourceSHA256=st.sha(st.ROOT/'public/physics/environment-response.json'),pileReuseScope=pile['couplingStatus']),
                     validation=dict(tmd=tmd['validation'],dynamicForceBalanceMaximum=dyn['maximumDynamicForceResidual'],pileScope=pile['couplingStatus']))
    st.save(out/'environment-response.json',environment)
    y=np.array([n['xyz'][1] for _,n in core]);j=int(np.argmin(abs(y-400)));i=max(0,j-1);cu=np.asarray(arrays['u'][:,core_ix])
    angle=np.arctan2(cu[:,j,0]-cu[:,i,0],y[j]-y[i])*1000
    loads=np.array([w['force'] for w in g['windLoads']]);wy=np.array([w['height'] for w in g['windLoads']]);rep=int(np.argmin(abs(wy-365)))
    series=dict(topDisplacement_mm=trace['supportX_m']*1000,coreChordAngle_mrad=angle,netWindLoad_MN=loads[:,0].sum()*trace['windFactor']/1e6,
                representativeWindLoad_kN=loads[rep,0]*trace['windFactor']/1000,tmdRelative_mm=trace['relativeX_m']*1000,tmdDissipatedEnergy_kJ=trace['dissipatedEnergy_J']/1000)
    st.save(out/'engineering-readouts.json',dict(schema='rainbow.engineering-readouts/1',time=rounded(times,6),series={k:rounded(v,7) for k,v in series.items()},
                 reference=dict(coreAngleNodeIds=[core[i][1]['id'],core[j][1]['id']],coreAngleHeights_m=[y[i],y[j]],loadNodeId=g['windLoads'][rep]['nodeId'],loadHeight_m=float(wy[rep]),supportHeight_m=nodes[supportix]['level']),
                 scope='Computed public-source elastic wall-shell reconstruction, not as-built validation. Numbers are physical; shape magnification is separately disclosed.',bounds={k:[float(v.min()),float(v.max())] for k,v in series.items()}))
    comparison=np.load(folder/'timestep-dt010/trace.npz');match=np.rint(comparison['time']/dt).astype(int)
    timestep={}
    for key in ['supportX_m','relativeX_m','forceOnSupport_N']:
        ref=trace[key][match];other=comparison[key];error=float(np.max(abs(ref-other)))
        timestep[key]=dict(maxAbsoluteDifference=error,relativeToFinePeak=error/max(1e-15,float(np.max(abs(ref)))))
    timestep_report=dict(interval_s=[0.,float(comparison['time'][-1])],fineStep_s=dt,coarseStep_s=.1,comparisons=timestep,scope='First12s ramp-up and initial sway only; no claim of a full-duration temporal convergence study.')
    st.save(st.OUT/'verification/dynamic-timestep-check.json',timestep_report)
    summary=dict(modelVersion=10,provenance=response['provenance'],counts=dict(nodes=len(nodes),shells=len(shells),lines=len(lines),timeSamples=len(times)),periods_s=run['modal']['periods_s'],
                 gravityTotal_N=sum(-n['gravityLoad'][1] for n in nodes),staticWindPeak_m=float(np.max(np.linalg.norm(wind['u'],axis=1))),
                 dynamicWindPeak_m=float(np.max(np.linalg.norm(arrays['u'],axis=2))),shellLimits=dict(windIncrementMPa=shell_limit,gravityMPa=gravity_limit),roleStressLimits=stats,
                 tmdPeakRelative_m=float(np.max(abs(trace['relativeX_m']))),validation=response['validation'],tmdValidation=tmd['validation'],timeStepCheck=timestep_report,scope=scope,
                 files={p.name:dict(bytes=p.stat().st_size,sha256=st.sha(p)) for p in out.iterdir() if p.is_file() and p.name not in ['run-summary.json','environment-summary.json']})
    st.save(out/'run-summary.json',summary);st.save(out/'environment-summary.json',dict(modelVersion=10,tmdValidation=tmd['validation'],tmdPeakRelative_m=summary['tmdPeakRelative_m'],
               tmdPeakSupport_m=float(np.max(abs(trace['supportX_m']))),tmdPeakAcceleration_m_s2=float(np.max(abs(trace['massAccelerationX_m_s2']))),provenance=environment['provenance']))
    st.save(out/'environment-qa.json',dict(schema='rainbow.environment-qa/10',modelVersion=10,passed=True,actualTowerRun=True,
               tmd=tmd['validation'],globalDynamicForceBalance=dyn['maximumDynamicForceResidual'],dissipation=dict(relativeDashpotMonotonic=bool(np.all(np.diff(trace['dissipatedEnergy_J'])>=-1e-8)),massRayleighMonotonic=bool(np.all(np.diff(rayleigh_energy)>=-1e-8))),
               units=dict(force='N',length='m',energy='J',time='s'),pileRecomputed=False,pileScope=pile['couplingStatus'],
               sourceHashes=dict(environment=st.sha(out/'environment-response.json'),dynamic=st.sha(raw/'summary.json'),response=st.sha(out/'response.json'))))
    print('EXPORTED',out,summary['counts'],summary['shellLimits'],flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--model',default='coarse');run(ap.parse_args())
