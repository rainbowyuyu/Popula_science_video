from pathlib import Path
import json
from PIL import Image
r=Path('.').resolve();spec=json.loads((r/'research/qwen-v16-art-video-specs.json').read_text('utf8'))
out=r/'output-v16/work/qwen-v16/inputs';out.mkdir(parents=True,exist_ok=True)
frames={450:'frozen',810:'frozen',1110:'final',4990:'final',5140:'frozen',8580:'frozen',8730:'final',8900:'final',9050:'frozen',10402:'frozen'}
def at(f):return r/f'output-v16/work/endpoints-{frames[f]}/frame-{f:05d}.png'
refs={
 'painted_to_garden_v16':(r/'public/assets_v15/qwen/painted_chase/frames/frame_0300.jpg',at(450)),
 'garden_to_drop_v16':(at(810),at(1110)),
 'drop_to_world_v16':(at(4990),at(5140)),
 'world_to_secondary_v16':(at(8580),at(8730)),
 'secondary_to_world_v16':(at(8900),at(9050)),
 'fountain_to_painted_v16':(at(10402),r/'public/assets_v15/qwen/fountain_to_painted_c/frames/frame_0150.jpg')}
missing=[str(p) for pair in refs.values() for p in pair if not p.exists()]
if missing:print('Waiting for frozen endpoints:',missing)
else:
 for s in spec['shots']:
  for w,p in zip(['first','last'],refs[s['id']]):
   dest=out/s[w+'File'];im=Image.open(p).convert('RGB');im.save(dest)
 print('Prepared all 12 exact endpoint references')
