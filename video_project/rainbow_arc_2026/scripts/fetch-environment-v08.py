"""Fetch CC0 texture data only; preserve Poly Haven source metadata and hashes."""
from pathlib import Path
import urllib.request, json, hashlib, datetime

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets_v08/environment/textures'
OUT.mkdir(parents=True,exist_ok=True)
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 rainbow-educational-render'})
    return urllib.request.urlopen(req,timeout=90).read()
asset='slate_floor_02'
meta=json.loads(get('https://api.polyhaven.com/files/'+asset))
(OUT/'polyhaven-files.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
records=[]
for key in ['Diffuse','nor_gl','arm']:
    info=meta[key]['2k']['jpg']
    name=info['url'].split('/')[-1]
    path=OUT/name
    if not path.exists(): path.write_bytes(get(info['url']))
    data=path.read_bytes()
    assert hashlib.md5(data).hexdigest()==info['md5'],name
    records.append({'map':key,'file':name,'url':info['url'],'bytes':len(data),
                    'md5':info['md5'],'sha256':hashlib.sha256(data).hexdigest()})
manifest={'asset':asset,'source':'https://polyhaven.com/a/'+asset,
          'license':'CC0 1.0','license_url':'https://polyhaven.com/license',
          'retrieved_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'usage':'Wet slate platform and fine stone normal-map, not physical simulation data',
          'files':records}
(OUT/'provenance.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'LICENSE.txt').write_text('Poly Haven slate_floor_02: CC0 1.0.\nhttps://polyhaven.com/license\nhttps://creativecommons.org/publicdomain/zero/1.0/\n',encoding='utf-8')
print(json.dumps({'asset':asset,'verified_files':len(records),'bytes':sum(x['bytes'] for x in records)}))
landscape='hilly_terrain_01'
meta=json.loads(get('https://api.polyhaven.com/files/'+landscape))
info=meta['hdri']['2k']['hdr']
path=OUT.parent/(landscape+'_2k.hdr')
if not path.exists():path.write_bytes(get(info['url']))
data=path.read_bytes()
assert hashlib.md5(data).hexdigest()==info['md5']
(OUT.parent/'landscape-provenance.json').write_text(json.dumps({
    'asset':landscape,'source':'https://polyhaven.com/a/'+landscape,
    'license':'CC0 1.0','license_url':'https://polyhaven.com/license',
    'retrieved_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'url':info['url'],'file':path.name,'bytes':len(data),'md5':info['md5'],
    'sha256':hashlib.sha256(data).hexdigest(),
    'usage':'Real photographed landscape environment; artistic rain veil does not represent weather measurement'
},indent=2),encoding='utf-8')
print(json.dumps({'landscape':landscape,'bytes':len(data)}))
