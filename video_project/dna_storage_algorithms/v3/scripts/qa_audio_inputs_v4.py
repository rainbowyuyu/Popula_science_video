"""Independent CPU audit of completed V4 speech, generation ledger and ASR flags.

Run qa_delivery_v4.py first with --output work/audio-v4/independent-preactivation-audio-qa.json.
The deliberately unperformed video-present check is excluded here; all selected
audio assets are rehashed before accepting its source-only results.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import numpy as np
import soundfile as sf
from build_v4_manifest import sha, read

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'work/audio-v4'


def main():
    checks = []
    def check(key, passed, detail=None):
        checks.append({'id': key, 'pass': bool(passed), 'detail': detail})
    narration = read(OUT/'narration.json')
    ledger = read(OUT/'voice-generation-v4.json')
    audit = read(OUT/'raw-asr-audit.json')
    qa = read(OUT/'independent-preactivation-audio-qa.json')
    mix = read(OUT/'audio-mix-v4.json')
    overrides = read(OUT/'speech-overrides.json')
    audio_checks = [c for c in qa['checks'] if c['id'] != 'video-present']
    check('audio-caption-checks-pass', all(c['pass'] for c in audio_checks),
          {'checked': len(audio_checks), 'failed': [c['id'] for c in audio_checks if not c['pass']]})
    check('37-local-cues', len(narration['cues']) == 37 and len(ledger) == 37)
    check('audit-snapshot-current', all(Path(p).is_file() and sha(Path(p)) == row['sha256'] for p, row in qa['assets'].items()))
    reference = sha(Path('D:/python_project/tts/work/clone-reference.wav'))
    asr = {c['id']: c for c in audit['cues']}
    silences, long_quiet = [], []
    for cue in narration['cues']:
        cue_id = cue['id']
        row = ledger[cue_id]
        raw_path = ROOT / row['file']
        clip, sr = sf.read(raw_path, dtype='float32', always_2d=True)
        raw_hash = sha(raw_path)
        spec = {key: row[key] for key in ['text', 'referenceSha256', 'model', 'modelPath', 'seed', 'parameters']}
        request_hash = hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        check(cue_id+'-generation-integrity', row['actualProvider'] == 'local-user-tts-project' and
              row['text'] == cue['spokenText'] and row['displayText'] == cue['text'] and row['sha256'] == raw_hash and
              request_hash == row['requestHash'] and row['referenceSha256'] == reference)
        check(cue_id+'-asr-current-raw', asr[cue_id]['rawSha256'] == raw_hash)
        block = round(sr*.01)
        mono = clip.mean(axis=1)
        starts = np.arange(0, len(mono), block)
        lengths = np.minimum(block, len(mono)-starts)
        energy = np.sqrt(np.add.reduceat(mono.astype(float)**2, starts)/lengths)
        active = energy > 10**(-50/20)
        check(cue_id+'-nonempty-speech', active.any())
        if not active.any():
            continue
        first, last = np.flatnonzero(active)[[0, -1]]
        edges = np.diff(np.r_[False, ~active[first:last+1], False].astype(int))
        runs = zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1))
        segments = [{'startSec': (lo+first)*block/sr, 'durationSec': float(sum(lengths[first+lo:first+hi])/sr)} for lo, hi in runs]
        leading, trailing = first*block/sr, (len(mono)-min(len(mono), (last+1)*block))/sr
        silence = {'id': cue_id, 'rawDurationSec': len(mono)/sr, 'leadingQuietSec': float(leading),
                   'trailingQuietSec': float(trailing), 'maximumInternalQuietSec': max((s['durationSec'] for s in segments), default=0),
                   'internalQuietAtLeast1Sec': [s for s in segments if s['durationSec'] >= 1]}
        silences.append(silence)
        if silence['internalQuietAtLeast1Sec'] or leading >= 1 or trailing >= 1:
            long_quiet.append(silence)
    check('no-internal-raw-silence-over-1s', not any(s['internalQuietAtLeast1Sec'] for s in silences), long_quiet)
    cue04 = next(c for c in narration['cues'] if c['id'] == 'n04')
    check('n04-override-consistent', overrides['n04'] == cue04['spokenText'] == ledger['n04']['text'])
    check('n04-asr-four-binary-combinations', re.search('00.*01.*10.*11', asr['n04']['asr']) is not None, asr['n04']['asr'])
    for index, row in enumerate(mix['inputs'] + mix['files']):
        path = ROOT / row['path']
        check('mix-path-hash-'+str(index), path.is_file() and sha(path) == row['sha256'], row['path'])
    result = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(OUT/'master.wav'), '-af',
                             'silencedetect=noise=-50dB:d=1', '-f', 'null', '-'], capture_output=True,
                            text=True, encoding='utf8', errors='replace', check=True)
    master_silence = [line.strip() for line in result.stderr.splitlines() if 'silence_start:' in line or 'silence_end:' in line]
    check('master-no-long-silence', not master_silence, master_silence)
    max_gap = max((narration['cues'][i+1]['startSec']-c['endSec'], c['id'], narration['cues'][i+1]['id']) for i, c in enumerate(narration['cues'][:-1]))
    interpretation = {
        'n04': {'target': asr['n04']['target'], 'spokenText': cue04['spokenText'], 'asr': asr['n04']['asr'],
                'interpretation': 'The rerecording adds a connective before the fourth pair. Ledger, override and spokenText match exactly; ASR preserves 00/01/10/11 in order. Display captions intentionally retain the original concise list. No omitted combination is indicated.'},
        'n14': {'target': asr['n14']['target'], 'asr': asr['n14']['asr'], 'similarity': asr['n14']['similarity'],
                'interpretation': 'ASR uses near-homophones 架/夹 for 甲, 椅 for 乙, 柄 for 丙, 力 for 里. All equation participants and both recovery steps remain represented. This alone does not establish a dropped word or wrong pronunciation; subjective listening is not claimed.'},
        'terminologySpotChecks': [{key: asr[cue_id][key] for key in ('id', 'target', 'asr', 'similarity')} for cue_id in ('n05', 'n08', 'n13', 'n28', 'n31', 'n32')],
        'limits': 'ASR similarity is spelling-sensitive and cannot validate Mandarin tones. Term confusions such as 碱基/剪辑 and 异或/一或 warrant spot listening, not an automatic claim that audio is wrong. No human listening was performed.'}
    failed = [c['id'] for c in checks if not c['pass']]
    report = {'schema': 'rainbow.dna.independent-audio-inputs/v4', 'checkedAt': datetime.now(timezone.utc).isoformat(),
              'status': 'source-checks-pass-asr-review-retained' if not failed else 'failed', 'activatedDeliveryChecked': False,
              'finalVideoChecked': False, 'subjectiveListeningChecked': False, 'checks': checks, 'failedCheckIds': failed,
              'audioAndCaptionReport': {'path': str(OUT/'independent-preactivation-audio-qa.json'),
                                       'sha256': sha(OUT/'independent-preactivation-audio-qa.json'),
                                       'expectedUnperformedCheck': 'video-present', 'coverage': qa['coverage']},
              'narration': qa['narration_wav'], 'master': qa['master'],
              'rawSilentIntervals': {'method': '10ms RMS below -50dBFS; internal means between first/last active raw bins',
                                     'clips': silences, 'longQuietClips': long_quiet},
              'scheduledGaps': {'maximumBetweenCuesSec': max_gap[0], 'between': list(max_gap[1:]),
                                'lastCueEndSec': narration['cues'][-1]['endSec'],
                                'endCodaWithoutNarrationSec': narration['durationSec']-narration['cues'][-1]['endSec']},
              'masterSilencedetect': master_silence, 'asr': {'reviewFlags': audit['reviewFlags'], 'interpretation': interpretation},
              'mixMetadata': {key: mix[key] for key in ('wav', 'aac', 'voiceMusicDifferenceDb')}}
    (OUT/'independent-audio-inputs-v4.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'status': report['status'], 'checks': len(checks), 'failed': failed,
                      'maxInternalQuietSec': max(s['maximumInternalQuietSec'] for s in silences), 'longQuietClips': long_quiet,
                      'maximumScheduledGap': max_gap, 'codaSec': report['scheduledGaps']['endCodaWithoutNarrationSec'],
                      'asrFlags': audit['reviewFlags']}, indent=2))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
