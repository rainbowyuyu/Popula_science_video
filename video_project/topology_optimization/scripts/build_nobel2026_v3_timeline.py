from __future__ import annotations

"""Build the V3 Nobel timeline from real narration durations.

The narration dictionary is the only source for displayed subtitles. Timing
is deliberately left pending here; the word-alignment pass measures it from
the current raw voice clips. Reusing V2 caption text or proportional timing
would silently put old wording on screen.
"""

import json
import math
from pathlib import Path

import soundfile as sf
from align_nobel2026_v3 import sentence_parts

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/nobel2026"
# V3 must be built from the regenerated, unpadded clips.  Pointing at the V2
# directory silently reintroduced the old fixed-window timing and made the
# captions drift back toward the padded silence problem.
RAW = ROOT / "public/nobel2026/voice-v3-raw"
OUT = SRC / "timeline-v3.json"
BREATH = 0.22
CODA_SECONDS = 12.0

# Spoken language is kept natural and short enough for the rainbow鱼 voice.
# English names are shown as typographic lower thirds in the film; the Mandarin
# narration keeps the names pronounceable and consistent with the research text.
NARRATION = {
    "000": "我们的大脑每天都在发号施令。抬手、转头、眨眼，看起来只是一个动作。可在实验室里，真正难的是：这一次动作，到底是哪一群细胞发起的？如果只叫醒一小群细胞，问题才有机会问清楚。",
    # English laureate names stay on the lower third.  The spoken lines use
    # short, unambiguous Chinese phrasing so Qwen3-TTS does not turn names or
    # polyphonic technical words into distracting syllable errors.
    "001": "今年的诺贝尔生理学或医学奖，颁给三位科学家。他们的答案，都从一束光开始。",
    "002": "以前，只看到一片脑区亮起，只能说明它和行为同时发生。要证明因果，得只按下一类细胞的开关，再看行为会不会跟着改变。",
    "003": "这把开关没有先从人脑里找到。线索藏在一种会跟着光走的小绿藻身上。",
    "004": "把小绿藻放进透明容器，从左边照光，它就朝着光源游动。细胞上有一颗橙色感光点，收到光后，尾部两根细长鞭毛立刻改变节奏。",
    "005": "研究者用电极记录感光点附近的光电流。光到达后，大约半毫秒，电信号就出现了。人的眼睛走完类似过程，至少要十毫秒。为什么这种藻类这么快？",
    "006": "他提出一个大胆猜想：会不会有一种蛋白，既能感受光线，又能直接充当离子通道？难处在于，这种蛋白离开原来的细胞后，很容易失去活性。",
    "007": "转机来自基因测序。找到的基因被分别送进蛙卵，让蛙卵在细胞膜上做出这种蛋白。",
    "008": "蓝光一照，通道不到一毫秒就打开。带电粒子穿过细胞膜，细胞电压立刻变化。二零零三年，他们公布了这个结果。",
    "009": "他们还把这段基因放进两种培养细胞。原本不响应光的细胞，装上通道后，蓝光就能让它们发出电信号。",
    "010": "到这里，链条接上了：光照到蛋白，蛋白打开通道，离子流过，细胞发出电信号。下一个问题是，神经元能不能也这样控制？",
    "011": "一个研究团队一直在找这把开关。他们把感光基因送进透明培养容器里的鼠类神经细胞。",
    "012": "神经细胞一开始很安静。蓝光一闪，电信号就沿着神经往前走。光脉冲和电信号几乎同时出现。二零零五年，结果发表。",
    "013": "关键不只是让细胞亮起来，而是能按时间控制。光脉冲在千分之一秒内出现，电信号也几乎同时响应。研究者终于有了可重复、可定位的控制。",
    "014": "遗传学负责挑出哪一类细胞，光负责决定什么时候按下开关。二零零六年，这套方法有了名字：光遗传学。",
    "015": "一年后，一根细光纤穿过小鼠头骨，伸进运动皮层。研究者只给一类神经细胞装上通道，再用蓝光刺激它们，小鼠的胡须随之动起来。",
    "016": "同一年，研究者还把一类和清醒有关的细胞点亮，睡着的小鼠醒了过来。重点在于，光只碰到被标记的那一群细胞。",
    "017": "二零一二年，研究者先标记恐惧训练时活跃的细胞。几天后，只打开蓝光，小鼠就再次停住不动。这说明，这群细胞足以让那段记忆重新出现。",
    "018": "今天，这种方法已经被用来拆分疼痛、饥饿、奖赏、社交和注意力。混在一起的细胞，终于可以沿着一条条神经线路分开观察。",
    "019": "这项技术也在走向临床。失去感光细胞的患者，正在接受早期试验。研究者把光控通道送进视网膜，再用发光眼镜帮助辨认物体。目前仍然是探索中的治疗，需要基因递送和专用光源。",
    "020": "这一项诺贝尔奖打动人的地方，是把一个大问题拆成四个能验证的小问题：哪种细胞，哪种蛋白，哪一束光，产生了哪一个信号。",
    "021": "故事从这种藻类的感光点开始，经过一根光纤，最后让小鼠的胡须动了一下。这个故事，就是今年诺贝尔生理学或医学奖的核心。",
}


def main() -> None:
    old = json.loads((SRC / "timeline-v2.json").read_text(encoding="utf-8"))
    clips = []
    cursor = 0.0
    for source in old["clips"]:
        rid = source["id"]
        raw_seconds = sf.info(RAW / f"{rid}.wav").duration
        text = NARRATION[rid]
        parts = [{"text": part, "status": "pending"} for part in sentence_parts(text)]
        if "".join(part["text"] for part in parts) != text:
            raise ValueError(f"caption split changed narration text: {rid}")
        start_frame = round(cursor * 30)
        end_frame = round((cursor + raw_seconds + BREATH) * 30)
        clips.append({
            "id": rid,
            "scene": source["scene"],
            "start": start_frame,
            "end": end_frame,
            "subtitle": text,
            "spoken": text,
            "subtitleParts": parts,
            "asrSpeechEnd": None,
            "sourceDurationSeconds": round(raw_seconds, 3),
            "breathSeconds": BREATH,
        })
        cursor = end_frame / 30

    scenes = []
    for scene_name in [s["id"] for s in old["scenes"] if s["id"] != "references"]:
        rows = [c for c in clips if c["scene"] == scene_name]
        if not rows:
            continue
        scenes.append({"id": scene_name, "start": rows[0]["start"], "end": rows[-1]["end"], "title": scene_name})
    coda_start = round(cursor * 30)
    coda_end = coda_start + round(CODA_SECONDS * 30)
    scenes.append({"id": "references", "start": coda_start, "end": coda_end, "title": "证据与论文"})
    total = coda_end
    result = {
        "fps": 30,
        "duration": total,
        "seconds": round(total / 30, 3),
        "version": "v3-real-voice-timing",
        "voicePolicy": {"source": "public/nobel2026/voice-v3-raw", "maxBreathSeconds": BREATH, "noForcedTrim": True},
        "scenes": scenes,
        "clips": clips,
        "references": old["references"],
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({total} frames / {total / 30:.2f}s)")


if __name__ == "__main__":
    main()
