"""Bounded local rainbow鱼 narration. --plan validates without loading a model."""
import os, argparse, json, time, hashlib, shutil
from pathlib import Path
from audio_v6_common import ROOT, OUT, TTS, DEFAULT_STORY, load_story, source_plan, sha, save
os.environ.setdefault('HF_HUB_OFFLINE','1')
os.environ.setdefault('TOKENIZERS_PARALLELISM','false')
PARAMS={'temperature':.48,'top_p':.88,'repetition_penalty':1.1,'max_new_tokens':1000,'non_streaming_mode':True}

def main():
    p=argparse.ArgumentParser();p.add_argument('--story',type=Path,default=DEFAULT_STORY)
    p.add_argument('--plan',action='store_true');p.add_argument('--ids',default='')
    p.add_argument('--device',default='cuda:0');p.add_argument('--seed-offset',type=int,default=0)
    p.add_argument('--threads',type=int,default=4);args=p.parse_args()
    story=load_story(args.story);OUT.mkdir(parents=True,exist_ok=True)
    save(OUT/'voice-plan.json',source_plan(story))
    if args.plan:
        print(json.dumps(source_plan(story),ensure_ascii=False,indent=2));return
    # Imported only for an explicitly launched synthesis call; planning is CPU-only.
    import numpy as np
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel
    rawdir=OUT/'raw';rawdir.mkdir(exist_ok=True)
    ledgerpath=OUT/'voice-generation-v6.json'
    ledger=json.loads(ledgerpath.read_text(encoding='utf8')) if ledgerpath.exists() else {}
    ids=set(args.ids.split(',')) if args.ids else None
    unknown=ids-set(c['id'] for c in story['cues']) if ids else set()
    if unknown: raise ValueError('Unknown ids: '+','.join(sorted(unknown)))
    ref=TTS/'work/clone-reference.wav';refmeta=json.loads((TTS/'work/clone-reference.json').read_text(encoding='utf8'))
    referenceHash=sha(ref);weightsHash=sha(TTS/'models/Qwen3-TTS-0.6B/model.safetensors')
    todo=[]
    for i,cue in enumerate(story['cues']):
        if ids and cue['id'] not in ids:continue
        spec={'text':cue['spokenText'],'referenceSha256':referenceHash,'model':'Qwen3-TTS-0.6B',
              'modelPath':str(TTS/'models/Qwen3-TTS-0.6B'),'modelWeightsSha256':weightsHash,
              'seed':2026101150+i+args.seed_offset,'parameters':PARAMS}
        key=hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        dest=rawdir/f"{cue['id']}.wav";old=ledger.get(cue['id'],{})
        if old.get('requestHash')==key and dest.exists() and old.get('sha256')==sha(dest):continue
        todo.append((cue,spec,key,dest))
    if not todo: print('All V6 local sources cached');return
    save(OUT/'story-used.json',story)
    torch.set_num_threads(args.threads)
    model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map=args.device,
        dtype=torch.float32 if args.device=='cpu' else torch.bfloat16,attn_implementation='sdpa')
    prompt=model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=refmeta['text'])
    for cue,spec,key,dest in todo:
        clock=time.perf_counter();torch.manual_seed(spec['seed'])
        waves,sr=model.generate_voice_clone(text=[spec['text']],language='Chinese',voice_clone_prompt=prompt,**PARAMS)
        x=np.asarray(waves[0],dtype=np.float32)
        if not np.isfinite(x).all() or len(x)==0:raise RuntimeError('Invalid generated audio')
        if dest.exists():
            prior=OUT/'prior';prior.mkdir(exist_ok=True);oldhash=sha(dest)
            shutil.copy2(dest,prior/f"{cue['id']}-{oldhash[:10]}.wav")
            if cue['id'] in ledger:save(prior/f"{cue['id']}-{oldhash[:10]}.json",ledger[cue['id']])
        sf.write(dest,x,sr,subtype='PCM_24')
        ledger[cue['id']]={**spec,'displayText':cue['text'],'requestHash':key,
            'sourceStorySha256':story['sourceStorySha256'],'rawDurationSec':len(x)/sr,'sampleRate':sr,
            'file':dest.relative_to(ROOT).as_posix(),'sha256':sha(dest),'device':args.device,
            'wallSeconds':time.perf_counter()-clock,'actualProvider':'local-user-tts-project','subjectiveListeningChecked':False}
        save(ledgerpath,ledger)
        print(cue['id'],round(len(x)/sr,3),'wallSeconds',round(time.perf_counter()-clock,2),flush=True)

if __name__=='__main__':main()
