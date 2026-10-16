"""CPU Whisper checks and clause-level captions; recognition never certifies listening."""
from pathlib import Path
import argparse,ctypes,difflib,json,os,re,time,unicodedata
from voice import ROOT,read,save,sha,spoken
def simplified(text):
    if os.name!='nt':return text
    buffer=ctypes.create_unicode_buffer(len(text)*2+10)
    ctypes.windll.kernel32.LCMapStringW(0x0804,0x02000000,text,len(text),buffer,len(buffer))
    return buffer.value

def chars(text):
    text=unicodedata.normalize('NFKC',simplified(text).lower())
    digits='零一二三四五六七八九'
    # Normalize formatting, not acoustics: Arabic percentages/cardinals, years
    # and beta may be emitted by ASR despite their Chinese spoken equivalents.
    def number(value,year=False):
        if '.' in value:
            a,b=value.split('.',1);return number(a)+'点'+''.join(digits[int(c)] for c in b)
        if year:return ''.join(digits[int(c)] for c in value)
        n=int(value)
        if n<10:return digits[n]
        if n<100:
            return ('' if n//10==1 else digits[n//10])+'十'+(digits[n%10] if n%10 else '')
        if n<10000:
            unit=1000 if n>=1000 else 100;name='千' if unit==1000 else '百';q,r=divmod(n,unit)
            return digits[q]+name+('零' if r and r<unit//10 else '')+(number(str(r)) if r else '')
        return ''.join(digits[int(c)] for c in value)
    text=re.sub(r'(\d+(?:\.\d+)?)\s*%',lambda m:'百分之'+number(m[1]),text)
    text=re.sub(r'\d+(?:\.\d+)?',lambda m:number(m.group(),text[m.end():m.end()+1]=='年' and len(m.group())==4),text)
    text=text.replace('β','贝塔').replace('两','二').replace('後','后')
    return re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]','',text)

def caption_parts(text,max_units=23):
    width=lambda s:sum(.55 if ord(c)<128 else 1 for c in s)
    phrases=[p.strip() for p in re.split(r'(?<=[，。！？；：])',text) if chars(p)]
    output=[]
    for phrase in phrases:
        if width(phrase)<=max_units:output.append(phrase);continue
        carry=''
        for token in re.findall(r'[A-Za-z0-9][A-Za-z0-9_.+/-]*|[^A-Za-z0-9]',phrase):
            if carry and width(carry+token)>max_units:output.append(carry);carry=''
            carry+=token
        if chars(carry):output.append(carry)
    # Connectors such as 你看/所以/风一来 should travel with the next clause,
    # not become unreadable flashes.  Respect the same single-line width limit.
    i=0
    while i<len(output)-1:
        if len(chars(output[i]))<5 and width(output[i]+output[i+1])<=max_units:
            output[i:i+2]=[output[i]+output[i+1]]
        else:i+=1
    if len(output)>1 and len(chars(output[-1]))<5 and width(output[-2]+output[-1])<=max_units:
        output[-2:]=[output[-2]+output[-1]]
    return output

def map_times(text,words,duration):
    heard=[];times=[]
    for word in words:
        content=chars(word['text']);start=max(0,float(word['start']));end=min(duration,float(word['end']))
        for j,char in enumerate(content):
            heard.append(char);times.append((start+(end-start)*j/max(1,len(content)),start+(end-start)*(j+1)/max(1,len(content))))
    target=chars(text);mapping={};matcher=difflib.SequenceMatcher(None,heard,list(target),autojunk=False)
    for tag,a0,a1,b0,b1 in matcher.get_opcodes():
        if tag=='equal':
            for j in range(b1-b0):mapping[b0+j]=times[a0+j]
        elif tag=='replace' and a1>a0 and b1>b0:
            left,right=times[a0][0],times[a1-1][1]
            for j in range(b1-b0):mapping[b0+j]=(left+(right-left)*j/(b1-b0),left+(right-left)*(j+1)/(b1-b0))
    anchors=sorted(mapping)
    for j in range(len(target)):
        if j in mapping:continue
        before=[k for k in anchors if k<j];after=[k for k in anchors if k>j]
        li=before[-1] if before else -1;ri=after[0] if after else len(target)
        left=mapping[li][1] if li>=0 else max(0,words[0]['start'] if words else .04)
        right=mapping[ri][0] if ri<len(target) else max(left,duration-.58)
        count=ri-li-1;span=max(0,right-left)
        mapping[j]=(left+span*(j-li-1)/max(1,count),left+span*(j-li)/max(1,count))
    return target,mapping,matcher.ratio()

def srt_time(frame,fps):
    ms=round(frame*1000/fps);hours,ms=divmod(ms,3600000);minutes,ms=divmod(ms,60000);seconds,ms=divmod(ms,1000)
    return f'{hours:02d}:{minutes:02d}:{seconds:02d},{ms:03d}'

def captions():
    tl=read(ROOT/'public/timeline.json');fps=tl['fps'];out=[]
    for row in tl['clips']:
        asr=read(ROOT/'audio/asr'/f"{row['id']}.json")
        if asr['sourceSHA256']!=row['audioSHA256']:raise ValueError('Stale ASR '+row['id'])
        if chars(asr['expected'])!=chars(spoken(row)):raise ValueError('Stale ASR text '+row['id'])
        text=row.get('caption',row['text']);target,mapping,ratio=map_times(text,asr['words'],row['voiceDurationSeconds'])
        offset=0;entries=[]
        for j,part in enumerate(caption_parts(text,22)):
            length=len(chars(part));first,last=offset,offset+length-1;offset+=length
            start=max(row['start'],min(round(row['start']+mapping[first][0]*fps),row['end']-1))
            end=max(start+1,min(round(row['start']+mapping[last][1]*fps)+3,row['end']))
            entries.append(dict(id=f"{row['id']}-c{j+1}",clipId=row['id'],text=part,start=start,end=end,
                timingSource='CPU Whisper word alignment with original display text',alignmentRatio=round(ratio,4)))
        for a,b in zip(entries,entries[1:]):
            a['end']=min(a['end'],max(a['start']+1,b['start']))
            b['start']=max(b['start'],a['end']);b['end']=max(b['end'],b['start']+1)
        # A 0.6s lower bound prevents single-frame fragments after alignment.
        # First consume available silent gaps; never change the voice/clip slots.
        minimum=round(.6*fps)
        for j,entry in enumerate(entries):
            if entry['end']-entry['start']>=minimum:continue
            left=entries[j-1]['end'] if j else row['start']
            right=entries[j+1]['start'] if j+1<len(entries) else row['end']
            entry['end']=min(right,max(entry['end'],entry['start']+minimum))
            entry['start']=max(left,min(entry['start'],entry['end']-minimum))
            if entry['end']-entry['start']<minimum:
                raise ValueError('Caption shorter than readable minimum '+entry['id'])
        out.extend(entries)
    tl['captions']=out
    save(ROOT/'public/timeline.json',tl);save(ROOT/'src/timeline.json',tl)
    srt='\n\n'.join(f"{i+1}\n{srt_time(c['start'],fps)} --> {srt_time(c['end'],fps)}\n{c['text']}" for i,c in enumerate(out))+'\n'
    # Canonical publishing filename and the historical alias must agree.
    for folder in ['audio','delivery']:
        (ROOT/folder).mkdir(exist_ok=True)
        (ROOT/folder/'ShanghaiTower.srt').write_text(srt,'utf-8-sig')
    for prior,current in zip(out,out[1:]):
        if current['start']<prior['end']:raise ValueError('Caption overlap '+prior['id'])
    save(ROOT/'research/audio-caption-report.json',dict(count=len(out),overlaps=0,subjectiveListeningChecked=False,
        minimumFrames=min(c['end']-c['start'] for c in out),durationFrames=tl['duration'],
        timing='Measured utterance starts + CPU Whisper per-word timestamp mapping',maxClauseUnits=22,timelineSHA256=sha(ROOT/'public/timeline.json')))
    # Timing did not move any take; bind placement and mix records to revised captions.
    for path in [ROOT/'audio/placements.json',ROOT/'research/audio-report.json']:
        if path.exists():
            d=read(path)
            if 'timelineSHA256' in d:d['timelineSHA256']=sha(ROOT/'public/timeline.json')
            if 'hashes' in d:d['hashes']['timeline.json']=sha(ROOT/'public/timeline.json')
            save(path,d)
    print('CAPTIONS',len(out),flush=True)

def main():
    p=argparse.ArgumentParser();p.add_argument('--watch',action='store_true');p.add_argument('--captions-only',action='store_true')
    p.add_argument('--candidate',default='');p.add_argument('--only',default='');p.add_argument('--force',action='store_true')
    p.add_argument('--story',default='docs/story.json',help='Story JSON to validate; defaults to canonical docs/story.json');a=p.parse_args()
    if a.captions_only and a.candidate:raise ValueError('Candidate review cannot write canonical captions')
    if a.captions_only:captions();return
    from faster_whisper import WhisperModel
    model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=3)
    started=time.monotonic()
    story_path=Path(a.story)
    if not story_path.is_absolute(): story_path=ROOT/story_path
    while True:
        rows=read(story_path)['shots'];done=0;flagged=[]
        if a.only:rows=[r for r in rows if r['id'] in a.only.split(',')]
        for row in rows:
            base=ROOT/'audio/candidates'/a.candidate if a.candidate else ROOT/'audio'
            tp=(base if a.candidate else base/'takes')/f"{row['id']}.json";dest=base/'asr'/f"{row['id']}.json"
            if not tp.exists():continue
            take=read(tp)
            if take['ttsText']!=spoken(row):continue
            if dest.exists() and read(dest).get('sourceSHA256')==take['sha256'] and not a.force:result=read(dest)
            else:
                segs,_=model.transcribe(str(ROOT/take['processed']),language='zh',beam_size=5,word_timestamps=True,
                    vad_filter=False,condition_on_previous_text=False,initial_prompt=None,hallucination_silence_threshold=1.0)
                words=[dict(text=w.word,start=w.start,end=w.end,probability=w.probability) for seg in segs for w in (seg.words or [])]
                heard=simplified(''.join(w['text'] for w in words));target=chars(spoken(row));observed=chars(heard)
                matcher=difflib.SequenceMatcher(None,target,observed,autojunk=False)
                edits=[dict(op=tag,expected=target[a0:a1],heard=observed[b0:b1],start=a0,end=a1) for tag,a0,a1,b0,b1 in matcher.get_opcodes() if tag!='equal']
                flags=[];cps=len(target)/max(.01,take['rawDuration'])
                if matcher.ratio()<.80:flags.append('low_asr_match')
                if any(e['op']=='delete' and e['end']>=len(target)-1 for e in edits):flags.append('possible_missing_tail')
                if any(e['op']=='delete' and e['start']<=1 for e in edits):flags.append('possible_missing_head')
                if take.get('rawEndpointFlag'):flags.append('raw_endpoint')
                if cps>8.5 or cps<1.7:flags.append('unusual_speech_rate')
                if not words:flags.append('no_speech_recognized')
                if any(w['end']>take['duration']+.05 or w['start']<-.01 or w['end']<w['start'] for w in words):flags.append('invalid_word_time')
                result=dict(id=row['id'],expected=spoken(row),heard=heard,words=words,ratio=matcher.ratio(),flags=flags,edits=edits,
                    sourceSHA256=take['sha256'],duration=take['duration'],charactersPerSecond=cps,subjectiveListeningChecked=False,
                    edgeCoverage={'expectedFirst':target[:4],'heardFirst':observed[:4],'expectedLast':target[-4:],'heardLast':observed[-4:],
                    'firstWordStart':words[0]['start'] if words else None,'lastWordEnd':words[-1]['end'] if words else None},
                    recognitionRun='fresh-v3' if a.force or a.candidate else 'fresh',pronunciationListeningVerified=False)
                save(dest,result);print('ASR',row['id'],round(result['ratio'],3),flags,flush=True)
            # Cached results may predate numeric/Greek typography normalization.
            # Retain their literal first score while recomputing the same evidence.
            if result.get('typographyNormalizationVersion')!=3:
                result['literalInitialRatio']=result['ratio']
                target=chars(result['expected']);observed=chars(result['heard'])
                matcher=difflib.SequenceMatcher(None,target,observed,autojunk=False)
                result['ratio']=matcher.ratio()
                result['edits']=[dict(op=tag,expected=target[a0:a1],heard=observed[b0:b1],start=a0,end=a1) for tag,a0,a1,b0,b1 in matcher.get_opcodes() if tag!='equal']
                result['flags']=[x for x in result['flags'] if x!='low_asr_match']
                if result['ratio']<.8:result['flags'].append('low_asr_match')
                result['typographyNormalizationVersion']=3
                save(dest,result)
            done+=1
            if result['flags']:flagged.append({k:result[k] for k in ['id','flags','ratio','expected','heard']})
        reportPath=ROOT/'audio/candidates'/a.candidate/'qa.json' if a.candidate else ROOT/'research/audio-voice-qa.json'
        save(reportPath,dict(completed=done,total=len(rows),flagged=flagged,subjectiveListeningChecked=False,
            limitation='CPU Whisper screens content; matching cannot prove naturalness or pleasantness. Original takes retained.'))
        if done==len(rows) or not a.watch:break
        if time.monotonic()-started>3600:raise TimeoutError('Takes incomplete after one hour')
        time.sleep(10)
    print('ASR_COMPLETE',done,flush=True)

if __name__=='__main__':main()

