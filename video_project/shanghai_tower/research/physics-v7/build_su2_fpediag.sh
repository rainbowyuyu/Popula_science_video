#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7/runtime
cd "$base/SU2-8.5.0"
tar xzf "$base/eigen-3.4.0.tar.gz" --strip-components=1 -C externals/eigen
tar xzf "$base/MEL.tar.gz" --strip-components=1 -C externals/mel
/home/fusion/miniconda3/envs/cfd_flow/bin/python preconfigure.py --no-codi --no-medi --no-opdi --no-mpp --no-coolprop --no-mel --no-fado --no-mlpcpp --no-eigen
export PYTHONPATH="$base/build-deps"
export PATH="$base/build-deps/bin:/home/fusion/miniconda3/envs/farm/bin:/usr/bin:/bin"
export MPICH_CC=/usr/bin/gcc
export MPICH_CXX=/usr/bin/g++
export CC=/home/fusion/miniconda3/envs/farm/bin/mpicc
export CXX=/home/fusion/miniconda3/envs/farm/bin/mpicxx
/home/fusion/miniconda3/envs/cfd_flow/bin/python -m mesonbuild.mesonmain setup build-safe --prefix "$base/safeguarded" -Dcustom-mpi=true -Dwith-omp=false -Denable-cgns=false -Denable-tecio=false -Dcpu-arch=native
/home/fusion/miniconda3/envs/cfd_flow/bin/python -m ninja -C build-safe -j 24 SU2_CFD/src/SU2_CFD
cp build-safe/SU2_CFD/src/SU2_CFD "$base/SU2_CFD-fpediag"
sha256sum "$base/SU2_CFD-fpediag"
