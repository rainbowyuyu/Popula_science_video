"""Regenerate the complete DNA narration with the user's local rainbow TTS.

Task outputs live in work/audio-v4, leaving V3's delivered sources untouched.
"""
from pathlib import Path
import os, json, hashlib, time, argparse, shutil
os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

V3 = Path(__file__).resolve().parents[1]
TTS = Path('D:/python_project/tts')
OUT = V3 / 'work/audio-v4'
RAW = OUT / 'raw'
PARAMS = {'temperature': .48, 'top_p': .88, 'repetition_penalty': 1.1,
          'max_new_tokens': 1000, 'non_streaming_mode': True}

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ids', default='')
    parser.add_argument('--device', default='cuda:0')
    parser.add_argument('--seed-offset', type=int, default=0)
    args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    source = V3 / 'src/narration.json'
    script = json.loads(source.read_text(encoding='utf8'))
    overridepath = OUT / 'speech-overrides.json'
    overrides = json.loads(overridepath.read_text(encoding='utf8')) if overridepath.exists() else {}
    ledgerpath = OUT / 'voice-generation-v4.json'
    ledger = json.loads(ledgerpath.read_text(encoding='utf8')) if ledgerpath.exists() else {}
    ids = set(args.ids.split(',')) if args.ids else None
    ref = TTS / 'work/clone-reference.wav'
    refmeta = json.loads((TTS / 'work/clone-reference.json').read_text(encoding='utf8'))
    todo = []
    for i, cue in enumerate(script['cues']):
        if ids and cue['id'] not in ids: continue
        spec = {'text': overrides.get(cue['id'], cue['spokenText']), 'referenceSha256': sha(ref),
                'model': 'Qwen3-TTS-0.6B', 'modelPath': str(TTS/'models/Qwen3-TTS-0.6B'),
                'seed': 2026101140+i+args.seed_offset, 'parameters': PARAMS}
        key = hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        dest = RAW / f"{cue['id']}.wav"
        if ledger.get(cue['id'], {}).get('requestHash') == key and dest.exists(): continue
        todo.append((cue, spec, key, dest))
    if not todo:
        print('All local clips cached', flush=True)
        return
    torch.set_num_threads(4)
    model = Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'), device_map=args.device,
        dtype=torch.float32 if args.device=='cpu' else torch.bfloat16, attn_implementation='sdpa')
    prompt = model.create_voice_clone_prompt(ref_audio=str(ref), ref_text=refmeta['text'])
    for cue, spec, key, dest in todo:
        clock = time.perf_counter()
        torch.manual_seed(spec['seed'])
        waves, sr = model.generate_voice_clone(text=[spec['text']], language='Chinese',
                voice_clone_prompt=prompt, **PARAMS)
        x = np.asarray(waves[0], dtype=np.float32)
        if not np.isfinite(x).all(): raise RuntimeError('Non-finite audio')
        if dest.exists():
            prior=OUT/'prior';prior.mkdir(exist_ok=True)
            oldhash=sha(dest)
            shutil.copy2(dest,prior/f"{cue['id']}-{oldhash[:10]}.wav")
            if cue['id'] in ledger:
                (prior/f"{cue['id']}-{oldhash[:10]}.json").write_text(json.dumps(ledger[cue['id']],ensure_ascii=False,indent=2),encoding='utf8')
        sf.write(dest, x, sr, subtype='PCM_24')
        ledger[cue['id']] = {**spec, 'displayText': cue['text'], 'requestHash': key,
             'rawDurationSec': len(x)/sr, 'sampleRate': sr, 'file': dest.relative_to(V3).as_posix(),
             'sha256': sha(dest), 'device': args.device, 'wallSeconds': time.perf_counter()-clock,
             'subjectiveListeningChecked': False, 'actualProvider': 'local-user-tts-project'}
        ledgerpath.write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding='utf8')
        print(cue['id'], round(len(x)/sr, 3), 'wallSeconds', round(time.perf_counter()-clock, 2), flush=True)

if __name__ == '__main__': main()
