"""Read-only preflight and source-based duration estimate, without loading TTS."""
import re,json,hashlib
from pathlib import Path
from audio_common import ROOT,OUT,TTS,MUSIC,SR,FPS,story,sha,save

def main():
    s=story();old=ROOT.parent/'v1/work/audio/voice-generation.json';ledger=json.loads(old.read_text(encoding='utf8'))
    oldtext=sum(len(re.findall(r'[\u4e00-\u9fff]',r['text'])) for r in ledger.values())
    oldseconds=sum(r['rawDurationSec'] for r in ledger.values());rate=oldtext/oldseconds
    rows=[]
    for c in s['cues']:
        n=len(re.findall(r'[\u4e00-\u9fff]',c['spokenText']))
        rows.append({'id':c['id'],'scene':c['scene'],'characters':n,'expectedRawSeconds':n/rate,
            'pauseAfterSec':c.get('pauseAfterSec',.16),'termReview':re.findall(r'密钥|公钥|私钥|迪菲|赫尔曼|长|行|重',c['text'])})
    raw=sum(r['expectedRawSeconds'] for r in rows);estimated=raw+len(rows)*.24+sum(r['pauseAfterSec'] for r in rows)+s.get('openingSec',.6)+s.get('closingSec',7)
    report={'status':'prepared-not-generated','sourceStorySha256':s['sourceStorySha256'],'cueCount':len(rows),
        'chineseCharacterCount':sum(r['characters'] for r in rows),'totalInputCharacters':sum(len(c['spokenText']) for c in s['cues']),
        'estimatedRawVoiceSeconds':raw,'estimatedFilmSeconds':estimated,'rangeSec':[estimated*.94,estimated*1.07],
        'estimateBasis':'V1 actual personal local Qwen3 raw duration per spoken Chinese character; estimate, not actual timing',
        'priorCharactersPerSecond':rate,'localModel':'Qwen3-TTS-0.6B','referenceSha256':sha(TTS/'work/clone-reference.wav'),
        'musicSource':str(MUSIC),'musicSha256':sha(MUSIC),'timeStretch':False,'inheritedNarrationSources':False,'cues':rows}
    save(OUT/'preflight-plan.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='cues'},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
