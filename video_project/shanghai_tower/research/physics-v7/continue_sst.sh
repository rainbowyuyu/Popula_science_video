#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7
cd "$base"
name=twist120-sst-prism-cont
mkdir -p "$name"
cp twist120-sst-prism/restart_flow.dat "$name/restart_flow.dat"
ln -sf ../twist120-wallfn-coarse/tower.su2 "$name/tower.su2"
/home/fusion/miniconda3/envs/cfd_flow/bin/python - <<'PY'
from pathlib import Path
s=Path('twist120-sst-prism/case.cfg').read_text().replace('RESTART_SOL= NO','RESTART_SOL= YES').replace('CFL_NUMBER= 0.3','CFL_NUMBER= 2.0').replace('ITER= 3000','ITER= 8000')
s+='\nSOLUTION_FILENAME= restart_flow.dat\n'
Path('twist120-sst-prism-cont/case.cfg').write_text(s)
PY
cd "$name"
OMP_NUM_THREADS=1 /home/fusion/miniconda3/envs/farm/bin/mpirun -n 12 "$base/runtime/SU2_CFD-safeguarded" case.cfg > run.log 2>&1 & echo $! > job.pid
wait
