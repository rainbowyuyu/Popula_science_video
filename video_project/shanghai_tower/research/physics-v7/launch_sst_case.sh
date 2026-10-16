#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7
cd "$base"
mkdir -p twist120-sst-prism
cp safe-sst-prism-coarse.cfg twist120-sst-prism/case.cfg
ln -sf ../twist120-wallfn-coarse/tower.su2 twist120-sst-prism/tower.su2
cd twist120-sst-prism
OMP_NUM_THREADS=1 /home/fusion/miniconda3/envs/farm/bin/mpirun -n 12 "$base/runtime/SU2_CFD-safeguarded" case.cfg > run.log 2>&1 & echo $! > job.pid
wait
