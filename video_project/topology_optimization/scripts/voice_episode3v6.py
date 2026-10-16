"""Generate and align the v6 pavilion narration with the Rainbow reference voice."""
from pathlib import Path
import os, json, time, hashlib, subprocess, argparse
os.environ['HF_HUB_OFFLINE']='1'; os.environ['TOKENIZERS_PARALLELISM']='false'
import numpy as np, soundfile as sf, torch
from qwen_tts import Qwen3TTSModel

R=Path(__file__).resolve().parents[1]; T=Path('D:/python_project/tts'); PUB=R/'public/episode3v6'
RAW=PUB/'voice-raw'; VOICE=PUB/'voice'; RAW.mkdir(parents=True,exist_ok=True); VOICE.mkdir(parents=True,exist_ok=True)
ap=argparse.ArgumentParser(); ap.add_argument('--limit',type=int,default=999); ap.add_argument('--batch-size',type=int,default=4); ap.add_argument('--seed',type=int,default=20261005); args=ap.parse_args()
timeline=json.loads((PUB/'timeline.json').read_text('utf8')); rows=timeline['clips']
ref=T/'work/clone-reference.wav'; meta=json.loads((T/'work/clone-reference.json').read_text('utf8'))
ledger=R/'research/episode3v6-voice.json'; data=json.loads(ledger.read_text('utf8')) if ledger.exists() else {}
refhash=hashlib.sha256(ref.read_bytes()).hexdigest(); params={'temperature':.60,'top_p':.90,'repetition_penalty':1.08,'max_new_tokens':512,'non_streaming_mode':True}
torch.set_num_threads(4); todo=[]
for i,row in enumerate(rows):
    spec={'text':row['spoken'],'referenceSha256':refhash,'model':'Qwen3-TTS-0.6B','seed':args.seed+(i//args.batch_size)*args.batch_size,'batchSize':args.batch_size,'parameters':params}
    h=hashlib.sha256(json.dumps(spec,sort_keys=True).encode()).hexdigest(); p=RAW/(row['id']+'.wav')
    if data.get(row['id'],{}).get('requestHash')==h and p.exists(): continue
    todo.append((row,spec,h))
if todo:
    print('Loading rainbow reference voice; clips',min(args.limit,len(todo)),flush=True)
    model=Qwen3TTSModel.from_pretrained(str(T/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
    prompt=model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=meta['text'])
    for begin in range(0,min(len(todo),args.limit),args.batch_size):
        batch=todo[begin:begin+args.batch_size]; torch.manual_seed(batch[0][1]['seed']); start=time.time()
        waves,sr=model.generate_voice_clone(text=[x[0]['spoken'] for x in batch],language='Chinese',voice_clone_prompt=prompt,**params)
        for (row,spec,h),wave in zip(batch,waves):
            w=np.asarray(wave); assert np.isfinite(w).all() and .5<len(w)/sr<30
            p=RAW/(row['id']+'.wav'); sf.write(p,w,sr,subtype='PCM_24')
            data[row['id']]={**spec,'actualBatchSeed':batch[0][1]['seed'],'actualBatchIds':[x[0]['id'] for x in batch],'requestHash':h,'file':p.relative_to(R).as_posix(),'seconds':len(w)/sr,'sampleRate':sr,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'elapsedSeconds':time.time()-start}
            print(row['id'],round(len(w)/sr,2),'sec',flush=True)
        ledger.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
else: print('raw voice clips cached',flush=True)

# Master each line to its existing camera clip length. This keeps all chapter
# transitions deterministic while preserving the newly written story.
for row in rows:
    raw=RAW/(row['id']+'.wav'); dst=VOICE/(row['id']+'.wav'); target=row['duration']/timeline['fps']
    import tempfile
    with tempfile.TemporaryDirectory(prefix='v6-voice-') as td:
        mid=Path(td)/'mid.wav'
        filt=f'highpass=f=65,lowpass=f=10600,afftdn=nr=3:nf=-55:tn=0:gs=8,equalizer=f=240:t=q:w=0.8:g=-1.4,equalizer=f=2700:t=q:w=0.8:g=0.7,deesser=i=0.12:m=0.25:f=0.5,acompressor=threshold=0.16:ratio=1.65:attack=18:release=150:knee=2.2:makeup=1,apad,atrim=duration={max(target*1.3,.2):.6f}'
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-af',filt,'-ar','48000','-ac','1','-c:a','pcm_s24le',str(mid)],check=True)
        rate=max(.60,min(1.65,(mid.stat().st_size/4/48000)/target))
        af=f'rubberband=tempo={rate:.8f},atrim=duration={target:.6f},afade=t=in:d=0.008,afade=t=out:st={max(0,target-.025):.6f}:d=0.025'
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(mid),'-af',af,'-ar','48000','-ac','1','-c:a','pcm_s24le',str(dst)],check=True)

# Assemble narration at the clip start frames.
sr=48000; total=timeline['duration']*sr//timeline['fps']; full=np.zeros(total,dtype=np.float32)
for row in rows:
    w,s=sf.read(VOICE/(row['id']+'.wav'),dtype='float32')
    if w.ndim>1:w=w.mean(axis=1)
    start=row['start']*sr//timeline['fps']; full[start:start+min(len(w),total-start)]+=w[:max(0,total-start)]
sf.write(PUB/'narration.wav',np.column_stack([full,full]),sr,subtype='PCM_24')
ledger.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
print('v6 narration ready',round(total/sr,3),'seconds',flush=True)
