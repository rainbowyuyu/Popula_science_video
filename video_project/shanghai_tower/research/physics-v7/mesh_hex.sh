#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7
source "$base/runtime/openfoam-env.sh"
cd "$base/foam-hex-L4"
blockMesh > blockMesh.log 2>&1
decomposePar -force > decompose.log 2>&1
mpirun.openmpi --mca btl self,vader --mca pml ob1 -np 12 snappyHexMesh -parallel -overwrite > snappy.log 2>&1
reconstructParMesh -constant > reconstructMesh.log 2>&1
checkMesh -constant -allGeometry -allTopology > checkMesh.log 2>&1
