"""CPU Whisper checks and clause-level captions; recognition never certifies listening."""
from pathlib import Path
import argparse,ctypes,difflib,json,os,re,time,unicodedata
from voice import ROOT,read,save,sha,spoken

# Reviewed clause boundaries preserve the complete participant eligibility phrase.
# Matching the source clause keeps this override inert if the narration changes.
CAPTION_CLAUSE_PARTS={
    '一项研究找来约两千名没有糖尿病、符合超重或肥胖条件的成年人，':(
        '一项研究找来约两千名','没有糖尿病、符合超重或肥胖条件的成年人，'),
    '将约两千名无糖尿病、符合超重或肥胖条件的成年人，':(
        '将约两千名','无糖尿病、符合超重或肥胖条件的成年人，'),
}
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
    text=text.replace('β','贝塔').replace('两','二')
    return re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]','',text)

def caption_parts(text,max_units=23):
    width=lambda s:sum(.55 if ord(c)<128 else 1 for c in s)
    phrases=[p.strip() for p in re.split(r'(?<=[，。！？；：])',text) if chars(p)]
    output=[]
    for phrase in phrases:
        if width(phrase)<=max_units:output.append(phrase);continue
        reviewed=CAPTION_CLAUSE_PARTS.get(phrase)
        if reviewed and all(width(part)<=max_units for part in reviewed):
            if ''.join(reviewed)!=phrase:raise ValueError('Caption boundary changes wording')
            output.extend(reviewed);continue
        carry=''
        for token in re.findall(r'[A-Za-z0-9][A-Za-z0-9_.+/-]*|[^A-Za-z0-9]',phrase):
            if carry and width(carry+token)>max_units:output.append(carry);carry=''
            carry+=token
        if chars(carry):output.append(carry)
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

def build_captions(tl):
    """Generate aligned entries without writing the timeline or audio metadata."""
    fps=tl['fps'];out=[]
    for row in tl['clips']:
        asr=read(ROOT/'audio/asr'/f"{row['id']}.json")
        if asr['sourceSHA256']!=row['audioSHA256']:raise ValueError('Stale ASR '+row['id'])
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
        out.extend(entries)
    return out

def captions():
    tl=read(ROOT/'public/timeline.json');fps=tl['fps'];out=build_captions(tl)
    tl['captions']=out
    save(ROOT/'public/timeline.json',tl);save(ROOT/'src/timeline.json',tl)
    srt='\n\n'.join(f"{i+1}\n{srt_time(c['start'],fps)} --> {srt_time(c['end'],fps)}\n{c['text']}" for i,c in enumerate(out))+'\n'
    # Canonical publishing filename and the historical alias must agree.
    for filename in ['GLP1.srt','GLP1-subtitles.srt']:
        (ROOT/'delivery'/filename).write_text(srt,'utf-8-sig')
    for prior,current in zip(out,out[1:]):
        if current['start']<prior['end']:raise ValueError('Caption overlap '+prior['id'])
    save(ROOT/'research/caption-report.json',dict(count=len(out),overlaps=0,subjectiveListeningChecked=False,
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
    p=argparse.ArgumentParser();p.add_argument('--watch',action='store_true');p.add_argument('--captions-only',action='store_true');a=p.parse_args()
    if a.captions_only:captions();return
    from faster_whisper import WhisperModel
    model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=3)
    started=time.monotonic()
    while True:
        rows=read(ROOT/'docs/story.json')['shots'];done=0;flagged=[]
        for row in rows:
            tp=ROOT/'audio/takes'/f"{row['id']}.json";dest=ROOT/'audio/asr'/f"{row['id']}.json"
            if not tp.exists():continue
            take=read(tp)
            if take['ttsText']!=spoken(row):continue
            if dest.exists() and read(dest).get('sourceSHA256')==take['sha256']:result=read(dest)
            else:
                segs,_=model.transcribe(str(ROOT/take['processed']),language='zh',beam_size=5,word_timestamps=True,
                    vad_filter=True,condition_on_previous_text=False,initial_prompt=None,hallucination_silence_threshold=1.0)
                words=[dict(text=w.word,start=w.start,end=w.end,probability=w.probability) for seg in segs for w in (seg.words or [])]
                heard=simplified(''.join(w['text'] for w in words));target=chars(spoken(row));observed=chars(heard)
                matcher=difflib.SequenceMatcher(None,target,observed,autojunk=False)
                edits=[dict(op=tag,expected=target[a0:a1],heard=observed[b0:b1],end=a1) for tag,a0,a1,b0,b1 in matcher.get_opcodes() if tag!='equal']
                flags=[];cps=len(target)/max(.01,take['rawDuration'])
                if matcher.ratio()<.80:flags.append('low_asr_match')
                if any(e['op']=='delete' and e['end']>=len(target)-1 and len(e['expected'])>=2 for e in edits):flags.append('possible_missing_tail')
                if take.get('rawEndpointFlag'):flags.append('raw_endpoint')
                if cps>8.5 or cps<1.7:flags.append('unusual_speech_rate')
                if not words:flags.append('no_speech_recognized')
                result=dict(id=row['id'],expected=spoken(row),heard=heard,words=words,ratio=matcher.ratio(),flags=flags,edits=edits,
                    sourceSHA256=take['sha256'],duration=take['duration'],charactersPerSecond=cps,subjectiveListeningChecked=False)
                save(dest,result);print('ASR',row['id'],round(result['ratio'],3),flags,flush=True)
            # Cached results may predate numeric/Greek typography normalization.
            # Retain their literal first score while recomputing the same evidence.
            if not result.get('typographyNormalizationVersion'):
                result['literalInitialRatio']=result['ratio']
                target=chars(result['expected']);observed=chars(result['heard'])
                matcher=difflib.SequenceMatcher(None,target,observed,autojunk=False)
                result['ratio']=matcher.ratio()
                result['edits']=[dict(op=tag,expected=target[a0:a1],heard=observed[b0:b1],end=a1) for tag,a0,a1,b0,b1 in matcher.get_opcodes() if tag!='equal']
                result['flags']=[x for x in result['flags'] if x!='low_asr_match']
                if result['ratio']<.8:result['flags'].append('low_asr_match')
                result['typographyNormalizationVersion']=2
                save(dest,result)
            done+=1
            if result['flags']:flagged.append({k:result[k] for k in ['id','flags','ratio','expected','heard']})
        save(ROOT/'research/voice-qa.json',dict(completed=done,total=len(rows),flagged=flagged,subjectiveListeningChecked=False,
            limitation='CPU Whisper screens content; matching cannot prove naturalness or pleasantness. Original takes retained.'))
        if done==len(rows) or not a.watch:break
        if time.monotonic()-started>3600:raise TimeoutError('Takes incomplete after one hour')
        time.sleep(10)
    print('ASR_COMPLETE',done,flush=True)

if __name__=='__main__':main()

