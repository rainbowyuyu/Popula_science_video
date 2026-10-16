"""RK4 instantaneous streamlines and unsteady pathlines from exported u/v."""
from pathlib import Path
import json,numpy as np
HERE=Path(__file__).resolve().parent
p=HERE/'tower-section-re100-mg/playback'
m=json.loads((p/'manifest.json').read_text(encoding='utf-8'))
g=m['grid'];times=np.array(m['data']['times']);nx,ny=g['nx'],g['ny']
fields=np.fromfile(p/'fields.f32',dtype='<f4').reshape(len(times),4,ny,nx)
valid=np.fromfile(p/'valid-mask.u8',dtype='u1').reshape(ny,nx)
x0,x1=g['x'];y0,y1=g['y']

def vel(q,t):
    px=(q[0]-x0)/(x1-x0)*(nx-1);py=(q[1]-y0)/(y1-y0)*(ny-1)
    ix=int(np.floor(px));iy=int(np.floor(py))
    if ix<0 or iy<0 or ix>=nx-1 or iy>=ny-1 or not np.all(valid[iy:iy+2,ix:ix+2]):return None
    k=int(np.clip(np.searchsorted(times,t)-1,0,len(times)-2));w=np.clip((t-times[k])/(times[k+1]-times[k]),0,1)
    a=fields[k,:2,iy:iy+2,ix:ix+2]*(1-w)+fields[k+1,:2,iy:iy+2,ix:ix+2]*w
    s=px-ix;r=py-iy
    return a[:,0,0]*(1-s)*(1-r)+a[:,0,1]*s*(1-r)+a[:,1,0]*(1-s)*r+a[:,1,1]*s*r

def integrate(seed,start,frozen,dt=.015,duration=15):
    q=np.array(seed,float);points=[];speeds=[];ts=[]
    for i in range(int(duration/dt)+1):
        t=start if frozen else start+i*dt
        if not frozen and t>times[-1]:break
        k1=vel(q,t)
        if k1 is None:break
        points.append(q.tolist());speeds.append(float(np.linalg.norm(k1)));ts.append(i*dt)
        k2=vel(q+dt*k1/2,t if frozen else t+dt/2)
        if k2 is None:break
        k3=vel(q+dt*k2/2,t if frozen else t+dt/2)
        if k3 is None:break
        k4=vel(q+dt*k3,t if frozen else t+dt)
        if k4 is None:break
        q+=dt*(k1+2*k2+2*k3+k4)/6
    return {'seed':seed,'flowTimeStart':start,'points':points[::3],'speedOverUref':speeds[::3],'travelTimeOverD0Uref':ts[::3]}

seeds=[[-2.4,float(y)] for y in np.linspace(-2.2,2.2,33)]
stream=[integrate(s,float(times[-1]),True) for s in seeds]
paths=[integrate(s,float(times[0]),False,duration=18) for s in seeds]
out={'schema':'rainbow.cfd.section-paths/1','coordinates':'CFD coordinates, centre (0.5,0), x-y horizontal, D0=1','source':'manifest.json + fields.f32','integration':'RK4, step 0.015 D0/Uref, bilinear actual grid velocities, linear temporal interpolation; every third step retained','instantaneousStreamlines':{'frozenFlowTime':float(times[-1]),'meaning':'One frozen velocity field; not particle tracks in unsteady flow.','lines':stream},'unsteadyPathlines':{'startTime':float(times[0]),'endTime':float(times[-1]),'meaning':'Particles tracked through the solved evolving field.','lines':paths}}
(p/'paths.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print(json.dumps({'path':str(p/'paths.json'),'streamlines':len(stream),'pathlines':len(paths),'size':(p/'paths.json').stat().st_size}))
