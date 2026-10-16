"""Create bounded native terms then complete revised Chinese sentence sources."""
import os,json,hashlib,gc,time
from pathlib import Path
import numpy as np,soundfile as sf
import build_audio_v02 as b
ROOT=b.ROOT;OUT=b.OUT/'pronunciation'
for p in (b.OUT,b.RAW,b.CLEAN,b.ASR,b.PUBLIC,OUT):p.mkdir(parents=True,exist_ok=True)
os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
import torch
from qwen_tts import Qwen3TTSModel
torch.set_num_threads(4)
items=[('kagan-native-short','Henri Kagan.','French'),('soai-native-katakana','ケンソー・ソアイ。','Japanese'),('pasteur-native-short','Louis Pasteur.','French')]
model=Qwen3TTSModel.from_pretrained(str(b.TTS_ROOT/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
prompt=model.create_voice_clone_prompt(ref_audio=str(b.REF),ref_text=b.read(b.REF_META)['text'])
for i,(name,text,lang) in enumerate(items):
 path=OUT/(name+'.wav');meta=OUT/(name+'.json')
 if path.exists() and meta.exists():continue
 params={'temperature':.28,'top_p':.8,'repetition_penalty':1.08,'max_new_tokens':160,'non_streaming_mode':True};seed=2026101810+i;torch.manual_seed(seed);t=time.time()
 waves,sr=model.generate_voice_clone(text=text,language=lang,voice_clone_prompt=prompt,**params);sf.write(path,np.asarray(waves[0]),sr,subtype='PCM_24')
 b.save(meta,{'text':text,'language':lang,'seed':seed,'params':params,'referenceSha256':b.sha(b.REF),'seconds':len(waves[0])/sr,'sha256':b.sha(path),'elapsedSeconds':time.time()-t});print(name,len(waves[0])/sr,flush=True)
del model,prompt;gc.collect();torch.cuda.empty_cache()
rows=b.read(b.PATCH)['clips'];b.carry_unchanged(rows);b.generate(rows)
print('FORMAL_SOURCES_READY',flush=True)
