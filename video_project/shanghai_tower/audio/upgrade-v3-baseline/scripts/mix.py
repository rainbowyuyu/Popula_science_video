"""Measured frame timing, original sampled score, gentle speech ducking and two-pass master."""
from pathlib import Path
import argparse, hashlib, json, math, re, subprocess,sys
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from voice import read,save,sha
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'audio'))
from score import compose,TITLE,BPM,SEED
SR=48000;FPS=30;SAMPLES_PER_FRAME=1600

def measure(path):
    p=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    return json.loads(re.search(r'\{\s*"input_i"[\s\S]*?\}',p.stderr).group())

def prepare(keep_slots=False):
    story=read(ROOT/'docs/story.json');clips=[];captions=[];sections=[];cursor=12;placements=[]
    prior={r['id']:r for r in read(ROOT/'public/timeline.json')['clips']} if keep_slots else {}
    for row in story['shots']:
        if not row.get('text','').strip():continue
        take=read(ROOT/'audio/takes'/f"{row['id']}.json");path=ROOT/take['processed'];info=sf.info(path)
        if take['ttsText']!=row.get('ttsText',row['text']):raise ValueError('Stale voice '+row['id'])
        if info.samplerate!=SR or sha(path)!=take['sha256']:raise ValueError('Voice source changed '+row['id'])
        voiceframes=math.ceil(info.frames/SAMPLES_PER_FRAME)
        # Five frames (0.167 s) following each complete take, never stretched.
        start=cursor;end=start+voiceframes+5
        if keep_slots:
            start=prior[row['id']]['start'];end=prior[row['id']]['end']
            if voiceframes+3>end-start:raise ValueError('Replacement does not fit protected slot '+row['id'])
        clip={**row,'start':start,'end':end,'duration':end-start,'startSeconds':start/FPS,'endSeconds':end/FPS,
              'voiceEndSeconds':start/FPS+info.duration,'voiceDurationSeconds':info.duration,'audioSHA256':take['sha256'],'audio':take['processed'].replace('public/','')}
        clips.append(clip)
        # Captions follow each sentence. Fine alignment is added by qc.py when available.
        captions.append(dict(id=row['id'],text=row.get('caption',row['text']),start=start,end=start+voiceframes))
        sid=row.get('section','story')
        if sections and sections[-1]['id']==sid:sections[-1]['end']=end
        else:sections.append(dict(id=sid,start=start,end=end))
        placements.append(dict(id=row['id'],startSample=start*SAMPLES_PER_FRAME,samples=info.frames,endSample=start*SAMPLES_PER_FRAME+info.frames,placementErrorSamples=0))
        cursor=end
    outroStart=cursor;outroFrames=270;duration=cursor+outroFrames
    sections.append(dict(id='references',start=outroStart,end=duration))
    timeline=dict(fps=FPS,duration=duration,durationFrames=duration,durationSeconds=duration/FPS,clips=clips,captions=captions,
        sections=sections,draft=False,voiceSpeedFactor=1,outro=dict(start=outroStart,end=duration,duration=outroFrames))
    save(ROOT/'public/timeline.json',timeline);save(ROOT/'src/timeline.json',timeline)
    voice=np.zeros(duration*SAMPLES_PER_FRAME,np.float32)
    for c,p in zip(clips,placements):
        w,sr=sf.read(ROOT/'public'/c['audio'],dtype='float32');voice[p['startSample']:p['endSample']]=w
    sf.write(ROOT/'public/narration.wav',voice,SR,subtype='PCM_24')
    save(ROOT/'audio/placements.json',dict(timelineSHA256=sha(ROOT/'public/timeline.json'),sentences=placements,totalSamples=len(voice),voiceSeconds=sum(c['voiceDurationSeconds'] for c in clips),silencePolicy='0.4s lead; 5-frame inter-take gap; 9s references tail; unmodified waveform durations'))
    print('TIMELINE',duration/FPS,'seconds',len(clips),'clips',flush=True)
    return timeline,voice

def mix(reuse_score=False):
    tl=read(ROOT/'public/timeline.json');n=tl['duration']*SAMPLES_PER_FRAME
    voice,sr=sf.read(ROOT/'public/narration.wav',dtype='float32');assert len(voice)==n and sr==SR
    source=ROOT/'audio/music-original.wav'
    if reuse_score:
        music,rate=sf.read(source,dtype='float32',always_2d=True)
        assert len(music)==n and rate==SR
    else:
        music=compose(n/SR,SR);sf.write(source,music,SR,subtype='PCM_24')
    # Match the bed to 18 dB below active speech globally, then keep sentence
    # gain steady. Silence between syllables must not make the music pump.
    hop=480;v=voice[:len(voice)//hop*hop].reshape(-1,hop);rms=np.sqrt(np.mean(v*v,axis=1))
    active=rms>max(.003,float(rms.max())*.055)
    vrms=float(np.sqrt(np.mean(v[active].astype(np.float64)**2)))
    mrms=float(np.sqrt(np.mean(music.astype(np.float64)**2)))
    music*=vrms*10**(-18/20)/max(mrms,1e-12)
    control=np.full(math.ceil(n/hop),1.65,np.float32)
    for c in tl['clips']:
        a=max(0,round((c['start']/FPS-.1)*SR/hop));b=min(len(control),math.ceil((c['end']/FPS+.55)*SR/hop))
        control[a:b]=1
    control=gaussian_filter1d(control,30,mode='nearest')
    gain=np.interp(np.arange(n)/hop,np.arange(len(control)),control).astype(np.float32)
    music*=gain[:,None];sf.write(ROOT/'public/music.wav',music,SR,subtype='PCM_24')
    pre=ROOT/'audio/premaster.wav';sf.write(pre,music+voice[:,None],SR,subtype='PCM_24')
    m=measure(pre)
    filt=(f"loudnorm=I=-15:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true:print_format=none,aresample={SR},apad=whole_len={n},atrim=end_sample={n}")
    master=ROOT/'public/master.wav'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(pre),'-af',filt,'-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(master)],check=True)
    measurement=measure(master);assert sf.info(master).frames==n
    # Comparison preview retains equal raw/clean loudness; full original takes remain untouched.
    first=tl['clips'][0];take=read(ROOT/'audio/takes'/f"{first['id']}.json")
    for name,path in [('raw',ROOT/take['raw']),('processed',ROOT/take['processed'])]:
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(path),'-af','loudnorm=I=-19:TP=-2:LRA=11','-ar',str(SR),'-c:a','pcm_s24le',str(ROOT/'audio'/f'AB-{name}.wav')],check=True)
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-t','35','-c:a','pcm_s24le',str(ROOT/'audio/preview-with-music.wav')],check=True)
    # AAC encode/decode preview detects intersample overs without altering master.
    aac=ROOT/'audio/master-aac-check.m4a'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','aac','-b:a','320k',str(aac)],check=True)
    aacm=measure(aac)
    musicactive=music[:len(active)*hop].reshape(-1,hop,2)[active]
    musicrms=float(np.sqrt(np.mean(musicactive.astype(np.float64)**2)))
    requested_path=ROOT/'audio/requested-bgm/availability.json'
    requested=read(requested_path) if requested_path.exists() else None
    pending=bool(requested and not requested.get('audioDownloaded'))
    save(ROOT/'research/audio-report.json',dict(title=TITLE,bpm=BPM,seed=SEED,durationSeconds=n/SR,sampleRate=SR,
        totalSamples=n,voiceSpeedFactor=1,subjectiveListeningChecked=False,masterMeasurement=measurement,aacMeasurement=aacm,
        premasterMeasurement=m,voiceOverMusicActiveDB=20*np.log10(vrms/max(musicrms,1e-12)),
        hashes={name:sha(ROOT/'public'/name) for name in ['narration.wav','music.wav','master.wav','timeline.json']},
        originalScoreSHA256=sha(source),musicSource=('Existing Shanghai Tower original composition retained for working preview; requested Douyin track has not been acquired' if pending else 'Original Shanghai Tower composition; VSCO 2 CE CC0 instrument samples'),
        musicReplacementPending=pending,requestedMusic=requested))
    print('MASTER',n/SR,measurement,'AAC',aacm,flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['prepare','mix','all'],default='all',nargs='?')
    p.add_argument('--reuse-score',action='store_true');p.add_argument('--keep-slots',action='store_true');a=p.parse_args()
    if a.mode in ['prepare','all']:prepare(a.keep_slots)
    if a.mode in ['mix','all']:mix(a.reuse_score)
