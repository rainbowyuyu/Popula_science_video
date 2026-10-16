#!/bin/bash
set -euo pipefail
physics_root=/data/home/fusion/project/shanghai_physics_v7
source "$physics_root/runtime/openfoam-env.sh"
/home/fusion/miniconda3/envs/cfd_flow/bin/python "$physics_root/prepare_urans.py" "$physics_root/steady-positive-L9" "$physics_root/urans-tower-L9" --initial 0 --ranks 24
cd "$physics_root/urans-tower-L9"
foamDictionary system/controlDict -entry maxCo -set 4
foamDictionary system/controlDict -entry maxDeltaT -set 0.05
decomposePar > decompose.log 2>&1
mpirun.openmpi --mca btl self,vader --mca pml ob1 -np 24 pimpleFoam -parallel > run.log 2>&1 & echo $! > job.pid
wait
