#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7
source "$base/runtime/openfoam-env.sh"
mkdir -p "$base/foam-snappy-serial-L4"
cd "$base/foam-snappy-serial-L4"
cp -r ../foam-snappy-L4/0 ../foam-snappy-L4/system .
mkdir -p constant
cp -r ../foam-snappy-L4/constant/triSurface ../foam-snappy-L4/constant/transportProperties ../foam-snappy-L4/constant/turbulenceProperties constant/
blockMesh > blockMesh.log 2>&1
snappyHexMesh -overwrite > snappy.log 2>&1
checkMesh -allGeometry -allTopology > checkMesh.log 2>&1
