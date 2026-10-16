"""Resumable official Qwen personal-voice enrollment and synthesis.

Credentials remain environment-only. The supplied local reference is sent only
to Alibaba's authorized voice service; no reference audio/base64 is persisted.
"""
from pathlib import Path
import os,json,hashlib,base64,subprocess,argparse,time,urllib.parse,uuid,shutil
import requests
V3=Path(__file__).resolve().parents[1]
BASE='https://dashscope.aliyuncs.com/api/v1'
MODEL='qwen-audio-3.0-tts-flash';ENV='QWEN_API_KEY_BACKUP'
REF=Path('D:/python_project/tts/work/clone-reference.wav')
STATE=V3/'research/qwen-voice-enrollment.json'
LEDGER=V3/'research/voice-generation-cloud.json'
RAW=V3/'public/audio/cloud-raw';RAW.mkdir(parents=True,exist_ok=True)
PARAMS={'format':'wav','sample_rate':24000,'instruction':'自然亲切的中文科普解说，语速稍快，吐字清楚，停顿紧凑，保持参考音色。'}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,j):p.write_text(json.dumps(j,ensure_ascii=False,indent=2),encoding='utf8')
def header():return {'Authorization':'Bearer '+os.environ[ENV],'Content-Type':'application/json'}
def enroll():
 if STATE.exists():
  state=json.loads(STATE.read_text(encoding='utf8'))
  if state.get('voice'):return state
  raise RuntimeError('Enrollment state exists without confirmed voice; inspect/query instead of duplicate creation')
 reference=subprocess.run(['ffmpeg','-v','error','-i',str(REF),'-ac','1','-ar','24000','-c:a','pcm_s16le','-f','wav','pipe:1'],capture_output=True,check=True).stdout
 state={'provider':'Alibaba Cloud DashScope','model':MODEL,'credentialSlot':ENV,'referenceSha256':sha(REF),'referenceSeconds':10.600042,'referenceProcessing':'mono 24kHz PCM16; no trimming, speed or pitch change','status':'enrollment_started','preferredName':'rbowdna3','billing':'Qwen voice creation free per official current docs; synthesis usage recorded separately'};save(STATE,state)
 policy=requests.get(BASE+'/uploads',params={'action':'getPolicy','model':MODEL},headers=header(),timeout=30);policy.raise_for_status();p=policy.json()['data']
 fields={'OSSAccessKeyId':p['oss_access_key_id'],'Signature':p['signature'],'policy':p['policy'],'key':p['upload_dir']+'/'+uuid.uuid4().hex+'-voice.wav','x-oss-object-acl':p['x_oss_object_acl'],'x-oss-forbid-overwrite':p['x_oss_forbid_overwrite'],'success_action_status':'200','x-oss-content-type':'audio/wav'}
 upload=requests.post(p['upload_host'],data=fields,files={'file':('voice.wav',reference,'audio/wav')},timeout=90);upload.raise_for_status()
 payload={'model':'voice-enrollment','input':{'action':'create_voice','target_model':MODEL,'prefix':state['preferredName'],'url':'oss://'+fields['key']}}
 try:r=requests.post(BASE+'/services/audio/tts/customization',headers={**header(),'X-DashScope-OssResourceResolve':'enable'},json=payload,timeout=90)
 except requests.RequestException as e:
  state.update(status='enrollment_unknown',errorType=type(e).__name__);save(STATE,state);raise
 j=r.json();state.update(httpStatus=r.status_code,requestId=j.get('request_id'),voice=j.get('output',{}).get('voice_id'),usage=j.get('usage'),code=j.get('code'),message=j.get('message'))
 state['status']='enrolled'if state.get('voice')else'rejected';save(STATE,state)
 print(json.dumps({k:state.get(k)for k in ['status','httpStatus','requestId','code','message']},ensure_ascii=True),flush=True)
 if not state.get('voice'):raise RuntimeError('Enrollment did not succeed')
 return state
def synth(ids):
 state=enroll();narr=json.loads((V3/'src/narration.json').read_text(encoding='utf8'))
 ledger=json.loads(LEDGER.read_text(encoding='utf8'))if LEDGER.exists()else{}
 for cue in narr['cues']:
  if ids and cue['id']not in ids:continue
  spec={'text':cue['spokenText'],'model':MODEL,'voice':state['voice'],'referenceSha256':sha(REF),'language_type':'Chinese','requestParameters':PARAMS}
  reqhash=hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
  path=RAW/f"{cue['id']}.wav";old=ledger.get(cue['id'],{})
  # Upgrade metadata for this very batch's known, identical fixed parameters.
  # No synthesis occurs when the verified source is unchanged.
  if old.get('status')=='saved' and 'requestParameters'not in old and all(old.get(k)==spec[k]for k in ['text','model','voice','referenceSha256']):
   old.update(legacyRequestHash=old['requestHash'],requestHash=reqhash,requestParameters=PARAMS);save(LEDGER,ledger)
  if old.get('requestHash')==reqhash and old.get('status')=='saved'and path.exists():continue
  if old.get('requestHash')==reqhash and old.get('status')in['submitted','unknown']:raise RuntimeError('Uncertain synthesis status; inspect before repeat')
  if old.get('status')=='saved' and path.exists():
   history=V3/'research/voice-revisions';history.mkdir(exist_ok=True)
   save(history/f"{cue['id']}-{old['requestHash'][:10]}.json",old)
   prior=V3/'public/audio/prior-revisions';prior.mkdir(parents=True,exist_ok=True)
   shutil.copy2(path,prior/f"{cue['id']}-{old['requestHash'][:10]}.wav")
  row={**spec,'requestHash':reqhash,'displayText':cue['text'],'status':'submitted','credentialSlot':ENV,'subjectiveListeningChecked':False};ledger[cue['id']]=row;save(LEDGER,ledger)
  t=time.perf_counter()
  payload={'model':MODEL,'input':{'text':cue['spokenText'],'voice':state['voice'],**PARAMS}}
  try:r=requests.post(BASE+'/services/audio/tts/SpeechSynthesizer',json=payload,headers=header(),timeout=150)
  except requests.RequestException as e:
   row.update(status='unknown',errorType=type(e).__name__);save(LEDGER,ledger);raise
  j=r.json();audio=j.get('output',{}).get('audio',{});row.update(httpStatus=r.status_code,requestId=j.get('request_id'),usage=j.get('usage'),errorCode=j.get('code'),errorMessage=j.get('message'))
  if r.status_code!=200 or not audio.get('url'):
   row.update(status='rejected');save(LEDGER,ledger);raise RuntimeError(json.dumps({k:row[k]for k in ['httpStatus','errorCode','errorMessage']}))
  # Response URL is used for authorized download but never persisted/logged.
  data=requests.get(audio['url'],timeout=90);data.raise_for_status();path.write_bytes(data.content)
  duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(path)],text=True))
  row.update(status='saved',rawDurationSec=duration,wallSeconds=time.perf_counter()-t,file=path.relative_to(V3).as_posix(),sha256=sha(path));save(LEDGER,ledger)
  print(cue['id'],round(duration,3),'wall',round(row['wallSeconds'],2),flush=True)
def main():
 p=argparse.ArgumentParser();p.add_argument('action',choices=['enroll','synth']);p.add_argument('--ids',default='');a=p.parse_args()
 if a.action=='enroll':enroll()
 else:synth(set(a.ids.split(','))if a.ids else None)
if __name__=='__main__':main()
