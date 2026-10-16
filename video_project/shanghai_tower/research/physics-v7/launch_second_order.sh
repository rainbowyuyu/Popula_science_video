#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7
cd "$base"
mkdir -p twist120-SA-second-order
cp twist120-standard-prism-cont/restart_flow.dat twist120-SA-second-order/restart_flow.dat
ln -sf ../twist120-wallfn-coarse/tower.su2 twist120-SA-second-order/tower.su2
/home/fusion/miniconda3/envs/cfd_flow/bin/python - <<'PY'
from pathlib import Path
s=Path('twist120-standard-prism-cont/case.cfg').read_text().replace('MUSCL_FLOW= NO','MUSCL_FLOW= YES').replace('CFL_NUMBER= 4.0','CFL_NUMBER= 2.0').replace('ITER= 8000','ITER= 8000')
Path('twist120-SA-second-order/case.cfg').write_text(s)
PY
cd twist120-SA-second-order
OMP_NUM_THREADS=1 /home/fusion/miniconda3/envs/farm/bin/mpirun -n 12 "$base/runtime/SU2_CFD-safeguarded" case.cfg > run.log 2>&1 & echo $! > job.pid
wait
