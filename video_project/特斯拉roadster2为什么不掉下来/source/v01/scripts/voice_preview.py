"""Local user-voice generation. No reference export, no remote service, no time stretch.
Uses existing documented TTS library and opt-in mastering module, not legacy film script.
"""
from pathlib import Path
import os,sys,json,hashlib,math,shutil
ROOT=Path(__file__).resolve().parents[3]
TTS=Path('D:/python_project/tts')
os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
os.environ['TMP']=str(ROOT/'work/v01/tmp');os.environ['TEMP']=os.environ['TMP']
Path(os.environ['TMP']).mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(TTS))
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel
from broadcast_voice import master_voice
assert torch.cuda.is_available(),'Local CUDA unavailable; no alternate service submitted'
OUT=ROOT/'audio/v01';OUT.mkdir(parents=True,exist_ok=True)
ASSETS=ROOT/'assets/v01';ASSETS.mkdir(parents=True,exist_ok=True)
WORK=ROOT/'work/v01/audio';WORK.mkdir(parents=True,exist_ok=True)
clips=json.loads((ROOT/'source/v01/narration/preview.json').read_text(encoding='utf-8'))
torch.set_num_threads(4)
model=None;prompt=None;rows=[];cursor=0;parts=[];srout=48000;fps=30
for i,c in enumerate(clips):
    raw=OUT/f'{c["id"]}-raw.wav';clean=OUT/f'{c["id"]}-clean.wav';seed=6410+i
    if not raw.exists():
        if model is None:
            model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
            # Engine consumes existing local reference internally. Never print, copy or serialize reference data.
            reference=json.loads((TTS/'work/clone-reference.json').read_text(encoding='utf-8'))
            prompt=model.create_voice_clone_prompt(ref_audio=str(TTS/'work/clone-reference.wav'),ref_text=reference['text'])
        torch.manual_seed(seed)
        wave,sr=model.generate_voice_clone(text=c['spokenText'],language='Chinese',voice_clone_prompt=prompt,non_streaming_mode=True,temperature=.65,top_p=.9,repetition_penalty=1.08,max_new_tokens=600)
        sf.write(raw,wave[0],sr,subtype='PCM_24')
    w,sr=sf.read(raw)
    if not clean.exists():
        protected=WORK/f'{c["id"]}-protected.wav'
        sf.write(protected,np.pad(w,(round(.08*sr),round(.16*sr))),sr,subtype='PCM_24')
        master_voice(protected,clean,WORK/f'{c["id"]}-mastering.json')
    a,sr=sf.read(clean);assert sr==srout
    # Preserve entire clean clip, append only a small sentence/scene pause, round to video frame.
    nframes=math.ceil((len(a)/sr+.30)*fps);samples=nframes*1600
    parts.append(np.pad(a,(0,samples-len(a))))
    weights=[len(s) for s in c['captions']];total=sum(weights);bound=0;subs=[]
    for text,weight in zip(c['captions'],weights):
        start=cursor+round(bound/total*len(a)/sr*fps);bound+=weight
        end=cursor+round(bound/total*len(a)/sr*fps)
        subs.append({'text':text,'from':start,'to':end,'alignment':'proportional draft; not ASR validated'})
    rows.append({**c,'from':cursor,'durationInFrames':nframes,'audioSeconds':len(a)/sr,'captions':subs,'seed':seed,'rawSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'cleanSha256':hashlib.sha256(clean.read_bytes()).hexdigest()})
    cursor+=nframes
    print(c['id'],'seconds',len(a)/sr,'frames',nframes,flush=True)
narration=OUT/'preview-narration.wav';sf.write(narration,np.concatenate(parts),srout,subtype='PCM_24')
shutil.copy2(narration,ASSETS/narration.name)
manifest={'fps':fps,'durationInFrames':cursor,'width':1920,'height':1080,'audioFile':narration.name,'scenes':rows,'voice':'existing local personal reference; Qwen3-TTS-0.6B','subjectiveListeningChecked':False,'asrChecked':False,'timeStretch':False,'referenceExported':False}
(ROOT/'source/v01/timeline-preview.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'preview-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('VOICE_COMPLETE',cursor/fps,'seconds')
