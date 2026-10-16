"""Check teaching calculations. Inputs are assumptions, never Tesla specs."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
m=1500.;g=9.81;area=3.;pressure=8000.
result={'evidenceClass':'fixed-teaching-example','officialTeslaMeasurements':False,
 'inputs':{'mass_kg':m,'gravity_m_s2':g,'effectiveArea_m2':area,'illustrativePressure_Pa':pressure},
 'results':{'weight_N':m*g,'balancePressure_Pa':m*g/area,'pressureForce_N':pressure*area,'ceilingNormal_N':pressure*area-m*g},
 'equations':['F_pressure = delta_p * A','ceiling normal = delta_p * A - m*g','sum F = m*a','torque = r cross F'],
 'limits':'Uniform effective pressure and flat ceiling; no leakage/CFD/real vehicle solver. Motion is slowed kinematic illustration.'}
assert abs(result['results']['balancePressure_Pa']-4905)<1e-9
assert result['results']['ceilingNormal_N']>0
p=root/'work/qa/physics.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result['results']))
