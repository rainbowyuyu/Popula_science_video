"""Fetch exact CC0 Poly Haven source models, preserving provider hashes."""
from pathlib import Path
import concurrent.futures, datetime, hashlib, json, requests

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets_v15/environment/source-models'
RESEARCH=ROOT/'research/v15/environment'
OUT.mkdir(parents=True,exist_ok=True);RESEARCH.mkdir(parents=True,exist_ok=True)
NAMES=['tree_small_02','flower_heliophila','rock_moss_set_01']

def fetch_one(item):
    path,url,md5=item;path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists() or hashlib.md5(path.read_bytes()).hexdigest()!=md5:
        response=requests.get(url,timeout=150);response.raise_for_status();path.write_bytes(response.content)
    data=path.read_bytes()
    if hashlib.md5(data).hexdigest()!=md5: raise RuntimeError('Provider MD5 mismatch: '+str(path))
    return {'file':str(path.relative_to(ROOT)).replace('\\','/'),'url':url,'providerMD5':md5,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}

assets=[]
for name in NAMES:
    response=requests.get('https://api.polyhaven.com/files/'+name,timeout=30);response.raise_for_status();j=response.json()
    (RESEARCH/(name+'-files.json')).write_text(json.dumps(j,indent=2),encoding='utf-8')
    primary=j['gltf']['1k']['gltf'];items=[(OUT/name/(name+'_1k.gltf'),primary['url'],primary['md5'])]
    items += [(OUT/name/rel,v['url'],v['md5']) for rel,v in primary.get('include',{}).items()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: files=list(pool.map(fetch_one,items))
    assets.append({'id':name,'page':'https://polyhaven.com/a/'+name,'license':'CC0-1.0','licenseURL':'https://polyhaven.com/license','provider':'Poly Haven','files':files})
    print(json.dumps({'asset':name,'files':len(files),'bytes':sum(x['bytes'] for x in files)}),flush=True)
license_response=requests.get('https://polyhaven.com/license',timeout=30);license_response.raise_for_status()
(RESEARCH/'polyhaven-license-accessed.html').write_text(license_response.text,encoding='utf-8')
manifest={'version':'V15','retrievedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'assets':assets,'licenseEvidence':'research/v15/environment/polyhaven-license-accessed.html','purpose':'New authored rain garden and anisotropic surface-splat scene; not a trained photographic reconstruction'}
(OUT.parent/'source-licenses-v15.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
