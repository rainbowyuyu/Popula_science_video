#!/bin/bash
set -euo pipefail
physics_root=/data/home/fusion/project/shanghai_physics_v7
source "$physics_root/runtime/openfoam-env.sh"
/home/fusion/miniconda3/envs/cfd_flow/bin/python - <<'PY'
from pathlib import Path
import re,shutil,json
r=Path('/data/home/fusion/project/shanghai_physics_v7');dst=r/'foam-refined2-L12'
for name in ['fvSchemes','fvSolution','controlDict']:shutil.copyfile(r/'steady-positive-L12/system'/name,dst/'system'/name)
p=dst/'system/controlDict';s=re.sub(r'endTime\s+\d+;','endTime 6000;',p.read_text());s=re.sub(r'stopAt\s+\w+;','stopAt endTime;',s);p.write_text(s)
p=dst/'system/fvSchemes';p.write_text(p.read_text().replace('bounded Gauss linearUpwindV grad(U)','bounded Gauss upwind'))
p=dst/'system/decomposeParDict';s=re.sub(r'numberOfSubdomains \d+;','numberOfSubdomains 48;',p.read_text());s=re.sub(r'n\s*\([0-9 ]+\);','n (4 4 3);',s);p.write_text(s)
(dst/'numerical-provenance.json').write_text(json.dumps({'method':'8x mesh uniform refinement of stable coarse topology, first-order bootstrap. Unaccepted pending second-order momentum, field stability, conservation and mesh sensitivity.','quality':{'acceptedForFilm':False}},indent=2)+'\n')
PY
cd "$physics_root/foam-refined2-L12"
decomposePar > decompose.log 2>&1
mpirun.openmpi --mca btl self,vader --mca pml ob1 -np 48 simpleFoam -parallel > run.log 2>&1 & echo $! > job.pid
wait
