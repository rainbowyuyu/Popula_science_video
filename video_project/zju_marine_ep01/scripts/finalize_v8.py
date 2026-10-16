"""Mux and verify the V8 film; QA is always beside the chosen output.

Defaults to the V8 PCM master as the only audio source. This script does not
modify earlier versions, delete caches, or claim subjective viewing/listening.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'rainbow-marine-ep01-v8'


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def run(args, log=None):
    p = subprocess.run(args, capture_output=True, text=True, encoding='utf8', errors='replace')
    if log:
        Path(log).write_text(p.stdout + '\n' + p.stderr, encoding='utf8')
    if p.returncode:
        raise RuntimeError(p.stderr[-3500:])
    return p.stdout, p.stderr


def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)])[0])


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source', type=Path, default=OUT / 'marine_energy_episode01_v8_raw.mp4')
    ap.add_argument('--output', type=Path, default=OUT / 'marine_energy_episode01_v8_master.mp4')
    ap.add_argument('--audio', type=Path, default=ROOT / 'public/audio/episode01-mix-v8.wav')
    ap.add_argument('--source-audio', action='store_true', help='Explicitly use source video audio instead of the V8 WAV')
    ap.add_argument('--qa-dir', type=Path, help='Default: output.parent/qa-final')
    ap.add_argument('--keep-audio-level', action='store_true', help='Skip loudness pass when using an already accepted master')
    ap.add_argument('--overwrite', action='store_true')
    args = ap.parse_args()
    source, final = args.source.resolve(), args.output.resolve()
    audio = source if args.source_audio else args.audio.resolve()
    qa = args.qa_dir.resolve() if args.qa_dir else final.parent / 'qa-final'
    if source == final:
        raise ValueError('Source and final output must differ')
    if not source.is_file() or not audio.is_file():
        raise FileNotFoundError('Video source and selected audio must both exist')
    if final.exists() and not args.overwrite:
        raise FileExistsError('V8 final already exists; use --overwrite for this exact output')
    final.parent.mkdir(parents=True, exist_ok=True)
    qa.mkdir(parents=True, exist_ok=True)
    source_probe = probe(source)
    source_video = next(s for s in source_probe['streams'] if s['codec_type'] == 'video')
    duration = float(source_video.get('duration', source_probe['format']['duration']))
    frames = int(source_video.get('nb_frames', round(duration * 30)))
    target_samples = round(frames / 30 * 48000)
    story = json.loads((ROOT / 'src/story.json').read_text(encoding='utf-8-sig'))
    expected_frames = int(__import__('math').ceil(max(s['end'] for s in story['scenes']) * 30))
    if frames != expected_frames:
        raise ValueError(f'Expected complete {expected_frames}-frame film; received {frames} frames')
    normalization = None
    flt = ''
    if not args.keep_audio_level:
        _, log = run(['ffmpeg', '-hide_banner', '-nostdin', '-i', str(audio), '-vn', '-af',
                      'loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json', '-f', 'null', '-'], qa / 'loudnorm-analysis.log')
        normalization = json.loads(re.findall(r'\{\s*"input_i".*?\}', log, re.S)[-1])
        m = normalization
        flt = (f"loudnorm=I=-16:TP=-1.5:LRA=8:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
               f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:"
               'linear=true:print_format=json,')
    flt += f'aresample=48000,apad,atrim=end_sample={target_samples},asettb=1/48000,asetpts=N'
    temporary = final.with_name(final.stem + '.encoding.mp4')
    cmd = ['ffmpeg', '-hide_banner', '-nostdin', '-y', '-i', str(source)]
    if not args.source_audio:
        cmd += ['-i', str(audio)]
    cmd += ['-map', '0:v:0', '-map', '0:a:0' if args.source_audio else '1:a:0', '-c:v', 'copy',
            '-af', flt, '-ar', '48000', '-c:a', 'aac', '-b:a', '320k',
            '-enc_time_base:a', '1:48000', '-movflags', '+faststart', str(temporary)]
    run(cmd, qa / 'final-mux.log')
    p = probe(temporary)
    (qa / 'ffprobe.json').write_text(json.dumps(p, indent=2), encoding='utf8')
    packet_json = run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_packets',
                      '-show_entries', 'packet=pts,duration', '-of', 'json', str(temporary)])[0]
    packets = json.loads(packet_json)['packets']
    pts_errors = [{'packet': i, 'step': int(packets[i]['pts']) - int(packets[i-1]['pts'])}
                  for i in range(1, len(packets)) if int(packets[i]['pts'])-int(packets[i-1]['pts']) != 1024]
    durations = [{'packet': i, 'duration': int(p['duration'])} for i, p in enumerate(packets[:-1]) if int(p['duration']) != 1024]
    timing = {'codec': 'AAC-LC', 'frameSamples': 1024, 'packetCount': len(packets),
              'nonuniformPtsSteps': pts_errors, 'interiorDurationErrors': durations,
              'lastDurationSamples': int(packets[-1]['duration'])}
    (qa / 'audio-packet-timing.json').write_text(json.dumps(timing, indent=2), encoding='utf8')
    _, detection = run(['ffmpeg', '-hide_banner', '-nostdin', '-xerror', '-err_detect', 'explode', '-i', str(temporary), '-vf',
                         'blackdetect=d=0.15:pix_th=0.03:pic_th=0.985', '-af',
                         'silencedetect=n=-55dB:d=1.25,ebur128=peak=true', '-f', 'null', '-'],
                        qa / 'decode-av-detection.log')
    video = next(s for s in p['streams'] if s['codec_type'] == 'video')
    au = next(s for s in p['streams'] if s['codec_type'] == 'audio')
    tail = detection.split('Summary:')[-1]
    lu = re.search(r'I:\s*(-?[\d.]+) LUFS', tail)
    tp = re.search(r'Peak:\s*(-?[\d.]+) dBFS', tail)
    checks = {
        'resolution': [video['width'], video['height']] == [1920, 1080],
        'fps': video['r_frame_rate'] == '30/1', 'frameCount': int(video.get('nb_frames', 0)) == expected_frames,
        'avDurationDeltaSec': abs(float(video['duration']) - float(au['duration'])),
        'audioPacketTimingContinuous': not pts_errors and not durations, 'fullDecode': True,
        'blackIntervals': re.findall(r'black_start:([^\n]+)', detection),
        'silenceStartsOver1_25Sec': re.findall(r'silence_start:\s*([\d.]+)', detection),
        'integratedLUFS': float(lu.group(1)) if lu else None, 'truePeakDbTP': float(tp.group(1)) if tp else None,
    }
    passed = (all(checks[k] for k in ['resolution', 'fps', 'frameCount', 'audioPacketTimingContinuous', 'fullDecode'])
              and checks['avDurationDeltaSec'] <= 1/30 and not checks['blackIntervals']
              and not checks['silenceStartsOver1_25Sec'] and checks['integratedLUFS'] is not None
              and abs(checks['integratedLUFS']+16) <= 1 and checks['truePeakDbTP'] is not None and checks['truePeakDbTP'] <= -.8)
    if passed:
        temporary.replace(final)
    report = {
        'schema': 'rainbow-science-video-encoding-v8', 'version': 'v8',
        'created': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'file': str(final if passed else temporary), 'sha256': sha(final if passed else temporary),
        'bytes': (final if passed else temporary).stat().st_size, 'checks': checks, 'encodingPassed': passed,
        'sources': {'video': {'path': str(source), 'sha256': sha(source)}, 'audio': {'path': str(audio), 'sha256': sha(audio)}},
        'normalization': normalization, 'actualFullNormalSpeedViewing': False, 'subjectiveListeningChecked': False,
        'scope': 'Full decoder, duration, timing, black/silence and loudness measurements. Does not certify aesthetics or listening.',
    }
    (qa / 'final-encoding-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not passed:
        raise SystemExit('V8 encoding checks failed; candidate retained separately for diagnosis')


if __name__ == '__main__':
    main()
