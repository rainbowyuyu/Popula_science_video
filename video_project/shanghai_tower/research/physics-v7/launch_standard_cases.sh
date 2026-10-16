#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7
mpi=/home/fusion/miniconda3/envs/farm/bin/mpirun
cd "$base"
mkdir -p twist120-standard-prism twist120-standard-tet8
cp safe-standard-prism-coarse.cfg twist120-standard-prism/case.cfg
ln -sf ../twist120-wallfn-coarse/tower.su2 twist120-standard-prism/tower.su2
cp safe-standard-tet8.cfg twist120-standard-tet8/case.cfg
ln -sf ../twist120-tet8/tower.su2 twist120-standard-tet8/tower.su2
cd "$base/twist120-standard-prism"
OMP_NUM_THREADS=1 "$mpi" -n 12 "$base/runtime/SU2_CFD-safeguarded" case.cfg > run.log 2>&1 & echo $! > job.pid
cd "$base/twist120-standard-tet8"
OMP_NUM_THREADS=1 "$mpi" -n 12 "$base/runtime/SU2_CFD-safeguarded" case.cfg > run.log 2>&1 & echo $! > job.pid
wait
