"""Build the natural-speed V04 Nobel Physics narration and music.

V03 is kept as a rollback.  V04 uses the same local Qwen3-TTS voice clone,
but never stretches a take to the old picture clock.  The picture timeline is
rebuilt from the measured takes, so the presenter speaks at the model's
normal pace and the subtitles follow the new phrase boundaries.
"""
from __future__ import annotations

import hashlib, json, os, shutil, subprocess, time
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parents[1]
TTS_ROOT=Path('D:/python_project/tts')
TTS_PY=TTS_ROOT/'.venv/Scripts/python.exe'
TIMELINE=ROOT/'src/physics2026/timeline-v02.json'
PATCH=ROOT/'docs/narration-v08-corrected.json'
OUT=ROOT/'audio/v06'; RAW=OUT/'raw'; CLEAN=OUT/'clean'; PUBLIC=ROOT/'public/audio-v06'
REF=TTS_ROOT/'work/clone-reference.wav'; REF_META=TTS_ROOT/'work/clone-reference.json'
SOURCE_MUSIC=ROOT.parent/'ai_evolution_ch04_space_time/research/music/v09/sources/Scott-Buckley-Growing-Up.m4a'
MUSIC_RECORD=ROOT.parent/'ai_evolution_ch04_space_time/research/music/v09/sources.json'
PAUSE=.70

def sha(p:Path)->str:return hashlib.sha256(p.read_bytes()).hexdigest()
def run(args:list[str],capture=False):return subprocess.run(args,cwd=ROOT,check=True,text=True,encoding='utf-8',capture_output=capture)
def spoken(text:str)->str:
    return text.replace('rainbow鱼','rainbow 鱼').replace('IceCube','Ice Cube')

def rows_and_patch():
    timeline=json.loads(TIMELINE.read_text(encoding='utf-8'))
    patch=json.loads(PATCH.read_text(encoding='utf-8'))
    by={str(x['id']):x for x in patch['clips']}
    rows=[]
    for row in timeline['clips']:
        r=dict(row)
        p=by.get(str(row['id']))
        if p:
            r['spoken']=p['spoken']; r['display']=p['spoken']; r['_subtitleTexts']=p['subtitleTexts']
        else:
            r['display']=row.get('spoken',''); r['_subtitleTexts']=None
        rows.append(r)
    return timeline,rows,by

def generate_raw(rows,by):
    import torch
    from qwen_tts import Qwen3TTSModel
    os.environ['HF_HUB_OFFLINE']='1'; os.environ['TOKENIZERS_PARALLELISM']='false'; torch.set_num_threads(4)
    reference=json.loads(REF_META.read_text(encoding='utf-8')); ref_hash=sha(REF)
    ledger_path=OUT/'tts-generation-v06.json'; ledger=json.loads(ledger_path.read_text(encoding='utf-8')) if ledger_path.exists() else {}
    model=Qwen3TTSModel.from_pretrained(str(TTS_ROOT/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
    prompt=model.create_voice_clone_prompt(ref_audio=str(REF),ref_text=reference['text'])
    params={'temperature':.42,'top_p':.85,'repetition_penalty':1.05,'max_new_tokens':1536,'non_streaming_mode':True}
    for row in rows:
        rid=str(row['id']); text=spoken(str(row['spoken'])); target=RAW/f'{rid}.wav'
        # Unchanged takes are the original natural Qwen captures, before V03's
        # picture-clock fitting.  Patch takes receive a fresh request hash.
        if rid not in by and (ROOT/'audio/v03/raw'/f'{rid}.wav').exists():
            target.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(ROOT/'audio/v03/raw'/f'{rid}.wav',target); continue
        seed=20261007+int(rid); spec={'text':text,'referenceSha256':ref_hash,'model':str(TTS_ROOT/'models/Qwen3-TTS-0.6B'),'seed':seed,'parameters':params}
        req=hashlib.sha256(json.dumps(spec,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        if ledger.get(rid,{}).get('requestHash')==req and target.exists(): continue
        torch.manual_seed(seed); started=time.time(); waves,sr=model.generate_voice_clone(text=[text],language=['Auto'],voice_clone_prompt=prompt,**params)
        wave=np.asarray(waves[0]).squeeze()
        if wave.ndim!=1 or not np.isfinite(wave).all() or len(wave)<sr*.2: raise RuntimeError(f'invalid take {rid}')
        target.parent.mkdir(parents=True,exist_ok=True); sf.write(target,wave,sr,subtype='PCM_24')
        ledger[rid]={**spec,'requestHash':req,'file':target.relative_to(ROOT).as_posix(),'seconds':len(wave)/sr,'sampleRate':sr,'sha256':sha(target),'elapsedSeconds':time.time()-started}
        ledger_path.write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf-8'); print('generated',rid,f'{len(wave)/sr:.2f}s',flush=True)

def clean_rows(rows):
    import sys; sys.path.insert(0,str(TTS_ROOT)); from broadcast_voice import master_voice
    out=[]
    for row in rows:
        rid=str(row['id']); raw=RAW/f'{rid}.wav'; cleaned=CLEAN/f'{rid}-clean.wav'; report=CLEAN/f'{rid}-broadcast.json'
        # Always clean the natural raw take.  Reusing V03's ``*-clean.wav``
        # here would silently reintroduce its target-clock atempo result and
        # defeat this version's measured natural-speed timeline.
        master_voice(raw,cleaned,report)
        seconds=sf.info(cleaned).duration
        fitted=CLEAN/f'{rid}.wav'
        # No atempo: preserve the natural reading speed. Only add tiny fades
        # to remove a click at the capture edges.
        run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(cleaned),'-af',f'afade=t=in:d=0.012,afade=t=out:st={max(.02,seconds-.05):.6f}:d=0.04','-ar','48000','-ac','2','-c:a','pcm_s24le',str(fitted)])
        out.append({**row,'naturalSeconds':sf.info(fitted).duration,'audio':fitted.relative_to(ROOT).as_posix()})
    return out

def allocate_parts(texts,duration):
    if not texts:return []
    start=.06; end=max(start+.2,duration-.08); span=end-start
    weights=[max(1,len(''.join(t.split())))+('。！？；：' in t)*3 for t in texts]; total=sum(weights); parts=[]; cur=start
    for i,(text,w) in enumerate(zip(texts,weights)):
        nxt=end if i==len(texts)-1 else cur+span*w/total
        parts.append({'start':round(cur,3),'end':round(nxt,3),'text':text,'source':f'v04-{i:02d}'})
        cur=nxt
    return parts

def build_timeline(base,rows):
    clips=[]; cursor=0
    for r in rows:
        duration=float(r['naturalSeconds']); old=float(r['audioSeconds']); parts=r['_subtitleTexts']
        if parts: subs=allocate_parts(parts,duration)
        else:
            scale=duration/old if old else 1
            subs=[{**p,'start':round(float(p['start'])*scale,3),'end':round(float(p['end'])*scale,3)} for p in r['subtitleParts']]
        frames=max(1,round(duration*30)); start=cursor; end=start+frames
        c={k:v for k,v in r.items() if not k.startswith('_') and k not in {'display','naturalSeconds','audio'}}
        c.update({'start':start,'end':end,'audio':r['audio'],'audioSeconds':round(duration,3),'spoken':r['spoken'],'subtitleParts':subs})
        clips.append(c); cursor=end+round(PAUSE*30)
    scenes=[]
    for scene in base['scenes']:
        own=[c for c in clips if c['scene']==scene['id']]
        if own: scenes.append({'id':scene['id'],'start':own[0]['start'],'end':own[-1]['end']})
    return {'version':'nobel-physics-2026-v06-natural','fps':30,'duration':cursor-round(PAUSE*30),'seconds':(cursor-round(PAUSE*30))/30,'clips':clips,'scenes':scenes,'editorial':{**base.get('editorial',{}),'voice':'Qwen3-TTS-0.6B rainbow鱼 clone','rate':'natural; no atempo fitting','pauseSeconds':PAUSE}}

def assemble(rows,seconds):
    silence=OUT/'silence.wav'; run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',str(PAUSE),'-c:a','pcm_s24le',str(silence)])
    concat=OUT/'concat.txt'; files=[]
    # Pause belongs between clips only.  A trailing pause here would make the
    # measured timeline and the concatenated narration differ by 0.70 s.
    for i,r in enumerate(rows):
        files.append(CLEAN/f"{r['id']}.wav")
        if i + 1 < len(rows):
            files.append(silence)
    concat.write_text('\n'.join(f"file '{p.as_posix()}'" for p in files)+'\n',encoding='utf-8')
    narration=OUT/'narration.wav'; run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-ar','48000','-ac','2','-c:a','pcm_s24le',str(narration)])
    source=OUT/'music-source-48k.wav'; run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(SOURCE_MUSIC),'-ar','48000','-ac','2','-c:a','pcm_s24le',str(source)])
    wave,sr=sf.read(source,dtype='float32',always_2d=True); total=round(seconds*sr); need=max(0,total-len(wave)); overlap=min(round(8*sr),max(0,len(wave)//3),need)
    if need==0: out=wave[:total]
    else:
        extra=np.resize(wave,(need+overlap,2)); blend=np.linspace(0,1,overlap,dtype=np.float32)[:,None]
        joined=wave[-overlap:]*(1-blend)+extra[:overlap]*blend if overlap else extra
        out=np.concatenate([wave[:-overlap],joined,extra[overlap:need+overlap]],axis=0) if overlap else np.concatenate([wave,extra],axis=0)
    looped=OUT/'music-looped.wav'; sf.write(looped,out,sr,subtype='PCM_24'); music=OUT/'music.wav'
    run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(looped),'-af',f'highpass=f=65,equalizer=f=2700:t=o:w=1.6:g=-2.5,lowpass=f=15000,afade=t=in:d=2.4,afade=t=out:st={max(0,seconds-6.5):.3f}:d=6.5','-ar','48000','-ac','2','-c:a','pcm_s24le',str(music)])
    premaster=OUT/'premaster.wav'; graph='[1:a]volume=0.30[m0];[m0][0:a]sidechaincompress=threshold=0.025:ratio=7:attack=25:release=520:makeup=1:link=average[mduck];[0:a]volume=1.0[v];[v][mduck]amix=inputs=2:duration=first:dropout_transition=2,aresample=48000[a]'
    run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(narration),'-i',str(music),'-filter_complex',graph,'-map','[a]','-ar','48000','-ac','2','-c:a','pcm_s24le',str(premaster)])
    master=OUT/'master.wav'
    # The measured PCM concatenation can differ from the 30 fps picture clock
    # by one frame after codec rounding; keep the natural take and let the
    # final muxer trim/pad that sub-frame boundary consistently.
    run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(premaster),'-af','loudnorm=I=-14.5:TP=-1.8:LRA=8','-ar','48000','-ac','2','-c:a','pcm_s24le',str(master)])
    PUBLIC.mkdir(parents=True,exist_ok=True)
    for p in (master,narration,music): shutil.copy2(p,PUBLIC/p.name)
    return master

def main():
    OUT.mkdir(parents=True,exist_ok=True); RAW.mkdir(parents=True,exist_ok=True); CLEAN.mkdir(parents=True,exist_ok=True)
    base,rows,by=rows_and_patch(); generate_raw(rows,by); clean=clean_rows(rows)
    timeline=build_timeline(base,clean); (ROOT/'src/physics2026/timeline-v06.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
    seconds=float(timeline['seconds']); master=assemble(clean,seconds)
    record=json.loads(MUSIC_RECORD.read_text(encoding='utf-8')); selected=next(c for c in record['candidates'] if c['title']=='Growing Up')
    manifest={'version':'nobel-physics-2026-v06-natural-audio','timeline':'src/physics2026/timeline-v06.json','durationSeconds':seconds,'sampleRate':48000,'referenceVoice':{'model':'Qwen3-TTS-0.6B','referenceFile':str(REF),'referenceSha256':sha(REF),'policy':'natural speed, no atempo fitting'},'music':{'title':selected['title'],'author':selected['author'],'source':Path(os.path.relpath(SOURCE_MUSIC, ROOT)).as_posix(),'sourceSha256':selected['sourceSHA256'],'attribution':selected['attribution'],'mix':'original speed/pitch, 8 s loop crossfade, highpass 70 Hz, 2.5 kHz speech carve, smooth sidechain ducking'},'master':str(master.relative_to(ROOT)),'masterSha256':sha(master),'clips':[{'id':r['id'],'seconds':r['naturalSeconds'],'spoken':r['spoken'],'audio':r['audio']} for r in clean]}
    (OUT/'audio-manifest-v06.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'seconds':seconds,'master':str(master),'timeline':'src/physics2026/timeline-v06.json','sha256':sha(master)},ensure_ascii=False,indent=2))
if __name__=='__main__': main()


