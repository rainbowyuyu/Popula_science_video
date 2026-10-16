"""Generate V2 narration with the local rainbow鱼 Qwen3-TTS voice clone.

The script is intentionally local-only. It reads the V2 timeline, keeps a
request hash for every sentence, and never stores credentials in the project.
"""
from __future__ import annotations
import hashlib, json, os
from pathlib import Path

os.environ.setdefault('HF_HUB_OFFLINE', '1')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ROOT = Path(__file__).resolve().parents[2]
TTS_ROOT = Path('D:/python_project/tts')
RAW = ROOT / 'v2/public/audio/raw'
RAW.mkdir(parents=True, exist_ok=True)
TIMELINE = json.loads((ROOT / 'v2/src/timeline.json').read_text(encoding='utf8'))
LEDGER_PATH = ROOT / 'v2/research/voice-generation-v2.json'
ledger = json.loads(LEDGER_PATH.read_text(encoding='utf8')) if LEDGER_PATH.exists() else {}
REF_AUDIO = TTS_ROOT / 'work/clone-reference.wav'
REF_META = TTS_ROOT / 'work/clone-reference.json'
MODEL_PATH = TTS_ROOT / 'models/Qwen3-TTS-0.6B'

PARAMS = {'temperature': 0.55, 'top_p': 0.9, 'repetition_penalty': 1.08, 'max_new_tokens': 560, 'non_streaming_mode': True}

def spoken(text: str, index: int) -> str:
    text = text.replace('DNA Fountain', 'DNA Fountain 算法')
    text = text.replace('DNA 存储', 'DNA 存储')
    text = text.replace('A、T、C、G', 'A、T、C、G 四个字母')
    text = text.replace('GC', 'G、C')
    text = text.replace('Smith–Waterman', '史密斯沃特曼')
    text = text.replace('token', 'token 片段')
    text = text.replace('DNA', 'DNA，脱氧核糖核酸', 1) if index == 0 else text
    return text

def main() -> int:
    if not REF_AUDIO.exists() or not REF_META.exists() or not MODEL_PATH.exists():
        raise SystemExit(f'missing local voice assets under {TTS_ROOT}')
    ref_hash = hashlib.sha256(REF_AUDIO.read_bytes()).hexdigest()
    todo = []
    for i, cue in enumerate(TIMELINE['narration']):
        text = spoken(cue['text'], i)
        # An empty cue is an intentional visual-only hold (for example the
        # five-second evidence coda). Keep its cue id in the timeline but do
        # not ask the TTS model to synthesize silence.
        if not text.strip():
            continue
        spec = {'text': text, 'referenceSha256': ref_hash, 'model': 'Qwen3-TTS-0.6B', 'parameters': PARAMS}
        request_hash = hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        path = RAW / f'{i:03d}.wav'
        if ledger.get(f'{i:03d}', {}).get('requestHash') == request_hash and path.exists():
            continue
        todo.append((i, text, spec, request_hash, path))
    if not todo:
        print('All V2 voice clips cached')
        return 0
    torch.set_num_threads(4)
    print(f'Loading rainbow鱼 Qwen voice; clips={len(todo)}', flush=True)
    model = Qwen3TTSModel.from_pretrained(str(MODEL_PATH), device_map='cuda:0', dtype=torch.bfloat16, attn_implementation='sdpa')
    prompt = model.create_voice_clone_prompt(ref_audio=str(REF_AUDIO), ref_text=json.loads(REF_META.read_text(encoding='utf8'))['text'])
    # Qwen3-TTS can hold a large GPU graph for multi-clip batches on some
    # drivers.  Generate one cached clip at a time so a stalled batch cannot
    # block the rest of the narration; existing files remain untouched.
    for start in range(0, len(todo), 1):
        batch = todo[start:start + 1]
        torch.manual_seed(20261011 + start)
        waves, sample_rate = model.generate_voice_clone(text=[row[1] for row in batch], language='Chinese', voice_clone_prompt=prompt, **PARAMS)
        for (index, text, spec, request_hash, path), wave in zip(batch, waves):
            arr = np.asarray(wave, dtype=np.float32)
            if not np.isfinite(arr).all(): raise RuntimeError(f'non-finite audio in {index:03d}')
            sf.write(path, arr, sample_rate, subtype='PCM_24')
            ledger[f'{index:03d}'] = {**spec, 'text': text, 'requestHash': request_hash, 'seconds': len(arr) / sample_rate, 'file': path.as_posix()}
            print(f'{index:03d} {len(arr) / sample_rate:.2f}s', flush=True)
        LEDGER_PATH.write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding='utf8')
    return 0

if __name__ == '__main__': raise SystemExit(main())
