"""Mix a licensed piano/strings score below the short-take narration."""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ROOT=Path(__file__).resolve().parents[1]
TL=ROOT/'src/nobel2026/timeline-v4.json'
AUDIO=ROOT/'public/nobel2026/audio-v4'
TRACK=ROOT/'public/nobel2026/music-v4/AKindOfHope.mp3'
SR=48000


def sha(path:Path)->str:return hashlib.sha256(path.read_bytes()).hexdigest()


def ease(t:np.ndarray)->np.ndarray:
    t=np.clip(t,0,1)
    return t*t*(3-2*t)


def main()->None:
    timeline=json.loads(TL.read_text(encoding='utf-8'))
    samples=int(timeline['duration']*SR/timeline['fps'])
    voice,vs=sf.read(AUDIO/'voice.wav',dtype='float32',always_2d=True)
    if vs!=SR or len(voice)!=samples:raise RuntimeError('voice/timeline length mismatch')
    bed,bs=sf.read(TRACK,dtype='float32',always_2d=True)
    if bs!=SR:
        from math import gcd
        g=gcd(bs,SR);bed=resample_poly(bed,SR//g,bs//g,axis=0).astype(np.float32)
    if len(bed)<samples:raise RuntimeError('licensed score is shorter than V4 film')
    bed=bed[:samples].copy()

    # One continuous musical performance. Short pauses between speech takes do
    # not trigger a gain rebound; the coda rises slowly to let the melody land.
    gain=np.full(samples,.35,dtype=np.float32)
    for clip in timeline['clips']:
        a=max(0,int((clip['start']/30-.10)*SR))
        b=min(samples,int((clip['start']/30+clip['asrSpeechEnd']+.42)*SR))
        gain[a:b]=.12
    # Smooth the entire control envelope, including adjacent narration pieces.
    from scipy.ndimage import uniform_filter1d
    # A 16 ms Gaussian over millions of samples is needlessly expensive and
    # scipy's direct kernel becomes prohibitively slow at the desired 160 ms.
    # Two box passes make a smooth, deterministic half-second duck envelope in
    # linear time, with no per-word pumping or sharp gain edges.
    gain=uniform_filter1d(gain,size=int(.24*SR)|1,mode='nearest')
    gain=uniform_filter1d(gain,size=int(.24*SR)|1,mode='nearest')
    coda=next(s for s in timeline['scenes'] if s['id']=='references')['start']/30
    t=np.arange(samples,dtype=np.float32)/SR
    rise=ease((t-(coda-1.8))/2.8)
    gain=gain*(1-rise)+.68*rise
    gain*=ease(t/2.0)*ease((samples/SR-t)/3.4)
    music=bed*gain[:,None]
    music_file=AUDIO/'music.wav'
    sf.write(music_file,music,SR,subtype='PCM_24')
    pre=voice+music
    premaster=AUDIO/'premaster.wav';sf.write(premaster,pre,SR,subtype='PCM_24')
    final=AUDIO/'master.wav'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(premaster),
                    '-af','loudnorm=I=-16:LRA=8:TP=-1.2:dual_mono=true',
                    '-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(final)],check=True)
    record={
      'version':'nobel2026-v4','track':'A Kind Of Hope','composer':'Scott Buckley',
      'trackURL':'https://www.scottbuckley.com.au/library/a-kind-of-hope/',
      'fileURL':'https://www.scottbuckley.com.au/library/wp-content/uploads/2022/10/AKindOfHope.mp3',
      'license':'Creative Commons Attribution 4.0 International (CC BY 4.0)',
      'requiredCredit':"'A Kind Of Hope' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
      'trackSHA256':sha(TRACK),'voiceSHA256':sha(AUDIO/'voice.wav'),
      'musicSHA256':sha(music_file),'masterSHA256':sha(final),
      'mix':'continuous piano/strings cue; frame-aligned smooth voice ducking; no noise generator',
      'activeSpeechMusicGain':.12,'codaMusicGain':.68,
      'durationSeconds':samples/SR,
    }
    path=ROOT/'research/nobel2026/v4/music-license-and-mix.json'
    path.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'delivery/nobel2026_v4').mkdir(parents=True,exist_ok=True)
    (ROOT/'delivery/nobel2026_v4/music-credit.txt').write_text(
        record['requiredCredit']+'\n'+record['trackURL']+'\n',encoding='utf-8')
    print(final)


if __name__=='__main__':main()
