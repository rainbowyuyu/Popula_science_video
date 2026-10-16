"""DashScope audio comprehension audit. No secret or audio base64 enters logs."""
from __future__ import annotations
import argparse,base64,hashlib,json,os
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[1]
def inspect_audio(path,prompt,out,model='qwen3-omni-flash'):
 key=next((os.environ[n] for n in ['DASHSCOPE_MEDIA_API_KEY','QWEN_API_KEY_PRIMARY','DASHSCOPE_API_KEY','QWEN_API_KEY','QWEN_API_KEY_BACKUP'] if os.environ.get(n) and not os.environ[n].startswith('sk-sp-')),None)
 if not key:raise RuntimeError('no native media credential in runtime')
 path=Path(path);data='data:audio/wav;base64,'+base64.b64encode(path.read_bytes()).decode('ascii')
 body={'model':model,'messages':[{'role':'user','content':[{'type':'input_audio','input_audio':{'data':data,'format':'wav'}},{'type':'text','text':prompt}]}],'modalities':['text'],'stream':True,'stream_options':{'include_usage':True},'enable_thinking':False}
 s=requests.Session();s.trust_env=False;r=s.post('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',json=body,headers={'Authorization':'Bearer '+key},timeout=(30,180),stream=True)
 if r.status_code!=200:
  try:error=r.json().get('error',{});detail={k:error.get(k) for k in ('code','type','message')}
  except Exception:detail={'code':'non_json_response'}
  raise RuntimeError(json.dumps({'http':r.status_code,'detail':detail},ensure_ascii=False))
 text='';usage=None
 for line in r.iter_lines():
  if not line or not line.startswith(b'data:'):continue
  content=line[5:].strip()
  if content==b'[DONE]':break
  item=json.loads(content)
  if item.get('usage'):usage=item['usage']
  for choice in item.get('choices',[]):text+=choice.get('delta',{}).get('content','') or ''
 record={'model':model,'audio':str(path),'audioSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'prompt':prompt,'response':text,'usage':usage,'humanListeningChecked':False,'scope':'machine audio-comprehension pronunciation screen; not authoritative phonetic evidence'}
 out=Path(out);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8');print(text);return record
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('audio');p.add_argument('promptfile');p.add_argument('output');p.add_argument('--model',default='qwen3-omni-flash');a=p.parse_args();inspect_audio(a.audio,Path(a.promptfile).read_text(encoding='utf-8-sig'),a.output,a.model)
