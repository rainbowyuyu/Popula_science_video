# V5 本地配音工作流

全部新输出只写入 `work/audio-v5/`。V4 的脚本、句源、母带和已交付视频保留。

`src/story-v5.json` 是唯一配音正文来源，包含有序 `groups` 和 `cues`；每句至少有 `id`、`shotId`、`text`、`spokenText`。`text` 为字幕，`spokenText` 为实际朗读输入。可为每句设置 `gapAfterSec`，范围严格为 0.2–0.5 秒；默认 0.32 秒。`targetDurationSec` 仅用于稿长诊断，不会触发补静音或语速变化。默认 `openingLeadSec=0.3`、`codaSeconds=10`。

执行顺序（使用 `D:/python_project/tts/.venv/Scripts/python.exe`）：

1. `scripts/voice_v5.py --plan`：校验正文、按上一版真实个人音色语速估算长度。此命令不导入模型、不占 GPU。
2. 确认最终正文与 GPU 空闲后，`scripts/voice_v5.py`：本地 Qwen3-TTS-0.6B 全句合成。改一句可用 `--ids n04`，必要时 `--seed-offset 101` 生成独立候选；旧源保存在 `prior/`。
3. `scripts/prepare_voice_v5.py`：核对源文案与 raw 台账一致，完整加 80 ms / 160 ms 护音，调用既有 `broadcast_voice.py` 温和处理、补偿滤镜延迟，再按实际音长排时间线。不会沿用旧章节窗填满空白。
4. `scripts/asr_captions_v5.py`：CPU 离线识别和词锚对齐，生成 SRT 并报告同音字、漏字风险及超过 1 秒的估计语音间隔。没有把 ASR 成功当作主观听审。
5. `scripts/mix_v5.py`：用同片《DNA档案微光》的 84 BPM 主题、和弦与 CC0 乐器采样，按新故事时长重新演奏编配，保持完整节拍与结尾终止式。转场声按新章界生成，不平铺任意 WAV 段落。最终做平滑人声闪避、WAV/AAC 响度和真峰值检查。
6. `scripts/qa_audio_v5.py`：逐样本核对完整 clean 句源已经进入旁白，核对帧／采样时长、字幕边界与实际语音能量覆盖、母带响度和 AAC 真峰值。高结尾能量、长静音和识别差异仅是需要核查的线索，不自动构成已断音的结论。

全批 TTS 尚在 GPU 运行时，可先执行 `prepare_voice_v5.py --ready-only`，再运行 `preflight_asr_v5.py`，用 CPU 提前读回复查已完成的句源。此模式不会写部分影片时间线，结果按 clean SHA 缓存，最终 `asr_captions_v5.py` 可直接复用。`readback-review.md` 保留每一句目标、识别结果、增删改差异、关键术语与数字的单独标记。正文未经人工实际试听时，所有报告中的 `subjectiveListeningChecked` 始终保持 `false`。

关键输出：`narration.json`、`captions.json`、`subtitles.srt`、`narration.wav`、`master.wav`、`music-story.wav`、`transitions-story.wav`、`voice-generation-v5.json`、`voice-timing.json`、`asr-captions.json`、`readback-review.md`、`music-arrangement.json`、`audio-mix-v5.json`、`qa-audio-v5.json`，以及完整 `raw/`、`protected/`、`clean/`、`processing/`。

`narration.json` 的 `workingAudioFile` 相对 DNA V3 根目录，`audioFile` 是之后接入网页的 `audio/v5/clean/*.wav` 路径。新声轨、字幕与时间线必须成套接入。根代理依据其实际 `durationFrames` 和章节窗口更新视频；没有达到“正好五分钟”不能成为裁剪字尾、加速或塞长停顿的理由。
