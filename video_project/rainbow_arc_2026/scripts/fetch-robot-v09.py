"""Fetch the original CC0 rigged RobotExpressive from a fixed Three.js commit."""
from pathlib import Path
import urllib.request,json,hashlib,struct,datetime

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets_v09/characters/robot_expressive'
OUT.mkdir(parents=True,exist_ok=True)
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'rainbow-science-video/1.0'})
    return urllib.request.urlopen(req,timeout=60).read()
commit=json.loads(get('https://api.github.com/repos/mrdoob/three.js/commits/dev'))['sha']
prefix='https://raw.githubusercontent.com/mrdoob/three.js/'+commit+'/examples/models/gltf/RobotExpressive/'
raw=get(prefix+'RobotExpressive.glb');readme=get(prefix+'README.md')
assert raw[:4]==b'glTF'
header_size=struct.unpack_from('<I',raw,12)[0]
meta=json.loads(raw[20:20+header_size].decode().strip())
assert meta.get('skins'),'Original asset must have actual skinning/bones'
assert len(meta.get('animations',[]))>=3,'Original asset must contain actual animation clips'
assert 'CC0 1.0' in readme.decode()
(OUT/'RobotExpressive-original.glb').write_bytes(raw)
(OUT/'SOURCE-README.md').write_bytes(readme)
(OUT/'LICENSE.txt').write_text('RobotExpressive: CC0 1.0 Universal.\nModel by Tomás Laulhé (Quaternius). Modifications by Don McCurdy.\nhttps://creativecommons.org/publicdomain/zero/1.0/\nSource evidence in SOURCE-README.md.\n',encoding='utf-8')
report={'retrieved_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'model':'RobotExpressive','author':'Tomás Laulhé / Quaternius','modifications':'Don McCurdy: facial morphs, FBX2GLTF conversion, material cleanup',
    'source_repository':'https://github.com/mrdoob/three.js','source_commit':commit,
    'source_url':prefix+'RobotExpressive.glb','license_url':prefix+'README.md',
    'license':'CC0 1.0','license_allows':'Commercial and non-commercial video use, modifications; attribution optional under CC0, retained here as courtesy',
    'file':'RobotExpressive-original.glb','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),
    'skins':len(meta['skins']),'joints':sum(len(s['joints']) for s in meta['skins']),
    'meshes':len(meta['meshes']),
    'animation_clips':[a.get('name','') for a in meta['animations']],
    'morph_targets':sum(len(p.get('targets',[])) for m in meta['meshes'] for p in m['primitives']),
    'planned_adaptations':'Runtime material grade and geometric uniform scale; original GLB preserved. Three independent cloned skeletons; deterministic animation sampling, no new procedural placeholder character.'}
(OUT/'provenance.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(report,indent=2,ensure_ascii=False))
