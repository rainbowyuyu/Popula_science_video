"""Deterministic two-element Windkessel experiment; NOT a patient-specific model."""
from pathlib import Path
import json
import numpy as np
from scipy.integrate import solve_ivp

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/hypertension/physics.json'
HR=72.0
PERIOD=60/HR
SV=70.0
EJECT=.31
PV=5.0

def flow(t):
    phase=np.asarray(t)%PERIOD
    return np.where(phase<EJECT,SV*np.pi/(2*EJECT)*np.sin(np.pi*phase/EJECT),0)

def solve(name,R,C):
    end=30*PERIOD
    fun=lambda t,p: [(float(flow(t))-(p[0]-PV)/R)/C]
    sol=solve_ivp(fun,[0,end],[PV+R*SV/PERIOD],rtol=1e-8,atol=1e-9,max_step=.002,dense_output=True)
    sample=np.linspace(end-PERIOD,end,301)
    pressure=sol.sol(sample)[0]
    q=flow(sample)
    # Independently check cycle volume balance and periodic steady state.
    qout=(pressure-PV)/R
    balance=float(np.trapezoid(q-qout,sample)-C*(pressure[-1]-pressure[0]))
    assert abs(balance)<.015 and abs(pressure[-1]-pressure[0])<.02
    return {'id':name,'R':R,'C':C,'pv':PV,'heartRate':HR,'strokeVolume':SV,
        'period':PERIOD,'samples':[{'phase':round(float(a),6),'pressure':round(float(p),4),'inflow':round(float(i),4),'outflow':round(float(o),4)} for a,p,i,o in zip(np.linspace(0,1,301),pressure,q,qout)],
        'systolic':round(float(pressure.max()),2),'diastolic':round(float(pressure.min()),2),
        'mean':round(float(np.trapezoid(pressure,sample)/PERIOD),2),
        'pulsePressure':round(float(np.ptp(pressure)),2),'cycleVolumeResidualMl':balance}

results=[solve('baseline',1.02,1.65),solve('higher_resistance',1.5,1.65),solve('stiffer_artery',1.02,.72)]
payload={'schema':'rainbow.windkessel.v1','model':'Two-element Windkessel',
    'equation':'C dP/dt = Qin - (P-Pv)/R',
    'units':{'pressure':'mmHg','flow':'mL/s','R':'mmHg s/mL','C':'mL/mmHg'},
    'assumptions':['Lumped parameters; uniform arterial pressure','Periodic prescribed inflow','R and C are independent conceptual controls','No wave reflection, autoregulation or patient anatomy in solver'],
    'display':'教学简化模型 · 非个体预测','anatomyIsSolverGeometry':False,
    'cases':{x['id']:x for x in results},
    'radiusExperiment':{'assumptions':'Ideal steady laminar rigid cylinder; fixed length and viscosity',
       'radiusRatio':[1.0,.9,.8,.7], 'resistanceRatio':[round(x**-4,4) for x in [1,.9,.8,.7]]},
    'software':{'numpy':np.__version__,'scipy':__import__('scipy').__version__}}
OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf8')
for c in results:print(c['id'],c['systolic'],c['diastolic'],c['mean'],c['cycleVolumeResidualMl'])
