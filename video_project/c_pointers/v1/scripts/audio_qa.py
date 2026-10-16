"""Verify voice sources, sample-level assembly, subtitle coverage and sources."""
import json,re
import numpy as np
import soundfile as sf
from audio_common import ROOT,OUT,SR,FPS,sha,save

def db(x):return float(20*np.log10(max(float(x),1e-12)))
def edge(x,sr):
    n=max(1,round(.02*sr));return {'head20msRmsDb':db(np.sqrt(np.mean(x[:n]**2))),
        'tail20msRmsDb':db(np.sqrt(np.mean(x[-n:]**2))),'peakDb':db(np.max(np.abs(x))),
        'nearFullScaleSamples':int(np.sum(np.abs(x)>.999))}
def main():
    narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'));caps=json.loads((OUT/'captions.json').read_text(encoding='utf8'))['cues']
    ledger=json.loads((OUT/'voice-generation.json').read_text(encoding='utf8'))
    assembled,sr=sf.read(OUT/'narration.wav',dtype='float32');assert sr==SR
    rows=[];activeTotal=coveredTotal=0
    for c in narr['cues']:
        raw,rs=sf.read(OUT/'raw'/f"{c['id']}.wav",dtype='float32');clean,cs=sf.read(ROOT/c['audio'],dtype='float32')
        a,b=c['startSample'],c['endSample'];equal=np.array_equal(assembled[a:b],clean)
        process=json.loads((OUT/'processing'/f"{c['id']}.json").read_text(encoding='utf8'))
        assert equal and process['originalRawSha256']==ledger[c['id']]['sha256'] and process['outputSha256']==sha(ROOT/c['audio'])
        assert process['preservedLengthSamples'] and len(clean)==round((len(raw)/rs+.24)*SR)
        block=480;en=np.sqrt(np.mean(clean[:len(clean)//block*block].reshape(-1,block)**2,axis=1));active=en>max(.002,float(en.max())*.06)
        covered=np.zeros_like(active)
        for cap in (z for z in caps if z['cueId']==c['id']):
            left=max(0,int(np.floor((cap['startFrame']/FPS-c['startSec'])*100)))
            right=min(len(covered),int(np.ceil((cap['endFrame']/FPS-c['startSec'])*100)))
            covered[left:right]=True
        activeTotal+=int(active.sum());coveredTotal+=int(np.sum(active&covered))
        rows.append({'id':c['id'],'raw':edge(raw,rs),'clean':edge(clean,cs),'fullSourceIncludedSampleExact':equal,
            'rawSeconds':len(raw)/rs,'cleanSeconds':len(clean)/cs,'filterLatencySamples':process['measuredLatencySamples'],
            'captionEnergyCoverage':float(np.sum(active&covered)/max(1,active.sum())),
            'tailReviewSuggested':edge(raw,rs)['tail20msRmsDb']>-35,'subjectiveListeningChecked':False})
    assert all(c['startFrame']>=0 and c['endFrame']<=narr['durationFrames'] for c in caps)
    assert all(a['endFrame']<=b['startFrame'] for a,b in zip(caps,caps[1:]))
    assert all(re.search(r'[\w\u4e00-\u9fff]',c['text']) for c in caps),'Orphan punctuation subtitle'
    assert all(not re.match(r'^[，。！？；：、”）]',c['text']) for c in caps),'Leading punctuation subtitle'
    ratio=coveredTotal/max(activeTotal,1);assert ratio>=.95
    assert min(r['captionEnergyCoverage'] for r in rows)>=.95
    report={'durationSec':narr['durationSec'],'durationFrames':narr['durationFrames'],'fps':FPS,'voiceSamples':len(assembled),
        'expectedSamples':narr['durationFrames']*SR//FPS,'sampleExactSources':True,'subtitleSpeechEnergyCoverage':ratio,
        'subtitleCount':len(caps),'maxSubtitleCharacters':max(map(lambda c:len(c['text']),caps)),
        'minimumPerCueSpeechEnergyCoverage':min(r['captionEnergyCoverage'] for r in rows),
        'tailReviewCandidates':[r['id'] for r in rows if r['tailReviewSuggested']],
        'orphanPunctuationCaptions':0,'leadingPunctuationCaptions':0,
        'subjectiveListeningChecked':False,'cues':rows}
    assert len(assembled)==report['expectedSamples']
    save(OUT/'source-qa.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='cues'},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
