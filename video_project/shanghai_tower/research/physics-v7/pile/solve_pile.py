"""Executed Zwind/OpenSees layered single-pile benchmark; SI; no public writes.

Run with Python314. Independent NumPy matrices check OpenSees results, dynamic
momentum and discrete energy. This is a linear beam/Winkler mechanism example,
not a Shanghai Tower group-pile model or geotechnical safety assessment.
"""
from pathlib import Path
import sys,json,math,hashlib,datetime,time
import numpy as np
from scipy.linalg import eigh
from scipy.sparse import csr_matrix

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
sys.path.insert(0,str(ROOT/'scripts/physics'))
import run_zwind as backend
G=9.80665
P=dict(length_m=52.,diameter_m=1.,head_depth_below_grade_m=31.4,E_Pa=32e9,
    density_kg_m3=2500.,toe_k_N_m=220e6,head_vertical_N=8e6,head_lateral_peak_N=.3e6,
    vertical_modulation_N=.4e6,soil_damping_time_s=.01,duration_s=40.,
    head_mass_kg=8e6/G)
LAYERS=[
 dict(id='71',name='砂质粉土与粉砂',top_m=29.,bottom_m=37.,shaft_N_m3=4e6,lateral_N_m2=8e6),
 dict(id='72',name='粉砂',top_m=37.,bottom_m=64.4,shaft_N_m3=9e6,lateral_N_m2=18e6),
 dict(id='73',name='粉砂',top_m=64.4,bottom_m=69.2,shaft_N_m3=13e6,lateral_N_m2=28e6),
 dict(id='91',name='砂质粉土',top_m=69.2,bottom_m=78.2,shaft_N_m3=12e6,lateral_N_m2=24e6),
 dict(id='921',name='粉砂',top_m=78.2,bottom_m=89.4,shaft_N_m3=18e6,lateral_N_m2=40e6)]

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(name,v):
 (OUT/name).write_text(json.dumps(v,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf8')
def beam_k(L,A,E,I):
 a=E*A/L;b=12*E*I/L**3;c=6*E*I/L**2;d=4*E*I/L;e=2*E*I/L
 return np.array([[a,0,0,-a,0,0],[0,b,c,0,-b,c],[0,c,d,0,-c,e],[-a,0,0,a,0,0],[0,-b,-c,0,b,-c],[0,c,e,0,-c,d]])
def mesh(step):
 h=P['head_depth_below_grade_m'];L=P['length_m'];D=P['diameter_m']
 depth=np.unique(np.round(np.r_[np.arange(0,L,step),L,[v-h for z in LAYERS for v in [z['top_m'],z['bottom_m']] if h<v<h+L]],8))
 n=len(depth);A=math.pi*D**2/4;I=math.pi*D**4/64;trib=np.empty(n)
 trib[0]=(depth[1]-depth[0])/2;trib[-1]=(depth[-1]-depth[-2])/2
 trib[1:-1]=(depth[2:]-depth[:-2])/2
 K=np.zeros((3*n,3*n));Ks=np.zeros(3*n);M=np.zeros(3*n);T=np.zeros((6,6))
 T[:3,:3]=T[3:,3:]=np.array([[0,-1,0],[1,0,0],[0,0,1]])
 bmeta=[];smeta=[]
 for i,d in enumerate(depth):
  z=h+d;ly=next(v for v in LAYERS if v['top_m']<=z<v['bottom_m'])
  kx=ly['lateral_N_m2']*trib[i];ky=ly['shaft_N_m3']*math.pi*D*trib[i]
  Ks[3*i:3*i+2]=kx,ky
  M[3*i:3*i+3]=P['density_kg_m3']*np.array([A,A,I])*trib[i]
  smeta.append(dict(nodeId=i+1,depth_m=float(d),absolute_depth_m=float(z),layerId=ly['id'],tributary_m=float(trib[i]),kx_N_m=float(kx),ky_N_m=float(ky)))
  if i:
   kl=beam_k(d-depth[i-1],A,P['E_Pa'],I);idx=np.arange(3*(i-1),3*(i+1))
   K[np.ix_(idx,idx)]+=T.T@kl@T
   bmeta.append(dict(id=i,headNode=i,toeNode=i+1,length_m=float(d-depth[i-1]),indices=idx,localK=kl))
 Ks[-2]+=P['toe_k_N_m'];K+=np.diag(Ks);C=Ks*P['soil_damping_time_s']
 pile_mass=M.copy();M[:2]+=P['head_mass_kg']
 F=np.zeros(3*n);F[1::3]=-pile_mass[1::3]*G;F[1]-=P['head_vertical_N']
 return dict(depth=depth,A=A,I=I,n=n,trib=trib,K=K,Ks=Ks,C=C,M=M,F=F,T=T,beams=bmeta,springs=smeta)

def build(ops,m):
 ops.wipe();ops.model('basic','-ndm',2,'-ndf',3);ops.geomTransf('Linear',1)
 tau=P['soil_damping_time_s']
 for i,d in enumerate(m['depth']):
  tag=i+1;anchor=1000+i;ops.node(tag,0.,-float(d));ops.node(anchor,0.,-float(d));ops.fix(anchor,1,1,1)
  ops.mass(tag,*m['M'][3*i:3*i+3].tolist())
  # The springs are integrated over tributary lengths; no strength/capacity law.
  mats=[]
  for j,k in enumerate([m['springs'][i]['kx_N_m'],m['springs'][i]['ky_N_m']]):
   mt=10000+6*i+3*j
   ops.uniaxialMaterial('Elastic',mt,k);ops.uniaxialMaterial('Viscous',mt+1,tau*k,1.)
   ops.uniaxialMaterial('Parallel',mt+2,mt,mt+1);mats.append(mt+2)
  ops.element('zeroLength',1000+i,anchor,tag,'-mat',*mats,'-dir',1,2)
  if i:ops.element('elasticBeamColumn',i,i,i+1,m['A'],P['E_Pa'],m['I'],1)
 ops.node(2000,0.,-P['length_m']);ops.fix(2000,1,1,1)
 ops.uniaxialMaterial('Elastic',90000,P['toe_k_N_m']);ops.uniaxialMaterial('Viscous',90001,tau*P['toe_k_N_m'],1.)
 ops.uniaxialMaterial('Parallel',90002,90000,90001);ops.element('zeroLength',9000,2000,m['n'],'-mat',90002,'-dir',2)
 ops.timeSeries('Linear',1);ops.pattern('Plain',1,1)
 for i in range(m['n']):ops.load(i+1,*m['F'][3*i:3*i+3].tolist())
 ops.constraints('Plain');ops.numberer('RCM');ops.system('BandGeneral');ops.algorithm('Linear')
 ops.integrator('LoadControl',.025);ops.analysis('Static')

def external(t):
 rise=.5*(1-np.cos(np.pi*np.clip(t/4,0,1)))
 fall=.5*(1+np.cos(np.pi*np.clip((t-20)/4,0,1)))
 envelope=rise*fall
 return np.column_stack((P['head_lateral_peak_N']*envelope*(.65+.25*np.sin(2*np.pi*.16*t)+.10*np.sin(2*np.pi*.43*t+.4)),
    -P['vertical_modulation_N']*envelope*np.sin(2*np.pi*.17*t)))

def fields(m,u,v):
 # m x node x DOF; localX down, localY global+X, rotation counter-clockwise.
 disp=np.asarray(u).reshape(len(u),m['n'],3);vel=np.asarray(v).reshape(len(v),m['n'],3)
 elem=np.stack([np.asarray(u)[:,b['indices']]@m['T'].T@b['localK'].T for b in m['beams']],axis=1)
 kside=np.array([[s['kx_N_m'],s['ky_N_m']] for s in m['springs']])
 side=-kside*(disp[:,:,:2]+P['soil_damping_time_s']*vel[:,:,:2])
 toe=-P['toe_k_N_m']*(disp[:,-1,1]+P['soil_damping_time_s']*vel[:,-1,1])
 return dict(nodeU_m=disp[:,:,:2],nodeRotation_rad=disp[:,:,2],sideReactionOnPile_N=side,
   toeReactionOnPile_N=toe,localEndForce_N_Nm=elem,
   axialTensionPositive_N=np.stack((-elem[:,:,0],elem[:,:,3]),axis=-1),
   shearGlobalX_N=np.stack((-elem[:,:,1],elem[:,:,4]),axis=-1),
   moment_Nm=np.stack((-elem[:,:,2],elem[:,:,5]),axis=-1))

def solve(ops,dt,step):
 started=time.monotonic();m=mesh(step);build(ops,m);stages=[]
 for k in range(41):
  if k and ops.analyze(1):raise RuntimeError('static failure')
  stages.append(np.array([ops.nodeDisp(i+1) for i in range(m['n'])]).ravel())
 u0=stages[-1];direct=np.linalg.solve(m['K'],m['F'])
 static_error=np.linalg.norm(u0-direct)/np.linalg.norm(direct)
 static_fields=fields(m,np.array(stages),np.zeros_like(stages))
 ops.loadConst('-time',0.);ops.wipeAnalysis()
 times=np.arange(round(P['duration_s']/dt)+1)*dt;force=external(times)
 for direction in range(2):
  ops.timeSeries('Path',direction+2,'-dt',dt,'-values',*force[:,direction].tolist())
  ops.pattern('Plain',direction+2,direction+2);ops.load(1,*([1.,0.,0.] if direction==0 else [0.,1.,0.]))
 ops.constraints('Plain');ops.numberer('RCM');ops.system('BandGeneral');ops.algorithm('Linear')
 ops.integrator('Newmark',.5,.25);ops.analysis('Transient')
 disps=[u0];vels=[np.zeros_like(u0)];accs=[np.zeros_like(u0)]
 max_element_error=0.
 for k in range(1,len(times)):
  code=ops.analyze(1,dt)
  if code:raise RuntimeError(f'transient failure {k} {code}')
  u=np.array([ops.nodeDisp(i+1) for i in range(m['n'])]).ravel()
  v=np.array([ops.nodeVel(i+1) for i in range(m['n'])]).ravel()
  a=np.array([ops.nodeAccel(i+1) for i in range(m['n'])]).ravel()
  disps.append(u);vels.append(v);accs.append(a)
  if k%max(1,round(.5/dt))==0:
   for b in m['beams']:
    q=b['localK']@m['T']@u[b['indices']]
    max_element_error=max(max_element_error,float(np.max(abs(q-np.array(ops.eleResponse(b['id'],'localForce'))))))
 u=np.array(disps);v=np.array(vels);a=np.array(accs);du=u-u0
 f=np.zeros_like(u);f[:,:2]=force
 ku=(csr_matrix(m['K'])@du.T).T
 residual=a*m['M']+v*m['C']+ku-f
 ndyn=fields(m,u,v)
 # Newmark average acceleration has a work-conjugate discrete energy identity:
 # trapezoidal external force * displacement increment, C * mean(v)^2 * dt.
 uu=.5*np.sum(du*ku,axis=1);kin=.5*np.sum(m['M']*v*v,axis=1)
 vmid=(v[1:]+v[:-1])/2;energy_loss=np.r_[0,np.cumsum(np.sum(vmid**2*m['C'],axis=1)*dt)]
 work=np.r_[0,np.cumsum(np.sum(.5*(f[1:]+f[:-1])*(du[1:]-du[:-1]),axis=1))]
 energy_res=work-uu-kin-energy_loss
 reaction=ndyn['sideReactionOnPile_N'].sum(axis=1);reaction[:,1]+=ndyn['toeReactionOnPile_N']
 balance=reaction+force+m['F'].reshape(m['n'],3)[:,:2].sum(axis=0)- (a.reshape(len(times),m['n'],3)[:,:,:2]*m['M'].reshape(m['n'],3)[None,:,:2]).sum(axis=1)
 # Moment about pile head: sum(-y*Fx)+sum(Mz) including rotational inertia.
 moment=(-(-m['depth'])[None,:]*ndyn['sideReactionOnPile_N'][:,:,0]).sum(axis=1)
 inertial_moment=(m['depth'][None,:]*a.reshape(len(times),m['n'],3)[:,:,0]*m['M'][0::3]).sum(axis=1)+(a[:,2::3]*m['M'][2::3]).sum(axis=1)
 moment_balance=moment-inertial_moment
 eigen,phi=eigh(m['K'],np.diag(m['M']),subset_by_index=[0,7]);freq=np.sqrt(eigen)/(2*np.pi)
 zeta=np.sum(phi**2*m['C'][:,None],axis=0)/(2*np.sqrt(eigen))
 checks=dict(failedSteps=0,independentStaticRelativeError=float(static_error),
    elementForceMaximumDifference_N_Nm=max_element_error,
    maxEquationResidual_N_Nm=float(abs(residual).max()),relativeEquationResidual=float(abs(residual).max()/max(abs(f).max(),1)),
    maxGlobalForceBalance_N=float(abs(balance).max()),maxMomentBalance_Nm=float(abs(moment_balance).max()),
    energyRelativeResidual=float(abs(energy_res).max()/max(abs(work).max(),1)),
    dampingEnergyMonotonic=bool(np.all(np.diff(energy_loss)>=-1e-9)),
    postLoadEnergyMonotonic=bool(np.all(np.diff((uu+kin)[times>=24])<=1e-6)),
    staticAppliedVertical_N=float(-m['F'][1::3].sum()),
    staticShaftSupport_N=float(static_fields['sideReactionOnPile_N'][-1,:,1].sum()),
    staticToeSupport_N=float(static_fields['toeReactionOnPile_N'][-1]),
    peakHeadLateral_mm=float(abs(u[:,0]).max()*1000),headStaticSettlement_mm=float(-u0[1]*1000),
    maxAbsMoment_kNm=float(abs(ndyn['moment_Nm']).max()/1000),maxAbsShear_kN=float(abs(ndyn['shearGlobalX_N']).max()/1000),
    firstFrequencies_Hz=freq[:8].tolist(),firstModalDampingRatios=zeta[:8].tolist(),elapsedSeconds=time.monotonic()-started)
 assert static_error<1e-8,checks
 assert checks['relativeEquationResidual']<1e-7,checks
 assert checks['maxGlobalForceBalance_N']<.01 and checks['maxMomentBalance_Nm']<.1,checks
 assert checks['energyRelativeResidual']<1e-7 and checks['dampingEnergyMonotonic'],checks
 name=f'dt{dt:g}_mesh{step:g}'
 np.savez_compressed(OUT/f'{name}.npz',time_s=times,nodeDisp=u.reshape(len(times),m['n'],3),nodeVel=v.reshape(len(times),m['n'],3),nodeAccel=a.reshape(len(times),m['n'],3),
    appliedHeadIncrement_N=force,strainEnergy_J=uu,kineticEnergy_J=kin,dissipatedEnergy_J=energy_loss,externalWork_J=work,energyResidual_J=energy_res,
    staticU=np.array(stages),depth_m=m['depth'],**ndyn)
 save(f'{name}-qa.json',checks)
 print(name,json.dumps(checks),flush=True)
 return dict(mesh=m,time=times,u=u,v=v,a=a,fields=ndyn,static=static_fields,checks=checks,force=force,work=work,loss=energy_loss,strain=uu,kinetic=kin,name=name)

def main():
 OUT.mkdir(parents=True,exist_ok=True);ops,dll=backend.load_backend();ops.logFile(str(OUT/'opensees.log'),'-noEcho')
 benchmark=backend.verification(ops);assert benchmark['passed']
 runs=[solve(ops,.02,1.),solve(ops,.01,1.),solve(ops,.005,1.),solve(ops,.01,.5),solve(ops,.01,.25),solve(ops,.01,.125)]
 # The finest mesh drives the film; coarse cases remain diagnostic evidence.
 base=runs[5]
 def comparison(a,b):
  # Common times; spatial comparison uses head response and global peak moments.
  idx=np.round(a['time']/(b['time'][1]-b['time'][0])).astype(int)
  head=(a['u'][:,0]-b['u'][idx,0]);den=max(abs(b['u'][:,0]).max(),1e-20)
  return dict(headLateralRelativeL2=float(np.linalg.norm(head)/max(np.linalg.norm(b['u'][idx,0]),1e-20)),
    headLateralPeakDifferenceRatio=float(abs(head).max()/den),
    peakMomentRelativeDifference=abs(a['checks']['maxAbsMoment_kNm']/b['checks']['maxAbsMoment_kNm']-1),
    peakShearRelativeDifference=abs(a['checks']['maxAbsShear_kN']/b['checks']['maxAbsShear_kN']-1))
 checks=dict(cantileverBackendBenchmark=benchmark,timeStepCoarse=comparison(runs[0],runs[1]),timeStepFine=comparison(runs[1],runs[2]),
   mesh1to05=comparison(runs[1],runs[3]),mesh05to025=comparison(runs[3],runs[4]),meshRefinement=comparison(runs[4],runs[5]))
 checks['passed']=checks['timeStepFine']['headLateralRelativeL2']<.01 and checks['timeStepFine']['peakMomentRelativeDifference']<.01 and checks['meshRefinement']['headLateralRelativeL2']<.02 and checks['meshRefinement']['peakShearRelativeDifference']<.03
 assert checks['passed'],checks
 m=base['mesh'];idx=np.arange(0,len(base['time']),5)
 def r(v,d=9):return np.round(np.asarray(v),d).tolist()
 meta=dict(kind='independent-single-pile-linear-dynamic-example',parameters=P,soilLayers=LAYERS,
   units=dict(length='m',time='s',force='N',moment='N m',stress='Pa',stiffness='N/m',dashpot='N s/m',mass='kg',rotation='rad'),
   coordinates='Global X horizontal, Y upward, Z out of plane; pile head local=(0,0,0); local beam X down, local Y global+X. All arrays retain physical magnitude.',
   scope='One 52m x 1m pile with assumed linear springs, damping and nodal cap load. Not the 947-pile foundation, no coupled tower load, no as-built settlement/capacity prediction.',
   source=dict(pdf='research/structural/zhu2012-http.pdf',sha256=sha(ROOT/'research/structural/zhu2012-http.pdf'),
      title='Structural Design Challenges of Shanghai Tower',authors='Yi Zhu; Dennis Poon; Emmanuel E. Velivasakis; Steve Zuo; Paul Fu',year=None,
      evidence='PDF p8: 947 piles, 1m diameter, 52–56m effective length, 6m mat, toe layer9-2-1; Table1 soil depths. p10 mat top -25.4m; 31.4m pile head derived from top+6m thickness, not measured as-built.'),
   assumptions=['E=32GPa, rho=2500kg/m3, all stiffnesses/dashpots and 8MN head load are assumptions, not site calibrated.','Head is free to rotate; zero imposed head moment. P/G cap tributary lumped mass participates, no rigid raft stiffness or group interaction.','Elastic beam, small displacement, linear t-z/p-y/toe analogues; no gapping/yielding, groundwater coupling, consolidation, radiation-domain or continuum soil-stress solve.','Dynamic load is prescribed 40s synthetic 0.3MN lateral envelope plus +/-0.4MN vertical modulation, not CFD or tower-reaction transfer.','Depth corrected to source-derived31.4m; previous display model33m differs. Do not move source layers to match the old model.'],
   formulation=dict(shaft='ky = shaftTangent[N/m^3] * circumference[m] * tributaryLength[m]',lateral='kx = lateralTangent[N/m^2] * tributaryLength[m]',
       dashpot='c = 0.01s * k',mass='rho*A*tributaryLength for translations; rho*I*tributaryLength for rotation; head cap mass P/g added to X,Y',
       governing='M u_ddot + C u_dot + K u = F; solve actual OpenSees Newmark(gamma=.5,beta=.25)',
       energy='Incremental about gravity equilibrium: W=sum(F_mid dot du); D=sum(v_mid^T C v_mid dt); W=U+T+D',
       soilStress='side shear tau_z = soil vertical reaction / (pi*D*tributaryLength); this is interface traction, not continuum soil von Mises'),
   solver=dict(name='local Zwind/OpenSees',version=ops.version(),binary=str(backend.ZWIND/'bin/opensees.pyd'),binarySHA256=sha(backend.ZWIND/'bin/opensees.pyd'),scriptSHA256=sha(__file__)),
   nodes=[dict(id=i+1,xyz_m=[0.,-float(d),0.],absoluteDepth_m=float(d+P['head_depth_below_grade_m'])) for i,d in enumerate(m['depth'])],springs=m['springs'],
   visualization=dict(noPerFrameNormalization=True,magnificationMustBeLabeled=True,finiteElementBeamFieldsOnly=True,doNotPaintContinuumStressOnSoil=True,
      sign='axialTensionPositive_N: negative compression; sideReactionOnPile_N uses global signs; moment/shear each array stores [head-end,toe-end] internal section values'),
   validation=checks)
 meta['selectedCase']=base['name'];meta['outputTimeStep_s']=.05
 save('case.json',meta)
 dynamic={k:r(v[idx],4 if ('Force' in k or 'Reaction' in k or k.endswith('_Nm') or k.endswith('_N')) else 9) for k,v in base['fields'].items()}
 dynamic.update(time_s=r(base['time'][idx],6),appliedHeadIncrement_N=r(base['force'][idx],4),
   externalWork_J=r(base['work'][idx],5),dissipatedEnergy_J=r(base['loss'][idx],5),strainEnergy_J=r(base['strain'][idx],5),kineticEnergy_J=r(base['kinetic'][idx],5))
 dynamic['shaftInterfaceShearStress_Pa']=r(base['fields']['sideReactionOnPile_N'][idx,:,1]/(math.pi*P['diameter_m']*m['trib']),4)
 dynamic['pileNormalStressExtreme_MPa']=r((abs(base['fields']['axialTensionPositive_N'][idx])/m['A']+abs(base['fields']['moment_Nm'][idx])*P['diameter_m']/2/m['I'])/1e6,6)
 save('dynamic.json',dynamic)
 save('static.json',dict(loadFactor=r(np.arange(41)/40,3),**{k:r(v,6) for k,v in base['static'].items()}))
 save('validation.json',dict(**checks,base=base['checks'],dateUTC=datetime.datetime.now(datetime.timezone.utc).isoformat()))
 print('ALL_VALIDATED',json.dumps(checks),flush=True)

if __name__=='__main__':main()
