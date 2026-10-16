"""Prepare an isolated, unaccepted SI low-speed SA-negative continuation case.

No production files are touched. A changed inflow speed changes actual Re and
reference scales; this is a numerical continuation step, not a 30 m/s result.
"""
from pathlib import Path
import argparse,datetime,hashlib,json,re,shutil
import numpy as np

HERE=Path(__file__).resolve().parent
SOURCE=HERE/'tower-crown-resolved'

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--name',default='candidate-sa-negative-u05');p.add_argument('--speed',type=float,default=5.);p.add_argument('--iterations',type=int,default=1200);p.add_argument('--cfl',type=float,default=2.);a=p.parse_args()
    out=(HERE/a.name).resolve()
    if not out.is_relative_to(HERE) or out==SOURCE or out.exists():raise RuntimeError('Select a new isolated fullscale candidate directory')
    if not 0<a.speed<=30:raise ValueError('continuation speed must be >0 and <=30 m/s')
    out.mkdir()
    shutil.copy2(SOURCE/'tower.su2',out/'tower.su2')
    source_inlet=(SOURCE/'inlet.dat').read_text();rows=np.array([[float(x) for x in line.split()] for line in source_inlet.splitlines() if not line.startswith('#') and len(line.split())==9]);rows[:,4]*=a.speed/30
    # SU2 specifically recognizes the literal '# COORD' header; an arbitrary
    # '#' comment here is treated as a data row and loses the final inlet point.
    (out/'inlet.dat').write_text(f'NMARK= 1\nMARKER_TAG= inlet\nNROW= {len(rows)}\nNCOL= 9\n# COORD-X COORD-Y COORD-Z TEMPERATURE VELOCITY_MAG DIRECTION-X DIRECTION-Y DIRECTION-Z NU_TILDE\n'+'\n'.join(' '.join(f'{v:.16e}' for v in r) for r in rows)+'\n')
    cfg=(SOURCE/'rans.cfg').read_text()
    settings={'SA_OPTIONS':'(NEGATIVE, WITHFT2)','INC_VELOCITY_INIT':f'({a.speed}, 0.0, 0.0)','MARKER_INLET':f'(inlet, 288.15, {a.speed}, 1.0, 0.0, 0.0)','CFL_NUMBER':str(a.cfl),'CFL_ADAPT':'NO','ITER':str(a.iterations),'LINEAR_SOLVER_ERROR':'0.0001','LINEAR_SOLVER_ITER':'80','CONV_FIELD':'(RMS_PRESSURE, RMS_VELOCITY-X, RMS_VELOCITY-Y, RMS_VELOCITY-Z, RMS_NU_TILDE)','OUTPUT_WRT_FREQ':'100','SCREEN_WRT_FREQ_INNER':'50','VOLUME_OUTPUT':'(COORDINATES, SOLUTION, PRIMITIVE, RESIDUAL)'}
    cfg='\n'.join(line for line in cfg.splitlines() if not line.lstrip().startswith('%'))
    for key,value in settings.items():
        if re.search(rf'^{key}\s*=',cfg,re.M):cfg=re.sub(rf'^{key}\s*=.*$',f'{key}= {value}',cfg,flags=re.M)
        else:cfg+=f'\n{key}= {value}'
    (out/'rans.cfg').write_text('% Real low-speed SA_NEG continuation trial; UNACCEPTED until independently audited.\n'+cfg+'\n')
    rho=1.225;mu=1.81e-5
    manifest={'schema':'rainbow.fullscale-rans-continuation/1','createdUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'prepared','quality':{'acceptedForCoupling':False},'sourceCase':str(SOURCE),'purpose':'Actual SI flow solve at a reduced velocity as the first continuation stage. Not equivalent to the target U500=30 m/s case.','speed_m_s':a.speed,'density_kg_m3':rho,'viscosity_Pa_s':mu,'Re_H':rho*a.speed*632/mu,'Re_D98':rho*a.speed*98/mu,'pressureReference_Pa':rho*a.speed**2,'dynamicPressureReference_Pa':.5*rho*a.speed**2,'inletRange_m_s':[float(rows[:,4].min()),float(rows[:,4].max())],'model':'SA_NEG, no wall function, resolved near-wall mesh','changes':settings,'meshUnchangedFromSource':sha(SOURCE/'tower.su2')==sha(out/'tower.su2'),'hashes':{f:sha(out/f) for f in ['tower.su2','inlet.dat','rans.cfg']},'limitations':['The complete ground shares 10 micrometre near-wall spacing; extreme tangential aspect ratio remains a candidate risk.','Power-law inlet clamps below 10m and is not a measured/equilibrium atmospheric boundary layer.','Steady pseudo-iterations are not physical flow time.','Do not couple, render or call this a converged flow until field, residual, force, wall and conservation gates pass.']}
    (out/'input-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'case':str(out),'speed_m_s':a.speed,'pressureReference_Pa':rho*a.speed**2,'acceptedForCoupling':False}))

if __name__=='__main__':main()
