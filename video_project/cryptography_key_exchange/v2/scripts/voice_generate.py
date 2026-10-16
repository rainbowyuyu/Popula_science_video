"""User's local Qwen3 clone; task-specific output only, no reference copies."""
import os,argparse,json,time,shutil,hashlib
os.environ.setdefault('HF_HUB_OFFLINE','1')
os.environ.setdefault('TOKENIZERS_PARALLELISM','false')
from audio_common import ROOT,OUT,TTS,story,sha,save
PARAMS={'temperature':.48,'top_p':.88,'repetition_penalty':1.1,'max_new_tokens':1000,'non_streaming_mode':True}

def main():
    p=argparse.ArgumentParser();p.add_argument('--ids',default='');p.add_argument('--seed-offset',type=int,default=0)
    p.add_argument('--device',default='cuda:0');p.add_argument('--plan',action='store_true');a=p.parse_args()
    s=story();raw=OUT/'raw';raw.mkdir(parents=True,exist_ok=True)
    ledgerpath=OUT/'voice-generation.json';ledger=json.loads(ledgerpath.read_text(encoding='utf8')) if ledgerpath.exists() else {}
    seedpath=OUT/'seed-overrides.json';seedoverrides=json.loads(seedpath.read_text(encoding='utf8')) if seedpath.exists() else {}
    ref=TTS/'work/clone-reference.wav';meta=json.loads((TTS/'work/clone-reference.json').read_text(encoding='utf8'))
    rh=sha(ref);mh=sha(TTS/'models/Qwen3-TTS-0.6B/model.safetensors')
    ids=set(a.ids.split(',')) if a.ids else None;todo=[]
    for i,c in enumerate(s['cues']):
        if ids and c['id'] not in ids:continue
        base_seed=2026101900+int(c['id'][1:])-1
        if a.seed_offset:seedoverrides[c['id']]=base_seed+a.seed_offset
        spec={'text':c['spokenText'],'referenceSha256':rh,'model':'Qwen3-TTS-0.6B',
              'modelPath':str(TTS/'models/Qwen3-TTS-0.6B'),'modelWeightsSha256':mh,
              'seed':seedoverrides.get(c['id'],base_seed),'parameters':PARAMS}
        key=hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        dest=raw/f"{c['id']}.wav";old=ledger.get(c['id'],{})
        if old.get('requestHash')==key and dest.exists() and old.get('sha256')==sha(dest):continue
        todo.append((c,spec,key,dest))
    if a.plan:
        print(json.dumps({'cuesToGenerate':len(todo),'characterCount':sum(len(c['spokenText']) for c in s['cues']),
              'localModel':str(TTS/'models/Qwen3-TTS-0.6B'),'referenceSha256':rh},ensure_ascii=False,indent=2));return
    if not todo:print('All local sources verified and cached');return
    save(seedpath,seedoverrides)
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel
    save(OUT/'story-used.json',s);torch.set_num_threads(4)
    model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map=a.device,
        dtype=torch.float32 if a.device=='cpu' else torch.bfloat16,attn_implementation='sdpa')
    prompt=model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=meta['text'])
    for c,spec,key,dest in todo:
        clock=time.perf_counter();torch.manual_seed(spec['seed'])
        waves,sr=model.generate_voice_clone(text=[spec['text']],language='Chinese',voice_clone_prompt=prompt,**PARAMS)
        x=np.asarray(waves[0],np.float32)
        if not len(x) or not np.isfinite(x).all():raise RuntimeError('Invalid source')
        if dest.exists():
            prior=OUT/'prior';prior.mkdir(exist_ok=True);h=sha(dest)
            shutil.copy2(dest,prior/f"{c['id']}-{h[:12]}.wav")
            save(prior/f"{c['id']}-{h[:12]}.json",ledger.get(c['id'],{}))
        temporary=dest.with_name(dest.stem+'.writing.wav')
        sf.write(temporary,x,sr,subtype='PCM_24')
        written=sf.info(temporary)
        if written.frames!=len(x) or written.samplerate!=sr:raise RuntimeError('Incomplete raw source write')
        temporary.replace(dest)
        ledger[c['id']]={**spec,'displayText':c['text'],'requestHash':key,'sourceStorySha256':s['sourceStorySha256'],
            'rawDurationSec':len(x)/sr,'sampleRate':sr,'file':dest.relative_to(ROOT).as_posix(),'sha256':sha(dest),
            'device':a.device,'wallSeconds':time.perf_counter()-clock,'actualProvider':'local-user-tts-project','subjectiveListeningChecked':False}
        save(ledgerpath,ledger);print(c['id'],round(len(x)/sr,3),'wallSeconds',round(time.perf_counter()-clock,2),flush=True)

if __name__=='__main__':main()
