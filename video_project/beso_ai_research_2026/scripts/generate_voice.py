"""Generate the research film narration with the local Rainbow reference voice.

The spokenText field is deliberately separate from on-screen text so that
Zwind, BESO and 图强号 keep the requested pronunciation without changing the
scientific spelling shown in the film.
"""
from pathlib import Path
import json, hashlib, math, subprocess, sys, os
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ROOT = Path(__file__).resolve().parents[1]
TTS = Path(r"D:\python_project\tts")
OUT = ROOT / "public" / "voice"
OUT.mkdir(parents=True, exist_ok=True)
story = json.loads((ROOT / "research" / "story.json").read_text("utf8"))
reference = json.loads((TTS / "work" / "clone-reference.json").read_text("utf8"))
model = Qwen3TTSModel.from_pretrained(str(TTS / "models" / "Qwen3-TTS-0.6B"), device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")
prompt = model.create_voice_clone_prompt(ref_audio=str(TTS / "work" / "clone-reference.wav"), ref_text=reference["text"])

clips = []
for scene in story["scenes"]:
    scene_clips = []
    local_from = 75
    for index, line in enumerate(scene["lines"]):
        key = hashlib.sha1((scene["id"] + str(index) + line["ttsText"]).encode()).hexdigest()[:10]
        raw = OUT / f"{scene['id']}-{index}-{key}-raw.wav"
        aligned = OUT / f"{scene['id']}-{index}-{key}.wav"
        if not aligned.exists():
            torch.manual_seed(7000 + index)
            audio, sr = model.generate_voice_clone(text=line["ttsText"], language="Chinese", voice_clone_prompt=prompt, non_streaming_mode=True, temperature=.58, top_p=.88, repetition_penalty=1.05, max_new_tokens=320)
            sf.write(raw, audio[0], sr, subtype="PCM_24")
            x = audio[0].astype(np.float32)
            # retain natural tail; only remove long synthetic leading silence
            block = max(1, int(sr * .02))
            rms = np.array([np.sqrt(np.mean(x[i:i+block] ** 2)) for i in range(0, len(x), block)])
            voiced = np.where(rms > max(.004, float(rms.max()) * .035))[0]
            start = max(0, int(voiced[0] * block - .07 * sr)) if len(voiced) else 0
            sf.write(raw, x[start:], sr, subtype="PCM_24")
            length = max(.5, len(x[start:]) / sr)
            # gentle voice cleanup, stereo broadcast level, no hard gate
            filters = f"highpass=f=70,lowpass=f=11500,afftdn=nf=-45:nr=3:tn=1,equalizer=f=280:t=q:w=0.8:g=-1.8,equalizer=f=3000:t=q:w=0.8:g=1.3,acompressor=threshold=0.18:ratio=1.8:attack=16:release=120:makeup=1.05,apad,atrim=duration={length+0.18},afade=t=out:st={length+0.15}:d=0.03"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", filters, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(aligned)], check=True)
        seconds = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(aligned)]))
        frames = max(30, math.ceil(seconds * 60))
        rel = aligned.relative_to(ROOT / "public").as_posix()
        scene_clips.append({"text": line["text"], "ttsText": line["ttsText"], "file": rel, "frames": frames, "from": local_from})
        local_from += frames + 26
    scene["clips"] = scene_clips
    scene["duration"] = max(30 * 60, local_from + 75)

start = 0
captions = []
for scene in story["scenes"]:
    scene["start"] = start
    for clip in scene["clips"]:
        s = round((start + clip["from"]) / 60 * 1000)
        e = round((start + clip["from"] + clip["frames"]) / 60 * 1000)
        captions.append({"text": clip["text"], "startMs": s, "endMs": e})
    start += scene["duration"] - story["overlap"]
story["duration"] = start + story["overlap"]
(ROOT / "src" / "beso-story.json").write_text(json.dumps(story, ensure_ascii=False, indent=2), "utf8")
(ROOT / "src" / "beso-captions.json").write_text(json.dumps(captions, ensure_ascii=False, indent=2), "utf8")
(ROOT / "research" / "qa" / "narration-manifest.json").write_text(json.dumps({"engine":"Qwen3-TTS-0.6B local reference clone", "reference":"D:/python_project/tts/work/clone-reference.wav", "pronunciation":{"Zwind":"Z 风", "图强号":"图——强号", "BESO":"贝索", "CalculiX":"卡—利—克斯"}, "durationFrames":story["duration"], "scenes":len(story["scenes"])}, ensure_ascii=False, indent=2), "utf8")
print(f"Generated {len(captions)} clips, {story['duration']/60:.2f} minutes")
