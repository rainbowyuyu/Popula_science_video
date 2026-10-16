from pathlib import Path
import json, hashlib, requests, datetime
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/assets_v15/environment';TEX=OUT/'textures';TEX.mkdir(parents=True,exist_ok=True)
manifest=[]
for asset in ['rock_04','dry_river_pebbles']:
    j=requests.get('https://api.polyhaven.com/files/'+asset,timeout=30).json();(ROOT/f'research/v15/environment/{asset}-files.json').write_text(json.dumps(j,indent=2))
    records=[]
    for label,options in [('diff',['Diffuse','diff']),('nor_gl',['nor_gl']),('rough',['Rough','rough'])]:
        info=next(j[k]['1k']['jpg'] for k in options if k in j)
        file=TEX/f'{asset}_{label}_1k.jpg';data=requests.get(info['url'],timeout=90).content
        if hashlib.md5(data).hexdigest()!=info['md5']:raise ValueError('Provider checksum mismatch')
        file.write_bytes(data);records.append({'file':str(file.relative_to(OUT)).replace('\\','/'),'url':info['url'],'providerMD5':info['md5'],'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
    manifest.append({'asset':asset,'license':'CC0-1.0','source':'https://polyhaven.com/a/'+asset,'licenseURL':'https://polyhaven.com/license','files':records})
N=2048;axis=np.linspace(0,1,N,dtype=np.float32);X,Z=np.meshgrid(-58+axis*116,-74+axis*114)
grass=np.asarray(Image.open(ROOT/'public/assets_v09/environment/textures/grass_ground_fresh_grade_v09.png').convert('RGB').resize((1024,1024)),dtype=np.float32)/255
soil=np.asarray(Image.open(TEX/'dry_river_pebbles_diff_1k.jpg').resize((1024,1024)),dtype=np.float32)/255
g=grass[np.mod((Z*311).astype(np.int32),1024),np.mod((X*311).astype(np.int32),1024)].copy()
s=soil[np.mod((Z*94).astype(np.int32),1024),np.mod((X*94).astype(np.int32),1024)].copy()
rng=np.random.default_rng(152024);n=gaussian_filter(rng.normal(size=(N,N)),sigma=24);n=(n-n.mean())/n.std()
creek=-11+2.3*np.sin(Z*.075)+.65*np.sin(Z*.23);path=.6+2.4*np.sin(Z*.089)+.42*np.sin(Z*.27)
bank=np.exp(-((X-creek)/2.65)**6);track=np.exp(-((X-path)/.80)**4)*((Z>-29)&(Z<21))
mix=np.clip(bank*.78+track*.78+n*.055,0,.90)
# Earth edges and quiet puddle-darkened grass keep the meadow connected, never a
# graphic flat rectangle. Every pixel derives from real CC0 ground photographs.
c=g*(1-mix[:,:,None])+s*np.array([.70,.76,.65])*(mix[:,:,None]);c*=np.clip(.93+n*.075,.70,1.12)[:,:,None]
Image.fromarray(np.uint8(np.clip(c,0,1)*255)).save(TEX/'rain_garden_ground_diff_v15.jpg',quality=94)
license={'version':'V15','createdUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'license':'CC0-1.0 + authored grading/mixing','assets':manifest,'derived':'rain_garden_ground_diff_v15.jpg','method':'Deterministic blend of existing photographed grass and dry_river_pebbles, wet creek bank and path masks, fixed seed152024'}
(OUT/'ground-map-provenance-v15.json').write_text(json.dumps(license,indent=2),encoding='utf-8');print(json.dumps({'maps':len(manifest),'output':str(TEX)}))
