"""Generate rainbow narration into V5-only directories from an explicitly locked story.

No import side effects, no global story copy, no V4/public writes, no time stretch.
"""
import argparse
from datetime import datetime, timezone
import gc
import hashlib
import importlib.util
import importlib.metadata
import json
import os
from pathlib import Path
import re
import shutil
import time

import numpy as np
import soundfile as sf

from audio_v5_common import AUDIO, DEFAULT_STORY, RESEARCH, ROOT, TTS, read, save, sha, spoken, validate_story, within

SETTINGS = dict(temperature=.30, top_p=.82, repetition_penalty=1.05,
                non_streaming_mode=True, max_new_tokens=2048)


def probe():
    import torch
    paths = {'model': TTS / 'models/Qwen3-TTS-0.6B',
             'reference': TTS / 'work/clone-reference.wav',
             'referenceText': TTS / 'work/clone-reference.json',
             'processor': TTS / 'broadcast_voice.py',
             'whisper': TTS / 'models/whisper-small'}
    return dict(checkedAtUTC=datetime.now(timezone.utc).isoformat(),
                python=os.sys.executable, torch=torch.__version__,
                cudaAvailable=torch.cuda.is_available(),
                gpu=torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
                packages={name: importlib.util.find_spec(name) is not None
                          for name in ['qwen_tts', 'faster_whisper', 'soundfile', 'scipy']},
                paths={key: dict(path=str(path), exists=path.exists()) for key, path in paths.items()},
                ffmpeg=shutil.which('ffmpeg'), modelLoaded=False, voiceSynthesized=False,
                subjectiveListeningChecked=False)


def model_identity():
    model = TTS / 'models/Qwen3-TTS-0.6B'
    files = [path for path in model.rglob('*') if path.is_file()
             and path.suffix in {'.json', '.safetensors', '.bin', '.txt'}]
    manifest = {path.relative_to(model).as_posix(): sha(path) for path in sorted(files)}
    versions = {}
    for package in ['qwen-tts', 'torch', 'transformers', 'soundfile']:
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            versions[package] = 'unknown'
    digest = hashlib.sha256(json.dumps([manifest, versions],sort_keys=True).encode()).hexdigest()
    return dict(sha256=digest, files=manifest, packageVersions=versions)


def signature(row, attempt, reference_sha, reference_text_sha, processor_sha, model_sha):
    payload = dict(text=spoken(row), settings=SETTINGS, attempt=attempt,
                   model='Qwen3-TTS-0.6B', referenceSHA256=reference_sha,
                   referenceTextSHA256=reference_text_sha,
                   processorSHA256=processor_sha, modelIdentitySHA256=model_sha)
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def matching(take, row, reference_sha, reference_text_sha, processor_sha, model_sha):
    path = ROOT / take.get('processed', '')
    return (take.get('ttsText') == spoken(row) and take.get('settings') == SETTINGS
            and take.get('referenceSHA256') == reference_sha
            and take.get('referenceTextSHA256') == reference_text_sha
            and take.get('modelIdentitySHA256') == model_sha
            and take.get('processorSHA256') == processor_sha
            and path.is_file() and path.resolve().is_relative_to(AUDIO.resolve())
            and sha(path) == take.get('sha256'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--story', type=Path, default=DEFAULT_STORY)
    ap.add_argument('--expected-story-sha')
    ap.add_argument('--only', default='')
    ap.add_argument('--attempt', type=int, default=1)
    ap.add_argument('--batch-size', type=int, default=3)
    ap.add_argument('--candidate', default='')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--probe', action='store_true')
    ap.add_argument('--replay-take', type=Path, help='Replay its full recorded batch into --candidate')
    a = ap.parse_args()
    if a.probe:
        result = probe()
        save(RESEARCH / 'tts-environment.json', result)
        print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
        return
    if not a.dry_run and not a.expected_story_sha:
        ap.error('Generation requires --expected-story-sha from the frozen V5 script')
    if a.batch_size < 1 or a.attempt < 1:
        ap.error('batch-size and attempt must be positive')
    if a.candidate and not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}', a.candidate):
        ap.error('candidate must be a simple directory name')
    story, story_sha = validate_story(a.story, a.expected_story_sha)
    replay = None
    if a.replay_take:
        if not a.candidate:
            ap.error('--replay-take requires --candidate to preserve the selected recordings')
        replay = read(within(a.replay_take, AUDIO))
        if replay['storySHA256'] != story_sha:
            ap.error('Replay requires the same locked story')
        a.only = ','.join(replay['batchIds'])
        a.batch_size = len(replay['batchIds'])
        a.attempt = replay['attempt']
        a.force = True
    rows = story['shots']
    if a.only:
        selected = set(a.only.split(','))
        unknown = selected - {row['id'] for row in rows}
        if unknown:
            ap.error(f'Unknown shot ids: {sorted(unknown)}')
        rows = [row for row in rows if row['id'] in selected]
    reference_sha = sha(TTS / 'work/clone-reference.wav')
    reference_text_sha = sha(TTS / 'work/clone-reference.json')
    processor_sha = sha(TTS / 'broadcast_voice.py')
    identity = model_identity()
    model_sha = identity['sha256']
    base = AUDIO / 'candidates' / a.candidate if a.candidate else AUDIO
    take_dir, voice_dir = base / 'takes', base / 'voice'
    pending = []
    for row in rows:
        sig = signature(row, a.attempt, reference_sha, reference_text_sha, processor_sha, model_sha)
        path = take_dir / f"{row['id']}.json"
        if path.exists() and not a.force:
            previous = read(path)
            if matching(previous, row, reference_sha, reference_text_sha, processor_sha, model_sha) and (
                previous.get('signature') == sig or (previous.get('selectedCandidate') and not a.candidate)
            ):
                continue
        pending.append((row, sig))
    warnings = [{'id': row['id'], 'characters': len(spoken(row)), 'note': 'Consider splitting at a natural sentence boundary'}
                for row in rows if len(spoken(row)) > 85]
    plan = dict(story=str(a.story.resolve()), storySHA256=story_sha, selectedCount=len(rows),
                pendingCount=len(pending), cachedCount=len(rows)-len(pending),
                output=str(base), batchSize=a.batch_size, warnings=warnings,
                dryRun=a.dry_run, settings=SETTINGS)
    print(json.dumps(plan, ensure_ascii=False), flush=True)
    if a.dry_run or not pending:
        return
    save(RESEARCH / ('candidate-plan.json' if a.candidate else 'voice-plan.json'), plan)
    save(RESEARCH / 'tts-model-identity.json', identity)
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'
    import torch
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    model = Qwen3TTSModel.from_pretrained(str(TTS / 'models/Qwen3-TTS-0.6B'),
                device_map='cuda:0', dtype=torch.bfloat16, attn_implementation='sdpa')
    prompt = model.create_voice_clone_prompt(ref_audio=str(TTS / 'work/clone-reference.wav'),
                    ref_text=read(TTS / 'work/clone-reference.json')['text'])
    spec = importlib.util.spec_from_file_location('rainbow_broadcast_voice_v5', TTS / 'broadcast_voice.py')
    cleaner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cleaner)
    started = time.monotonic()
    completed, generated_seconds = 0, 0.
    cached_count, batch_size = len(rows)-len(pending), a.batch_size
    while pending:
        if sha(a.story) != story_sha:
            raise RuntimeError('Frozen story changed during generation; stopping before next batch')
        batch = pending[:batch_size]
        batch_ids = [row['id'] for row, sig in batch]
        batch_key = hashlib.sha256('|'.join(sig for row, sig in batch).encode()).hexdigest()
        if replay and batch_key != replay['batchKey']:
            raise ValueError('Replay identity differs: check reference, model, processing and runtime versions')
        seed = int(batch_key[:8], 16)
        torch.manual_seed(seed)
        np.random.seed(seed)
        try:
            waves, rate = model.generate_voice_clone(text=[spoken(row) for row, sig in batch],
                    language=['Chinese']*len(batch), voice_clone_prompt=prompt, **SETTINGS)
        except RuntimeError as exc:
            if 'out of memory' not in str(exc).lower() or batch_size == 1:
                raise
            batch_size = max(1, batch_size//2)
            gc.collect()
            torch.cuda.empty_cache()
            continue
        for (row, sig), wave in zip(batch, waves):
            raw = within(AUDIO / 'raw' / f"{row['id']}-{sig[:12]}-{batch_key[:10]}.wav", AUDIO)
            destination = within(voice_dir / f"{row['id']}.wav", AUDIO)
            takepath = within(take_dir / f"{row['id']}.json", AUDIO)
            raw.parent.mkdir(parents=True, exist_ok=True)
            destination.parent.mkdir(parents=True, exist_ok=True)
            # Never overwrite an existing generated raw wave, even on --force.
            if raw.exists():
                suffix = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')
                raw = raw.with_stem(raw.stem + '-' + suffix)
            if takepath.exists():
                previous = read(takepath)
                archive = AUDIO / 'selected-prior' / row['id'] / (previous['sha256'][:16] + '-' + str(time.time_ns()))
                archive.mkdir(parents=True)
                shutil.copy2(takepath, archive / 'take.json')
                old_wave = within(ROOT / previous['processed'], AUDIO)
                if old_wave.exists():
                    shutil.copy2(old_wave, archive / 'voice.wav')
            wave = np.asarray(wave, dtype=np.float64)
            if not len(wave) or not np.isfinite(wave).all():
                raise ValueError(f"Invalid generated waveform: {row['id']}")
            sf.write(raw, wave, rate, subtype='PCM_24')
            processing = cleaner.master_voice(raw, destination)
            info = sf.info(destination)
            if abs(info.duration-len(wave)/rate) > 1/info.samplerate:
                raise ValueError(f"Processing altered source length: {row['id']}")
            endpoint = float(20*np.log10(max(float(np.sqrt(np.mean(wave[-round(rate*.02):]**2))), 1e-10)))
            take = dict(id=row['id'], text=row['text'], ttsText=spoken(row), signature=sig,
                storySHA256=story_sha, raw=raw.relative_to(ROOT).as_posix(),
                processed=destination.relative_to(ROOT).as_posix(), rawDuration=len(wave)/rate,
                duration=info.duration, sampleRate=info.samplerate, sha256=sha(destination),
                rawSHA256=sha(raw), seed=seed, batchIds=batch_ids, batchKey=batch_key,
                attempt=a.attempt, settings=SETTINGS, referenceSHA256=reference_sha,
                referenceTextSHA256=reference_text_sha, modelIdentitySHA256=model_sha,
                packageVersions=identity['packageVersions'],
                processorSHA256=processor_sha, model='Qwen3-TTS-0.6B',
                rawEndpointDB=endpoint, rawEndpointFlag=endpoint > -42,
                rawClippedSamples=int(np.count_nonzero(np.abs(wave) >= .999)),
                processing=processing, voiceSpeedFactor=1, subjectiveListeningChecked=False)
            save(takepath, take)
            generated_seconds += info.duration
            completed += 1
            print(f"READY {row['id']} {info.duration:.3f}s", flush=True)
        pending = pending[len(batch):]
        gc.collect()
        torch.cuda.empty_cache()
        save(base / 'voice-progress.json', dict(storySHA256=story_sha,
            ready=completed+cached_count, pending=len(pending), generatedCount=completed,
            cachedCount=cached_count, generatedSeconds=generated_seconds,
            elapsedSeconds=time.monotonic()-started, subjectiveListeningChecked=False))
    print('V5_VOICE_COMPLETE', round(time.monotonic()-started, 2), flush=True)


if __name__ == '__main__':
    main()
