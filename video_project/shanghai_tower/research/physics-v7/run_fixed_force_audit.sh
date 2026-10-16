#!/bin/bash
set -euo pipefail
physics_root=/data/home/fusion/project/shanghai_physics_v7
source "$physics_root/runtime/openfoam-env.sh"
/home/fusion/miniconda3/envs/cfd_flow/bin/python - <<'PY'
from pathlib import Path
import shutil
r=Path('/data/home/fusion/project/shanghai_physics_v7');src=r/'foam-tower-L12';dst=r/'force-audit-3539';dst.mkdir(exist_ok=True)
for sub in ['constant','system','3539']:shutil.copytree(src/sub,dst/sub,dirs_exist_ok=True)
(dst/'system/controlDict').write_text('''FoamFile { version 2.0; format ascii; class dictionary; object controlDict; }
application simpleFoam; startFrom latestTime; startTime 3539; endTime 3539; deltaT 1;
writeControl timeStep; writeInterval 1; writeFormat ascii; writePrecision 15;
functions
{
 forcesBody { type forces; libs ("libforces.so"); patches (tower); rho rhoInf; rhoInf 1.225; CofR (0 0 0); log true; }
 forcesOuter { type forces; libs ("libforces.so"); patches (inlet outlet sides ceiling ground); rho rhoInf; rhoInf 1.225; CofR (0 0 0); log true; }
}
''')
PY
cd "$physics_root/force-audit-3539"
simpleFoam -postProcess -time 3539 > audit.log 2>&1
tail -30 audit.log
