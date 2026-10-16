"""Compare independent rerun with production and report physical field contracts."""
from pathlib import Path
import json, hashlib, datetime
import numpy as np
from recompute import HERE,PROJECT,RESULTS,production,sha,save

def read(p):return json.loads(p.read_text('utf8'))
def comparison(x,y):
    a=np.asarray(x,float);b=np.asarray(y,float)
    assert a.shape==b.shape,(a.shape,b.shape)
    return dict(shape=list(a.shape),finite=bool(np.isfinite(a).all()),maxAbsoluteDifference=float(abs(a-b).max()),
       relativeL2=float(np.linalg.norm((a-b).ravel())/max(np.linalg.norm(b.ravel()),1e-30)))
def make():
    folder=RESULTS/'tower';r=read(folder/'response.json');b=read(PROJECT/'public/physics/response.json')
    env=read(folder/'environment-response.json');oldenv=read(PROJECT/'public/physics/environment-response.json')
    q=read(folder/'environment-qa.json');summary=read(folder/'run-summary.json');node_by_id={x['id']:x for x in r['nodes']}
    diffs={}
    for phase in ['gravity','windPlusGravity','windOnly']:
        for field in ['u','r','axialMPa','extremeMPa','localForces']:
            diffs[f'static.{phase}.{field}']=comparison(r['static'][phase][field],b['static'][phase][field])
    for i,(stage,baseline) in enumerate(zip(r['stages'],b['stages'])):
        assert stage['height']==baseline['height']
        for field in ['u','r','axialMPa','extremeMPa','localForces']:
            diffs[f'stage{i+1}.{field}']=comparison(stage[field],baseline[field])
    for field in ['u','r','axialMPa','extremeMPa','modalPeriods_s']:
        diffs[f'dynamic.{field}']=comparison(r['dynamic'][field],b['dynamic'][field])
    for field in ['supportX_m','massX_m','relativeX_m','forceOnSupport_N','dissipatedEnergy_J','nodeU']:
        diffs[f'extendedTmd.{field}']=comparison(env['tmd'][field],oldenv['tmd'][field])
    for field in ['extremeMPa','axialMPa','momentY_Nm','momentZ_Nm']:
        diffs[f'coreWindSection.{field}']=comparison(env['tmd']['coreWindSection'][field],oldenv['tmd']['coreWindSection'][field])
    checks={
       'cantileverBenchmarkPassed':r['validation']['cantileverBenchmark']['passed'],
       'gravityAndWindForceBalancePassed':r['validation']['gravityForceBalancePassed'] and r['validation']['windForceBalancePassed'],
       'allNineConstructionStages':len(r['stages'])==9,
       'allStageForceBalancePassed':all(s['equilibrium']['relativeForceResidual']<1e-9 for s in r['stages']),
       'twoDynamicRunsNoFailedSteps':r['dynamic']['convergence']['failedSteps']==0 and r['dynamic']['tmd']['withoutTMD']['failedSteps']==0,
       'extendedEnvironmentNineteenChecksPassed':q['allPassed'],
       'allComparedFieldsFinite':all(x['finite'] for x in diffs.values()),
       'repeatabilityRelativeL2Below1e-9':all(x['relativeL2']<1e-9 for x in diffs.values()),
       'productionInputsUnchanged':production()==read(HERE/'input-manifest.json')['productionBefore'],
    }
    t=env['tmd'];time=np.asarray(t['time']);core=t['coreWindSection'];coretime=np.asarray(core['time']);stress=np.asarray(core['extremeMPa']);ci=np.unravel_index(abs(stress).argmax(),stress.shape)
    tmd=r['dynamic']['tmd'];no=tmd['withoutTMD'];peaks={}
    for key in ['supportX_m','relativeX_m','supportAccelerationX_m_s2','forceOnSupport_N']:
        a=np.asarray(t[key]);i=int(abs(a).argmax());peaks[key]=dict(value=float(a[i]),time_s=float(time[i]))
    member_peaks=[]
    with np.load(folder/'raw/dynamic-all-steps.npz') as raw:
        windaxial=raw['axialMPa']-np.asarray(r['static']['gravity']['axialMPa'])[None,:]
        for role in sorted({m['role'] for m in r['members']}):
            if role=='core':continue
            inds=[i for i,m in enumerate(r['members']) if m['role']==role]
            a=windaxial[:,inds];ti,mi=np.unravel_index(abs(a).argmax(),a.shape);m=r['members'][inds[mi]]
            mid=np.mean([node_by_id[k]['xyz'] for k in m['nodeIds']],axis=0)
            member_peaks.append(dict(role=role,memberId=m['id'],meshIds=m['meshIds'],
               position_m=mid.tolist(),time_s=float(raw['time'][ti]),windAxialIncrementMPa=float(a[ti,mi]),
               colorMeaning='signed axial stress increment, not total tension; core bending must use coreWindSection'))
    core_member=next(m for m in r['members'] if m['id']==core['memberIds'][ci[1]])
    member_peaks.append(dict(role='core',memberId=core_member['id'],meshIds=core_member['meshIds'],
       position_m=np.mean([node_by_id[k]['xyz'] for k in core_member['nodeIds']],axis=0).tolist(),
       time_s=float(coretime[ci[0]]),windBendingNormalStressEnvelopeMPa=float(stress[ci]),
       colorMeaning='section bending normal-stress envelope; the core net wind axial increment is zero in this symmetric equivalent model'))
    pilepath=RESULTS/'pile/validation.json';pile=None
    if pilepath.exists() and (RESULTS/'pile/fine-clock-qa.json').exists():
        pile=read(pilepath);previous=read(PROJECT/'research/physics-v7/pile/validation.json')
        checks['pileMeshAndTimeConvergencePassed']=pile['passed'] and pile['selectedMeshTimeStep']['passed']
        checks['pileDynamicForceAndEnergyPassed']=pile['base']['relativeEquationResidual']<1e-7 and pile['base']['energyRelativeResidual']<1e-7
        for key in ['peakHeadLateral_mm','headStaticSettlement_mm','maxAbsMoment_kNm','maxAbsShear_kN','firstFrequencies_Hz']:
            diffs[f'pile.{key}']=comparison(pile['base'][key],previous['base'][key])
    report=dict(createdUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),
       officialShanghaiTowerInputObtained=False,sourceFinding=str(HERE/'discovery/SOURCE_FINDINGS.md'),
       modelKind='Executed frozen teaching equivalent model, not official/as-built Shanghai Tower model',
       resultsRoot=str(RESULTS),counts=summary['counts'],checks=checks,
       complete=pile is not None,allChecksPassed=all(checks.values()) and pile is not None,
       comparison=diffs,
       tower=dict(modalPeriods_s=r['dynamic']['modalPeriods_s'],gravity_N=summary['totalGravity_N'],
          maxStaticWindDisplacement_m=summary['peakWindDisplacement_m'],
          dynamicPeaks=peaks,windBaseShear_N=float(np.asarray(t['windLoads']['baseForce_N'])[:,0].sum()),
          tmdPeakTopReductionFraction=1-tmd['peakAbsTopX_m']/no['peakAbsTopX_m'],
          tmdRmsTopReductionFraction=1-tmd['rmsAfterRamp_m']/no['rmsAfterRamp_m'],
          coreWindBendingNormalStressPeak=dict(valueMPa=float(stress[ci]),memberId=core['memberIds'][ci[1]],time_s=float(coretime[ci[0]])),
          environmentQA=q,fullTimeMemberPeaks=member_peaks),pile=pile,
       literatureComparison=dict(source='Lu et al. author lecture, PDF p9; not a calibration target established by this task',
          authorModelNodes=53006,authorPeriods_s=[9.5238,9.4518,4.6847],
          currentFirstPeriodDifferenceFraction=r['dynamic']['modalPeriods_s'][0]/9.5238-1,
          caution='Modal ordering must be verified by shapes. Third author mode is torsion; the equivalent model third eigenvalue cannot be compared by index alone. Period proximity does not validate unknown member sections.'),
       limitations=[
         'Fixed-base linear beam/truss teaching model; no as-built calibration, cracking, yield, buckling, soil-structure interaction, creep or locked construction stress.',
         'Tower is driven by prescribed power-law wind loads and deterministic gusts, not by the separately computed OpenFOAM surface pressures.',
         'The separate CFD was not recomputed in this task. Its accepted scope remains educational mean-flow visualization, not converged design-grade or coupled forces.',
         'Pile is an independent 52m x 1m linear Winkler beam; soil color can represent interface reactions only, not continuum soil stress.',
         'No compatible Diffusion inverse checkpoint exists for this model; no inference or inverse-load result is claimed.',
         'Only 705 semantic rendered parts map to solved members; 282 teaching geometry parts have no independent stress solution.',
         'TMD spring is tuned to this equivalent model and 8% internal damping is assumed. Peak/RMS reductions apply only to this synthetic 60s load record.',
       ])
    save(HERE/'recompute-report.json',report)
    save(HERE/'visualization-contract.json',dict(
       schema='rainbow.shanghai-physics-v8/1',resultsRoot=str(RESULTS),
       keepCurrentProductionNumbers=all(x['maxAbsoluteDifference']==0 for x in diffs.values()),
       fieldRules=[
         'Wind load arrows originate at displaced windLoads.nodeXYZ_m positions and point along baseForce_N * windFactor; no facade pressure units on net nodal-force arrows.',
         'Use fixed role scales and symmetric blue/amber signed increments for outrigger/belt/columns. Label increments; a positive increment may only relieve existing compression.',
         'Core wind response is bending normal stress from coreWindSection, not the zero net axial increment. Show opposite wall-face signs only from the section moment/coordinates.',
         'A closeup can select the identified high-response member. Keep the deformed load attachment and camera target on the same interpolated state.',
         'Present TMD relative motion, spring force, damping force and dissipated energy from the same t.time sample. Do not force 180-degree phase or arbitrary motion.',
         'Pile show head-load -> shaft reaction -> toe reaction, preserving the exported signs and aggregate couples; never paint a computed soil-volume stress field.',
       ],highResponseTargets=member_peaks,
       deformationDisplay=dict(tower=48,pile=300,tmdRelative=1,requireLabels=True),
       sourceAndClaimLimitations=report['limitations']))
    files=[]
    for root in [HERE,RESULTS]:
        for p in sorted(root.rglob('*')):
            if p.is_file() and p.name not in ['output-manifest.json','report-console.log'] and '__pycache__' not in p.parts:
                files.append(dict(path=str(p),bytes=p.stat().st_size,sha256=sha(p)))
    save(HERE/'output-manifest.json',dict(createdUTC=report['createdUTC'],resultsRoot=str(RESULTS),files=files,
       totalBytes=sum(x['bytes'] for x in files),productionInputsUnchanged=checks['productionInputsUnchanged']))
    print(json.dumps(dict(complete=report['complete'],checks=checks,resultsRoot=str(RESULTS),files=len(files),totalBytes=sum(x['bytes'] for x in files)),indent=2))
if __name__=='__main__':make()
