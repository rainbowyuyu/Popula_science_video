"""Bounded AAC-to-master sync check; never decode/read the whole final MP4.

Decode five short windows and compare each to a padded seek of the frozen WAV.
Positive offset means the encoded audio is delayed relative to the source.
"""
import argparse,json,subprocess,hashlib
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import correlate,resample_poly,butter,sosfilt

ROOT=Path(__file__).resolve().parents[1]
SR=48000
ANALYSIS_SR=12000

def run(args):
    return subprocess.run(args,capture_output=True,check=True)

def probe(path):
    return json.loads(run(['ffprobe','-v','error','-show_entries',
        'stream=codec_type,codec_name,sample_rate,channels,start_time,duration,avg_frame_rate,width,height,nb_frames:format=duration,size',
        '-of','json',str(path)]).stdout)

def decode(path,start,duration):
    # Input seeking uses MP4 indexing; accurate seek discards pre-roll samples.
    # stdout is only duration*48000*2*4 bytes, independent of video file size.
    r=run(['ffmpeg','-v','error','-ss',f'{start:.9f}','-i',str(path),'-t',f'{duration:.9f}',
        '-map','0:a:0','-vn','-sn','-dn','-ar',str(SR),'-ac','2','-f','f32le','pipe:1'])
    y=np.frombuffer(r.stdout,dtype='<f4').reshape(-1,2)
    if len(y)<round(duration*SR)-SR//100:raise RuntimeError('Encoded audio window is incomplete')
    return y

def source(path,start,duration):
    with sf.SoundFile(path) as f:
        assert f.samplerate==SR and f.channels==2
        f.seek(round(start*SR));return f.read(round(duration*SR),dtype='float32',always_2d=True)

def filtered(x):
    y=resample_poly(x,1,4,axis=0)
    return sosfilt(butter(3,[100,5300],btype='bandpass',fs=ANALYSIS_SR,output='sos'),y,axis=0)

def compare(path,master,label,start,length,padding=.2):
    # Avoid boundary/filter transients in the matching portion itself.
    y=filtered(decode(path,start,length));x=filtered(source(master,start-padding,length+2*padding))
    guard=round(.08*ANALYSIS_SR);ym=y[guard:-guard].mean(axis=1).astype(np.float64)
    xm=x.mean(axis=1).astype(np.float64);ym-=ym.mean();xm-=xm.mean()
    corr=correlate(xm,ym,mode='valid',method='fft');index=int(np.argmax(corr))
    matched=xm[index:index+len(ym)]
    coefficient=float(np.dot(matched,ym)/max(np.linalg.norm(matched)*np.linalg.norm(ym),1e-15))
    # At no delay, source matches after padding plus the excluded encoded guard.
    delay=(round(padding*ANALYSIS_SR)+guard-index)/ANALYSIS_SR
    stereo=[]
    for channel in range(2):
        xx=x[index:index+len(ym),channel].astype(np.float64);yy=y[guard:-guard,channel].astype(np.float64)
        xx-=xx.mean();yy-=yy.mean()
        stereo.append(float(np.dot(xx,yy)/max(np.linalg.norm(xx)*np.linalg.norm(yy),1e-15)))
    return {'id':label,'startSec':start,'durationSec':length,'decodedSamples':len(y)*4,
        'offsetSec':delay,'offsetSamples48k':round(delay*SR),'offsetFrames30fps':delay*30,
        'correlation':coefficient,'channelCorrelations':stereo,
        'passesOneFrame':abs(delay)<=1/30,'passesCorrelation':min(coefficient,*stereo)>=.95}

def main():
    p=argparse.ArgumentParser();p.add_argument('--video',type=Path,default=ROOT/'delivery/密码学_公开的传话_1080p.mp4')
    p.add_argument('--master',type=Path,default=ROOT/'public/audio/master.wav')
    p.add_argument('--output',type=Path,default=ROOT/'work/qa/av-sync.json');args=p.parse_args()
    timeline=json.loads((ROOT/'src/narration.json').read_text(encoding='utf8'));duration=timeline['durationSec']
    before=args.video.stat();metadata=probe(args.video);audio=next((s for s in metadata['streams'] if s['codec_type']=='audio'),None)
    if not audio or audio['codec_name']!='aac':raise RuntimeError('Final file does not contain encoded AAC yet')
    if abs(float(audio.get('duration',0))-duration)>1/30:raise RuntimeError('AAC duration does not match frozen master')
    arr=json.loads((ROOT/'work/audio/music-arrangement.json').read_text(encoding='utf8'))
    windows=[('opening',.6,8),('middle',duration/2-4,8)]
    windows.extend((f'music-loop-{i+1}',j['atSec']-4,8) for i,j in enumerate(arr['joins']))
    windows.append(('tail',duration-10.75,8))
    results=[compare(args.video,args.master,*w) for w in windows]
    after=args.video.stat()
    stable=before.st_size==after.st_size and before.st_mtime_ns==after.st_mtime_ns
    failures=[]
    if not stable:failures.append('Encoded file changed during bounded sync check')
    for row in results:
        if not row['passesOneFrame']:failures.append(row['id']+': offset exceeds one frame')
        if not row['passesCorrelation']:failures.append(row['id']+': low signal correlation')
    start=float(audio.get('start_time',0))
    if abs(start)>1/30:failures.append('Encoded audio PTS start exceeds one frame')
    report={'video':str(args.video),'fileBytes':after.st_size,'fileMtimeNs':after.st_mtime_ns,
        'master':str(args.master),'durationSec':duration,'frameToleranceSec':1/30,
        'audioMetadata':audio,'fileStableDuringCheck':stable,'analysisSampleRate':ANALYSIS_SR,
        'method':'Five bounded accurate-seek AAC windows correlated against padded master WAV seeks; no full MP4 read or decode',
        'decodedTotalSeconds':sum(w[2] for w in windows),'positiveOffsetMeaning':'encoded audio delayed relative to frozen source',
        'maximumAbsoluteOffsetSec':max(abs(r['offsetSec']) for r in results),
        'minimumCorrelation':min(min(r['correlation'],*r['channelCorrelations']) for r in results),
        'windows':results,'failures':failures,'passed':not failures,
        'limits':'Confirms encoded audio preservation and drift only; it does not verify semantic narration-to-visual alignment or subjective listening.'}
    args.output.parent.mkdir(exist_ok=True,parents=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2));assert not failures,failures

if __name__=='__main__':main()
