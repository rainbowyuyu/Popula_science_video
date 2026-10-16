#!/bin/bash
set -euo pipefail
physics_root=/data/home/fusion/project/shanghai_physics_v7
source "$physics_root/runtime/openfoam-env.sh"
/home/fusion/miniconda3/envs/cfd_flow/bin/python - <<'PY'
from pathlib import Path
import shutil,re
r=Path('/data/home/fusion/project/shanghai_physics_v7')
for case,time in [('steady-gauss-pressure-L12','7083'),('steady-gauss-pressure-L9','2050')]:
 src=r/case;dst=r/(case+'-final-integrals');dst.mkdir(exist_ok=True)
 for sub in ['constant','system',time]:shutil.copytree(src/sub,dst/sub,dirs_exist_ok=True)
 p=dst/'system/controlDict';s=re.sub(r'writeInterval\s+\d+;','writeInterval 1;',p.read_text());p.write_text(s)
PY
for case in steady-gauss-pressure-L12 steady-gauss-pressure-L9; do
 cd "$physics_root/$case-final-integrals"
 simpleFoam -postProcess -latestTime > postprocess.log 2>&1
 /home/fusion/miniconda3/envs/cfd_flow/bin/python "$physics_root/audit_integrals.py" "$PWD"
done
