"""Build short, measured rainbow鱼 narration takes for the Nobel V4 preview.

No audio is retimed or cut to a fixed window.  Each caption clause has its
own TTS take, so a bad final syllable can be re-recorded independently.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
from pathlib import Path

import numpy as np
import soundfile as sf

from build_nobel2026_v3_timeline import NARRATION as V3
from align_nobel2026_v3 import sentence_parts

ROOT = Path(__file__).resolve().parents[1]
TTS = Path("D:/python_project/tts")
RAW = ROOT / "public/nobel2026/audio-v4/raw"
SPEC = ROOT / "research/nobel2026/v4/narration.json"
LEDGER = ROOT / "research/nobel2026/v4/tts-ledger.json"
REF = TTS / "work/clone-reference.wav"
REF_META = TTS / "work/clone-reference.json"
OVERRIDES = {
    "001": "今年的诺贝尔生理学或医学奖，颁给三位科学家。他们的答案，都从一束光开始。",
    "006": "光电流快得惊人。研究者开始猜，会不会有一种蛋白，既能感受光线，又能直接充当离子通道？难处在于，这种蛋白离开藻类细胞之后，很容易失去活性。",
    "007": "转机来自基因测序。他们找到了两段感光基因，分别放进蛙卵。蛙卵按基因指令，把蛋白装到细胞膜上。",
    "008": "其中，二型通道成了主角。蓝光一照，通道不到一毫秒就打开。带正电的离子穿过细胞膜，细胞电压随之变化。二零零三年，他们公布了这个结果。",
    "017": "二零一二年，研究者先标记恐惧训练时活跃的细胞。几天后，只打开蓝光，小鼠就再次停住不动。重新激活这群细胞，能唤起相应的恐惧反应。",
    "018": "今天，研究者用这种方法分别研究疼痛、进食、奖赏、社交和注意力。过去混在一起的神经活动，终于可以沿着一条条线路拆开观察。",
    "020": "回头看，最初的问题是：哪一群细胞，让小鼠动了胡须？现在，研究者能只给这群细胞装上感光开关，再用蓝光试一次。",
    "021": "故事从小绿藻的感光点开始，经过一根光纤，最后落在小鼠胡须轻轻一动。那束光，让研究者第一次能直接追问：这群细胞究竟做了什么？",
}
ENGLISH_NAMES = ["Karl Deisseroth", "Peter Hegemann", "Georg Nagel"]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def natural_parts(text: str) -> list[str]:
    pieces = sentence_parts(text)
    # Avoid a 2–4-character take like “观察。” or “光遗传学。” at a cut.
    merged: list[str] = []
    for part in pieces:
        if len(re.sub(r"\W", "", part)) < 7 and merged:
            merged[-1] += part
        else:
            merged.append(part)
    return merged


def build_spec() -> dict:
    clips = []
    for rid, original in V3.items():
        text = OVERRIDES.get(rid, original)
        if rid == "001":
            pieces = [
                {"text": "今年的诺贝尔生理学或医学奖，颁给三位科学家。", "language": "Chinese"},
                *({"text": name, "language": "English"} for name in ENGLISH_NAMES),
                {"text": "他们的答案，都从一束光开始。", "language": "Chinese"},
            ]
        elif rid == "018":
            # This list was a 31-character caption. Keep the spoken sentence,
            # but give each idea a measured take and its own subtitle interval.
            pieces = [
                {"text": "今天，研究者用这种方法", "language": "Chinese"},
                {"text": "分别研究疼痛、进食、奖赏、社交和注意力。", "language": "Chinese"},
                {"text": "过去混在一起的神经活动，", "language": "Chinese"},
                {"text": "终于可以沿着一条条线路拆开观察。", "language": "Chinese"},
            ]
        else:
            pieces = [{"text": p, "language": "Chinese"} for p in natural_parts(text)]
        for idx, piece in enumerate(pieces):
            piece["id"] = f"{rid}-{idx:02d}"
        clips.append({"id": rid, "spoken": " ".join(p["text"] for p in pieces), "pieces": pieces})
    result = {
        "version": "nobel2026-v4-short-takes",
        "reference": "rainbow鱼本地声音参考",
        "scientists": ENGLISH_NAMES,
        "clips": clips,
    }
    SPEC.parent.mkdir(parents=True, exist_ok=True)
    SPEC.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ids", default="", help="Comma-separated piece IDs; default generates missing takes")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    spec = build_spec()
    requested = {x.strip() for x in args.ids.split(",") if x.strip()}
    pieces = [p for c in spec["clips"] for p in c["pieces"]]
    if requested - {p["id"] for p in pieces}:
        raise SystemExit(f"unknown pieces: {sorted(requested - {p['id'] for p in pieces})}")
    RAW.mkdir(parents=True, exist_ok=True)
    ledger = json.loads(LEDGER.read_text(encoding="utf-8")) if LEDGER.exists() else {}
    pending = [p for p in pieces if (not requested or p["id"] in requested) and
               (args.force or not (RAW / f"{p['id']}.wav").exists() or ledger.get(p["id"], {}).get("text") != p["text"])]
    print(f"V4 pieces={len(pieces)} pending={len(pending)}", flush=True)
    if not pending:
        return

    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    import torch
    from qwen_tts import Qwen3TTSModel

    torch.set_num_threads(4)
    model = Qwen3TTSModel.from_pretrained(
        str(TTS / "models/Qwen3-TTS-0.6B"), device_map="cuda:0",
        dtype=torch.bfloat16, attn_implementation="sdpa",
    )
    prompt = model.create_voice_clone_prompt(
        ref_audio=str(REF),
        ref_text=json.loads(REF_META.read_text(encoding="utf-8"))["text"],
    )
    params = dict(temperature=.58, top_p=.88, repetition_penalty=1.08,
                  max_new_tokens=256, non_streaming_mode=True)
    # Group by language.  English proper names are actual English takes, not
    # Mandarin transliterations, and retain the same cloned reference voice.
    for i, piece in enumerate(pending):
        seed = 20261006 + int(piece["id"][:3]) * 17 + int(piece["id"][-2:])
        torch.manual_seed(seed)
        started = time.time()
        waves, sr = model.generate_voice_clone(
            text=[piece["text"]], language=piece["language"],
            voice_clone_prompt=prompt, **params,
        )
        arr = np.asarray(waves[0], dtype=np.float32)
        if len(arr) == 0 or not np.isfinite(arr).all():
            raise RuntimeError(f"invalid voice take: {piece['id']}")
        file = RAW / f"{piece['id']}.wav"
        sf.write(file, arr, sr, subtype="PCM_24")
        ledger[piece["id"]] = {
            **piece, "model": "Qwen3-TTS-0.6B", "referenceSHA256": sha(REF),
            "seed": seed, "params": params, "duration": len(arr) / sr,
            "file": file.relative_to(ROOT).as_posix(), "sha256": sha(file),
            "elapsedSeconds": round(time.time() - started, 2),
        }
        LEDGER.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{i+1}/{len(pending)} {piece['id']} {len(arr)/sr:.2f}s", flush=True)


if __name__ == "__main__":
    main()
