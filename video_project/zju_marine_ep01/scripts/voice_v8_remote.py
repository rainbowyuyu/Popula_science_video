"""Isolated server TTS. CUDA_VISIBLE_DEVICES is set by the launcher, never here."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import time
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent
RAW = ROOT / 'raw'
PARAMS = {'temperature': .48, 'top_p': .88, 'repetition_penalty': 1.1,
          'max_new_tokens': 1000, 'non_streaming_mode': True}

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--ids',default='');ap.add_argument('--variant',type=int,default=0)
    args=ap.parse_args()
    os.environ.setdefault('HF_HUB_OFFLINE', '1')
    os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
    import torch
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    rawdir=RAW if not args.variant else ROOT/f'raw-variant-{args.variant}'
    rawdir.mkdir(exist_ok=True)
    story = json.loads((ROOT/'story-v8-draft.json').read_text(encoding='utf8'))
    ref, refmeta = ROOT/'clone-reference.wav', ROOT/'clone-reference.json'
    reftext = json.loads(refmeta.read_text(encoding='utf8'))['text']
    ledgerpath = ROOT/('voice-ledger-raw.json' if not args.variant else f'voice-ledger-raw-variant-{args.variant}.json')
    ledger = json.loads(ledgerpath.read_text()) if ledgerpath.exists() else {}
    model = Qwen3TTSModel.from_pretrained(str(ROOT/'model'), device_map='cuda:0',
                dtype=torch.bfloat16, attn_implementation='sdpa')
    prompt = model.create_voice_clone_prompt(ref_audio=str(ref),ref_text=reftext)
    for cue in story['sentences']:
        ident = cue['id']
        if args.ids and ident not in args.ids.split(','):continue
        seed = 2026101408 + sum((j+1)*ord(ch) for j,ch in enumerate(ident)) + args.variant*101
        spec = {**PARAMS,'text':cue['spoken'],'referenceSha256':sha(ref),
                'model':'Qwen3-TTS-0.6B','seed':seed}
        request = hashlib.sha256(json.dumps(spec,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        path = rawdir/f'{ident}.wav'
        if path.exists() and ledger.get(ident,{}).get('requestHash') == request:
            continue
        start = time.perf_counter()
        torch.manual_seed(seed)
        waves, sr = model.generate_voice_clone(text=[cue['spoken']],language='Chinese',
                         voice_clone_prompt=prompt, **PARAMS)
        x = np.asarray(waves[0],dtype=np.float32)
        if not np.isfinite(x).all():
            raise ValueError(f'Non-finite {ident}')
        x = np.pad(x,(round(.08*sr),round(.16*sr)))
        sf.write(path,x,sr,subtype='PCM_24')
        ledger[ident] = {'id':ident,'displayText':cue['text'],'spoken':cue['spoken'],
            'requestHash':request,'referenceSha256':sha(ref),'referenceText':reftext,
            'model':'Qwen3-TTS-0.6B','seed':seed,'parameters':PARAMS,
            'rawSha256':sha(path),'sampleRate':sr,'durationSec':len(x)/sr,
            'wallSeconds':time.perf_counter()-start,'subjectiveListeningChecked':False,
            'actualProvider':'user-local-model-on-authorized-SSH-GPU1',
            'gpu':torch.cuda.get_device_name(0),'visibleDevices':os.environ.get('CUDA_VISIBLE_DEVICES')}
        ledgerpath.write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf8')
        print(ident,round(len(x)/sr,3),'sec',round(time.perf_counter()-start,2),'wall',flush=True)
    print('all complete',flush=True)

if __name__ == '__main__':
    main()
