"""Select the factually corrected closing without moving any visual frame."""
from pathlib import Path
import json, hashlib, shutil, datetime
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
ID = 's048'
CANDIDATE = ROOT / 'audio/candidates/v4-closing'

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def save(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def main():
    take = read(CANDIDATE / f'{ID}.json')
    asr = read(CANDIDATE / 'asr' / f'{ID}.json')
    boundary = read(ROOT / 'research/visual-v4/closing-boundary-review.json')
    assert asr['sourceSHA256'] == take['sha256'] and not asr['flags']
    assert boundary['allFinite'] and boundary['allSourceHashesMatch'] and boundary['allUnclipped']
    assert not boundary['boundaryMarginFlags'] and not boundary['rawEndpointFlags']
    assert boundary['minimumProcessedTailMarginSeconds'] >= .20
    assert sha(ROOT / take['processed']) == take['sha256']
    story = read(ROOT / 'docs/story.json')
    timeline = read(ROOT / 'public/timeline.json')
    prior = next(c for c in timeline['clips'] if c['id'] == ID)
    before_timing = [(c['id'], c['start'], c['end']) for c in timeline['clips']]
    slot_seconds = (prior['end'] - prior['start']) / timeline['fps']
    # The take already contains verified silence after the final syllable.  It
    # need not add an extra three silent frames outside that protected source.
    assert take['duration'] <= slot_seconds
    protected_tail = boundary['minimumProcessedTailMarginSeconds'] + slot_seconds - take['duration']
    assert protected_tail >= .20
    before = dict(prior)
    for row in story['shots']:
        if row['id'] == ID:
            row['text'] = row['caption'] = take['text']
            row['ttsText'] = take['ttsText']
    if 'V4片尾明确基础与梁柱承重、TMD减振，不把楼顶重物写成承重构件。' not in story['notes']:
        story['notes'].append('V4片尾明确基础与梁柱承重、TMD减振，不把楼顶重物写成承重构件。')
    save(ROOT / 'docs/story.json', story)
    selected = dict(take)
    selected.update(processed='public/voice/s048.wav',
                    candidateSource='audio/candidates/v4-closing/s048.wav',
                    revision='v4-factual-closing',
                    revisionReason='Separate the gravity load path from TMD vibration reduction; preserve every visual frame',
                    subjectiveListeningChecked=False)
    shutil.copy2(CANDIDATE / 's048.wav', ROOT / selected['processed'])
    save(ROOT / 'audio/takes/s048.json', selected)
    shutil.copy2(CANDIDATE / 'asr/s048.json', ROOT / 'audio/asr/s048.json')
    prior.update(text=take['text'], caption=take['text'], ttsText=take['ttsText'],
                 voiceDurationSeconds=take['duration'],
                 voiceEndSeconds=prior['startSeconds'] + take['duration'],
                 audioSHA256=take['sha256'], audio='voice/s048.wav')
    assert before_timing == [(c['id'], c['start'], c['end']) for c in timeline['clips']]
    for rel in ['public/timeline.json', 'src/timeline.json']:
        save(ROOT / rel, timeline)
    placements = read(ROOT / 'audio/placements.json')
    voice = np.zeros(timeline['duration'] * SR // timeline['fps'], dtype=np.float32)
    for clip in timeline['clips']:
        wav, rate = sf.read(ROOT / 'public' / clip['audio'], dtype='float32')
        assert rate == SR and wav.ndim == 1 and sha(ROOT / 'public' / clip['audio']) == clip['audioSHA256']
        start = round(clip['start'] * SR / timeline['fps'])
        end = start + len(wav)
        assert end <= round(clip['end'] * SR / timeline['fps'])
        voice[start:end] = wav
        place = next(p for p in placements['sentences'] if p['id'] == clip['id'])
        place.update(startSample=start, samples=len(wav), endSample=end, placementErrorSamples=0)
    sf.write(ROOT / 'public/narration.wav', voice, SR, subtype='PCM_24')
    placements.update(timelineSHA256=sha(ROOT / 'public/timeline.json'),
                      voiceSeconds=sum(c['voiceDurationSeconds'] for c in timeline['clips']),
                      silencePolicy='Fixed V3 visual slots; unmodified waveform durations; s048 uses verified 230ms source tail silence within its slot; 9s references tail')
    save(ROOT / 'audio/placements.json', placements)
    record = dict(createdAtUTC=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  id=ID, before=before, after=prior, preserveVisualFrames=True,
                  totalFrames=timeline['duration'], totalSamples=len(voice),
                  slotSeconds=slot_seconds, slotRemainingSeconds=slot_seconds-take['duration'],
                  measuredProtectedTailToReferencesSeconds=protected_tail,
                  sourceTrimmed=False, timeStretched=False,
                  asrRatio=asr['ratio'], asrFlags=asr['flags'],
                  subjectiveListeningChecked=False,
                  candidateSHA256=take['sha256'], narrationSHA256=sha(ROOT / 'public/narration.wav'))
    save(ROOT / 'research/visual-v4/closing-integration.json', record)
    print('V4_CLOSING_SELECTED', take['duration'], 'seconds; unchanged frames', timeline['duration'], 'protected tail', protected_tail)

if __name__ == '__main__':
    main()
