"""Mass orthogonality and participation using the actual solved node vectors."""
import json
import numpy as np
import solve_shell_tower as st

report={}
for name in ['coarse','refined']:
    folder=st.OUT/name;g=json.loads((folder/'graph.json').read_text('utf8'));a=np.load(folder/'modes.npz')
    mass=np.array([n['mass6'] for n in g['nodes']]);v=a['vectors'];flat=v.reshape(len(v),-1);m=mass.ravel()
    gram=(flat*m)@flat.T;diag=np.diag(gram);corr=gram/np.sqrt(diag[:,None]*diag[None,:]);off=corr-np.eye(len(corr))
    participation={}
    for d,label in [(0,'X'),(2,'Z')]:
        influence=np.zeros_like(mass);influence[:,d]=1.
        p=(flat*m)@influence.ravel();effective=p*p/diag;total=float(mass[:,d].sum())
        participation[label]=dict(effectiveModalMass_kg=effective.tolist(),fractionOfTotal=(effective/total).tolist(),sumFraction=float(effective.sum()/total))
    report[name]=dict(positiveEigenvalues=bool(np.all(a['eigenvalues']>0)),generalizedMass=diag.tolist(),maximumMassOrthogonalityError=float(np.max(abs(off))),participation=participation,
                      scope='Eight computed modes; participation sum is partial and is not a claim that eight modes suffice for every response spectrum.')
    assert report[name]['positiveEigenvalues'] and report[name]['maximumMassOrthogonalityError']<1e-6
st.save(st.OUT/'verification/modal-qa.json',report)
print({k:dict(maxOrthogonalityError=v['maximumMassOrthogonalityError'],sumX=v['participation']['X']['sumFraction'],sumZ=v['participation']['Z']['sumFraction']) for k,v in report.items()})
