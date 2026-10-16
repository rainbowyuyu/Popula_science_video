# 密码学 · rainbow鱼本地配音与指定配乐

最终声音母版：`public/audio/master.wav`。影片时长 **310.133333 秒 / 9304 帧（30 fps）**，48 kHz、立体声、24-bit PCM。36 句原声合计 282.24025 秒，每句完整保留，没有变速、变调或裁掉字头字尾。

## 旁白与来源

- 使用用户既有 `D:/python_project/tts/models/Qwen3-TTS-0.6B` 和原个人参考音频。参考仍留在 TTS 工程，未复制进本片。
- 完整原声、实际参数、模型权重 SHA-256、参考音频 SHA-256、种子和源稿哈希记录在 `work/audio/voice-generation.json`。
- 每句先增加 80 ms 头部保护与 160 ms 尾部保护，再调用现有 `broadcast_voice.py` 温和处理；测量滤镜延迟后补偿，保留受保护句源的全部样本。
- 原声在 `work/audio/raw`，处理后句源在 `work/audio/clean`，逐句处理报告在 `work/audio/processing`。旧候选保留在 `work/audio/prior`。
- 从 40 句收紧至 36 句，删去重复总结与随机数、元数据、临时密钥支线；40 句原稿备份在 `work/audio/story-original-40.json`。
- c12 采用修订后的“把六个五相乘”，离线 ASR 完整读回。c23/c28/c29/c32 用“密月/公月/私月”稳定“钥”的 yuè 口播，字幕保持密钥、公钥、私钥。详情见 `work/audio/pronunciation-inputs.json`。
- c07 第二候选自动识别更差，保留第一候选；原声和自动比较依据均保留，未用评分冒充实际听审。

## 指定背景音乐

用户指定 `D:/CloudMusic/华尔街Thirteend - Claude小曲2.0(Remix版).mp3`，原录音时长 123.677 秒。使用该首音乐的原始旋律、节奏和立体声，没有额外变调或变速。

节拍检测约 120 BPM，实际采用逐拍检测的时间表。首遍保留至 117.841 秒的完整乐句，再接回原曲 21.316 秒；两处衔接发生在片中 **117.841 秒与 214.367 秒**，各提前 2.020 秒，以互补余弦增益交叠。接点避开末尾拍点不稳定的尾奏。最后 5.5 秒柔和收束。

先把原曲降至约 −25 LUFS，在 1.7–4.2 kHz 给旁白留出空间；旁白开始前提前避让，讲话时柔和降低约 4.4 dB，句后缓慢回升。解释密集部分额外略降，保留音乐存在感。

`work/audio/music-arrangement.json` 包含所有节拍、原曲与片内位置映射、接点、源哈希。文件为用户提供的录音；没有捏造公开许可。

## 技术核查

- 母带实测 **−16.04 LUFS / −1.50 dBTP**；AAC 预览实测 **−16.04 LUFS / −1.35 dBTP**。
- 14,886,400 个音频样本与 9304 帧完全对应；每个 clean 源已逐样本验证完整进入独立旁白轨。
- 36 句用本地 Whisper-small CPU int8 辅助读回，无提示词、无 VAD 裁剪。对照在 `work/audio/readback-review.md`；专名及同音字存在自动识别差异，不能据此认定声调或听感完全正确。
- 90 条字幕、单条最多 22 字，内部用词级锚点，首尾覆盖整句保护区间，分句之间无短闪烁间隙。每句实测语音活跃区间覆盖率 100%。
- 没有检测到最终混音超过 1 秒的长静音；原声末尾 20 ms 能量未触发疑似硬截断复查阈值。
- 所有报告保持 `subjectiveListeningChecked: false`。这些是技术核查与自动读回，没有冒充真人逐句听审或“广播级认证”。

用户备查试听：`work/audio/preview-opening.mp3`（开场 30 秒），`preview-loop-1.mp3` 与 `preview-loop-2.mp3`（两个音乐衔接口）。完整字幕为 `work/audio/subtitles.srt`。

## 复现

在影片目录使用 `D:/python_project/tts/.venv/Scripts/python.exe`，依次运行：

```text
scripts/voice_generate.py
scripts/audio_prepare.py
scripts/asr_verify.py
scripts/audio_qa.py
scripts/mix_master.py
```

`voice_generate.py --plan` 只验证源计划；当前源文本、参数和文件 SHA 匹配时会复用已生成句源。环境版本保存在 `work/audio/environment.json`。先改稿或候选参数时应重新生成对应整句，再根据实际时长重排，不应拿旧时长硬截音频。
