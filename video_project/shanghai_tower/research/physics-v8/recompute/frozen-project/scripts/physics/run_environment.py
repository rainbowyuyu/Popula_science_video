"""Supplementary, actually executed Zwind/OpenSees cases; never overwrites frozen tower response."""
from pathlib import Path
import datetime, hashlib, json, math, sys
import numpy as np
import run_zwind as tower

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/physics'
RAW = OUT / 'raw/environment'
G = 9.80665

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def rounded(value, digits=8):
    return np.round(np.asarray(value), digits).tolist()

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf8')

def coupled_tmd(ops, graph, frozen):
    """Re-executes the exact frozen 60-s coupled case and exports previously omitted DOFs."""
    nodes, members, gravity, eq = tower.static_case(ops, graph)
    ops.loadConst('-time', 0.)
    eigenvalues = np.array(ops.eigen(4)); omega = np.sqrt(eigenvalues)
    zeta = tower.ASSUMPTIONS['damping_ratio']; w1, w2 = omega[0], omega[2]
    top = next(n for n in nodes if n['role']=='core' and abs(n['level']-tower.PARAM['occupied_top'])<1e-5)
    tag = max(n['tag'] for n in nodes)+1; mass=tower.ASSUMPTIONS['tmd_mass_kg']
    spring=mass*w1*w1; dashpot=2*tower.ASSUMPTIONS['tmd_damping_ratio_assumed']*mass*w1
    element=max(m['tag'] for m in members)+1
    ops.node(tag,*top['xyz']); ops.mass(tag,mass,1e-5,1e-5,1e-5,1e-5,1e-5)
    ops.mass(top['tag'],max(1e-3,top['mass']-mass),top['mass'],top['mass'],1e-5,1e-5,1e-5)
    ops.equalDOF(top['tag'],tag,2,3,4,5,6)
    ops.uniaxialMaterial('Elastic',11,spring); ops.uniaxialMaterial('Viscous',12,dashpot,1.)
    ops.uniaxialMaterial('Parallel',13,11,12)
    ops.element('zeroLength',element,top['tag'],tag,'-mat',13,'-dir',1)
    am=2*zeta*w1*w2/(w1+w2); bk=2*zeta/(w1+w2); ops.rayleigh(am,0,bk,0)
    dt=.05; duration=60.; time=np.arange(round(duration/dt)+1)*dt
    ramp=np.clip(time/10,0,1); ramp=ramp*ramp*(3-2*ramp)
    factors=ramp*(1+.12*np.sin(2*np.pi*.11*time)+.07*np.sin(2*np.pi*.19*time+.7)+.045*np.sin(2*np.pi*.043*time+1.1))
    ops.timeSeries('Path',2,'-dt',dt,'-values',*factors.tolist()); ops.pattern('Plain',2,2)
    by={n['id']:n for n in nodes}
    for load in graph['windLoads']:
        ops.load(by[load['nodeId']]['tag'],*load['force'],0,0,0)
    ops.wipeAnalysis(); ops.constraints('Transformation'); ops.numberer('RCM'); ops.system('UmfPack')
    ops.test('NormUnbalance',1e-4,20); ops.algorithm('Linear'); ops.integrator('Newmark',.5,.25); ops.analysis('Transient')
    core_indices=[i for i,n in enumerate(nodes) if n['role']=='core']; core_nodes=[nodes[i] for i in core_indices]
    core_member_indices=[i for i,m in enumerate(members) if m['role']=='core']
    core_members=[members[i] for i in core_member_indices]
    core_stress={'time':[0.],'extremeMPa':[np.zeros(len(core_members)).tolist()],
        'axialMPa':[np.zeros(len(core_members)).tolist()],
        'momentY_Nm':[np.zeros((len(core_members),2)).tolist()],
        'momentZ_Nm':[np.zeros((len(core_members),2)).tolist()]}
    top_index=next(i for i,n in enumerate(nodes) if n['id']==top['id'])
    names=['supportX_m','massX_m','relativeX_m','supportVelocityX_m_s','massVelocityX_m_s',
           'relativeVelocityX_m_s','supportAccelerationX_m_s2','massAccelerationX_m_s2',
           'springForceOnSupport_N','damperForceOnSupport_N','forceOnSupport_N',
           'massRayleighForce_N','massForceResidual_N','dissipatedEnergy_J']
    fields={n:[0.] for n in names}; node_u=[np.zeros((len(core_nodes),3)).tolist()]
    compare_u=[]; compare_stress=[]; compare_tmd=[]; raw_forces=[[0.]*12]
    energy=0.; previous_power=0.
    for i in range(1,len(time)):
        code=ops.analyze(1,dt)
        if code: raise RuntimeError(f'Coupled TMD failed at {time[i]} s: {code}')
        su=float(ops.nodeDisp(top['tag'],1)); mu=float(ops.nodeDisp(tag,1))
        sv=float(ops.nodeVel(top['tag'],1)); mv=float(ops.nodeVel(tag,1))
        sa=float(ops.nodeAccel(top['tag'],1)); ma=float(ops.nodeAccel(tag,1))
        rel=mu-su; relv=mv-sv; sf=spring*rel; df=dashpot*relv
        ef=np.asarray(ops.eleForce(element),float); raw_forces.append(ef.tolist())
        rayleigh_force=-am*mass*mv
        residual=mass*ma+ef[6]-rayleigh_force
        power=dashpot*relv*relv; energy+=(power+previous_power)*dt/2;previous_power=power
        values=[su-gravity['u'][top_index,0],mu,rel,sv,mv,relv,sa,ma,sf,df,-ef[0],rayleigh_force,residual,energy]
        for n,v in zip(names,values):fields[n].append(float(v))
        node_u.append((np.asarray([ops.nodeDisp(n['tag'])[:3] for n in core_nodes])-gravity['u'][core_indices]).tolist())
        if i%20==0:
            actual=tower.state(ops,nodes,members); j=i//20-1
            compare_u.append(float(np.max(np.abs(actual['u']-gravity['u']-np.asarray(frozen['dynamic']['u'][j])))))
            compare_stress.append(float(np.max(np.abs(actual['axialMPa']-gravity['axialMPa']-np.asarray(frozen['dynamic']['axialMPa'][j])))))
            compare_tmd.append(abs(rel-frozen['dynamic']['tmd']['relativeX_m'][j]))
            dforces=actual['localForces'][core_member_indices]-gravity['localForces'][core_member_indices]
            my=np.column_stack((-dforces[:,4],dforces[:,10]));mz=np.column_stack((-dforces[:,5],dforces[:,11]))
            normal=(dforces[:,6]-dforces[:,0])/2;extreme=[];axial=[]
            for k,m in enumerate(core_members):
                sec=m['section'];axial.append(normal[k]/sec['A']/1e6)
                extreme.append(float(np.max(abs(normal[k]/sec['A'])+abs(my[k])*sec['cz']/sec['Iy']+abs(mz[k])*sec['cy']/sec['Iz']))/1e6)
            core_stress['time'].append(float(time[i]));core_stress['extremeMPa'].append(extreme);core_stress['axialMPa'].append(axial)
            core_stress['momentY_Nm'].append(my.tolist());core_stress['momentZ_Nm'].append(mz.tolist())
        if i%200==0:print('TMD export',time[i],flush=True)
    residual=np.asarray(fields['massForceResidual_N'])
    force_scale=max(1,float(np.max(np.abs(fields['forceOnSupport_N']))))
    checks={'failedSteps':0,'maxFrozenDisplacementDifference_m':max(compare_u),
        'maxFrozenAxialStressDifference_MPa':max(compare_stress),'maxFrozenTmdRelativeDifference_m':max(compare_tmd),
        'sameCaseWithinNumericalTolerance':max(compare_u)<1e-6 and max(compare_stress)<1e-4 and max(compare_tmd)<1e-6,
        'comparisonTolerance':{'displacement_m':1e-6,'axialStress_MPa':1e-4,'tmdRelative_m':1e-6},
        'massEquationMaxResidual_N':float(np.max(abs(residual))),
        'massEquationRelativeResidual':float(np.max(abs(residual)))/force_scale,
        'springDashpotVsElementMaxDifference_N':float(np.max(abs(np.asarray(fields['springForceOnSupport_N'])+np.asarray(fields['damperForceOnSupport_N'])-np.asarray(fields['forceOnSupport_N'])))),
        'dissipatedEnergyMonotonic':bool(np.all(np.diff(fields['dissipatedEnergy_J'])>=-1e-8))}
    assert checks['sameCaseWithinNumericalTolerance'], checks
    assert checks['massEquationRelativeResidual']<1e-6, checks
    np.savez_compressed(RAW/'coupled-tmd-all-steps.npz',time=time,nodeU=np.asarray(node_u),elementResistingForce_N=np.asarray(raw_forces),**{k:np.asarray(v) for k,v in fields.items()})
    return {'time':rounded(time,6),'dt':dt,'nodeIds':[n['id'] for n in core_nodes],
        'nodeXYZ_m':[n['xyz'] for n in core_nodes],'nodeU':rounded(node_u,8),
        'supportNodeId':top['id'],'supportXYZ_m':top['xyz'],**{k:rounded(v,8 if '_N' not in k and '_J' not in k else 5) for k,v in fields.items()},
        'windFactor':rounded(factors,8),
        'windLoads':{'nodeIds':[w['nodeId'] for w in graph['windLoads']],
            'nodeXYZ_m':[by[w['nodeId']]['xyz'] for w in graph['windLoads']],
            'baseForce_N':[w['force'] for w in graph['windLoads']],
            'semantics':'Applied net nodal wind load = baseForce_N * windFactor at matching time; not local facade pressure. Coordinates are rest positions; attach arrows to displaced nodes.'},
        'mass_kg':mass,'spring_N_m':spring,'dashpot_Ns_m':dashpot,
        'equivalentPendulumLength_m':G/w1**2,'modalPeriods_s':rounded(2*np.pi/omega,8),
        'coreWindSection':{**{k:rounded(v,8 if k in ['time','extremeMPa','axialMPa'] else 4) for k,v in core_stress.items()},
            'memberIds':[m['id'] for m in core_members],
            'nodeIds':[m['nodeIds'] for m in core_members],
            'sections':[m['section'] for m in core_members],
            'localAxes':'member localX=global+Y, localY=global-X, localZ=global+Z for vertical core beams',
            'semantics':'Wind-only local end-force differences from gravity, separately extracted in the actual coupled solve. moment arrays[end0,end1] are internal section moments with sign aligned along member.',
            'formula':'sigma(x,z)=N/A + Mz*x/Iz + My*z/Iy; extremeMPa=max over both ends(abs(N/A)+abs(My)*cz/Iy+abs(Mz)*cy/Iz)/1e6',
            'scope':'Equivalent core section nominal normal stress envelope, not local wall/steel/connection stress. Extreme magnitude is unsigned; use a separate magnitude legend.'},
        'rayleigh':{'alphaM':am,'betaKinit':bk,'structuralDampingRatio':zeta},
        'semantics':{'nodeU':'Wind-induced displacement from gravity equilibrium, only core levels. Other members and signed stresses may use frozen response.dynamic at the identical physical time, verified numerically.',
            'relativeX_m':'Mass displacement minus support displacement; add to rest mass geometry; never synthesize sine motion.',
            'forceOnSupport_N':'Physical force exerted by spring+dashpot on tower support, positive +X. Opposite acts on mass.',
            'massRayleighForce_N':'Additional inherited Rayleigh mass-proportional damping force against absolute mass velocity; included in equilibrium.',
            'dissipatedEnergy_J':'Cumulative c*v_relative^2 integrated by trapezoids; no generated oscillation or fabricated phase delay.'},
        'assumptions':['Mass1000 metric tonnes sourced from Wu2021. Spring tuned to current equivalent tower mode; internal8% damper ratio assumed.',
            'Support is equivalent structural-top node at580m. This is a coordinate mapping, not recovered floor125 mounting geometry.',
            'Same prescribed illustrative U500=30m/s gust as frozen tower response; no CFD pressures.',
            'Linear single horizontal DOF; sway amplitude must be disclosed if visually magnified.'],'validation':checks}

def pile_case(ops):
    """2D elastic beam with explicit side shear/lateral springs and toe spring."""
    length=52.;diameter=1.;area=math.pi*diameter**2/4;inertia=math.pi*diameter**4/64;E=32e9;rho=2500.
    # The stratigraphic labels/ground-depth bounds are from Zhu Table1. Stiffnesses are expressly assumed.
    layers=[{'id':'L71','name':'砂质粉土与粉砂','depthRangeBelowGrade_m':[29.,37.],'shaftTangent_N_m3':4e6,'lateral_N_m2':8e6},
        {'id':'L72','name':'粉砂','depthRangeBelowGrade_m':[37.,64.4],'shaftTangent_N_m3':9e6,'lateral_N_m2':18e6},
        {'id':'L73','name':'粉砂','depthRangeBelowGrade_m':[64.4,69.2],'shaftTangent_N_m3':13e6,'lateral_N_m2':28e6},
        {'id':'L91','name':'砂质粉土','depthRangeBelowGrade_m':[69.2,78.2],'shaftTangent_N_m3':12e6,'lateral_N_m2':24e6},
        {'id':'L921','name':'粉砂持力层','depthRangeBelowGrade_m':[78.2,89.4],'shaftTangent_N_m3':18e6,'lateral_N_m2':40e6}]
    upper_layers=[{'id':id,'name':name,'depthRangeBelowGrade_m':[lo,hi],'role':'contextOnlyAbovePileHead'} for id,name,lo,hi in [
        ('L1','填土',0.,2.2),('L2','粉质黏土',2.2,3.8),('L3','软弱粉质黏土',3.8,9.),
        ('L4','淤泥质黏土',9.,16.9),('L51a','黏土',16.9,20.6),('L51b','粉质黏土',20.6,24.8),('L6','粉质黏土',24.8,29.)]]
    # Keep the independent teaching pile aligned with the existing reconstruction.
    # Zhu's design datum implies31.4m; the display mesh uses33m from excavation
    # depth. The latter is an explicit model assumption, not a recovered as-built
    # pile-head elevation. Reassign springs against absolute source layer depths.
    head_depth=33.; depth=np.unique(np.round(np.r_[np.arange(0,length+1,1.),[x-head_depth for layer in layers for x in layer['depthRangeBelowGrade_m'] if 0<x-head_depth<length]],6))
    count=len(depth);toeK=220e6;headV=8e6;headH=.3e6
    ops.wipe();ops.model('basic','-ndm',2,'-ndf',3);ops.geomTransf('Linear',1)
    springmeta=[];fixed=[];weights=np.zeros(count)
    for i,d in enumerate(depth):
        tag=i+1;anchor=1000+i;ops.node(tag,0.,-float(d));ops.node(anchor,0.,-float(d));ops.fix(anchor,1,1,1);fixed.append(anchor)
        ground=head_depth+d;layer=next((l for l in layers if l['depthRangeBelowGrade_m'][0]<=ground<l['depthRangeBelowGrade_m'][1]),layers[-1])
        low=0 if i==0 else (depth[i-1]+d)/2;high=length if i==count-1 else (d+depth[i+1])/2;tributary=high-low
        ky=layer['shaftTangent_N_m3']*math.pi*diameter*tributary;kx=layer['lateral_N_m2']*tributary
        ops.uniaxialMaterial('Elastic',100+i*2,kx);ops.uniaxialMaterial('Elastic',101+i*2,ky)
        ops.element('zeroLength',1000+i,anchor,tag,'-mat',100+i*2,101+i*2,'-dir',1,2)
        springmeta.append({'nodeId':tag,'anchorTag':anchor,'elementTag':1000+i,'depthBelowPileHead_m':float(d),'depthBelowGrade_m':float(ground),
            'layerId':layer['id'],'tributaryLength_m':float(tributary),'lateralStiffness_N_m':float(kx),'shaftStiffness_N_m':float(ky)})
        if i>0:
            ops.element('elasticBeamColumn',i,i,i+1,area,E,inertia,1)
            w=(d-depth[i-1])*area*rho*G;weights[i-1]+=w/2;weights[i]+=w/2
    toe_anchor=2000;ops.node(toe_anchor,0.,-length);ops.fix(toe_anchor,1,1,1);fixed.append(toe_anchor)
    ops.uniaxialMaterial('Elastic',9000,toeK);ops.element('zeroLength',9000,toe_anchor,count,'-mat',9000,'-dir',2)
    ops.timeSeries('Linear',1);ops.pattern('Plain',1,1)
    for i,w in enumerate(weights):ops.load(i+1,headH if i==0 else 0.,-w-(headV if i==0 else 0.),0.)
    ops.constraints('Plain');ops.numberer('RCM');ops.system('BandGeneral');ops.algorithm('Linear');ops.integrator('LoadControl',.025);ops.analysis('Static')
    stages=[]
    for step in range(41):
        if step and ops.analyze(1):raise RuntimeError('Pile static load step failed')
        ops.reactions();factor=step/40
        u=np.asarray([ops.nodeDisp(i+1) for i in range(count)],float)
        side=np.asarray([ops.nodeReaction(s['anchorTag'])[:2] for s in springmeta],float)
        toe=np.asarray(ops.nodeReaction(toe_anchor)[:2],float)
        external=np.array([headH,-headV-weights.sum()])*factor;residual=side.sum(axis=0)+toe+external
        beamforces=np.asarray([ops.eleResponse(i,'localForce') for i in range(1,count)],float)
        # local x follows downward pile axis; tension-positive average end axial force.
        axial=(beamforces[:,3]-beamforces[:,0])/2
        externalmoment=-float(np.sum(np.asarray([0.]*count)))
        reactionmoment=sum(float(-depth[i])*float(-side[i,0]) for i in range(count))+length*toe[0]
        stages.append({'loadFactor':factor,'u_m':rounded(u[:,:2],9),'settlement_m':rounded(-u[:,1],9),
            'sideReactionOnPile_N':rounded(side,4),'toeReactionOnPile_N':rounded(toe,4),
            'sideShearStress_Pa':rounded(side[:,1]/np.array([s['tributaryLength_m']*math.pi*diameter for s in springmeta]),4),
            'axialForce_N':rounded(axial,4),'moment_Nm':rounded(beamforces[:,2],4),
            'equilibrium':{'appliedForce_N':external.tolist(),'soilReaction_N':(side.sum(axis=0)+toe).tolist(),'forceResidual_N':residual.tolist(),
                'relativeForceResidual':float(np.linalg.norm(residual)/max(1,np.linalg.norm(external))),
                'momentResidual_Nm':float(reactionmoment+externalmoment)}})
    maxres=max(s['equilibrium']['relativeForceResidual'] for s in stages)
    save(RAW/'pile-diagnostic.json',{'stages':stages,'maxres':maxres})
    assert maxres<1e-9, (maxres, max(stages,key=lambda s:s['equilibrium']['relativeForceResidual']))
    return {'kind':'independent single-pile elastic mechanism example','coordinates':'local X horizontal, Y upward; pile head is localY0',
        'loadFactor':[s['loadFactor'] for s in stages],'nodes':[{'id':i+1,'xyz_m':[0.,-float(d),0.]} for i,d in enumerate(depth)],
        'length_m':length,'diameter_m':diameter,'headDepthBelowGrade_m':head_depth,'E_Pa':E,'density_kg_m3':rho,
        'headVerticalLoad_N':headV,'headHorizontalLoad_N':headH,'pileSelfWeight_N':float(weights.sum()),'toeStiffness_N_m':toeK,
        'fullCaseScale':1.,'loadScope':'8MN axial+0.3MN lateral demonstration on ONE pile; not whole tower distributed load or capacity assessment',
        'soilLayers':upper_layers+layers,'springs':springmeta,'stages':stages,
        'reference':{'geometry':'Zhu designer manuscript p8: pile diameter1m, effective52–56m; p10 mat top−25.4m plus6m mat implies design pile-head31.4m depth. This independent teaching case uses33m to align the existing reconstruction and reassigns springs against the original absolute soil layer depths.',
            'stratigraphy':'Zhu Table1 PDFp8, public design-study soil labels/boundaries; selected stiffnesses are not geotechnical tests.'},
        'assumptions':['Pile head at33m is the existing reconstruction alignment, not an as-built elevation. The cited33m excavation depth does not establish the raft bottom. Zhu design datum31.4m is recorded separately; the52m pile ends at85m in this teaching case.',
            'All spring moduli, toe stiffness, E and applied loads are explicit teaching assumptions; no bearing-capacity or real settlement claim.',
            'Elastic springs carry signed side-shear and lateral reactions. No plasticity, gap, consolidation, group interaction or groundwater effective-stress solve.',
            'Soil layer geometry may be displayed around pile but the solver has beam+springs, not continuum soil-stress elements.',
            'Static loadFactor0..1 can be eased for animation; it is loading progress, not seconds of real consolidation.'],
        'validation':{'failedSteps':0,'maxRelativeForceResidual':maxres,'forceBalancePassed':True,
            'maximumMomentResidual_Nm':max(abs(s['equilibrium']['momentResidual_Nm']) for s in stages)}}

def stress_stats(frozen):
    stress=np.asarray(frozen['dynamic']['axialMPa']);u=np.asarray(frozen['dynamic']['u'])
    roles=sorted(set(m['role'] for m in frozen['members']));out={}
    for role in roles+['all']:
        idx=[i for i,m in enumerate(frozen['members']) if role=='all' or m['role']==role]
        values=stress[:,idx];a=abs(values).ravel()
        out[role]={'countMembers':len(idx),'minMPa':float(values.min()),'maxMPa':float(values.max()),
            'absPercentilesMPa':{str(p):float(np.percentile(a,p)) for p in [50,90,95,99,99.5,100]},
            'fixedFullRangeMPa':float(a.max()),'fixedP99RangeMPa':float(np.percentile(a,99))}
    return {'semantics':'Wind-induced signed axial stress increment, physical MPa; fixed ranges computed across all60 samples, not per-frame normalization.',
        'byMemberRole':out,'maxDisplacementNorm_m':float(np.linalg.norm(u,axis=2).max()),
        'recommendation':'Use a fixed role-specific scale for a labelled closeup. Never renormalize each frame; clipping to a percentile must be labelled. Color only solved structural members.'}

def main():
    RAW.mkdir(parents=True,exist_ok=True)
    graphpath=OUT/'structural-graph.json';responsepath=OUT/'response.json'
    before={p.name:sha(p) for p in [graphpath,responsepath]}
    graph=json.loads(graphpath.read_text('utf8'));frozen=json.loads(responsepath.read_text('utf8'))
    # Freeze inputs to the already executed graph, independent of concurrent geometry edits.
    tower.PARAM=dict(graph['parameters']);tower.ASSUMPTIONS=dict(graph['assumptions'])
    started=datetime.datetime.now(datetime.timezone.utc).isoformat();ops,dll=tower.load_backend()
    ops.logFile(str(RAW/'opensees-environment.log'),'-noEcho')
    benchmark=tower.verification(ops);assert benchmark['passed']
    cache=RAW/'coupled-tmd-export.json'
    if '--reuse-tmd' in sys.argv and cache.exists():
        saved=json.loads(cache.read_text('utf8'));assert saved['baseFiles']==before
        tmd=saved['tmd'];print('TMD reuse verified computed data',flush=True)
    else:
        tmd=coupled_tmd(ops,graph,frozen);save(cache,{'baseFiles':before,'tmd':tmd})
        print('TMD checked',tmd['validation'],flush=True)
    # Derive exact applied-force metadata from the frozen graph, including cached actual TMD runs.
    node_by_id={n['id']:n for n in graph['nodes']}
    tmd['windLoads']={'nodeIds':[w['nodeId'] for w in graph['windLoads']],
        'nodeXYZ_m':[node_by_id[w['nodeId']]['xyz'] for w in graph['windLoads']],
        'baseForce_N':[w['force'] for w in graph['windLoads']],
        'semantics':'Applied net nodal wind load = baseForce_N * windFactor. Attach arrows to the displaced application point, not arbitrary facade points.'}
    pile=pile_case(ops);print('PILE checked',pile['validation'],flush=True)
    stats=stress_stats(frozen);ops.wipe()
    after={p.name:sha(p) for p in [graphpath,responsepath]};assert before==after
    result={'schema':'rainbow.shanghai-environment/1','units':{'length':'m','force':'N','stress':'MPa except pile.sideShearStress_Pa','time':'s','mass':'kg'},
        'tmd':tmd,'pile':pile,'memberStressStats':stats,
        'flow':{'computedFieldAvailable':False,'currentStreamlineMeaning':'Flow-mechanism illustration only; no building CFD velocity or surface-pressure field was computed.',
            'actualWindForces':'tmd.windLoads.baseForce_N multiplied by tmd.windFactor; actually applied to OpenSees nodes.',
            'iwindStatus':'Local iwind project is a Remotion film/preview adapter; no runnable building-flow backend in this checkout.',
            'diffusionStatus':'Existing OC4 inverse surrogate is restricted to floating NREL5MW-OC4, not applicable to ShanghaiTower. No inference run claimed.'},
        'provenance':{'startedUTC':started,'finishedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'solver':'Actual local Zwind/os2zwind OpenSees3.8.0','binary':str(tower.ZWIND/'bin/opensees.pyd'),'binarySHA256':sha(tower.ZWIND/'bin/opensees.pyd'),
            'scriptSHA256':sha(__file__),'baseFiles':before,'baseFilesUnchanged':True,'python':sys.version},
        'validation':{'cantileverBenchmark':benchmark,'tmd':tmd['validation'],'pile':pile['validation']}}
    save(OUT/'environment-response.json',result)
    save(OUT/'environment-summary.json',{'provenance':result['provenance'],'validation':result['validation'],'tmdPeakRelative_m':max(abs(x) for x in tmd['relativeX_m']),
        'tmdPeakSupport_m':max(abs(x) for x in tmd['supportX_m']),'tmdPeakAcceleration_m_s2':max(abs(x) for x in tmd['massAccelerationX_m_s2']),
        'pileHeadSettlement_m':pile['stages'][-1]['settlement_m'][0],'pileToeReaction_N':pile['stages'][-1]['toeReactionOnPile_N'],
        'memberStressStats':stats,'environmentResponseSHA256':sha(OUT/'environment-response.json')})
    print('DONE',OUT/'environment-response.json',flush=True)

if __name__=='__main__':main()
