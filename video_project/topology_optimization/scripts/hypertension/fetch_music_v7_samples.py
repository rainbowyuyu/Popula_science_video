"""Fetch only the CC0 VSCO 2 samples used by the V7 original score."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote
import hashlib, json, requests

ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'research/hypertension/music-v7-samples'
COMMIT='440300901dfe9275fd84e0b7763af1f8443ae62e'
BASE=f'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/{COMMIT}/'
FILES=['LICENSE','Readme.txt','README.md','Keys/Upright Nr1/Notes.txt']
FILES += [f'Keys/Upright Nr1/UR1_{n}_pp_RR1.wav' for n in ['C2','G2','C3','G3','C4','G4','C5','G5']]
FILES += [f'Keys/Upright Nr1/UR1_{n}_pp_RR2.wav' for n in ['C3','G3','C4','G4','C5']]
FILES += [f'Strings/Harp/KSHarp_{n}_mf.wav' for n in ['C3','E3','G3','D4','F4','A4','C5']]
FILES += [f'Strings/Cello Section/susvib/susvib_{n}_v1_1.wav' for n in ['C1','G1','D2','A2','E3']]
FILES += [f'Strings/Viola Section/susvib/ViolaEns_susvib_{n}_v1_1.wav' for n in ['C2','G2','D3','A3','C4']]
FILES += [f'Strings/Cello Section/pizzT/pizzT_{n}_v1_RR1.wav' for n in ['C1','G1','D2','A2']]
FILES += ['Percussion/Conga-Tap1_v1_rr1_Sum.wav','Percussion/Conga-Tap1_v1_rr2_Sum.wav']

def fetch(path):
    out=DEST/path;out.parent.mkdir(parents=True,exist_ok=True)
    url=BASE+quote(path,safe='/')
    if not out.exists():
        r=requests.get(url,timeout=60);r.raise_for_status();out.write_bytes(r.content)
    b=out.read_bytes()
    return {'path':path,'url':url,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}

def main():
    DEST.mkdir(parents=True,exist_ok=True)
    with ThreadPoolExecutor(max_workers=5) as pool: rows=list(pool.map(fetch,FILES))
    d={'repository':'https://github.com/sgossner/VSCO-2-CE','commit':COMMIT,
       'license':'CC0-1.0','licenseFile':'LICENSE','recordists':'Sam Gossner / Versilian Studios; Simon Dalzell / Ivy Audio',
       'sampleEditing':'Elan Hickler / Soundemote','files':rows}
    (DEST/'manifest.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8')
    print(f'{len(rows)} files, {sum(r["bytes"] for r in rows)/1e6:.1f} MB; license and hashes saved')
if __name__=='__main__': main()
