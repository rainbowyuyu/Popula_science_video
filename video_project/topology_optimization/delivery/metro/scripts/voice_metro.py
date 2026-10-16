"""Reproducible sentence-level rainbow鱼 narration, using the local personal clone."""
from pathlib import Path
import os, json, hashlib, argparse, time
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

R = Path(__file__).resolve().parents[1]
T = Path('D:/python_project/tts')
P = R / 'public/metro/voice-raw'
Q = R / 'research/metro'
P.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--limit', type=int, default=999)
parser.add_argument('--batch-size', type=int, default=4)
parser.add_argument('--seed', type=int, default=20261004)
parser.add_argument('--ids', default='')
args = parser.parse_args()
story = json.loads((Q/'story.json').read_text('utf-8-sig'))
rows = []
for scene in story['scenes']:
    for i, line in enumerate(scene.get('lines', [])):
        if isinstance(line, str): line = {'text': line}
        text = line['text']
        rows.append({'id': f'{len(rows):03}', 'scene':scene['id'], 'title':scene['title'],
                     'line':i, 'text':text, 'spoken':line.get('spoken', text)})
(Q/'voice-lines.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf8')
ref = T/'work/clone-reference.wav'
meta = T/'work/clone-reference.json'
refhash = hashlib.sha256(ref.read_bytes()).hexdigest()
params = {'temperature':.60, 'top_p':.90, 'repetition_penalty':1.08,
          'max_new_tokens':640, 'non_streaming_mode':True}
ledger = Q/'voice-generation.json'
data = json.loads(ledger.read_text('utf8')) if ledger.exists() else {}
requested = set(args.ids.split(',')) if args.ids else None
batches = []
for begin in range(0, len(rows), args.batch_size):
    batch = rows[begin:begin+args.batch_size]
    if requested is not None:
        batch = [r for r in batch if r['id'] in requested]
        if not batch: continue
    ids = [r['id'] for r in batch]
    specs = []
    for row in batch:
        spec = {'text':row['spoken'], 'referenceSha256':refhash, 'model':'Qwen3-TTS-0.6B',
                'seed':args.seed+begin, 'batchSize':len(batch), 'batchIds':ids,
                'batchTexts':[r['spoken'] for r in batch], 'parameters':params,
                'targetedCorrection':requested is not None}
        h = hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        specs.append((row,spec,h))
    # A requested correction records its actual smaller batch. Existing valid
    # one-sentence corrections remain reusable on a later complete run.
    if requested is not None and not requested.intersection(ids): continue
    if all((data.get(r['id'],{}).get('requestHash')==h or
            (data.get(r['id'],{}).get('text')==r['spoken'] and
             data.get(r['id'],{}).get('referenceSha256')==refhash and
             data.get(r['id'],{}).get('parameters')==params and
             data.get(r['id'],{}).get('seed')==s['seed'] and
             data.get(r['id'],{}).get('model')=='Qwen3-TTS-0.6B')) and (P/(r['id']+'.wav')).exists()
            and data.get(r['id'],{}).get('sha256')==hashlib.sha256((P/(r['id']+'.wav')).read_bytes()).hexdigest()
           for r,s,h in specs) and requested is None: continue
    batches.append(specs)
if not batches:
    print('All metro voice clips cached', flush=True)
    raise SystemExit
torch.set_num_threads(4)
print('Loading local rainbow voice; pending clips', sum(len(b) for b in batches), flush=True)
model = Qwen3TTSModel.from_pretrained(str(T/'models/Qwen3-TTS-0.6B'),
    device_map='cuda:0', dtype=torch.bfloat16, attn_implementation='sdpa')
prompt = model.create_voice_clone_prompt(ref_audio=str(ref), ref_text=json.loads(meta.read_text('utf8'))['text'])
count = 0
for batch in batches:
    if count >= args.limit: break
    start = time.time()
    torch.manual_seed(batch[0][1]['seed'])
    waves, sr = model.generate_voice_clone(text=[r['spoken'] for r,s,h in batch],
        language='Chinese', voice_clone_prompt=prompt, **params)
    for (row,spec,h), wave in zip(batch,waves):
        w = np.asarray(wave)
        assert np.isfinite(w).all() and .5 < len(w)/sr < 30, row['id']
        dest = P/(row['id']+'.wav')
        sf.write(dest,w,sr,subtype='PCM_24')
        data[row['id']] = {**spec, 'requestHash':h, 'file':dest.relative_to(R).as_posix(),
            'seconds':len(w)/sr, 'sampleRate':sr, 'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),
            'elapsedBatchSeconds':time.time()-start}
        print(row['id'],round(len(w)/sr,3),'sec',flush=True)
        count += 1
    ledger.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
print('Metro voice generation completed',flush=True)
