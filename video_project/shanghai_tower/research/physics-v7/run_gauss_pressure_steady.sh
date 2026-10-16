#!/bin/bash
set -euo pipefail
physics_root=/data/home/fusion/project/shanghai_physics_v7
source "$physics_root/runtime/openfoam-env.sh"
/home/fusion/miniconda3/envs/cfd_flow/bin/python - <<'PY'
from pathlib import Path
import shutil,re
r=Path('/data/home/fusion/project/shanghai_physics_v7');src=r/'foam-tower-L12';dst=r/'steady-gauss-pressure-L12';dst.mkdir(exist_ok=True)
for sub in ['constant','system','3539']:shutil.copytree(src/sub,dst/sub,dirs_exist_ok=True)
shutil.copyfile(r/'steady-positive-L12/system/fvSchemes',dst/'system/fvSchemes')
p=dst/'system/controlDict';s=re.sub(r'stopAt\s+\w+;','stopAt endTime;',p.read_text());s=re.sub(r'endTime\s+\d+;','endTime 10000;',s);p.write_text(s)
PY
/home/fusion/miniconda3/envs/cfd_flow/bin/python "$physics_root/repair_pressure_gradient.py" "$physics_root/steady-gauss-pressure-L12"
/home/fusion/miniconda3/envs/cfd_flow/bin/python "$physics_root/add_body_force_audit.py" "$physics_root/steady-gauss-pressure-L12"
cd "$physics_root/steady-gauss-pressure-L12"
decomposePar -latestTime > decompose.log 2>&1
mpirun.openmpi --mca btl self,vader --mca pml ob1 -np 12 simpleFoam -parallel > run.log 2>&1 & echo $! > job.pid
wait
