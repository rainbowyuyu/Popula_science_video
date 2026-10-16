"""Actual isolated Zwind/OpenSees static cases and cut-force equilibrium.

This is teaching-derived Shanghai Tower geometry, not the 53,006-node
original-author model. No production JSON, source or audio is written.
"""
from pathlib import Path
from datetime import datetime, timezone
import copy, hashlib, importlib.util, json, math, os, sys, time, traceback
import numpy as np

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'research/physics-v9/results'
FROZEN=ROOT/'research/physics-v8/recompute/frozen-project'
ROLES=['core','megacolumn','cornercolumn','outrigger','belt']
NAMES=['Vx_N','N_N','Vz_N','Mx_Nm','My_Nm','Mz_Nm']

def stamp():return datetime.now(timezone.utc).isoformat()
def sha(path):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def save(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n','utf-8')
def values(v):return {k:round(float(x),6) for k,x in zip(NAMES,v)}
def load_frozen():
    evidence=json.loads((ROOT/'research/physics-v8/recompute/input-manifest.json').read_text('utf-8'))
    for item in evidence['inputs']:
        assert sha(ROOT/'research/physics-v8/recompute'/item['frozen'])==item['sha256']
    for name,digest in evidence['backend'].items():assert sha(name)==digest
    path=FROZEN/'scripts/physics/run_zwind.py'
    spec=importlib.util.spec_from_file_location('v9_frozen_tower',path)
    tower=importlib.util.module_from_spec(spec);spec.loader.exec_module(tower)
    return tower,evidence
def current_production_hashes():
    lock=json.loads((ROOT/'research/visual/v8-production-lock4.json').read_text('utf-8'))
    return {name:sha(ROOT/name) for name in lock['files']}
def protect_production_writes():
    protected=[(ROOT/name).resolve() for name in ['src','public']]
    def in_production(value):
        if not isinstance(value,(str,bytes,os.PathLike)):return False
        path=Path(os.fsdecode(value)).resolve()
        return any(path.is_relative_to(directory) for directory in protected)
    def audit(event,args):
        if event=='open':
            path,mode,flags=args
            writing=any(c in (mode or '') for c in 'wxa+') or bool(flags & (os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND))
            if writing and in_production(path):raise RuntimeError('Refuse production write: '+str(path))
        if event in ('os.remove','os.rmdir','os.mkdir','os.rename','os.replace'):
            if any(in_production(x) for x in args[:2]):raise RuntimeError('Refuse production mutation: '+event)
    sys.addaudithook(audit)
def global_end_forces(ops,members):
    forces=[]
    for m in members:
        f=list(ops.eleForce(m['tag']))
        if len(f)==6:f=f[:3]+[0.,0.,0.]+f[3:]+[0.,0.,0.]
        if len(f)!=12:raise RuntimeError('Unexpected global element force length for '+m['id'])
        forces.append(f)
    return np.array(forces,dtype=float)
def cut_results(g,nodes,members,forces,loads):
    by={n['id']:n for n in nodes};result=[]
    for lower,upper in zip(g['heights'][:-1],g['heights'][1:]):
        y=(lower+upper)/2;origin=np.array([0.,y,0.]);groups={role:np.zeros(6) for role in ROLES};ids=[]
        for m,f in zip(members,forces):
            i,j=[by[k] for k in m['nodeIds']]
            if (i['level']-y)*(j['level']-y)>=0:continue
            high,index=(i,0) if i['level']>y else (j,6)
            end=f[index:index+6].copy()
            end[3:]+=np.cross(np.array(high['xyz'])-origin,end[:3])
            groups[m['role']]+=end;ids.append(m['id'])
        total=sum(groups.values(),np.zeros(6));external=np.zeros(6)
        for n in nodes:
            if n['level']<=y:continue
            force=loads[n['id']];external[:3]+=force
            external[3:]+=np.cross(np.array(n['xyz'])-origin,force)
        result.append(dict(y_m=y,levelBelow_m=lower,levelAbove_m=upper,
                           total=total,bySystem=groups,appliedAbove=external,
                           residual=total-external,cutMemberIds=ids))
    return result
def floor_results(tower,g,nodes,state,gravity):
    core={round(n['level'],6):(i,n) for i,n in enumerate(nodes) if n['role']=='core'}
    heights=sorted(set([0.,*g['floorHeights']]))
    floors=[];previous=None
    for y in heights:
        i,n=core[round(y,6)];u=state['u'][i];du=u-gravity['u'][i]
        item=dict(y_m=y,coreNodeId=n['id'],xyz_m=n['xyz'],displacement_m=np.round(u,10).tolist(),
                  windDisplacement_m=np.round(du,10).tolist())
        if previous:
            h=y-previous['y_m'];prior=np.array(previous['windDisplacement_m'])
            item.update(storyHeight_m=h,driftX=float((du[0]-prior[0])/h),driftZ=float((du[2]-prior[2])/h),
                        relativeX_m=float(du[0]-prior[0]),relativeZ_m=float(du[2]-prior[2]))
        else:item.update(storyHeight_m=0.,driftX=0.,driftZ=0.,relativeX_m=0.,relativeZ_m=0.)
        floors.append(item);previous=item
    return floors
def serialize_cuts(cuts,gravity):
    data=[]
    for cut,base in zip(cuts,gravity):
        data.append(dict(y_m=cut['y_m'],levelBelow_m=cut['levelBelow_m'],levelAbove_m=cut['levelAbove_m'],
            total=values(cut['total']),windIncrement=values(cut['total']-base['total']),
            bySystem={role:dict(total=values(cut['bySystem'][role]),windIncrement=values(cut['bySystem'][role]-base['bySystem'][role])) for role in ROLES},
            appliedAbove=values(cut['appliedAbove']),appliedWindAbove=values(cut['appliedAbove']-base['appliedAbove']),
            balanceResidual=values(cut['residual']),cutMemberIds=cut['cutMemberIds']))
    return data
def main():
    started=stamp();OUT.mkdir(parents=True,exist_ok=True);raw=OUT/'raw';raw.mkdir(exist_ok=True)
    protect_production_writes()
    before=current_production_hashes();tower,evidence=load_frozen();g=tower.graph()
    save(OUT/'production-before.json',before)
    ops,dll=tower.load_backend();ops.logFile(str(OUT/'opensees.log'),'-noEcho')
    benchmark=tower.verification(ops);assert benchmark['passed']
    print('V9 BACKEND',ops.version(),sys.version,flush=True)
    print('V9 GRAPH',len(g['nodes']),len(g['members']),len(g['heights']),flush=True)
    save(OUT/'structural-graph.json',g)
    definitions=[('wind-x',0.,1.,True),('wind-45',45.,1.,True),('wind-z',90.,1.,True),
                 ('wind-x-no-outriggers',0.,1.,False),('wind-x-half',0.,.5,True),('wind-x-reversed',180.,1.,True)]
    results=[];cache={};checks=[]
    for caseid,angle,factor,with_outriggers in definitions:
        begin=time.monotonic();casegraph=copy.deepcopy(g)
        if not with_outriggers:casegraph['members']=[m for m in casegraph['members'] if m['role']!='outrigger']
        direction=np.array([math.cos(math.radians(angle)),0.,math.sin(math.radians(angle))])
        for w in casegraph['windLoads']:w['force']=(np.linalg.norm(w['force'])*factor*direction).tolist()
        key=with_outriggers
        if key not in cache:
            nodes,members,gravity,eqg=tower.static_case(ops,casegraph)
            gravity_global=global_end_forces(ops,members)
            gravity_loads={n['id']:np.array(n['gravityLoad']) for n in nodes}
            gravity_cuts=cut_results(casegraph,nodes,members,gravity_global,gravity_loads)
            cache[key]=(gravity,gravity_global,gravity_cuts,eqg)
        gravity,gravity_global,gravity_cuts,eqg=cache[key]
        nodes,members,state,eq=tower.static_case(ops,casegraph,wind=True)
        global_forces=global_end_forces(ops,members)
        loads={n['id']:np.array(n['gravityLoad']) for n in nodes}
        for w in casegraph['windLoads']:loads[w['nodeId']]+=w['force']
        cuts=cut_results(casegraph,nodes,members,global_forces,loads)
        residual=np.array([c['residual'] for c in cuts]);windres=np.array([c['residual']-b['residual'] for c,b in zip(cuts,gravity_cuts)])
        external=np.array([c['appliedAbove'] for c in cuts]);windexternal=np.array([c['appliedAbove']-b['appliedAbove'] for c,b in zip(cuts,gravity_cuts)])
        force_scale=max(1,np.max(abs(windexternal[:,:3])));moment_scale=max(1,np.max(abs(windexternal[:,3:])))
        rel_force=float(np.max(abs(windres[:,:3]))/force_scale);rel_moment=float(np.max(abs(windres[:,3:]))/moment_scale)
        maxforce=float(np.max(abs(residual[:,:3])));maxmoment=float(np.max(abs(residual[:,3:])))
        tolerance=np.array([2.,2.,2.,200.,200.,200.])
        total_cut_pass=bool(np.all(abs(residual)<=tolerance+1e-7*abs(external)))
        wind_cut_pass=bool(np.all(abs(windres)<=tolerance+1e-7*abs(windexternal)))
        passed=eq['relativeForceResidual']<1e-6 and eq['relativeMomentResidual']<1e-6 and rel_force<1e-7 and rel_moment<1e-7 and total_cut_pass and wind_cut_pass
        assert passed,(caseid,rel_force,rel_moment,eq)
        assert all(np.isfinite(a).all() for a in [global_forces,state['u'],state['r'],state['axialMPa']])
        modes=2*np.pi/np.sqrt(np.array(ops.eigen(4)))
        wind_u=state['u']-gravity['u'];wind_f=global_forces-gravity_global
        np.savez_compressed(raw/(caseid+'.npz'),node_displacement=state['u'],node_rotation=state['r'],
             wind_displacement=wind_u,global_element_forces=global_forces,wind_global_element_forces=wind_f,
             local_element_forces=state['localForces'],axialMPa=state['axialMPa'],wind_axialMPa=state['axialMPa']-gravity['axialMPa'])
        data=dict(id=caseid,directionDeg=angle,directionXYZ=direction.tolist(),loadFactor=factor,
            loadType='prescribed-static-wind',withOutriggers=with_outriggers,solverSteps=10,solverConverged=True,
            windReferenceHeight_m=500.,windReferenceSpeed_m_s=30.,modalPeriods_s=modes.tolist(),
            nodeIds=[n['id'] for n in nodes],memberIds=[m['id'] for m in members],
            nodeWindDisplacement_m=np.round(wind_u,9).tolist(),nodeWindRotation_rad=np.round(state['r']-gravity['r'],10).tolist(),
            memberWindAxial_N=np.round((state['axialMPa']-gravity['axialMPa'])*np.array([m['section']['A'] for m in members])*1e6,3).tolist(),
            windLoads=casegraph['windLoads'],cuts=serialize_cuts(cuts,gravity_cuts),floors=floor_results(tower,casegraph,nodes,state,gravity),
            equilibrium=dict(globalBalance=eq,gravityBalance=eqg,maxCutForceResidual_N=maxforce,maxCutMomentResidual_Nm=maxmoment,
                relativeWindCutForceResidual=rel_force,relativeWindCutMomentResidual=rel_moment,allCutsPassed=passed,
                tolerance={'formula':'abs(residual component) <= absolute + 1e-7*abs(applied component), for total and wind-only independently',
                           'absoluteForce_N':2.,'absoluteMoment_Nm':200.,'relative':1e-7,
                           'globalForceRelative':1e-6,'globalMomentRelative':1e-6}),
            peakWindDisplacement_m=float(np.max(np.linalg.norm(wind_u,axis=1))))
        results.append(data);save(OUT/'cases'/(caseid+'.json'),data)
        checks.append(dict(caseId=caseid,passed=passed,relativeWindCutForceResidual=rel_force,relativeWindCutMomentResidual=rel_moment))
        print('V9 CASE',caseid,'seconds',round(time.monotonic()-begin,2),'peak',data['peakWindDisplacement_m'],'cut-residual',rel_force,rel_moment,flush=True)
    base,half,reverse=[next(c for c in results if c['id']==name) for name in ['wind-x','wind-x-half','wind-x-reversed']]
    u=np.array(base['nodeWindDisplacement_m']);u_half=np.array(half['nodeWindDisplacement_m']);u_reverse=np.array(reverse['nodeWindDisplacement_m'])
    half_error=float(np.max(abs(u_half-u*.5)));reverse_error=float(np.max(abs(u_reverse+u)))
    assert half_error<2e-8 and reverse_error<2e-8
    after=current_production_hashes();save(OUT/'production-after.json',after)
    external_changes=[name for name in before if before[name]!=after[name]]
    # Other agents may edit production visuals concurrently. This process has
    # an active write-denying audit hook and all actual solve inputs are frozen.
    for item in evidence['inputs']:
        assert sha(ROOT/'research/physics-v8/recompute'/item['frozen'])==item['sha256']
    for name,digest in evidence['backend'].items():assert sha(name)==digest
    provenance=dict(startedAtUTC=started,finishedAtUTC=stamp(),modelKind='teaching-derived',originalShanghaiTowerInputObtained=False,
        backend='Local Zwind wrapper over OpenSees',solverVersion=ops.version(),python=sys.version,
        scriptSHA256=sha(__file__),frozenTowerScriptSHA256=sha(FROZEN/'scripts/physics/run_zwind.py'),
        backendFiles=evidence['backend'],graphSHA256=sha(OUT/'structural-graph.json'),frozenSolveInputsUnchanged=True,
        productionWriteAuditGuardActive=True,productionInputsUnchanged=not external_changes,
        concurrentExternalProductionChanges=external_changes,observedProductionInputCount=len(before),productionHashesBefore=before)
    output=dict(schema='rainbow.shanghai-sections/1',modelKind='teaching-derived',coordinates='Three Y-up',
        units={'length':'m','force':'N','moment':'N m','rotation':'rad','drift':'dimensionless'},
        structure=dict(nodeCount=len(g['nodes']),memberCount=len(g['members']),height_m=580.,visibleCrownHeight_m=632.,
          nodes=[dict(id=n['id'],xyz_m=n['xyz'],role=n['role'],meshIds=n['meshIds']) for n in g['nodes']],
          members=[dict(id=m['id'],nodeIds=m['nodeIds'],role=m['role'],meshIds=m['meshIds']) for m in g['members']]),
        semantics={'sectionResultants':'Sum OpenSees global resisting forces on upper endpoints of all members crossing a horizontal plane, with moments translated to (0,y,0); equals external loads above the cut.',
          'N_N':'Global Y force; gravity is negative. This is a cut free-body convention, not the individual member tension-positive convention.',
          'windIncrement':'Combined gravity+static wind minus a separately converged gravity state of the same topology.',
          'bySystem':'Signed additive force/moment contributions; a subsystem can oppose another. Do not clamp negative contributions or normalize per frame.',
          'staticPlayback':'A displayed multiplier may scale windIncrement only and is a quasi-static load ramp, not a dynamic time-history sample.',
          'storyDrift':'Difference in wind displacement of core diaphragm nodes at successive reconstructed floor elevations, divided by actual separation.',
          'existingDynamicData':'Separate production dynamic histories use a distinct prescribed gust and TMD model; these static cases do not share their time clock.'},
        cases=results,validation=dict(cantileverBenchmark=benchmark,caseChecks=checks,halfLoadDisplacementError_m=half_error,
          reverseLoadDisplacementError_m=reverse_error,passed=True),provenance=provenance,
        scope=g['scope']+['No original author/as-built Shanghai Tower input acquired. All cases are real solves of the documented teaching-derived model.',
          'Oblique wind cases rotate the prescribed resultant; no new CFD or aerodynamic direction coefficients are inferred.',
          'No-outrigger case removes outrigger truss elements while retaining belts and rigid diaphragm/core links; this is a controlled pedagogical topology comparison.'])
    save(OUT/'structural-sections.json',output)
    save(OUT/'run-summary.json',dict(provenance=provenance,validation=output['validation'],cases=[{k:c[k] for k in ['id','directionDeg','loadFactor','withOutriggers','peakWindDisplacement_m','modalPeriods_s','equilibrium']} for c in results],
          outputFile=str(OUT/'structural-sections.json'),outputSHA256=sha(OUT/'structural-sections.json')))
    ops.wipe();print('V9 COMPLETE',OUT/'structural-sections.json',flush=True)

if __name__=='__main__':
    try:main()
    except BaseException:
        OUT.mkdir(parents=True,exist_ok=True);(OUT/'failed-run.txt').write_text(traceback.format_exc(),'utf-8');raise
