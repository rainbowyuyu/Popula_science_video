"""V5 staging: measured full takes, bounded-memory mix, and provenance.

Never writes public, src, legacy audio, or delivery. Timeline metadata keeps the
complete frozen story's shot semantics, with measured timing added separately.
"""
import argparse
from copy import deepcopy
import json
import math
from pathlib import Path
import re
import subprocess

import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d

from audio_v5_common import AUDIO, DEFAULT_STORY, FPS, RESEARCH, ROOT, SR, SAMPLES_PER_FRAME, read, save, sha, spoken, validate_story, within

BLOCK = SR * 20
BED_DB = {'warm': 18., 'mechanism': 20., 'action': 17.5,
          'evidence': 20., 'reflect': 19., 'resolve': 18.}
TIMING_KEYS = {'start', 'end', 'duration', 'startSeconds', 'endSeconds',
               'voiceEndSeconds', 'voiceDurationSeconds', 'audioSHA256', 'audio',
               'audioSource', 'takeSHA256', 'additionalPauseAfterSeconds', 'effectivePauseAfterSeconds'}


def measure(path):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path),
        '-af', 'loudnorm=I=-15:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'],
        capture_output=True, text=True, check=True)
    match = re.search(r'\{\s*"input_i"[\s\S]*?\}', result.stderr)
    if not match:
        raise ValueError('No FFmpeg loudness measurement: ' + str(path))
    return json.loads(match.group())


def zeros(writer, count):
    for start in range(0, count, BLOCK):
        writer.write(np.zeros(min(BLOCK, count-start), np.float32))


def prepare(story_path, expected_sha):
    story, story_sha = validate_story(story_path, expected_sha)
    overrides_path = RESEARCH/'rhythm-overrides.json'
    overrides = read(overrides_path) if overrides_path.exists() else {'additionalPauseAfterSeconds': {}}
    if overrides_path.exists() and overrides.get('storySHA256') != story_sha:
        raise ValueError('Rhythm overrides use a different frozen story')
    additional_pauses = overrides['additionalPauseAfterSeconds']
    if set(additional_pauses)-{row['id'] for row in story['shots']} or any(
            not isinstance(value, (int,float)) or not math.isfinite(value) or not 0 <= value <= 20
            for value in additional_pauses.values()):
        raise ValueError('Invalid approved observation pauses')
    clips, placements, sections = [], [], []
    cursor = round(.4 * FPS)
    for row in story['shots']:
        collision = TIMING_KEYS.intersection(row)
        if collision:
            raise ValueError(f"Source shot {row['id']} uses timing-reserved fields: {collision}")
        take_path = AUDIO / 'takes' / f"{row['id']}.json"
        take = read(take_path)
        path = within(ROOT / take['processed'], AUDIO)
        info = sf.info(path)
        if take['storySHA256'] != story_sha or take['ttsText'] != spoken(row):
            raise ValueError('Stale story/text take: ' + row['id'])
        if info.samplerate != SR or info.channels != 1 or sha(path) != take['sha256']:
            raise ValueError('Voice format/hash changed: ' + row['id'])
        if abs(info.duration - take['rawDuration']) > 1/SR:
            raise ValueError('Full raw duration not preserved: ' + row['id'])
        voice_frames = math.ceil(info.frames / SAMPLES_PER_FRAME)
        additional = additional_pauses.get(row['id'], 0.)
        effective_pause = row.get('pauseAfterSeconds', .20) + additional
        gap = round(effective_pause * FPS)
        end = cursor + voice_frames + gap
        clip = deepcopy(row)
        clip.update(start=cursor, end=end, duration=end-cursor,
            startSeconds=cursor/FPS, endSeconds=end/FPS,
            voiceEndSeconds=cursor/FPS+info.duration, voiceDurationSeconds=info.duration,
            audioSHA256=take['sha256'], audio=f"voice/{row['id']}.wav",
            audioSource=path.relative_to(ROOT).as_posix(), takeSHA256=sha(take_path),
            additionalPauseAfterSeconds=additional, effectivePauseAfterSeconds=effective_pause)
        clips.append(clip)
        placements.append(dict(id=row['id'], startSample=cursor*SAMPLES_PER_FRAME,
            endSample=cursor*SAMPLES_PER_FRAME+info.frames, samples=info.frames,
            sourceSHA256=take['sha256'], placementErrorSamples=0))
        if sections and sections[-1]['id'] == row['section']:
            sections[-1]['end'] = end
        else:
            sections.append(dict(id=row['section'], start=cursor, end=end))
        cursor = end
    outro_frames = 12 * FPS
    duration = cursor + outro_frames
    sections.append(dict(id='references', start=cursor, end=duration))
    timeline = deepcopy({key: value for key, value in story.items() if key != 'shots'})
    timeline.update(fps=FPS, duration=duration, durationFrames=duration,
        durationSeconds=duration/FPS, clips=clips, captions=[], sections=sections,
        draft=False, voiceSpeedFactor=1, storySHA256=story_sha,
        storySource=str(Path(story_path).resolve()),
        outro=dict(start=cursor, end=duration, duration=outro_frames))
    if overrides_path.exists():
        timeline['rhythmOverrides'] = dict(path=overrides_path.relative_to(ROOT).as_posix(),
            sha256=sha(overrides_path), totalAddedSeconds=sum(additional_pauses.values()))
    save(AUDIO / 'timeline.json', timeline)
    narration = within(AUDIO / 'narration.wav', AUDIO)
    with sf.SoundFile(narration, 'w', samplerate=SR, channels=1, subtype='PCM_24') as writer:
        position = 0
        for clip, place in zip(clips, placements):
            zeros(writer, place['startSample']-position)
            with sf.SoundFile(ROOT / clip['audioSource']) as reader:
                while True:
                    data = reader.read(BLOCK, dtype='float32')
                    if not len(data):
                        break
                    writer.write(data)
            position = place['endSample']
        zeros(writer, duration*SAMPLES_PER_FRAME-position)
    save(AUDIO / 'placements.json', dict(storySHA256=story_sha,
        timelineSHA256=sha(AUDIO / 'timeline.json'), sentences=placements,
        totalSamples=duration*SAMPLES_PER_FRAME, voiceSeconds=sum(c['voiceDurationSeconds'] for c in clips),
        silencePolicy='0.4s lead; source pauseAfterSeconds or 0.20s gap plus approved observation holds; 12s references tail; complete unchanged takes',
        additionalObservationSeconds=sum(additional_pauses.values())))
    print('V5_TIMELINE', duration, 'frames', duration/FPS, 'seconds', len(clips), 'clips', flush=True)
    return timeline


def rms_reference(voice_path, music_path):
    hop = SR // 100
    peak_rms = 0.
    with sf.SoundFile(voice_path) as reader:
        while True:
            data = reader.read(BLOCK, dtype='float32')
            if not len(data):
                break
            rows = data[:len(data)//hop*hop].reshape(-1, hop)
            if len(rows):
                peak_rms = max(peak_rms, float(np.sqrt(np.mean(rows*rows, axis=1)).max()))
    active_threshold = max(.003, peak_rms*.055)
    voice_energy, voice_count, music_energy, music_count = 0., 0, 0., 0
    with sf.SoundFile(voice_path) as reader:
        while True:
            data = reader.read(BLOCK, dtype='float32')
            if not len(data):
                break
            rows = data[:len(data)//hop*hop].reshape(-1, hop)
            if len(rows):
                selected = rows[np.sqrt(np.mean(rows*rows, axis=1)) > active_threshold]
                voice_energy += float(np.sum(selected.astype(np.float64)**2))
                voice_count += selected.size
    with sf.SoundFile(music_path) as reader:
        while True:
            data = reader.read(BLOCK, dtype='float32', always_2d=True)
            if not len(data):
                break
            music_energy += float(np.sum(data.astype(np.float64)**2))
            music_count += data.size
    if not voice_count or music_energy <= 0:
        raise ValueError('Missing active speech or score')
    return math.sqrt(voice_energy/voice_count), math.sqrt(music_energy/music_count), active_threshold


def mix():
    timeline_path = AUDIO / 'timeline.json'
    tl = read(timeline_path)
    n = tl['durationFrames'] * SAMPLES_PER_FRAME
    voice_path = AUDIO / 'narration.wav'
    source = AUDIO / 'music/original-score.wav'
    for path, channels in [(voice_path, 1), (source, 2)]:
        info = sf.info(path)
        if info.frames != n or info.samplerate != SR or info.channels != channels:
            raise ValueError('Wrong full-track dimensions: ' + str(path))
    events = read(RESEARCH / 'music/original-score-events.json')
    render = read(RESEARCH / 'music/original-score-render.json')
    if events.get('timelineSHA256') != sha(timeline_path) or render['sha256'] != sha(source):
        raise ValueError('Score provenance does not match current timeline')
    vrms, mrms, threshold = rms_reference(voice_path, source)
    hop = SR // 100
    times = np.arange(math.ceil(n/hop)+1, dtype=np.float64)/100
    # Start ducking 0.10s before speech; preserve the level over the entire
    # sentence and short pauses, then recover over one second. No syllable gate.
    control = np.full(len(times), 10**(-15/20), np.float64)
    for clip in tl['clips']:
        duck = 10**(-BED_DB[clip.get('musicCue', 'mechanism')]/20)
        start, end = clip['startSeconds']-.10, clip['voiceEndSeconds']+.30
        left, right = max(0, math.floor(start*100)), min(len(times), math.ceil((end+1.)*100))
        local = times[left:right]
        recovery = np.clip(local-end, 0, 1)
        envelope = duck + (10**(-15/20)-duck)*(.5-.5*np.cos(np.pi*recovery))
        control[left:right] = np.minimum(control[left:right], envelope)
    control = gaussian_filter1d(control, 5, mode='nearest') * vrms/mrms
    music_path, pre = AUDIO / 'music.wav', AUDIO / 'premaster.wav'
    active_voice_energy, active_music_energy, active_count = 0., 0., 0
    cue_energy = {key: [0., 0., 0] for key in BED_DB}
    with sf.SoundFile(voice_path) as voices, sf.SoundFile(source) as score, \
         sf.SoundFile(music_path, 'w', samplerate=SR, channels=2, subtype='PCM_24') as bed, \
         sf.SoundFile(pre, 'w', samplerate=SR, channels=2, subtype='FLOAT') as premaster:
        for start in range(0, n, BLOCK):
            count = min(BLOCK, n-start)
            voice = voices.read(count, dtype='float32')
            music = score.read(count, dtype='float32', always_2d=True)
            gains = np.interp(np.arange(start, start+count)/hop, np.arange(len(control)), control)
            music *= gains.astype(np.float32)[:, None]
            bed.write(music)
            premaster.write(music + voice[:, None])
            rows = voice[:count//hop*hop].reshape(-1, hop)
            musrows = music[:len(rows)*hop].reshape(-1, hop, 2)
            active = np.sqrt(np.mean(rows*rows, axis=1)) > threshold
            ve = np.mean(rows.astype(np.float64)**2, axis=1)
            me = np.mean(musrows.astype(np.float64)**2, axis=(1, 2))
            active_voice_energy += float(ve[active].sum())
            active_music_energy += float(me[active].sum())
            active_count += int(active.sum())
            window_times = (start + np.arange(len(rows))*hop)/SR
            for clip in tl['clips']:
                selected = active & (window_times >= clip['startSeconds']) & (window_times < clip['voiceEndSeconds'])
                if selected.any():
                    acc = cue_energy[clip.get('musicCue', 'mechanism')]
                    acc[0] += float(ve[selected].sum())
                    acc[1] += float(me[selected].sum())
                    acc[2] += int(selected.sum())
    measured = measure(pre)
    filt = (f"loudnorm=I=-15:TP=-2:LRA=11:measured_I={measured['input_i']}:"
        f"measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}:"
        f"measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:"
        f"linear=true:print_format=none,aresample={SR},apad=whole_len={n},atrim=end_sample={n}")
    master = AUDIO / 'master.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(pre), '-af', filt,
        '-ar', str(SR), '-ac', '2', '-c:a', 'pcm_s24le', str(master)], check=True)
    master_measurement = measure(master)
    aac = AUDIO / 'master-aac-check.m4a'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(master), '-c:a', 'aac', '-b:a', '320k', str(aac)], check=True)
    aac_measurement = measure(aac)
    for label, path in [('raw', ROOT/read(AUDIO/'takes'/f"{tl['clips'][0]['id']}.json")['raw']),
                        ('processed', ROOT/tl['clips'][0]['audioSource'])]:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(path),
            '-af', 'loudnorm=I=-19:TP=-2:LRA=11', '-ar', str(SR), '-c:a', 'pcm_s24le', str(AUDIO/f'AB-{label}.wav')], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(master), '-t', '45', '-c:a', 'pcm_s24le', str(AUDIO/'preview-with-music.wav')], check=True)
    report = dict(title=events['title'], bpm=events['tempoBpm'], arrangement='flow',
        storySHA256=tl['storySHA256'], timelineSHA256=sha(timeline_path), durationSeconds=n/SR,
        totalSamples=n, sampleRate=SR, voiceSpeedFactor=1, subjectiveListeningChecked=False,
        masterMeasurement=master_measurement, aacMeasurement=aac_measurement,
        premasterMeasurement=measured, activeSpeechWindows=active_count,
        voiceOverMusicActiveDB=10*math.log10(active_voice_energy/max(active_music_energy, 1e-20)),
        targetVoiceOverMusicDBByCue=BED_DB,
        measuredVoiceOverMusicDBByCue={key: 10*math.log10(v/max(m, 1e-20)) for key,(v,m,c) in cue_energy.items() if c},
        ducking='Whole-take envelope: 0.10s anticipation, 0.30s hold, 1s smooth recovery; short gaps stay ducked',
        hashes={name: sha(AUDIO/name) for name in ['narration.wav', 'music.wav', 'master.wav', 'timeline.json', 'master-aac-check.m4a']},
        originalScoreSHA256=sha(source), scoreEventsSHA256=sha(RESEARCH/'music/original-score-events.json'),
        mixScriptSHA256=sha(Path(__file__)),
        musicSource='餐后晴光: new F major / D minor 4/4 composition at 94 BPM; VSCO2 CE CC0 isolated instrument samples')
    save(RESEARCH / 'audio-report.json', report)
    print('V5_MASTER', n/SR, master_measurement, 'AAC', aac_measurement, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'mix'], nargs='?', default='prepare')
    parser.add_argument('--story', type=Path, default=DEFAULT_STORY)
    parser.add_argument('--expected-story-sha', required=True)
    args = parser.parse_args()
    validate_story(args.story, args.expected_story_sha)
    if args.mode == 'prepare':
        prepare(args.story, args.expected_story_sha)
    else:
        if read(AUDIO/'timeline.json')['storySHA256'] != args.expected_story_sha:
            raise ValueError('Timeline story hash differs from requested freeze')
        mix()


if __name__ == '__main__':
    main()
