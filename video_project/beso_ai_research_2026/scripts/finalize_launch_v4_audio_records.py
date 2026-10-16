"""Freeze selected voice, ASR and music evidence without changing the audio.

ASR content validation and timestamp alignment are reported separately. Raw
recognition, terminology spelling differences and listening limitations stay.
"""
from pathlib import Path
import hashlib,json,sys
import soundfile as sf
from qc import chars

R=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text('utf-8-sig'))
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n','utf8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

plan=read(R/'research/launch-v4-voice-plan.json')
master=R/'public/audio/launch-v4-master.wav';master_digest=sha(master)
master_asr=read(R/'audio/asr-qwen-v4/master.json')
if master_asr['finalMasterSHA256']!=master_digest:raise ValueError('Master ASR is stale')
selected=[];calls=[];events=[]
for row in plan['shots']:
    take=read(R/'audio/takes'/f"{row['id']}.json")
    independent=read(R/'audio/asr-qwen-v4'/f"{row['id']}.json")
    whisper=read(R/'audio/asr'/f"{row['id']}.json")
    voice=R/take['processed'];raw=R/take['raw']
    digest=sha(voice)
    if digest!=take['sha256'] or digest!=independent['sourceSHA256'] or digest!=whisper['sourceSHA256']:
        raise ValueError('Selected source hash mismatch '+row['id'])
    if sha(raw)!=take['rawSHA256']:raise ValueError('Raw source hash mismatch '+row['id'])
    expected,heard=chars(row['text']),chars(independent['heard'])
    selected.append(dict(id=row['id'],scene=row['scene'],model=take['model'],voice=take['voiceId'],
        canonicalText=row['text'],ttsInput=take['ttsText'],durationSeconds=take['duration'],
        rawFile=take['raw'],rawSHA256=take['rawSHA256'],processedFile=take['processed'],processedSHA256=digest,
        independentASRRatio=independent['ratio'],independentASRHeard=independent['heard'],
        independentASREndingCovered=expected[-4:]==heard[-4:],
        whisperRawRatio=whisper['ratio'],whisperFlags=whisper['flags'],rawEndpointFlag=take['rawEndpointFlag'],
        processing=take['processing']['profile'],personalReferenceUploaded=False))
    calls.append({k:independent[k] for k in ['id','model','ratio','sourceSHA256','requestId','usage']})
    run=read(R/'audio/cloud-runs'/f"{row['id']}.json")
    for segment in run.get('segments',[dict(text=run['text'],language='auto',events=run['events'])]):
        completed=[e['response'] for e in segment['events'] if e.get('type')=='response.done']
        events.extend(dict(id=row['id'],text=segment['text'],language=segment['language'],model=run['model'],
            voiceId=run['voiceId'],responseId=e.get('id'),status=e.get('status'),usage=e.get('usage')) for e in completed)

passed=all(x['independentASRRatio']>=.95 for x in selected) and master_asr['ratio']>=.95
info=sf.info(master)
report=dict(revision='launch-v4-audio-frozen',masterFile=master.relative_to(R).as_posix(),masterSHA256=master_digest,
    frames=6300,seconds=info.duration,sampleRate=info.samplerate,channels=info.channels,
    storySHA256=sha(R/'src/launch-story.json'),captionsSHA256=sha(R/'src/launch-captions.json'),
    srtFile='delivery/AI-Engineer-Launch-v4.zh.srt',srtSHA256=sha(R/'delivery/AI-Engineer-Launch-v4.zh.srt'),
    selectedVoice='qwen3-tts-flash-realtime / Ethan public adult male voice; not a personal clone',
    cloneFallbackReason='Legacy voice enrollment succeeded, but runtime model returned Model not exist; enrollment is not proof of synthesis.',
    selectedTakes=selected,independentASRTarget=.95,machineContentCheckPassed=passed,
    independentSelectedMinimum=min(x['independentASRRatio'] for x in selected),
    independentSelectedMean=sum(x['independentASRRatio'] for x in selected)/len(selected),
    masterIndependentASR={k:master_asr[k] for k in ['ratio','requestId','usage','heard','finalMasterSHA256']},
    terminologySpellingDifferences=[dict(term='BESO / 贝索',heard='贝佐',status='Raw ASR spelling retained; pronunciation listening not verified'),
        dict(term='Z-wind',isolatedHeard='Z wind',masterHeard='SeeWind',status='English ASR spelling differs across contexts; raw outputs retained')],
    captionAlignment='CPU Whisper word times mapped to canonical clauses; phonetic recognition misses lower matching scores. Qwen ASR supplies independent content validation, not word timing.',
    captionTimingSpotChecks=[dict(term='贝索',fromMs=19550,toMs=23990,inspection='Two readable clauses; no instant fragment or out-of-window timing'),
        dict(term='Z-wind',fromMs=38160,toMs=42240,inspection='Two readable clauses; minimum 940ms final clause')],
    rawEndpointFlagsRetained=[x['id'] for x in selected if x['rawEndpointFlag']],
    edgeProtection='80ms leading / 160ms trailing source guards, measured filter-delay compensation; no hard gate, pitch shift or time stretch.',
    sourceLanguageControl='Z-wind is synthesized in English then the Chinese clause in Chinese, same voice; 40ms inserted intersegment silence. Other lines use auto language.',
    subjectiveListeningChecked=False,pronunciationListeningVerified=False,
    listeningLimitation='No callable subjective listening tool; content matching, waveform and codec checks do not certify voice pleasantness or exact phonetics.')
write(R/'research/qa/launch-v4-audio-frozen.json',report)
write(R/'research/qa/launch-v4-qwen-asr-calls.json',dict(provider='Alibaba Cloud / Qwen3-ASR',
    textPromptUsed=False,uploadedAudio='Selected synthetic film sentence sources and master mix; no personal voice reference.',
    selectedRecords=calls,masterRecord={k:master_asr[k] for k in ['id','model','ratio','sourceSHA256','finalMasterSHA256','requestId','usage']},
    selectedMinimum=report['independentSelectedMinimum'],selectedMean=report['independentSelectedMean'],
    contentTarget=.95,machineContentCheckPassed=passed,subjectiveListeningChecked=False))
write(R/'research/qa/launch-v4-cloud-voice-calls.json',dict(provider='Alibaba Cloud',
    model='qwen3-tts-flash-realtime',voice='Ethan',publicVoice=True,personalReferenceUploaded=False,
    selectedResponseRecords=events,usageScope='Selected final responses only; rejected experiments and old candidates remain in original records. This is not a settled invoice.',
    fallbackRecordFolder='work/audio-v4/cloud-clone-probe',subjectiveListeningChecked=False))
audio=read(R/'research/qa/launch-v4-audio.json')
audio.update(independentASRTarget=.95,machineContentCheckPassed=passed,
    independentSelectedMinimum=report['independentSelectedMinimum'],independentSelectedMean=report['independentSelectedMean'],
    masterIndependentASRRatio=master_asr['ratio'],masterIndependentASRFinalHash=master_asr['finalMasterSHA256'],
    freezeRecord='research/qa/launch-v4-audio-frozen.json',captionAlignmentLimitation=report['captionAlignment'])
write(R/'research/qa/launch-v4-audio.json',audio)
print(json.dumps(dict(masterSHA256=master_digest,seconds=info.duration,selected=len(selected),
    contentCheckPassed=passed,independentMinimum=report['independentSelectedMinimum'],masterASR=master_asr['ratio']),ensure_ascii=False))
if not passed:sys.exit(1)
