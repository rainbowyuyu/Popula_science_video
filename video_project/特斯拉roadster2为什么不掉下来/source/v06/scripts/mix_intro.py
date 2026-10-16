"""V06 continuous score + an exact delay of the frozen V05 narration.

Usage (from any working directory):
  python mix_intro.py --intro-seconds 17 --plan
  python mix_intro.py --intro-seconds 17
  python mix_intro.py --self-test

The added intro must contain an integer number of 30 fps frames.  This script
does not edit V05, synthesize speech, import clip audio, or change source cue
durations.  Shifted timing copies are written only to work/audio for integration.
No output audio is created by --plan or --self-test.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
V05 = ROOT.parent / "v05"
OUT = ROOT / "work/audio"
PUBLIC = ROOT / "public/audio"
SR = 48000
FPS = 30
SAMPLES_PER_FRAME = SR // FPS
SOURCE = Path("D:/CloudMusic/电台节目/绿豆腐炒肉 - 莫问归期+辞九门回忆dj.mp3")
STRENGTHS = {"hook": 1.1, "suction": -.5, "ceiling": -1., "release": .4,
             "thrust": .8, "roll": 1., "control": -.8, "limits": -1.3, "recap": .7}


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def save(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf8")
    temp.replace(path)


def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def ffmpeg(*args):
    executable = shutil.which("ffmpeg")
    if not executable:
        raise RuntimeError("FFmpeg is not available on PATH")
    return subprocess.run([executable, "-hide_banner", *map(str, args)],
                          capture_output=True, text=True, encoding="utf8",
                          errors="replace", check=True)


def measure(path, integrated=-16, peak=-1.5):
    result = ffmpeg("-i", path, "-af",
                    f"loudnorm=I={integrated}:TP={peak}:LRA=9:print_format=json",
                    "-f", "null", "-")
    matches = re.findall(r"\{[^{}]+\}", result.stderr, re.S)
    if not matches:
        raise RuntimeError("FFmpeg did not return loudness measurements")
    return json.loads(matches[-1])


def normalize(source, destination, integrated=-16, peak=-1.5):
    info = measure(source, integrated, peak)
    filt = (f"loudnorm=I={integrated}:TP={peak}:LRA=9:"
            f"measured_I={info['input_i']}:measured_TP={info['input_tp']}:"
            f"measured_LRA={info['input_lra']}:measured_thresh={info['input_thresh']}:"
            f"offset={info['target_offset']}:linear=true:print_format=json")
    result = ffmpeg("-y", "-i", source, "-af", filt, "-ar", SR, "-ac", 2,
                    "-c:a", "pcm_s24le", destination)
    return info, result.stderr


def intro_frames(seconds):
    if not math.isfinite(seconds) or seconds < 0:
        raise ValueError("--intro-seconds must be a finite, nonnegative duration")
    frames = round(seconds * FPS)
    if abs(seconds - frames / FPS) > 1e-7:
        raise ValueError("--intro-seconds must align exactly to a 30 fps frame")
    return frames


def extend_music(source, count, start, end, overlap, sr=SR):
    """Keep the original opening; repeat a phrase with complementary gains."""
    if source.ndim != 2 or source.shape[1] != 2:
        raise ValueError("Music must be stereo")
    begin, stop, fade_count = round(start * sr), round(end * sr), round(overlap * sr)
    if not (0 <= begin < stop <= len(source)) or not (0 < fade_count < stop - begin):
        raise ValueError("Loop boundary is outside the source or cannot advance")
    output = np.zeros((count, 2), dtype=np.float32)
    cursor = min(count, stop)
    output[:cursor] = source[:cursor]
    mapping = [{"outputStartSec": 0, "outputEndSec": cursor / sr,
                "sourceStartSec": 0, "sourceEndSec": cursor / sr,
                "type": "original continuous opening"}]
    while cursor < count:
        join = cursor - fade_count
        needed = min(stop - begin, count - join)
        incoming = source[begin:begin + needed]
        fade = min(fade_count, needed)
        u = np.linspace(0, 1, fade, dtype=np.float32)
        weight = (.5 - .5 * np.cos(np.pi * u))[:, None]
        output[join:join + fade] *= 1 - weight
        output[join:join + fade] += incoming[:fade] * weight
        output[join + fade:join + needed] = incoming[fade:]
        mapping.append({"outputStartSec": join / sr,
                        "outputEndSec": (join + needed) / sr,
                        "sourceStartSec": begin / sr,
                        "sourceEndSec": (begin + needed) / sr,
                        "type": "beat-aligned repeat", "crossfadeSec": fade / sr})
        if join + needed <= cursor:
            raise RuntimeError("Music loop made no progress")
        cursor = join + needed
    return output, mapping


def delayed_voice(source, delay_samples):
    output = np.zeros(len(source) + delay_samples, dtype=np.float32)
    output[delay_samples:] = source
    return output


def shift_timing(original, frames):
    """Shift only absolute cue/group positions, never raw or actual durations."""
    shifted = deepcopy(original)
    seconds = frames / FPS
    for item in shifted.get("cues", []) + shifted.get("groups", []):
        for key in ("startFrame", "endFrame"):
            if key in item:
                item[key] += frames
        for key in ("startSample", "endSample"):
            if key in item:
                item[key] += frames * SAMPLES_PER_FRAME
        for key in ("start", "end", "startSec", "endSec"):
            if key in item:
                item[key] += seconds
    if "durationFrames" in shifted:
        shifted["durationFrames"] += frames
    if "durationSec" in shifted:
        shifted["durationSec"] += seconds
    shifted["introOffsetFrames"] = frames
    shifted["introOffsetSec"] = seconds
    shifted["sourceTimeline"] = "source/v05/src/" + ("narration.json" if "groups" in original else "captions-data.json")
    return shifted


def music_control(narration, count, intro_seconds):
    control_sr = 100
    times = np.arange(math.ceil(count / SR * control_sr) + 1) / control_sr
    duck = np.zeros(len(times), dtype=np.float32)
    for cue in narration["cues"]:
        duck[(times >= cue["startSec"] - .18) & (times <= cue["endSec"] + .10)] = -8
    duck = gaussian_filter1d(duck, 12, mode="nearest")
    first_voice = narration["cues"][0]["startSec"]
    # The score is prominent through the silent intro.  A single long descent
    # anticipates the first phrase instead of a new music start at the seam.
    end = max(0., first_voice - .18)
    start = max(0., end - 1.2)
    u = np.clip((times - start) / max(end - start, .01), 0, 1)
    intro_boost = 5 * (1 - u * u * (3 - 2 * u)) if intro_seconds else np.zeros_like(times)
    return times, (duck + intro_boost).astype(np.float32), {
        "musicDuckingDb": 8, "duckAttackAnticipationSec": .18,
        "duckSmoothingSec": .12, "introMusicBoostDb": 5 if intro_seconds else 0,
        "introMusicDescentStartSec": start, "introMusicDescentEndSec": end,
        "firstNarrationSec": first_voice,
    }


def validate(seconds):
    frames = intro_frames(seconds)
    freeze = read(V05 / "work/audio/audio-freeze.json")
    required = ["src/narration.json", "src/captions-data.json", "public/audio/narration.wav"]
    for relative in required:
        if sha(V05 / relative) != freeze["frozenSources"][relative]:
            raise RuntimeError(f"Frozen V05 input changed: {relative}")
    provenance = read(V05 / "work/audio/music-provenance.json")
    if sha(SOURCE) != provenance["sourceSha256"]:
        raise RuntimeError("The user-selected music source has changed")
    narration = read(V05 / "src/narration.json")
    info = sf.info(V05 / "public/audio/narration.wav")
    if info.samplerate != SR or info.channels != 1 or info.frames != narration["durationFrames"] * SAMPLES_PER_FRAME:
        raise RuntimeError("Frozen narration format or timeline length does not match")
    analysis = read(V05 / "work/audio/music-analysis.json")
    candidate = next(c for c in analysis["loopCandidates"]
                     if c["sourceStartBeat"] == 180 and c["sourceEndBeat"] == 436)
    return frames, narration, analysis, candidate, provenance


def self_test():
    assert intro_frames(17) == 510
    try:
        intro_frames(.01)
        raise AssertionError("Off-frame intro was accepted")
    except ValueError:
        pass
    voice = np.array([.1, -.2, .3], dtype=np.float32)
    shifted = delayed_voice(voice, 4)
    assert np.all(shifted[:4] == 0) and np.array_equal(shifted[4:], voice)
    example = {"durationFrames": 30, "durationSec": 1,
               "cues": [{"startFrame": 3, "endFrame": 15, "startSec": .1,
                         "endSec": .5, "actualDurationSec": .4,
                         "startSample": 4800, "endSample": 24000}], "groups": []}
    shifted = shift_timing(example, 60)
    assert shifted["cues"][0]["startSample"] == 100800
    assert shifted["cues"][0]["actualDurationSec"] == .4 and example["durationFrames"] == 30
    constant = np.ones((100, 2), dtype=np.float32) * .25
    looped, mapping = extend_music(constant, 230, .2, .8, .1, sr=100)
    assert len(looped) == 230 and np.allclose(looped, .25) and len(mapping) > 1
    brief, mapping = extend_music(constant, 20, .2, .8, .1, sr=100)
    assert np.array_equal(brief, constant[:20]) and len(mapping) == 1
    print("PASS: frame alignment, exact voice delay, immutable cue shift, short and multi-loop continuity")


def verify_existing():
    """Technical-only audit of the generated master; no remix or source edits."""
    report = read(OUT / "mix-report.json")
    narr = read(OUT / "narration.json")
    timeline = read(OUT / "timeline-shift.json")
    edit_map = read(OUT / "music-edit-map.json")
    frames, old, _, _, _ = validate(report["introSeconds"])
    offset = frames * SAMPLES_PER_FRAME
    voice, _ = sf.read(PUBLIC / "narration.wav", dtype="float32")
    original, _ = sf.read(V05 / "public/audio/narration.wav", dtype="float32")
    checks = []
    def check(name, passed, detail=None):
        checks.append({"name": name, "passed": bool(passed), "detail": detail})
    check("exact-delayed-narration", np.array_equal(voice[offset:], original),
          {"offsetFrames": frames, "offsetSamples": offset, "offsetSec": offset / SR})
    check("intro-narration-silence", not np.any(voice[:offset]))
    first = narr["cues"][0]["startSample"]
    check("pre-first-cue-narration-silence", not np.any(voice[:first]), first / SR)
    check("all-cue-windows-exactly-shifted", all(
        b["startSample"] - a["startSample"] == offset and
        b["endSample"] - a["endSample"] == offset and
        b["text"] == a["text"] for a, b in zip(old["cues"], narr["cues"])))
    del voice, original
    with sf.SoundFile(OUT / "mix-premaster.wav") as premaster, sf.SoundFile(OUT / "score-ducked.wav") as music:
        p = premaster.read(first, dtype="float32")
        m = music.read(first, dtype="float32")
        error = float(np.max(np.abs(p - m)))
    check("intro-mix-only-background-music", error < 2e-7,
          {"maximumPremasterVsMusicError": error, "clipSourceAudioIncluded": False})
    del p, m
    controls, gains, duck = music_control(narr, timeline["durationFrames"] * SAMPLES_PER_FRAME, report["introSeconds"])
    sample_times = [max(0, duck["introMusicDescentStartSec"] - .5),
                    duck["introMusicDescentStartSec"],
                    (duck["introMusicDescentStartSec"] + duck["introMusicDescentEndSec"]) / 2,
                    duck["introMusicDescentEndSec"], duck["firstNarrationSec"],
                    duck["firstNarrationSec"] + .4]
    duck_samples = [{"timeSec": t, "gainDB": round(float(np.interp(t, controls, gains)), 3)} for t in sample_times]
    check("first-cue-duck-anticipation", duck["introMusicDescentEndSec"] < duck["firstNarrationSec"] and
          duck_samples[-1]["gainDB"] < -7.8, duck_samples)
    count = timeline["durationFrames"] * SAMPLES_PER_FRAME
    for filename in ("master.wav", "score.wav", "narration.wav"):
        info = sf.info(PUBLIC / filename)
        check(filename + "-duration", info.frames == count and info.samplerate == SR,
              {"samples": info.frames, "durationSec": info.duration})
    segments = [{"name": "intro-music", "start": .5, "duration": max(1., report["introSeconds"] - 2)},
                {"name": "first-cue-entrance", "start": max(0, duck["firstNarrationSec"] - 2), "duration": 12},
                {"name": "ending-with-final-narration", "start": report["durationSec"] - 20, "duration": 14},
                {"name": "final-music-fade", "start": report["durationSec"] - 6, "duration": 6}]
    seams = []
    for index, item in enumerate(edit_map["mapping"][1:], 1):
        start = item["outputStartSec"]
        end = start + item["crossfadeSec"]
        seams.append({"index": index, "startSec": start, "endSec": end, "measurements": []})
        segments.append({"name": f"loop-{index}", "start": max(0, start - 3), "duration": item["crossfadeSec"] + 6})
        with sf.SoundFile(OUT / "score-ducked.wav") as handle:
            a, b = max(0, round((start - 2) * SR)), min(count, round((end + 2) * SR))
            handle.seek(a)
            samples = handle.read(b - a, dtype="float32")
            derivative = np.max(np.abs(np.diff(samples, axis=0)), axis=1)
            threshold = float(np.quantile(derivative, .999))
            for time in (start, end):
                position = round(time * SR) - a
                step = float(np.max(np.abs(samples[position] - samples[position - 1])))
                seams[-1]["measurements"].append({"timeSec": time, "sampleStep": step,
                                                   "localDerivativeP999": threshold})
                check(f"loop-{index}-seam-{time:.6f}", step <= max(threshold * 2, .003),
                      seams[-1]["measurements"][-1])
    preview_dir = OUT / "intro-previews"
    preview_dir.mkdir(exist_ok=True)
    for segment in segments:
        result = ffmpeg("-ss", segment["start"], "-t", segment["duration"], "-i", PUBLIC / "master.wav",
                        "-af", "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-")
        segment["loudness"] = json.loads(re.findall(r"\{[^{}]+\}", result.stderr, re.S)[-1])
    for name, start, duration in (("intro-to-first-voice", 0, 27),
                                 *((f"loop-{x['index']}", x["startSec"] - 3,
                                    min(10., report["durationSec"] - (x["startSec"] - 3))) for x in seams)):
        ffmpeg("-y", "-loglevel", "error", "-ss", start, "-t", duration, "-i", PUBLIC / "master.wav",
               "-c:a", "libmp3lame", "-b:a", "192k", preview_dir / (name + ".mp3"))
    aac = OUT / "master-aac-precheck.m4a"
    ffmpeg("-y", "-loglevel", "error", "-i", PUBLIC / "master.wav", "-c:a", "aac", "-b:a", "256k", aac)
    aac_result = measure(aac)
    check("aac-precheck-loudness", abs(float(aac_result["input_i"]) + 16) <= .5, aac_result)
    check("aac-precheck-true-peak", float(aac_result["input_tp"]) <= -1., aac_result["input_tp"])
    full_scan = ffmpeg("-i", PUBLIC / "master.wav", "-af", "silencedetect=n=-50dB:d=1.2", "-f", "null", "-")
    (OUT / "master-silence-scan.log").write_text(full_scan.stderr, encoding="utf8")
    silence_starts = [float(v) for v in re.findall(r"silence_start: ([\d.]+)", full_scan.stderr)]
    check("no-unexpected-full-mix-silence", all(t >= report["durationSec"] - 1.3 for t in silence_starts), silence_starts)
    with sf.SoundFile(PUBLIC / "master.wav") as handle:
        handle.seek(max(0, count - int(.02 * SR)))
        final_samples = handle.read(dtype="float32")
    check("ending-fades-to-zero", float(np.max(np.abs(final_samples[-24:]))) < 1e-4,
          {"lastSamplePeak": float(np.max(np.abs(final_samples[-1])))})
    detail = {"checks": checks, "allPassed": all(c["passed"] for c in checks),
              "duckEnvelopeSamples": duck_samples, "musicLoopSeams": seams, "segments": segments,
              "aacPrecheck": aac_result, "aacPrecheckSha256": sha(aac),
              "masterSha256": sha(PUBLIC / "master.wav"), "verificationScriptSha256": sha(__file__),
              "subjectiveListeningChecked": False,
              "limitations": ["Waveform and loudness checks do not certify musical phrasing or subjective quality.",
                              "AAC precheck is not the final muxed MP4; final encoded audio still needs checking."]}
    save(OUT / "intro-audio-qa.json", detail)
    report["introVerification"] = {"report": "work/audio/intro-audio-qa.json",
                                    "allPassed": detail["allPassed"], "checkCount": len(checks),
                                    "aacPrecheck": aac_result,
                                    "loopCount": len(seams), "subjectiveListeningChecked": False}
    save(OUT / "mix-report.json", report)
    print(json.dumps({"allPassed": detail["allPassed"], "checks": checks, "segments": segments}, ensure_ascii=False, indent=2))
    if not detail["allPassed"]:
        raise RuntimeError("V06 intro audio verification failed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--intro-seconds", type=float)
    parser.add_argument("--plan", action="store_true", help="Validate inputs and print timing; write no audio")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--verify", action="store_true", help="Audit existing outputs without remixing")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.verify:
        verify_existing()
        return
    if args.intro_seconds is None:
        parser.error("--intro-seconds is required")
    frames, old_narration, analysis, loop, provenance = validate(args.intro_seconds)
    intro_seconds = frames / FPS
    narration = shift_timing(old_narration, frames)
    captions = shift_timing(read(V05 / "src/captions-data.json"), frames)
    count = narration["durationFrames"] * SAMPLES_PER_FRAME
    plan = {"introFrames": frames, "introSeconds": intro_seconds,
            "sourceDurationFrames": old_narration["durationFrames"],
            "durationFrames": narration["durationFrames"], "durationSec": count / SR,
            "firstNarrationSec": narration["cues"][0]["startSec"],
            "musicSource": str(SOURCE), "musicTempoBPM": analysis["tempoBpm"],
            "loop": loop, "narration": "Frozen V05, exact sample delay only",
            "outputMaster": str(PUBLIC / "master.wav"), "targetLUFS": -16,
            "targetTruePeakDBTP": -1.5, "dryRun": args.plan}
    if args.plan:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    decoded = OUT / "music-source-decoded.wav"
    ffmpeg("-y", "-loglevel", "error", "-i", SOURCE, "-vn", "-ar", SR,
           "-ac", 2, "-c:a", "pcm_s24le", decoded)
    source, sr = sf.read(decoded, dtype="float32")
    score, mapping = extend_music(source, count, loop["sourceStartSec"],
                                  loop["sourceEndSec"], loop["outgoing8BeatsSec"])
    del source
    # Reuse the restrained V05 spectral treatment once, on the original song.
    mid = (score[:, 0] + score[:, 1]) * .5
    side = (score[:, 0] - score[:, 1]) * .5
    band = sosfilt(butter(2, [650, 3800], btype="bandpass", fs=SR, output="sos"), mid)
    mid += ((10 ** (-3.5 / 20) - 1) * band).astype(np.float32)
    score[:, 0], score[:, 1] = mid + side, mid - side
    del mid, side, band
    times = np.arange(math.ceil(count / SR * 100) + 1) / 100
    level = np.zeros(len(times), dtype=np.float32)
    for group in narration["groups"]:
        level[(times >= group["startSec"]) & (times < group["endSec"])] = STRENGTHS.get(group["id"], 0)
    level = gaussian_filter1d(level, 70)
    block = SR * 10
    for start in range(0, count, block):
        stop = min(count, start + block)
        envelope = 10 ** (np.interp(np.arange(start, stop) / SR, times, level) / 20)
        score[start:stop] *= envelope[:, None].astype(np.float32)
    fadein, fadeout = round(.18 * SR), min(count, 4 * SR)
    score[:fadein] *= np.linspace(0, 1, fadein, dtype=np.float32)[:, None]
    score[-fadeout:] *= (np.cos(np.linspace(0, np.pi / 2, fadeout)) ** 2).astype(np.float32)[:, None]
    arranged = OUT / "music-arranged.wav"
    sf.write(arranged, score, SR, subtype="PCM_24")
    del score
    filtered = OUT / "music-filtered.wav"
    ffmpeg("-y", "-loglevel", "error", "-i", arranged, "-af",
           "highpass=f=32,equalizer=f=2800:t=q:w=0.9:g=-2.5", "-ar", SR,
           "-ac", 2, "-c:a", "pcm_s24le", filtered)
    normalize(filtered, PUBLIC / "score.wav", integrated=-24, peak=-3)
    score, sr = sf.read(PUBLIC / "score.wav", dtype="float32")
    original_voice, vsr = sf.read(V05 / "public/audio/narration.wav", dtype="float32")
    voice = delayed_voice(original_voice, frames * SAMPLES_PER_FRAME)
    if len(voice) != count or len(score) != count or not (sr == vsr == SR):
        raise RuntimeError("Audio normalization altered the required timeline")
    sf.write(PUBLIC / "narration.wav", voice, SR, subtype="PCM_24")
    restored, _ = sf.read(PUBLIC / "narration.wav", dtype="float32")
    exact = bool(np.array_equal(restored[frames * SAMPLES_PER_FRAME:], original_voice))
    if not exact or np.any(restored[:frames * SAMPLES_PER_FRAME]):
        raise RuntimeError("Narration is not an exact delay of V05")
    del restored, original_voice
    voice_loudness = measure(V05 / "public/audio/narration.wav")
    voice_gain_db = -18 - float(voice_loudness["input_i"])
    voice *= 10 ** (voice_gain_db / 20)
    controls, gain_db, duck_info = music_control(narration, count, intro_seconds)
    for start in range(0, count, block):
        stop = min(count, start + block)
        gain = 10 ** (np.interp(np.arange(start, stop) / SR, controls, gain_db) / 20)
        score[start:stop] *= gain[:, None].astype(np.float32)
    sf.write(OUT / "score-ducked.wav", score, SR, subtype="PCM_24")
    balances = []
    def rms_db(values):
        return float(20 * np.log10(max(1e-9, np.sqrt(np.mean(values.astype(np.float64) ** 2)))))
    for cue in narration["cues"]:
        start, end = cue["startSample"], cue["endSample"]
        v, m = rms_db(voice[start:end]), rms_db(score[start:end])
        balances.append({"id": cue["id"], "voiceRmsDbFS": round(v, 2),
                         "musicRmsDbFS": round(m, 2), "voiceAboveMusicDb": round(v - m, 2)})
    score += voice[:, None]
    premaster = OUT / "mix-premaster.wav"
    # Float premaster retains transient headroom before loudnorm/true-peak control.
    # Writing PCM here would clip any boosted voice peaks before normalization.
    sf.write(premaster, score, SR, subtype="FLOAT")
    del score, voice
    _, log = normalize(premaster, PUBLIC / "master.wav")
    (OUT / "master-normalization.log").write_text(log, encoding="utf8")
    master_info = sf.info(PUBLIC / "master.wav")
    loudness = measure(PUBLIC / "master.wav")
    if master_info.frames != count or abs(float(loudness["input_i"]) + 16) > .5 or float(loudness["input_tp"]) > -1.4:
        raise RuntimeError(f"Master duration/loudness verification failed: {loudness}")
    save(OUT / "narration.json", narration)
    save(OUT / "captions-data.json", captions)
    save(OUT / "timeline-shift.json", {**plan, "dryRun": False,
         "cueCount": len(narration["cues"]), "captionCount": len(captions["cues"]),
         "sampleOffset": frames * SAMPLES_PER_FRAME, "originalNarrationSamplesPreserved": exact,
         "note": "These are shifted timing copies; src scene/caption integration is separate."})
    save(OUT / "music-edit-map.json", {"source": str(SOURCE),
         "sourceSha256": provenance["sourceSha256"], "tempoBpmMeasured": analysis["tempoBpm"],
         "loopSelection": loop, "timeStretch": False, "pitchShift": False,
         "mapping": mapping, "sourceBeatTimes": analysis["beatTimes"],
         "crossfade": "8 measured beats, complementary cosine gains", **duck_info})
    save(OUT / "music-provenance.json", {**provenance, "selectedBy": "User V05 music retained for V06 intro",
         "outputDurationSec": count / SR, "outputSha256": sha(PUBLIC / "score.wav"),
         "sourceTimelineMap": mapping, "details": "work/audio/music-edit-map.json"})
    report = {**plan, "dryRun": False, "sampleRate": SR, "channels": 2,
              "sourceNarrationSha256": sha(V05 / "public/audio/narration.wav"),
              "shiftedNarrationSha256": sha(PUBLIC / "narration.wav"),
              "sourceMusicSha256": provenance["sourceSha256"],
              "masterSha256": sha(PUBLIC / "master.wav"), "scriptSha256": sha(__file__),
              "originalNarrationSamplesPreserved": exact, "narrationGainDb": voice_gain_db,
              "timeStretch": False, "truncatedSpeech": False, "newTTSCalls": 0,
              "masterLoudness": loudness, "voiceMusicBalanceByCue": balances,
              "minimumVoiceAboveMusicRmsDb": min(v["voiceAboveMusicDb"] for v in balances),
              "subjectiveListeningChecked": False, "finalEncodedAACCheckPending": True,
              "introSourceClipAudioIncluded": False, **duck_info}
    save(OUT / "mix-report.json", report)
    print(json.dumps({k: report[k] for k in ("durationFrames", "durationSec", "firstNarrationSec",
          "masterSha256", "originalNarrationSamplesPreserved", "masterLoudness",
          "minimumVoiceAboveMusicRmsDb")}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf8", errors="replace")
    main()
