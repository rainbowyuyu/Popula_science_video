"""Generate episode 3 narration with the user's existing rainbow鱼 reference voice."""
from pathlib import Path
import os,json,time,hashlib,argparse
os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
import numpy as np,soundfile as sf,torch
from qwen_tts import Qwen3TTSModel

R=Path(__file__).resolve().parents[1]; T=Path('D:/python_project/tts')
P=R/'public/episode3v2/voice-raw'; P.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=999);parser.add_argument('--batch-size',type=int,default=4);parser.add_argument('--seed',type=int,default=20261003);args=parser.parse_args()
rows=json.loads((R/'research/episode3v2/story.json').read_text('utf8'))
ref=T/'work/clone-reference.wav'; meta=T/'work/clone-reference.json'
params={'temperature':.60,'top_p':.90,'repetition_penalty':1.08,'max_new_tokens':512,'non_streaming_mode':True}
ledger=R/'research/episode3v2/voice-generation.json'; data=json.loads(ledger.read_text('utf8')) if ledger.exists() else {}
refhash=hashlib.sha256(ref.read_bytes()).hexdigest(); torch.set_num_threads(4)
todo=[]
for row in rows:
    numeric_id=int(''.join(ch for ch in row['id'] if ch.isdigit()) or 0)
    spec={'text':row['spoken'],'referenceSha256':refhash,'model':'Qwen3-TTS-0.6B','seed':args.seed+(numeric_id//args.batch_size)*args.batch_size,'batchSize':args.batch_size,'parameters':params}
    h=hashlib.sha256(json.dumps(spec,sort_keys=True).encode()).hexdigest(); p=P/(row['id']+'.wav')
    if data.get(row['id'],{}).get('requestHash')==h and p.exists(): continue
    todo.append((row,spec,h))
if not todo:
    print('All episode 3 voice clips cached'); raise SystemExit
print('Loading rainbow voice; clips',min(args.limit,len(todo)),flush=True)
model=Qwen3TTSModel.from_pretrained(str(T/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
prompt=model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=json.loads(meta.read_text('utf8'))['text'])
for begin in range(0,min(len(todo),args.limit),args.batch_size):
    batch=todo[begin:begin+args.batch_size]; start=time.time(); torch.manual_seed(batch[0][1]['seed'])
    waves,sr=model.generate_voice_clone(text=[row['spoken'] for row,spec,h in batch],language='Chinese',voice_clone_prompt=prompt,**params)
    for (row,spec,h),wave in zip(batch,waves):
        w=np.asarray(wave); assert np.isfinite(w).all() and .5<len(w)/sr<25
        p=P/(row['id']+'.wav'); sf.write(p,w,sr,subtype='PCM_24')
        data[row['id']]={**spec,'actualBatchSeed':batch[0][1]['seed'],'actualBatchIds':[x[0]['id'] for x in batch],'requestHash':h,'file':p.relative_to(R).as_posix(),'seconds':len(w)/sr,'sampleRate':sr,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'elapsedSeconds':time.time()-start}
        print(row['id'],round(len(w)/sr,2),'sec',flush=True)
    ledger.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
print('Voice pass complete')
