"""ASR-backed first-caption replacement while proving all later timing unchanged."""
from pathlib import Path
import json,sys,hashlib,copy,math
from datetime import datetime,timezone
OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
from qc_v5 import chars,map_times,srt_time
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def main():
    from faster_whisper import WhisperModel
    model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=3)
    reports={}
    for key in ['a','c']:
        take=read(OUT/'opening'/key/'take.json'); audio=OUT/'opening'/key/'h001.wav'
        segs,_=model.transcribe(str(audio),language='zh',beam_size=5,word_timestamps=True,vad_filter=False,condition_on_previous_text=False)
        segs=list(segs);words=[dict(text=w.word,start=w.start,end=w.end,probability=w.probability) for s in segs for w in s.words]
        heard=''.join(s.text for s in segs)
        target,mapping,ratio=map_times(take['text'],words,take['duration'])
        report=dict(text=take['text'],heard=heard,words=words,ratio=ratio,model='whisper-small CPU int8 unprompted',audioSHA256=sha(audio),subjectiveListeningChecked=False)
        save(OUT/'opening'/key/'asr.json',report);reports[key]=report
    key='c';take=read(OUT/'opening'/key/'take.json');asr=reports[key]
    if asr['ratio']<.85 or take['slotTailSeconds']<.2:raise ValueError('Opening requires another take')
    story=read(ROOT/'docs/story-v5.json');timeline=read(ROOT/'src/timeline.json')
    baseline_tl=copy.deepcopy(timeline)
    for row in [story['shots'][0],timeline['clips'][0]]:
        row.update(text=take['text'],ttsText=take['text'],caption=take['text'])
    story['title']='如何科学减肥？看懂血糖、血压、血脂的调节'
    story['status']='v5-lemon-opening-narration-frozen'
    storypath=OUT/'story-v5.json';save(storypath,story)
    timeline['title']=story['title'];timeline['storySHA256']=sha(storypath)
    clip=timeline['clips'][0]
    clip.update(voiceEndSeconds=clip['startSeconds']+take['duration'],voiceDurationSeconds=take['duration'],
                audioSHA256=take['sha256'],audioSource=(OUT/'opening/c/h001.wav').relative_to(ROOT).as_posix(),
                takeSHA256=sha(OUT/'opening/c/take.json'))
    parts=['减肥，光靠少吃就够了吗？','肚子上的脂肪，','怎么牵动血糖、血压和血脂？','咱们从这顿饭说起。']
    assert ''.join(parts)==take['text']
    target,mapping,ratio=map_times(take['text'],asr['words'],take['duration'])
    captions=[];pos=0
    for index,text in enumerate(parts):
        length=len(chars(text));begin=mapping[pos][0];end=mapping[pos+length-1][1]
        captions.append(dict(id=f'h001-c{index+1}',clipId='h001',text=text,
            start=max(12,round((.4+begin)*30)),end=min(297,math.ceil((.4+end+.10)*30)),
            timingSource='Unprompted CPU Whisper word alignment; original display text',alignmentRatio=ratio,
            asrCacheKey=sha(OUT/'opening/c/asr.json'),sourceSHA256=take['sha256']))
        pos+=length
    for a,b in zip(captions,captions[1:]):a['end']=min(a['end'],b['start'])
    timeline['captions']=captions+[c for c in timeline['captions'] if c['clipId']!='h001']
    assert timeline['clips'][1:]==baseline_tl['clips'][1:]
    assert [c for c in timeline['captions'] if c['clipId']!='h001']==[c for c in baseline_tl['captions'] if c['clipId']!='h001']
    assert [(c['id'],c['start'],c['end']) for c in timeline['clips']]==[(c['id'],c['start'],c['end']) for c in baseline_tl['clips']]
    save(OUT/'timeline.json',timeline)
    srt='\n\n'.join(f"{i+1}\n{srt_time(c['start'],30)} --> {srt_time(c['end'],30)}\n{c['text']}" for i,c in enumerate(timeline['captions']))+'\n'
    (OUT/'GLP1-v5-subtitles.srt').write_text(srt,encoding='utf8')
    save(OUT/'opening-alignment-report.json',dict(selected='c',newText=take['text'],audioSHA256=take['sha256'],
        candidateTimelinesHA256=sha(OUT/'timeline.json'),newStorySHA256=sha(storypath),
        baselineTimelineSHA256=sha(ROOT/'src/timeline.json'),totalFramesUnchanged=timeline['durationFrames'],
        allClipStartEndUnchanged=True,h002AndLaterClipsUnchanged=True,h002AndLaterCaptionsUnchanged=True,
        durationSeconds=take['duration'],slotTailSeconds=take['slotTailSeconds'],voiceSpeedFactor=1,
        captions=captions,asrRatio=ratio,subjectiveListeningChecked=False,createdAtUTC=datetime.now(timezone.utc).isoformat()))
    print(json.dumps({'reports':{k:{'heard':v['heard'],'ratio':v['ratio']} for k,v in reports.items()},'captions':captions},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
