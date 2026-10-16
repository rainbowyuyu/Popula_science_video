"""Validate and package isolated V5 audio; never install into the live project."""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path

import numpy as np
import soundfile as sf

from audio_v5_common import AUDIO, DEFAULT_STORY, FPS, RESEARCH, ROOT, SR, SAMPLES_PER_FRAME, read, save, sha, spoken, validate_story, within
from mix_v5 import TIMING_KEYS
from qc_v5 import caption_parts, srt_time


def stats(path):
    peak, clipped, count = 0., 0, 0
    with sf.SoundFile(path) as reader:
        while True:
            data = reader.read(SR*20, dtype='float32', always_2d=True)
            if not len(data):
                break
            if not np.isfinite(data).all():
                raise ValueError('Nonfinite waveform: ' + str(path))
            peak = max(peak, float(np.abs(data).max(initial=0)))
            clipped += int(np.count_nonzero(np.abs(data) >= .99999))
            count += len(data)
    return dict(samples=count, peakDBFS=20*math.log10(max(peak, 1e-12)), clippedSamples=clipped)


def text_file(path, content):
    path = within(path, AUDIO)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8-sig')


def evidence_matches_source(path, source_sha, sid):
    """A review must cite an existing record bound to the selected waveform."""
    if not path.is_file():
        return False
    if sha(path) == source_sha:
        return True
    if path.suffix.lower() == '.json':
        data = read(path)

        def contains(value):
            if isinstance(value, dict):
                if value.get('id', sid) == sid and any(value.get(key) == source_sha for key in
                        ['sourceSHA256', 'selectedSourceSHA256', 'audioSHA256', 'sha256']):
                    return True
                return any(contains(child) for child in value.values())
            if isinstance(value, list):
                return any(contains(child) for child in value)
            return False

        return contains(data)
    if path.suffix.lower() in {'.md', '.txt'}:
        return source_sha in path.read_text(encoding='utf-8-sig')
    return False


def validate(story_path, expected_sha):
    story, story_sha = validate_story(story_path, expected_sha)
    timeline_path = AUDIO/'timeline.json'
    tl = read(timeline_path)
    report = read(RESEARCH/'audio-report.json')
    placements = read(AUDIO/'placements.json')
    caption_report = read(RESEARCH/'caption-report.json')
    errors, warnings = [], []
    timeline_sha = sha(timeline_path)
    def require(condition, message):
        if not condition:
            errors.append(message)
    require(tl['storySHA256'] == story_sha, 'Timeline story hash differs')
    require(tl['fps'] == FPS and tl['voiceSpeedFactor'] == 1, 'Unexpected FPS or voice speed')
    require(report['storySHA256'] == story_sha, 'Audio report story hash differs')
    for name, record in [('audio report', report), ('placements', placements), ('caption report', caption_report)]:
        require(record.get('timelineSHA256') == timeline_sha, f'Stale {name} timeline hash')
    require(report.get('subjectiveListeningChecked') is False, 'Invalid subjective listening claim')
    require(report.get('mixScriptSHA256') == sha(ROOT/'scripts/mix_v5.py'), 'Mix script changed after report')
    require({'narration.wav', 'music.wav', 'master.wav', 'timeline.json', 'master-aac-check.m4a'}.issubset(report['hashes']),
            'Mix report must bind stems, master, timeline and the measured AAC file')
    for name, digest in report['hashes'].items():
        artifact = within(AUDIO/name, AUDIO)
        require(artifact.is_file() and sha(artifact) == digest, 'Missing or stale mix hash: ' + name)
    n = tl['durationFrames'] * SAMPLES_PER_FRAME
    require(tl['duration'] == tl['durationFrames'] and tl['durationSeconds'] == n/SR, 'Timeline duration inconsistent')
    require(placements['totalSamples'] == n, 'Placement total sample count differs')
    overrides_path = RESEARCH/'rhythm-overrides.json'
    overrides = read(overrides_path) if overrides_path.exists() else {'additionalPauseAfterSeconds': {}}
    extra_pauses = overrides['additionalPauseAfterSeconds']
    if overrides_path.exists():
        require(overrides.get('storySHA256') == story_sha and tl.get('rhythmOverrides',{}).get('sha256') == sha(overrides_path),
                'Observation pause provenance changed')
    require(len(story['shots']) == len(tl['clips']) == len(placements['sentences']), 'Shot count differs')
    for key, value in story.items():
        if key != 'shots' and key not in {'fps','duration','durationFrames','durationSeconds','clips','captions','sections','draft','voiceSpeedFactor','storySHA256','storySource','outro'}:
            require(tl.get(key) == value, 'Story metadata changed: ' + key)
    sample_stats = {}
    for name, channels in [('narration.wav',1), ('music.wav',2), ('master.wav',2), ('music/original-score.wav',2)]:
        info = sf.info(AUDIO/name)
        require(info.frames == n and info.samplerate == SR and info.channels == channels, 'Wrong format/length: ' + name)
        sample_stats[name] = stats(AUDIO/name)
        require(sample_stats[name]['clippedSamples'] == 0, 'Clipped waveform: ' + name)
    narration = sf.SoundFile(AUDIO/'narration.wav')
    cursor = 0
    selected_takes = []
    takes_by_id = {}
    try:
        for row, clip, place in zip(story['shots'], tl['clips'], placements['sentences']):
            sid = row['id']
            require(clip['id'] == sid == place['id'], 'Shot ordering differs: ' + sid)
            for key, value in row.items():
                require(clip.get(key) == value, f'Shot semantics changed: {sid}.{key}')
            take_path = AUDIO/'takes'/f'{sid}.json'
            take = read(take_path)
            takes_by_id[sid] = take
            path, raw = within(ROOT/take['processed'], AUDIO), within(ROOT/take['raw'], AUDIO)
            canonical = within(AUDIO/'voice'/f'{sid}.wav', AUDIO)
            require(take.get('id') == sid, 'Take ID differs: ' + sid)
            require(within(ROOT/clip['audioSource'], AUDIO) == path, 'Clip source path differs from selected take: ' + sid)
            require(clip['audio'] == f'voice/{sid}.wav', 'Unexpected public voice destination: ' + sid)
            require(canonical.is_file() and sha(canonical) == take['sha256'], 'Canonical publish voice differs from selected take: ' + sid)
            require(take['ttsText'] == spoken(row) and take['text'] == row['text'], 'Stale narration text: ' + sid)
            require(take['storySHA256'] == story_sha, 'Stale narration story SHA: ' + sid)
            require(take['sha256'] == sha(path) == clip['audioSHA256'] == place['sourceSHA256'], 'Stale narration SHA: ' + sid)
            require(take['rawSHA256'] == sha(raw), 'Raw source changed: ' + sid)
            require(sha(take_path) == clip['takeSHA256'], 'Take record changed: ' + sid)
            info, raw_info = sf.info(path), sf.info(raw)
            additional = extra_pauses.get(sid, 0.)
            effective_pause = row.get('pauseAfterSeconds', .20) + additional
            require(clip.get('additionalPauseAfterSeconds') == additional and clip.get('effectivePauseAfterSeconds') == effective_pause,
                    'Observation pause differs from approved override: ' + sid)
            require(clip['duration'] == math.ceil(info.frames/SAMPLES_PER_FRAME)+round(effective_pause*FPS),
                    'Clip duration differs from complete take and approved pause: ' + sid)
            require(abs(info.duration-raw_info.duration) <= 1/SR, 'Voice duration changed: ' + sid)
            require(take.get('voiceSpeedFactor') == 1 and take.get('subjectiveListeningChecked') is False, 'Unsupported speed/listening claim: ' + sid)
            require(info.frames == place['samples'] and place['endSample']-place['startSample'] == info.frames, 'Take cut or padded: ' + sid)
            require(place['startSample'] == clip['start']*SAMPLES_PER_FRAME, 'Placement offset: ' + sid)
            require(clip['end']*SAMPLES_PER_FRAME >= place['endSample'], 'Take extends beyond clip: ' + sid)
            require(place['startSample'] >= cursor, 'Take overlap: ' + sid)
            gap = place['startSample']-cursor
            narration.seek(cursor)
            if gap:
                require(not np.any(narration.read(gap, dtype='float32')), 'Unexpected narration in pause: ' + sid)
            source, _ = sf.read(path, dtype='float32')
            current = narration.read(info.frames, dtype='float32')
            require(np.array_equal(source, current), 'Placed take differs from complete source: ' + sid)
            cursor = place['endSample']
            selected_takes.append(dict(id=sid, takeSHA256=sha(take_path), audioSHA256=take['sha256'], rawSHA256=take['rawSHA256']))
            if take.get('rawClippedSamples',0):
                errors.append('Raw synthesized clipping: ' + sid)
        narration.seek(cursor)
        require(not np.any(narration.read(dtype='float32')), 'Narration present in reference tail')
    finally:
        narration.close()
    outro = tl['outro']
    require(outro['end'] == tl['durationFrames'] and outro['duration'] == 12*FPS and outro['end']-outro['start'] == 12*FPS, 'Reference tail is not 12 seconds')
    captions = tl.get('captions', [])
    require(bool(captions), 'No aligned captions')
    prior_end = 0
    for caption in captions:
        require(0 <= caption['start'] < caption['end'] <= tl['durationFrames'], 'Invalid caption timing: ' + caption['id'])
        require(caption['start'] >= prior_end, 'Caption overlap: ' + caption['id'])
        prior_end = caption['end']
    for clip in tl['clips']:
        parts = [c for c in captions if c['clipId'] == clip['id']]
        require(''.join(c['text'] for c in parts) == clip.get('caption',clip['text']), 'Caption wording changed: ' + clip['id'])
        require(all(c['start'] >= clip['start'] and c['end'] <= clip['end'] for c in parts), 'Caption outside own clip: ' + clip['id'])
        try:
            _, notices = caption_parts(clip.get('caption', clip['text']), explicit=[c['text'] for c in parts],
                                       extra_terms=clip.get('protectedTerms', ()))
            if notices:
                warnings.append('Caption needs width review: ' + clip['id'])
        except ValueError as exc:
            errors.append(f"Unsafe caption boundary {clip['id']}: {exc}")
    require(caption_report.get('storySHA256') == story_sha, 'Caption report story hash differs')
    require(caption_report.get('count') == len(captions), 'Caption report count differs')
    if caption_report.get('warnings'):
        review_name = caption_report.get('warningReviewFile', '')
        review_path = (ROOT/review_name).resolve()
        review_exists = bool(review_name) and review_path.is_relative_to(RESEARCH.resolve()) and review_path.is_file()
        require(review_exists, 'Caption warnings need a current independent boundary review')
        if review_exists:
            boundary_review = read(review_path)
            require(sha(review_path) == caption_report.get('warningReviewSHA256') and boundary_review.get('passed') is True and
                    boundary_review.get('timelineSHA256') == timeline_sha and boundary_review.get('subjectiveListeningChecked') is False,
                    'Caption boundary review is stale or incomplete')
            require(caption_report.get('requiresCaptionReview') is False and
                    {w['clipId'] for w in caption_report['warnings']}.issubset(set(caption_report.get('reviewedWarningIds', []))),
                    'Unresolved caption warning')
    expected_srt = '\n\n'.join(f"{i+1}\n{srt_time(c['start'], FPS)} --> {srt_time(c['end'], FPS)}\n{c['text']}"
                                for i, c in enumerate(captions))+'\n'
    for name in ['GLP1.srt', 'GLP1-subtitles.srt']:
        path = AUDIO/name
        require(path.is_file() and path.read_text(encoding='utf-8-sig') == expected_srt, 'SRT differs from exact timeline text/timing: ' + name)
    asr_qa = read(RESEARCH/'voice-qa.json')
    require(asr_qa.get('completed') == asr_qa.get('total') == len(story['shots']) and asr_qa.get('complete') is True,
            'ASR screening incomplete')
    require(asr_qa.get('storySHA256') == story_sha, 'ASR QA story changed')
    records = asr_qa.get('records', [])
    records_by_id = {r['id']: r for r in records}
    require(len(records_by_id) == len(records) and set(records_by_id) == set(takes_by_id), 'ASR record IDs do not cover selected takes exactly')
    current_asr = {}
    for row in story['shots']:
        sid = row['id']
        summary = records_by_id.get(sid)
        if summary is None:
            continue
        source_sha = takes_by_id[sid]['sha256']
        require(summary.get('sourceSHA256') == source_sha, 'ASR QA source changed after screening: ' + sid)
        record_path = within(ROOT/summary['recordFile'], AUDIO/'asr')
        if not record_path.is_file():
            errors.append('Missing immutable first-pass ASR: ' + sid)
            continue
        require(sha(record_path) == summary.get('recordSHA256'), 'Immutable first-pass ASR changed: ' + sid)
        record = read(record_path)
        current_asr[sid] = record
        require(record.get('id') == sid and record.get('passKind') == 'first' and record.get('storySHA256') == story_sha,
                'ASR record is not the current unprompted first pass: ' + sid)
        require(record.get('sourceSHA256') == source_sha and record.get('expected') == spoken(row), 'ASR source/text differs: ' + sid)
        require(record.get('cacheKey') == summary.get('cacheKey') and record.get('subjectiveListeningChecked') is False,
                'ASR identity/listening claim differs: ' + sid)
        index_path = AUDIO/'asr'/f'{sid}.json'
        if index_path.is_file():
            index = read(index_path)
            require(index.get('recordSHA256') == summary.get('recordSHA256') and
                    all(index.get(key) == value for key, value in record.items()), 'Current ASR alias differs from immutable record: ' + sid)
        else:
            errors.append('Missing current first-pass ASR alias: ' + sid)
        for caption in (c for c in captions if c['clipId'] == sid):
            require(caption.get('sourceSHA256') == source_sha and caption.get('asrCacheKey') == record.get('cacheKey'),
                    'Caption timing uses a stale ASR source: ' + caption['id'])
    actual_flags = {sid: record.get('flags', []) for sid, record in current_asr.items() if record.get('flags')}
    require({item['id']: item.get('flags', []) for item in asr_qa.get('flagged', [])} == actual_flags,
            'ASR summary flags differ from immutable records')
    decisions_path = RESEARCH/'voice-review-decisions.json'
    decisions = read(decisions_path).get('decisions', {}) if decisions_path.exists() else {}
    for sid in actual_flags:
        decision = decisions.get(sid, {})
        source_sha = takes_by_id[sid]['sha256']
        reason, evidence = decision.get('reason'), decision.get('evidencePaths')
        require(decision.get('selectedSourceSHA256') == source_sha and isinstance(reason, str) and bool(reason.strip()),
                'Unresolved ASR/endpoint screen flag: ' + sid)
        valid_paths = isinstance(evidence, list) and bool(evidence) and all(isinstance(p, str) and p.strip() for p in evidence)
        require(valid_paths, 'Review requires nonempty evidence file paths: ' + sid)
        if not valid_paths:
            continue
        for evidence_name in evidence:
            evidence_path = (ROOT/evidence_name).resolve()
            allowed = any(evidence_path.is_relative_to(base.resolve()) for base in (AUDIO, RESEARCH))
            require(allowed and evidence_path != decisions_path.resolve() and
                    evidence_matches_source(evidence_path, source_sha, sid),
                    f'Review evidence missing, outside V5, or not bound to selected source: {sid}: {evidence_name}')
    for key in ['masterMeasurement', 'aacMeasurement']:
        measurement = report[key]
        require(-16 <= float(measurement['input_i']) <= -14, 'Integrated loudness outside -16 to -14 LUFS: ' + key)
        require(float(measurement['input_tp']) <= -1., 'True peak exceeds -1 dBTP: ' + key)
    events = RESEARCH/'music/original-score-events.json'
    score = read(events)
    require(score.get('timelineSHA256') == timeline_sha, 'Score uses a stale timeline')
    require(report['scoreEventsSHA256'] == sha(events), 'Score event hash changed')
    require(report['originalScoreSHA256'] == sha(AUDIO/'music/original-score.wav'), 'Original score changed')
    require(score['tempoBpm'] == 94 and score['title'] == '餐后晴光', 'Selected music differs')
    if not 13*60 <= n/SR <= 15*60:
        warnings.append(f'Measured duration {n/SR:.3f}s differs from provisional 13–15 minute target; no speech speed or padding applied')
    baseline = read(RESEARCH/'v4-protected-inputs.json')
    changes = [name for name, digest in baseline['files'].items() if not (ROOT/name).exists() or sha(ROOT/name) != digest]
    if changes:
        warnings.append('Protected V4 paths changed externally; see protectedBaselineChanges')
    result = dict(passed=not errors, checkedAtUTC=datetime.now(timezone.utc).isoformat(),
        errors=errors, warnings=warnings, storySHA256=story_sha, timelineSHA256=timeline_sha,
        durationFrames=tl['durationFrames'], durationSeconds=n/SR, samples=n, takeCount=len(tl['clips']),
        captionCount=len(captions), waveformStats=sample_stats, subjectiveListeningChecked=False,
        protectedBaselineCount=len(baseline['files']), protectedBaselineChanges=changes,
        selectedTakes=selected_takes, validatorSHA256=sha(Path(__file__)))
    save(RESEARCH/'audio-validation.json', result)
    print(json.dumps({k:result[k] for k in ['passed','errors','warnings','durationSeconds','takeCount','captionCount']}, ensure_ascii=False, indent=2), flush=True)
    if errors:
        raise ValueError('V5 audio validation failed; no installation manifest written')
    text_file(AUDIO/'解说稿.md', '# '+story['title']+'\n\n'+'\n\n'.join(f"<!-- {row['id']} -->\n{row['text']}" for row in story['shots'])+'\n')
    files = []
    for name in ['master.wav','narration.wav','music.wav','timeline.json']:
        files.append(dict(source=(AUDIO/name).relative_to(ROOT).as_posix(), destination='public/'+name, sha256=sha(AUDIO/name)))
    files.append(dict(source='audio/revision-v5/timeline.json', destination='src/timeline.json', sha256=timeline_sha))
    for row in story['shots']:
        source = AUDIO/'voice'/f"{row['id']}.wav"
        files.append(dict(source=source.relative_to(ROOT).as_posix(), destination=f"public/voice/{row['id']}.wav", sha256=sha(source)))
    delivery_names = {'GLP1.srt':'GLP1-v5.srt', 'GLP1-subtitles.srt':'GLP1-v5-subtitles.srt', '解说稿.md':'GLP1-v5-解说稿.md'}
    for name, destination in delivery_names.items():
        files.append(dict(source=(AUDIO/name).relative_to(ROOT).as_posix(), destination='delivery/'+destination, sha256=sha(AUDIO/name)))
    manifest = dict(revision='v5', readyForParentInstallation=True, installed=False,
        storySource=str(Path(story_path).resolve()), storySHA256=story_sha,
        timelineSHA256=timeline_sha, masterSHA256=sha(AUDIO/'master.wav'),
        durationFrames=tl['durationFrames'], durationSeconds=n/SR, files=files,
        validationSHA256=sha(RESEARCH/'audio-validation.json'),
        audioReportSHA256=sha(RESEARCH/'audio-report.json'),
        subjectiveListeningChecked=False)
    save(RESEARCH/'install-manifest.json', manifest)
    save(RESEARCH/'audio-lock.json', manifest)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--story', type=Path, default=DEFAULT_STORY)
    parser.add_argument('--expected-story-sha', required=True)
    args = parser.parse_args()
    validate(args.story, args.expected_story_sha)


if __name__ == '__main__':
    main()
