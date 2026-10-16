"""Prepare a pronunciation-safe v6 narration manifest.

The displayed captions stay technical and unchanged.  Only the spoken layer is
made more conversational around terms that the local Qwen voice repeatedly
misread (桁架、筒、巨柱、筏板、调谐 and 荷载).  This file does not replace the
selected v5 takes; run voice.py with --story docs/story-v6.json and --candidate
v6-pronunciation to synthesize and review the replacement takes.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "story.json"
TARGET = ROOT / "docs" / "story-v6.json"
PLAN = ROOT / "audio" / "v6-voice-plan.json"

# Keep captions/text technical; these strings are for speech only.  The visual
# labels continue to carry the exact terms and pinyin notes.
SAFE_SPOKEN = {
    "s003": "玻璃外衣、里面的骨架，还有埋在地下的基础，力就是这样一层一层往下传。",
    "s006": "如果只把重量压在较浅的软土层上，地基会明显变形。所以，工程师把桩伸进更深的土层。",
    "s007": "桩和周围的土一起承受楼的重量，桩底也顶住一部分。整栋楼的力，就这样传进地下。",
    "s008": "桩的上面，是厚达六米的基础底板。你可以把它理解成一块厚底盘，把基础连成整体。",
    "s011": "从上面看，底部排着九个格子，像一个九宫格。里面的墙和外围的墙连在一起，让它更难被推弯。",
    "s012": "钢梁和混凝土一起工作：向下，接住楼层的重量；向侧面，抵抗气流的推力。",
    "s013": "想象一阵气流把楼顶推向一边，中间的结构也会向一边弯曲，离地越高，位移越明显。",
    "s014": "只靠中间这根硬骨头，离六百多米的目标还差一把力。帮手就在钢梁另一头，大楼的外圈。",
    "s015": "这些粗壮的柱子，叫巨型柱。它们和中间的骨架，一起承担整座建筑的重量。",
    "s016": "楼板接住人和设备的重量，钢梁把这些重量交给柱子和中间的骨架，一路传进基础。",
    "s017": "遇到侧面的气流，光有几根各自立着的柱子还不够，它们需要和中间的骨架拉起手来。",
    "s018": "把它们接起来的，是伸出去的钢架。这种连接负责把中间的骨架和外圈连起来。你看，六处关键高度上的小钢桥，从中间一直伸到外圈。",
    "s019": "中间的骨架想向一边转动时，连接钢架就带动外圈的柱子，让两侧的轴向力发生相反的变化。",
    "s020": "一侧压得多一点，另一侧少一点。两边配合起来，外圈柱就能帮着中间的骨架，把整栋楼稳住。",
    "s021": "再加上绕着外圈的环带钢架，零散的部件就连成了一个共同受力的巨大框架。",
    "s025": "靠里的玻璃围住使用空间，外层玻璃包住整座塔，两层玻璃之间空出了高大的中庭。",
    "s027": "再回头看外形：圆润的三角轮廓，一边向上收小，一边旋转，最终一共转过一百二十度。",
    "s029": "风吹过高楼，绕到背面，会形成不断变化的旋涡。它们带来的推拉，能让建筑来回晃动。",
    "s032": "在测试里，工程师反复比较不同的外形。外衣先减轻气流的影响，剩下的推力，还要交给里面的骨架。",
    "s033": "看两侧柱子的颜色：气流一推，一边压得更多，另一边压得更少。力顺着相连的部件，一路传回基础。",
    "s035": "这位帮手，叫调好频率的质量阻尼器。上海中心楼顶悬着一块约一千吨的重物，能相对大楼来回摆动。",
    "s036": "气流把大楼推得左右摇，重物就跟着相对摆动。把它的节奏调到合适，就能在运动中牵住大楼，减轻晃动。",
    "s038": "它主要照顾大风天气下的舒适度。真正支撑大楼的，还是下面这套一路相连的结构和基础。",
    "s040": "这栋楼又是怎么造起来的？施工时，楼中央的骨架先向上长，后面的工序接着跟上。",
    "s041": "工人站在会自己向上走的钢平台上，一段段把混凝土浇进去。完成这一段，平台再上移，接着造下一段。",
    "s042": "巨型柱通常落后中间的骨架六到九层，楼面再落后巨型柱四到七层。几个工作面，一前一后，把大楼越盖越高。",
    "s043": "主体长到大约三分之一高度，外层玻璃才开始跟进。一块块玻璃装上去，连接处还要给结构变形留出空间。",
    "s044": "连接钢架也要等合适时机再锁定。楼心骨架和巨型柱收缩的节奏不同，连接太早，就会给骨架增加额外的力。",
    "s045": "当玻璃重新合拢，那些粗壮的柱子、巨大的钢架，连同六米厚的底盘，又都藏了起来。",
    "s048": "每天五分钟，认识生活里的新知识。地下基础把重量交给土，楼板和柱子支撑楼层；楼顶的重物，让摇晃慢下来。",
}


def main() -> None:
    story = json.loads(SOURCE.read_text(encoding="utf-8-sig"))
    out = copy.deepcopy(story)
    changed = []
    for shot in out["shots"]:
        sid = shot["id"]
        if sid in SAFE_SPOKEN:
            previous = shot.get("ttsText", shot["text"])
            shot["ttsText"] = SAFE_SPOKEN[sid]
            changed.append({"id": sid, "before": previous, "spoken": SAFE_SPOKEN[sid]})
    out["voiceRevision"] = "v6-pronunciation-safe"
    out["voiceNotes"] = [
        "Displayed captions retain the exact engineering terminology.",
        "The spoken layer expands or paraphrases rare terms to avoid local Qwen homophone errors.",
        "Technical labels remain visible on the model: 核心筒、伸臂桁架、环带桁架、调谐质量阻尼器。",
        "Review each candidate with ASR and human listening before promoting it to canonical takes.",
    ]
    TARGET.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    PLAN.write_text(json.dumps({"revision": out["voiceRevision"], "count": len(changed), "rows": changed}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"WROTE {TARGET} ({len(changed)} spoken rows)")


if __name__ == "__main__":
    main()
