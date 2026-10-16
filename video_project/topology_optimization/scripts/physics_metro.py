"""Reproducible, explicitly scaled teaching models for the metro safety-line film.

Run: python scripts/physics_metro.py
No full-scale safety distances are inferred from this low-Reynolds-number model.
The LBM is solved in the TRAIN frame; lab velocities require subtracting U_inf.
"""
from __future__ import annotations
from pathlib import Path
import hashlib
import json
import platform
import time

import numpy as np
import numba
from numba import njit

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/metro/physics'
RESEARCH = ROOT / 'research/metro'
OUT.mkdir(parents=True, exist_ok=True)
RESEARCH.mkdir(parents=True, exist_ok=True)
CX = np.array([0, 1, 0, -1, 0, 1, -1, -1, 1], dtype=np.int64)
CZ = np.array([0, 0, 1, 0, -1, 1, 1, -1, -1], dtype=np.int64)
WEIGHTS = np.array([4/9] + [1/9]*4 + [1/36]*4)
OPPOSITE = np.array([0, 3, 4, 1, 2, 7, 8, 5, 6], dtype=np.int64)
MIRROR_Z = np.array([0, 1, 4, 3, 2, 8, 7, 6, 5], dtype=np.int64)


def save(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


@njit(cache=True)
def advance(f, post, nxt, solid, tau, u_in, steps):
    nz, nx, _ = f.shape
    for _ in range(steps):
        for j in range(nz):
            for i in range(nx):
                if solid[j, i]:
                    continue
                rho = 0.0
                ux = 0.0
                uz = 0.0
                for k in range(9):
                    rho += f[j, i, k]
                    ux += f[j, i, k] * CX[k]
                    uz += f[j, i, k] * CZ[k]
                ux /= rho
                uz /= rho
                usq = ux*ux + uz*uz
                for k in range(9):
                    cu = CX[k]*ux + CZ[k]*uz
                    feq = WEIGHTS[k]*rho*(1+3*cu+4.5*cu*cu-1.5*usq)
                    post[j, i, k] = f[j, i, k] + (feq-f[j, i, k])/tau
        for j in range(nz):
            for i in range(nx):
                if solid[j, i]:
                    continue
                for k in range(9):
                    ii = i-CX[k]
                    jj = j-CZ[k]
                    if ii < 0 or ii >= nx:
                        nxt[j, i, k] = post[j, i, k]  # reconstructed by Zou-He below
                    elif jj < 0 or jj >= nz:
                        nxt[j, i, k] = post[j, ii, MIRROR_Z[k]]
                    elif solid[jj, ii]:
                        nxt[j, i, k] = post[j, i, OPPOSITE[k]]
                    else:
                        nxt[j, i, k] = post[jj, ii, k]
        # Prescribed-velocity inlet (Zou-He), zero-gradient distribution outlet.
        for j in range(nz):
            a = nxt[j, 0]
            rho = (a[0]+a[2]+a[4]+2*(a[3]+a[6]+a[7]))/(1-u_in)
            a[1] = a[3]+2*rho*u_in/3
            a[5] = a[7]+(a[4]-a[2])/2+rho*u_in/6
            a[8] = a[6]+(a[2]-a[4])/2+rho*u_in/6
            for k in range(9):
                nxt[j, nx-1, k] = nxt[j, nx-2, k]
        f, nxt = nxt, f
    return f, post, nxt


def fields(f, solid):
    rho = f.sum(axis=2)
    ux = np.sum(f*CX, axis=2)/np.maximum(rho, 1e-12)
    uz = np.sum(f*CZ, axis=2)/np.maximum(rho, 1e-12)
    ux[solid] = 0
    uz[solid] = 0
    return rho, ux, uz


def geometry(dx):
    x = np.arange(round(30/dx)+1)*dx-12
    z = np.arange(round(12/dx)+1)*dx-6
    xx, zz = np.meshgrid(x, z)
    # Rounded capsule: 8 long, 1.3 wide. Cross-section is a plan view.
    dist_x = np.maximum(np.abs(xx)-3.35, 0)
    solid = dist_x**2+zz**2 <= .65**2+1e-12
    solid |= solid[::-1]
    return x, z, solid


def sample(x, z, arr, px, pz):
    # Bilinear interpolation only used outside the excluded train mask.
    ix = np.clip(np.searchsorted(x, px)-1, 0, len(x)-2)
    iz = np.clip(np.searchsorted(z, pz)-1, 0, len(z)-2)
    tx = (px-x[ix])/(x[ix+1]-x[ix])
    tz = (pz-z[iz])/(z[iz+1]-z[iz])
    return (1-tx)*(1-tz)*arr[iz, ix]+tx*(1-tz)*arr[iz, ix+1]+(1-tx)*tz*arr[iz+1, ix]+tx*tz*arr[iz+1, ix+1]


def run_lbm(dx, label, export=False):
    u_in = .05
    reynolds = 20.0
    diameter = 1.3
    diameter_lattice = diameter/dx
    viscosity = u_in*diameter_lattice/reynolds
    tau = .5+3*viscosity
    x, z, solid = geometry(dx)
    nz, nx = solid.shape
    f = np.empty((nz, nx, 9))
    for k in range(9):
        cu = CX[k]*u_in
        f[:, :, k] = WEIGHTS[k]*(1+3*cu+4.5*cu*cu-1.5*u_in*u_in)
    post, nxt = f.copy(), f.copy()
    # Integrate 10 complete inlet-to-outlet advection times to damp startup waves.
    total_steps = int(np.ceil(10*(x[-1]-x[0])/(u_in*dx)/200)*200)
    block = 200
    frames = []
    history = []
    started = time.perf_counter()
    for iteration in range(0, total_steps+1, block):
        rho, ux, uz = fields(f, solid)
        fluid = ~solid
        flux_in = float(np.sum(rho[:, 0]*ux[:, 0]))
        flux_out = float(np.sum(rho[:, -1]*ux[:, -1]))
        history.append({'step':iteration, 'mass':float(rho[fluid].sum()), 'fluxIn':flux_in, 'fluxOut':flux_out,
                        'rhoMin':float(rho[fluid].min()), 'rhoMax':float(rho[fluid].max()),
                        'maxMach':float(np.hypot(ux, uz)[fluid].max()*np.sqrt(3))})
        if not np.isfinite(f).all() or rho[fluid].min() < .8 or rho[fluid].max() > 1.2:
            raise RuntimeError(f'{label} unstable at {iteration}: {history[-1]}')
        if export and iteration >= total_steps-12000 and (iteration-total_steps+12000) % 1000 == 0:
            # Dimensionless pressure coefficient, reference far-upstream center plane.
            rho_ref = float(np.mean(rho[:, 3]))
            cp = 2*(rho-rho_ref)/(3*u_in*u_in)
            cp[solid] = 0
            frames.append({'step':iteration, 'time':round(iteration*u_in*dx/diameter, 5),
                           'u':np.round(ux[::2, ::2]/u_in, 4).ravel().tolist(),
                           'v':np.round(uz[::2, ::2]/u_in, 4).ravel().tolist(),
                           'cp':np.round(cp[::2, ::2], 4).ravel().tolist()})
        if iteration == total_steps:
            break
        f, post, nxt = advance(f, post, nxt, solid, tau, u_in, block)
        if iteration % 4000 == 0:
            print(f'{label}: {iteration+block}/{total_steps}, {time.perf_counter()-started:.1f}s', flush=True)
    rho_ref = float(np.mean(rho[:, 3]))
    cp = 2*(rho-rho_ref)/(3*u_in*u_in)
    # At these planes there are no solids. Integrate and compare mass flux.
    plane_xs = [-9, -6, 0, 6, 12, 16]
    plane_fluxes = []
    for px in plane_xs:
        i = int(np.argmin(abs(x-px)))
        plane_fluxes.append({'x':float(x[i]), 'massFlux':float(np.sum(rho[:, i]*ux[:, i]))})
    last = history[-6:]
    flux_residual = abs(history[-1]['fluxOut']-history[-1]['fluxIn'])/abs(history[-1]['fluxIn'])
    mass_drift = abs(last[-1]['mass']-last[0]['mass'])/last[0]['mass']
    longitudinal_flux_spread = (max(p['massFlux'] for p in plane_fluxes)-min(p['massFlux'] for p in plane_fluxes))/history[-1]['fluxIn']
    symmetry_u = float(np.max(abs(ux-ux[::-1]))/u_in)
    symmetry_v = float(np.max(abs(uz+uz[::-1]))/u_in)
    point_coords = [(-5, 0), (-3.5, 1.15), (0, 1.15), (0, 2.15), (0, 3.65), (5, 0), (8, 0)]
    probe = [{'x':px, 'z':pz, 'u':float(sample(x,z,ux/u_in,px,pz)), 'v':float(sample(x,z,uz/u_in,px,pz)),
              'cp':float(sample(x,z,cp,px,pz))} for px,pz in point_coords]
    audit = {'method':'D2Q9 BGK with halfway bounce-back capsule, Zou-He velocity inlet, zero-gradient distribution outlet, specular far lateral walls',
             'dx':dx, 'grid':[nx,nz], 'trainLength':8., 'trainWidth':diameter, 'domain':{'x':[float(x[0]),float(x[-1])], 'z':[float(z[0]),float(z[-1])]},
             'latticeU':u_in, 'tau':tau, 'latticeNu':viscosity, 'ReBasedOnWidth':reynolds,
             'timeScale':'t*=t U_inf/D', 'steps':total_steps, 'finalTimeStar':total_steps*u_in*dx/diameter,
             'boundary':{'xMin':'u=0.05, v=0, density reconstructed', 'xMax':'zero gradient of all distribution functions (f_last=f_previous)', 'zMinMax':'impermeable free-slip, 12-wide finite domain', 'train':'stationary, no-slip halfway bounce-back'},
             'conservation':{'inletOutletFluxRelativeDifference':flux_residual, 'massRelativeDriftLast1000Steps':mass_drift, 'crossSectionMassFluxRelativeSpread':longitudinal_flux_spread, 'sections':plane_fluxes},
             'symmetry':{'maxUxRelativeDifference':symmetry_u,'maxUzRelativeAntisymmetryError':symmetry_v},
             'stability':{'finite':True, 'rhoMin':min(h['rhoMin'] for h in history), 'rhoMax':max(h['rhoMax'] for h in history), 'maxMach':max(h['maxMach'] for h in history)},
             'probes':probe, 'elapsedSeconds':time.perf_counter()-started, 'history':history}
    if export:
        metadata = {'schemaVersion':1,'coordinateSystem':{'x':'along track; nose at -4, tail at +4', 'z':'lateral from centerline', 'y':'vertical (not solved)', 'inflow':'+x in TRAIN frame', 'trainLabTravel':'-x', 'flattening':'index=iz*nx+ix', 'worldToTrain':'x_train=x_lab-x_train_center'},
                    'units':'dimensionless; use x,z in same normalized model geometry',
                    'velocity':'u=U_trainFrame/U_inf; v=W/U_inf. Lab frame: uLab=u-1, vLab=v.',
                    'pressure':'cp=(p-p_upstream)/(0.5 rho_ref U_inf^2), p=rho/3 in lattice units',
                    'nx':len(x[::2]),'nz':len(z[::2]),'x0':float(x[0]),'z0':float(z[0]),'dx':2*dx,'dz':2*dx,
                    'train':{'noseX':-4,'tailX':4,'halfWidth':.65},'solid':solid[::2,::2].astype(np.uint8).ravel().tolist(),
                    'frames':frames, 'latticeU':u_in, 'tau':tau, 'Re':reynolds,
                    'display':{'velocityColorRange':[0,1.7], 'pressureColorRange':[-1.5,1.5], 'clampForColorOnly':True},
                    'limitations':['2D plan view of a short rounded vehicle; no platform, track, roof, tunnel portals, braking, or passengers in this solve.', 'Re=20, not full-scale metro Reynolds number; no turbulent safety prediction.', 'Lateral boundaries are free-slip at z=+-6; domain blockage and shape affect results.', 'Do not infer station safety-line spacing or show this as validated real-station CFD.', 'Moving-observer sequence below translates the last field at constant speed; not a separate moving-boundary solve.']}
        save(OUT/'flow.json',metadata)
        # A fixed platform probe sees relative x increase as the train travels -x.
        side_distances = [.5,1.,2.,3.]
        path_x = np.linspace(-9,13,133)
        passages=[]
        for clearance in side_distances:
            pz=.65+clearance
            sequence=[]
            for px in path_x:
                uu=float(sample(x,z,ux/u_in,px,pz))
                vv=float(sample(x,z,uz/u_in,px,pz))
                sequence.append({'xRelative':round(float(px),4),'tStar':round(float((px+9)/diameter),4),
                                 'uLab':round(uu-1,5),'vLab':round(vv,5),
                                 'speedLab':round(float(np.hypot(uu-1,vv)),5), 'cp':round(float(sample(x,z,cp,px,pz)),5)})
            passages.append({'clearanceModelUnits':clearance,'z':pz,'sequence':sequence,'maxSpeedLab':max(s['speedLab'] for s in sequence)})
        save(OUT/'passage.json',{'schemaVersion':1,'source':'flow.json final converged field translated past a fixed observer; derived quasi-steady illustration', 'noSafeDistanceInference':True,'lengthUnit':'normalized geometry, NOT actual platform meters','velocityUnit':'U_inf','trainLabTravel':'-x','passages':passages})
    return audit


def auxiliary_models():
    # Network mass balance only: split displacement flow through three assumed branches.
    # Conductance ratios are declared example assumptions, not a metro calibration.
    speed = np.linspace(0,16,81)
    area_train, area_tunnel = 9., 35.
    branch_names = ['ventilation','platform_opening','annular_bypass']
    fractions = np.array([.30,.25,.45])
    branch_areas = np.array([12.,20.,area_tunnel-area_train])
    piston_frames=[]
    for vel in speed:
        displaced=area_train*vel
        branches=[{'name':name,'flowM3s':float(displaced*frac),'meanSpeedMs':float(displaced*frac/area)} for name,frac,area in zip(branch_names,fractions,branch_areas)]
        piston_frames.append({'trainSpeedMs':float(vel),'displacementFlowM3s':float(displaced),'branches':branches,'massBalanceErrorM3s':float(displaced-sum(b['flowM3s'] for b in branches))})
    save(OUT/'piston.json',{'schemaVersion':1,'method':'incompressible volume balance, prescribed illustrative branch fractions; no pressure-network/portal transient solve',
                          'formula':'Q_displaced=A_train V; sum(Q_branch)=Q_displaced; mean u_branch=Q_branch/A_branch',
                          'input':{'trainFrontalAreaM2':area_train,'tunnelAreaM2':area_tunnel,'branchNames':branch_names,'branchFractions':fractions.tolist(),'branchAreasM2':branch_areas.tolist()},'frames':piston_frames,
                          'limitations':['Air is free to go through several paths; it does not all shoot across the passenger.', 'Fractions and areas are assumed examples, not measurements or engineering design.', 'Do not transfer illustrative flow speeds to actual platform safety distances.']})
    # Quasi-steady drag, not a falling-person prediction; there is no active posture control.
    rho, cd, area, lever, mass, foot_halfwidth, g = 1.2,1.1,.55,1.,65.,.11,9.81
    force_frames=[]
    for vel in np.linspace(0,12,61):
        drag=.5*rho*cd*area*vel**2
        force_frames.append({'windSpeedMs':float(vel),'dragN':float(drag),'overturningMomentNm':float(drag*lever),'weightN':mass*g})
    save(OUT/'balance.json',{'schemaVersion':1,'method':'illustrative quasi-steady bluff-body drag and moment about foot edge; no human fall threshold',
                           'formula':{'force':'F=0.5 rho C_D A u^2','moment':'M_wind=F h'},
                           'input':{'airDensityKgM3':rho,'assumedCd':cd,'projectedAreaM2':area,'forceHeightM':lever,'massKg':mass,'gravityMs2':g},
                           'frames':force_frames,'displayGain':{'bodyLean':4},
                           'limitations':['The body is not a rigid passive block; posture, grip, footwear and reaction alter balance.', 'No computed wind speed is a safe/unsafe passenger threshold.', 'Force and moment are separate from the low-Re flow normalization; these are independent assumed wind-speed examples.', 'Any rendered body sway is an animation, not a solved biomechanical response.']})
    return {'pistonMaxBalanceErrorM3s':max(abs(f['massBalanceErrorM3s']) for f in piston_frames), 'forceAt6MsN':next(f['dragN'] for f in force_frames if abs(f['windSpeedMs']-6)<1e-8), 'forceDoublingWindRatio':next(f['dragN'] for f in force_frames if abs(f['windSpeedMs']-8)<1e-8)/next(f['dragN'] for f in force_frames if abs(f['windSpeedMs']-4)<1e-8)}


def derive_streamlines():
    flow=json.loads((OUT/'flow.json').read_text(encoding='utf-8'))
    x=flow['x0']+np.arange(flow['nx'])*flow['dx']
    z=flow['z0']+np.arange(flow['nz'])*flow['dz']
    seeds=[s*a for s in [-1,1] for a in [.18,.3,.5,.75,1.,1.3,1.65,2.,2.5,3.,3.6,4.2]]
    snapshots=[]
    for frame_index in sorted(set([0,len(flow['frames'])//2,len(flow['frames'])-1])):
        frame=flow['frames'][frame_index]
        ux=np.array(frame['u']).reshape(flow['nz'],flow['nx'])
        uz=np.array(frame['v']).reshape(flow['nz'],flow['nx'])
        cp=np.array(frame['cp']).reshape(flow['nz'],flow['nx'])
        lines=[]
        def vel(p):
            return np.array([sample(x,z,ux,*p),sample(x,z,uz,*p)])
        for seed in seeds:
            p=np.array([-10.,seed])
            raw=[p.copy()]
            times=[0.]
            termination='step_limit'
            for _ in range(2000):
                velocity=vel(p)
                speed=float(np.linalg.norm(velocity))
                if speed < .008:
                    termination='stagnation';break
                dt=min(.10,.085/speed)
                k1=velocity
                k2=vel(p+k1*dt*.5)
                k3=vel(p+k2*dt*.5)
                k4=vel(p+k3*dt)
                pnew=p+dt*(k1+2*k2+2*k3+k4)/6
                radius=np.hypot(max(abs(pnew[0])-3.35,0),pnew[1])
                if radius <= .655:
                    termination='wall_proximity';break
                if pnew[0]>16 or abs(pnew[1])>5.7:
                    termination='domain_exit';break
                p=pnew;raw.append(p.copy());times.append(times[-1]+dt)
            raw=np.array(raw)
            cumulative=np.r_[0,np.cumsum(np.linalg.norm(np.diff(raw,axis=0),axis=1))]
            target=np.linspace(0,cumulative[-1],140)
            points=np.column_stack([np.interp(target,cumulative,raw[:,k]) for k in range(2)])
            # Integral time along streamline permits physical variable-speed particles.
            arrival=np.interp(target,cumulative,np.array(times))
            speeds=[float(np.linalg.norm(vel(p))) for p in points]
            pressures=[float(sample(x,z,cp,*p)) for p in points]
            lines.append({'seedZ':seed,'points':np.round(points,5).tolist(),'arcLength':np.round(target,5).tolist(),
                          'arrivalTime':np.round(arrival,5).tolist(),'speed':np.round(speeds,5).tolist(),'cp':np.round(pressures,5).tolist(),
                          'totalLength':float(target[-1]),'travelTime':float(arrival[-1]),'termination':termination})
        snapshots.append({'flowFrameIndex':frame_index,'flowTimeStar':frame['time'],'lines':lines})
    save(OUT/'streamlines.json',{'schemaVersion':1,'source':'RK4 integration of normalized velocity in flow.json, with bilinear spatial sampling',
                                'coordinates':'points are [x,z]; set Three.js y to the chosen inspection height, e.g. 0.85',
                                'frame':'TRAIN reference frame, freestream +x; not world-frame air trajectories',
                                'time':'arrivalTime integrates dp/dt=(u,v); multiply by modelLength/Uinf for a dimensionful teaching time only',
                                'snapshots':snapshots,
                                'loopRule':'Each particle follows increasing arrivalTime. At domain exit it may reappear only at the inlet outside the camera view. Do not connect last point back to first with a visible segment. For close-up views, clip to frustum and phase stagger births at the off-screen inlet.',
                                'interpolationRule':'Adjacent snapshots have matching seed and point count. Interpolate corresponding positions for display; this interpolation is not another simulation.',
                                'noInventedVortices':True})
    return {'snapshots':len(snapshots),'linesPerSnapshot':len(seeds),'pointsPerLine':140,'terminations':sorted(set(line['termination'] for snap in snapshots for line in snap['lines']))}


def main():
    coarse=run_lbm(.125,'coarse')
    fine=run_lbm(.10,'production',export=True)
    comparisons=[]
    for a,b in zip(coarse['probes'],fine['probes']):
        comparisons.append({'x':b['x'],'z':b['z'],'uAbsoluteDifference':abs(a['u']-b['u']),'vAbsoluteDifference':abs(a['v']-b['v']),'cpAbsoluteDifference':abs(a['cp']-b['cp'])})
    max_vel_delta=max(max(p['uAbsoluteDifference'],p['vAbsoluteDifference']) for p in comparisons)
    aux=auxiliary_models()
    streamline_audit=derive_streamlines()
    audit={'schemaVersion':1,'purpose':'physics-driven teaching visualization, not full-scale rail CFD or safety certification',
           'software':{'python':platform.python_version(),'numpy':np.__version__,'numba':numba.__version__},
           'coarse':coarse,'production':fine,
           'gridCheck':{'sameReAndGeometry':True,'coarseDx':.125,'productionDx':.10,'probes':comparisons,'maxVelocityAbsoluteDifferenceOverUInf':max_vel_delta,'notFormalGridConvergenceStudy':True},
           'auxiliary':aux,'streamlines':streamline_audit,
           'checks':{'finite':fine['stability']['finite'],'lowMach':fine['stability']['maxMach']<.3,
                     'inletOutletFluxWithin1Percent':fine['conservation']['inletOutletFluxRelativeDifference']<.01,
                     'finalMassDriftUnder0_1Percent':fine['conservation']['massRelativeDriftLast1000Steps']<.001,
                     'probeVelocityChangeUnder0_08UInf':max_vel_delta<.08,
                     'pistonMassBalance':aux['pistonMaxBalanceErrorM3s']<1e-10,
                     'dragScalesWithWindSquared':abs(aux['forceDoublingWindRatio']-4)<1e-10}}
    audit['allDeclaredChecksPass']=all(audit['checks'].values())
    audit['files']={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in OUT.glob('*.json')}
    (RESEARCH/'physics-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'checks':audit['checks'],'gridMaxVelocityDelta':max_vel_delta,'files':audit['files']},indent=2),flush=True)
    if not audit['allDeclaredChecksPass']:
        raise RuntimeError('Declared validation failed; inspect audit, improve run before use.')


if __name__=='__main__':
    main()
