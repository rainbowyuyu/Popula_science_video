"""Bind completed V4 audio QA to exact source and timeline hashes."""
import datetime,json,pathlib,shutil,sys
P=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(P/'scripts'))
from voice import read,save,sha

tl=read(P/'public/timeline.json');story=read(P/'docs/story.json')
validation=read(P/'research/audio-validation.json');mix=read(P/'research/audio-report.json')
qa=read(P/'research/voice-qa.json');selection=read(P/'research/revision-v4/voice-selection.json')
assert validation['passed'] and qa['completed']==qa['total']==len(story['shots'])==72
assert not qa['flagged']
assert read(P/'src/timeline.json')==tl
assert validation['totalFrames']==tl['duration']
assert mix['hashes']['timeline.json']==sha(P/'public/timeline.json')
rows=[]
for shot,clip in zip(story['shots'],tl['clips']):
    take=read(P/'audio/takes'/f"{shot['id']}.json");asr=read(P/'audio/asr'/f"{shot['id']}.json")
    assert take['ttsText']==shot['ttsText']==asr['expected']
    assert take['sha256']==asr['sourceSHA256']==clip['audioSHA256']==sha(P/take['processed'])
    assert not take.get('rawEndpointFlag')
    row={'id':shot['id'],'sha256':take['sha256'],'expected':asr['expected'],'heard':asr['heard'],'ratio':asr['ratio'],'flags':asr['flags'],'duration':take['duration'],'rawEndpointDB':take['rawEndpointDB'],'subjectiveListeningChecked':False}
    gp=P/'audio/asr-glossary'/f"{shot['id']}.json"
    if gp.exists():
        glossary=read(gp)
        if glossary.get('sourceSHA256')==take['sha256']:
            row['glossaryHeard']=glossary['heard'];row['glossaryRatio']=glossary['ratio']
    rows.append(row)

old=P/'research/revision-v4/voice-review.json';archive=P/'research/revision-v4/voice-review-firstpass.json'
if old.exists() and not archive.exists():shutil.copy2(old,archive)
save(old,{'revision':'V4-final-audio-screen','reviewedCount':72,'totalStoryClips':72,'requiredRegeneration':[],
    'selectedRevisions':selection,'allAutomaticFlagsCleared':True,'asrTextReviewed':True,'subjectiveListeningChecked':False,
    'scope':'All72 unprompted ASR records compared with spoken script; new candidates separately screened and selected; second medical-vocabulary pass is supporting evidence only. Homophone ASR substitutions do not certify speech errors or flawless pronunciation. No subjective listening claimed.',
    'remainingVerificationLimit':'Actual pleasantness, articulation and Mandarin tone perception require subjective listening; not asserted by this automated lock.',
    'clips':rows})
story['status']='v4-audio-locked';story['audioLockedUTC']=datetime.datetime.now(datetime.timezone.utc).isoformat();save(P/'docs/story.json',story)
lock={'revision':'V4','lockedUTC':story['audioLockedUTC'],'fps':tl['fps'],'totalFrames':tl['duration'],'durationSeconds':tl['durationSeconds'],'voiceCount':len(tl['clips']),'captionCount':len(tl['captions']),'referencesTailSeconds':tl['outro']['duration']/tl['fps'],
    'hashes':{name:sha(P/'public'/name) for name in ['timeline.json','master.wav','narration.wav','music.wav']},'storySHA256':sha(P/'docs/story.json'),
    'masterLUFS':float(mix['masterMeasurement']['input_i']),'masterTruePeakDBTP':float(mix['masterMeasurement']['input_tp']),'aacTruePeakDBTP':float(mix['aacMeasurement']['input_tp']),
    'voiceOverMusicActiveDB':mix['voiceOverMusicActiveDB'],'voiceSpeedFactor':1,'rawEndpointFlags':0,'automaticASRFlags':0,'subjectiveListeningChecked':False,'validationFile':'research/audio-validation.json','firstPassReviewRetained':'research/revision-v4/voice-review-firstpass.json'}
save(P/'research/revision-v4/audio-lock.json',lock)
print(json.dumps(lock,ensure_ascii=True,indent=2))
