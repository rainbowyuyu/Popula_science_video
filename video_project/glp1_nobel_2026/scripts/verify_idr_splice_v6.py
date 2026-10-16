"""Read-only media verification helpers for the isolated V6 IDR repair.

No source, delivery, renderer-marker or audio mutations. Diagnostic outputs are
explicit paths supplied by the candidate composer inside its repair directory.
"""
from __future__ import annotations
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import subprocess

import numpy as np


def require(value, message):
    if not value:
        raise RuntimeError(message)


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def run(args, *, log=None):
    result = subprocess.run(args, capture_output=True, encoding='utf8', errors='replace')
    if log:
        Path(log).write_text(result.stderr, encoding='utf8')
    require(result.returncode == 0, f'{args[0]} failed: {result.stderr[-4000:]}')
    return result.stdout


def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))


def video_stream(path, frames, *, silent=False):
    meta = probe(path)
    streams = [s for s in meta['streams'] if s['codec_type'] == 'video']
    require(len(streams) == 1, f'Expected one video stream: {path}')
    s = streams[0]
    require((s['width'], s['height'], s['codec_name'], s['pix_fmt']) == (1920, 1080, 'h264', 'yuv420p'), 'Video format differs')
    require(Fraction(s['r_frame_rate']) == Fraction(s['avg_frame_rate']) == 30, 'Video fps differs')
    require(int(s['nb_frames']) == frames, f'Video declared frames differ: {path}')
    require(abs(float(s['duration']) - frames/30) < .001, 'Video duration differs')
    require(abs(float(s.get('start_time', 0))) < 1e-6, 'Video does not start at zero')
    require(all(s.get(k) == 'bt709' for k in ['color_space', 'color_transfer', 'color_primaries'])
            and s.get('color_range') == 'tv', 'Video BT709 limited range differs')
    if silent:
        require(not any(x['codec_type'] == 'audio' for x in meta['streams']), 'Patch/segment unexpectedly has audio')
    return s


def frame_hashes(path, output, expected_count):
    """Hash decoded planar YUV420 samples; the muxer cannot duplicate frames."""
    text = run(['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-hwaccel', 'none',
                '-threads', '2', '-i', str(path), '-map', '0:v:0', '-an', '-c:v', 'rawvideo',
                '-pix_fmt', 'yuv420p', '-threads', '2', '-fps_mode', 'passthrough',
                '-f', 'framehash', '-hash', 'sha256', '-'])
    Path(output).write_text(text, encoding='utf8')
    tb_match = re.search(r'#tb\s+0:\s+(\d+/\d+)', text)
    require(tb_match, 'Missing framehash time base')
    timebase = Fraction(tb_match.group(1))
    rows = []
    for line in text.splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        fields = [x.strip() for x in line.split(',')]
        require(len(fields) == 6 and fields[0] == '0', 'Unexpected decoded framehash row')
        dts, pts, duration, size = map(int, fields[1:5])
        index = len(rows)
        require(Fraction(pts)*timebase == Fraction(index, 30), f'Decoded frame PTS differs at F{index}')
        require(Fraction(duration)*timebase == Fraction(1, 30), f'Decoded duration differs at F{index}')
        require(size == 1920*1080*3//2 and re.fullmatch('[a-f0-9]{64}', fields[5]), 'Decoded YUV format/hash differs')
        rows.append(fields[5])
    require(len(rows) == expected_count, f'Decoded count mismatch: {len(rows)} != {expected_count}')
    return rows


def packet_timing(path, expected_count):
    s = [x for x in probe(path)['streams'] if x['codec_type'] == 'video'][0]
    tb = Fraction(s['time_base'])
    packets = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_packets',
        '-show_entries', 'packet=pts,dts,duration,flags', '-of', 'json', str(path)]))['packets']
    require(len(packets) == expected_count, 'Video packet count differs')
    require(sorted(Fraction(p['pts'])*tb for p in packets) == [Fraction(i, 30) for i in range(expected_count)],
            'Video packet PTS has gaps, overlaps or offsets')
    require(all(Fraction(p['duration'])*tb == Fraction(1, 30) for p in packets), 'Packet durations differ')
    dts = [Fraction(p['dts'])*tb for p in packets]
    require(all(b-a == Fraction(1, 30) for a, b in zip(dts, dts[1:])), 'Nonuniform/nonmonotonic decode timing')
    require('K' in packets[0]['flags'], 'First packet is not a random-access keyframe')
    return {'packets': len(packets), 'timeBase': str(tb), 'allPresentationTimestampsExact': True,
            'allDecodeIntervalsExact': True, 'decodeStartSeconds': float(dts[0]),
            'keyframePresentationFrames': sorted(round(float(Fraction(p['pts'])*tb)*30)
                for p in packets if 'K' in p['flags'])}


def idr_at(path, frame):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-loglevel', 'info', '-ss', f'{frame/30:.9f}',
        '-i', str(path), '-t', '0.034', '-map', '0:v:0', '-an', '-c:v', 'copy', '-bsf:v', 'trace_headers', '-f', 'null', '-'],
        capture_output=True, encoding='utf8', errors='replace')
    require(result.returncode == 0, 'IDR trace failed')
    types = [int(v) for v in re.findall(r'nal_unit_type\s+[01]+\s*=\s*(\d+)', result.stderr)]
    slices = [v for v in types if 1 <= v <= 5]
    require(slices and slices[0] == 5, f'Boundary F{frame} does not seek to an IDR')
    return {'frame': frame, 'firstVclNalUnitType': slices[0], 'idrConfirmed': True}


def audio_pcm(path):
    args = ['ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-i', str(path),
            '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-']
    result = subprocess.run(args, capture_output=True)
    require(result.returncode == 0, 'Audio decode failed: ' + result.stderr.decode('utf8', errors='replace')[-2000:])
    return np.frombuffer(result.stdout, dtype='<f4').astype(np.float64)


def verify_audio(candidate, master, master_sha):
    """Independent full-length zero-lag comparison plus distributed lag search."""
    a, b = audio_pcm(candidate), audio_pcm(master)
    original_samples_aac, original_samples_master = len(a), len(b)
    require(abs(len(a)-len(b)) <= 192, 'Audio sample count differs by more than one AAC packet')
    n = min(len(a), len(b)); a, b = a[:n], b[:n]
    total_a=float(a@a);total_b=float(b@b);ab=float(a@b);error=float((a-b)@(a-b))
    corr=ab/(total_a*total_b)**.5;rmse=(error/total_b)**.5;gain=10*np.log10(total_a/total_b)
    require(corr>=.995 and rmse<=.08 and abs(gain)<=.25, 'Full AAC/master comparison failed')
    windows=[]
    for start in range(0,n,40000):
        x,y=a[start:start+40000],b[start:start+40000];yy=float(y@y)
        if yy<=len(y)*1e-10:continue
        c=float(x@y)/(float(x@x)*yy)**.5;e=float((x-y)@(x-y))/yy
        require(c>=.99 and e**.5<=.10, f'Audio window mismatch at {start/8000}s')
        windows.append({'startSeconds':start/8000,'correlation':c,'normalizedRMSE':e**.5})
    require(windows, 'No nonsilent audio windows')
    lag_windows=[]
    for index in sorted(set(np.linspace(0,len(windows)-1,min(12,len(windows))).astype(int).tolist())):
        start=max(800,round(windows[index]['startSeconds']*8000));end=min(n-800,start+32000)
        if end-start<4000:continue
        def score(lag,stride):
            x,y=a[start+lag:end+lag:stride],b[start:end:stride]
            return float(x@y)/(float(x@x)*float(y@y))**.5
        coarse=max(range(-800,801,8),key=lambda k:score(k,4))
        best=max([0,*range(max(-800,coarse-8),min(800,coarse+8)+1)],key=lambda k:score(k,1))
        require(best==0,f'Audio lag at {start/8000}s: {best/8}ms')
        lag_windows.append({'startSeconds':start/8000,'bestLagSamples':best,'correlation':score(best,1)})
    return {'masterSHA256':master_sha,'correlation':corr,'normalizedRMSE':rmse,'gainDB':float(gain),
        'samplesAAC':original_samples_aac,'samplesMaster':original_samples_master,
        'comparedSamples':n,'windows':windows,'lagWindows':lag_windows,
        'zeroLagVerified':True,'method':'Full mono 8kHz decoded PCM, every nonsilent 5s window; +/-100ms independent lag search at 12 distributed positions',
        'subjectiveListeningCompleted':False}


def loudness(path):
    result=subprocess.run(['ffmpeg','-hide_banner','-nostdin','-nostats','-i',str(path),'-vn',
        '-af','loudnorm=I=-15:TP=-2:LRA=11:print_format=json','-f','null','-'],capture_output=True,encoding='utf8',errors='replace')
    require(result.returncode==0,'AAC loudness scan failed')
    match=re.search(r'\{\s*"input_i"[\s\S]*?\}',result.stderr)
    require(match,'No loudness values')
    return json.loads(match[0])
