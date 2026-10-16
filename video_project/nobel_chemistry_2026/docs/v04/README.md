# V04 Rap 版

V04 采用节拍化中文口播，保留 V03 的科学事实、来源和动态可视化。旁白由同一份 rainbow鱼 参考音色整句生成，配乐是固定种子生成的原创 104 BPM 节拍。

- 讲稿：`narration-v04.json`、`story-v04-rap.md`
- 音频：`audio/v04/master.wav`、`audio/v04/narration-v04.srt`
- 时间线：`src/chemistry2026v04/timeline-v04.json`
- 视觉回归：`visual-regression-v04.json`
- 研究笔记：`research/rap/rap-style-note-v01.md`

Rap 版的押韵只服务记忆点，不能改写化学术语和数值；自动 ASR 的低匹配提示保留在 `audio/v04/final-audio-qa-v04.json`，需要人工复听时优先检查人名、百分比和化学式。
