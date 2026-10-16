#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7
source "$base/runtime/openfoam-env.sh"
cd "$base/foam-tower-L12"
cp run.log run-stage1.log
cp system/fvSchemes fvSchemes-stage1
cp system/controlDict controlDict-stage1
reconstructPar -latestTime > reconstruct-stage1.log 2>&1
foamToVTK -latestTime -fields '(p U k omega nut yPlus)' > vtk-stage1.log 2>&1
mv VTK VTK-stage1
cp ../second-order-fvSchemes system/fvSchemes
/home/fusion/miniconda3/envs/cfd_flow/bin/python - <<'PY'
from pathlib import Path
p=Path('system/controlDict');s=p.read_text().replace('stopAt writeNow;','stopAt endTime;').replace('endTime 4000;','endTime 8000;');p.write_text(s)
PY
mpirun.openmpi --mca btl self,vader --mca pml ob1 -np 12 simpleFoam -parallel > run-stage2.log 2>&1 & echo $! > job.pid
wait
