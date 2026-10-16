from __future__ import annotations
from pathlib import Path
import argparse, hashlib, json, shutil, time
import numpy as np
import soundfile as sf

PROJECT = Path(__file__).resolve().parents[1]
AUDIO = PROJECT / "work" / "audio"
RAW = AUDIO / "raw"
CLEAN = AUDIO / "clean"
PUBLIC = PROJECT / "public" / "audio"
TTS_ROOT = Path("D:/python_project/tts")
MODEL_PATH = TTS_ROOT / "models" / "Qwen3-TTS-0.6B"
REF = TTS_ROOT / "work" / "clone-reference.wav"
REF_META = json.loads((TTS_ROOT / "work" / "clone-reference.json").read_text(encoding="utf-8"))
PARAMS = {"temperature": 0.48, "top_p": 0.88, "repetition_penalty": 1.1, "max_new_tokens": 1000, "non_streaming_mode": True}
SEED_BASE = 2026101201

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def guarded(w: np.ndarray, sr: int = 24000) -> np.ndarray:
    return np.pad(w.astype(np.float32), (round(sr*.08), round(sr*.16)))

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default="cuda:0")
    ap.add_argument("--ids", default="")
    args = ap.parse_args()
    AUDIO.mkdir(parents=True, exist_ok=True); RAW.mkdir(exist_ok=True); CLEAN.mkdir(exist_ok=True); PUBLIC.mkdir(exist_ok=True)
    story = json.loads((PROJECT/"src/story.json").read_text(encoding="utf-8"))
    ledger_path = AUDIO/"voice-ledger.json"
    ledger = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else {}
    selected = set(x for x in args.ids.split(",") if x) or None
    import os
    os.environ.setdefault("HF_HUB_OFFLINE","1"); os.environ.setdefault("TOKENIZERS_PARALLELISM","false")
    import torch
    from qwen_tts import Qwen3TTSModel
    todo=[]
    for i, cue in enumerate(story["sentences"]):
        if selected and cue["id"] not in selected: continue
        seed=ledger.get(cue["id"],{}).get("seed",SEED_BASE+sum((j+1)*ord(ch) for j,ch in enumerate(cue["id"])))
        spec={**PARAMS,"text":cue["spoken"],"referenceSha256":sha(REF),"model":"Qwen3-TTS-0.6B","seed":seed}
        req=hashlib.sha256(json.dumps(spec,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        raw=RAW/f"{cue['id']}.wav"; clean=CLEAN/f"{cue['id']}.wav"; pub=PUBLIC/f"{cue['id']}.wav"
        if ledger.get(cue["id"],{}).get("requestHash")==req and clean.exists() and pub.exists():
            continue
        todo.append((cue,spec,req,raw,clean,pub))
    if todo:
        torch.set_num_threads(4)
        model=Qwen3TTSModel.from_pretrained(str(MODEL_PATH),device_map=args.device,
            dtype=torch.bfloat16 if args.device.startswith("cuda") else torch.float32,attn_implementation="sdpa")
        prompt=model.create_voice_clone_prompt(ref_audio=str(REF),ref_text=REF_META["text"])
        from importlib.util import spec_from_file_location,module_from_spec
        bp=TTS_ROOT/"broadcast_voice.py"; modspec=spec_from_file_location("broadcast_voice",bp); mod=module_from_spec(modspec); modspec.loader.exec_module(mod)
        for i,(cue,spec,req,raw,clean,pub) in enumerate(todo):
            t0=time.perf_counter()
            torch.manual_seed(spec["seed"])
            waves,sr=model.generate_voice_clone(text=[cue["spoken"]],language="Chinese",voice_clone_prompt=prompt,
                temperature=PARAMS["temperature"],top_p=PARAMS["top_p"],repetition_penalty=PARAMS["repetition_penalty"],
                max_new_tokens=PARAMS["max_new_tokens"],non_streaming_mode=True)
            x=np.asarray(waves[0],dtype=np.float32)
            if not np.isfinite(x).all(): raise RuntimeError(f"non-finite output: {cue['id']}")
            if raw.exists():
                prior=AUDIO/"prior"; prior.mkdir(exist_ok=True)
                shutil.copy2(raw,prior/f"{cue['id']}-{sha(raw)[:10]}.wav")
            sf.write(raw,guarded(x,sr),sr,subtype="PCM_24")
            result=mod.master_voice(raw,clean,AUDIO/"clean"/f"{cue['id']}.json")
            shutil.copy2(clean,pub)
            ledger[cue["id"]]={"id":cue["id"],"displayText":cue["text"],"spoken":cue["spoken"],"requestHash":req,
                "referenceSha256":sha(REF),"referenceText":REF_META["text"],"model":"Qwen3-TTS-0.6B","modelPath":str(MODEL_PATH),
                "seed":spec["seed"],"parameters":PARAMS,"raw":str(raw),"clean":str(clean),"audio":str(pub),
                "rawSha256":sha(raw),"cleanSha256":sha(clean),"sampleRate":48000,"durationSec":float(result["output"]["seconds"]),
                "measuredLatencySamples":result["measuredLatencySamples"],"wallSeconds":time.perf_counter()-t0,
                "subjectiveListeningChecked":False,"actualProvider":"local-user-tts-project"}
            ledger_path.write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding="utf-8")
            print(cue["id"],round(ledger[cue["id"]]["durationSec"],3),"sec",flush=True)
    (AUDIO/"voice-run.json").write_text(json.dumps({"generatedAt":time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "model":"Qwen3-TTS-0.6B","reference":str(REF),"referenceSha256":sha(REF),"device":args.device,
        "source":"local-user-tts-project","sentences":len(story["sentences"]),"subjectiveListeningChecked":False},ensure_ascii=False,indent=2),encoding="utf-8")
    print("generation complete; run prepare_story.py to assemble narration and ASR-align captions")

if __name__=="__main__":
    main()

