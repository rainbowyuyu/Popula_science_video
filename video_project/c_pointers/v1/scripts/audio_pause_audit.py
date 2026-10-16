"""Inspect sentence-internal silence and export pronunciation evidence excerpts.

This is a technical screen. It never certifies tone or subjective voice quality.
"""
import difflib,json,re,subprocess
import numpy as np
import soundfile as sf
from audio_common import ROOT,OUT,SR,story,sha,save
from audio_asr import norm

def character_times(words):
    text='';times=[]
    for w in words:
        clean=norm(w['text'])
        for k,ch in enumerate(clean):
            text+=ch
            times.append((w['start']+(w['end']-w['start'])*k/max(1,len(clean)),
                          w['start']+(w['end']-w['start'])*(k+1)/max(1,len(clean))))
    return text,times

def main():
    s=story();narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'))
    review=json.loads((OUT/'asr-review.json').read_text(encoding='utf8'))
    byid={r['id']:r for r in review['cues']};rows=[];clips=[]
    target_dir=OUT/'pronunciation-evidence';target_dir.mkdir(exist_ok=True)
    for c in s['cues']:
        cue=next(r for r in narr['cues'] if r['id']==c['id'])
        path=OUT/'clean'/f"{c['id']}.wav"
        x,sr=sf.read(path,dtype='float32');assert sr==SR
        block=480;frames=x[:len(x)//block*block].reshape(-1,block)
        rms=np.sqrt(np.mean(frames*frames,axis=1))
        threshold=max(.0012,float(rms.max())*.035)
        active=rms>threshold;indices=np.flatnonzero(active)
        asr=byid[c['id']];observed,times=character_times(asr['words'])
        target=norm(c['text']);mapping={}
        for match in difflib.SequenceMatcher(None,target,observed).get_matching_blocks():
            for k in range(match.size):mapping[match.a+k]=match.b+k
        # Punctuation boundaries in the standard script, mapped to observed speech.
        boundaries=[];pos=0
        for phrase in re.split(r'(?<=[，。！？；：、])',c['text']):
            pos+=len(norm(phrase));left=[k for k in mapping if k<pos];right=[k for k in mapping if k>=pos]
            if left and right:
                a=times[mapping[max(left)]][1];b=times[mapping[min(right)]][0]
                boundaries.append((a+b)/2)
        gaps=[]
        if len(indices):
            start=int(indices[0]);stop=int(indices[-1])+1;i=start
            while i<stop:
                if active[i]:i+=1;continue
                j=i+1
                while j<stop and not active[j]:j+=1
                a=i*.01;b=j*.01
                if b-a>=.60:
                    middle=(a+b)/2;near=min((abs(middle-t) for t in boundaries),default=999)
                    left=[w['text'] for w in asr['words'] if w['end']<=middle][-4:]
                    right=[w['text'] for w in asr['words'] if w['start']>=middle][:4]
                    gaps.append({'startSec':a,'endSec':b,'durationSec':b-a,
                        'nearScriptPunctuation':near<=.45,'nearestBoundaryDistanceSec':near,
                        'beforeText':''.join(left),'afterText':''.join(right),
                        'reviewSuggested':b-a>1.1 or near>.45})
                i=j
        rows.append({'id':c['id'],'inputText':c['spokenText'],'sourceSha256':sha(path),
            'firstActiveSec':float(indices[0]*.01) if len(indices) else None,
            'lastActiveSec':float((indices[-1]+1)*.01) if len(indices) else None,
            'detectedInternalGaps':gaps,'reviewSuggested':any(g['reviewSuggested'] for g in gaps)})
        for term in ('解引用','四个字节','西语言'):
            pos=target.find(norm(term));available=[k for k in mapping if pos<=k<pos+len(norm(term))] if pos>=0 else []
            if not available:continue
            term_start=times[mapping[min(available)]][0];term_end=times[mapping[max(available)]][1]
            a=max(0,term_start-1.0);b=min(len(x)/sr,term_end+1.4)
            out=target_dir/f"{c['id']}-{term}-context.wav"
            sf.write(out,x[round(a*sr):round(b*sr)],sr,subtype='PCM_24')
            clips.append({'id':c['id'],'displayTerm':term,
                'speechInput':c['spokenText'],
                'asrText':asr['asr'],'wholeSource':path.relative_to(ROOT).as_posix(),
                'wholeSourceSha256':sha(path),'excerpt':out.relative_to(ROOT).as_posix(),
                'excerptSha256':sha(out),'startInCleanSec':a,'endInCleanSec':b,
                'syllableCertified':False,'subjectiveListeningChecked':False})
    report={'thresholdMethod':'10ms RMS > max(.0012, 3.5% maximum frame RMS); internal gaps only',
        'reviewThreshold':'gaps at least .60s, flag >1.10s or >.45s away from mapped script punctuation',
        'cueCount':len(rows),'reviewCueIds':[r['id'] for r in rows if r['reviewSuggested']],
        'allDetectedGaps':sum(len(r['detectedInternalGaps']) for r in rows),'cues':rows,
        'subjectiveListeningChecked':False,'limits':'Silence is not automatically an error. No samples were removed or shortened by this audit.'}
    save(OUT/'pause-audit.json',report)
    save(target_dir/'evidence.json',{'terms':['解引用','四个字节','C语言'],'clips':clips,
        'scope':'Actual full-sentence audio and playable context evidence. Exact speech input and ASR aid review; neither proves all phonemes/tones or pleasantness.',
        'subjectiveListeningChecked':False,'phonemeCertified':False})
    print(json.dumps({'cueCount':len(rows),'reviewCueIds':report['reviewCueIds'],'internalGaps':report['allDetectedGaps'],'pronunciationClips':len(clips)},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
