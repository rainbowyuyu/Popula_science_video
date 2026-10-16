from pathlib import Path
import json
root=Path(__file__).resolve().parents[1];audio=root/'audio/v02'
sub=json.loads((audio/'pronunciation-substitution-v02.json').read_text('utf8'))
qa=json.loads((audio/'final-audio-qa-v02.json').read_text('utf8'))
summary={'version':'nobel-chemistry-2026-v02-corrected','voice':{'model':'Qwen3-TTS-0.6B','referenceFile':'D:/python_project/tts/work/clone-reference.wav','referenceSha256':'dd8b89f70ab634af820966c01f3af535adcba7323427866d646c0dc1f6280bf7','naturalSpeed':True},'editedClips':{rid:{'outputSha256':rec['outputSha256'],'editedSeconds':rec['editedSeconds'],'names':[{k:v for k,v in e.items() if k!='piece'} for e in rec['edits']]} for rid,rec in sub.items()},'music':{'title':'Dawn','author':'Sappheiros','sourceSha256':'8556bbed93aadb67a8d9bac32f57abf93b7053048d4cdbccddb450539e71b1dc','attribution':'Music: Dawn — Sappheiros. Creative Commons Attribution / creator permission. https://soundcloud.com/sappheirosmusic/dawn'},'master':{'path':'audio/v02/master.wav','sha256':qa['sourceSha256'],'durationSeconds':qa['durationSeconds']},'checks':{'captionTextExact':qa['captionTextExact'],'asrFlagged':qa['asrCriticalFlags'],'humanListeningChecked':False,'automatedScreenOnly':True,'machineAudioReview':'audio/v02/whole-sentence-review/index.json'}}
(audio/'audio-manifest-v02.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('SUMMARY_READY',len(sub))
