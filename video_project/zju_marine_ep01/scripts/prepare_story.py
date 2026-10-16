from __future__ import annotations
from pathlib import Path
import json, re, subprocess, hashlib, sys
import numpy as np
import soundfile as sf

PROJECT=Path(__file__).resolve().parents[1]
AUDIO=PROJECT/"work/audio"
PUBLIC=PROJECT/"public/audio"
STORY=PROJECT/"src/story.json"
GAP=0.12
CHAPTER_GAP=0.22

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def normalize(s):
    table=str.maketrans("０１２３４５６７８９","0123456789")
    return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]","",s.translate(table)).lower()
def stamp(t):
    ms=round(t*1000); return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"
def split_caption(text,max_len=22):
    text=text.strip()
    pieces=[x for x in re.split(r"(?<=[，。！？；：、])",text) if x]
    out=[]
    for p in pieces:
        while len(p)>max_len:
            cut=max((p.rfind(x,0,max_len+1) for x in "，。！？；：、"),default=-1)
            if cut<8: cut=max_len
            out.append(p[:cut].strip()); p=p[cut:].strip()
        if p: out.append(p)
    return out or [text]
def transcribe(path,model):
    segs,_=model.transcribe(str(path),language="zh",beam_size=3,condition_on_previous_text=False,
                             word_timestamps=True,vad_filter=False)
    words=[]
    for seg in segs:
        if seg.words:
            words.extend({"word":w.word,"start":float(w.start),"end":float(w.end),"probability":float(w.probability)} for w in seg.words)
    asr="".join(x["word"] for x in words)
    return asr,words
def char_times(text,words,duration):
    # Whisper often returns word chunks rather than one Chinese character; interpolate within each chunk.
    obs=normalize("".join(w["word"] for w in words))
    times=[]
    for w in words:
        token=normalize(w["word"])
        if not token: continue
        for i in range(len(token)):
            times.append((token[i],w["start"]+(w["end"]-w["start"])*(i+0.5)/len(token)))
    target=normalize(text)
    mapping={}
    j=0
    for i,ch in enumerate(target):
        while j<len(times) and times[j][0]!=ch: j+=1
        if j<len(times): mapping[i]=times[j][1]; j+=1
    if len(mapping)<max(2,int(len(target)*.60)):
        return None
    return mapping
def main():
    import argparse
    ap=argparse.ArgumentParser(); ap.add_argument("--device",default="cpu"); args=ap.parse_args()
    story=json.loads(STORY.read_text(encoding="utf-8")); cues=story["sentences"]
    try:
        from faster_whisper import WhisperModel
        model=WhisperModel("D:/python_project/tts/models/whisper-small",device=args.device,compute_type="int8" if args.device=="cpu" else "float16",cpu_threads=4,num_workers=1,local_files_only=True)
    except Exception as e:
        print("ASR unavailable; deterministic fallback recorded:",e)
        model=None
    PUBLIC.mkdir(parents=True,exist_ok=True)
    all_audio=[]; cursor=0.0; captions=[]; asr_rows=[]
    last_chapter=None
    for cue in cues:
        path=PUBLIC/(cue["id"]+".wav")
        if not path.exists(): raise FileNotFoundError(path)
        wav,sr=sf.read(path,dtype="float32"); wav=wav.mean(axis=1) if wav.ndim==2 else wav
        duration=len(wav)/sr
        gap=CHAPTER_GAP if last_chapter and cue["chapter"]!=last_chapter else GAP
        if all_audio: all_audio.append(np.zeros(round(gap*48000),dtype=np.float32)); cursor+=gap
        start=cursor; end=start+duration
        cue["start"]=round(start,4); cue["end"]=round(end,4); cue["duration"]=round(duration,4)
        if sr!=48000:
            import scipy.signal
            wav=scipy.signal.resample_poly(wav,48000,sr).astype(np.float32); sr=48000
        all_audio.append(wav); cursor=end
        asr,words=transcribe(path,model) if model else ("",[])
        mapping=char_times(cue["text"],words,duration) if model else None
        parts=split_caption(cue["text"])
        pos=0
        for part in parts:
            n=len(normalize(part)); aidx=pos; bidx=pos+n
            if mapping:
                vals=[mapping[i] for i in mapping if aidx<=i<bidx]
                a=(min(vals)-0.05 if vals else duration*pos/max(1,len(cue["text"])))
                vals2=[mapping[i] for i in mapping if bidx<=i]
                b=(min(vals2)-0.05 if vals2 else duration*min(len(cue["text"]),bidx)/max(1,len(cue["text"])))
                timing="Whisper-small word anchors; source text preserved"
            else:
                a=duration*pos/max(1,len(cue["text"])); b=duration*min(len(cue["text"]),bidx)/max(1,len(cue["text"])); timing="fallback proportional timing"
            captions.append({"id":f"{cue['id']}-{len(captions)}","cueId":cue["id"],"chapter":cue["chapter"],"text":part,
                             "start":round(start+max(0,a),4),"end":round(start+min(duration,max(a+0.08,b)),4),
                             "timingMethod":timing})
            pos+=n
        asr_rows.append({"id":cue["id"],"target":cue["text"],"asr":asr,"words":words,
                         "duration":duration,"sha256":sha(path),"similarity":None if not model else None,
                         "subjectiveListeningChecked":False})
        last_chapter=cue["chapter"]
    merged=np.concatenate(all_audio) if all_audio else np.zeros(1,dtype=np.float32)
    sf.write(PUBLIC/"narration.wav",merged,48000,subtype="PCM_24")
    sf.write(AUDIO/"narration.wav",merged,48000,subtype="PCM_24")
    # Actual scenes are chapter ranges; retain planned ranges for composition.
    groups=[]; idx=0
    for ch in story["chapters"]:
        rows=[c for c in cues if c["chapter"]==ch]
        if not rows: continue
        groups.append({"id":"scene_"+ch,"chapter":ch,"start":rows[0]["start"],"end":rows[-1]["end"],
                       "plannedStart":next((s["start"] for s in story["scenes"] if s["chapter"]==ch),None),
                       "plannedEnd":next((s["end"] for s in story["scenes"] if s["chapter"]==ch),None)})
    story["scenes"]=groups; story["captions"]=captions
    story["audio"]["actualDuration"]=round(cursor,4); story["audio"]["sampleRate"]=48000; story["audio"]["narration"]="public/audio/narration.wav"
    story["audio"]["assemblyGapSec"]=GAP; story["audio"]["chapterGapSec"]=CHAPTER_GAP
    story["audio"]["asrModel"]="local Whisper-small (CPU int8)" if model else "unavailable"
    story["audio"]["subjectiveListeningChecked"]=False
    STORY.write_text(json.dumps(story,ensure_ascii=False,indent=2),encoding="utf-8")
    (AUDIO/"asr-alignment.json").write_text(json.dumps({"model":"Whisper-small","device":args.device,"automaticOnly":True,"cues":asr_rows,"subjectiveListeningChecked":False},ensure_ascii=False,indent=2),encoding="utf-8")
    srt="\n\n".join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(captions))
    (PUBLIC/"subtitles.srt").write_text(srt,encoding="utf-8"); (AUDIO/"subtitles.srt").write_text(srt,encoding="utf-8")
    (AUDIO/"assembly-report.json").write_text(json.dumps({"durationSec":round(cursor,4),"sampleRate":48000,"sentences":len(cues),"captions":len(captions),"targetDuration":story["targetDuration"],"under340":cursor<340,"over360":cursor>360,"subjectiveListeningChecked":False},ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({"durationSec":round(cursor,3),"captions":len(captions),"under340":cursor<340},ensure_ascii=False))
if __name__=="__main__": main()

