"""Additional out-of-plane cantilever strip and line-beam benchmarks."""
import numpy as np
import solve_shell_tower as st

ops,dll=st.backend();checks=[]
for nx in [10,20,40]:
    ny=2;L=10.;b=1.;th=.1;E=34e9;nu=.2;P=100.;I=b*th**3/12;G=E/(2*(1+nu))
    ops.wipe();ops.model('basic','-ndm',3,'-ndf',6)
    for i in range(nx+1):
        for j in range(ny+1):
            tag=i*(ny+1)+j+1;ops.node(tag,L*i/nx,b*j/ny,0.)
            if i==0:ops.fix(tag,1,1,1,1,1,1)
    ops.section('ElasticMembranePlateSection',1,E,nu,th,0.)
    for i in range(nx):
        for j in range(ny):
            n=i*(ny+1)+j+1;ops.element('ShellMITC4',i*ny+j+1,n,n+ny+1,n+ny+2,n+1,1)
    ops.timeSeries('Linear',1);ops.pattern('Plain',1,1)
    for j in range(ny+1):ops.load(nx*(ny+1)+j+1,0.,0.,P/ny*(.5 if j in [0,ny] else 1),0.,0.,0.)
    ops.constraints('Plain');ops.numberer('RCM');ops.system('UmfPack');ops.algorithm('Linear');ops.integrator('LoadControl',1);ops.analysis('Static');code=ops.analyze(1)
    u=np.mean([ops.nodeDisp(nx*(ny+1)+j+1,3) for j in range(ny+1)]);expected=P*L**3/(3*E*I)+P*L/(5/6*G*b*th)
    checks.append(dict(name='ShellMITC4 cantilever strip transverse bending',longitudinalPanels=nx,widthPanels=ny,code=code,tipDisplacement_m=float(u),TimoshenkoBeamReference_m=expected,relativeDifference=float(abs(u-expected)/expected),
                       note='Finite-width plate with clamped root; beam reference is a slender-strip check, not an exact plate solution.',passed=bool(code==0 and abs(u-expected)/expected<.03)))
ops.wipe();ops.model('basic','-ndm',3,'-ndf',6);ops.node(1,0,0,0);ops.node(2,0,10,0);ops.fix(1,1,1,1,1,1,1)
ops.geomTransf('Linear',1,0,0,1);ops.element('elasticBeamColumn',1,1,2,1.,34e9,34e9/2.4,1/6,1/12,1/12,1)
ops.timeSeries('Linear',1);ops.pattern('Plain',1,1);ops.load(2,1000.,0.,0.,0.,0.,0.)
ops.constraints('Plain');ops.numberer('RCM');ops.system('UmfPack');ops.algorithm('Linear');ops.integrator('LoadControl',1);ops.analysis('Static');code=ops.analyze(1)
actual=ops.nodeDisp(2,1);expected=1000*10**3/(3*34e9/12)
checks.append(dict(name='3D elasticBeamColumn cantilever',code=code,actual=actual,expected=expected,relativeError=abs(actual-expected)/expected,passed=code==0 and abs(actual-expected)/expected<1e-10))
st.save(st.OUT/'verification/shell-bending-and-beam-tests.json',checks);print(checks);assert all(x['passed'] for x in checks);ops.wipe()
