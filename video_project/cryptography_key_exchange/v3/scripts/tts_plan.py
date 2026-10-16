"""Read-only preflight with the actual user's recent voice rate as an estimate."""
import json,re
from audio_common import ROOT,OUT,TTS,MUSIC,story,sha,save

def main():
    s=story()
    previous=ROOT.parent/'v2/work/audio/voice-generation.json'
    # Calibration recorded from the preceding personal-voice project. The
    # recovery package must remain usable when that old project is absent.
    rate=1296/279.5201666666667
    if previous.exists():
        d=json.loads(previous.read_text(encoding='utf8'))
        raw=sum(x['rawDurationSec'] for x in d.values())
        rate=sum(len(re.findall(r'[\u4e00-\u9fff]',x['text'])) for x in d.values())/raw
    cues=[]
    for c in s['cues']:
        n=len(re.findall(r'[\u4e00-\u9fff]',c['spokenText']))
        cues.append({'id':c['id'],'scene':c['scene'],'characters':n,'expectedRawSeconds':n/rate,
                     'pauseAfterSec':c.get('pauseAfterSec',.28)})
    estimate=sum(c['expectedRawSeconds']+.24+c['pauseAfterSec'] for c in cues)+s.get('openingSec',.6)+s.get('closingSec',7)
    report={'status':'ready-for-frozen-story','sourceStorySha256':s['sourceStorySha256'],
            'cueCount':len(cues),'chineseCharacterCount':sum(c['characters'] for c in cues),
            'estimatedDurationSec':estimate,'estimateRangeSec':[estimate*.94,estimate*1.07],
            'previousMeasuredCharactersPerSecond':rate,'estimateBasis':'Previous actual local personal-voice generation; not a guaranteed duration',
            'referenceSha256':sha(TTS/'work/clone-reference.wav'),'musicSha256':sha(MUSIC),
            'copiedOldNarration':False,'timeStretch':False,'cues':cues}
    save(OUT/'preflight-plan.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='cues'},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
