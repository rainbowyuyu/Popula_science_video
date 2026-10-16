"""Unprompted/no-VAD ASR of numerical and optical terms; not a listening test."""
from pathlib import Path
import json,difflib,re,sys,subprocess
from faster_whisper import WhisperModel
from opencc import OpenCC
ROOT=Path(__file__).resolve().parents[1];sys.stdout.reconfigure(encoding='utf8')
# Refresh the cached expected-text mapping after traditional-script/number
# normalization. All current hashes already exist, so this loads no ASR model.
subprocess.run([sys.executable,str(ROOT/'scripts/align_audio_v06.py')],check=True)
model=WhisperModel('D:/python_project/tts/models/whisper-small',device='cpu',compute_type='int8',cpu_threads=3)
story=json.loads((ROOT/'research/story.json').read_text('utf8'));rows=[]
cc=OpenCC('t2s')
def norm(s):
 s=cc.convert(s)
 for a,b in [('四十二','42'),('四十','40'),('五十一','51')]:s=s.replace(a,b)
 return re.sub(r'[^\u4e00-\u9fff0-9]','',s)
for cid in ['r001','r018','r035','r037']:
 row=next(x for x in story['clips'] if x['id']==cid);segs,_=model.transcribe(str(ROOT/f'public/audio/{cid}.wav'),language='zh',beam_size=3,vad_filter=False,word_timestamps=True,condition_on_previous_text=False)
 segs=list(segs);recognized=''.join(s.text for s in segs);rec={'id':cid,'expected':row['spoken'],'recognized':recognized,'similarity':difflib.SequenceMatcher(None,norm(row['spoken']),norm(recognized)).ratio(),'words':[{'text':w.word,'start':w.start,'end':w.end} for s in segs for w in (s.words or [])],'initialPrompt':None,'noVAD':True,'subjectiveListeningChecked':False};rows.append(rec);print(cid,round(rec['similarity'],3),flush=True)
 (ROOT/'research/audio/unprompted-terms-v06.json').write_text(json.dumps({'noPrompt':True,'humanListeningChecked':False,'rows':rows},ensure_ascii=False,indent=2)+'\n','utf8')
