"""Isolated natural-voice opening candidates; never modifies installed assets."""
from pathlib import Path
import os, sys, json, hashlib, importlib.util
import numpy as np
import soundfile as sf

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
TTS = Path('D:/python_project/tts')
TEXTS = {
    'c': '减肥，光靠少吃就够了吗？肚子上的脂肪，怎么牵动血糖、血压和血脂？咱们从这顿饭说起。',
    'a': '减肥，光靠少吃就够了吗？肚子上的脂肪，怎么牵动血糖、血压和血脂？答案，就藏在这顿饭里。',
    'b': '减肥，光靠少吃就够了吗？肚子上的脂肪，怎么牵动血糖、血压和血脂？从一顿饭里，找找答案。',
}
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
    key = sys.argv[1] if len(sys.argv)>1 else 'a'
    text = TEXTS[key]
    dest = OUT/'opening'/key
    dest.mkdir(parents=True, exist_ok=True)
    if (dest/'take.json').exists():
        print((dest/'take.json').read_text(encoding='utf8')); return
    os.environ['HF_HUB_OFFLINE']='1'
    os.environ['TOKENIZERS_PARALLELISM']='false'
    import torch
    from qwen_tts import Qwen3TTSModel
    torch.set_num_threads(4)
    model=Qwen3TTSModel.from_pretrained(str(TTS/'models/Qwen3-TTS-0.6B'), device_map='cuda:0', dtype=torch.bfloat16, attn_implementation='sdpa')
    reftext=json.loads((TTS/'work/clone-reference.json').read_text(encoding='utf8'))['text']
    prompt=model.create_voice_clone_prompt(ref_audio=str(TTS/'work/clone-reference.wav'),ref_text=reftext)
    settings=dict(temperature=.30,top_p=.82,repetition_penalty=1.05,non_streaming_mode=True,max_new_tokens=2048)
    seed=int(hashlib.sha256(text.encode()).hexdigest()[:8],16)
    torch.manual_seed(seed); np.random.seed(seed)
    waves, rate=model.generate_voice_clone(text=[text],language=['Chinese'],voice_clone_prompt=prompt,**settings)
    raw=dest/'raw.wav'; processed=dest/'h001.wav'
    sf.write(raw,np.asarray(waves[0]),rate,subtype='PCM_24')
    spec=importlib.util.spec_from_file_location('voice_cleaner',TTS/'broadcast_voice.py')
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    processing=mod.master_voice(raw,processed)
    info=sf.info(processed)
    report=dict(id='h001',text=text,ttsText=text,duration=info.duration,sampleRate=info.samplerate,sha256=sha(processed),
        rawSHA256=sha(raw),voiceSpeedFactor=1,settings=settings,seed=seed,
        model='Qwen3-TTS-0.6B',referenceSHA256=sha(TTS/'work/clone-reference.wav'),
        referenceTextSHA256=sha(TTS/'work/clone-reference.json'),processorSHA256=sha(TTS/'broadcast_voice.py'),
        slotStartSeconds=.4,slotEndSeconds=9.9,slotTailSeconds=9.5-info.duration,
        processing=processing,subjectiveListeningChecked=False)
    (dest/'take.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
