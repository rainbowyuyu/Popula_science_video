from pathlib import Path
import shutil,re,json
root=Path('/data/home/fusion/project/shanghai_physics_v7');src=root/'foam-tower-L12';dst=root/'steady-positive-L12';dst.mkdir(exist_ok=True)
for sub in ['constant','system','3539']:shutil.copytree(src/sub,dst/sub,dirs_exist_ok=True)
f=dst/'system/fvSchemes';s=f.read_text().replace('bounded Gauss limitedLinear 1','bounded Gauss upwind');f.write_text(s)
f=dst/'system/controlDict';s=re.sub(r'stopAt\s+\w+;', 'stopAt endTime;',f.read_text());s=re.sub(r'endTime\s+\d+;', 'endTime 16000;',s);f.write_text(s)
(dst/'numerical-provenance.json').write_text(json.dumps({'initialization':'second-order momentum SST at SIMPLE iteration 3539','change':'Use bounded upwind k/omega transport, retain second-order momentum linearUpwindV and all original residual tolerances. This prevents turbulence-scalar overshoots; it does not change physical air properties.','quality':{'acceptedForFilm':False}},indent=2)+'\n')
