"""Independent 2D D2Q9 LBM around an actual vertical pavilion section.

This solver is not Zwind/AeroDyn. Its low Reynolds number is stated explicitly;
the velocity and Cp fields illustrate resolved laminar flow and must not be
advertised as a high-Re atmospheric CFD design calculation. Its pressures are
NOT fed into the engineering wind pressure cases in physics_v7_native.py.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import time
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'research/episode3v7/physics'
C=np.array([[0,0],[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]],int)
# D2Q9 weights: rest=4/9, 4 axial=1/9, 4 diagonals=1/36.
W=np.array([4/9]+[1/9]*4+[1/36]*4,float)
OPP=np.array([0,3,4,1,2,7,8,5,6])


def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,allow_nan=False),encoding='utf-8')


def segment_distance(X,Z,a,b):
    d=b-a
    s=np.clip(((X-a[0])*d[0]+(Z-a[1])*d[1])/max(float(d@d),1e-14),0,1)
    return np.hypot(X-a[0]-s*d[0],Z-a[1]-s*d[1])


def polygon_slice(vertices,plane_y):
    v=np.asarray(vertices,float)
    points=[]
    for i in range(len(v)):
        a,b=v[i],v[(i+1)%len(v)]
        if abs(a[1]-plane_y)<1e-8: points.append(a[[0,2]])
        if (a[1]-plane_y)*(b[1]-plane_y)<0:
            t=(plane_y-a[1])/(b[1]-a[1])
            points.append((a+t*(b-a))[[0,2]])
    if len(points)<2: return []
    # Convex panel intersection is a line; farthest pair handles duplicate
    # vertices at an edge and coplanar front-facing panels.
    pairs=[(np.linalg.norm(a-b),a,b) for a in points for b in points]
    _,a,b=max(pairs,key=lambda q:q[0])
    return [(a,b)] if np.linalg.norm(a-b)>1e-7 else []


def geometry(model,nx=320,nz=160,plane_y_override=None):
    xyz={int(n['id']):np.array(n['xyz'],float) for n in model['nodes']}
    posts=[m for m in model['members'] if m.get('role')=='post']
    allp=np.array(list(xyz.values()))
    plane_y=min((xyz[int(m['nodes'][0])][1] for m in posts),default=float(allp[:,1].min()))
    if plane_y_override is not None: plane_y=float(plane_y_override)
    panels=model.get('roof_panels',model.get('roofPanels',[]))
    roofv=np.array([v for p in panels for v in p['vertices']]) if panels else allp
    span=float(roofv[:,0].max()-roofv[:,0].min())
    H=float(max(allp[:,2].max(),roofv[:,2].max()))
    dx=max(5.5*span/nx,2.35*H/nz)
    xmin=float(roofv[:,0].min()-1.8*span)
    x=xmin+(np.arange(nx)+.5)*dx
    zz=(np.arange(nz)+.5)*dx
    X,Z=np.meshgrid(x,zz)
    solid=np.zeros((nz,nx),bool)
    shapes=[]
    for m in model['members']:
        a,b=(xyz[int(i)] for i in m['nodes'])
        s=m['section']; thick=float(s.get('diameter',max(s.get('b',0),s.get('h',0))))
        half=thick/2
        # Member centerline clipped against section slab. The thickness is
        # preserved; no automatic enlargement of thin members to look bigger.
        if max(a[1],b[1])+half<plane_y or min(a[1],b[1])-half>plane_y: continue
        if abs(b[1]-a[1])<1e-9:
            aa,bb=a[[0,2]],b[[0,2]]
        else:
            ts=sorted(((plane_y-half-a[1])/(b[1]-a[1]),(plane_y+half-a[1])/(b[1]-a[1])))
            lo,hi=max(0,ts[0]),min(1,ts[1])
            if lo>hi: continue
            aa=(a+lo*(b-a))[[0,2]];bb=(a+hi*(b-a))[[0,2]]
        solid |= segment_distance(X,Z,aa,bb)<=half
        shapes.append(dict(part_id=m['part_id'],a=aa.tolist(),b=bb.tolist(),thickness_m=thick))
    for p in panels:
        for a,b in polygon_slice(p['vertices'],plane_y):
            thick=float(p.get('thickness_m',.10))
            solid |= segment_distance(X,Z,a,b)<=thick/2
            shapes.append(dict(part_id=p['id'],a=a.tolist(),b=b.tolist(),thickness_m=thick))
    # Ground boundary located at physical z=0. No artificial filled roof cavity.
    solid[0,:]=True
    return solid,x,zz,dx,dict(plane_y_m=plane_y,span_m=span,height_m=H,
                             geometry=f'Vertical slice at Blender y={plane_y:g} m; extruded in y for this independent 2D solve.',shapes=shapes)


def equilibrium(rho,u,v):
    uu=u*u+v*v
    return np.array([W[k]*rho*(1+3*(C[k,0]*u+C[k,1]*v)
                +4.5*(C[k,0]*u+C[k,1]*v)**2-1.5*uu) for k in range(9)])


def streamlines(ux,uz,solid,x,z,dx,geo):
    """RK2 integration in this numerical velocity field, not drawn curves."""
    nx,nz=len(x),len(z)
    def velocity(point):
        a=(point[0]-x[0])/dx; b=(point[1]-z[0])/dx
        i,j=int(math.floor(a)),int(math.floor(b))
        if i<0 or i>=nx-1 or j<1 or j>=nz-2: return None
        if solid[int(round(b)),int(round(a))]: return None
        fx,fz=a-i,b-j
        def interp(f):
            return (1-fx)*(1-fz)*f[j,i]+fx*(1-fz)*f[j,i+1]+(1-fx)*fz*f[j+1,i]+fx*fz*f[j+1,i+1]
        v=np.array([interp(ux),interp(uz)])
        norm=np.linalg.norm(v)
        return None if norm<1e-6 else v/norm
    shapes=geo['shapes']
    minx=min(min(s['a'][0],s['b'][0]) for s in shapes)
    maxx=max(max(s['a'][0],s['b'][0]) for s in shapes)
    begin=max(x[2],minx-.7*geo['span_m'])
    end=min(x[-3],maxx+1.1*geo['span_m'])
    lines=[]
    for zz in np.linspace(.25,min(z[-4],geo['height_m']*1.5),42):
        point=np.array([begin,zz]);points=[]
        for _ in range(2200):
            v1=velocity(point)
            if v1 is None: break
            v2=velocity(point+v1*dx*.24)
            if v2 is None: break
            points.append([round(float(q),5) for q in point])
            point=point+v2*dx*.48
            if point[0]>end: break
        if len(points)>12: lines.append(points)
    return lines


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--input',type=Path,default=ROOT/'research/episode3v7/frame-contract.json')
    ap.add_argument('--out',type=Path,default=OUT)
    ap.add_argument('--steps',type=int,default=10000)
    ap.add_argument('--nx',type=int,default=320)
    ap.add_argument('--nz',type=int,default=160)
    ap.add_argument('--provisional',action='store_true')
    ap.add_argument('--plane-y',type=float,default=None)
    args=ap.parse_args()
    args.out.mkdir(parents=True,exist_ok=True)
    start=time.time()
    source_bytes=args.input.read_bytes()
    source_hash=hashlib.sha256(source_bytes).hexdigest()
    model=json.loads(source_bytes.decode('utf-8-sig'))
    solid,x,z,dx,geo=geometry(model,args.nx,args.nz,args.plane_y)
    nz,nx=solid.shape
    U=.035; nu=.06; tau=.5+3*nu; omega=1/tau
    rho=np.ones((nz,nx))
    u=np.zeros((nz,nx)); v=np.zeros_like(u)
    u[solid]=0
    f=equilibrium(rho,u,v)
    fluid=~solid
    bounce=[fluid & np.roll(solid,(int(c[1]),int(c[0])),axis=(0,1)) for c in C]
    control_volume=fluid.copy()
    control_volume[[0,-1],:]=False;control_volume[:,[0,-1]]=False
    flux_in_masks=[];flux_out_masks=[]
    for c in C:
        shift=(int(c[1]),int(c[0]));reverse=(-int(c[1]),-int(c[0]))
        flux_in_masks.append(control_volume & ~np.roll(control_volume,shift,axis=(0,1)) & ~np.roll(solid,shift,axis=(0,1)))
        flux_out_masks.append(control_volume & ~np.roll(control_volume,reverse,axis=(0,1)) & ~np.roll(solid,reverse,axis=(0,1)))
    history=[];frames=[];previous=None
    capture=set(np.linspace(max(100,int(args.steps*.1)),args.steps,20,dtype=int))
    for step in range(1,args.steps+1):
        check_step=step%200==0 or step==args.steps
        rho=f.sum(axis=0)
        u=np.einsum('q,qyx->yx',C[:,0],f)/rho
        v=np.einsum('q,qyx->yx',C[:,1],f)/rho
        u[solid]=0;v[solid]=0
        feq=equilibrium(rho,u,v)
        post=f-omega*(f-feq)
        net_population_flux=0.
        old_cv_mass=float(rho[control_volume].sum()) if check_step else 0.
        for k,c in enumerate(C):
            f[k]=np.roll(post[k],(int(c[1]),int(c[0])),axis=(0,1))
            if check_step:
                net_population_flux+=float(f[k,flux_in_masks[k]].sum()-post[k,flux_out_masks[k]].sum())
            f[k,bounce[k]]=post[OPP[k],bounce[k]]
        # Zou/He velocity inlet; zero-gradient population outlet lets startup
        # acoustic waves leave. A fixed-density outlet caused strong reflected
        # waves in this short domain and was rejected by the convergence gate.
        # The upper free-slip wall conserves normal mass flux.
        ramp=min(1.,step/1200.)
        inlet_U=U*(ramp*ramp*(3-2*ramp))
        rin=(f[0,:,0]+f[2,:,0]+f[4,:,0]+2*(f[3,:,0]+f[6,:,0]+f[7,:,0]))/(1-inlet_U)
        f[1,:,0]=f[3,:,0]+2*rin*inlet_U/3
        f[5,:,0]=f[7,:,0]+(f[4,:,0]-f[2,:,0])/2+rin*inlet_U/6
        f[8,:,0]=f[6,:,0]+(f[2,:,0]-f[4,:,0])/2+rin*inlet_U/6
        f[:,:,-1]=f[:,:,-2]
        f[4,-1,:]=f[2,-1,:]
        f[7,-1,:]=f[6,-1,:]
        f[8,-1,:]=f[5,-1,:]
        f[:,solid]=W[:,None]
        if check_step:
            rr=f.sum(axis=0)
            ux=np.einsum('q,qyx->yx',C[:,0],f)/rr
            uz=np.einsum('q,qyx->yx',C[:,1],f)/rr
            ux[solid]=0;uz[solid]=0
            speed=np.hypot(ux,uz)
            if not np.isfinite(f).all() or speed[fluid].max()>.25 or rr[fluid].min()<.9:
                raise RuntimeError(f'LBM unstable at step {step}')
            conv=None if previous is None else float(np.linalg.norm((ux-previous)[fluid])/max(np.linalg.norm(ux[fluid]),1e-12))
            previous=ux.copy()
            influx=float(np.sum(rr[1:-1,2]*ux[1:-1,2]));outflux=float(np.sum(rr[1:-1,-3]*ux[1:-1,-3]))
            mass_storage=float(rr[control_volume].sum())-old_cv_mass
            conservation_residual=mass_storage-net_population_flux
            history.append(dict(step=step,mass=float(rr[fluid].sum()),
                                maxMach=float(speed[fluid].max()*math.sqrt(3)),
                                inlet_flux=influx,outlet_flux=outflux,
                                flux_relative_mismatch=abs(influx-outflux)/max(abs(influx),1e-12),
                                control_volume_mass_change=mass_storage,
                                exact_net_population_flux=net_population_flux,
                                mass_conservation_residual=conservation_residual,
                                velocity_change_over_200_steps=conv))
            print('LBM',step,'Mach',history[-1]['maxMach'],'flux error',history[-1]['flux_relative_mismatch'],flush=True)
        if step in capture:
            rr=f.sum(axis=0);ux=np.einsum('q,qyx->yx',C[:,0],f)/rr;uz=np.einsum('q,qyx->yx',C[:,1],f)/rr
            ux[solid]=0;uz[solid]=0
            cp=2*(rr-np.mean(rr[2:-2,-4]))/(3*U**2)
            frames.append(dict(step=step,advective_time=step*U/(geo['span_m']/dx),
                                u_over_U=np.round(ux[::3,::3]/U,4).tolist(),
                                w_over_U=np.round(uz[::3,::3]/U,4).tolist(),
                                Cp=np.round(cp[::3,::3],4).tolist()))
    np.savez_compressed(args.out/'lbm-raw.npz',rho=rr,u_lattice=ux,w_lattice=uz,solid=solid,x_m=x,z_m=z)
    out=dict(solver='Independent Python/NumPy D2Q9 BGK LBM',input_sha256=source_hash,
       script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
       coordinates='x,z coordinates from Blender Z-up pavilion contract; constant y slice',
       geometry=geo,nx=nx,nz=nz,dx_m=dx,lattice_velocity=U,lattice_viscosity=nu,tau=tau,
       Reynolds_span=U*(geo['span_m']/dx)/nu,
       fields=dict(x_m=x[::3].tolist(),z_m=z[::3].tolist(),solid=solid[::3,::3].astype(int).tolist()),
       snapshots=frames,history=history,
       limitations=['2D extruded vertical slice, not 3D flow around the pavilion.',
                    'Low-Re laminar demonstration, not high-Re atmospheric wind/turbulence.',
                    'Cp and velocity ratios are computed, not drawn; not used as building design pressures.',
                    'Independent D2Q9 implementation; Zwind supplies only the structural solver in this project.'],
       elapsed_s=time.time()-start,
       final_five_mean_flux_mismatch=float(np.mean([h['flux_relative_mismatch'] for h in history[-5:]])),
       convergence_criteria=dict(last_five_flux_mismatch_max=.01,
         last_five_velocity_change_max=.002,max_discrete_mass_residual=1e-8),
       passed=bool(np.isfinite(f).all() and max(h['maxMach'] for h in history)<.3
         and max(h['flux_relative_mismatch'] for h in history[-5:])<.01
         and max(h['velocity_change_over_200_steps'] or 0. for h in history[-5:])<.002
         and max(abs(h['mass_conservation_residual']) for h in history)<1e-8))
    out['flow_state']='quasi-steady low-Re numerical solution' if out['passed'] else 'transient or unconverged; diagnostic field only'
    out['input_unchanged_during_run']=hashlib.sha256(args.input.read_bytes()).hexdigest()==source_hash
    out['passed']=out['passed'] and out['input_unchanged_during_run']
    save(args.out/'lbm-flow.json',out)
    save(args.out/'lbm-qa.json',{k:v for k,v in out.items() if k not in ('snapshots','fields','geometry')})
    lines=streamlines(ux,uz,solid,x,z,dx,geo)
    save(args.out/'flow.json',dict(
      solver=out['solver'],input_sha256=out['input_sha256'],script_sha256=out['script_sha256'],
      provisional=args.provisional,coordinates='Blender x,z metres; y fixed at plane_y_m',
      plane_y_m=geo['plane_y_m'],streamlines=lines,
      method='RK2 integration in solved final D2Q9 velocity field; constant spatial integration step 0.48 grid cells.',
      Reynolds_span=out['Reynolds_span'],limitations=out['limitations'],
      velocity_field=out['snapshots'][-1],fields=out['fields'],geometry=geo,passed=out['passed']))
    print('LBM final',out['passed'],'Re',out['Reynolds_span'],'seconds',out['elapsed_s'],flush=True)


if __name__=='__main__':
    main()
