"""Probe the installed native Zwind/ZDyn kernel, without running the turbine case."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
import zdynpywin.zdyn as z

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research/episode3v7/physics'
OUT.mkdir(parents=True, exist_ok=True)

z.wipe()
z.model('BasicBuilder', '-ndm', 3, '-ndf', 6)
z.node(1, 0., 0., 0.)
z.node(2, 0., 0., 3.)
z.fix(1, 1, 1, 1, 1, 1, 1)
z.geomTransf('Linear', 1, 0., 1., 0.)
E, G, b, h, L, F = 10e9, 0.65e9, .24, .24, 3., 1000.
A, I = b*h, b*h**3/12
J = b*h**3*(1/3-.21*(h/b)*(1-h**4/(12*b**4)))
z.element('elasticBeamColumn', 1, 1, 2, A, E, G, J, I, I, 1)
z.timeSeries('Constant', 1)
z.pattern('Plain', 1, 1)
z.load(2, F, 0., 0., 0., 0., 0.)
z.constraints('Plain')
z.numberer('RCM')
z.system('BandGeneral')
z.test('NormDispIncr', 1e-12, 30, 0)
z.algorithm('Linear')
z.integrator('LoadControl', 1.)
z.analysis('Static')
status = z.analyze(1)
z.reactions()
u = np.asarray(z.nodeDisp(2))
r = np.asarray(z.nodeReaction(1))
analytical = F*L**3/(3*E*I)
result = {
    'native_module': z.__file__,
    'native_sha256': hashlib.sha256(Path(z.__file__).read_bytes()).hexdigest(),
    'native_version': z.version(), 'python': sys.version,
    'benchmark': 'Euler-Bernoulli fixed-free 3 m timber square column, 1 kN lateral tip load',
    'parameters_SI': dict(E=E, G=G, b=b, h=h, L=L, F=F),
    'status': status, 'tip_displacement': u.tolist(),
    'support_reaction': r.tolist(),
    'element_global_end_force': list(z.eleForce(1)),
    'element_local_end_force': list(z.eleResponse(1, 'localForce')),
    'analytical_tip_displacement_m': analytical,
    'relative_error': abs(u[0]-analytical)/analytical,
    'force_residual_N': (r[:3]+[F, 0., 0.]).tolist(),
    'moment_residual_Nm': (r[3:]+np.cross([0., 0., L], [F, 0., 0.])).tolist(),
    'verified': bool(status == 0 and abs(u[0]-analytical)/analytical < 1e-10),
}
(OUT/'native-probe.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
z.wipe()
