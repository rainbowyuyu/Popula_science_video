"""Align Nobel 2026 subtitles to the generated rainbow鱼 narration.

The visual clip windows are intentionally longer than some spoken sentences.  A
caption that simply divides a sentence by punctuation across the whole window
can therefore lead or trail the voice.  This script runs the local Whisper
model on each processed clip, records the ASR evidence, and writes explicit
relative subtitle timings into ``timeline-v2.json``.  It is an audit aid, not a
replacement for listening to the final mix.
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
from pathlib import Path


def sentence_parts(text: str) -> list[str]:
    """Keep short, speakable units while retaining punctuation."""
    chunks = re.findall(r"[^。！？；：]+[。！？；：]?", text)
    out: list[str] = []
    for chunk in chunks or [text]:
        rest = chunk.strip()
        while len(rest) > 24:
            # Prefer a natural pause; a hard split is a last resort.
            cuts = [rest.rfind(mark, 8, 24) for mark in "，、, "]
            cut = max(cuts)
            if cut < 8:
                cut = 22
            out.append(rest[: cut + 1].strip())
            rest = rest[cut + 1 :].strip()
        if rest:
            out.append(rest)
    return [x for x in out if x]


def rel_times(parts: list[str], speech_end: float) -> list[dict]:
    """Allocate sentence units to ASR duration by character proportion.

    Whisper text can contain small recognition errors, so proportional timing
    is deliberately conservative.  The resulting values are used as a stable
    display contract and are checked against the ASR segments in the report.
    """
    total = max(1, sum(len(x) for x in parts))
    cursor = 0.0
    result: list[dict] = []
    for part in parts:
        start = cursor
        cursor += speech_end * len(part) / total
        result.append({"text": part, "start": round(start, 3), "end": round(cursor, 3)})
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--model", type=Path, default=Path("D:/python_project/tts/models/whisper-small"))
    parser.add_argument("--write", action="store_true", help="write subtitleParts into the timeline")
    args = parser.parse_args()
    root = args.root
    timeline_path = root / "src/nobel2026/timeline-v2.json"
    audio_dir = root / "public/nobel2026/voice-v2"
    report_path = root / "research/nobel2026/asr-alignment-v2.json"
    timeline = json.loads(timeline_path.read_text(encoding="utf-8"))

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:  # pragma: no cover - environment diagnostic
        raise SystemExit("Install/use the local tts environment with faster-whisper") from exc

    # The local model is already downloaded.  Prefer GPU when available, with
    # an int8 CPU fallback so the audit remains reproducible on another host.
    try:
        import torch

        use_cuda = bool(torch.cuda.is_available())
    except Exception:
        use_cuda = False
    model = WhisperModel(str(args.model), device="cuda" if use_cuda else "cpu", compute_type="float16" if use_cuda else "int8")

    report: dict = {"version": "v2-asr-alignment", "model": str(args.model), "clips": []}
    for clip in timeline["clips"]:
        wav = audio_dir / f"{clip['id']}.wav"
        if not wav.exists():
            raise FileNotFoundError(wav)
        segments, info = model.transcribe(
            str(wav), language="zh", beam_size=5, best_of=5, vad_filter=False,
            word_timestamps=True, condition_on_previous_text=False,
        )
        segs = []
        asr_text = []
        end = 0.0
        for seg in segments:
            text = seg.text.strip()
            if text:
                asr_text.append(text)
                end = max(end, float(seg.end))
                segs.append({"start": round(float(seg.start), 3), "end": round(float(seg.end), 3), "text": text})
        expected = clip.get("spoken", clip.get("subtitle", ""))
        recognized = "".join(asr_text).replace(" ", "")
        expected_n = expected.replace(" ", "")
        ratio = difflib.SequenceMatcher(None, expected_n, recognized).ratio()
        parts = sentence_parts(clip.get("subtitle", expected))
        # Leave a tiny tail for visual breathing room; never show a caption
        # after the final spoken frame when ASR has a reliable endpoint.
        subtitle_end = max(0.15, min(end, (clip["end"] - clip["start"]) / timeline["fps"]))
        aligned = rel_times(parts, subtitle_end)
        item = {
            "id": clip["id"],
            "file": str(wav.relative_to(root)),
            "audioSeconds": round(float(info.duration), 3),
            "speechEndSeconds": round(end, 3),
            "expected": expected,
            "asr": "".join(asr_text),
            "similarity": round(ratio, 4),
            "segments": segs,
            "subtitleParts": aligned,
        }
        report["clips"].append(item)
        if args.write:
            clip["subtitleParts"] = aligned
            clip["asrSpeechEnd"] = round(end, 3)

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.write:
        timeline_path.write_text(json.dumps(timeline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"clips": len(report["clips"]), "report": str(report_path), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
