#!/bin/bash
foam_runtime_root=/data/home/fusion/project/shanghai_physics_v7/runtime/openfoam
export WM_PROJECT_DIR="$foam_runtime_root/usr/share/openfoam"
export FOAM_ETC="$WM_PROJECT_DIR/etc"
export FOAM_LIBBIN="$foam_runtime_root/usr/lib"
export FOAM_APPBIN="$foam_runtime_root/usr/bin"
export WM_PROJECT=OpenFOAM
export WM_PROJECT_VERSION=v1912
export WM_OPTIONS=linux64GccDPInt32Opt
export PATH="$foam_runtime_root/usr/bin:/usr/bin:/bin"
export LD_LIBRARY_PATH="$foam_runtime_root/usr/lib:$foam_runtime_root/usr/lib/openmpi-system:$foam_runtime_root/usr/lib/x86_64-linux-gnu"
export OPAL_PREFIX="$foam_runtime_root/usr"
