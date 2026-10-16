#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7
mpi=/home/fusion/miniconda3/envs/farm/bin/mpirun
cd "$base"
mkdir -p official-flatplate-safe twist120-safe-prism twist120-safe-tet8
cp official-flatplate/case.cfg official-flatplate-safe/case.cfg
ln -sf ../official-flatplate/mesh.su2 official-flatplate-safe/mesh.su2
cp safe-prism-coarse.cfg twist120-safe-prism/case.cfg
ln -sf ../twist120-wallfn-coarse/tower.su2 twist120-safe-prism/tower.su2
cp safe-tet8.cfg twist120-safe-tet8/case.cfg
ln -sf ../twist120-tet8/tower.su2 twist120-safe-tet8/tower.su2
cd "$base/official-flatplate-safe"
OMP_NUM_THREADS=1 "$mpi" -n 4 "$base/runtime/SU2_CFD-safeguarded" case.cfg > run.log 2>&1 & echo $! > job.pid
cd "$base/twist120-safe-prism"
OMP_NUM_THREADS=1 "$mpi" -n 12 "$base/runtime/SU2_CFD-safeguarded" case.cfg > run.log 2>&1 & echo $! > job.pid
cd "$base/twist120-safe-tet8"
OMP_NUM_THREADS=1 "$mpi" -n 12 "$base/runtime/SU2_CFD-safeguarded" case.cfg > run.log 2>&1 & echo $! > job.pid
wait
