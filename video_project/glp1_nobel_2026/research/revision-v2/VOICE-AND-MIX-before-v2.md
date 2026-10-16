# 本片声音制作记录

本地音色：rainbow鱼现有参考录音，模型为 `D:/python_project/tts/models/Qwen3-TTS-0.6B`。参考素材没有复制到交付目录。运行环境为该 TTS 工程自带的 Python；48 句初次合成耗时 253.4 秒。

交付：`public/voice/g001.wav` 至 `g048.wav` 为选定处理后旁白；原始波形和多轮候选保存在 `audio/raw`、`audio/candidates`，选片元数据在 `audio/takes`。参考声纹、文本、种子、批次、参数和 SHA256 记入每条元数据。

保守处理调用现有 `broadcast_voice.py`：温和低切、固定轻降噪、轻微 EQ 与压缩；测量并补偿滤镜延迟。无音高变化、硬噪声门或语速拉伸。

时间线为 30 FPS，9222 帧，即 307.4 秒。首句前 12 帧；初版每句按真实波形时长向上取整，再加 5 帧。片尾保留 270 帧（9 秒）论文阅读时间，无旁白。两个发音替换保持所有镜头起止帧不变。

发音复核：g042 原文“长回”可能被读成 cháng，口播文本以“涨回”提示 zhǎng；显示字幕仍为原文，替换后 ASR 全句匹配。g011 另选可辨识“肠促”的完整候选。仅 g011 在已完整结束的生成静音尾部省去 0.28 秒，省去区间峰值低于 −50 dBFS、20 ms 最大 RMS 低于 −58 dBFS；原始与完整处理候选均保留。无变速、剪字或词内处理。

字幕：48 条语音对应 134 条自然小句，每条目标不超过 22 中文显示单位。根据每条真实开始帧和 CPU Whisper 词时间对齐；保留标准医学写法及 GLP-1、DPP-4、β。字幕与源文本、语音哈希绑定，SRT 位于 `delivery/GLP1-subtitles.srt`。

配乐：《微光信使》，76 BPM，3/4 拍，D 大调 / B 小调，完整新写旋律、和声与编配；使用 VSCO 2 CE CC0 单音采样，无此前音乐录音或旋律导入。许可原文、固定版本源 URL、逐文件哈希、全曲音符事件在 `research/music`。

混音：旁白段音乐约低 18 dB，按句提前下降并平滑恢复，避免每个字间抽吸；全片约 −15 LUFS，AAC 真峰值目标低于 −1 dBTP。实测值和最终文件哈希以 `audio-report.json`、`audio-validation.json` 为准。

检查边界：48 句进行了 ASR 内容筛查，并另对专有词和数字做词表辅助复查；六十八周、14.9% / 2.4%、四十个月、8% / 6.5%、0.8 和 1.5 个百分点均保留。g008、g011、g031 的字面相似度因肠壁/长臂、胰腺/一线、替尔泊肽/T2博太等同音写法偏低，原始识别与告警没有隐藏。尚未完成主观人工听审，所有相关标志保持 false；识别结果不等于音色质量认证。

试听：`audio/AB-raw.wav` 与 `audio/AB-processed.wav` 为同响度首句对比，`audio/preview-with-music.wav` 为 35 秒混音试听。独立分轨在 `public/narration.wav`、`public/music.wav`，成品音轨为 `public/master.wav`。

复现顺序：

```powershell
$py = 'D:/python_project/tts/.venv/Scripts/python.exe'
& $py scripts/voice.py --batch-size 4
# 已留存选定发音候选，可直接运行选择；重新生成需保留同一批次和seed参数。
& $py scripts/select_pronunciation.py
& $py scripts/mix.py prepare --keep-slots
& $py scripts/qc.py
& $py scripts/qc.py --captions-only
& $py scripts/mix.py mix --reuse-score
& $py scripts/validate_audio.py
```

首次从零生成可用 `mix.py all` 生成新音乐源；已有成片修订时使用 `--reuse-score` 保持本片新配乐。快照重建已有镜头时间应保留 `--keep-slots`。
