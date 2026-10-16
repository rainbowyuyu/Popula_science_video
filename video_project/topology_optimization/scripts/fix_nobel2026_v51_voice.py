"""Isolated one-sentence scientific correction; preserves all V4/V5 assets."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
TTS = Path('D:/python_project/tts')
OUT = ROOT / 'public/nobel2026/audio-v51'
RECORD = ROOT / 'research/nobel2026/v51/voice-patch.json'
TEXTS = [
    '装上光控通道的细胞，受到光照才会响应。',
    '装上通道，再受到光照，细胞才会响应。',
    '光照之下，装上通道的细胞才会响应。',
]
JOBS = {'004-03': ['两根细长鞭毛，立刻改变节奏。'],
        '016-02': TEXTS,
        '021-02': ['有了光，研究者问得更精确：']}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def generate(ids=''):
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'
    import torch
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    model = Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'), device_map='cuda:0',
                                         dtype=torch.bfloat16, attn_implementation='sdpa')
    reference = TTS/'work/clone-reference.wav'
    prompt = model.create_voice_clone_prompt(ref_audio=str(reference),
               ref_text=json.loads((TTS/'work/clone-reference.json').read_text(encoding='utf-8'))['text'])
    params = dict(temperature=.58, top_p=.88, repetition_penalty=1.08, max_new_tokens=256, non_streaming_mode=True)
    (OUT/'candidates').mkdir(parents=True, exist_ok=True)
    selected_ids={x.strip() for x in ids.split(',') if x.strip()}
    old_record=json.loads(RECORD.read_text(encoding='utf-8')) if RECORD.exists() else {}
    rows = [r for r in old_record.get('candidates',[]) if selected_ids and r['id'] not in selected_ids]
    for jid, texts in JOBS.items():
        if selected_ids and jid not in selected_ids:
            continue
        for index, text in enumerate(texts):
            path = OUT/'candidates'/f'{jid}-candidate-{index+1}.wav'
            seed = 20261020 + int(jid[:3])*7 + index
            torch.manual_seed(seed)
            waves, sr = model.generate_voice_clone(text=[text], language='Chinese', voice_clone_prompt=prompt, **params)
            sf.write(path, np.asarray(waves[0], dtype=np.float32), sr, subtype='PCM_24')
            rows.append({'id': jid, 'candidate': index+1, 'text': text, 'seed': seed, 'params': params,
                         'durationSeconds': len(waves[0])/sr, 'file': path.relative_to(ROOT).as_posix(),
                         'sha256': sha(path), 'referenceSHA256': sha(reference)})
            print(f'{jid} candidate={index+1} duration={len(waves[0])/sr:.3f}s', flush=True)
    RECORD.parent.mkdir(parents=True, exist_ok=True)
    RECORD.write_text(json.dumps({'candidates': rows, 'selected': None, 'subjectiveListeningChecked': False}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def assemble(candidate):
    # Import the same transparent low-cut and resampler as the original stem.
    from build_nobel2026_v4_timeline import load_take, speech_bounds
    record = json.loads(RECORD.read_text(encoding='utf-8'))
    voice, sr = sf.read(ROOT/'public/nobel2026/audio-v4/voice.wav', dtype='float32', always_2d=True)
    music, msr = sf.read(ROOT/'public/nobel2026/audio-v4/music.wav', dtype='float32', always_2d=True)
    if sr != 48000 or msr != sr or len(voice) != len(music):
        raise RuntimeError('Original stems do not match')
    original_voice=voice.copy()
    replaced=np.zeros(len(voice),dtype=bool)
    timeline_file = ROOT/'src/nobel2026/timeline-v51.json'
    timeline = json.loads(timeline_file.read_text(encoding='utf-8-sig'))
    original = json.loads((ROOT/'research/nobel2026/v4/assembly.json').read_text(encoding='utf-8'))
    patches=[]
    for jid in JOBS:
        number = candidate if jid=='016-02' else 1
        selected = next(r for r in record['candidates'] if r['id']==jid and r['candidate']==number)
        source = ROOT/selected['file']
        x = load_take(source)
        old_take=next(r for r in original['takes'] if r['id']==jid)
        absolute=old_take['startFrame']/30+old_take['startOffsetSeconds']
        begin, slot = round(absolute*sr), round(old_take['durationSeconds']*sr)
        first, last = speech_bounds(x)
        # No source clipping or speed change. Require actual articulation plus
        # a quarter second of silence to fit inside the original allocated slot.
        if len(x) > slot or last + round(.25*sr) > slot:
            raise RuntimeError(f'{jid} cannot fit safely: raw={len(x)/sr:.3f}, last speech={last/sr:.3f}, slot={slot/sr:.3f}')
        old = voice[begin:begin+slot].copy()
        old_active = np.sqrt(np.mean(old**2, axis=1)) > .006
        new_active = np.sqrt(np.mean(x**2, axis=1)) > .006
        old_rms = float(np.sqrt(np.mean(old[old_active]**2)))
        new_rms = float(np.sqrt(np.mean(x[new_active]**2)))
        gain = float(np.clip(old_rms/max(new_rms,1e-8), .8, 1.25))
        voice[begin:begin+slot] = 0
        voice[begin:begin+len(x)] = x*gain
        replaced[begin:begin+slot]=True
        clip = next(c for c in timeline['clips'] if c['id']==jid[:3])
        part = next(p for p in clip['subtitleParts'] if p['source']==jid)
        offset=old_take['startOffsetSeconds']
        last_phrase=part is clip['subtitleParts'][-1]
        part.update(text=selected['text'], start=round(offset+max(0,first/sr-.07),4),
                    end=round(offset+last/sr+(.02 if last_phrase else .12),4))
        clip['spoken'] = clip['subtitle'] = ' '.join(p['text'] for p in clip['subtitleParts'])
        if last_phrase:
            clip['asrSpeechEnd'] = clip['sourceDurationSeconds'] = round(offset+len(x)/sr,4)
            clip['breathSeconds'] = round((clip['end']-clip['start'])/timeline['fps']-clip['sourceDurationSeconds'],4)
        patches.append(dict(id=jid,selected=number,text=selected['text'],sourceSHA256=sha(source),gain=gain,
                            originalSlotSeconds=[absolute,absolute+slot/sr],sourceDurationSeconds=len(x)/sr,
                            audibleRangeSeconds=[absolute+first/sr,absolute+last/sr],
                            silenceBeforeSlotEndSeconds=(slot-last)/sr,speedFactor=1.0))
    OUT.mkdir(parents=True, exist_ok=True)
    sf.write(OUT/'voice.wav', voice, sr, subtype='PCM_24')
    # The old narration has been removed from the clean stem before mixing.
    # The music is the exact previous independent stem, with no duplicate bed.
    sf.write(OUT/'premaster.wav', voice+music, sr, subtype='PCM_24')
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(OUT/'premaster.wav'),
                    '-af','loudnorm=I=-16:LRA=8:TP=-1.2:dual_mono=true','-ar',str(sr),'-ac','2',
                    '-c:a','pcm_s24le',str(OUT/'master.wav')],check=True)
    timeline['voicePolicy']['source'] = 'public/nobel2026/audio-v51/master.wav'
    timeline['voicePolicy']['scientificCorrections'] = ['004-03: anterior flagella, remove wrong tail location',
        '016-02: response specificity comes from expressed light-gated channels', '021-02: more precise causality, not the first causal intervention']
    timeline_file.write_text(json.dumps(timeline,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    record.update(selected=patches, durationFrames=timeline['duration'],
                  oldVoiceSHA256=sha(ROOT/'public/nobel2026/audio-v4/voice.wav'),
                  musicSHA256=sha(ROOT/'public/nobel2026/audio-v4/music.wav'),
                  newVoiceSHA256=sha(OUT/'voice.wav'), masterSHA256=sha(OUT/'master.wav'),
                  oldVoiceRemovedBeforeMix=True, noSourceAudioTrim=True,
                  unchangedStemSamplesOutsidePatch=bool(np.array_equal(voice[~replaced],original_voice[~replaced])),
                  maxOutsidePatchDifference=float(np.max(np.abs(voice[~replaced]-original_voice[~replaced]))))
    RECORD.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    for cid,start in [('004',52),('016',186),('021',252)]:
        preview = ROOT/f'delivery/nobel2026_v5_1/audio-check-{cid}-correction.wav'
        preview.parent.mkdir(parents=True,exist_ok=True)
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(start),'-t','15','-i',str(OUT/'master.wav'),str(preview)],check=True)
    print(f'V51 patched {len(patches)} sentences, total {len(voice)/sr:.3f}s')


def audit():
    from faster_whisper import WhisperModel
    from build_nobel2026_v4_timeline import load_take, speech_bounds
    model=WhisperModel(str(TTS/'models/whisper-small'),device='cpu',compute_type='int8',cpu_threads=6)
    record=json.loads(RECORD.read_text(encoding='utf-8'))
    rows=[]
    for item in record['candidates']:
        path=ROOT/item['file']
        segments, _ = model.transcribe(str(path),language='zh',beam_size=5,vad_filter=False,word_timestamps=True)
        segments=list(segments)
        x=load_take(path)
        first,last=speech_bounds(x)
        rows.append(dict(id=item['id'],candidate=item['candidate'],expected=item['text'],
                         recognized=' '.join(s.text for s in segments).strip(),
                         audioSeconds=len(x)/48000,acousticOnsetSeconds=first/48000,
                         acousticTailSeconds=last/48000,
                         asrLastWordEnd=max((w.end for s in segments for w in (s.words or [])),default=0),
                         subjectiveListeningChecked=False))
        print(item['id'],item['candidate'],'checked',flush=True)
    (RECORD.parent/'patch-asr.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def export_text():
    timeline=json.loads((ROOT/'src/nobel2026/timeline-v51.json').read_text(encoding='utf-8-sig'))
    delivery=ROOT/'delivery/nobel2026_v5_1'
    delivery.mkdir(parents=True,exist_ok=True)
    def stamp(seconds):
        ms=round(seconds*1000)
        return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
    rows=[]
    for clip in timeline['clips']:
        for part in clip['subtitleParts']:
            start=clip['start']/timeline['fps']+part['start']
            end=clip['start']/timeline['fps']+part['end']
            rows.append(f"{len(rows)+1}\n{stamp(start)} --> {stamp(end)}\n{part['text']}\n")
    (delivery/'中文字幕.srt').write_text('\n'.join(rows),encoding='utf-8')
    (delivery/'旁白.txt').write_text('\n\n'.join(c['spoken'] for c in timeline['clips'])+'\n',encoding='utf-8')
    print(f'exported {len(rows)} subtitle clauses / {len(timeline["clips"])} narration paragraphs')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('stage',choices=['generate','assemble','audit','export'])
    parser.add_argument('--candidate',type=int,default=1)
    parser.add_argument('--ids',default='')
    args=parser.parse_args()
    if args.stage=='generate': generate(args.ids)
    elif args.stage=='assemble': assemble(args.candidate)
    elif args.stage=='audit': audit()
    else: export_text()
