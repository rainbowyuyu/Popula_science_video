"""Prepare a verified local music replacement without re-rendering the video.

Default: write a NEW staging directory only. --apply is explicit and optional.
No audio is acquired from a URL, and no song identity is inferred from a filename.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
SECTION_TEMPO = {'hook': 1.0, 'foundation': .988, 'core': .996,
    'frame': 1.012, 'skin': .994, 'wind': 1.020, 'damper': .988,
    'assembly': 1.018, 'return': 1.0, 'references': .982}
SECTION_LEVEL = {'hook': .96, 'foundation': .89, 'core': .94,
    'frame': 1.0, 'skin': .92, 'wind': 1.06, 'damper': .91,
    'assembly': 1.07, 'return': .93, 'references': 1.04}


def arguments():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--source', required=True, type=Path, help='User-provided readable local audio/video file; never a URL.')
    p.add_argument('--title', default=None, help='Known track title; otherwise use embedded tag, or null.')
    p.add_argument('--artist', default=None, help='Known artist; otherwise use embedded tag, or null.')
    p.add_argument('--reference-url', default='https://v.douyin.com/hUudVGBOFKE/', help='Provenance reference only; never downloaded by this script.')
    p.add_argument('--output-dir', type=Path, help='New, nonexistent staging directory. Default: audio/requested-bgm/replacements/<timestamp>-<hash>.')
    p.add_argument('--bpm', type=float, help='Optional independently checked beat tempo. Otherwise conservative automatic analysis.')
    p.add_argument('--beat-offset', type=float, default=0, help='Seconds to a checked first beat; used with --bpm.')
    p.add_argument('--no-tempo-variation', action='store_true', help='Keep playback at 1.0 even when a reliable beat exists.')
    p.add_argument('--voice-over-music-db', type=float, default=18, help='Active speech/music RMS difference, default 18 dB (allowed 14–20).')
    p.add_argument('--apply', action='store_true', help='After all checks, back up and replace public music/master and the audio report. Timeline and narration remain unchanged.')
    p.add_argument('--mux-video', type=Path, help='Optional existing completed video; copy its video stream and replace audio without a 3D render.')
    p.add_argument('--mux-output', type=Path, help='New .mp4 path for --mux-video. Existing outputs are never overwritten.')
    return p.parse_args()


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(path.suffix + '.tmp')
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    pending.replace(path)


def executable(name):
    found = shutil.which(name)
    local = Path('C:/ffmpeg/bin') / (name + '.exe')
    if found:
        return found
    if local.is_file():
        return str(local)
    raise RuntimeError(f'{name} not found in PATH or C:/ffmpeg/bin')


def run(command):
    result = subprocess.run([str(x) for x in command], capture_output=True, text=True,
        encoding='utf-8', errors='replace')
    if result.returncode:
        raise RuntimeError(f'{Path(str(command[0])).name} failed: {result.stderr[-1800:]}')
    return result


def probe(path, ffprobe):
    return json.loads(run([ffprobe, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', path]).stdout)


def loudness(path, ffmpeg, peak=-1.8):
    result = run([ffmpeg, '-hide_banner', '-nostats', '-i', path, '-af',
        f'loudnorm=I=-15:TP={peak}:LRA=11:print_format=json', '-f', 'null', '-'])
    match = re.search(r'\{\s*"input_i"[\s\S]*?\}', result.stderr)
    if not match:
        raise RuntimeError('FFmpeg did not return loudness measurements')
    data = json.loads(match.group())
    if not all(math.isfinite(float(data[k])) for k in ['input_i', 'input_tp', 'input_lra', 'input_thresh']):
        raise RuntimeError('Audio is silent or has invalid loudness measurements')
    return data


def analyze_beats(audio, np, signal, supplied_bpm=None, supplied_offset=0):
    if supplied_bpm is not None:
        return dict(reliable=True, bpm=supplied_bpm, offsetSeconds=supplied_offset,
            method='caller-supplied verified beat grid', confidence=None)
    # Spectral onset analysis is deliberately conservative. It cannot establish
    # meter/downbeat identity, so inferred phrase joins remain a musical heuristic.
    mono = signal.resample_poly(audio.mean(axis=1), 1, 4)
    rate, hop = 12000, 240
    _, _, z = signal.stft(mono, rate, nperseg=1024, noverlap=1024-hop,
        boundary=None, padded=False)
    mag = np.abs(z).astype(np.float32)
    flux = np.maximum(np.diff(np.log1p(mag * 40), axis=1), 0).mean(axis=0)
    if len(flux) < 500 or float(flux.max()) < 1e-7:
        return dict(reliable=False, bpm=None, offsetSeconds=0, method='insufficient onset evidence')
    env = np.maximum(flux - np.median(flux), 0)
    env /= max(float(env.std()), 1e-8)
    onset_rate = rate / hop
    lo, hi = int(onset_rate*60/180), int(onset_rate*60/60)
    def best(part):
        centered = part - part.mean()
        acf = signal.fftconvolve(centered, centered[::-1], mode='full')[len(centered)-1:]
        acf /= max(float(acf[0]), 1e-9)
        lag = lo + int(np.argmax(acf[lo:hi+1]))
        return lag, float(acf[lag])
    lag, corr = best(env)
    bpm = 60 * onset_rate / lag
    parts = np.array_split(env, 3)
    estimates = [60 * onset_rate / best(x)[0] for x in parts if len(x) > 250]
    stability = max([abs(x/bpm-1) for x in estimates] or [1])
    period = 60 / bpm
    candidates = np.linspace(0, period, 48, endpoint=False)
    scores = []
    for offset in candidates:
        index = np.rint(np.arange(offset, len(env)/onset_rate, period)*onset_rate).astype(int)
        index = index[index < len(env)]
        scores.append(float(env[index].mean()) if len(index) else 0)
    phase = int(np.argmax(scores))
    strength = scores[phase] / max(float(np.mean(scores)), 1e-8)
    reliable = corr >= .26 and stability <= .035 and strength >= 1.35
    return dict(reliable=bool(reliable), bpm=round(bpm, 4),
        offsetSeconds=float(candidates[phase]), method='spectral-onset autocorrelation + 3-window agreement',
        confidence={'autocorrelation':corr, 'relativeTempoVariation':stability, 'beatGridStrength':strength},
        meterNotVerified=True, fallback='No reliable beat: tempo remains 1.0 and joins use slow cosine crossfades.')


def source_span(audio, start, count, crossfade, np):
    """Read continuous source if possible; otherwise use a C1 cosine loop seam."""
    n = len(audio)
    if start >= 0 and start + count <= n:
        return audio[start:start+count].copy(), False
    fade = min(crossfade, max(1, n//8))
    period = n - fade
    # The source tail meets the source head over the first fade samples. At the
    # period boundary source[n-fade-1] continues into source[n-fade], avoiding a cut.
    cycle = audio[:period].copy()
    weight = np.sin(np.linspace(0, np.pi/2, fade, endpoint=True, dtype=np.float32)) ** 2
    cycle[:fade] = audio[n-fade:]*(1-weight[:,None]) + audio[:fade]*weight[:,None]
    indices = np.arange(start, start+count, dtype=np.int64) % period
    return cycle[indices], True


def arrange(audio, timeline, beats, work, ffmpeg, no_variation, np, sf):
    fps = timeline['fps']
    total = round(timeline['durationFrames']/fps*SR)
    duration = total/SR
    sections = [dict(s) for s in timeline['sections']]
    sections[0]['start'] = 0
    assert sections[-1]['end'] == timeline['durationFrames']
    assert all(a['end'] == b['start'] for a,b in zip(sections,sections[1:]))
    tempo_ok = beats['reliable'] and not no_variation
    beat = 60/beats['bpm'] if beats['reliable'] else None
    # A checked beat allows phrase-aligned source entries. No claim of a
    # detected musical downbeat is made for the automatic grid.
    phrase = 4*beat if beat else None
    crossfade_seconds = min(1.2, max(.65, 2*beat)) if beat else 1.0
    half = round(crossfade_seconds*SR/2)
    out = np.zeros((total,2), np.float32)
    weight_sum = np.zeros(total, np.float32)
    source_cursor = 0.0
    events = []
    for i,section in enumerate(sections):
        name=section['id'];left=round(section['start']/fps*SR);right=round(section['end']/fps*SR)
        before=min(half,left) if i else 0
        after=min(half,total-right) if i<len(sections)-1 else 0
        start,end=left-before,right+after
        count=end-start
        speed=SECTION_TEMPO.get(name,1.0) if tempo_ok else 1.0
        assert .97 <= speed <= 1.03
        entry=source_cursor
        if phrase and i:
            entry=beats['offsetSeconds']+round((entry-beats['offsetSeconds'])/phrase)*phrase
        entry=max(0,entry)
        source_start=round(entry*SR)-round(before*speed)
        required=math.ceil(count*speed)+round(.25*SR)
        piece,looped=source_span(audio,source_start,required,round(crossfade_seconds*SR),np)
        if speed != 1.0:
            raw=work/f'section-{i:02d}-source.wav'
            processed=work/f'section-{i:02d}-tempo.wav'
            sf.write(raw,piece,SR,subtype='PCM_24')
            run([ffmpeg,'-v','error','-y','-i',raw,'-af',
                f'atempo={speed:.6f},apad=whole_len={count},atrim=end_sample={count}',
                '-ar',str(SR),'-ac','2','-c:a','pcm_s24le',processed])
            piece,_=sf.read(processed,dtype='float32',always_2d=True)
        else:
            piece=piece[:count]
        if len(piece)!=count:
            raise RuntimeError('Section output length mismatch')
        weights=np.ones(count,np.float32)
        if before:
            width=2*before
            weights[:width]=np.sin(np.linspace(0,np.pi/2,width,endpoint=True,dtype=np.float32))**2
        if after:
            width=2*after
            weights[-width:]=np.cos(np.linspace(0,np.pi/2,width,endpoint=True,dtype=np.float32))**2
        level=SECTION_LEVEL.get(name,1.0)
        out[start:end]+=piece*(weights*level)[:,None]
        weight_sum[start:end]+=weights
        events.append(dict(section=name,startSeconds=left/SR,endSeconds=right/SR,
            sourceEntrySeconds=entry,sourceLooped=looped,tempoFactor=speed,
            pitchSemitones=0,sectionGain=level,crossfadeSeconds=crossfade_seconds))
        source_cursor=entry+(right-left)/SR*speed
    if float(weight_sum.min()) < .99:
        raise RuntimeError('Arrangement has uncovered samples')
    out/=weight_sum[:,None]
    fade_in=np.sin(np.minimum(np.arange(total,dtype=np.float32)/(SR*.8),1)*np.pi/2)**2
    fade_out=np.sin(np.clip((total-1-np.arange(total,dtype=np.float32))/(SR*3.4),0,1)*np.pi/2)**2
    out*=fade_in[:,None]*fade_out[:,None]
    headroom_gain=min(1.0,.90/max(float(abs(out).max()),1e-9))
    out*=headroom_gain
    return out,dict(durationSeconds=duration,sections=events,tempoVariationApplied=bool(tempo_ok),
        maximumTempoDeviation=max(abs(e['tempoFactor']-1) for e in events),
        pitchShiftApplied=False,arrangementHeadroomGain=headroom_gain,crossfade='raised-cosine amplitude overlap; complementary weights; source-loop seam also crossfaded',
        phrasePolicy='4-beat entry grid where reliable; meter/downbeat not automatically certified')


def duck_and_mix(music, voice, timeline, difference, np, gaussian_filter1d):
    hop=480
    count=len(voice)//hop
    v=voice[:count*hop].reshape(-1,hop)
    vr=np.sqrt(np.mean(v*v,axis=1))
    active=vr>max(.003,float(vr.max())*.055)
    if int(active.sum()) < 100:
        raise RuntimeError('Narration has insufficient speech activity')
    vrms=float(np.sqrt(np.mean(v[active].astype(np.float64)**2)))
    control=np.full(math.ceil(len(voice)/hop),1.55,np.float32)
    for clip in timeline['clips']:
        a=max(0,round((clip['start']/timeline['fps']-.15)*SR/hop))
        b=min(len(control),math.ceil((clip['end']/timeline['fps']+.30)*SR/hop))
        control[a:b]=1
    control=gaussian_filter1d(control,30,mode='nearest')
    music*=np.interp(np.arange(len(voice))/hop,np.arange(len(control)),control).astype(np.float32)[:,None]
    mrms=float(np.sqrt(np.mean(music[:count*hop].reshape(-1,hop,2)[active].astype(np.float64)**2)))
    if mrms < 1e-8:
        raise RuntimeError('Requested music is silent during narration')
    gain=vrms*10**(-difference/20)/mrms
    music*=gain
    actual=float(20*np.log10(vrms/np.sqrt(np.mean(music[:count*hop].reshape(-1,hop,2)[active].astype(np.float64)**2))))
    return music,music+voice[:,None],dict(activeVoiceOverMusicDB=actual,
        targetVoiceOverMusicDB=difference,musicGain=gain,attackLeadSeconds=.15,
        postSentenceHoldSeconds=.30,smoothingSigmaSeconds=.30,silenceRecoveryGain=1.55,
        policy='Sentence-wide ducking; no syllable-by-syllable pumping; approximately 1s recovery')


def make_master(premaster, work, samples, ffmpeg):
    attempts=[]
    master=work/'master.wav';aac=work/'master-aac-check.m4a'
    for i in range(3):
        peak=-1.8-.25*i
        first=loudness(premaster,ffmpeg,peak)
        filt=(f"loudnorm=I=-15:TP={peak}:LRA=11:measured_I={first['input_i']}:"
            f"measured_TP={first['input_tp']}:measured_LRA={first['input_lra']}:"
            f"measured_thresh={first['input_thresh']}:offset={first['target_offset']}:"
            f'linear=true:print_format=none,aresample={SR},apad=whole_len={samples},atrim=end_sample={samples}')
        run([ffmpeg,'-v','error','-y','-i',premaster,'-af',filt,'-ar',str(SR),'-ac','2','-c:a','pcm_s24le',master])
        run([ffmpeg,'-v','error','-y','-i',master,'-c:a','aac','-b:a','320k',aac])
        mm=loudness(master,ffmpeg);am=loudness(aac,ffmpeg)
        attempts.append(dict(internalTruePeakTargetDBTP=peak,premaster=first,master=mm,aac=am))
        if -15.3 <= float(am['input_i']) <= -14.7 and float(am['input_tp']) <= -1.5:
            return master,aac,attempts
    raise RuntimeError('Final AAC did not meet -15 LUFS ±0.3 and <= -1.5 dBTP; nothing applied')


def mux_existing(video, target, master, timeline, ffmpeg, ffprobe):
    video=video.expanduser().resolve(strict=True)
    target=target.expanduser().resolve()
    if target.exists() or target==video or target.suffix.lower()!='.mp4':
        raise ValueError('Mux output must be a NEW .mp4 file, different from the source video')
    details=probe(video,ffprobe)
    stream=next((s for s in details['streams'] if s['codec_type']=='video'),None)
    if stream is None:
        raise ValueError('Mux source has no video stream')
    expected=timeline['durationFrames']/timeline['fps']
    measured=float(stream.get('duration',details['format'].get('duration','0')))
    if abs(measured-expected)>1/timeline['fps']+.005:
        raise ValueError(f'Video is from a different timeline: {measured} versus {expected} seconds')
    target.parent.mkdir(parents=True,exist_ok=True)
    run([ffmpeg,'-v','error','-n','-i',video,'-i',master,'-map','0:v:0','-map','1:a:0',
        '-map_metadata','0','-c:v','copy','-c:a','aac','-b:a','320k','-movflags','+faststart','-shortest',target])
    after=probe(target,ffprobe)
    a=loudness(target,ffmpeg)
    output_stream=next(s for s in after['streams'] if s['codec_type']=='video')
    if output_stream.get('nb_frames')!=stream.get('nb_frames'):
        raise RuntimeError('Remux changed the reported video frame count')
    if not(-15.3<=float(a['input_i'])<=-14.7 and float(a['input_tp'])<=-1.5):
        raise RuntimeError('Remux AAC failed final loudness/peak target; new file retained for diagnosis')
    return dict(input=str(video),output=str(target),videoCodecCopied=True,
        inputVideoSHA256=digest(video),outputSHA256=digest(target),aacMeasurement=a,
        videoFrames=output_stream.get('nb_frames'),videoDurationSeconds=output_stream.get('duration'))


def main():
    args=arguments()  # --help succeeds without numerical/TTS dependencies.
    if not 14<=args.voice_over_music_db<=20:
        raise ValueError('--voice-over-music-db must be between 14 and 20')
    if args.bpm is not None and not 40<=args.bpm<=220:
        raise ValueError('--bpm must be between 40 and 220')
    if args.beat_offset<0 or (args.bpm is None and args.beat_offset):
        raise ValueError('--beat-offset needs a checked --bpm and must be nonnegative')
    if args.mux_output and not args.mux_video:
        raise ValueError('--mux-output requires --mux-video')
    source=args.source.expanduser().resolve(strict=True)
    if not source.is_file():
        raise ValueError('--source must be one readable local file')
    source_sha=digest(source)
    ffmpeg,ffprobe=executable('ffmpeg'),executable('ffprobe')
    metadata=probe(source,ffprobe)
    if not any(s['codec_type']=='audio' for s in metadata['streams']):
        raise ValueError('The selected source has no audio stream')
    # Imports and all writes happen only after a real source has been read.
    import numpy as np
    import soundfile as sf
    from scipy import signal
    from scipy.ndimage import gaussian_filter1d
    stamp=datetime.now().strftime('%Y%m%d-%H%M%S')
    work=(args.output_dir or ROOT/'audio/requested-bgm/replacements'/f'{stamp}-{source_sha[:8]}').resolve()
    if work.exists():
        raise ValueError('Staging directory already exists; select a new output directory')
    if work in [ROOT.resolve(),(ROOT/'public').resolve(),(ROOT/'delivery').resolve()]:
        raise ValueError('A production folder cannot be used as staging')
    timeline=read(ROOT/'src/timeline.json')
    if timeline!=read(ROOT/'public/timeline.json'):
        raise ValueError('Source and public timelines disagree')
    timeline_sha=digest(ROOT/'src/timeline.json')
    narration_sha=digest(ROOT/'public/narration.wav')
    voice,rate=sf.read(ROOT/'public/narration.wav',dtype='float32')
    samples=round(timeline['durationFrames']/timeline['fps']*SR)
    if rate!=SR or voice.ndim!=1 or len(voice)!=samples or not np.isfinite(voice).all():
        raise ValueError('Narration format/duration does not match the protected timeline')
    work.mkdir(parents=True)
    decoded=work/'source-decoded.wav'
    run([ffmpeg,'-v','error','-n','-i',source,'-map','0:a:0','-vn','-af',
        'highpass=f=35,equalizer=f=2800:t=q:w=0.8:g=-1.8',
        '-ar',str(SR),'-ac','2','-c:a','pcm_s24le',decoded])
    audio,rate=sf.read(decoded,dtype='float32',always_2d=True)
    if len(audio)<SR*8 or not np.isfinite(audio).all() or float(abs(audio).max())<1e-6:
        raise ValueError('Source must contain at least 8 seconds of finite, audible audio')
    beats=analyze_beats(audio,np,signal,args.bpm,args.beat_offset)
    print('BEAT',json.dumps(beats,ensure_ascii=False),flush=True)
    arranged,arrangement=arrange(audio,timeline,beats,work,ffmpeg,args.no_tempo_variation,np,sf)
    sf.write(work/'music-arranged.wav',arranged,SR,subtype='PCM_24')
    music,premix,ducking=duck_and_mix(arranged,voice,timeline,args.voice_over_music_db,np,gaussian_filter1d)
    sf.write(work/'music.wav',music,SR,subtype='PCM_24')
    # Floating point preserves any temporary summation overs before mastering.
    sf.write(work/'premaster.wav',premix,SR,subtype='FLOAT')
    master,aac,normalization=make_master(work/'premaster.wav',work,samples,ffmpeg)
    final,fr=sf.read(master,dtype='float32',always_2d=True)
    if fr!=SR or len(final)!=samples or not np.isfinite(final).all() or np.any(abs(final)>=.999):
        raise RuntimeError('Master samples failed final duration/finite/clipping check')
    if digest(source)!=source_sha or digest(ROOT/'src/timeline.json')!=timeline_sha or digest(ROOT/'public/narration.wav')!=narration_sha:
        raise RuntimeError('Protected source, timeline or narration changed during processing; nothing applied')
    tags=metadata.get('format',{}).get('tags',{})
    title=args.title or tags.get('title') or tags.get('TITLE') or None
    artist=args.artist or tags.get('artist') or tags.get('ARTIST') or None
    source_record=dict(localPath=str(source),sha256=source_sha,title=title,artist=artist,
        durationSeconds=len(audio)/SR,referenceURL=args.reference_url,
        sourceStatus='readable user-selected local file',
        identityEvidence='explicit CLI metadata / embedded file tags only; no filename-based song identification',
        referenceTrackMatchIndependentlyVerified=False,sourceContainsOnlyMusicVerified=False,
        eq='35 Hz high-pass; 2.8 kHz bell -1.8 dB, Q 0.8; no voice stem separation')
    report=dict(createdAtUTC=datetime.now(timezone.utc).isoformat(),status='staged_validated',
        source=source_record,beatAnalysis=beats,arrangement=arrangement,ducking=ducking,
        normalizationAttempts=normalization,durationSeconds=samples/SR,sampleRate=SR,
        totalSamples=samples,voiceSpeedFactor=1,subjectiveListeningChecked=False,
        masterMeasurement=normalization[-1]['master'],aacMeasurement=normalization[-1]['aac'],
        timelineSHA256=timeline_sha,narrationSHA256=narration_sha,
        hashes={x:digest(work/x) for x in ['music-arranged.wav','music.wav','master.wav','master-aac-check.m4a']},
        productionFilesModified=False)
    save(work/'replacement-report.json',report)
    if args.mux_video:
        target=args.mux_output or ROOT/'delivery'/f'ShanghaiTower_requested_music_{stamp}.mp4'
        report['remux']=mux_existing(args.mux_video,target,master,timeline,ffmpeg,ffprobe)
        save(work/'replacement-report.json',report)
    if args.apply:
        if digest(ROOT/'src/timeline.json')!=timeline_sha or digest(ROOT/'public/narration.wav')!=narration_sha:
            raise RuntimeError('Protected timeline or narration changed before apply; nothing applied')
        backup=work/'previous-production';backup.mkdir()
        targets=[ROOT/'public/music.wav',ROOT/'public/master.wav',ROOT/'research/audio-report.json']
        for p in targets:
            if p.exists():
                shutil.copy2(p,backup/p.name)
        replaced=[]
        try:
            for name in ['music.wav','master.wav']:
                dest=ROOT/'public'/name;temporary=dest.with_suffix('.replacement.wav')
                shutil.copy2(work/name,temporary);temporary.replace(dest);replaced.append(dest)
            save(ROOT/'research/audio-report.json',dict(title=title,artist=artist,bpm=beats['bpm'],
                durationSeconds=samples/SR,sampleRate=SR,totalSamples=samples,voiceSpeedFactor=1,
                subjectiveListeningChecked=False,masterMeasurement=report['masterMeasurement'],
                aacMeasurement=report['aacMeasurement'],premasterMeasurement=normalization[-1]['premaster'],
                voiceOverMusicActiveDB=ducking['activeVoiceOverMusicDB'],musicReplacementPending=False,
                musicSource='User-selected local replacement; identity verification scope in requestedMusicSource',
                requestedMusicSource=source_record,replacementReport=str(work/'replacement-report.json'),
                hashes={name:digest(ROOT/'public'/name) for name in ['narration.wav','music.wav','master.wav','timeline.json']}))
        except Exception:
            for p in targets:
                old=backup/p.name
                if old.exists():
                    shutil.copy2(old,p)
            raise
        report['productionFilesModified']=True;report['status']='applied_validated'
        save(work/'replacement-report.json',report)
    print(json.dumps({'status':report['status'],'directory':str(work),
        'musicIdentity':{'title':title,'artist':artist},'productionFilesModified':report['productionFilesModified'],
        'masterLUFS':report['masterMeasurement']['input_i'],'aacTruePeakDBTP':report['aacMeasurement']['input_tp']},ensure_ascii=False,indent=2))


if __name__=='__main__':
    try:
        main()
    except (ValueError,RuntimeError,OSError) as error:
        print(f'ERROR: {error}',file=sys.stderr)
        raise SystemExit(1)
