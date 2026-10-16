"""Align exact narration captions to Whisper's measured word timings.

The old V3 audit split a caption at punctuation and then allocated time by
character count. That can hide a stumble, a missed word, or an early/late
final syllable. This module keeps the exact text supplied to TTS and derives
caption windows only from Whisper word timestamps. Unmatched text is reported
explicitly and is never silently assigned an invented time.

Raw WAV files are read only. The audit report is always written. ``--write``
updates the timeline only when every requested caption part has a complete
exact alignment, so a partial audit cannot become a misleading render.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


try:  # Optional, but preferred for a full traditional-to-simplified mapping.
    from opencc import OpenCC  # type: ignore
except Exception:  # pragma: no cover - host dependent
    OpenCC = None  # type: ignore[assignment,misc]

try:  # Optional alternate conversion backend.
    from zhconv import convert as zhconv_convert  # type: ignore
except Exception:  # pragma: no cover - host dependent
    zhconv_convert = None  # type: ignore[assignment]


# Map spoken Chinese digit symbols to Arabic forms, so ``二零零三`` and
# ``2003`` compare equally. ``十`` is handled as the common standalone “ten”
# token; the normalizer does not infer arithmetic values for larger phrases.
CHINESE_DIGITS = str.maketrans({
    "零": "0", "〇": "0", "○": "0", "一": "1", "二": "2", "两": "2",
    "三": "3", "四": "4", "五": "5", "六": "6", "七": "7", "八": "8",
    "九": "9", "十": "10",
})


@dataclass(frozen=True)
class NormUnit:
    char: str
    source_index: int


def _converter() -> tuple[str, Any]:
    if OpenCC is not None:
        try:
            converter = OpenCC("t2s")
            return "opencc:t2s", converter.convert
        except Exception:
            pass
    if zhconv_convert is not None:
        return "zhconv:simplified", lambda text: zhconv_convert(text, "zh-cn")
    # A partial hand-maintained table is deliberately avoided: it creates
    # deceptively high scores while leaving technical words inconsistent.
    return "identity", lambda text: text


NORMALIZER_NAME, _convert_text = _converter()


def normalize_units(text: str) -> list[NormUnit]:
    """Normalize text and retain the source character for every output unit."""
    units: list[NormUnit] = []
    for source_index, source_char in enumerate(text):
        converted = _convert_text(source_char).translate(CHINESE_DIGITS)
        for char in converted.lower():
            if re.match(r"[\u4e00-\u9fff0-9a-z]", char):
                units.append(NormUnit(char=char, source_index=source_index))
    return units


def normalize(text: str) -> str:
    return "".join(unit.char for unit in normalize_units(text))


def sentence_parts(text: str) -> list[str]:
    """Split exact source text into readable caption units."""
    chunks = re.findall(r"[^。！？；：]+[。！？；：]?", text)
    out: list[str] = []
    for chunk in chunks or [text]:
        rest = chunk.strip()
        while len(rest) > 24:
            cuts = [rest.rfind(mark, 8, 24) for mark in "，、, "]
            cut = max(cuts)
            if cut < 8:
                cut = 22
            out.append(rest[: cut + 1].strip())
            rest = rest[cut + 1 :].strip()
        if rest:
            out.append(rest)
    return [x for x in out if x]


def _value(obj: Any, name: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def flatten_words(segments: Iterable[Any]) -> list[dict[str, Any]]:
    """Flatten Whisper words, preserving real timestamps and raw text.

    Chinese Whisper words may contain multiple characters. We retain each
    enclosing word's true start/end and interpolate character positions only
    for matching; caption rows record that interpolation occurred.
    """
    result: list[dict[str, Any]] = []
    for segment_index, segment in enumerate(segments):
        for word_index, word in enumerate(_value(segment, "words", None) or []):
            raw = str(_value(word, "word", ""))
            start = float(_value(word, "start", 0.0) or 0.0)
            end = float(_value(word, "end", start) or start)
            probability = _value(word, "probability", None)
            try:
                probability = float(probability) if probability is not None else None
            except (TypeError, ValueError):
                probability = None
            units = normalize_units(raw)
            span = max(0.0, end - start)
            unit_rows = []
            for unit_index, unit in enumerate(units):
                left = start + span * unit_index / max(1, len(units))
                right = start + span * (unit_index + 1) / max(1, len(units))
                unit_rows.append({
                    "char": unit.char,
                    "start": round(left, 6),
                    "end": round(right, 6),
                    "wordIndex": len(result),
                    "interpolated": len(units) > 1,
                })
            result.append({
                "index": len(result),
                "segmentIndex": segment_index,
                "wordIndex": word_index,
                "text": raw,
                "normalized": "".join(unit.char for unit in units),
                "start": round(start, 6),
                "end": round(end, 6),
                "probability": probability,
                "units": unit_rows,
            })
    return result


def _matching_map(expected: Sequence[str], recognized: Sequence[str]) -> dict[int, list[int]]:
    """Map expected normalized positions to exact recognized positions."""
    mapping: dict[int, list[int]] = {}
    matcher = difflib.SequenceMatcher(None, list(expected), list(recognized), autojunk=False)
    for tag, e0, e1, a0, a1 in matcher.get_opcodes():
        if tag != "equal":
            continue
        for expected_index, recognized_index in zip(range(e0, e1), range(a0, a1)):
            mapping.setdefault(expected_index, []).append(recognized_index)
    return mapping


def _recognized_units(words: Sequence[dict[str, Any]]) -> tuple[list[str], list[dict[str, Any]]]:
    chars: list[str] = []
    owners: list[dict[str, Any]] = []
    for word in words:
        for unit in word.get("units", []):
            chars.append(str(unit["char"]))
            owners.append({"wordIndex": int(word["index"]), **unit})
    return chars, owners


def align_parts(expected: str, words: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Align exact caption parts to matched Whisper word boundaries.

    A row with no exact character match has null boundaries. A partial row is
    timed only over the matched word span and carries its unmatched source
    text, status and coverage; callers must not treat it as fully aligned.
    """
    parts = sentence_parts(expected)
    expected_units = normalize_units(expected)
    asr_chars, asr_owners = _recognized_units(words)
    mapping = _matching_map([u.char for u in expected_units], asr_chars)
    rows: list[dict[str, Any]] = []
    cursor = 0
    for part in parts:
        part_units = normalize_units(part)
        p0, p1 = cursor, cursor + len(part_units)
        cursor = p1
        if p0 < len(expected_units):
            source_start = expected_units[p0].source_index
        else:
            source_start = len(expected)
        expected_indexes = list(range(p0, p1))
        matched_expected = [i for i in expected_indexes if i in mapping]
        matched_asr = [j for i in matched_expected for j in mapping[i]]
        missing_expected = [i for i in expected_indexes if i not in mapping]
        matched_asr_set = set(matched_asr)
        missing_source = {expected_units[i].source_index for i in missing_expected}
        unmatched_text = "".join(
            char for local_i, char in enumerate(part)
            if source_start + local_i in missing_source
        )
        matched_word_indexes = sorted({int(asr_owners[j]["wordIndex"]) for j in matched_asr})
        # An insertion in the recognized span (for example, expected
        # ``蓝光打开`` but ASR ``蓝光马上打开``) must not be called exact merely
        # because every expected character happened to match.  Surface the
        # inserted recognized units as well as missing source text.
        if matched_asr:
            asr_lo, asr_hi = min(matched_asr), max(matched_asr)
            extra_asr_indexes = [j for j in range(asr_lo, asr_hi + 1) if j not in matched_asr_set]
        else:
            extra_asr_indexes = []
        extra_recognized_text = "".join(asr_chars[j] for j in extra_asr_indexes)
        probabilities = [
            float(words[i]["probability"])
            for i in matched_word_indexes if words[i].get("probability") is not None
        ]
        mean_probability = sum(probabilities) / len(probabilities) if probabilities else None
        matched_ratio = len(matched_expected) / max(1, len(expected_indexes))
        if not matched_word_indexes:
            status, start, end, timing_source = "unmatched", None, None, "none"
        else:
            start = min(float(words[i]["start"]) for i in matched_word_indexes)
            end = max(float(words[i]["end"]) for i in matched_word_indexes)
            status = "exact" if matched_ratio == 1.0 and not extra_asr_indexes else "partial"
            timing_source = "whisper-word-boundary"
        confidence = round(matched_ratio * (mean_probability if mean_probability is not None else 1.0), 4)
        rows.append({
            "text": part,
            "start": round(start, 3) if start is not None else None,
            "end": round(end, 3) if end is not None else None,
            "status": status,
            "timingSource": timing_source,
            "matchedChars": len(matched_expected),
            "expectedChars": len(expected_indexes),
            "matchedRatio": round(matched_ratio, 4),
            "confidence": confidence,
            "matchedWordIndexes": matched_word_indexes,
            "matchedWords": [words[i]["text"] for i in matched_word_indexes],
            "unmatchedText": unmatched_text,
            "extraRecognizedText": extra_recognized_text,
            "extraRecognizedChars": len(extra_asr_indexes),
            "meanWordProbability": round(mean_probability, 4) if mean_probability is not None else None,
            "interpolatedWordUnits": any(asr_owners[j].get("interpolated") for j in matched_asr),
        })
    return {
        "parts": rows,
        "expectedNormalized": "".join(u.char for u in expected_units),
        "recognizedNormalized": "".join(asr_chars),
        "mappingMatchedChars": sum(1 for i in range(len(expected_units)) if i in mapping),
        "mappingExpectedChars": len(expected_units),
    }


def _segment_record(segment: Any, index: int) -> dict[str, Any]:
    return {
        "index": index,
        "start": round(float(_value(segment, "start", 0.0) or 0.0), 3),
        "end": round(float(_value(segment, "end", 0.0) or 0.0), 3),
        "text": str(_value(segment, "text", "") or "").strip(),
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _load_model(model_path: Path, probe: Path):
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("Use D:/python_project/tts/.venv/Scripts/python.exe for faster-whisper") from exc
    try:
        import torch
        use_cuda = bool(torch.cuda.is_available())
    except Exception:
        use_cuda = False
    try:
        model = WhisperModel(
            str(model_path), device="cuda" if use_cuda else "cpu",
            compute_type="float16" if use_cuda else "int8",
        )
        if use_cuda:
            next(model.transcribe(str(probe), language="zh", beam_size=1, vad_filter=False)[0], None)
        return model
    except Exception as exc:
        if not use_cuda:
            raise
        print(f"CUDA Whisper unavailable ({exc}); retrying on CPU int8", flush=True)
        return WhisperModel(str(model_path), device="cpu", compute_type="int8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--model", type=Path, default=Path("D:/python_project/tts/models/whisper-small"))
    parser.add_argument("--ids", default="", help="comma-separated clip ids; default is all clips")
    parser.add_argument("--write", action="store_true", help="write only complete exact alignments to timeline")
    parser.add_argument(
        "--write-reviewed", type=Path, default=None,
        help="write exact alignments plus partial rows listed in a source-hash-bound review JSON",
    )
    args = parser.parse_args()
    root = args.root
    timeline_path = root / "src/nobel2026/timeline-v3.json"
    audio_dir = root / "public/nobel2026/voice-v3-raw"
    report_path = root / "research/nobel2026/asr-alignment-v3.json"
    timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
    requested = {x.strip() for x in args.ids.split(",") if x.strip()}
    clips = [c for c in timeline["clips"] if not requested or c["id"] in requested]
    if requested and {c["id"] for c in clips} != requested:
        missing = sorted(requested - {c["id"] for c in clips})
        raise SystemExit(f"unknown clip ids: {', '.join(missing)}")
    if not clips:
        raise SystemExit("no clips selected")
    probe = audio_dir / f"{clips[0]['id']}.wav"
    if not probe.exists():
        raise FileNotFoundError(probe)
    model = _load_model(args.model, probe)
    report: dict[str, Any] = {
        "version": "v3-word-timed-alignment",
        "model": str(args.model),
        "normalization": {
            "backend": NORMALIZER_NAME,
            "digits": "Chinese digit symbols mapped to ASCII forms; 十=10 only as a standalone ten token",
            "punctuation": "removed for matching; original caption retained",
            "traditionalSimplified": "converter only; no partial manual character table",
        },
        "alignmentMethod": "SequenceMatcher exact normalized character matches mapped to Whisper word boundaries; unmatched spans remain unaligned",
        "audioDir": str(audio_dir.relative_to(root)),
        "rawAudioPolicy": "read-only; sourceSha256 recorded for every clip",
        "clips": [],
    }
    updates: dict[str, list[dict[str, Any]]] = {}
    reviewed = None
    if args.write_reviewed is not None:
        reviewed = json.loads(args.write_reviewed.read_text(encoding="utf-8"))
        if reviewed.get("version") != "nobel2026-v3-reviewed-asr-partials":
            raise SystemExit("review JSON has an unexpected version")
        reviewed = {str(c["id"]): c for c in reviewed.get("clips", [])}
    approved_rows = 0
    for clip in clips:
        wav = audio_dir / f"{clip['id']}.wav"
        if not wav.exists():
            raise FileNotFoundError(wav)
        segment_iter, info = model.transcribe(
            str(wav), language="zh", beam_size=5, best_of=5,
            vad_filter=False, word_timestamps=True,
            condition_on_previous_text=False,
        )
        segments = list(segment_iter)
        words = flatten_words(segments)
        expected = clip.get("spoken", clip.get("subtitle", ""))
        alignment = align_parts(expected, words)
        recognized = "".join(str(_value(s, "text", "") or "").strip() for s in segments)
        duration = float(info.duration)
        speech_end = min(duration, max([float(_value(s, "end", 0.0) or 0.0) for s in segments] + [0.15]))
        rows = alignment["parts"]
        complete = all(row["status"] == "exact" for row in rows)
        review_ok = False
        if reviewed is not None:
            entry = reviewed.get(clip["id"])
            mismatches = [row for row in rows if row["status"] != "exact"]
            if mismatches:
                if not entry or entry.get("sourceSha256") != sha256(wav):
                    raise SystemExit(f"missing or stale audio review for clip {clip['id']}")
                wanted = [{
                    "text": row["text"],
                    "unmatchedText": row["unmatchedText"],
                    "extraRecognizedText": row["extraRecognizedText"],
                } for row in mismatches]
                if entry.get("partials") != wanted:
                    raise SystemExit(f"ASR discrepancy changed since review for clip {clip['id']}")
                if any(row["start"] is None or row["end"] is None for row in mismatches):
                    raise SystemExit(f"untimed partial cannot be approved for clip {clip['id']}")
                for row in mismatches:
                    row["reviewStatus"] = "homophonic-asr-reviewed"
                    approved_rows += 1
            review_ok = all(row["status"] == "exact" or row.get("reviewStatus") for row in rows)
        report["clips"].append({
            "id": clip["id"],
            "file": str(wav.relative_to(root)),
            "sourceSha256": sha256(wav),
            "audioSeconds": round(duration, 3),
            "speechEndSeconds": round(speech_end, 3),
            "expected": expected,
            "asr": recognized,
            "sequenceSimilarity": round(difflib.SequenceMatcher(
                None, alignment["expectedNormalized"], alignment["recognizedNormalized"], autojunk=False
            ).ratio(), 4),
            # Keep the old report key for downstream dashboards while making
            # the new name explicit above.
            "similarity": round(difflib.SequenceMatcher(
                None, alignment["expectedNormalized"], alignment["recognizedNormalized"], autojunk=False
            ).ratio(), 4),
            "alignmentComplete": complete,
            "segments": [_segment_record(s, i) for i, s in enumerate(segments)],
            "words": words,
            "subtitleParts": rows,
            "unmatchedParts": [row["text"] for row in rows if row["status"] != "exact"],
        })
        if complete or review_ok:
            updates[clip["id"]] = rows
    report["summary"] = {
        "clips": len(report["clips"]),
        "completeClips": sum(bool(c["alignmentComplete"]) for c in report["clips"]),
        "incompleteClips": sum(not bool(c["alignmentComplete"]) for c in report["clips"]),
        "unmatchedPartCount": sum(len(c["unmatchedParts"]) for c in report["clips"]),
        "reviewedPartialRows": approved_rows,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.write or args.write_reviewed is not None:
        if len(updates) != len(clips):
            incomplete = [c["id"] for c in report["clips"] if not c["alignmentComplete"]]
            raise SystemExit(
                "Refusing timeline write: incomplete or unreviewed word alignments in " + ", ".join(incomplete) +
                ". Report was written; review unmatchedParts before writing the timeline."
            )
        by_id = {c["id"]: c for c in timeline["clips"]}
        for clip_id, rows in updates.items():
            if "".join(row["text"] for row in rows) != by_id[clip_id]["subtitle"]:
                raise SystemExit(f"alignment text differs from narration: {clip_id}")
            by_id[clip_id]["subtitleParts"] = rows
            by_id[clip_id]["asrSpeechEnd"] = next(c["speechEndSeconds"] for c in report["clips"] if c["id"] == clip_id)
        timeline_path.write_text(json.dumps(timeline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "clips": len(report["clips"]), "report": str(report_path),
        "written": bool((args.write or args.write_reviewed is not None) and len(updates) == len(clips)),
        "normalizer": NORMALIZER_NAME,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
