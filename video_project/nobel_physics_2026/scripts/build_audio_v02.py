"""Build the five-minute Nobel Physics 2026 narration draft.

This is deliberately separate from ``build_audio.py`` so the 5:58 V01
remains reproducible.  V02 keeps the same 17 visual scene ids, but shortens
the spoken clauses and reduces the pause between scenes.  The measured audio
durations are written back into ``docs/narration-v02.json`` and
``src/physics2026/timeline-v02.json``; the renderer should consume the latter
instead of guessing timings from character counts.
"""
from __future__ import annotations

import asyncio
import json
import re
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "audio" / "v02"
AUDIO.mkdir(parents=True, exist_ok=True)

# Keep the scene ids stable: the WebGL/Canvas visual layer can therefore be
# upgraded independently of the narration.  The copy is intentionally spoken
# like a host telling one continuous story, with facts and caveats kept close
# to the moment in which they matter.
CLIPS = [
    ("000", "hook", "想象一颗几乎不和物质碰撞的粒子，穿过地球，也穿过我们的身体。直到南极深冰里一束蓝光亮起，研究者才知道它来过。2026年诺贝尔物理学奖，表彰的就是把这道微弱回应变成证据的工作。"),
    ("001", "award", "今年的奖项授予 Francis Halzen，威斯康星大学麦迪逊分校物理学家。授奖理由是：他对 IceCube 中微子观测站作出决定性贡献，并推动发现天体物理起源的高能中微子。得主是一人，IceCube则是十四国合作团队。"),
    ("002", "question", "为什么要找中微子？质子带电，会被宇宙磁场拐弯；伽马射线也可能在尘埃和辐射场中被吸收。中微子不带电，几乎直线飞行，能把遥远源头的方向和能量带到地球。"),
    ("003", "messengers", "把三种宇宙信使放在一起看：质子像被风吹偏，伽马射线在尘埃中变弱，中微子则沿直线穿过宇宙。它最难捕获，却也保留了最干净的来路。"),
    ("004", "idea", "1988年，Halzen和 John G. Learned 提出：别造一座小探测器，把南极深冰本身变成望远镜。冰够大、够安静，也足够透明。这个思路后来经过 AMANDA 等试验，才走向 IceCube。"),
    ("005", "ice", "IceCube把八十六条探测器串放进冰层，每串六十个光学模块，深度约一千四百五十到两千四百五十米，覆盖近一立方公里。镜头顺着一条串下潜，传感器在黑暗中排成网。"),
    ("006", "interaction", "中微子本身不会发光，只有极少数会撞上冰中的原子核，产生带电粒子。粒子飞得足够快，就在冰里拉出 Cherenkov 蓝光。模块记录每一束光抵达的时间和亮度；我们看到的是间接回应，不是把中微子直接拍下来。"),
    ("007", "formula", "关键阈值写成公式就是：速度 v 大于光速 c 除以折射率 n。n 让光在冰里变慢；粒子超过这个相速度，光就从四面散开，收束成可追踪的圆锥。"),
    ("008", "track", "若碰撞产生能跑很远的 μ 子，模块会按顺序亮起，排成一条长径迹，这叫 track。时间顺序越清楚，反推出发方向就越准，像在冰里放下一支探针。"),
    ("009", "cascade", "若能量在碰撞点附近释放，许多粒子一起发光，模块看到的是一团扩散亮斑，这叫 cascade。它的方向较宽，却能更完整地收住能量。两种形状，是两种读数据的方法。"),
    ("010", "background", "难题很快出现：大气宇宙线像暴雨一样制造 μ 子和中微子。IceCube用地球挡住一部分背景，优先看从下方穿来的径迹，再用能量和时间筛选稀有信号。发现从来不是一颗亮点，而是整组事件胜过背景。"),
    ("011", "discovery", "2013年，1.04和1.14拍电子伏特的两个事件先亮了起来。随后三年数据的统计分析达到5.7个标准差，样本中积累出28个高能事件，纯大气背景的解释被排除。蓝光不再只是瞬间，而成了一条证据链。"),
    ("012", "sources", "当方向和能量都保留下来，中微子就成了新的宇宙信使。2017年，约290 TeV事件指向耀变体 TXS 0506+056，差约0.06度；2022年，NGC 1068方向出现1到10 TeV过量，显著性约4.2个标准差。它们是候选线索，不能夸成唯一答案。"),
    ("013", "team", "Halzen的贡献，是把早期设想变成长期运行的观测站。冰层、钻孔、模块、数据筛选，再加上十四国、五十八机构的合作，让一次极少见的相互作用有机会被可靠还原。"),
    ("014", "meaning", "意义不只是多找到几颗粒子。光、宇宙线、引力波和中微子各自带来一条线索；把它们放在一起，同一个天体终于有了多位叙述者。"),
    ("015", "limits", "看到中微子，不等于已经看清源头。样本仍少，背景仍复杂，track和cascade的方向精度也不同。科学最诚实的地方，是把看见的证据和暂时不能断言的部分同时留下。"),
    ("016", "coda", "回到开头，那束蓝光不是中微子本身，而是它在冰里留下的回应。Halzen和IceCube把南极冰变成一座向宇宙倾听的望远镜。下一次亮起的轨迹，可能就是亿万光年外的一次相遇。"),
]

VOICE = "zh-CN-YunxiNeural"
RATE = "-3%"
PAUSE = 0.55


def ffprobe_duration(path: Path) -> float:
    value = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        text=True,
    )
    return float(value.strip())


def caption_parts(text: str, duration: float) -> list[dict[str, object]]:
    """Split at spoken clauses, retaining complete phrases on screen.

    The old timeline split long English names in the middle of a token
    (``Halz`` / ``en``).  V02 first splits punctuation, then packs clauses up
    to 23 CJK characters; a fallback split is only used when a clause has no
    punctuation at all.  Durations are proportional to character count and
    measured again by the renderer's frame clock.
    """
    clauses = [x.strip() for x in re.split(r"(?<=[。！？；：])", text) if x.strip()]
    packed: list[str] = []
    for clause in clauses:
        if len(clause) <= 23:
            packed.append(clause)
            continue
        pieces = [x.strip() for x in re.split(r"(?<=[，、])", clause) if x.strip()]
        buf = ""
        for piece in pieces:
            if buf and len(buf) + len(piece) > 23:
                packed.append(buf)
                buf = piece
            else:
                buf += piece
        if buf:
            packed.append(buf)
    if not packed:
        packed = [text]
    # Do not leave a caption longer than 34 characters.  This extra room keeps
    # names such as ``TXS 0506+056`` and ``John G. Learned`` together instead
    # of producing an awkward token split in the middle of a scientific name.
    # Prefer a word or
    # punctuation boundary for Latin terms; this is a safety valve only.
    safe: list[str] = []
    for item in packed:
        while len(item) > 34:
            cut = 34
            for mark in ("，", "、", " "):
                pos = item.rfind(mark, 0, 34)
                if pos >= 12:
                    cut = pos + 1
                    break
            safe.append(item[:cut].strip())
            item = item[cut:].strip()
        if item:
            safe.append(item)
    total = max(1, sum(len(x) for x in safe))
    cursor = 0.0
    result: list[dict[str, object]] = []
    for index, item in enumerate(safe):
        end = duration if index == len(safe) - 1 else cursor + duration * len(item) / total
        result.append({"start": round(cursor, 3), "end": round(end, 3), "text": item, "source": f"v02-{index:02d}"})
        cursor = end
    return result


async def main() -> None:
    rows: list[dict[str, object]] = []
    for clip_id, scene, spoken in CLIPS:
        out = AUDIO / f"{clip_id}.mp3"
        # Edge's websocket occasionally leaves a zero-byte file after a
        # transient disconnect.  Keep successful clips and retry only the
        # failed one so a long build can be resumed safely.
        if not out.exists() or out.stat().st_size < 10000:
            if out.exists():
                out.unlink()
            last_error: Exception | None = None
            for attempt in range(3):
                try:
                    await asyncio.wait_for(
                        edge_tts.Communicate(spoken, VOICE, rate=RATE).save(str(out)),
                        timeout=55,
                    )
                    if out.exists() and out.stat().st_size >= 10000:
                        break
                except Exception as exc:  # pragma: no cover - network dependent
                    last_error = exc
                    if out.exists():
                        out.unlink()
                    await asyncio.sleep(2.0 + attempt * 2.0)
            if not out.exists() or out.stat().st_size < 10000:
                raise RuntimeError(f"edge-tts failed for clip {clip_id}: {last_error}")
        rows.append({
            "id": clip_id,
            "scene": scene,
            "spoken": spoken,
            "audio": str(out.relative_to(ROOT)).replace("\\", "/"),
            "audioSeconds": ffprobe_duration(out),
        })

    # Make a common PCM clock and insert short editorial breaths between clips.
    silence = AUDIO / "silence.wav"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
        "-i", "anullsrc=r=48000:cl=stereo", "-t", str(PAUSE), "-c:a", "pcm_s24le", str(silence)
    ], check=True)
    normalized: list[Path] = []
    for row in rows:
        source = ROOT / str(row["audio"])
        wav = AUDIO / f"{row['id']}-normalized.wav"
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(wav)
        ], check=True)
        normalized.append(wav)
    concat = AUDIO / "concat.txt"
    concat.write_text("\n".join(f"file '{p.as_posix()}'\nfile '{silence.as_posix()}'" for p in normalized), encoding="utf-8")
    narration = AUDIO / "narration.wav"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat), "-c:a", "pcm_s24le", "-ar", "48000", str(narration)
    ], check=True)

    # A clean, restrained bed for timing checks.  The final WebGL cut may
    # replace this with a licensed/generated variation without touching the
    # measured narration or timeline.
    seconds = sum(float(row["audioSeconds"]) + PAUSE for row in rows)
    music = AUDIO / "music.wav"
    pad = ("aevalsrc='0.019*sin(2*PI*110*t)+0.012*sin(2*PI*164.81*t+"
           "0.10*sin(2*PI*0.035*t))+0.008*sin(2*PI*220*t)':"
           f"s=48000:c=stereo:d={seconds}")
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", pad,
        "-af", f"lowpass=f=1700,tremolo=f=0.10:d=0.12,afade=t=in:st=0:d=4,afade=t=out:st={max(0, seconds-8)}:d=8",
        "-ar", "48000", "-ac", "2", str(music)
    ], check=True)
    premaster = AUDIO / "premaster.wav"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(narration), "-i", str(music),
        "-filter_complex", "[0:a]volume=0.88[v];[1:a]volume=0.42[m];[v][m]amix=inputs=2:duration=first:dropout_transition=2[a]",
        "-map", "[a]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(premaster)
    ], check=True)
    master = AUDIO / "master.wav"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(premaster),
        "-af", "loudnorm=I=-15:TP=-1.5:LRA=8", "-ar", "48000", "-c:a", "pcm_s24le", str(master)
    ], check=True)

    # Build measured timeline.  We retain clip IDs and scene names so FilmV02
    # can focus the camera on each visual state while the caption clock stays
    # tied to the actual synthesized audio.
    cursor = 0.0
    timeline: list[dict[str, object]] = []
    for row in rows:
        duration = float(row["audioSeconds"])
        timeline.append({
            **row,
            "start": round(cursor * 30),
            "end": round((cursor + duration + PAUSE) * 30),
            "subtitleParts": caption_parts(str(row["spoken"]), duration),
        })
        cursor += duration + PAUSE
    scenes: list[dict[str, object]] = []
    for row in timeline:
        if not scenes or scenes[-1]["id"] != row["scene"]:
            scenes.append({"id": row["scene"], "start": row["start"], "end": row["end"]})
        else:
            scenes[-1]["end"] = row["end"]
    data = {
        "version": "nobel-physics-2026-v02",
        "fps": 30,
        "duration": round(cursor * 30),
        "seconds": round(cursor, 3),
        "clips": timeline,
        "scenes": scenes,
        "editorial": {"target": "about five minutes", "pauseSeconds": PAUSE, "voice": VOICE, "rate": RATE},
    }
    (ROOT / "src/physics2026/timeline-v02.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "docs/narration-v02.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "docs/story-v02.md").write_text(
        "# 《冰下来的宇宙信使》V02\n\n"
        "本稿沿用 V01 的 17 个视觉场景，压缩句子和停顿，目标约五分钟。\n\n"
        + "\n\n".join(f"## {cid} · {scene}\n\n{spoken}" for cid, scene, spoken in CLIPS)
        + "\n\n数字、奖项归属和候选源边界沿用 `research/nobelphysics2026/source-audit.md`。\n",
        encoding="utf-8",
    )
    (ROOT / "delivery/physics2026_v02").mkdir(parents=True, exist_ok=True)
    (ROOT / "delivery/physics2026_v02/旁白.txt").write_text(
        "\n\n".join(f"{cid} {spoken}" for cid, _, spoken in CLIPS), encoding="utf-8"
    )
    print(json.dumps({"seconds": round(cursor, 3), "frames": round(cursor * 30), "clips": len(rows)}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
