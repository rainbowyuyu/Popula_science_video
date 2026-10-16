"""ASR screening of new candidates; selection is a separate explicit step."""
import argparse,difflib,json,pathlib,sys
P=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(P/'scripts'))
from voice import read,save,sha
from qc import chars,simplified
from faster_whisper import WhisperModel

ap=argparse.ArgumentParser();ap.add_argument('--candidate',required=True);ap.add_argument('--only',default='g005,g013,g019,g024,g027,g068');args=ap.parse_args()
model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=3)
folder=P/'audio/candidates'/args.candidate
story={r['id']:r for r in read(P/'docs/story.json')['shots']}
report=[]
for key in args.only.split(','):
    take=read(folder/f'{key}.json');path=P/take['processed']
    assert take['ttsText']==story[key].get('ttsText',story[key]['text'])
    assert take['sha256']==sha(path)
    segs,_=model.transcribe(str(path),language='zh',beam_size=5,word_timestamps=True,vad_filter=True,condition_on_previous_text=False,initial_prompt=None,hallucination_silence_threshold=1.0)
    words=[dict(text=w.word,start=w.start,end=w.end,probability=w.probability) for seg in segs for w in (seg.words or [])]
    heard=simplified(''.join(w['text'] for w in words));target=chars(take['ttsText']);observed=chars(heard)
    matcher=difflib.SequenceMatcher(None,target,observed,autojunk=False)
    edits=[dict(op=tag,expected=target[a:b],heard=observed[c:d],end=b) for tag,a,b,c,d in matcher.get_opcodes() if tag!='equal']
    flags=[]
    if matcher.ratio()<.80:flags.append('low_asr_match')
    if any(e['op']=='delete' and e['end']>=len(target)-1 and len(e['expected'])>=2 for e in edits):flags.append('possible_missing_tail')
    if take.get('rawEndpointFlag'):flags.append('raw_endpoint')
    result=dict(id=key,expected=take['ttsText'],heard=heard,words=words,ratio=matcher.ratio(),flags=flags,edits=edits,sourceSHA256=take['sha256'],duration=take['duration'],charactersPerSecond=len(target)/take['duration'],subjectiveListeningChecked=False,typographyNormalizationVersion=2)
    save(folder/'asr'/f'{key}.json',result);report.append(result)
    print(key,round(result['ratio'],3),flags,heard,flush=True)
save(P/'research/revision-v4'/f'candidate-{args.candidate}-qa.json',dict(candidate=args.candidate,results=report,subjectiveListeningChecked=False))
