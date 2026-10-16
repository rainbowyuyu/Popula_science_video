"""V8 source-audio assembly, cached ASR and monotonic caption alignment.

Unlike the previous greedy mapper, dynamic-programming edit alignment cannot
discard the rest of a cue after one recognition error. All replacements retain
the authored transcript, and interpolation/fallback status is explicitly saved.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import importlib.util
import numpy as np
import soundfile as sf
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT/'work/audio-v8'
PUBLIC = ROOT/'public/audio/v8'
GAP, CHAPTER_GAP, SR = .12, .22, 48000
SIMPLIFIED = OpenCC('t2s')

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def normalize(text):
    return re.sub(r'[^a-z0-9\u4e00-\u9fff]', '', SIMPLIFIED.convert(text).lower())

def stamp(t):
    ms = round(t*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'

def pieces(text):
    initial = [x for x in re.split(r'(?<=[，。！？；：])',text) if x]
    # Explicit semantic breakpoints for the few long unpunctuated clauses.
    breaks = ['研制了','用来','在二零二四年','研究生能源装备','的公开研究方向','的那一部分',
              '的简化条件下','周围的土','可以减小','把传感器','获得了','来接住']
    out = []
    for item in initial:
        while len(item) > 22:
            candidates = [(item.find(b),b) for b in breaks if 7 <= item.find(b) <= 21]
            cut = max(candidates,key=lambda x:x[0])[0] if candidates else 20
            out.append(item[:cut]); item = item[cut:]
        if item:
            if out and len(item)<5 and len(out[-1]+item)<=22 and not out[-1].endswith(('。','？','！')):
                out[-1] += item
            else:
                out.append(item)
    merged=[]
    for part in out:
        if merged and not merged[-1].endswith(('。','？','！','；')) and len(merged[-1]+part)<=22:
            merged[-1]+=part
        else:
            merged.append(part)
    return merged

def align(target, words, duration):
    """Levenshtein alignment on normalized characters, then bounded interpolation."""
    observed, starts, ends = [], [], []
    for word in words:
        chars = normalize(word['word'])
        for j,ch in enumerate(chars):
            observed.append(ch)
            starts.append(word['start']+(word['end']-word['start'])*j/max(1,len(chars)))
            ends.append(word['start']+(word['end']-word['start'])*(j+1)/max(1,len(chars)))
    t, o = normalize(target), ''.join(observed)
    n,m = len(t),len(o)
    dp = np.zeros((n+1,m+1),dtype=np.int32)
    dp[:,0] = np.arange(n+1); dp[0,:] = np.arange(m+1)
    aliases = {'谷':'毂','举':'矩','细':'系'}
    def same(a,b): return a==b or aliases.get(a,a)==aliases.get(b,b)
    for i in range(1,n+1):
        for j in range(1,m+1):
            dp[i,j] = min(dp[i-1,j]+1,dp[i,j-1]+1,dp[i-1,j-1]+int(not same(t[i-1],o[j-1])))
    i,j = n,m
    anchors, edits = {},[]
    while i or j:
        if i and j and dp[i,j]==dp[i-1,j-1]+int(not same(t[i-1],o[j-1])):
            if same(t[i-1],o[j-1]): anchors[i-1] = j-1
            else: edits.append({'targetIndex':i-1,'target':t[i-1],'heard':o[j-1]})
            i-=1;j-=1
        elif i and dp[i,j]==dp[i-1,j]+1:
            edits.append({'targetIndex':i-1,'target':t[i-1],'heard':''});i-=1
        else:
            edits.append({'targetIndex':i,'target':'','heard':o[j-1]});j-=1
    coverage=len(anchors)/max(1,n)
    if coverage < .65 or len(anchors)<3:
        first = max(.06, starts[0] if starts else .08)
        last = min(duration-.10, ends[-1] if ends else duration-.16)
        cs = np.linspace(first,last,n+1)[:-1]
        ce = np.linspace(first,last,n+1)[1:]
        method='proportional fallback between ASR speech bounds; review required'
    else:
        keys=np.array(sorted(anchors))
        cs=np.interp(np.arange(n),keys,[starts[anchors[k]] for k in keys])
        ce=np.interp(np.arange(n),keys,[ends[anchors[k]] for k in keys])
        # Prefix/suffix gaps get bounded extension, never a jump to another cue.
        first,last=int(keys[0]),int(keys[-1])
        if first:
            cs[:first]=np.linspace(max(.04,cs[first]-.19*first),cs[first],first+1)[:-1]
            ce[:first]=cs[1:first+1]
        if last<n-1:
            cs[last+1:]=np.linspace(ce[last],min(duration-.12,ce[last]+.19*(n-last-1)),n-last)[1:]
            ce[last+1:]=np.minimum(duration-.10,cs[last+1:]+.15)
        method='Whisper-small word anchors + monotonic edit alignment; bounded interpolation'
    return cs,ce,{'coverage':coverage,'editDistance':int(dp[n,m]),'edits':list(reversed(edits)),
                 'targetNormalized':t,'asrNormalized':o,'method':method}

def master_available(story):
    spec=importlib.util.spec_from_file_location('broadcast_voice','D:/python_project/tts/broadcast_voice.py')
    master=importlib.util.module_from_spec(spec);spec.loader.exec_module(master)
    rawledger=WORK/'voice-ledger-raw.json'
    rows=json.loads(rawledger.read_text(encoding='utf8')) if rawledger.exists() else {}
    ledgerpath=WORK/'voice-ledger.json'
    ledger=json.loads(ledgerpath.read_text(encoding='utf8')) if ledgerpath.exists() else {}
    for cue in story['sentences']:
        ident=cue['id'];raw=WORK/'raw'/f'{ident}.wav';clean=WORK/'clean'/f'{ident}.wav';pub=PUBLIC/f'{ident}.wav'
        if not raw.exists(): continue
        if ledger.get(ident,{}).get('rawSha256')==sha(raw) and clean.exists() and pub.exists(): continue
        result=master.master_voice(raw,clean,WORK/'clean'/f'{ident}.json')
        shutil.copy2(clean,pub)
        ledger[ident]={**rows.get(ident,{}),'rawSha256':sha(raw),'cleanSha256':sha(clean),
            'raw':str(raw),'clean':str(clean),'audio':str(pub),'sampleRate':SR,
            'durationSec':result['output']['seconds'],'measuredLatencySamples':result['measuredLatencySamples'],
            'subjectiveListeningChecked':False}
        ledgerpath.write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf8')
        print('mastered',ident,ledger[ident]['durationSec'],flush=True)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--available',action='store_true');ap.add_argument('--integrate',action='store_true')
    args=ap.parse_args()
    for path in [PUBLIC,WORK/'clean',WORK/'asr']: path.mkdir(parents=True,exist_ok=True)
    story=json.loads((WORK/'story-v8-draft.json').read_text(encoding='utf8'))
    master_available(story)
    todo=[];asr={}
    for cue in story['sentences']:
        ident=cue['id'];wav=PUBLIC/f'{ident}.wav';cached=WORK/'asr'/f'{ident}.json'
        if not wav.exists():
            if args.available:continue
            raise FileNotFoundError(wav)
        item=json.loads(cached.read_text(encoding='utf8')) if cached.exists() else {}
        if item.get('sha256')==sha(wav):asr[ident]=item
        else:todo.append((cue,wav,cached))
    if todo:
        from faster_whisper import WhisperModel
        model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=4,local_files_only=True)
        for cue,wav,cached in todo:
            segs,_=model.transcribe(str(wav),language='zh',beam_size=5,condition_on_previous_text=False,word_timestamps=True,vad_filter=False)
            words=[]
            for seg in segs:
                words.extend({'word':w.word,'start':float(w.start),'end':float(w.end),'probability':float(w.probability)} for w in (seg.words or []))
            row={'id':cue['id'],'sha256':sha(wav),'asr':''.join(w['word'] for w in words),'words':words,'subjectiveListeningChecked':False}
            cached.write_text(json.dumps(row,ensure_ascii=False,indent=2),encoding='utf8');asr[cue['id']]=row
            print('ASR',cue['id'],row['asr'],flush=True)
    if len(asr)<len(story['sentences']):
        print('available processed',len(asr));return
    tracks=[];captions=[];cursor=0;last=None;reports=[]
    for cue in story['sentences']:
        ident=cue['id'];wav,sr=sf.read(PUBLIC/f'{ident}.wav',dtype='float32')
        if sr!=SR or wav.ndim!=1:raise ValueError(f'{ident}: must be mono 48k')
        if tracks:
            gap=CHAPTER_GAP if last!=cue['chapter'] else GAP
            count=round(gap*SR);tracks.append(np.zeros(count,dtype=np.float32));cursor+=count
        start=cursor/SR;duration=len(wav)/SR
        cue.update(start=round(start,5),end=round(start+duration,5),duration=duration)
        cs,ce,quality=align(cue['text'],asr[ident]['words'],duration)
        parts=pieces(cue['text']);pos=0;local=[]
        for ordinal,part in enumerate(parts):
            n=len(normalize(part));a=max(0,float(cs[pos])-.045);b=min(duration,float(ce[pos+n-1])+.12)
            local.append({'id':f'{ident}-{ordinal:02}','cueId':ident,'chapter':cue['chapter'],'text':part,
                'start':round(start+a,5),'end':round(start+max(a+.24,b),5),'timingMethod':quality['method']})
            pos+=n
        for i,cap in enumerate(local):
            if i+1<len(local):cap['end']=min(cap['end'],local[i+1]['start'])
            if cap['end']<=cap['start']:raise ValueError(f'Invalid caption {cap}')
            if len(cap['text'])>22:raise ValueError(f'Caption too long: {cap}')
        captions.extend(local);reports.append({**asr[ident],'target':cue['text'],'duration':duration,'alignment':quality})
        tracks.append(wav);cursor+=len(wav);last=cue['chapter']
    merged=np.concatenate(tracks);sf.write(PUBLIC/'narration.wav',merged,SR,subtype='PCM_24')
    oldscenes={x['chapter']:x for x in story['scenes']}
    scenes=[]
    for chapter in story['chapters']:
        rows=[c for c in story['sentences'] if c['chapter']==chapter]
        scenes.append({'id':'scene_'+chapter,'chapter':chapter,'start':rows[0]['start'],'end':rows[-1]['end'],
            'plannedStart':oldscenes[chapter]['start'],'plannedEnd':oldscenes[chapter]['end']})
    story['scenes']=scenes;story['captions']=captions
    story['audio'].update(actualDuration=cursor/SR,sampleRate=SR,narration='public/audio/v8/narration.wav',
        assemblyGapSec=GAP,chapterGapSec=CHAPTER_GAP,asrModel='Whisper-small CPU int8',status='assembled-source-measured',
        subjectiveListeningChecked=False)
    story['narrativeNotes']['status']='source-measured; automatic ASR checked; manual listening pending'
    (WORK/'story-v8-measured.json').write_text(json.dumps(story,ensure_ascii=False,indent=2),encoding='utf8')
    (WORK/'asr-alignment.json').write_text(json.dumps({'model':'Whisper-small','automaticOnly':True,'cues':reports},ensure_ascii=False,indent=2),encoding='utf8')
    srt='\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(captions))
    (PUBLIC/'subtitles.srt').write_text(srt,encoding='utf8')
    (WORK/'subtitle-segments-v8.json').write_text(json.dumps({c['id']:pieces(c['text']) for c in story['sentences']},ensure_ascii=False,indent=2),encoding='utf8')
    (WORK/'assembly-report.json').write_text(json.dumps({'durationSec':cursor/SR,'sentences':len(story['sentences']),'captions':len(captions),'scenes':scenes,'sourceSha256':sha(PUBLIC/'narration.wav'),'subjectiveListeningChecked':False},ensure_ascii=False,indent=2),encoding='utf8')
    if args.integrate:shutil.copy2(WORK/'story-v8-measured.json',ROOT/'src/story.json')
    print(json.dumps({'durationSec':cursor/SR,'captions':len(captions),'scenes':scenes},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
