# V3 声音与混音记录

正式文稿 `docs/story.json` 已锁定，SHA256 为 `b9998dd5631ef97ef1c63d4ae12c11f0102d8da80b07bf8fef85295e5d69d7ee`。本轮未拉伸、变速或剪切旁白；48 句均用本地 Qwen3-TTS-0.6B rainbow 参考音色按真实波形生成，并保留原始波形。

| 项目 | V3 结果 |
|---|---:|
| 时间线 | 10571 帧 / 352.3666667 秒 |
| 旁白 / 字幕 | 48 句 / 180 条 |
| 旁白总时长 | 334.2405 秒 |
| 母带响度 / 真峰值 | −15.01 LUFS / −1.49 dBTP |
| AAC 试编码 | −15.02 LUFS / −1.42 dBTP |
| 活跃旁白相对音乐 | 17.9753 dB |
| 参考文献尾声 | 9 秒精确旁白静音 |
| 主观完整听审 | 未完成，`subjectiveListeningChecked=false` |

g026 和 g039 使用了完整候选。g026 的首轮 ASR 对“少掉/抑制”有近音歧义，候选匹配率由 0.838 提升至 0.919；g039 的词表 ASR 完整识别“心血管死亡、非致死性心梗或卒中”，匹配率为 1.0。候选选择未删字、未裁切、未变速，原选片保存在 `audio/selected-prior/v3-before-pronunciation/`。

首轮 ASR 已检查全部 48 句，无 flags；波形检查零削波、零端点告警，全部输入输出音长一致。词表复查 29 句，覆盖 g012 的“零点一五毫米”、g013 的“十几微米/纳米级”、g014/g015 的离体胰腺与培养细胞实验、临床数字及 g039 心血管终点。自动识别仍不能替代人工听审。

字幕依据 ASR 词时间生成；180 条全部保留原文、无重叠或越界、每条不超过22个中文等效单位。生成器已加入 V3 g033 完整人群条件的语义分句规则；`caption-timing-review.json` 证明内存重生成一致。

配乐沿用本片《微光信使》原创主题，以 V3 实测长度重新编配；首次混音未使用 `--reuse-score`。源与母带哈希如下：

- timeline：`e837234a66e4aa654e202c4bd8790def4984f2894fc8725bb3d97e40cea94f97`
- narration.wav：`d427f74b8b492ebb28ef2d2cd826e191d37d810353d9ab67abe7602bbb836528`
- music.wav：`2f2f45f68d45410f058fa3a0b2a4e6586deeaba5ca1202810ca42f0e1d5bea56`
- master.wav：`c914dd00676e830be0b4166291a28b6995ba2a031dc6da7b97f42c9dee2bdf56`

验证命令已完成：`voice.py`、`qc.py`、`qc_glossary.py`、`mix.py prepare`、`qc.py --captions-only`、`mix.py mix`、`validate_audio.py`、`export_narration.py`。最终 MP4 的 AAC 与容器帧数仍由主渲染后的最终 QA 单独测量。
