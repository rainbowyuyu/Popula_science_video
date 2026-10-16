"""Final onset repair: unchanged piano performance/arrangement, updated narration.

All 89 visual shot slots are held exactly. Produces a new mix rather than
overwriting previous candidates or production audio.
"""
from pathlib import Path
from datetime import datetime,timezone
from copy import deepcopy
import sys,json,hashlib,math,subprocess,os,shutil
import numpy as np
import soundfile as sf
BASE=Path(__file__).resolve().parent;ROOT=BASE.parents[2];OUT=BASE/'music-final';SR=48000;HOP=480;BLOCK=SR*20
sys.path.insert(0,str(ROOT/'scripts'))
from mix_v5 import measure
def read(p):return json.loads(Path(p).read_text(encoding='utf8'))
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for block in iter(lambda:f.read(4*1024*1024),b''):h.update(block)
 return h.hexdigest()
def run(args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
def main():
 OUT.mkdir(exist_ok=False)
 report=read(BASE/'music-candidate-02/audio-candidate-report.json');tl=read(BASE/'staged/timeline.json');prior=read(BASE/'staged-pre-head-fix/timeline.json')
 assert tl['durationFrames']==prior['durationFrames']==26738
 assert [(c['id'],c['start'],c['end']) for c in tl['clips']]==[(c['id'],c['start'],c['end']) for c in prior['clips']]
 n=tl['durationFrames']*1600;voice=BASE/'staged/narration.wav';music=BASE/'music-candidate-02/music.wav'
 assert sha(music)==report['hashes']['music.wav']
 locked={p.relative_to(ROOT).as_posix():sha(p) for p in [voice,BASE/'staged/timeline.json',ROOT/'docs/story-v8.json']}
 for path in [music,BASE/'music-candidate-02/control-envelope.npz']:
  target=OUT/path.name
  try:os.link(path,target)
  except OSError:shutil.copyfile(path,target)
 pre=OUT/'premaster.wav';ve=me=0.;threshold=.006
 with sf.SoundFile(voice) as v,sf.SoundFile(music) as m,sf.SoundFile(pre,'w',samplerate=SR,channels=2,subtype='FLOAT') as writer:
  assert len(v)==len(m)==n and v.samplerate==m.samplerate==SR
  for offset in range(0,n,BLOCK):
   count=min(BLOCK,n-offset);x=v.read(count,dtype='float32');y=m.read(count,dtype='float32',always_2d=True);writer.write(y+x[:,None])
   frames=count//HOP;vr=np.mean(x[:frames*HOP].reshape(-1,HOP).astype(np.float64)**2,axis=1);mr=np.mean(y[:frames*HOP].reshape(-1,HOP,2).astype(np.float64)**2,axis=(1,2));active=np.sqrt(vr)>threshold;ve+=float(vr[active].sum());me+=float(mr[active].sum())
 measured=measure(pre);master=OUT/'master.wav'
 filt=(f"loudnorm=I=-15:TP=-2:LRA=11:measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:linear=true:print_format=none,aresample={SR},apad=whole_len={n},atrim=end_sample={n}")
 run(['ffmpeg','-v','error','-n','-i',str(pre),'-af',filt,'-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(master)])
 finalmeasure=measure(master);aac=OUT/'master-aac-check.m4a';run(['ffmpeg','-v','error','-n','-i',str(master),'-c:a','aac','-b:a','320k',str(aac)]);aacmeasure=measure(aac)
 assert -16<=float(aacmeasure['input_i'])<=-14 and float(aacmeasure['input_tp'])<=-1
 previews=[]
 for name,sid,span in [('opening','h001',24),('cleavage','h026',44),('lipids','h035',24),('pressure','h060',24),('emergency','h077',18),('ending','h089',20)]:
  c=next(c for c in tl['clips'] if c['id']==sid);start=c['startSeconds'];span=min(span,n/SR-start);dest=OUT/f'preview-{name}.m4a'
  run(['ffmpeg','-v','error','-n','-ss',str(start),'-i',str(master),'-t',str(span),'-c:a','aac','-b:a','256k',str(dest)]);previews.append({'name':name,'startSeconds':start,'durationSeconds':span,'path':str(dest.relative_to(ROOT)),'sha256':sha(dest),'subjectiveListeningCompleted':False})
 final=deepcopy(report);final.update(createdUTC=datetime.now(timezone.utc).isoformat(),timelineSHA256=sha(BASE/'staged/timeline.json'),storySHA256=tl['storySHA256'],narrationSHA256=sha(voice),lockedStagedInputs=locked,masterMeasurement=finalmeasure,aacMeasurement=aacmeasure,premasterMeasurement=measured,comparisonExtracts=previews,voiceOverMusicActiveDB=10*math.log10(ve/me),voiceActivityThresholdForThisMeasurement=threshold,hashes={name:sha(OUT/name) for name in ['music.wav','master.wav','master-aac-check.m4a','control-envelope.npz']},scriptSHA256=sha(__file__))
 final['finalOnsetRevision']={'sentenceIds':['h006','h027','h037'],'allShotStartEndFramesUnchanged':True,'musicalStemSHA256Unchanged':sha(music),'parentRequestedFreezeAfterThisRevision':True,'priorMixReport':str(BASE/'music-candidate-02/audio-candidate-report.json'),'measuredVoiceEndChangesSeconds':{c['id']:c['voiceEndSeconds']-next(o['voiceEndSeconds'] for o in prior['clips'] if o['id']==c['id']) for c in tl['clips'] if c['id'] in ['h006','h027','h037']},'note':'New fragments retain every source sample; observations absorb their length differences. Musical phrases and slow gain envelope remain exactly as the selected piano candidate.'}
 assert all(sha(ROOT/p)==h for p,h in locked.items());assert sf.info(master).frames==n
 (OUT/'audio-candidate-report.json').write_text(json.dumps(final,ensure_ascii=False,indent=2)+'\n',encoding='utf8');pre.unlink()
 print(json.dumps({'ready':True,'durationFrames':tl['durationFrames'],'masterSHA256':sha(master),'musicSHA256':sha(music),'AAC':aacmeasure,'voiceOverMusicActiveDB':final['voiceOverMusicActiveDB']},ensure_ascii=False),flush=True)
if __name__=='__main__':main()
