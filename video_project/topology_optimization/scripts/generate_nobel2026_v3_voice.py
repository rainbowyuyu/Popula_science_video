from __future__ import annotations

"""Generate the V3 narration clips with rainbow鱼's local reference voice."""

import hashlib
import json
import os
import time
import argparse
from pathlib import Path

import numpy as np
import soundfile as sf

from build_nobel2026_v3_timeline import NARRATION

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
ROOT = Path(__file__).resolve().parents[1]
TTS = Path("D:/python_project/tts")
RAW = ROOT / "public/nobel2026/voice-v3-raw"
LEDGER = ROOT / "research/nobel2026/voice-generation-v3.json"
REF = TTS / "work/clone-reference.wav"
REF_META = TTS / "work/clone-reference.json"
RAW.mkdir(parents=True, exist_ok=True)
LEDGER.parent.mkdir(parents=True, exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--ids",
        default="",
        help="comma-separated clip ids to regenerate; omit to regenerate all 22 clips",
    )
    args = parser.parse_args()
    import torch
    from qwen_tts import Qwen3TTSModel

    torch.set_num_threads(4)
    model = Qwen3TTSModel.from_pretrained(
        str(TTS / "models/Qwen3-TTS-0.6B"),
        device_map="cuda:0",
        dtype=torch.bfloat16,
        attn_implementation="sdpa",
    )
    prompt = model.create_voice_clone_prompt(
        ref_audio=str(REF),
        ref_text=json.loads(REF_META.read_text(encoding="utf-8"))["text"],
    )
    params = {
        "temperature": 0.62,
        "top_p": 0.90,
        "repetition_penalty": 1.08,
        "max_new_tokens": 384,
        "non_streaming_mode": True,
    }
    ledger = json.loads(LEDGER.read_text(encoding="utf-8")) if LEDGER.exists() else {}
    requested = {x.strip() for x in args.ids.split(",") if x.strip()}
    rows = [(rid, text) for rid, text in sorted(NARRATION.items()) if not requested or rid in requested]
    if requested and {rid for rid, _ in rows} != requested:
        missing = sorted(requested - {rid for rid, _ in rows})
        raise SystemExit(f"unknown clip ids: {', '.join(missing)}")
    print(f"generating {len(rows)} V3 clips", flush=True)
    for index in range(0, len(rows), 2):
        batch = rows[index : index + 2]
        texts = [text for _, text in batch]
        seed = 20261007 + index
        torch.manual_seed(seed)
        started = time.time()
        waves, sr = model.generate_voice_clone(
            text=texts,
            language="Chinese",
            voice_clone_prompt=prompt,
            **params,
        )
        for (rid, text), wave in zip(batch, waves):
            arr = np.asarray(wave, dtype=np.float32)
            if not np.isfinite(arr).all():
                raise ValueError(f"non-finite audio in clip {rid}")
            out = RAW / f"{rid}.wav"
            sf.write(out, arr, sr, subtype="PCM_24")
            spec = {
                "id": rid,
                "text": text,
                "referenceSha256": hashlib.sha256(REF.read_bytes()).hexdigest(),
                "model": "Qwen3-TTS-0.6B",
                "seed": seed,
                "parameters": params,
                "file": out.relative_to(ROOT).as_posix(),
                "seconds": round(len(arr) / sr, 4),
                "sampleRate": sr,
                "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
                "elapsedSeconds": round(time.time() - started, 3),
            }
            ledger[rid] = spec
            print(rid, spec["seconds"], "s", flush=True)
        LEDGER.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
