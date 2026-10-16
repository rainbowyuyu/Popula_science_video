"""Reproducible SI operating conditions and actual per-node inlet profile."""
from pathlib import Path
import math,json,hashlib,numpy as np
HERE=Path(__file__).resolve().parent
case=HERE/'tower-crown-resolved'
text=(case/'tower.su2').read_text();lines=text.splitlines()
i=next(i for i,l in enumerate(lines) if l.startswith('NPOIN='));n=int(lines[i].split('=')[1])
points=np.array([[float(x) for x in l.split()[:3]] for l in lines[i+1:i+1+n]])
mi=next(i for i,l in enumerate(lines) if l=='MARKER_TAG= inlet');nm=int(lines[mi+1].split('=')[1])
ids=np.unique(np.array([int(v) for l in lines[mi+2:mi+2+nm] for v in l.split()[1:]],int))
rho=1.225;mu=1.81e-5;uRef=30.;alpha=math.log(50/31.7)/math.log(500/10);nu=mu/rho
rows=[]
for x,y,z in points[ids]:
    u=uRef*(max(z,10.)/500.)**alpha
    rows.append([x,y,z,288.15,u,1.,0.,0.,3*nu])
head=f'NMARK= 1\nMARKER_TAG= inlet\nNROW= {len(rows)}\nNCOL= 9\n# COORD-X COORD-Y COORD-Z TEMPERATURE VELOCITY_MAG DIRECTION-X DIRECTION-Y DIRECTION-Z NU_TILDE\n'
(case/'inlet.dat').write_text(head+'\n'.join(' '.join(f'{v:.16e}' for v in row) for row in rows)+'\n')
cfg=(HERE/'tower-crown-rans/no-wallfunction-smoke.cfg').read_text()
cfg=cfg.replace('First 120 iterations are a solver/mesh smoke check, not accepted physics.','Actual-Re resolved-wall RANS for an isolated reconstructed tower; unvalidated until audited.')
cfg=cfg.replace('ITER= 12','ITER= 4000').replace('SCREEN_WRT_FREQ_INNER= 1','SCREEN_WRT_FREQ_INNER= 20')
cfg=cfg.replace('history-nowf','history').replace('restart_nowf','restart_flow').replace('nowf_flow','flow').replace('nowf_surface_flow','surface_flow')
cfg=cfg.replace('OUTPUT_WRT_FREQ= 60','OUTPUT_WRT_FREQ= 200')
cfg=cfg.replace('CFL_ADAPT_PARAM= (0.5, 1.1, 0.1, 30.0, 0.001, 5)','CFL_ADAPT_PARAM= (0.5, 1.05, 0.5, 50.0, 0.001, 10)')
cfg+='\nSPECIFIED_INLET_PROFILE= YES\nINLET_FILENAME= inlet.dat\n'
(case/'rans.cfg').write_text(cfg)
manifest={'schema':'rainbow.fullscale-rans-input/1','status':'prepared-not-yet-solved','solver':'SU2 8.5.0 incompressible SA RANS, no wall function (near wall resolved)','geometryUnits':'m','density_kg_m3':rho,'viscosity_Pa_s':mu,'referenceVelocity_m_s':uRef,'height_m':632.,'ReynoldsNumberBasedOnHeight':rho*uRef*632/mu,'ReynoldsNumberBasedOnBaseReferenceDiameter98m':rho*uRef*98/mu,'inlet':{'type':'per-vertex velocity profile','velocityFormula':'30*(max(z,10)/500)^alpha m/s, along solver +X','alpha':alpha,'U10_m_s':uRef*(10/500)**alpha,'U500_m_s':uRef,'clampBelow_m':10,'nuTilde_m2_s':3*nu,'temperature_K':288.15,'nodes':len(rows)},'surface':'isolated reconstructed aerodynamic envelope and smooth ground, not as-built city','rawVTUUnits':{'coordinates':'m (length reference 1 m)','Velocity':'dimensionless, multiply by 30 for m/s','Pressure':'dimensionless gauge, multiply by 1102.5 for Pa','Pressure_Coefficient':'dimensionless already','Skin_Friction_Coefficient':'dimensionless already; multiply by 551.25 for wall shear Pa','Y_Plus':'dimensionless already'},'limitations':['An illustrative U500=30 m/s operating condition; not a Shanghai design wind or measurement.','Power-law inlet is prescribed; smooth ground SA flow development is computed, not assumed to preserve an equilibrium atmospheric boundary layer.','Inlet SA eddy variable uses default freestream factor 3 (no measured turbulence spectrum).','Crown external rim matches film; its sealing membrane is a simplification and excludes crown interior flow.','No neighboring city, facade openings, gust statistics or fluid-structure feedback.','Acceptance requires finite fields, convergence/force checks and actual y+ audit; a completed executable alone is insufficient.']}
manifest['hashes']={name:hashlib.sha256((case/name).read_bytes()).hexdigest() for name in ['tower.su2','inlet.dat','rans.cfg']}
(case/'input-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'nodes':n,'inletNodes':len(ids),'U10':manifest['inlet']['U10_m_s'],'ReH':manifest['ReynoldsNumberBasedOnHeight'],'case':str(case)},indent=2))
