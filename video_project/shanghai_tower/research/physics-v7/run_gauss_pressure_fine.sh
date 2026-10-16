#!/bin/bash
set -euo pipefail
physics_root=/data/home/fusion/project/shanghai_physics_v7
source "$physics_root/runtime/openfoam-env.sh"
/home/fusion/miniconda3/envs/cfd_flow/bin/python - <<'PY'
from pathlib import Path
import shutil,re,json
r=Path('/data/home/fusion/project/shanghai_physics_v7');dst=r/'steady-gauss-pressure-L9';dst.mkdir(exist_ok=True)
for sub in ['constant','system']:shutil.copytree(r/'foam-tower-L9'/sub,dst/sub,dirs_exist_ok=True)
shutil.copytree(r/'urans-tower-L9/7',dst/'7',dirs_exist_ok=True)
for name in ['fvSchemes','fvSolution','controlDict']:shutil.copyfile(r/'steady-gauss-pressure-L12/system'/name,dst/'system'/name)
p=dst/'system/controlDict';s=re.sub(r'endTime\s+\d+;','endTime 6500;',p.read_text());p.write_text(s)
(dst/'numerical-provenance.json').write_text(json.dumps({'source':'L9 actual URANS at physical 7s used solely initial guess; subsequent SIMPLE times iterations, not seconds','pressureGradient':'Gauss linear','quality':{'acceptedForFilm':False}},indent=2)+'\n')
PY
cd "$physics_root/steady-gauss-pressure-L9"
decomposePar -latestTime > decompose.log 2>&1
mpirun.openmpi --mca btl self,vader --mca pml ob1 -np 24 simpleFoam -parallel > run.log 2>&1 & echo $! > job.pid
wait
