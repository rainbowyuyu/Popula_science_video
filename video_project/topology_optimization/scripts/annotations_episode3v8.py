"""Time first-mention labels from accepted narration. Camera QA follows."""
from pathlib import Path
import ctypes, difflib, hashlib, json, math, os, re
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'research/episode3v8'
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def clean(text):
    if os.name=='nt':
        out=ctypes.create_unicode_buffer(len(text)*2+8)
        if ctypes.windll.kernel32.LCMapStringEx('zh-CN',0x02000000,text,len(text),out,len(out),None,None,0):text=out.value
    return re.sub(r'[^\u3400-\u9fff0-9a-z]','',text.lower())
def interp(x,pairs):
    for (a,b),(c,d) in zip(pairs,pairs[1:]):
        if a<=x<=c:return b+(d-b)*(x-a)/max(c-a,1e-9)
    return pairs[-1][1]
DESIGN={
 '榫头':('tenon','left',-92),'卯口':('mortise','right',55),
 '榫肩':('shoulder','left',-85),'斜撑':('brace','right',60),
 '木销':('peg','right',-80),'榀':('bent','right',-100),
 '纵向枋':('longitudinal','left',-75),'斗栱':('bracket','left',-85),
 '斗':('dou','left',55),'栱':('gong','right',-90),
 '角梁':('hip','left',-90),'短柱':('shortPost','right',-75),
 '托梁':('supportBeam','left',60),'望板':('board','right',-80),
 '椽子':('rafter','right',-100),'檩':('purlin','left',72),
 '受压':('compression','right',-90),'受拉':('tension','right',80),
 '柱':('post','right',-60),'石础':('stone','left',35),
 '位移':('displacement','right',-100),'应力':('stress','left',80),
}
PHRASES={'受压':'被挤紧','受拉':'被拉开','榀':'叫一榀','柱':'柱子','斗':'的是斗','栱':'的是栱'}
def main():
    tl=read(ROOT/'src/episode3v8/timeline.json')
    if tl.get('draft'):raise RuntimeError('Wait for the real v8 narration timeline')
    story=read(REPORT/'story.json');cache=read(REPORT/'audio-asr-cache.json');ledger=read(REPORT/'audio-generation.json');fps=tl['fps']
    if len(story['clips'])!=47 or len(tl['clips'])!=47:raise AssertionError('Exactly 47 complete takes required')
    cues=[];rows=[];seen=set()
    for clip,source in zip(tl['clips'],story['clips']):
        if clip['id']!=source['id'] or clip['spoken']!=source['spoken']:raise AssertionError('Locked story/timeline mismatch')
        ref=clean(clip['spoken']);chars=[];times=[];entry=cache.get(ledger[clip['id']]['sha256'])
        if entry:
            for seg in entry.get('segments',[]):
                for word in seg.get('words',[]):
                    wordchars=clean(word['word'])
                    for k,char in enumerate(wordchars):
                        chars.append(char);times.append(word['start']+(word['end']-word['start'])*(k+.5)/max(1,len(wordchars)))
        blocks=difflib.SequenceMatcher(None,ref,''.join(chars),autojunk=False).get_matching_blocks()
        points=[(i+.5,times[j]) for b in blocks for i,j in zip(range(b.a,b.a+b.size),range(b.b,b.b+b.size))]
        coverage=sum(b.size for b in blocks)/max(1,len(ref));pairs=[(0,0)]+points+[(len(ref),clip['rawSeconds'])]
        monotonic=[];prior=0
        for x,t in pairs:
            prior=max(prior,min(clip['rawSeconds'],t));monotonic.append((x,prior))
        for term in source['annotation_terms']:
            if term in seen:continue
            seen.add(term);phrase=PHRASES.get(term,term)
            for name,override in story['pronunciation_overrides'].items():phrase=phrase.replace(name,override['spoken'])
            at=ref.find(clean(phrase))
            if at<0:raise ValueError(f'Missing term {term}: {clip["id"]}')
            if coverage>=.6 and points:seconds=interp(at,monotonic)+.02;method='asr-spoken-character-alignment'
            else:seconds=clip['rawSeconds']*at/max(1,len(ref))+.02;method='raw-duration-character-fallback'
            mention=clip['start']+round(seconds*fps);start=max(clip['start'],mention-5);anchor,side,dy=DESIGN[term]
            end=min(clip['end']+8,start+round(3.25*fps))
            if end-start<60:
                following=next((c for c in tl['clips'] if c['scene']==clip['scene'] and c['line']==clip['line']+1),None)
                if following and term not in ['受压','受拉','位移','应力']:end=min(following['start']+36,start+92)
            cue={'term':term,'anchor':anchor,'start':start,'end':end,'side':side,'dy':dy}
            if term=='榀':cue.update(label='一榀梁架',kind='group')
            if term=='斗栱':cue['kind']='group'
            if term=='受压':cue['color']='#397987'
            if term=='受拉':cue['color']='#ad4938'
            cues.append(cue);rows.append({'term':term,'clip':clip['id'],'scene':clip['scene'],'line':clip['line'],'mentionFrame':mention,'method':method,'spokenAlignmentCoverage':coverage,'cue':cue.copy()})
    cues.sort(key=lambda c:(c['start'],c['end']));overrides=REPORT/'annotation-window-overrides.json'
    if overrides.exists():
        for cue in cues:cue.update(read(overrides).get(cue['term'],{}))
    for row in rows:row['cue']=next(c.copy() for c in cues if c['term']==row['term'])
    (ROOT/'src/episode3v8/annotations.json').write_text(json.dumps(cues,ensure_ascii=False,indent=2),encoding='utf-8')
    (REPORT/'annotation-timing.json').write_text(json.dumps({'sourceTimelineSha256':hashlib.sha256((ROOT/'src/episode3v8/timeline.json').read_bytes()).hexdigest(),'cueSha256':hashlib.sha256((ROOT/'src/episode3v8/annotations.json').read_bytes()).hexdigest(),'source':'accepted raw-take ASR word timestamps; spoken-text alignment; 20ms mastering head guard','visualWindowsChecked':False,'cues':rows},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'labels':len(cues),'fallbacks':[r['term'] for r in rows if 'fallback' in r['method']]},ensure_ascii=False))
if __name__=='__main__':main()
