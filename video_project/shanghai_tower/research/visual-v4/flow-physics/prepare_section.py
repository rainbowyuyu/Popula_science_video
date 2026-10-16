"""Morph the official SU2 cylinder grid onto the film's convex support curve.

This is a unit-scale two-dimensional, laminar Re=100 teaching experiment. It
does not represent Shanghai Tower's full-scale turbulent atmospheric flow.
"""
from pathlib import Path
import json, math, hashlib, argparse
import numpy as np

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def profile(t,a=.10):
    # Exact support function used by scripts/build_tower.py (angle inversion
    # returns a point on the requested polar ray; no ellipse substitute).
    n=t.copy()
    for _ in range(10):
        h=1+a*np.cos(3*n); dh=-3*a*np.sin(3*n); ddh=-9*a*np.cos(3*n)
        delta=(n+np.arctan2(dh,h)-t+np.pi)%(2*np.pi)-np.pi
        slope=h*(h+ddh)/(h*h+dh*dh)
        n-=np.clip(delta/slope,-.25,.25)
    h=1+a*np.cos(3*n); dh=-3*a*np.sin(3*n)
    return np.column_stack((h*np.cos(n)-dh*np.sin(n),h*np.sin(n)+dh*np.cos(n)))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--angle',type=float,default=25.)
    ap.add_argument('--steps',type=int,default=2400);ap.add_argument('--dt',type=float,default=.05)
    ap.add_argument('--inner',type=int,default=60);ap.add_argument('--re',type=float,default=100.)
    ap.add_argument('--cfl',type=float,default=100.);ap.add_argument('--mg',type=int,default=3)
    ap.add_argument('--steady',action='store_true')
    ap.add_argument('--name',default='tower-section-re100');args=ap.parse_args()
    source=HERE/'official-cylinder/mesh_cylinder_lam.su2'
    lines=source.read_text().splitlines()
    ni=next(i for i,l in enumerate(lines) if l.startswith('NPOIN='));count=int(lines[ni].split('=')[1])
    old=np.array([[float(v) for v in l.split()[:2]] for l in lines[ni+1:ni+1+count]])
    center=np.array([.5,0.]);q=old-center;r=np.linalg.norm(q,axis=1);t=np.arctan2(q[:,1],q[:,0])
    angle=np.deg2rad(args.angle); rotated_t=t-angle
    target=profile(rotated_t)*.5
    rot=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
    target=target@rot.T
    circle=.5*np.column_stack((np.cos(t),np.sin(t)))
    p=np.clip((r-.5)/4.5,0,1)
    w=1-p*p*p*(p*(p*6-15)+10)  # C2 taper reaches exactly 0 at r=5.
    new=old+(target-circle)*w[:,None]
    ei=next(i for i,l in enumerate(lines) if l.startswith('NELEM='));ne=int(lines[ei].split('=')[1])
    tris=np.array([[int(v) for v in l.split()[1:4]] for l in lines[ei+1:ei+1+ne]])
    def areas(x):
        a=x[tris[:,1]]-x[tris[:,0]];b=x[tris[:,2]]-x[tris[:,0]]
        return .5*(a[:,0]*b[:,1]-a[:,1]*b[:,0])
    aa=areas(old);bb=areas(new)
    assert np.all(aa*bb>0),'Morph inverted a triangle'
    ratio=np.abs(bb/aa)
    assert ratio.min()>.1,'Poor relative cell quality'
    dest=HERE/args.name;dest.mkdir(exist_ok=True)
    for i,(x,y) in enumerate(new): lines[ni+1+i]=f'{x:.15e}\t{y:.15e}\t{i}'
    mesh=dest/'section.su2';mesh.write_text('\n'.join(lines)+'\n')
    cfg=f'''% Finite-volume 2D laminar demonstration; NOT building-scale CFD.
SOLVER= INC_NAVIER_STOKES
KIND_TURB_MODEL= NONE
MATH_PROBLEM= DIRECT
RESTART_SOL= NO
INC_DENSITY_INIT= 1.0
INC_VELOCITY_INIT= ( 1.0, 0.0, 0.0 )
VISCOSITY_MODEL= CONSTANT_VISCOSITY
MU_CONSTANT= {1/args.re}
REF_ORIGIN_MOMENT_X= 0.5
REF_ORIGIN_MOMENT_Y= 0.0
REF_ORIGIN_MOMENT_Z= 0.0
REF_LENGTH= 1.0
REF_AREA= 1.0
MARKER_HEATFLUX= ( cylinder, 0.0 )
MARKER_FAR= ( farfield )
MARKER_PLOTTING= ( cylinder )
MARKER_MONITORING= ( cylinder )
NUM_METHOD_GRAD= WEIGHTED_LEAST_SQUARES
CFL_NUMBER= {args.cfl}
CFL_ADAPT= NO
MGLEVEL= {args.mg}
MGCYCLE= V_CYCLE
MG_PRE_SMOOTH= ( 4, 4, 4, 4 )
MG_POST_SMOOTH= ( 4, 4, 4, 4 )
MG_CORRECTION_SMOOTH= ( 1, 1, 1, 1 )
MG_DAMP_RESTRICTION= 0.5
MG_DAMP_PROLONGATION= 0.5
CONV_NUM_METHOD_FLOW= FDS
MUSCL_FLOW= YES
SLOPE_LIMITER_FLOW= NONE
TIME_DISCRE_FLOW= EULER_IMPLICIT
TIME_DOMAIN= {'NO' if args.steady else 'YES'}
{f'ITER= {args.steps}' if args.steady else ''}
TIME_MARCHING= DUAL_TIME_STEPPING-2ND_ORDER
TIME_STEP= {args.dt}
TIME_ITER= {args.steps}
MAX_TIME= {args.steps*args.dt}
INNER_ITER= {args.inner}
CONV_RESIDUAL_MINVAL= {'-9' if args.steady else '-7'}
CONV_STARTITER= 1
LINEAR_SOLVER= FGMRES
LINEAR_SOLVER_PREC= ILU
LINEAR_SOLVER_ERROR= 0.01
LINEAR_SOLVER_ITER= 10
MESH_FILENAME= section.su2
MESH_FORMAT= SU2
TABULAR_FORMAT= CSV
CONV_FILENAME= history
RESTART_FILENAME= restart_flow
VOLUME_FILENAME= flow
SURFACE_FILENAME= surface_flow
OUTPUT_FILES= (RESTART, PARAVIEW, SURFACE_PARAVIEW)
OUTPUT_WRT_FREQ= (400, 10, 10)
HISTORY_OUTPUT= (ITER, RMS_RES, AERO_COEFF)
SCREEN_OUTPUT= (TIME_ITER, INNER_ITER, RMS_PRESSURE, RMS_VELOCITY-X, LIFT, DRAG)
SCREEN_WRT_FREQ_INNER= {args.inner}
HISTORY_WRT_FREQ_INNER= 0
'''
    (dest/'section.cfg').write_text(cfg)
    boundary_idx=next(i for i,l in enumerate(lines) if l.strip()=='MARKER_TAG= cylinder')
    nb=int(lines[boundary_idx+1].split('=')[1]);edges=np.array([[int(v) for v in l.split()[1:3]] for l in lines[boundary_idx+2:boundary_idx+2+nb]])
    body_indices=np.unique(edges);body=new[body_indices]
    report={'name':args.name,'geometrySource':'scripts/build_tower.py:profile_point support curve (a=0.10), normalized to reference scale D0=1',
            'geometrySourceSHA256':sha(ROOT/'scripts/build_tower.py'),'officialBaseMeshSHA256':sha(source),
            'meshSHA256':sha(mesh),'angleDegrees':args.angle,'referenceLength':1,'U':1,'rho':1,'dynamicViscosity':1/args.re,'ReynoldsBasedOnD0':args.re,
            'dimensionalInterpretation':'Consistent unit-scale teaching problem; no atmospheric or full-scale conversion',
            'mesh':{'points':count,'triangles':ne,'minimumRelativeArea':float(ratio.min()),'maximumRelativeArea':float(ratio.max()),'invertedCells':0,'outerBoundaryChanged':bool(np.any(new[r>=5]!=old[r>=5]))},
            'steady':args.steady,'innerIterations':args.inner,'multigridLevels':args.mg,'cflNumber':args.cfl,'timeStep':args.dt,'timeIterations':args.steps,'physicalTime':args.dt*args.steps,'bodyRange':{'min':body.min(axis=0).tolist(),'max':body.max(axis=0).tolist()},
            'limitations':[f'2D laminar flow at Re={args.re:g}; atmospheric Shanghai Tower Reynolds number is orders of magnitude larger.',
                'No ground, nearby towers, atmospheric turbulence profile, twist interaction or vertical correlation.',
                'No experimental validation for the reconstructed triangle; results illustrate a computed cross-section mechanism only.',
                'Do not map its Cp or wake onto Shanghai Tower as physical full-building wind pressure.',
                'This shape matches the film reconstruction; architect fabrication coordinates are unavailable.']}
    (dest/'case-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    np.savez_compressed(dest/'mesh-geometry.npz',points=new,triangles=tris,body_edges=edges)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
