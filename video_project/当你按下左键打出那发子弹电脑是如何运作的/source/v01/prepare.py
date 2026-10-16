"""Public-reference capture + original logo copy, project-local writes only.
No external scripts executed, no credentials, no private TTS access.
"""
from pathlib import Path
import datetime, hashlib, json, re, shutil
import requests
ROOT = Path(__file__).resolve().parents[2]
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')

def preserve(path):
    if path.exists():
        dest = ROOT/'work/v01/backups'/STAMP/path.relative_to(ROOT)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    preserve(path)
    path.write_bytes(data)

if __name__ == '__main__':
    for d in ['assets/brand','assets/v01','output/v01','work/v01','references/v01','subtitles/v01']:
        (ROOT/d).mkdir(parents=True, exist_ok=True)
    logo = Path('C:/Users/zju/Desktop/logo/logo.png')
    dst = ROOT/'assets/brand/logo.png'
    if not dst.exists(): write(dst, logo.read_bytes())
    sources = [
      ('raw_input', 'https://learn.microsoft.com/en-us/windows/win32/inputdev/about-raw-input', 'Microsoft Windows input documentation', ['WM_INPUT','RAWINPUT','mouse']),
      ('source_networking', 'https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking', 'Valve developer wiki; must not treat challenge page as content', ['prediction','usercmd','lag compensation']),
      ('lag_compensation', 'https://developer.valvesoftware.com/wiki/Lag_Compensation', 'Valve developer wiki; no challenge bypass', ['StartLagCompensation','FinishLagCompensation']),
      ('sdk_lag', 'https://raw.githubusercontent.com/ValveSoftware/source-sdk-2013/master/src/game/server/player_lagcompensation.cpp', 'Valve Source SDK 2013 code; not CS:GO source or match evidence', ['StartLagCompensation','BacktrackPlayer','FinishLagCompensation']),
      ('sdk_fire', 'https://raw.githubusercontent.com/ValveSoftware/source-sdk-2013/master/src/game/shared/baseentity_shared.cpp', 'Valve Source SDK 2013 code; generic Source illustration only', ['FireBullets','TraceRay','MASK_SHOT']),
    ]
    ledger=[]
    for name,url,scope,terms in sources:
        dest=ROOT/f'references/v01/{name}.txt'
        meta=ROOT/f'references/v01/{name}.json'
        if meta.exists():
            rec=json.loads(meta.read_text(encoding='utf-8')); ledger.append(rec)
            print(name,'cached',rec['status']); continue
        rec={'id':name,'url':url,'scope':scope,'accessedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'unread'}
        try:
            r=requests.get(url,timeout=25)
            content=r.text
            blocked='Making sure you' in content or 'anubis' in content[:5000].lower()
            rec.update(httpStatus=r.status_code,sha256=hashlib.sha256(r.content).hexdigest(),bytes=len(r.content))
            rec['status']='challenge_not_content' if blocked else ('retrieved' if r.status_code==200 else 'http_error')
            if rec['status']=='retrieved':
                write(dest,r.content)
                plain=re.sub('<[^>]+>',' ',content)
                plain=re.sub(r'\s+',' ',plain)
                excerpts=[]
                for term in terms:
                    i=plain.lower().find(term.lower())
                    if i>=0: excerpts.append({'term':term,'excerpt':plain[max(0,i-120):i+450]})
                rec['excerpts']=excerpts
            else:
                title=re.search(r'<title>(.*?)</title>',content,re.S)
                rec['responseTitle']=title.group(1) if title else None
        except requests.RequestException as e:
            rec.update(status='request_failed',errorType=type(e).__name__)
        write(meta,json.dumps(rec,ensure_ascii=False,indent=2).encode('utf-8'))
        ledger.append(rec)
        print(json.dumps(rec,ensure_ascii=False))
    assets={'logo':{'source':str(logo),'path':str(dst.relative_to(ROOT)),'sha256':hashlib.sha256(dst.read_bytes()).hexdigest(),'treatment':'unmodified copy'},'sources':ledger}
    write(ROOT/'references/v01/ledger.json',json.dumps(assets,ensure_ascii=False,indent=2).encode('utf-8'))
