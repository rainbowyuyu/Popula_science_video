#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7
source "$base/runtime/openfoam-env.sh"
cd "$base/foam-tower-L12"
decomposePar > decompose.log 2>&1
mpirun.openmpi --mca btl self,vader --mca pml ob1 -np 12 simpleFoam -parallel > run.log 2>&1 & echo $! > job.pid
wait
