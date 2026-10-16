"""Fixed-field native Gauss theorem diagnostic; does not advance any solver."""
from pathlib import Path
import shutil,re,json
r=Path('/data/home/fusion/project/shanghai_physics_v7');src=r/'foam-tower-L12';dst=r/'gradient-audit-3539';dst.mkdir(exist_ok=True)
for sub in ['constant','system']:shutil.copytree(src/sub,dst/sub,dirs_exist_ok=True)
(dst/'3539').mkdir(exist_ok=True)
raw=(src/'3539/p').read_bytes()
for name in ['pLimited','pGauss']:(dst/'3539'/name).write_bytes(re.sub(rb'object\s+p;',b'object '+name.encode()+b';',raw,count=1))
p=dst/'system/fvSchemes';s=p.read_text();s=re.sub(r'gradSchemes\s*\{.*?\}', '''gradSchemes { default Gauss linear; grad(pLimited) cellLimited Gauss linear 1; grad(pGauss) Gauss linear; }''',s,flags=re.S);p.write_text(s)
(dst/'system/controlDict').write_text('''FoamFile { version 2.0; format ascii; class dictionary; object controlDict; }
application postProcess; startFrom startTime; startTime 3539; endTime 3539; deltaT 1;
writeControl timeStep; writeInterval 1; writeFormat ascii; writePrecision 15;
functions
{
  gradLimited { type grad; libs ("libfieldFunctionObjects.so"); field pLimited; result gradLimited; }
  gradGauss { type grad; libs ("libfieldFunctionObjects.so"); field pGauss; result gradGauss; }
  volumeGradient { type volFieldValue; libs ("libfieldFunctionObjects.so"); regionType all; operation volIntegrate; fields (gradLimited gradGauss); writeFields false; log true; }
}
''')
(dst/'README.json').write_text(json.dumps({'meaning':'Same fixed native p checkpoint used twice. Only gradient discretization differs. Gauss volume sum equals native boundary pressure area-vector sum by Gauss cancellation. No flow solve, no field value edits.','sourceCase':str(src),'checkpoint':3539,'rho':1.225},indent=2)+'\n')
