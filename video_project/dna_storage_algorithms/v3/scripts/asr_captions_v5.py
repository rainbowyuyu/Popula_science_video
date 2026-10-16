"""CPU-only word alignment of final local voice; no source trimming or prompt."""
import json, re, difflib, sys
from pathlib import Path
import numpy as np
import soundfile as sf
from audio_v5_common import ROOT, OUT, TTS, SR, FPS, sha, save
sys.path.insert(0,str(Path(__file__).resolve().parent/'audio_vendor'))
from opencc import OpenCC
CC=OpenCC('t2s')

KEY_REVIEW={
    'n02':['二零一七年','火车进站','脱氧核糖核酸'],
    'n04':['零零，零一，一零，还有一一','碱基'],
    'n12':['种子编号','重做'],
    'n13':['异或','抵消'],
    'n14':['甲','乙','丙'],
    'n26':['史密斯沃特曼'],
    'n28':['冗余','校验值'],
}
# These are review hints, never automatic corrections or listening approval.
KNOWN_NEAR_SOUND={('异或','一或'),('异或','亦或'),('甲','架'),('甲','夹'),
                  ('乙','椅'),('乙','已'),('丙','柄'),('丙','饼'),
                  ('甲乙','架椅'),('乙丙','椅柄'),('碱基','减机'),
                  ('碱基','减基'),('碱基','剪辑'),('读段','独断'),('校验','效验'),
                  ('脱氧','拖养'),('帧','针'),('泉','拳'),('记法','计划'),
                  ('简','剪'),('基','辑'),('带','戴'),('合成仪','合成一')}
def norm(s):
    s=CC.convert(s).translate(str.maketrans('0123456789','零一二三四五六七八九'))
    return re.sub(r'[^\w\u4e00-\u9fff]','',s).lower()

def content_review(row):
    """Keep literal content differences separate from subjective voice review."""
    target,observed=norm(row['spokenText']),norm(row['asr'])
    diffs=[]
    for op,a,b,c,d in difflib.SequenceMatcher(None,target,observed,autojunk=False).get_opcodes():
        if op=='equal':continue
        before,after=target[a:b],observed[c:d]
        diffs.append({'operation':op,'expected':before,'observed':after,
            'expectedSpan':[a,b],'observedSpan':[c,d],
            'classification':'possible-homophone-recognition' if (before,after) in KNOWN_NEAR_SOUND else 'automatic-difference-review',
            'atOpening':a==0,'atEnding':b==len(target),'confirmedSpokenError':False})
    keyTerms=[{'expected':term,'literalMatch':norm(term) in observed,
               'interpretation':'literal ASR presence does not verify tone'} for term in KEY_REVIEW.get(row['id'],[])]
    flags=[]
    if row['similarity']<.82:flags.append('low-text-similarity')
    if any(d['operation']=='delete' and len(d['expected'])>=3 for d in diffs):flags.append('possible-missing-phrase')
    if any(d['atOpening'] or d['atEnding'] for d in diffs):flags.append('opening-or-ending-difference')
    if any(not t['literalMatch'] for t in keyTerms):flags.append('key-term-literal-mismatch')
    return {'normalizedTarget':target,'normalizedAsr':observed,'differences':diffs,
            'keyTerms':keyTerms,'flags':flags,'confirmedSpokenErrors':[],
            'reviewMethod':'automatic text comparison; ASR errors and spoken errors are not separable without listening',
            'subjectiveListeningChecked':False}

def write_readback(rows,path=None):
    lines=['# V5 本地配音逐句读回核查','',
        '本表将标准口播与离线 Whisper 识别逐句对照。它用于找漏字、重复、数字和关键术语；未进行人工试听，不能把近音识别或低相似度直接认定为发音错误，也不能据此宣称音色好听。','',
        '| 句号 | 相似度 | 差异段数 | 自动复查标记 |','|---|---:|---:|---|']
    for row in rows:
        review=row['contentReview']
        lines.append(f"| {row['id']} | {row['similarity']:.3f} | {len(review['differences'])} | {', '.join(review['flags']) or '—'} |")
    for row in rows:
        review=row['contentReview']
        lines += ['',f"## {row['id']}",'',f"目标：{row['spokenText']}",'',f"识别：{row['asr']}",'',
                  f"标准画面文案：{row['target']}", '']
        if review['differences']:
            for d in review['differences']:
                category='可能是同音／近音识别，需要复听' if d['classification']=='possible-homophone-recognition' else '自动识别差异，需要结合原声判断'
                lines.append(f"- {d['operation']}: 「{d['expected'] or '∅'}」→「{d['observed'] or '∅'}」；{category}。")
        else:lines.append('标准化文本一致；声调、停连与听感尚不能据此判定。')
        if review['keyTerms']:
            lines += ['', '关键读音／数字：'+'；'.join(f"{t['expected']}（{'字面匹配' if t['literalMatch'] else '需重点复查'}）" for t in review['keyTerms'])+'。']
    (path or OUT/'readback-review.md').write_text('\n'.join(lines)+'\n',encoding='utf8')

def main():
    narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'))
    caps=json.loads((OUT/'captions.json').read_text(encoding='utf8'))
    reportpath=OUT/'asr-captions.json'
    old=json.loads(reportpath.read_text(encoding='utf8')).get('cues',[]) if reportpath.exists() else []
    preflight=OUT/'asr-preflight-v5.json'
    prior=json.loads(preflight.read_text(encoding='utf8')).get('cues',[]) if preflight.exists() else []
    cache={r['id']:r for r in prior+old};rows=[];model=None
    for cue in narr['cues']:
        path=ROOT/cue['workingAudioFile'];h=sha(path)
        if cache.get(cue['id'],{}).get('sha256')==h:row=cache[cue['id']]
        else:
            if model is None:
                from faster_whisper import WhisperModel
                model=WhisperModel(str(TTS/'models/whisper-small'),device='cpu',compute_type='int8',cpu_threads=3,num_workers=1,local_files_only=True)
            segments,_=model.transcribe(str(path),language='zh',beam_size=3,condition_on_previous_text=False,word_timestamps=True,vad_filter=False)
            segments=list(segments)
            row={'id':cue['id'],'sha256':h,'asr':''.join(s.text for s in segments),
                 'words':[{'word':w.word,'start':w.start,'end':w.end,'probability':w.probability} for s in segments for w in s.words],
                 'subjectiveListeningChecked':False}
        row.update(target=cue['text'],spokenText=cue['spokenText'],
                   similarity=difflib.SequenceMatcher(None,norm(cue['spokenText']),norm(row['asr'])).ratio())
        row['contentReview']=content_review(row)
        rows.append(row)
        observed='';times=[]
        for word in row['words']:
            text=norm(word['word'])
            for i,char in enumerate(text):
                observed+=char;times.append(word['start']+(word['end']-word['start'])*(i+.5)/max(1,len(text)))
        target=norm(cue['text']);matched={}
        for match in difflib.SequenceMatcher(None,target,observed).get_matching_blocks():
            for k in range(match.size):matched[match.a+k]=times[match.b+k]
        these=[c for c in caps if c['cueId']==cue['id']];spans=[];pos=0
        for cap in these:
            size=len(norm(cap['text']));spans.append((cap,pos,pos+size));pos+=size
        if row['words'] and len(matched)>=max(2,len(target)*.65):
            bounds=[max(0,row['words'][0]['start']-.04)]
            for _,_,end in spans[:-1]:
                before=[matched[k] for k in matched if k<end];after=[matched[k] for k in matched if k>=end]
                bounds.append((max(before)+min(after))/2 if before and after else .08+cue['rawDuration']*end/max(1,len(target)))
            bounds.append(min(cue['actualDuration'],row['words'][-1]['end']+.10))
            bounds=np.maximum.accumulate(bounds)
            for i,(cap,_,_) in enumerate(spans):
                cap['startFrame']=round((cue['startSec']+float(bounds[i]))*FPS)
                cap['endFrame']=max(cap['startFrame']+1,round((cue['startSec']+float(bounds[i+1]))*FPS))
                cap['timingMethod']='local Whisper-small word anchors; original source text retained'
        # Keep the outer subtitle window over all measured speech energy,
        # including a final soft syllable the recognizer might miss.
        x,sr=sf.read(path,dtype='float32');block=480
        energy=np.sqrt(np.mean(x[:len(x)//block*block].reshape(-1,block)**2,axis=1))
        active=np.flatnonzero(energy>max(.002,float(energy.max())*.07))
        if len(active) and these:
            activeStart=max(0,active[0]*.01-.03);activeEnd=min(cue['actualDuration'],(active[-1]+1)*.01+.04)
            these[0]['startFrame']=min(these[0]['startFrame'],round((cue['startSec']+activeStart)*FPS))
            these[-1]['endFrame']=max(these[-1]['endFrame'],round((cue['startSec']+activeEnd)*FPS))
        row['estimatedSpeechStartSec']=cue['startSec']+(row['words'][0]['start'] if row['words'] else .08)
        row['estimatedSpeechEndSec']=cue['startSec']+(row['words'][-1]['end'] if row['words'] else .08+cue['rawDuration'])
        save(OUT/'captions.json',caps)
        report={'model':'local Whisper-small','device':'CPU int8','initialPrompt':None,'vadFilter':False,
                'automaticOnly':True,'subjectiveListeningChecked':False,'cues':rows,
                'reviewFlags':[r['id'] for r in rows if r['similarity']<.82]}
        save(reportpath,report);print(cue['id'],round(row['similarity'],3),flush=True)
    report['estimatedSpeechGaps']=[{'from':a['id'],'to':b['id'],
        'seconds':round(b['estimatedSpeechStartSec']-a['estimatedSpeechEndSec'],4)} for a,b in zip(rows,rows[1:])]
    report['longSpeechGapReview']=[r for r in report['estimatedSpeechGaps'] if r['seconds']>1.0]
    report['contentReviewFlags']=[{'id':r['id'],'flags':r['contentReview']['flags']} for r in rows if r['contentReview']['flags']]
    report['confirmedSpokenErrors']=[]
    report['readbackReport']='work/audio-v5/readback-review.md'
    save(reportpath,report)
    write_readback(rows)
    def stamp(frame):
        ms=round(frame/FPS*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
    srt='\n\n'.join(f"{i+1}\n{stamp(c['startFrame'])} --> {stamp(c['endFrame'])}\n{c['text']}" for i,c in enumerate(caps))
    (OUT/'subtitles.srt').write_text(srt,encoding='utf8')
    print('ASR review flags:',report['reviewFlags'],'long-gap review:',report['longSpeechGapReview'],flush=True)

if __name__=='__main__':main()
