from pathlib import Path
import json,math,time,sys,hashlib,subprocess,re
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from qc import caption_parts,map_times,chars,srt_time
from score import compose
R=Path(__file__).resolve().parents[1];SR=48000;FPS=60
def read(p):return json.loads(Path(p).read_text('utf8'))
def save(p,v):Path(p).parent.mkdir(parents=True,exist_ok=True);Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2),'utf8')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def ready(rows):
    for r in rows:
        tp=R/'audio/takes'/f"{r['id']}.json";ap=R/'audio/asr'/f"{r['id']}.json"
        if not tp.exists() or not ap.exists():return False
        t=read(tp);a=read(ap)
        if t['ttsText']!=r['ttsText'] or a['sourceSHA256']!=t['sha256']:return False
    return True
def main():
    story=read(R/'research/story.json');rows=[r for s in story['scenes'] for r in s['lines']]
    if '--watch' in sys.argv:
        while not ready(rows):time.sleep(8)
    elif not ready(rows):raise RuntimeError('Narration/alignment not ready')
    cursor=0;captions=[];placements=[];takes=[]
    for s in story['scenes']:
        s['start']=cursor;local=54 if s['id']=='hook' else 20;s['clips']=[]
        for row in s['lines']:
            take=read(R/'audio/takes'/f"{row['id']}.json");asr=read(R/'audio/asr'/f"{row['id']}.json")
            frames=math.ceil(take['duration']*FPS)
            clip={**row,'from':local,'frames':frames,'file':take['processed'].replace('public/',''),'audioSHA256':take['sha256']}
            s['clips'].append(clip);placements.append(dict(**clip,globalFrame=cursor+local))
            target,mapping,ratio=map_times(row['text'],asr['words'],take['duration'])
            offset=0;pieces=caption_parts(row['text'],22)
            entries=[]
            for j,p in enumerate(pieces):
                length=len(chars(p));a=mapping[offset][0];b=mapping[offset+length-1][1];offset+=length
                entries.append(dict(id=f"{row['id']}-c{j}",text=p,startMs=round((cursor+local)/FPS*1000+a*1000),endMs=round((cursor+local)/FPS*1000+b*1000+70)))
            for a,b in zip(entries,entries[1:]):a['endMs']=min(a['endMs'],b['startMs'])
            captions.extend(entries);takes.append(take)
            local+=frames+15
        s['duration']=local+(20 if s['id']!='close' else 8*FPS)
        cursor+=s['duration']
    story.update(duration=cursor,fps=FPS,overlap=0)
    save(R/'src/beso-story.json',story);save(R/'src/beso-captions.json',captions)
    save(R/'audio/placements.json',placements)
    (R/'delivery').mkdir(exist_ok=True)
    srt='\n\n'.join(f"{i+1}\n{srt_time(c['startMs']*FPS/1000,FPS)} --> {srt_time(c['endMs']*FPS/1000,FPS)}\n{c['text']}" for i,c in enumerate(captions))+'\n'
    (R/'delivery/AI-Engineer-Research.zh.srt').write_text(srt,'utf-8-sig')
    seconds=cursor/FPS;n=round(seconds*SR);voice=np.zeros((n,2),np.float32);activity=np.zeros(n,np.float32)
    for p,take in zip(placements,takes):
        x,sr=sf.read(R/'public'/p['file'],always_2d=True,dtype='float32');assert sr==SR
        mono=x.mean(axis=1);block=960;rr=np.sqrt(np.mean(mono[:len(mono)//block*block].reshape(-1,block)**2,axis=1));mask=np.repeat(rr>max(.002,rr.max()*.06),block)
        active=mono[:len(mask)][mask]
        gain=min(10**(-20/20)/max(float(np.sqrt(np.mean(active**2))),1e-8),.69/max(float(np.abs(mono).max()),1e-8))
        x=np.repeat(mono[:,None],2,axis=1)*gain;at=round(p['globalFrame']/FPS*SR);count=min(len(x),n-at);voice[at:at+count]+=x[:count]
        activity[max(0,at-4800):min(n,at+count+12000)]=1
    audio=R/'public/audio';audio.mkdir(exist_ok=True)
    sf.write(audio/'narration.wav',voice,SR,subtype='PCM_24')
    music=compose(seconds)
    music*=10**(-31/20)/max(float(np.sqrt(np.mean(music**2))),1e-9)
    envelope=gaussian_filter1d(activity[::480],sigma=35)
    envelope=np.interp(np.arange(n),np.arange(len(envelope))*480,envelope)
    music*=np.power(10,(-7*envelope)/20)[:,None]
    sf.write(audio/'music.wav',music,SR,subtype='PCM_24')
    combined=voice+music;sf.write(audio/'premaster.wav',combined,SR,subtype='FLOAT')
    first=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(audio/'premaster.wav'),'-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    (R/'research/qa/loudness-first-pass.log').write_text(first.stderr,'utf8')
    stats=json.loads(first.stderr[first.stderr.rfind('{'):first.stderr.rfind('}')+1])
    filt=f"loudnorm=I=-16:TP=-1.5:LRA=8:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true:print_format=json"
    final=subprocess.run(['ffmpeg','-v','info','-y','-i',str(audio/'premaster.wav'),'-af',filt,'-ar',str(SR),'-c:a','pcm_s24le',str(audio/'master.wav')],capture_output=True,text=True,check=True)
    (R/'research/qa/loudness-final-pass.log').write_text(final.stderr,'utf8')
    mixed,_=sf.read(audio/'master.wav',dtype='float32',always_2d=True)
    mask=activity>.5;vd=20*np.log10(max(np.sqrt(np.mean(voice[mask]**2)),1e-9));md=20*np.log10(max(np.sqrt(np.mean(music[mask]**2)),1e-9))
    save(R/'research/qa/audio-final.json',dict(seconds=seconds,clips=len(placements),captions=len(captions),timelineSHA256=sha(R/'src/beso-story.json'),masterSHA256=sha(audio/'master.wav'),speechOverMusicDb=float(vd-md),peak=float(np.abs(mixed).max()),loudnessFirstPass=stats,subjectiveListeningChecked=False,pronunciationListeningVerified=False,alignment='Local Whisper small, original text mapped to word timestamps',noTimeStretch=True))
    # Separate short pronunciation preview to make the risky names reviewable.
    selected=[p for p in placements if any(term in p['text'] for term in ['Zwind','图强号','BESO'])]
    samples=[]
    for p in selected:
        x,_=sf.read(R/'public'/p['file'],always_2d=True,dtype='float32');samples.extend([x,np.zeros((SR//2,x.shape[1]),np.float32)])
    if samples:sf.write(R/'delivery/专名读音检查.wav',np.concatenate(samples),SR,subtype='PCM_24')
    print('TIMELINE_SECONDS',seconds,'CAPTIONS',len(captions),'VOICE_MUSIC_DB',float(vd-md),flush=True)
if __name__=='__main__':main()
