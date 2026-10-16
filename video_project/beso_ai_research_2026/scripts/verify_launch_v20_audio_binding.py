"""Verify that final v20 MP4 carries the approved speech-forward canonical mix.

Measures sample alignment/correlation against the WAV and exact decoded-sample
identity against its AAC check, so non-silent music alone cannot pass as speech.
Does not render or modify video. Run after final story-duration mux.
"""
from pathlib import Path
import argparse, datetime, hashlib, json, re, subprocess, sys
import numpy as np
import soundfile as sf
from scipy.signal import correlate, correlation_lags

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'work/v20-audio'
SR=48000

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(path):return json.loads(Path(path).read_text('utf-8-sig'))
def run(args):
    p=subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace')
    if p.returncode:raise RuntimeError(p.stderr[-4000:])
    return p
def load(path):
    a,sr=sf.read(path,always_2d=True,dtype='float32')
    assert sr==SR
    return a
def corr(a,b):
    a=a.reshape(-1).astype(np.float64);b=b.reshape(-1).astype(np.float64)
    return float(np.dot(a,b)/max(1e-12,np.linalg.norm(a)*np.linalg.norm(b)))

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--video',type=Path,default=ROOT/'output/ai_engineer_launch_v20_1080p60.mp4')
    ap.add_argument('--report',type=Path,default=ROOT/'research/qa/v20-audio-final-binding.json')
    args=ap.parse_args()
    args.report=args.report.resolve()
    if not args.report.is_relative_to(ROOT) or not re.search(r'(?:^|[\\/_-])v20(?:[\\/_.-]|$)',str(args.report),re.I) or re.search(r'(?:^|[\\/_-])v(?:[1-9]|1[0-9])(?:[\\/_.-]|$)',str(args.report),re.I):
        raise ValueError('Audio QA report must stay in this project and use only the v20 version token')
    WORK.mkdir(parents=True,exist_ok=True)
    manifest=read(ROOT/'research/qa/v20-audio-master.json')
    master=ROOT/'public/audio/launch-v20-master.wav'
    expected=next(r['sha256'] for r in manifest['outputs'] if r['path'].endswith('launch-v20-master.wav'))
    if sha(master)!=expected:raise RuntimeError('Canonical master changed after audio approval')
    refAAC=ROOT/manifest['mix']['AAC']['path']
    if sha(refAAC)!=manifest['mix']['AAC']['sha256']:raise RuntimeError('AAC reference changed after verification')
    for src,dst in [(args.video,WORK/'final-video-decoded.wav'),(refAAC,WORK/'approved-aac-decoded.wav')]:
        run(['ffmpeg','-v','error','-y','-i',str(src),'-map','0:a:0','-ar',str(SR),'-ac','2','-c:a','pcm_f32le',str(dst)])
    final=load(WORK/'final-video-decoded.wav')
    reference=load(WORK/'approved-aac-decoded.wav')
    canonical=load(master)
    story=read(ROOT/'src/launch-v20-story.json')
    N=round(story['duration']/story['fps']*SR)
    assert len(final)>=N and final.shape[1]==2
    # AAC may have harmless padding beyond the intended exact story-duration track.
    f=final[:N];m=canonical[:N];r=reference[:N]
    exactAAC=(f.shape==r.shape and np.array_equal(f,r))
    monoFinal=f.mean(axis=1);monoMaster=m.mean(axis=1)
    stride=8
    c=correlate(monoFinal[::stride],monoMaster[::stride],mode='full',method='fft')
    lags=correlation_lags(len(monoFinal[::stride]),len(monoMaster[::stride]))
    allowed=np.abs(lags)<=SR*.04/stride
    lag=int(lags[allowed][np.argmax(c[allowed])])*stride
    rows=[]
    for place in manifest['voice']['completeTakePlacements']:
        a=place['startSample'];b=a+place['sampleCount']
        rows.append({'id':place['id'],'startSample':a,'sampleCount':b-a,'canonicalMixCorrelation':corr(f[a:b],m[a:b]),'approvedAACCorrelation':corr(f[a:b],r[a:b]),'finalRMSDBFS':float(20*np.log10(np.sqrt(np.mean(f[a:b]**2))+1e-12))})
    whole=corr(f,m)
    asr=read(ROOT/'research/qa/v20-audio-final-asr.json')
    inheritedASR=exactAAC and asr['sourceAACSHA256']==sha(refAAC) and asr['passed']
    report={'schema':'v20-final-mp4-audio-binding-v1','checkedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'video':str(args.video.resolve()),'videoSHA256':sha(args.video),'canonicalMaster':str(master),'canonicalMasterSHA256':sha(master),'canonicalMixCorrelation':whole,'measuredAudioDelaySamples':lag,'sampleRate':SR,'expectedSampleCount':N,'decodedSampleCount':len(final),'exactDecodedAACIdentity':exactAAC,'approvedAACSHA256':sha(refAAC),'phraseChecks':rows,'minimumPhraseCorrelation':min(x['canonicalMixCorrelation'] for x in rows),'finalASREvidenceApplies':inheritedASR,'ASR':{'path':'research/qa/v20-audio-final-asr.json','ratio':asr['ratio'],'reason':'Decoded PCM sample identity to independently transcribed approved AAC' if inheritedASR else 'No automatic transfer of ASR claim to different audio'},'subjectiveListeningChecked':False,'manualABListeningPerformed':False}
    report['passed']=whole>.995 and abs(lag)<=48 and min(x['canonicalMixCorrelation'] for x in rows)>.985 and inheritedASR
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps({k:report[k] for k in ['passed','canonicalMixCorrelation','measuredAudioDelaySamples','exactDecodedAACIdentity','minimumPhraseCorrelation','finalASREvidenceApplies']},ensure_ascii=False),flush=True)
    return 0 if report['passed'] else 1

if __name__=='__main__':sys.exit(main())
