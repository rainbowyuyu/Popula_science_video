"""Independent Qwen3-ASR transcription of selected synthetic narration.

No voice reference upload, no text prompt bias, no credentials in artifacts.
Raw local Whisper transcripts remain unchanged. This is a content check only.
"""
from pathlib import Path
import argparse,base64,difflib,hashlib,json,os,sys,subprocess
import requests
from qc import chars
R=Path(__file__).resolve().parents[1]
BASE='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser();parser.add_argument('--only',default='');parser.add_argument('--master',action='store_true');args=parser.parse_args()
    plan=json.loads((R/'research/launch-v4-voice-plan.json').read_text('utf8'))
    rows=[r for r in plan['shots'] if not args.only or r['id'] in args.only.split(',')]
    master_digest=None
    if args.master:
        master=R/'public/audio/launch-v4-master.wav'
        path=R/'work/audio-v4/master-asr-16k.wav';path.parent.mkdir(parents=True,exist_ok=True)
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-ar','16000','-ac','1','-c:a','pcm_s16le',str(path)],check=True)
        master_digest=hashlib.sha256(master.read_bytes()).hexdigest()
        rows=[dict(id='master',text=''.join(r['text'] for r in plan['shots']),audioPath=path)]
    creds=[(n,os.environ.get(n,'')) for n in ['QWEN_API_KEY_PRIMARY','DASHSCOPE_API_KEY','QWEN_API_KEY','QWEN_API_KEY_BACKUP'] if os.environ.get(n,'')]
    if not creds:raise RuntimeError('No Qwen credential environment variable available')
    out=R/'audio/asr-qwen-v4';out.mkdir(parents=True,exist_ok=True)
    working_credential=None
    for row in rows:
        p=row.get('audioPath',R/'public/voice'/f"{row['id']}.wav");dest=out/f"{row['id']}.json"
        digest=hashlib.sha256(p.read_bytes()).hexdigest()
        if dest.exists():
            existing=json.loads(dest.read_text('utf8'))
            if existing.get('sourceSHA256')==digest:
                if existing.get('expected')!=row['text']:
                    existing.setdefault('expectedHistory',[]).append(dict(expected=existing.get('expected'),ratio=existing.get('ratio')))
                    existing['expected']=row['text'];existing['ttsInput']=row.get('ttsText')
                    existing['ratio']=difflib.SequenceMatcher(None,chars(row['text']),chars(existing['heard']),autojunk=False).ratio()
                    existing['transcriptUnchanged']=True
                    dest.write_text(json.dumps(existing,ensure_ascii=False,indent=2)+'\n','utf8')
                continue
        audio='data:audio/wav;base64,'+base64.b64encode(p.read_bytes()).decode()
        payload={'model':'qwen3-asr-flash','messages':[{'role':'user','content':[{'type':'input_audio','input_audio':{'data':audio,'format':'wav'}}]}],
            'stream':False,'asr_options':{'enable_itn':False}}
        result=None
        for name,key in ([working_credential] if working_credential else creds):
            response=requests.post(BASE,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},json=payload,timeout=90)
            data=response.json()
            if response.status_code!=200:
                error=data.get('error',{})
                print('ASR_CREDENTIAL_RESULT',name,response.status_code,str(error.get('code','unknown')),str(error.get('message',''))[:240],flush=True)
                continue
            heard=data['choices'][0]['message']['content']
            working_credential=(name,key)
            ratio=difflib.SequenceMatcher(None,chars(row['text']),chars(heard),autojunk=False).ratio()
            result=dict(id=row['id'],model=data.get('model'),expected=row['text'],ttsInput=row.get('ttsText'),heard=heard,ratio=ratio,
                sourceSHA256=digest,credentialSource=name,usage=data.get('usage'),requestId=data.get('id'),
                finalMasterSHA256=master_digest,
                sourceFile=p.relative_to(R).as_posix(),provider='Alibaba Cloud / Qwen3-ASR',textPromptUsed=False,
                referenceAudioUploaded=False,subjectiveListeningChecked=False,pronunciationListeningVerified=False,
                normalization='Punctuation, Simplified/Traditional orthography, numeric spelling only')
            dest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n','utf8')
            print('QWEN_ASR',row['id'],round(ratio,3),heard,flush=True);break
        if result is None:raise RuntimeError('ASR provider unavailable; no successful response')
if __name__=='__main__':main()
