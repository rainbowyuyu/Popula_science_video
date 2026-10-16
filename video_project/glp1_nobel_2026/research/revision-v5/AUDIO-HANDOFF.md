# V5音频交付

状态：技术验证通过，独立目录已锁定，等待父流程安装。未宣称主观完整听审。

- 最终时间线：`audio/revision-v5/timeline.json`
- 最终母带：`audio/revision-v5/master.wav`
- 字幕：`audio/revision-v5/GLP1.srt`（同目录GLP1-subtitles.srt逐字一致）
- 解说稿：`audio/revision-v5/解说稿.md`
- 独立人声/音乐：`audio/revision-v5/narration.wav`、`audio/revision-v5/music.wav`
- 原创完整配乐：`audio/revision-v5/music/original-score.wav`
- AAC验证：`audio/revision-v5/master-aac-check.m4a`
- 完整原句A/B与前45秒试听：`audio/revision-v5/AB-raw.wav`、`AB-processed.wav`、`preview-with-music.wav`
- 验证/安装清单：`research/revision-v5/audio-validation.json`、`install-manifest.json`、`audio-lock.json`

30 FPS、48 kHz、25,628帧、41,004,800采样、854.2666667秒。89条完整个人音色旁白，总声音长度806.480958秒；419条字幕；额外观察停顿16秒、参考资料尾段12秒。保留全部冻结镜头字段，仅追加测量时间与明确的观察停顿元数据。

母带：−15.04 LUFS、−1.99 dBTP；AAC：−15.04 LUFS、−1.90 dBTP。原始录音与所有最终WAV均无削波。活跃人声比音乐平均高19.00 dB，知识讲解段高20.59 dB，行动段高16.38 dB。

配乐《餐后晴光》采用新F大调/D小调旋律，94 BPM、4/4拍、flow编配，使用既有VSCO2 CE CC0独立器乐采样；没有使用旧片旋律。乐谱事件、采样来源和许可见 `research/revision-v5/music/`。

冻结稿SHA256：`64873048c0037aeb9a59488a795e9d60545e0fefc8adc3da724bcc983981abe6`

时间线SHA256：`1c90aaef620540b39687543b065086c100f7d7df338bf92185d9f04a53f9e7c9`

母带SHA256：`9bc956e92e973d45da6931bdf19ee1b9b0810652d2d7ac05c0c0dff9dd712a71`

原曲SHA256：`1faa72acb04af018a0c3caa5488085217768ca4b358546b8ab421c46558d68e1`

验证时478/479个V4保护基线未变，唯一差异为父代理授权编辑的src/timeline.json。音频流水线没有安装或覆盖public/src。安装清单中交付字幕/稿件使用V5新文件名；父流程可按影片最终命名调整目标。
