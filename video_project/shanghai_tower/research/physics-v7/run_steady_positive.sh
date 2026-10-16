#!/bin/bash
set -euo pipefail
physics_root=/data/home/fusion/project/shanghai_physics_v7
source "$physics_root/runtime/openfoam-env.sh"
/home/fusion/miniconda3/envs/cfd_flow/bin/python "$physics_root/prepare_steady_positive.py"
cd "$physics_root/steady-positive-L12"
decomposePar -latestTime > decompose.log 2>&1
mpirun.openmpi --mca btl self,vader --mca pml ob1 -np 12 simpleFoam -parallel > run.log 2>&1 & echo $! > job.pid
wait
