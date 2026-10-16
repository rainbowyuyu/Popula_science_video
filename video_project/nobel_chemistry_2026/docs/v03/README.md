# V03 音频修复说明

本版针对 V02 的外语人名硬切、语气割裂和术语读音不自然做独立音频重制，V01/V02 文件保持只读。

## 处理方式

- `001/003/005/006/008/010/011/012/013` 改为使用同一参考音色整句重录；删除姓名级别的硬贴片和交叉淡化。
- 画面字幕继续保留官方拉丁姓名：Henri B. Kagan、Kenso Soai、Louis Pasteur、Charles Frank；整句配音使用自然中文近似读法，避免英文片段突然改变音色和底噪。
- 二异丙基锌、嘧啶、锌醇盐、对映体过量等术语随整句重新生成，保持前后呼吸和句尾。
- 重新运行 Whisper 词级对齐，生成 `narration-v03.srt` 与 `src/chemistry2026v03/timeline-v03.json`。
- 人声和 Dawn 配乐重新混合，目标约 −14.5 LUFS、真峰值不高于 −1.8 dBTP。

## 限制

机器 ASR 只用于漏词、时长和字幕边界检查，不能替代人工听辨姓名或专业术语。最终仍建议以正常速度复听 001、003、005、006、008、010、011、012、013。

## 文件

- `audio/v03/master.wav`
- `public/audio-v03/master.wav`
- `audio/v03/narration-v03.srt`
- `src/chemistry2026v03/timeline-v03.json`
- `audio/v03/final-audio-qa-v03.json`
