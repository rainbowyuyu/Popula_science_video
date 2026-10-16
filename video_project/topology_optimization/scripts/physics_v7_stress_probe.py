"""Native sign/orientation benchmarks for the renderer's beam-fiber module."""
from pathlib import Path
import hashlib
import json
import numpy as np
import zdynpywin.zdyn as z

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'research/episode3v7/physics/stress-field-probes.json'
E,G,b,h=9e9,.56e9,.18,.32
A=b*h;Iy=b*h**3/12;Iz=h*b**3/12
J=h*b**3*(1/3-.21*(b/h)*(1-b**4/(12*h**4)))

def axes(a,c,roll):
 x=c-a;x/=np.linalg.norm(x);y=np.cross(roll,x);y/=np.linalg.norm(y);zz=np.cross(x,y)
 return x,y,zz

def setup():
 z.wipe();z.model('BasicBuilder','-ndm',3,'-ndf',6)

def element(eid,i,j,roll):
 z.geomTransf('Linear',eid,*roll)
 z.element('elasticBeamColumn',eid,i,j,A,E,G,J,Iy,Iz,eid)

def solve(loads):
 z.timeSeries('Constant',1);z.pattern('Plain',1,1)
 for node,F in loads:z.load(node,*F,0.,0.,0.)
 z.constraints('Plain');z.numberer('RCM');z.system('BandGeneral')
 z.test('NormDispIncr',1e-12,30,0);z.algorithm('Linear');z.integrator('LoadControl',1.)
 z.analysis('Static');status=z.analyze(1)
 if status:raise RuntimeError(status)

def specimen(name,a,c,roll,kind):
 a,c,roll=np.asarray(a,float),np.asarray(c,float),np.asarray(roll,float)
 x,y,zz=axes(a,c,roll);L=float(np.linalg.norm(c-a));P=1000.
 F=P*x if kind=='axial_tension' else -P*zz if kind=='cantilever_down_local_z' else P*y
 setup();z.node(1,*a);z.node(2,*c);z.fix(1,1,1,1,1,1,1);element(1,1,2,roll);solve([(2,F)])
 if kind=='axial_tension':
  tests=[dict(s=.5,y=0,z=0,expected_Pa=P/A,physical='Axial tension must be positive.')]
 elif kind=='cantilever_down_local_z':
  tests=[dict(s=0,y=0,z=h/2,expected_Pa=P*L*(h/2)/Iy,physical='Cantilever under downward local-z tip force: top root fiber is in tension.'),
         dict(s=0,y=0,z=-h/2,expected_Pa=-P*L*(h/2)/Iy,physical='Bottom root fiber is in compression.')]
 else:
  tests=[dict(s=0,y=b/2,z=0,expected_Pa=-P*L*(b/2)/Iz,physical='Tip force toward local+y: local+y root fiber is in compression.')]
 return dict(name=name,member=dict(id=1,part_id=name,section=dict(b=b,h=h),roll_vec=roll.tolist()),
   endpoints_blender=[a.tolist(),c.tolist()],axes_blender=[x.tolist(),y.tolist(),zz.tolist()],
   response=dict(elementID=1,localEndForces=list(z.eleResponse(1,'localForce'))),
   checks=tests,native_status=0)

cases=[
 specimen('axial_tension',[0,0,0],[3,0,0],[0,0,1],'axial_tension'),
 specimen('horizontal_cantilever_down',[0,0,0],[3,0,0],[0,0,1],'cantilever_down_local_z'),
 specimen('horizontal_cantilever_side',[0,0,0],[3,0,0],[0,0,1],'cantilever_side'),
 specimen('oblique_rolled_cantilever',[.5,-.3,2],[3.2,1.4,4.1],[.3,.1,.9],'cantilever_down_local_z'),
]

# Independent physical sign fixture: supported at both ends, center downward
# point load. Classical sagging moment PL/4 gives top compression, bottom tension.
L,P=3.,1000.
setup();z.node(1,0.,0.,0.);z.node(2,L/2,0.,0.);z.node(3,L,0.,0.)
z.fix(1,1,1,1,1,0,0);z.fix(3,0,1,1,0,0,0)
element(1,1,2,[0.,0.,1.]);element(2,2,3,[0.,0.,1.]);solve([(2,np.array([0.,0.,-P]))])
analytic=-P*L**3/(48*E*Iy);actual=float(z.nodeDisp(2,3))
cases.append(dict(name='simply_supported_center_load',member=dict(id=1,part_id='simply_supported',section=dict(b=b,h=h),roll_vec=[0,0,1]),
 endpoints_blender=[[0,0,0],[L/2,0,0]],axes_blender=[[1,0,0],[0,1,0],[0,0,1]],
 response=dict(elementID=1,localEndForces=list(z.eleResponse(1,'localForce'))),
 checks=[dict(s=1,y=0,z=h/2,expected_Pa=-P*L/4*(h/2)/Iy,physical='Sagging simply supported beam: top fiber compression.'),
         dict(s=1,y=0,z=-h/2,expected_Pa=P*L/4*(h/2)/Iy,physical='Sagging simply supported beam: bottom fiber tension.')],
 midpoint_displacement_native_m=actual,midpoint_displacement_analytic_m=analytic,
 displacement_relative_error=abs(actual-analytic)/abs(analytic),native_status=0))

data=dict(native_version=z.version(),native_module=z.__file__,
 native_sha256=hashlib.sha256(Path(z.__file__).read_bytes()).hexdigest(),
 script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
 units='m N Pa',cases=cases)
OUT.write_text(json.dumps(data,indent=2),encoding='utf-8');z.wipe()
print(json.dumps(dict(cases=len(cases),simply_supported_displacement_relative_error=cases[-1]['displacement_relative_error']),indent=2))
