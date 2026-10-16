"""Fetch limited CC0 photographic ground/plant assets; keep provider checksums."""
from pathlib import Path
import datetime, hashlib, json, urllib.request
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets_v09/environment';OUT.mkdir(parents=True,exist_ok=True)
HEADERS={'User-Agent':'rainbow-v09-educational-render/1.0'}

def read(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=60).read()

records=[]
def save(asset,relative,info):
    path=OUT/relative;path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():path.write_bytes(read(info['url']))
    data=path.read_bytes()
    assert hashlib.md5(data).hexdigest()==info['md5'],relative
    records.append({'asset':asset,'file':relative,'url':info['url'],'bytes':len(data),
                    'md5':info['md5'],'sha256':hashlib.sha256(data).hexdigest()})

for asset in ['fern_02','grass_medium_01','shrub_04']:
    meta=json.loads(read('https://api.polyhaven.com/files/'+asset))
    (OUT/(asset+'-provider-files.json')).write_text(json.dumps(meta,indent=2),'utf8')
    info=meta['gltf']['1k']['gltf']
    save(asset,'source-models/'+asset+'/'+info['url'].split('/')[-1],info)
    for relative,data in info['include'].items():save(asset,'source-models/'+asset+'/'+relative,data)
    if 'Alpha' in meta:
        alpha=meta['Alpha']['1k']['png']
        alpha_rel='source-models/'+asset+'/textures/'+alpha['url'].split('/')[-1]
        save(asset,alpha_rel,alpha)
        diffuse=Image.open(OUT/'source-models'/asset/'textures'/(asset+'_diff_1k.jpg')).convert('RGB')
        mask=Image.open(OUT/alpha_rel).convert('L').resize(diffuse.size)
        rgba=diffuse.convert('RGBA');rgba.putalpha(mask)
        derived=OUT/'textures'/(asset+'_rgba_v09.png');derived.parent.mkdir(parents=True,exist_ok=True);rgba.save(derived)
        data=derived.read_bytes();records.append({'asset':asset,'file':derived.relative_to(OUT).as_posix(),
          'adaptation':'Combine original CC0 diffuse and original CC0 alpha; no generated plant pixels',
          'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})

asset='grass_ground';meta=json.loads(read('https://api.polyhaven.com/files/'+asset))
(OUT/(asset+'-provider-files.json')).write_text(json.dumps(meta,indent=2),'utf8')
for key in ['Diffuse','nor_gl','arm']:
    info=meta[key]['2k']['jpg'];save(asset,'textures/'+info['url'].split('/')[-1],info)
manifest={'dateUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'source':'Poly Haven','license':'CC0 1.0','licenseURL':'https://polyhaven.com/license',
          'purpose':'Small genuine plant meshes and photographed grass surface around an authored optical terrace; not weather measurement',
          'assetPages':{a:'https://polyhaven.com/a/'+a for a in ['fern_02','grass_medium_01','shrub_04','grass_ground']},'files':records}
(OUT/'cc0-source-provenance-v09.json').write_text(json.dumps(manifest,indent=2),'utf8')
(OUT/'LICENSE.txt').write_text('Poly Haven fern_02, grass_medium_01, shrub_04, grass_ground: CC0 1.0.\nhttps://polyhaven.com/license\nhttps://creativecommons.org/publicdomain/zero/1.0/\n','utf8')
print(json.dumps({'verifiedFiles':len(records),'bytes':sum(r['bytes'] for r in records)}))
