"""Same-reference multilingual contextual pilots, before recording complete clips."""
import hashlib,json,os,time
from pathlib import Path
import numpy as np,soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel
ROOT=Path(__file__).resolve().parents[1];TTS=Path('D:/python_project/tts');OUT=ROOT/'audio/v02/pronunciation';OUT.mkdir(parents=True,exist_ok=True)
os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false';torch.set_num_threads(4)
items=[
 ('soai-kana','接下来，けんそう そあい 团队把放大器接成了回路。产物开始参与制造自己。','Auto'),
 ('soai-romaji','接下来，Kensō So-a-i 团队把放大器接成了回路。产物开始参与制造自己。','Auto'),
 ('kagan-french','1986年，Henri Bé Kagan 团队发现，催化剂的左右比例，并不总会照搬到产物里。','Auto'),
 ('kagan-french-ph','1986年，Henri Bé Kagane 团队发现，催化剂的左右比例，并不总会照搬到产物里。','Auto'),
]
model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
prompt=model.create_voice_clone_prompt(ref_audio=str(TTS/'work/clone-reference.wav'),ref_text=json.loads((TTS/'work/clone-reference.json').read_text('utf8'))['text'])
ledger=[]
for i,(name,text,lang) in enumerate(items):
 path=OUT/(name+'.wav');seed=2026101400+i;params={'temperature':.35,'top_p':.85,'repetition_penalty':1.05,'max_new_tokens':768,'non_streaming_mode':True}
 spec={'text':text,'language':lang,'seed':seed,'params':params,'referenceSha256':hashlib.sha256((TTS/'work/clone-reference.wav').read_bytes()).hexdigest()};key=hashlib.sha256(json.dumps(spec,ensure_ascii=False,sort_keys=True).encode()).hexdigest();record=OUT/(name+'.json')
 if path.exists() and record.exists() and json.loads(record.read_text('utf8')).get('requestHash')==key:continue
 torch.manual_seed(seed);t=time.time();w,sr=model.generate_voice_clone(text=text,language=lang,voice_clone_prompt=prompt,**params);sf.write(path,np.asarray(w[0]),sr,subtype='PCM_24');spec.update(requestHash=key,seconds=len(w[0])/sr,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),elapsedSeconds=time.time()-t);record.write_text(json.dumps(spec,ensure_ascii=False,indent=2),encoding='utf8');print(name,spec['seconds'],flush=True)
