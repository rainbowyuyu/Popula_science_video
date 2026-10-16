"""Generate measured local Qwen3-TTS narration for Nobel Chemistry 2026 V01."""
from __future__ import annotations
import hashlib,json,os,shutil,subprocess,time
from pathlib import Path
import numpy as np, soundfile as sf
ROOT=Path(__file__).resolve().parents[1]
TTS_ROOT=Path('D:/python_project/tts'); TTS_PY=TTS_ROOT/'.venv/Scripts/python.exe'
PATCH=ROOT/'docs/v01/narration-v01.json'; OUT=ROOT/'audio/v01'; RAW=OUT/'raw'; CLEAN=OUT/'clean'; PUBLIC=ROOT/'public/audio-v01'; REF=TTS_ROOT/'work/clone-reference.wav'; REF_META=TTS_ROOT/'work/clone-reference.json'
MUSIC=ROOT/'audio/v01/music-source.m4a'; PAUSE=.55

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def run(args): return subprocess.run(args,cwd=ROOT,check=True,text=True,encoding='utf-8')
def spoken(t): return t.replace('Henri B. Kagan','Henri B Kagan').replace('Kenso Soai','Kenso Soai').replace('Louis Pasteur','Louis Pasteur').replace('Charles Frank','Charles Frank')
def generate(rows):
 import torch
 from qwen_tts import Qwen3TTSModel
 os.environ['HF_HUB_OFFLINE']='1'; os.environ['TOKENIZERS_PARALLELISM']='false'; torch.set_num_threads(4)
 refmeta=json.loads(REF_META.read_text(encoding='utf8')); ledger_path=OUT/'tts-generation-v01.json'; ledger=json.loads(ledger_path.read_text(encoding='utf8')) if ledger_path.exists() else {}
 model=Qwen3TTSModel.from_pretrained(str(TTS_ROOT/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa'); prompt=model.create_voice_clone_prompt(ref_audio=str(REF),ref_text=refmeta['text'])
 params={'temperature':.42,'top_p':.85,'repetition_penalty':1.05,'max_new_tokens':1536,'non_streaming_mode':True}; rh=sha(REF)
 for i,r in enumerate(rows):
  rid=r['id']; text=spoken(r['spoken']); target=RAW/f'{rid}.wav'; spec={'text':text,'referenceSha256':rh,'model':'Qwen3-TTS-0.6B','seed':20261008+i,'parameters':params}; req=hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
  if ledger.get(rid,{}).get('requestHash')==req and target.exists(): continue
  torch.manual_seed(20261008+i); t=time.time(); waves,sr=model.generate_voice_clone(text=[text],language=['Auto'],voice_clone_prompt=prompt,**params); wave=np.asarray(waves[0]).squeeze()
  if wave.ndim!=1 or not np.isfinite(wave).all() or len(wave)<sr*.2: raise RuntimeError(rid)
  RAW.mkdir(parents=True,exist_ok=True); sf.write(target,wave,sr,subtype='PCM_24'); ledger[rid]={**spec,'requestHash':req,'seconds':len(wave)/sr,'sampleRate':sr,'sha256':sha(target),'elapsedSeconds':time.time()-t}; ledger_path.write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf8'); print('generated',rid,len(wave)/sr,flush=True)
def parts(texts,d):
 start=.06; end=max(start+.2,d-.08); ws=[max(1,len(''.join(t.split())))+('。！？；：' in t)*3 for t in texts]; total=sum(ws); cur=start; out=[]
 for i,(t,w) in enumerate(zip(texts,ws)):
  nxt=end if i==len(texts)-1 else cur+(end-start)*w/total; out.append({'start':round(cur,3),'end':round(nxt,3),'text':t,'source':f'v01-{i:02d}'}); cur=nxt
 return out
def clean(rows):
 import sys;sys.path.insert(0,str(TTS_ROOT));from broadcast_voice import master_voice
 out=[]
 for r in rows:
  rid=r['id']; raw=RAW/f'{rid}.wav'; bc=CLEAN/f'{rid}-broadcast.wav'; report=CLEAN/f'{rid}-broadcast.json'; master_voice(raw,bc,report); sec=sf.info(bc).duration; target=CLEAN/f'{rid}.wav'; run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(bc),'-af',f'afade=t=in:d=0.012,afade=t=out:st={max(.02,sec-.05):.6f}:d=0.04','-ar','48000','-ac','2','-c:a','pcm_s24le',str(target)]); out.append({**r,'naturalSeconds':sf.info(target).duration,'audio':target.relative_to(ROOT).as_posix()})
 return out
def timeline(rows):
 clips=[];cur=0
 for r in rows:
  d=float(r['naturalSeconds']); n={k:v for k,v in r.items() if k not in {'subtitleTexts','naturalSeconds','audio'}}; n.update({'audioSeconds':round(d,3),'start':cur,'end':cur+round(d*30),'subtitleParts':parts(r['subtitleTexts'],d),'audio':r['audio']});clips.append(n);cur=n['end']+round(PAUSE*30)
 return {'version':'nobel-chemistry-2026-v01-natural-story','fps':30,'duration':cur-round(PAUSE*30),'seconds':(cur-round(PAUSE*30))/30,'clips':clips,'editorial':{'voice':'Qwen3-TTS-0.6B rainbow鱼 clone','rate':'natural; no atempo fitting','pauseSeconds':PAUSE}}
def assemble(rows,seconds):
 OUT.mkdir(parents=True,exist_ok=True); silence=OUT/'silence.wav'; run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',str(PAUSE),'-c:a','pcm_s24le',str(silence)]); concat=OUT/'concat.txt';files=[]
 for i,r in enumerate(rows): files.append(CLEAN/f"{r['id']}.wav");
 for i in range(len(rows)-1): files.insert(i*2+1,silence)
 concat.write_text('\n'.join(f"file '{p.as_posix()}'" for p in files)+'\n',encoding='utf8'); narration=OUT/'narration.wav';run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-ar','48000','-ac','2','-c:a','pcm_s24le',str(narration)])
 source=OUT/'music-source-48k.wav';run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(MUSIC),'-ar','48000','-ac','2','-c:a','pcm_s24le',str(source)]);w,sr=sf.read(source,dtype='float32',always_2d=True);total=round(seconds*sr); reps=int(np.ceil(total/len(w)))+1; loop=np.tile(w,(reps,1))[:total]; sf.write(OUT/'music-looped.wav',loop,sr,subtype='PCM_24');music=OUT/'music.wav';run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(OUT/'music-looped.wav'),'-af',f'highpass=f=65,equalizer=f=2700:t=o:w=1.6:g=-2.5,lowpass=f=15000,afade=t=in:d=2.4,afade=t=out:st={max(0,seconds-6.5):.3f}:d=6.5','-ar','48000','-ac','2','-c:a','pcm_s24le',str(music)])
 premaster=OUT/'premaster.wav';graph='[1:a]volume=0.28[m0];[m0][0:a]sidechaincompress=threshold=0.025:ratio=7:attack=25:release=520:makeup=1:link=average[mduck];[0:a]volume=1.0[v];[v][mduck]amix=inputs=2:duration=first:dropout_transition=2,aresample=48000[a]';run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(narration),'-i',str(music),'-filter_complex',graph,'-map','[a]','-ar','48000','-ac','2','-c:a','pcm_s24le',str(premaster)]);master=OUT/'master.wav';run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(premaster),'-af','loudnorm=I=-14.5:TP=-1.8:LRA=8','-ar','48000','-ac','2','-c:a','pcm_s24le',str(master)]);PUBLIC.mkdir(parents=True,exist_ok=True)
 for p in (master,narration,music):shutil.copy2(p,PUBLIC/p.name)
 return master
def main():
 patch=json.loads(PATCH.read_text(encoding='utf8'));rows=patch['clips'];generate(rows);rows=clean(rows);tl=timeline(rows);(ROOT/'src/chemistry2026/timeline-v01.json').write_text(json.dumps(tl,ensure_ascii=False,indent=2),encoding='utf8');master=assemble(rows,tl['seconds']);(OUT/'audio-manifest-v01.json').write_text(json.dumps({'version':'nobel-chemistry-2026-v01','timeline':'src/chemistry2026/timeline-v01.json','durationSeconds':tl['seconds'],'sampleRate':48000,'referenceVoice':{'model':'Qwen3-TTS-0.6B','referenceFile':str(REF),'referenceSha256':sha(REF)},'music':{'file':str(MUSIC),'mix':'Dawn loop, highpass, speech carve, sidechain ducking'},'master':str(master.relative_to(ROOT)),'masterSha256':sha(master)},ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'seconds':tl['seconds'],'master':str(master)},ensure_ascii=False))
if __name__=='__main__':main()
