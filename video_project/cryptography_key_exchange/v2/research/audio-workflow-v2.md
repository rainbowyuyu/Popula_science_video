# 密码学 V2 声音制作与核查

新稿已全量重新生成，32句原声合计 **279.520167秒**，最终影片声音时间线 **304.3秒 / 9129帧（30fps）**，旁白最后一句结束296.7秒。每句全长保留，没有变速、硬切或复用V1旁白。

最终母带48 kHz、立体声、14,606,400样本，实测 **−16.02 LUFS / −1.48 dBTP**；AAC预览实测 **−16.03 LUFS / −1.44 dBTP**。没有检测到超过1秒的长静音。新版配乐按新旁白重做避让、密集解释段音量和收尾，两个完整乐句循环口保持约2.020秒柔和交叠。

95条短字幕已做本地Whisper词级辅助对齐，最长22字；每句实测语音活跃窗口覆盖率100%，完整句源窗口也保持连续展示。原声首尾20ms没有触发疑似截断阈值，全部clean源逐样本核对已进入独立旁白轨。

关键数字段 s08/s09/s10 的5、23、6、15、8、19、2等由ASR完整读回，s11次方乘数九十亦有记录。专名、儿化和同音词仍有自动识别差异，详见 `work/audio/readback-review.md`。这些技术证据不替代真实听审。

制作中一次模型加载因其他任务内存占用遇到Windows页文件不足，等待其自然结束后恢复；未终止外部任务或改变全局设置。另一次s26源写入失败在提交台账前捕获，改为临时WAV写入、样本数验证后原子替换，s26完整重新生成。事件在 `work/audio/recovery-write.json` 留档。

V2 重新生成所有旁白，不使用 V1 句源。参考音色继续读取用户既有本地 TTS 工程，原参考文件不复制。只有原曲节拍与乐句分析复用 V1 数据；实际配乐长度、避让、尾奏都按新版口播调整。

## 输入与输出

- `src/story.json`：由研究/主代理冻结，只读。每句包含 `id`（s01 等）、`scene`、`text`、`spokenText`、`pauseAfterSec`。
- `work/audio/speech-overrides.json`：必要时保存逐句同音读音修正，显示稿不变，不修改故事源文件。
- `src/narration.json`：实际句长、开始/结束帧、场景组、完整片长，30 fps。
- `src/captions.json`：最多22字的短字幕，词级对齐、首尾覆盖完整句源窗口。
- `public/audio/master.wav`：48 kHz、立体声、24-bit PCM 最终母带。
- `work/audio/narration.wav`：独立旁白轨；原声、clean、处理和生成报告均保留。
- `work/audio/subtitles.srt`：最终字幕。

## 本地执行

使用 `D:/python_project/tts/.venv/Scripts/python.exe`。

```text
scripts/voice_plan.py
scripts/voice_generate.py --plan
scripts/voice_generate.py
scripts/audio_prepare.py
scripts/asr_verify.py
scripts/audio_qa.py
scripts/mix_master.py
```

只有主代理确认开录后执行实际合成。`voice_plan.py` 与 `--plan` 不启动语音生成。CUDA合成与CPU Whisper检查可以并行，不争用GPU。

## 质量边界

逐句原速生成，80ms头部保护与160ms尾部保护，温和清理后测量并补偿滤镜延迟。没有变速凑时长、硬门限切字或强降噪。语速参考 V1 实测，稿件超时先报告给主代理调整内容，不擅自删改。

背景音乐保持用户指定的 Claude 小曲2.0（Remix版）。先核对原曲SHA，完整保留开场，之后按原曲 21.316—117.841秒乐句重复，衔接约2.020秒，片末柔和收束。母带目标约−16 LUFS，AAC真峰值不高于−1 dBTP，实际测量后报告。

ASR仅用于找漏句、数字与词组差异。没有真实听审时，所有 `subjectiveListeningChecked` 保持 false。最终成片可用 `scripts/qa_av_sync.py --video <绝对路径>` 分窗口核验AAC与母带的漂移。
