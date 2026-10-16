"""Offline ASR is an auxiliary content check, never an auditory quality claim."""
import os
os.environ.setdefault('OMP_NUM_THREADS','2')
os.environ.setdefault('MKL_NUM_THREADS','2')
os.environ.setdefault('KMP_BLOCKTIME','0')
import json,re,difflib,argparse
import numpy as np
import soundfile as sf
from opencc import OpenCC
from audio_common import ROOT,OUT,TTS,FPS,story,sha,save
CC=OpenCC('t2s')
def number_word(m):
    n=int(m.group());digits='零一二三四五六七八九'
    if n<10:return digits[n]
    if n>=10000:return ''.join(digits[int(x)] for x in m.group())
    # These are physical quantities, not phone numbers or years: 1500 is
    # 一千五百. Digit-by-digit conversion would create false missing-word flags.
    out='';zero=False
    for unit,label in [(1000,'千'),(100,'百'),(10,'十'),(1,'')]:
        d,n=divmod(n,unit)
        if d:
            if zero:out+='零'
            out+=digits[d]+label;zero=False
        elif out and n:zero=True
    return out[1:] if out.startswith('一十') else out
def norm(t):return re.sub(r'[^\w\u4e00-\u9fff]','',re.sub(r'\d+',number_word,CC.convert(t))).lower()

def main():
    p=argparse.ArgumentParser();p.add_argument('--partial',action='store_true');a=p.parse_args()
    s=story();path=OUT/'asr-review.json';old=json.loads(path.read_text(encoding='utf8')).get('cues',[]) if path.exists() else []
    cache={r['id']:r for r in old};rows=[];model=None
    for c in s['cues']:
        f=OUT/'clean'/f"{c['id']}.wav"
        if not f.exists():continue
        h=sha(f)
        cached=cache.get(c['id'],{}).get('sha256')==h
        if cached:r=cache[c['id']]
        else:
            if model is None:
                from faster_whisper import WhisperModel
                model=WhisperModel(str(TTS/'models/whisper-small'),device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,local_files_only=True)
            segments,_=model.transcribe(str(f),language='zh',beam_size=3,condition_on_previous_text=False,word_timestamps=True,vad_filter=False)
            segments=list(segments)
            r={'id':c['id'],'sha256':h,'asr':''.join(x.text for x in segments),
               'words':[{'text':w.word,'start':w.start,'end':w.end,'probability':w.probability} for x in segments for w in x.words]}
        r.update(target=c['text'],spokenText=c['spokenText'],similarity=difflib.SequenceMatcher(None,norm(c['spokenText']),norm(r['asr'])).ratio(),subjectiveListeningChecked=False)
        diffs=[];target=norm(c['spokenText']);observed=norm(r['asr'])
        for op,b,e,ob,oe in difflib.SequenceMatcher(None,target,observed,autojunk=False).get_opcodes():
            if op!='equal':diffs.append({'op':op,'expected':target[b:e],'observed':observed[ob:oe],'opening':b==0,'ending':e==len(target)})
        r['differences']=diffs;r['requiresReview']=r['similarity']<.82 or any(d['op']=='delete' and len(d['expected'])>2 for d in diffs)
        rows.append(r);save(path,{'model':'local Whisper-small CPU int8','vadFilter':False,'initialPrompt':None,'subjectiveListeningChecked':False,'cues':rows})
        if not cached:print(c['id'],round(r['similarity'],3),r['asr'],flush=True)
    lines=['# Roadster 本地配音自动读回','','逐句保留原声，无裁剪、无变速。ASR 仅用于辅助核查漏字和重复；声调和听感尚未经人工听审。','']
    for r in rows:lines.extend([f"## {r['id']} · {r['similarity']:.3f}",f"目标：{r['spokenText']}",f"识别：{r['asr']}",''])
    (OUT/'readback-review.md').write_text('\n'.join(lines),encoding='utf8')
    if a.partial:return
    narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'));caps=json.loads((OUT/'captions.json').read_text(encoding='utf8'));byid={r['id']:r for r in rows}
    for c in narr['cues']:
        r=byid[c['id']];these=[z for z in caps['cues'] if z['cueId']==c['id']];observed='';times=[]
        for w in r['words']:
            t=norm(w['text'])
            for k,ch in enumerate(t):observed+=ch;times.append(w['start']+(w['end']-w['start'])*(k+.5)/max(1,len(t)))
        target=norm(c['text']);matched={}
        for m in difflib.SequenceMatcher(None,target,observed).get_matching_blocks():
            for k in range(m.size):matched[m.a+k]=times[m.b+k]
        if r['words'] and len(matched)>=max(2,len(target)*.6):
            bounds=[max(0,r['words'][0]['start']-.05)];pos=0
            for z in these[:-1]:
                pos+=len(norm(z['text']));left=[matched[k] for k in matched if k<pos];right=[matched[k] for k in matched if k>=pos]
                bounds.append((max(left)+min(right))/2 if left and right else c['actualDurationSec']*pos/max(1,len(target)))
            bounds.append(min(c['actualDurationSec'],r['words'][-1]['end']+.1));bounds=np.maximum.accumulate(bounds)
            for i,z in enumerate(these):
                z['startFrame']=round((c['startSec']+float(bounds[i]))*FPS);z['endFrame']=max(z['startFrame']+1,round((c['startSec']+float(bounds[i+1]))*FPS));z['timingMethod']='Whisper word anchors + measured speech energy; standard source text retained'
        x,sr=sf.read(ROOT/c['audio'],dtype='float32');block=480;rms=np.sqrt(np.mean(x[:len(x)//block*block].reshape(-1,block)**2,axis=1));active=np.flatnonzero(rms>max(.002,float(rms.max())*.06))
        if len(active):
            these[0]['startFrame']=min(these[0]['startFrame'],round((c['startSec']+max(0,active[0]*.01-.03))*FPS))
            these[-1]['endFrame']=max(these[-1]['endFrame'],round((c['startSec']+min(c['actualDurationSec'],(active[-1]+1)*.01+.04))*FPS))
        # Hold the complete cue's first and last caption through protected edges.
        # Interior word anchors remain unchanged and adjacent captions abut.
        these[0]['startFrame']=c['startFrame'];these[-1]['endFrame']=c['endFrame']
        for previous,following in zip(these,these[1:]):previous['endFrame']=following['startFrame']
        for z in these:z.update(start=z['startFrame']/FPS,end=z['endFrame']/FPS)
    save(OUT/'captions.json',caps)
    save(ROOT/'src/captions-data.json',caps)
    def stamp(fr):
        m=round(fr/FPS*1000);return f'{m//3600000:02d}:{m//60000%60:02d}:{m//1000%60:02d},{m%1000:03d}'
    (OUT/'subtitles.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['startFrame'])} --> {stamp(c['endFrame'])}\n{c['text']}" for i,c in enumerate(caps['cues'])),encoding='utf8')
    subtitle_dir=ROOT.parents[1]/'subtitles/v04';subtitle_dir.mkdir(parents=True,exist_ok=True)
    (subtitle_dir/'Roadster_中文字幕.srt').write_bytes((OUT/'subtitles.srt').read_bytes())
    print('Review candidates:',[r['id'] for r in rows if r['requiresReview']],flush=True)

if __name__=='__main__':main()
