"""Independent numerical/contract checks for the supplementary environment outputs."""
from pathlib import Path
import hashlib,json,math
import numpy as np

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/physics'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check_finite(x):
    if isinstance(x,dict):return all(check_finite(v) for v in x.values())
    if isinstance(x,list):return all(check_finite(v) for v in x)
    if isinstance(x,(float,int)):return math.isfinite(x)
    return True
def main():
    r=json.loads((OUT/'environment-response.json').read_text('utf8'));base=json.loads((OUT/'response.json').read_text('utf8'))
    g=json.loads((OUT/'structural-graph.json').read_text('utf8'));t=r['tmd'];p=r['pile'];time=np.asarray(t['time']);n=len(time)
    checks={};details={}
    checks['schema']=r['schema']=='rainbow.shanghai-environment/1'
    checks['allValuesFinite']=check_finite(r)
    checks['time1201Uniform005']=len(time)==1201 and time[0]==0 and time[-1]==60 and np.max(abs(np.diff(time)-.05))<1e-10
    checks['frozenInputsUnchanged']=all(digest(OUT/name)==value for name,value in r['provenance']['baseFiles'].items())
    checks['allTmdSignalsSameTimeLength']=all(len(t[k])==n for k in ['massX_m','supportX_m','relativeX_m','windFactor','forceOnSupport_N','massAccelerationX_m_s2','massVelocityX_m_s','nodeU'])
    relative=np.asarray(t['massX_m'])-np.asarray(t['supportX_m']);details['relativeIdentityError_m']=float(max(abs(relative-t['relativeX_m'])))
    checks['relativeEqualsMassMinusSupport']=details['relativeIdentityError_m']<2e-8
    sf=np.asarray(t['relativeX_m'])*t['spring_N_m'];df=np.asarray(t['relativeVelocityX_m_s'])*t['dashpot_Ns_m']
    details['forceReconstructionError_N']=float(max(abs(sf+df-t['forceOnSupport_N'])))
    checks['forcesFromRealMotion']=details['forceReconstructionError_N']<.01
    inertia=np.asarray(t['massAccelerationX_m_s2'])*t['mass_kg'];force=np.asarray(t['forceOnSupport_N'])
    residual=inertia+force-np.asarray(t['massRayleighForce_N']);details['independentMassBalance_N']=float(max(abs(residual)))
    checks['massDynamicEquilibrium']=details['independentMassBalance_N']<.02
    checks['dissipationNondecreasing']=bool(np.all(np.diff(t['dissipatedEnergy_J'])>=-1e-7))
    nodeindex={node['id']:i for i,node in enumerate(base['nodes'])};ui=np.asarray(t['nodeU'])
    frozenui=np.asarray(base['dynamic']['u'])[:,[nodeindex[id] for id in t['nodeIds']]]
    details['coreVsFrozenResponse_m']=float(np.max(abs(ui[20::20]-frozenui)))
    checks['sameTowerTimeHistory']=details['coreVsFrozenResponse_m']<1e-6
    loads=t['windLoads'];checks['windLoadsExactlyFrozen']=loads['nodeIds']==[x['nodeId'] for x in g['windLoads']] and np.array_equal(loads['baseForce_N'],[x['force'] for x in g['windLoads']])
    details['fullWindBaseShear_N']=float(np.asarray(loads['baseForce_N'])[:,0].sum())
    depths=np.asarray([-node['xyz_m'][1] for node in p['nodes']]);checks['pileNoZeroLengthSegments']=bool(np.min(np.diff(depths))>.0001)
    checks['pileLengthAndDiameter']=abs(depths[-1]-p['length_m'])<1e-10 and p['diameter_m']==1
    details['minPileSegment_m']=float(np.min(np.diff(depths)))
    details['pileSelfWeightExpected_N']=p['length_m']*math.pi*p['diameter_m']**2/4*p['density_kg_m3']*9.80665
    checks['pileSelfWeightUnits']=abs(details['pileSelfWeightExpected_N']-p['pileSelfWeight_N'])<1e-5
    force_residual=[]
    for stage in p['stages']:
        forces=np.asarray(stage['sideReactionOnPile_N']).sum(axis=0)+np.asarray(stage['toeReactionOnPile_N'])
        applied=np.array([p['headHorizontalLoad_N'],-p['headVerticalLoad_N']-p['pileSelfWeight_N']])*stage['loadFactor']
        force_residual.append(float(np.linalg.norm(forces+applied)))
    details['independentPileBalanceMax_N']=max(force_residual);checks['pileEquilibriumIncludingSelfWeight']=max(force_residual)<.02
    final=p['stages'][-1];half=p['stages'][20]
    details['pileLinearityError_m']=float(np.max(abs(np.asarray(half['u_m'])-.5*np.asarray(final['u_m']))))
    checks['elasticPileLinearity']=details['pileLinearityError_m']<1e-8
    if 'coreWindSection' in t:
        core=t['coreWindSection'];my=np.asarray(core['momentY_Nm']);mz=np.asarray(core['momentZ_Nm']);ax=np.asarray(core['axialMPa']);ext=np.asarray(core['extremeMPa'])
        secs=core['sections'];A=np.array([s['A'] for s in secs]);iy=np.array([s['Iy'] for s in secs]);iz=np.array([s['Iz'] for s in secs]);cy=np.array([s['cy'] for s in secs]);cz=np.array([s['cz'] for s in secs])
        calculated=np.max(abs(ax[:,:,None])+abs(my)*cz[None,:,None]/iy[None,:,None]/1e6+abs(mz)*cy[None,:,None]/iz[None,:,None]/1e6,axis=2)
        details['coreExtremeRecalculationError_MPa']=float(np.max(abs(calculated-ext)))
        checks['coreExtremeFormulaCorrect']=details['coreExtremeRecalculationError_MPa']<1e-6
        details['coreWindExtremeMax_MPa']=float(ext.max());checks['coreStressNoGravityMixture']=bool(np.max(abs(ext[0]))<1e-12)
    else:checks['coreSectionExportPresent']=False
    checks['noFalseCfdClaim']=r['flow']['computedFieldAvailable'] is False
    result={'checks':{k:bool(v) for k,v in checks.items()},'allPassed':bool(all(checks.values())),'details':details,
        'environmentResponseSHA256':digest(OUT/'environment-response.json'),'scope':'Numerical and schema checks of teaching examples, not a real-building validation.'}
    (OUT/'environment-qa.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result,ensure_ascii=False,indent=2));assert result['allPassed']
if __name__=='__main__':main()
