from pathlib import Path
import os,json,hashlib,subprocess,time,requests
V3=Path(__file__).resolve().parents[1]
BASE='https://dashscope.aliyuncs.com/api/v1'; MODEL='qwen-audio-3.0-tts-flash'
STATE=V3/'research/qwen-voice-enrollment.json'; LEDGER=V3/'research/voice-generation-cloud-v4.json'
RAW=V3/'public/audio/cloud-raw-v4'; RAW.mkdir(parents=True,exist_ok=True)
PARAMS={'format':'wav','sample_rate':24000,'instruction':'纪录片式自然中文科普解说，语气温和有故事感，语速中等偏快，句间短停顿，吐字清楚，减少播音腔，保持参考音色。'}
SLOTS=['QWEN_API_KEY','QWEN_API_KEY_BACKUP']
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,j): p.write_text(json.dumps(j,ensure_ascii=False,indent=2),encoding='utf8')
def request(slot,payload):
    key=os.getenv(slot)
    if not key: return None,None
    h={'Authorization':'Bearer '+key,'Content-Type':'application/json'}
    return requests.post(BASE+'/services/audio/tts/SpeechSynthesizer',json=payload,headers=h,timeout=150),slot

def main():
    st=json.loads(STATE.read_text(encoding='utf8')); voice=st['voice']
    narr=json.loads((V3/'src/narration.json').read_text(encoding='utf8'))
    ledger=json.loads(LEDGER.read_text(encoding='utf8')) if LEDGER.exists() else {}
    for cue in narr['cues']:
      spec={'text':cue['spokenText'],'model':MODEL,'voice':voice,'referenceSha256':st['referenceSha256'],'language_type':'Chinese','requestParameters':PARAMS}
      reqhash=hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest(); dest=RAW/f"{cue['id']}.wav"; old=ledger.get(cue['id'],{})
      if old.get('requestHash')==reqhash and old.get('status')=='saved' and dest.exists(): continue
      if old.get('status') in ('submitted','unknown') and old.get('requestHash')==reqhash: raise RuntimeError(f'uncertain prior state {cue["id"]}; inspect before retry')
      row={**spec,'requestHash':reqhash,'displayText':cue['text'],'status':'submitted','credentialAttempts':[],'subjectiveListeningChecked':False}; ledger[cue['id']]=row; save(LEDGER,ledger)
      payload={'model':MODEL,'input':{'text':cue['spokenText'],'voice':voice,**PARAMS}}
      resp=None; used=None
      for slot in SLOTS:
        if not os.getenv(slot): continue
        try: r,used=request(slot,payload)
        except requests.RequestException as e:
          row.update(status='unknown',errorType=type(e).__name__,credentialAttempts=row['credentialAttempts']+[slot]); save(LEDGER,ledger); raise
        row['credentialAttempts'].append({'slot':slot,'httpStatus':r.status_code})
        if r.status_code in (401,403,429):
          continue
        resp=r; break
      if resp is None:
        row.update(status='rejected',errorMessage='No credential succeeded or all available responses were unauthorized/rate-limited'); save(LEDGER,ledger); raise RuntimeError(json.dumps(row,ensure_ascii=False))
      j=resp.json(); audio=j.get('output',{}).get('audio',{})
      row.update(httpStatus=resp.status_code,requestId=j.get('request_id'),usage=j.get('usage'),errorCode=j.get('code'),errorMessage=j.get('message'),credentialSlot=used)
      if resp.status_code!=200 or not audio.get('url'):
        row['status']='rejected'; save(LEDGER,ledger); raise RuntimeError(json.dumps({k:row.get(k) for k in ['httpStatus','errorCode','errorMessage']},ensure_ascii=False))
      data=requests.get(audio['url'],timeout=90); data.raise_for_status(); dest.write_bytes(data.content)
      duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(dest)],text=True))
      row.update(status='saved',rawDurationSec=duration,wallSeconds=None,file=dest.relative_to(V3).as_posix(),sha256=sha(dest)); save(LEDGER,ledger); print(cue['id'],round(duration,3),used,flush=True)
if __name__=='__main__': main()
