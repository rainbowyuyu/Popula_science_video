"""Build an evidence-bearing V4 source manifest without altering source assets.

Defaults describe the isolated work/audio-v4 -> public/audio/v4 activation.
All paths can be overridden. Missing or mismatched inputs produce a failed
manifest and exit 1; there is no fallback to V3 or a cloud candidate.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf8")).hexdigest()


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    defaults = {"work-dir": "work/audio-v4", "active-narration": "src/narration-v4.json",
                "active-captions": "src/captions-v4.json", "active-narration-wav": "public/audio/v4/narration.wav",
                "active-master": "public/audio/v4/master.wav", "music-manifest": "research/music-composition-v4.json",
                "public-root": "public", "output": "research/v4-source-manifest.json"}
    for name, default in defaults.items():
        parser.add_argument("--" + name, type=Path, default=ROOT / default)
    for name in ("narration", "captions", "narration-wav", "master", "generation-ledger", "mix-record", "video"):
        parser.add_argument("--" + name, type=Path)
    parser.add_argument("--model-dir", type=Path, default=Path("D:/python_project/tts/models/Qwen3-TTS-0.6B"))
    parser.add_argument("--reference", type=Path, default=Path("D:/python_project/tts/work/clone-reference.wav"))
    parser.add_argument("--music", action="append", type=Path, help="Repeat for each music/transition WAV used by the mix.")
    parser.add_argument("--source", action="append", type=Path, help="Repeat for activated renderer sources; defaults to the V4 entry, scenes, camera, timeline, events and render/mux script.")
    parser.add_argument("--unused-cloud-manifest", action="append", type=Path,
                        help="Repeat for cloud-generation ledgers to record as excluded. Defaults to the existing V4 cloud ledger.")
    args = parser.parse_args()
    for key, value in vars(args).items():
        if isinstance(value, Path):
            setattr(args, key, value.resolve())
    for field, filename in (("narration", "narration.json"), ("captions", "captions.json"),
                            ("narration_wav", "narration.wav"), ("master", "master.wav"),
                            ("generation_ledger", "voice-generation-v4.json"), ("mix_record", "audio-mix-v4.json")):
        setattr(args, field, getattr(args, field) or args.work_dir / filename)
    args.music = [p.resolve() for p in (args.music or [ROOT / "public/music/dna_archive_glow_v4.wav", ROOT / "public/music/dna_archive_transitions_v4.wav"])]
    args.source = [p.resolve() for p in (args.source or [ROOT / ("src/" + name) for name in
                   ("indexV4.tsx", "FilmV4.tsx", "WorldV4.ts", "CameraPathV4.ts", "TimelineV4.ts", "EventsV4.ts", "scene/StationsV4.ts")] + [ROOT / "scripts/render_v4.mjs"])]
    default_cloud = ROOT / "research/voice-generation-cloud-v4.json"
    args.unused_cloud_manifest = [p.resolve() for p in (args.unused_cloud_manifest or ([default_cloud] if default_cloud.exists() else []))]
    return args


def build(args):
    checks, file_map, cue_rows = [], {}, []
    manifest = {"schema": "rainbow.dna.source-manifest/v4", "createdAt": datetime.now(timezone.utc).isoformat(),
                "version": 4, "inputs": {k: str(v) for k, v in vars(args).items() if isinstance(v, Path)},
                "checks": checks, "cues": cue_rows, "subjectiveListeningChecked": False,
                "finalDeliveryVerified": False,
                "scope": "Source provenance and activation integrity. Full encoded-file, captions and duration checks are separate in delivery-qa-v4.json.",
                "limits": ["Model hashes identify local files used by the recorded generation setup; they are not third-party proof of training or model identity.",
                           "Request and output hashes bind recorded text to saved WAVs; they do not prove correct pronunciation or complete spoken content.",
                           "A source manifest without a successful final delivery QA is not a final-film approval."]}

    def check(name, ok, detail=None):
        checks.append({"id": name, "pass": bool(ok), "detail": detail})

    def display_path(path):
        try:
            return path.relative_to(ROOT).as_posix()
        except ValueError:
            return path.as_posix()

    def add(path, role):
        path = Path(path).resolve()
        if not path.is_file():
            check(role + "-present", False, str(path))
            return None
        key = str(path)
        if key not in file_map:
            file_map[key] = {"path": display_path(path), "bytes": path.stat().st_size, "sha256": sha(path), "roles": []}
        if role not in file_map[key]["roles"]:
            file_map[key]["roles"].append(role)
        return file_map[key]

    def loaded(path, role):
        return read(path) if add(path, role) else {}

    add(Path(__file__), "manifest-generator")
    narration = loaded(args.narration, "working-narration-json")
    captions = loaded(args.captions, "working-captions-json")
    active_narration = loaded(args.active_narration, "activated-narration-json")
    active_captions = loaded(args.active_captions, "activated-captions-json")
    ledger = loaded(args.generation_ledger, "local-generation-ledger")
    check("working-narration-version-four", narration.get("version") == 4, narration.get("version"))
    check("working-provider-local", narration.get("voiceProvider") == "local-user-tts-project", narration.get("voiceProvider"))
    check("active-narration-exact-json-match", bool(narration) and narration == active_narration,
          {"workingCanonicalSha256": canonical_hash(narration), "activeCanonicalSha256": canonical_hash(active_narration)})
    check("active-captions-exact-json-match", bool(captions) and captions == active_captions,
          {"workingCanonicalSha256": canonical_hash(captions), "activeCanonicalSha256": canonical_hash(active_captions)})

    reference = add(args.reference, "local-voice-reference")
    manifest["localVoice"] = {"provider": "local-user-tts-project", "model": "Qwen3-TTS-0.6B",
                              "modelDirectory": str(args.model_dir), "reference": reference}
    model_files = []
    if args.model_dir.is_dir():
        for path in sorted(args.model_dir.rglob("*")):
            if path.is_file() and not any(part in (".git", ".cache") for part in path.relative_to(args.model_dir).parts):
                if path.suffix.lower() in (".json", ".safetensors", ".bin", ".pt", ".pth", ".model", ".txt", ".vocab", ".merges", ".tiktoken"):
                    record = add(path, "local-model-file")
                    model_files.append({"path": path.relative_to(args.model_dir).as_posix(), "bytes": record["bytes"], "sha256": record["sha256"]})
    check("local-model-weights-present", any(Path(p["path"]).suffix in (".safetensors", ".bin", ".pt", ".pth") for p in model_files), len(model_files))
    manifest["localVoice"].update(modelFiles=model_files, modelTreeSha256=canonical_hash(model_files))

    working_wav = add(args.narration_wav, "working-narration-wav")
    active_wav = add(args.active_narration_wav, "activated-narration-wav")
    working_master = add(args.master, "working-master")
    active_master = add(args.active_master, "activated-master")
    check("activated-narration-wav-exact-match", working_wav and active_wav and working_wav["sha256"] == active_wav["sha256"])
    check("activated-master-exact-match", working_master and active_master and working_master["sha256"] == active_master["sha256"])
    narration_audio, narration_sr = sf.read(args.narration_wav, dtype="float32", always_2d=True) if working_wav else (None, None)
    used_audio_hashes, raw_hashes = set(), set()
    for item in (working_wav, active_wav, working_master, active_master):
        if item:
            used_audio_hashes.add(item["sha256"])
    cues = narration.get("cues", [])
    check("complete-cue-list-present", bool(cues), len(cues))
    check("generation-ledger-cue-set", bool(cues) and {c["id"] for c in cues} == set(ledger),
          {"cueIds": [c["id"] for c in cues], "ledgerIds": list(ledger)})
    for cue in cues:
        cue_id, generation = cue["id"], ledger.get(cue["id"], {})
        row = {"id": cue_id, "provider": generation.get("actualProvider"), "model": generation.get("model"),
               "seed": generation.get("seed"), "requestHash": generation.get("requestHash"),
               "spokenTextSha256": hashlib.sha256(cue.get("spokenText", cue.get("text", "")).encode("utf8")).hexdigest()}
        cue_rows.append(row)
        check(cue_id + "-local-generation", generation.get("actualProvider") == "local-user-tts-project" and
              generation.get("model") == "Qwen3-TTS-0.6B" and Path(generation.get("modelPath", ".")).resolve() == args.model_dir)
        check(cue_id + "-generation-text-matches-activated-script", generation.get("text") == cue.get("spokenText", cue.get("text")) and generation.get("displayText") == cue.get("text"))
        check(cue_id + "-reference-hash", reference and generation.get("referenceSha256") == reference["sha256"])
        spec = {key: generation.get(key) for key in ("text", "referenceSha256", "model", "modelPath", "seed", "parameters")}
        request_hash = hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False).encode("utf8")).hexdigest()
        check(cue_id + "-request-hash", request_hash == generation.get("requestHash"))
        raw_path = (ROOT / generation["file"]).resolve() if generation.get("file") else args.work_dir / "raw" / (cue_id + ".wav")
        clean_path = (ROOT / cue["workingAudioFile"]).resolve() if cue.get("workingAudioFile") else args.work_dir / "clean" / (cue_id + ".wav")
        active_path = (args.public_root / cue["audioFile"]).resolve() if cue.get("audioFile") else args.public_root / "audio/v4/clean" / (cue_id + ".wav")
        raw, clean, active = add(raw_path, cue_id + "-local-raw"), add(clean_path, cue_id + "-working-clean"), add(active_path, cue_id + "-activated-clean")
        row.update(raw=raw, clean=clean, activatedClean=active)
        processing = loaded(args.work_dir / "processing" / (cue_id + ".json"), cue_id + "-processing")
        if raw:
            raw_hashes.add(raw["sha256"])
            check(cue_id + "-local-raw-hash", raw["sha256"] == generation.get("sha256"))
            check(cue_id + "-processing-original-hash", raw["sha256"] == processing.get("originalRawSha256"))
        if clean:
            check(cue_id + "-processing-output-hash", clean["sha256"] == processing.get("outputSha256"))
        check(cue_id + "-activated-clean-exact-match", clean and active and clean["sha256"] == active["sha256"])
        for item in (raw, clean, active):
            if item:
                used_audio_hashes.add(item["sha256"])
        if clean and narration_audio is not None:
            clip, sr = sf.read(clean_path, dtype="float32", always_2d=True)
            start = round(cue["startSec"] * sr)
            fits = narration_sr == sr and start >= 0 and start + len(clip) <= len(narration_audio) and clip.shape[1] in (1, narration_audio.shape[1])
            error = float(np.max(np.abs(narration_audio[start:start + len(clip)] - clip))) if fits else None
            row["narrationMaxSampleError"] = error
            check(cue_id + "-exact-narration-insertion", error is not None and error <= 2 / 8388608,
                  {"sampleStart": start, "clipFrames": len(clip), "maximumError": error})
        else:
            check(cue_id + "-exact-narration-insertion", False, "Missing clean or assembled narration WAV")

    music_manifest = loaded(args.music_manifest, "v4-music-composition-record")
    expected_music = {str((ROOT / p["path"]).resolve()): p.get("sha256") for p in music_manifest.get("files", [])}
    check("v4-music-record-version", music_manifest.get("version") in (4, "v4"), music_manifest.get("version"))
    manifest["music"] = {key: music_manifest.get(key) for key in ("title", "version", "originalArrangement", "sourceSamples", "sampleLicense", "sampleManifest", "seed", "bpm", "seconds", "timeStretch")}
    for index, path in enumerate(args.music):
        record = add(path, "new-music-" + str(index))
        if record:
            used_audio_hashes.add(record["sha256"])
            check("music-" + str(index) + "-composition-hash", record["sha256"] == expected_music.get(str(path)))
    sample_manifest = music_manifest.get("sampleManifest")
    if sample_manifest:
        add(ROOT / sample_manifest, "music-sample-source-manifest")
    for path in args.source:
        add(path, "activated-v4-source")

    # A music file's existence does not establish that it was mixed. Bind the
    # actual mixer inputs and output to this manifest's selected files.
    mixing = loaded(args.mix_record, "v4-mixing-record")
    check("mix-no-stretch-or-truncation", mixing.get("timeStretch") is False and mixing.get("truncation") is False)
    expected_mix = {"narration": args.narration_wav, "timeline": args.narration}
    if len(args.music) >= 2:
        expected_mix.update(music=args.music[0], transitions=args.music[1])
    mix_inputs = {row.get("role"): row for row in mixing.get("inputs", [])}
    check("mix-input-roles-present", set(expected_mix) <= set(mix_inputs), list(mix_inputs))
    for role, expected_path in expected_mix.items():
        row = mix_inputs.get(role, {})
        actual_path = (ROOT / row["path"]).resolve() if row.get("path") else None
        record = add(actual_path, "mix-input-" + role) if actual_path else None
        check("mix-input-" + role + "-matches-selected-source", actual_path == expected_path and record and record["sha256"] == row.get("sha256"),
              {"expectedPath": str(expected_path), "recordedPath": str(actual_path) if actual_path else None})
    output_rows = mixing.get("files", [])
    for index, row in enumerate(output_rows):
        record = add(ROOT / row["path"], "mix-output-" + str(index))
        check("mix-output-" + str(index) + "-hash", record and record["sha256"] == row.get("sha256"))
    check("mix-record-binds-final-master", working_master and any(
        (ROOT / row["path"]).resolve() == args.master and row.get("sha256") == working_master["sha256"] for row in output_rows))
    manifest["mix"] = {key: mixing.get(key) for key in ("seconds", "sampleRate", "channels", "timeStretch", "truncation", "musicTitle", "inputs", "files", "wav", "aac")}
    for name in ("voice_v4.py", "prepare_voice_v4.py", "score_v4.py", "mix_v4.py"):
        add(ROOT / "scripts" / name, "v4-audio-generation-source")

    excluded_cloud = []
    for path in args.unused_cloud_manifest:
        if not path.is_file():
            check("excluded-cloud-ledger-present", False, str(path))
            continue
        cloud = read(path)
        entries = []
        for cue_id, item in cloud.items():
            if not isinstance(item, dict):
                continue
            candidate = (ROOT / item["file"]).resolve() if item.get("file") else None
            actual_hash = sha(candidate) if candidate and candidate.is_file() else None
            entries.append({"id": cue_id, "model": item.get("model"), "path": display_path(candidate) if candidate else None,
                            "recordedSha256": item.get("sha256"), "actualSha256": actual_hash,
                            "present": actual_hash is not None, "usedInV4": actual_hash in used_audio_hashes if actual_hash else False})
        disjoint = all(not row["usedInV4"] and row["recordedSha256"] not in used_audio_hashes for row in entries)
        check("cloud-candidates-excluded-" + path.stem, disjoint, {"candidates": len(entries)})
        excluded_cloud.append({"ledgerPath": display_path(path), "ledgerSha256": sha(path), "usage": "unused-candidate",
                               "reason": "The activated V4 voice uses the local generation ledger and its matching raw/clean WAVs; cloud candidate hashes are excluded.",
                               "candidateHashesDisjointFromUsedAudio": disjoint, "candidates": entries})
    manifest["excludedCloudCandidates"] = excluded_cloud
    if args.video:
        add(args.video, "final-video-selected-for-later-delivery-qa")
    manifest["files"] = sorted(file_map.values(), key=lambda item: item["path"])
    manifest["sourceSetSha256"] = canonical_hash([{key: row[key] for key in ("path", "sha256")} for row in manifest["files"]])
    return manifest


def main():
    args = parse_args()
    try:
        manifest = build(args)
    except Exception as exc:
        manifest = {"schema": "rainbow.dna.source-manifest/v4", "version": 4,
                    "createdAt": datetime.now(timezone.utc).isoformat(), "finalDeliveryVerified": False,
                    "checks": [{"id": "manifest-exception", "pass": False, "detail": type(exc).__name__ + ": " + str(exc)}]}
    failed = [row["id"] for row in manifest["checks"] if not row["pass"]]
    manifest.update(status="failed" if failed else "source-activation-checks-pass", failedCheckIds=failed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf8")
    print(json.dumps({"status": manifest["status"], "checks": len(manifest["checks"]),
                      "files": len(manifest.get("files", [])), "failedCheckIds": failed,
                      "output": str(args.output)}, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
