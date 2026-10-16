#!/bin/bash
set -euo pipefail
physics_root=/data/home/fusion/project/shanghai_physics_v7
source "$physics_root/runtime/openfoam-env.sh"
cd "$physics_root/urans-tower-L12"
decomposePar > decompose.log 2>&1
mpirun.openmpi --mca btl self,vader --mca pml ob1 -np 12 pimpleFoam -parallel > run.log 2>&1 & echo $! > job.pid
wait
