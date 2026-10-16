#!/bin/bash
set -euo pipefail
physics_root=/data/home/fusion/project/shanghai_physics_v7
source "$physics_root/runtime/openfoam-env.sh"
/home/fusion/miniconda3/envs/cfd_flow/bin/python - <<'PY'
from pathlib import Path
import shutil,re,json
r=Path('/data/home/fusion/project/shanghai_physics_v7');src=r/'urans-tower-L12-v2';checkpoint='76.8956560453'
for step in [.1,.05]:
 dst=r/('urans-gauss-L12-dt'+str(step));dst.mkdir(exist_ok=True)
 for sub in ['constant','system',checkpoint]:shutil.copytree(src/sub,dst/sub,dirs_exist_ok=True)
 p=dst/'system/controlDict';s=p.read_text();s=re.sub(r'stopAt\s+\w+;','stopAt endTime;',s);s=re.sub(r'endTime\s+[0-9.]+;','endTime 160;',s);s=re.sub(r'maxDeltaT\s+[0-9.]+;',f'maxDeltaT {step};',s);s=re.sub(r'maxCo\s+[0-9.]+;','maxCo 8;',s);s=re.sub(r'writeInterval\s+100;','writeInterval 20;',s)
 # Start independent statistics after identical pressure-corrected checkpoint
 # has evolved for another 23 seconds; compare dt sensitivity at t=160.
 s=s.replace('timeStart 200;','timeStart 100;');p.write_text(s)
 p=dst/'system/fvSolution';s=p.read_text().replace('nOuterCorrectors 2;','nOuterCorrectors 3;');p.write_text(s)
 (dst/'paired-time-step-provenance.json').write_text(json.dumps({'sourceCase':str(src),'sourceCheckpoint_s':float(checkpoint),'pressureGradient':'Gauss linear','maxDeltaT_s':step,'maxCo':8,'developmentBeforeMean_s':100,'comparisonEnd_s':160,'quality':{'acceptedForFilm':False}},indent=2)+'\n')
PY
for step in 0.1 0.05; do
 cd "$physics_root/urans-gauss-L12-dt$step"
 decomposePar -latestTime > decompose.log 2>&1
 mpirun.openmpi --mca btl self,vader --mca pml ob1 -np 12 pimpleFoam -parallel > run.log 2>&1 & echo $! > job.pid
done
wait
