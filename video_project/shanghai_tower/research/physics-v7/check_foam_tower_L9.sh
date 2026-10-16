#!/bin/bash
set -euo pipefail
base=/data/home/fusion/project/shanghai_physics_v7
source "$base/runtime/openfoam-env.sh"
cd "$base/foam-tower-L9"
gmshToFoam tower.msh > mesh-import.log 2>&1
/home/fusion/miniconda3/envs/cfd_flow/bin/python - <<'PY'
from pathlib import Path
import re
p=Path('constant/polyMesh/boundary');s=p.read_text()
for name,typ in [('tower','wall'),('ground','symmetry'),('sides','symmetry'),('ceiling','symmetry')]:
 s=re.sub(r'('+name+r'\s*\{\s*type\s+)patch',r'\g<1>'+typ,s)
p.write_text(s)
PY
checkMesh -allGeometry -allTopology > checkMesh.log 2>&1
# Launch only after checking the mesh report separately.

