"""Protect each full raw source and compose natural, frame-aligned voice timing."""
import sys,json,re,argparse,math
import numpy as np
import soundfile as sf
from audio_common import ROOT,OUT,TTS,SR,FPS,story,sha,save
sys.path.insert(0,str(TTS))
from broadcast_voice import master_voice

def caption_parts(text):
    # Spoken punctuation controls phrasing; it need not be printed as stray
    # marks at subtitle edges. Retain only semantic text and internal pauses.
    parts=[]
    for phrase in re.split(r'[，。！？；：]',text):
        phrase=phrase.strip(' \n\t“”"‘’、，。！？；：')
        if not phrase:continue
        if len(phrase)>22:
            raise ValueError('Add a semantic clause boundary before synthesis: '+phrase)
        if parts and len(parts[-1])<7 and len(parts[-1])+len(phrase)+1<=22:
            parts[-1]+='，'+phrase
        else:parts.append(phrase)
    return parts

def prepare(s):
    for name in ('clean','protected','processing'):(OUT/name).mkdir(parents=True,exist_ok=True)
    ledger=json.loads((OUT/'voice-generation.json').read_text(encoding='utf8'));rows=[]
    for cue in s['cues']:
        raw=OUT/'raw'/f"{cue['id']}.wav";clean=OUT/'clean'/raw.name;rp=OUT/'processing'/f"{cue['id']}.json"
        if not raw.exists() or cue['id'] not in ledger:continue
        if ledger[cue['id']]['text']!=cue['spokenText']:raise RuntimeError('Outdated spoken source: '+cue['id'])
        h=sha(raw);old=json.loads(rp.read_text(encoding='utf8')) if rp.exists() else {}
        if not(clean.exists() and old.get('originalRawSha256')==h and old.get('outputSha256')==sha(clean)):
            x,sr=sf.read(raw,dtype='float32');protected=OUT/'protected'/raw.name
            sf.write(protected,np.pad(x,(round(.08*sr),round(.16*sr))),sr,subtype='PCM_24')
            r=master_voice(protected,clean)
            r.update(originalRawSha256=h,originalRawFile=raw.relative_to(ROOT).as_posix(),
                     explicitHeadProtectionSec=.08,explicitTailProtectionSec=.16,rawDurationSec=len(x)/sr)
            save(rp,r)
        info=sf.info(clean);assert info.samplerate==SR and info.channels==1
        rows.append({**cue,'rawDurationSec':sf.info(raw).duration,'actualDurationSec':info.duration,
            'cleanSamples':info.frames,'audio':clean.relative_to(ROOT).as_posix(),'sha256':sha(clean)})
    return rows

def main():
    p=argparse.ArgumentParser();p.add_argument('--partial',action='store_true');p.add_argument('--natural',action='store_true');p.add_argument('--pad-to-target',action='store_true');a=p.parse_args()
    s=story();rows=prepare(s)
    if a.partial:
        print('Clean sources prepared:',len(rows),'/',len(s['cues']));return
    if len(rows)!=len(s['cues']):raise RuntimeError('Incomplete sources')
    spf=SR//FPS;head=round(s.get('openingSec',.6)*FPS)
    natural=head+sum(math.ceil(c['cleanSamples']/spf)+round(c.get('pauseAfterSec',.28)*FPS) for c in rows)+round(s.get('closingSec',7)*FPS)
    target=round(s.get('targetDurationSec',300)*FPS)
    # Preserve every sentence; reserve a few observation beats only when natural speech is shorter.
    extra=max(0,target-natural) if a.pad_to_target and not a.natural else 0
    if extra>18*FPS:extra=0
    ends=[i for i,c in enumerate(rows) if i==len(rows)-1 or c['scene']!=rows[i+1]['scene']]
    holds={i:extra//len(ends)+(j<extra%len(ends)) for j,i in enumerate(ends)}
    cursor=head;caps=[];groups=[]
    for i,c in enumerate(rows):
        c['startFrame']=cursor;c['endFrame']=cursor+math.ceil(c['cleanSamples']/spf)
        c['startSec']=c['start']=cursor/FPS;c['endSec']=c['end']=c['endFrame']/FPS
        c['startSample']=cursor*spf;c['endSample']=c['startSample']+c['cleanSamples']
        if not groups or groups[-1]['id']!=c['scene']:groups.append({'id':c['scene'],'startFrame':cursor,'startSec':cursor/FPS,'cueIds':[]})
        groups[-1]['cueIds'].append(c['id']);groups[-1]['endFrame']=c['endFrame'];groups[-1]['endSec']=c['end']
        chunks=caption_parts(c['text']);total=sum(len(x) for x in chunks);running=0
        for k,t in enumerate(chunks):
            aa=cursor+round((c['endFrame']-cursor)*running/total);running+=len(t);bb=cursor+round((c['endFrame']-cursor)*running/total)
            caps.append({'id':f"{c['id']}-{k+1}",'cueId':c['id'],'text':t,'startFrame':aa,'endFrame':bb,'start':aa/FPS,'end':bb/FPS,'timingMethod':'proportional fallback; ASR pending'})
        cursor=c['endFrame']+round(c.get('pauseAfterSec',.28)*FPS)+holds.get(i,0)
    frames=cursor+round(s.get('closingSec',7)*FPS);duration=frames/FPS
    mix=np.zeros(frames*spf,np.float32)
    for c in rows:
        x,sr=sf.read(ROOT/c['audio'],dtype='float32');mix[c['startSample']:c['endSample']]=x
        assert np.array_equal(mix[c['startSample']:c['endSample']],x)
    sf.write(OUT/'narration.wav',mix,SR,subtype='PCM_24')
    narr={'title':s.get('title','密码学'),'fps':FPS,'durationFrames':frames,'durationSec':duration,'sampleRate':SR,
        'cues':rows,'groups':groups,'coda':{'startFrame':cursor,'startSec':cursor/FPS,'endFrame':frames},
        'sourceStorySha256':s['sourceStorySha256'],'timeStretch':False,'truncatedSpeech':False,'headProtectionSec':.08,'tailProtectionSec':.16}
    save(OUT/'narration.json',narr)
    save(OUT/'captions.json',{'fps':FPS,'cues':caps})
    print(json.dumps({'durationSec':duration,'durationFrames':frames,'rawVoiceSeconds':sum(c['rawDurationSec'] for c in rows),'cues':len(rows),'groups':groups},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
