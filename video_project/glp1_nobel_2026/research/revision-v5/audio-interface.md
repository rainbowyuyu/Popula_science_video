# V5 音频接口与准备状态

2026-10-09，V5整套音频已完成并通过 `audio-validation.json`：89句、419条字幕、25,628帧、854.2666667秒（14:14.267）。母带−15.04 LUFS、−1.99 dBTP，AAC试编码−1.90 dBTP，原始录音与最终stem均无削波。冻结 SHA256 为 `64873048c0037aeb9a59488a795e9d60545e0fefc8adc3da724bcc983981abe6`，正式text/ttsText未更改。主观完整听审仍为false，完成的是波形、ASR、字幕对齐和来源核验。

最终输出与安装哈希位于 `install-manifest.json` 和 `audio-lock.json`，全部音频仍在独立 `audio/revision-v5/`。父代理负责公共路径安装。验证时479项V4基线中478项未变，唯一 `src/timeline.json` 为父代理授权的V5预演修改；音频流水线未写public/src。音乐《餐后晴光》的最终原曲与母带SHA已登记个人music-history，记录副本位于 `music/final-history-entry.json`。

输入默认为 `docs/story-v5.json`，基本结构：

```json
{
  "title": "影片标题",
  "revision": "v5",
  "shots": [
    {
      "id": "h001",
      "section": "journey",
      "text": "正式解说文本。",
      "ttsText": "只在需要时提供的忠实发音文本。",
      "caption": "标准显示文本。",
      "musicCue": "warm",
      "pauseAfterSeconds": 0.2
    }
  ]
}
```

ID须在Windows大小写不敏感规则下唯一，允许字母、数字、下划线、连字符。`section`可使用任意非空分组标识；`view`、`mechanism`、`action`、`sourceIds`、`chapter`等视觉字段原样保留。生成器读取 `ttsText`，缺省回退 `text`；不把显示缩写自动改成拼读。每句30–50字适合自然讲述，较长句先从文案拆分。13–15分钟是预估，最终以完整音频长度、明确句间停顿和观察停顿排期，不拉伸、不赶语速。

`musicCue`可省略，缺省为 `mechanism`；可选 `warm/mechanism/action/evidence/reflect/resolve`，分别对应生活引入、机制推理、行动/比较、证据、反思和收束。后续音乐段由实测clip起止帧决定。`pauseAfterSeconds`缺省0.20，允许0–3秒；大于正常换气的停顿应有画面观察动作。

全部新的音频写入 `audio/revision-v5/{raw,takes,voice,music,asr,candidates}`，报告写入 `research/revision-v5/`。take元数据保留 raw/processed工程相对路径、原始/处理后时长、SHA、故事SHA、参考波形与参考转录SHA、模型完整内容与包版本身份、处理器SHA、采样参数、attempt、seed、batchIds和batchKey。

现有环境：`D:/python_project/tts/.venv/Scripts/python.exe`；Qwen3-TTS-0.6B、Whisper-small、rainbow参考和ffmpeg齐全；CUDA可用，GPU为RTX5060 Laptop 8GB。详细只读探测在 `tts-environment.json`，它不宣称实际生成测试或主观听审。未发现本片需要连接的常驻TTS服务，使用既有本地脚本直接调用模型。

可用命令（工作目录为本片工程）：

```powershell
$glp1V5Py = 'D:/python_project/tts/.venv/Scripts/python.exe'
& $glp1V5Py -X utf8 scripts/voice_v5.py --probe
& $glp1V5Py -X utf8 scripts/voice_v5.py --story docs/story-v5.json --dry-run
# 明确冻结可合成后，将FROZEN_SHA换成已核实哈希：
& $glp1V5Py -X utf8 scripts/voice_v5.py --expected-story-sha FROZEN_SHA --batch-size 3
# 完整候选另存，不替换已选声音：
& $glp1V5Py -X utf8 scripts/voice_v5.py --expected-story-sha FROZEN_SHA --only h001 --attempt 2 --candidate pronunciation --batch-size 1
# 第一遍不带医学提示词，watch随已完成声音推进；第二遍证据另存：
& $glp1V5Py -X utf8 scripts/qc_v5.py --expected-story-sha FROZEN_SHA --watch
& $glp1V5Py -X utf8 scripts/qc_v5.py --expected-story-sha FROZEN_SHA --domain --only h054
# 全部take选定后，先排期与字幕，再生成绑定最终时间线的音乐：
& $glp1V5Py -X utf8 scripts/mix_v5.py prepare --expected-story-sha FROZEN_SHA
& $glp1V5Py -X utf8 scripts/qc_v5.py --expected-story-sha FROZEN_SHA --captions-only
& $glp1V5Py -X utf8 scripts/score_v5.py --timeline audio/revision-v5/timeline.json --arrangement flow --name original-score
& $glp1V5Py -X utf8 scripts/mix_v5.py mix --expected-story-sha FROZEN_SHA
& $glp1V5Py -X utf8 scripts/validate_audio_v5.py --expected-story-sha FROZEN_SHA
```

中断后可直接续跑，缓存验证真实输出SHA。`--force`也不会覆盖旧raw，已选声音被替换前存入V5 selected-prior。按单条缓存跳过会改变pending批次，不能只凭同一文本signature宣称逐样本重现；记录的batchIds/batchKey才定义实际批次。完整批次候选重放可用 `--candidate replay --replay-take audio/revision-v5/takes/h001.json`，并传相同冻结稿SHA。GPU算子版本与硬件差异仍可能影响逐样本重现。

新的音乐生成器为 `scripts/score_v5.py`。两份96秒独立预览为 `audio/revision-v5/music/preview-flow.wav`、`preview-air.wav`；父代理已选择94 BPM的flow。正式时间线准备完后使用 `--timeline audio/revision-v5/timeline.json --arrangement flow --name original-score`，生成器按32秒块输出以支持长片，不会写旧 `research/music/composition.json`。字幕、拼接、最终混音沿用同一隔离目录；公共路径由root在明确音频锁定后统一集成。

`mix_v5.py prepare` 将所有shot字段逐项深拷贝至clip，并补充实测采样长度、帧起止和public-ready的 `audio: voice/hxxx.wav`；真实V5源另记于 `audioSource`。默认开头0.4秒，每take完整结束后0.20秒，参考资料按父代理最新要求留12秒。流式写入保留每一个源样本；不裁句、不改变语速。

最终镜头审查要求追加五处观察停顿：h007后3秒、h020后5秒、h025后3秒、h027后3秒、h037后2秒，合计16秒。该授权保存于 `rhythm-overrides.json`，原稿的pause字段不变，timeline以 `additionalPauseAfterSeconds` 和 `effectivePauseAfterSeconds` 显示额外量与总量。字幕、全长音乐和母带均已按追加后的时间线重建。

`qc_v5.py` 把首轮与领域复核分别存为内容寻址的不可变记录，当前索引更换前归档原索引。字幕按原始caption、标点和安全语义连接处分句，保护医学词和Latin term；支持 `captionParts` 显式边界（必须逐字拼接一致）。冻结稿纯文本分句测试为419片段，0超长警告。第一遍ASR不能证明主观听感，术语表提示同样只作辅助证据。

全稿89条ASR文字已独立检查。h007/h024/h037/h084选用完整attempt-2候选，原选声与所有raw保留；选声日志见 `candidate-selections/`。h007/h054/h064的低字符匹配告警保留，并在 `voice-review-decisions.json` 记录短术语表与完整波形证据；不把医学同音字自动判成口播错误。独立字幕检查 `caption-alignment-review.json` 确认三句都是等长替换、无插删导致的错位，419条原文完整，无零时长、重叠或跨句。

最终混音对整句保持稳定压低：知识/证据段目标人声高20dB，行动段17.5dB，生活段18dB；前瞻0.10秒，尾部保持0.30秒后1秒平滑恢复。实际分段能量比写入报告。母带目标-15 LUFS、-2 dBTP，并生成AAC再测真峰值。只有验证通过才写 `install-manifest.json` 与 `audio-lock.json`，公共安装由父代理完成。

冻结后的执行顺序：先3句小样检查字头字尾、术语与数字；再全稿TTS、首轮ASR和领域词表复查；需要时整句重合成，保留所有候选；按实际采样排期，生成短字幕并检查词边界；按最终音乐cue编配，保存独立人声/音乐stem、母带、AAC试编码和A/B预览。目标−16至−14LUFS、AAC真峰值≤−1dBTP，活跃人声高于音乐约14–20dB。声学与ASR检查不替代主观完整听审，未完成的标志保持false。
