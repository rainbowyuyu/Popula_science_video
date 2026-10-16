#!/bin/bash
set -euo pipefail
physics_root=/data/home/fusion/project/shanghai_physics_v7
source "$physics_root/runtime/openfoam-env.sh"
/home/fusion/miniconda3/envs/cfd_flow/bin/python - <<'PY'
from pathlib import Path
import shutil,re,json
r=Path('/data/home/fusion/project/shanghai_physics_v7');src=r/'foam-tower-L9';dst=r/'steady-positive-L9';dst.mkdir(exist_ok=True)
for sub in ['constant','system','0']:shutil.copytree(src/sub,dst/sub,dirs_exist_ok=True)
for name in ['fvSchemes','fvSolution','controlDict']:shutil.copyfile(r/'steady-positive-L12/system'/name,dst/'system'/name)
p=dst/'system/controlDict';s=p.read_text();s=re.sub(r'endTime\s+\d+;','endTime 12000;',s);p.write_text(s)
(dst/'initialization-provenance.json').write_text(json.dumps({'source':'steady-positive-L12 / 3539','method':'OpenFOAM mapFields cellPointInterpolate as initial guess only','quality':{'acceptedForFilm':False}},indent=2)+'\n')
PY
cd "$physics_root/steady-positive-L9"
mapFields ../steady-positive-L12 -sourceTime 3539 -consistent -mapMethod cellPointInterpolate > mapFields.log 2>&1
decomposePar > decompose.log 2>&1
mpirun.openmpi --mca btl self,vader --mca pml ob1 -np 24 simpleFoam -parallel > run.log 2>&1 & echo $! > job.pid
wait

