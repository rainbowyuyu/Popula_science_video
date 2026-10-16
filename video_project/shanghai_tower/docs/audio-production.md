# 上海中心 · V8 声音制作

当前声音源、字幕、音乐和母带已完成技术检查。`v8-final4` 实际成片 AAC 已解码并通过核验，报告为 `research/qa/v8-final/audio/audio-wave-match.json`，结果与证据边界见 [最终音频附录](audio-final4-verification.md)。旧 Final3 的检验仅属历史记录。

实际时长 **523.733333 秒**，15712 帧 / 30 fps，48 段旁白，251 条短字幕；片尾参考页保留 9 秒。前四段为 987 个语义分组的总览、构件功能和回装开场。987 指模型语义分组，不能当作施工零件总数。后续 s005–s048 的 44 条 WAV、选用元数据和 ASR 文件，共 132 文件与基线逐字节一致；字幕与镜头槽位整体后移 803 帧（26.767 秒）。

## 实测开场时序

- s001：帧 12–488（0.400–16.267 秒），实声 15.680 秒。
- s002：帧 488–904（16.267–30.133 秒），实声 13.680 秒。
- s003：帧 904–1435（30.133–47.833 秒），实声 17.520 秒。
- s004：帧 1435–1786（47.833–59.533 秒），实声 11.520 秒。
- s005：帧 1786–2017（59.533–67.233 秒），实声 7.520 秒。

具体词时见 `research/v8-narration-cues.json`。`research/v7-narration-cues.json` 是兼容现有编排程序的同内容副本，版本字段明确写 V8。各镜头按完整实声安排，不裁短尾音、不拉伸旁白。

## 讲稿与个人声音

沿用本地 rainbow鱼 参考声音和 Qwen3-TTS-0.6B，仅重新合成开场四段。候选原声、参数、种子、处理后波形和识别差异保留在 `audio/candidates`、`audio/raw`。第一句是“上海中心，六百三十二米”。初轮术语识别存在不稳定处，单独生成对照候选，再按完整性和识别证据选用；记录见 `research/v8-voice-promotion.json`。字幕坚持正确原文，不抄识别出的同音字。

每段只经过一次温和处理，加入 80 ms 前导和 160 ms 尾部保护。48 段波形有限值、哈希、无截幅及处理长度检查通过，原始端点警报与处理后边界警报均为零。ASR 完成 48 段，自动标记零条。保留 `subjectiveListeningChecked=false` 和 `pronunciationListeningVerified=false`：波形、内容识别和字时检查不冒充人工听审或声调认证。

## 配乐与母带

采用用户选定的 **聲無哀樂SWAL — 飞升**，来源 `D:/CloudMusic/聲無哀樂SWAL - 飞升.mp3`。保留原曲推进与收束，以同曲和声、鼓点和电平匹配的乐句延展，少量全曲节奏适配且音高保持零半音变化。句级 ducking 与平滑章节音色电平服务解说，避免逐字抽吸。此录音不标为 CC0 或原创。

母带 **-15.02 LUFS / -1.80 dBTP**；AAC 试编码 **-15.03 LUFS / -1.65 dBTP**；活动语音高于音乐 **18.50 dB**。48 kHz，每轨 25139200 个采样点。`public/narration.wav`、`public/music.wav`、`public/master.wav` 与字幕、节拍文件的当前哈希锁定在 `research/v8-final-audio-lock.json`。

音乐节拍建议来自重编排音频的实际 onset 检查；不是已经听审认证的音乐小节强拍。详情在 `audio/feisheng/current-arrangement.json` 和 `research/feisheng-pulse-verification.json`。开场等响度原声/处理后对照保存在 `audio/AB-raw.wav`、`audio/AB-processed.wav`；含配乐的前 35 秒在 `audio/preview-with-music.wav`。

## 物理与验证边界

后续讲解完全保留：单桩是独立教学算例，结构侧载与 CFD 场独立；当前等效 FE 的伸臂上下弦风致轴力增量为零，定量色彩图显示实际非零的斜腹杆与巨柱响应。风场用于理想化定性平均流展示，不声称网格无关的工程预测、实楼瞬态尾涡或流固耦合。

复现入口：`audio/promote_v8_opening.py` → `scripts/mix.py prepare` → `scripts/qc.py --captions-only` → `audio/v8_narration_cues.py` → `audio/mark_v8_timeline.py` → `scripts/arrange_feisheng.py --apply` → `audio/feisheng/verify_arranged_pulse.py` → 全声源 QA。不能用 `scripts/mix.py mix/all` 覆盖选定配乐。

`scripts/qa_final_audio.py` 已对 `v8-final4` 实际 AAC 完成时长、母带相关性、片尾音乐与响度核验。源锁定快照中的 `finalVideoAACChecked=false` 保留为历史状态；最新结果以最终音频附录和绑定视频 SHA256 的实际 AAC 报告为准。
