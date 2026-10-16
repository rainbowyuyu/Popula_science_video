"""Generate rainbow鱼 narration for the DNA storage episode with the local Qwen voice clone."""
from pathlib import Path
import os,json,time,hashlib,argparse
os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
import numpy as np,soundfile as sf,torch
from qwen_tts import Qwen3TTSModel

R=Path(__file__).resolve().parents[1];T=Path('D:/python_project/tts');raw=R/'public/audio/raw';raw.mkdir(parents=True,exist_ok=True)
timeline=json.loads((R/'src/timeline.json').read_text('utf8'))
rows=[]
for i,c in enumerate(timeline['captions']):
    text=c['text']
    if i==0: text=text.replace('DNA','DNA（脱氧核糖核酸）',1)
    text=text.replace('DNA Fountain','DNA Fountain算法').replace('A、T、C、G','A、T、C、G四个字母').replace('GC','G、C').replace('k-mer','k-mer片段').replace('BPE','BPE分词')
    rows.append({'id':f'{i:03d}','spoken':text})
parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=999);parser.add_argument('--batch-size',type=int,default=4);args=parser.parse_args()
ref=T/'work/clone-reference.wav';meta=T/'work/clone-reference.json';params={'temperature':.58,'top_p':.9,'repetition_penalty':1.08,'max_new_tokens':512,'non_streaming_mode':True}
ledger=R/'research/voice-generation.json';data=json.loads(ledger.read_text('utf8')) if ledger.exists() else {};refhash=hashlib.sha256(ref.read_bytes()).hexdigest();torch.set_num_threads(4)
todo=[]
for row in rows:
    spec={'text':row['spoken'],'referenceSha256':refhash,'model':'Qwen3-TTS-0.6B','parameters':params};h=hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest();p=raw/(row['id']+'.wav')
    if data.get(row['id'],{}).get('requestHash')==h and p.exists():continue
    todo.append((row,spec,h))
if todo:
    print('Loading rainbow鱼 Qwen voice; clips',min(args.limit,len(todo)),flush=True)
    model=Qwen3TTSModel.from_pretrained(str(T/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
    prompt=model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=json.loads(meta.read_text('utf8'))['text'])
    for begin in range(0,min(len(todo),args.limit),args.batch_size):
        batch=todo[begin:begin+args.batch_size];torch.manual_seed(20261010+begin)
        waves,sr=model.generate_voice_clone(text=[r['spoken'] for r,_,_ in batch],language='Chinese',voice_clone_prompt=prompt,**params)
        for (row,spec,h),wave in zip(batch,waves):
            w=np.asarray(wave);assert np.isfinite(w).all();p=raw/(row['id']+'.wav');sf.write(p,w,sr,subtype='PCM_24');data[row['id']]={**spec,'requestHash':h,'seconds':len(w)/sr,'file':p.as_posix()};print(row['id'],round(len(w)/sr,2),'sec',flush=True)
        ledger.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
else: print('All voice clips cached')
