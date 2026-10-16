"""Check final AAC timing against the approved V8 PCM master, without ASR.

python scripts/check_final_sync_v8.py FILM.mp4 --out qa-final/audio-sync-v8.json
The decoder applies AAC priming/skip-sample metadata. Correlation tolerates codec
changes and final mastering gain; it is not a sample-identity or listening test.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import subprocess
import numpy as np
import soundfile as sf
from scipy import signal

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
FPS = 30
SEARCH = round(.15 * SR)


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def probe(path):
    p = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)],
                       check=True, capture_output=True, text=True, encoding='utf8')
    return json.loads(p.stdout)


def decode_audio(path):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-xerror', '-err_detect', 'explode',
                        '-i', str(path), '-map', '0:a:0', '-vn', '-ar', str(SR), '-ac', '1',
                        '-f', 'f32le', '-c:a', 'pcm_f32le', 'pipe:1'], capture_output=True)
    if p.returncode:
        raise RuntimeError(p.stderr.decode('utf8', errors='replace')[-3000:])
    data = np.frombuffer(p.stdout, dtype='<f4').copy()
    if not len(data) or not np.isfinite(data).all():
        raise ValueError('Empty or non-finite decoded audio')
    return data


def correlate_window(reference, decoded, start, end, label, search=SEARCH):
    a, b = round(start * SR), round(end * SR)
    if a < search or b + search > len(decoded) or b > len(reference):
        raise ValueError('Correlation window not covered by both tracks: ' + label)
    ref = reference[a:b].astype(np.float64)
    ref -= ref.mean()
    if np.sqrt(np.mean(ref * ref)) < .0001:
        raise ValueError('Insufficient sound in correlation window: ' + label)
    observed = decoded[a-search:b+search].astype(np.float64)
    numerator = signal.correlate(observed, ref, mode='valid', method='fft')
    # Normalize each candidate independently; gain changes or AAC differences
    # must not bias the maximum toward a louder adjacent syllable.
    n = len(ref)
    summed = np.r_[0., np.cumsum(observed)]
    squared = np.r_[0., np.cumsum(observed * observed)]
    window_sum = summed[n:] - summed[:-n]
    energy = squared[n:] - squared[:-n] - window_sum * window_sum / n
    denominator = np.sqrt(np.maximum(energy, 1e-20) * np.dot(ref, ref))
    correlations = numerator / denominator
    index = int(np.argmax(correlations))
    lag = index - search
    aligned = decoded[a+lag:b+lag].astype(np.float64)
    original = reference[a:b].astype(np.float64)
    gain = float(np.dot(aligned, original) / max(np.dot(original, original), 1e-20))
    correlation = float(correlations[index])
    residual = aligned - gain * original
    snr = float(10*np.log10(max(float(np.dot(gain*original, gain*original)), 1e-20) / max(float(np.dot(residual,residual)),1e-20)))
    return {'label':label, 'start':start, 'end':end, 'lagSamples':lag, 'lagSeconds':lag/SR,
            'lagFramesAt30FPS':lag/SR*FPS, 'normalizedCorrelation':correlation,
            'alignedGainDb':float(20*np.log10(max(abs(gain),1e-12))), 'alignedGain':gain,
            'codecResidualSNRDb':snr, 'searchLimitSeconds':search/SR,
            'searchEdgeHit':index in [0,len(correlations)-1],
            'passed':abs(lag)<=SR/FPS and correlation>=.90 and 0<index<len(correlations)-1}


def tail_energy(reference, decoded, ending):
    lag, gain = ending['lagSamples'], max(ending['alignedGain'], 1e-9)
    lo, hi = max(0, len(reference) - 8*SR), len(reference)
    ref = reference[lo:hi]
    observed = np.zeros(len(ref), dtype=np.float32)
    a, b = max(0,lo+lag), min(len(decoded),hi+lag)
    if b > a:
        destination = a-(lo+lag)
        observed[destination:destination+b-a] = decoded[a:b]/gain
    block = round(.02*SR)
    n = len(ref)//block
    rp = np.mean(ref[:n*block].reshape(n,block).astype(np.float64)**2,axis=1)
    op = np.mean(observed[:n*block].reshape(n,block).astype(np.float64)**2,axis=1)
    # Only audible reference blocks are tested. Codec noise during intentional
    # fade-to-silence is not reported as restored speech or as damage.
    meaningful = rp > 10**(-55/10)
    ratios = 10*np.log10(np.maximum(op,1e-20)/np.maximum(rp,1e-20))
    losses = np.flatnonzero(meaningful & (ratios < -6))
    groups = []
    for i in losses:
        if groups and i == groups[-1][-1]+1:
            groups[-1].append(int(i))
        else:
            groups.append([int(i)])
    sustained = [{'start':lo/SR+g[0]*.02,'end':lo/SR+(g[-1]+1)*.02,
                  'minimumEnergyChangeDb':float(np.min(ratios[g]))} for g in groups if len(g)>=3]
    last_ref = np.flatnonzero(rp > 10**(-60/10))
    last_observed = np.flatnonzero(op > 10**(-60/10))
    ref_end = lo/SR + (int(last_ref[-1])+1)*.02 if len(last_ref) else None
    obs_end = lo/SR + (int(last_observed[-1])+1)*.02 if len(last_observed) else None
    tail_early = ref_end-obs_end if ref_end is not None and obs_end is not None else None
    return {'windowStart':lo/SR,'windowEnd':hi/SR,'alignedUsingLagSamples':lag,
            'gainCompensation':gain,'blockSeconds':.02,'referenceGateDbFS':-55,
            'meaningfulReferenceBlocks':int(meaningful.sum()), 'lossThresholdDb':-6,
            'sustainedLossIntervalsOver60ms':sustained,
            'lastReferenceAboveMinus60dBBlockEnd':ref_end,'lastDecodedAboveMinus60dBBlockEnd':obs_end,
            'decodedTailEarlierBySeconds':tail_early,
            'passed':bool(meaningful.any()) and not sustained and tail_early is not None and tail_early<=.06}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('mp4', type=Path)
    ap.add_argument('--out', type=Path, required=True, help='JSON report destination')
    ap.add_argument('--master', type=Path, default=ROOT/'public/audio/episode01-mix-v8.wav')
    ap.add_argument('--audio-report', type=Path, default=ROOT/'work/audio-v8/audio-v8-report.json')
    args = ap.parse_args()
    film, master, out = args.mp4.resolve(), args.master.resolve(), args.out.resolve()
    if not film.is_file() or not master.is_file():
        raise FileNotFoundError('Final film and PCM master must exist; this tool does not wait for rendering')
    if out in [film,master]:
        raise ValueError('Report must not overwrite an input')
    out.parent.mkdir(parents=True, exist_ok=True)
    report = {'schema':'marine-final-aac-sync-v8','version':'v8','created':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'film':{'path':str(film)},'master':{'path':str(master)},
              'method':'AAC decoded with FFmpeg including skip-sample metadata; gain-normalized waveform correlation in ±0.15 s windows.',
              'limits':'AAC and final loudness mastering change waveforms. This is numerical time/energy validation, not sample identity, ASR, pronunciation or subjective listening.',
              'subjectiveListeningChecked':False,'actualFullNormalSpeedViewing':False,'passed':False,'error':None}
    try:
        info = probe(film)
        au = next(s for s in info['streams'] if s['codec_type']=='audio')
        video = next(s for s in info['streams'] if s['codec_type']=='video')
        if au['codec_name'] != 'aac':
            raise ValueError('Expected the final AAC audio stream')
        ref, sr = sf.read(master,dtype='float32',always_2d=True)
        if sr != SR:
            raise ValueError('Approved PCM master must be 48 kHz')
        ref = ref.mean(axis=1)
        decoded = decode_audio(film)
        master_hash = sha(master)
        approved = json.loads(args.audio_report.read_text(encoding='utf-8-sig'))
        expected_hash = approved['outputs']['master']['sha256']
        if master_hash != expected_hash:
            raise ValueError('Master does not match the approved audio report SHA256')
        duration = len(ref)/SR
        windows = [(2.,8.,'opening'), (duration*.49,duration*.49+6.,'middle')]
        for index, interval in enumerate(approved.get('underwaterIntervals', [])):
            start = interval['start'] + .4
            end = min(interval['end'] - .4, start + 5.)
            if end - start >= .8:
                windows.append((start,end,f'underwater-{index+1}'))
        windows.append((max(1.,duration-8.),duration-.2,'ending'))
        results = [correlate_window(ref,decoded,a,b,label) for a,b,label in windows]
        energy = tail_energy(ref,decoded,results[-1])
        start_delta = float(au.get('start_time',0))-float(video.get('start_time',0))
        stream_duration_delta = abs(float(au.get('duration',0))-float(video.get('duration',0)))
        # AAC may decode its final padded block; the declared audio/video
        # duration must still agree, and decoded samples must cover the source.
        decoded_duration_delta = (len(decoded)-len(ref))/SR
        checks = {'masterHashMatchesAudioReport':master_hash==expected_hash,
                  'aacCodec':True,'allWindowCorrelationsPass':all(x['passed'] for x in results),
                  'streamStartOffsetWithinOneFrame':abs(start_delta)<=1/FPS,
                  'streamDurationDeltaWithinOneFrame':stream_duration_delta<=1/FPS,
                  'decodedSampleCoverage':-1/FPS<=decoded_duration_delta<=.10,
                  'tailEnergyPreserved':energy['passed']}
        report.update({'film':{'path':str(film),'sha256':sha(film)},
                       'master':{'path':str(master),'sha256':master_hash,'samples':len(ref),'duration':duration},
                       'audioStream':au,'videoTiming':{k:video.get(k) for k in ['duration','start_time','r_frame_rate','nb_frames']},
                       'decodedSamples':len(decoded),'decodedDurationDeltaSec':decoded_duration_delta,
                       'audioMinusVideoStartSec':start_delta,'streamDurationDeltaSec':stream_duration_delta,
                       'windows':results,'tailEnergy':energy,'checks':checks,'passed':all(checks.values()),
                       'lagConvention':'Positive lag means decoded AAC content occurs later than PCM master.'})
    except Exception as e:
        report['error'] = str(e)
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'report':str(out),'passed':report['passed'],'error':report['error'],
                      'windows':report.get('windows',[]),'tailEnergy':report.get('tailEnergy')},ensure_ascii=False,indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
