"""Fingerprint finalized V5 render dependencies and verified audio provenance.

Run after final audio activation and QA. Importing this module never hashes
or modifies audio. Parent dependency files are relative to this v3 project.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import re

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def source_dependencies(entry):
    """Follow actual relative imports, including TimelineV5's narration.json."""
    pending, visited = [Path(entry).resolve()], set()
    while pending:
        path = pending.pop()
        if path in visited:
            continue
        if not path.is_file():
            raise FileNotFoundError(path)
        visited.add(path)
        if path.suffix not in ('.ts', '.tsx', '.js', '.mjs'):
            continue
        text = path.read_text(encoding='utf-8-sig')
        imports = re.findall(r'''(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*)['"](\.[^'"]+)['"]''', text)
        for name in imports:
            target = path.parent / name
            candidates = [target] if target.suffix else [Path(str(target) + ext) for ext in ('.ts', '.tsx', '.js', '.json')] + [target / 'index.ts', target / 'index.tsx']
            resolved = next((candidate.resolve() for candidate in candidates if candidate.is_file()), None)
            if resolved is None:
                raise FileNotFoundError(f'Unresolved source import {name!r} from {path}')
            pending.append(resolved)
    return sorted(visited)


def provenance_entries(report):
    """Accept real V5 source inputs and optional declared output files."""
    entries = []
    for field in ('inputs', 'files'):
        value = report.get(field, [])
        if not isinstance(value, list):
            raise ValueError(f'Expected {field} to be a list')
        for row in value:
            if not isinstance(row, dict) or not row.get('path') or not row.get('sha256'):
                raise ValueError(f'Malformed provenance record in {field}')
            entries.append(row)
    if not entries:
        raise ValueError('Report has neither hashed inputs nor hashed files')
    return entries


def main():
    work = ROOT / 'work/audio-v5'
    narr = read(ROOT / 'src/narration-v5.json')
    assert narr['version'] == 5 and narr.get('timeStretch') is False
    assert narr.get('truncation') is not True
    assert narr == read(work / 'narration.json'), 'Activate finalized narration first'
    assert read(ROOT / 'src/captions-v5.json') == read(work / 'captions.json'), 'Activate finalized captions first'
    assert narr['sourceStorySha256'] == sha(ROOT / 'src/story-v5.json'), 'Narration story fingerprint is stale'
    ledger = read(work / 'voice-generation-v5.json')
    files, by_path = [], {}

    def add(path, role, expected=None):
        path = Path(path).resolve()
        if not path.is_file():
            raise FileNotFoundError(path)
        relative = Path(os.path.relpath(path, ROOT)).as_posix()
        actual = sha(path)
        if expected is not None and actual != expected:
            raise ValueError(f'Provenance hash mismatch: {relative}')
        if relative in by_path:
            assert by_path[relative]['sha256'] == actual, f'File changed during manifest generation: {relative}'
            if role not in by_path[relative]['roles']:
                by_path[relative]['roles'].append(role)
            return
        row = {'path': relative, 'bytes': path.stat().st_size, 'sha256': actual, 'role': role, 'roles': [role]}
        files.append(row)
        by_path[relative] = row

    for path in source_dependencies(ROOT / 'src/indexV5.tsx'):
        add(path, 'render-source')
    add(ROOT / 'src/story-v5.json', 'spoken-and-display-source')
    for path in [ROOT / 'package.json', ROOT / 'tsconfig.json', ROOT.parent / 'package.json', ROOT.parent / 'package-lock.json']:
        add(path, 'dependency-configuration')
    for name in ['render_v5.mjs', 'voice_v5.py', 'prepare_voice_v5.py', 'asr_captions_v5.py', 'mix_v5.py',
                 'audio_v5_common.py', 'recover_memory_v5.py', 'activate_audio_v5.py', 'prepare_voice_v3.py',
                 'score_v4.py', 'acoustic_bank.py', 'qa_audio_v5.py', 'qa_delivery_v5.py', 'build_v5_manifest.py']:
        add(ROOT / 'scripts' / name, 'reproduction-script')
    for path in sorted((ROOT / 'scripts/audio_vendor').rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc':
            add(path, 'asr-vendored-dependency')
    for name in ['brand/logo.png', 'bridges/memory-film-atlas.jpg', '3d/glass_vial.glb', '3d/synthesis_nozzle.glb',
                 '3d/sequencing_flowcell.glb', '3d/lux_vial_holder.glb', 'formulas/gc.svg', 'formulas/xor.svg',
                 'formulas/consensus.svg', 'papers/dna-fountain-preprint-01.png', 'papers/nucleotide-transformer-2024-01.png',
                 'audio/v5/master.wav', 'audio/v5/narration.wav', 'audio/v5/subtitles.srt']:
        add(ROOT / 'public' / name, 'render-asset')

    asr = read(work / 'asr-captions.json')
    asr_rows = {row['id']: row for row in asr['cues']}
    assert set(asr_rows) == {cue['id'] for cue in narr['cues']}, 'ASR report is incomplete'
    for cue in narr['cues']:
        cue_id = cue['id']
        raw, clean = work / 'raw' / f'{cue_id}.wav', work / 'clean' / f'{cue_id}.wav'
        entry = ledger[cue_id]
        assert entry['actualProvider'] == 'local-user-tts-project'
        assert entry['text'] == cue.get('spokenText', cue['text']), f'Voice text changed: {cue_id}'
        add(raw, 'original-voice-clip', entry['sha256'])
        add(clean, 'working-personal-voice-clip', asr_rows[cue_id]['sha256'])
        add(ROOT / 'public' / cue['audioFile'], 'active-personal-voice-clip', sha(clean))
        processing_path = work / 'processing' / f'{cue_id}.json'
        processing = read(processing_path)
        add(processing_path, 'voice-processing-provenance')
        assert processing['originalRawSha256'] == sha(raw)
        assert processing['outputSha256'] == sha(clean)
        assert processing['profile']['timeStretch'] is False and processing['preservedLengthSamples'] is True

    for name in ['voice-generation-v5.json', 'audio-mix-v5.json', 'music-arrangement.json', 'asr-captions.json',
                 'qa-audio-v5.json', 'voice-timing.json', 'narration.json', 'captions.json', 'subtitles.srt']:
        add(work / name, 'audio-provenance')
    mix = read(work / 'audio-mix-v5.json')
    audio_qa = read(work / 'qa-audio-v5.json')  # Actual output of scripts/qa_audio_v5.py.
    assert audio_qa['status'].lower() == 'pass' and not audio_qa.get('errors'), 'Audio QA must pass first'
    assert abs(float(audio_qa['durationSec']) - narr['durationSec']) < 1 / 48000
    assert mix['sampleRate'] == 48000 and mix['channels'] == 2
    assert mix.get('timeStretch') is False and mix.get('truncation') is False
    for report, role in [(mix, 'mix-verified-asset'), (audio_qa, 'qa-verified-asset')]:
        for entry in provenance_entries(report):
            add(ROOT / entry['path'], role, entry['sha256'])
    for name in ['master.wav', 'narration.wav', 'subtitles.srt']:
        add(ROOT / 'public/audio/v5' / name, 'activated-audio', sha(work / name))

    arrangement = read(work / 'music-arrangement.json')
    assert arrangement['timelineSha256'] == sha(work / 'narration.json'), 'Re-score against final timing'
    for entry in provenance_entries(arrangement):
        add(ROOT / entry['path'], 'score-verified-asset', entry['sha256'])
    for field in ('sourceComposition', 'originalThemeRecording'):
        entry = arrangement[field]
        add(ROOT / entry['path'], 'same-film-music-provenance', entry['sha256'])
    sample_manifest = ROOT / arrangement['sampleManifest']
    add(sample_manifest, 'music-sample-provenance')
    samples = read(sample_manifest)
    assert samples['license'] == arrangement['sourceSampleLicense'] == 'CC0-1.0'
    add(sample_manifest.parent / samples['licenseFile'], 'music-sample-license')
    sample_source_records = []
    sample_entries = {entry['path']: entry for entry in samples['files']}
    for entry in samples['files']:
        local = sample_manifest.parent / entry['path']
        # The download manifest also contains upstream documentation that was
        # never copied locally (e.g. Upright Nr1/Notes.txt). Keep that source
        # identity as metadata; never invent a local file or local hash.
        record = {'repositoryPath': entry['path'], 'sourceUrl': entry.get('url'),
                  'sourceSha256': entry['sha256'], 'locallyPresent': local.is_file()}
        if local.is_file():
            add(local, 'music-sample-source', entry['sha256'])
            record['localPath'] = local.relative_to(ROOT).as_posix()
        sample_source_records.append(record)
    # The production sampler enumerates local WAVs, not repository metadata.
    # Every candidate that can influence a seeded take must have verified
    # provenance, even when that candidate is not selected in this arrangement.
    from acoustic_bank import AcousticBank
    bank = AcousticBank()
    bank_sources = sorted({path.resolve() for rows in bank.files.values() for _, path in rows})
    for local in bank_sources:
        relative = local.relative_to(sample_manifest.parent.resolve()).as_posix()
        entry = sample_entries.get(relative)
        assert entry is not None, f'Local production sample lacks source provenance: {relative}'
        add(local, 'production-sampler-source', entry['sha256'])

    for name in ['memory-recovery-v5.json', 'memory-recovery-v5-independent-qa.json', 'story-v5-research.md']:
        add(ROOT / 'research' / name, 'evidence')
    for name in ['public/bridges/family-memory.png', 'work/memory-v5/original.mp4', 'work/memory-v5/recovered.mp4',
                 'public/papers/dna-fountain-2017-preprint.pdf']:
        add(ROOT / name, 'recovery-and-research-source')
    report = {
        'schema': 'rainbow.dna.source-manifest/v5', 'version': 5,
        'createdAt': datetime.now(timezone.utc).isoformat(), 'status': 'pass',
        'durationSec': narr['durationSec'], 'durationFrames': round(narr['durationSec'] * 30), 'files': files,
        'voice': 'local user reference, Qwen3-TTS-0.6B', 'animation': 'frame-driven deterministic illustration',
        'dependencyInstallation': 'Node dependencies are supplied by ../package.json and ../package-lock.json; install in the parent project.',
        'externalVoiceRuntime': 'D:/python_project/tts; model/reference fingerprints are in the voice ledger; mastering fingerprints are in processing reports.',
        'musicSampleProvenance': {'repository': samples['repository'], 'commit': samples['commit'],
                                  'license': samples['license'], 'productionSamplerFileCount': len(bank_sources),
                                  'sources': sample_source_records},
        'evidenceBoundary': 'Computer teaching recovery uses a fixed XOR chain and a small alignment example; not a complete DNA Fountain wet-lab reproduction.',
        'subjectiveListeningChecked': False,
    }
    target = ROOT / 'research/v5-source-manifest.json'
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'files': len(files), 'durationSec': narr['durationSec']}))


if __name__ == '__main__':
    main()
