"""Reproducible local rainbow voice. No cloud voice, stretching, or reference export."""
from pathlib import Path
import argparse, gc, hashlib, importlib.util, json, os, time, tempfile
import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parents[1]
TTS=Path('D:/python_project/tts')
SETTINGS=dict(temperature=.30, top_p=.82, repetition_penalty=1.05,
              non_streaming_mode=True, max_new_tokens=1536)
GUARDS=dict(leadSeconds=.08,tailSeconds=.16,version='source-edge-guard-v3')

def read(p): return json.loads(Path(p).read_text('utf-8-sig'))
def save(p,v):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True)
    t=p.with_suffix(p.suffix+'.tmp');t.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n','utf8');t.replace(p)
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def spoken(r): return r.get('ttsText',r['text'])

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--only',default='');ap.add_argument('--attempt',type=int,default=1)
    ap.add_argument('--story',default='docs/story.json',help='Story JSON to synthesize; defaults to canonical docs/story.json')
    ap.add_argument('--batch-size',type=int,default=4);ap.add_argument('--force',action='store_true')
    ap.add_argument('--candidate',default='',help='Save an alternate take without replacing the selected voice');a=ap.parse_args()
    story_path=Path(a.story)
    if not story_path.is_absolute(): story_path=ROOT/story_path
    rows=read(story_path)['shots']
    rows=[r for r in rows if r.get('text','').strip()]
    if a.only:rows=[r for r in rows if r['id'] in a.only.split(',')]
    refsha=sha(TTS/'work/clone-reference.wav');reftextsha=sha(TTS/'work/clone-reference.json');pending=[]
    for r in rows:
        signature=hashlib.sha256(json.dumps([spoken(r),'Qwen3-TTS-0.6B',SETTINGS,GUARDS,refsha,reftextsha,a.attempt],ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        takepath=ROOT/'audio/takes'/f"{r['id']}.json"
        if takepath.exists() and not a.force:
            old=read(takepath)
            if old.get('signature')==signature and (ROOT/old['processed']).exists():continue
        pending.append((r,signature))
    print('PENDING',len(pending),flush=True)
    if not pending:return
    os.environ['HF_HUB_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
    import torch
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa')
    prompt=model.create_voice_clone_prompt(ref_audio=str(TTS/'work/clone-reference.wav'),ref_text=read(TTS/'work/clone-reference.json')['text'])
    spec=importlib.util.spec_from_file_location('broadcast_voice',TTS/'broadcast_voice.py')
    cleaner=importlib.util.module_from_spec(spec);spec.loader.exec_module(cleaner)
    batchsize=a.batch_size;runstart=time.monotonic();ready=0;generated=0.
    while pending:
        batch=pending[:batchsize];seed=int(batch[0][1][:8],16)
        torch.manual_seed(seed);np.random.seed(seed);start=time.monotonic()
        try:waves,sr=model.generate_voice_clone(text=[spoken(r) for r,s in batch],language=['Auto']*len(batch),voice_clone_prompt=prompt,**SETTINGS)
        except RuntimeError as e:
            if 'out of memory' not in str(e).lower() or batchsize==1:raise
            batchsize=max(1,batchsize//2);gc.collect();torch.cuda.empty_cache();continue
        for (r,sig),wav in zip(batch,waves):
            raw=ROOT/'audio/raw'/f"{r['id']}-{sig[:10]}.wav"
            clean=(ROOT/'audio/candidates'/a.candidate if a.candidate else ROOT/'public/voice')/f"{r['id']}.wav"
            raw.parent.mkdir(parents=True,exist_ok=True);clean.parent.mkdir(parents=True,exist_ok=True)
            wav=np.asarray(wav,dtype=np.float64);sf.write(raw,wav,sr,subtype='PCM_24')
            # Keep the untouched model source. Guard silence places the cleaner's
            # edge taper outside speech; it cannot restore a truncated synthesis.
            with tempfile.TemporaryDirectory(prefix='tower-voice-guard-') as td:
                protected=Path(td)/'protected.wav'
                guarded=np.pad(wav,(round(sr*GUARDS['leadSeconds']),round(sr*GUARDS['tailSeconds'])))
                sf.write(protected,guarded,sr,subtype='PCM_24')
                report=cleaner.master_voice(protected,clean)
            report['sourceEdgeGuards']=GUARDS
            report['unmodifiedRawSHA256']=sha(raw)
            duration=sf.info(clean).duration;generated+=duration;ready+=1
            enddb=float(20*np.log10(max(np.sqrt(np.mean(wav[-round(sr*.02):]**2)),1e-10)))
            takeout=(ROOT/'audio/candidates'/a.candidate if a.candidate else ROOT/'audio/takes')/f"{r['id']}.json"
            save(takeout,dict(id=r['id'],text=r['text'],ttsText=spoken(r),signature=sig,
                raw=raw.relative_to(ROOT).as_posix(),processed=clean.relative_to(ROOT).as_posix(),rawDuration=len(wav)/sr,
                duration=duration,sha256=sha(clean),seed=seed,attempt=a.attempt,settings=SETTINGS,
                referenceSHA256=refsha,referenceTextSHA256=reftextsha,model='Qwen3-TTS-0.6B',batchIds=[rr['id'] for rr,ss in batch],
                rawEndpointDB=enddb,rawEndpointFlag=enddb>-42,edgeGuards=GUARDS,processing=report,subjectiveListeningChecked=False))
            print('READY',r['id'],round(duration,2),'s','batchElapsed',round(time.monotonic()-start,1),flush=True)
        pending=pending[len(batch):];gc.collect();torch.cuda.empty_cache()
        save(ROOT/'audio/voice-progress.json',dict(ready=ready,pending=len(pending),generatedSeconds=generated,elapsedSeconds=time.monotonic()-runstart))
    print('VOICE_COMPLETE',round(time.monotonic()-runstart,1),'seconds',flush=True)

if __name__=='__main__':main()
