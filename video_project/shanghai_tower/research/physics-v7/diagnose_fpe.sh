#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7
cd "$base"
mkdir -p twist120-fpe-diagnostic
cp safe-prism-coarse.cfg twist120-fpe-diagnostic/case.cfg
ln -sf ../twist120-wallfn-coarse/tower.su2 twist120-fpe-diagnostic/tower.su2
cd twist120-fpe-diagnostic
RAINBOW_TRAP_FPE=1 OMP_NUM_THREADS=1 gdb -batch -ex run -ex "bt 16" --args "$base/runtime/SU2_CFD-fpediag" case.cfg > fpe-backtrace.log 2>&1
