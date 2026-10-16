# AI Engineer 发布片 v4 · 声音与叙事

固定 105 秒、48 kHz 双声道。叙事先给出“二十兆瓦海上风机”这一具体需求，再解释 AI Engineer 如何把目标、约束和工具接成闭环。几何、网格、BESO、Z-wind 是被调度的工程工具；AI Engineer 的贡献是任务编排、结果/日志读取、失败反馈与复查证据。片中时程是已保存响应回放，论文减钢量案例与视频新执行结果分开表述。

配音脚本使用 `D:/python_project/tts/.venv/Scripts/python.exe`，正式选用云端 `qwen3-tts-flash-realtime` 的公共成年男声 `Ethan`，全片 16 句来自同一模型和音色。先尝试本地原参考音色与云端克隆，但本地 GPU 正被其他用户任务占用，CPU 推理没有及时完成；克隆音色登记虽成功，其绑定的推理模型实际返回“Model not exist”，不能把登记成功写成合成成功。原本地 take、失败云端事件与登记记录保留，本片没有上传个人声音参考。公共男声不描述为 rainbow 鱼的声音克隆。

读取过 `RAINBOW_AUDIO_WORKFLOW.md` 与 `BROADCAST_NARRATION.md`，实际验证 `broadcast_voice.py` 的 source / destination / --report 参数。保存未修改的原始 24 kHz PCM16、48 kHz 轻处理独立句源、SHA-256、供应商事件和测量时长；不在后处理变速、不变调、不硬门控。源合成的 speechRate=1.04 与自然清晰的提示均记录在 take 中。先加 80 ms 前导与 160 ms 尾保护，再用 master_voice 处理，并测量/补偿滤镜延迟。

英文 AI Engineer 与 Z-wind 在新选音色中重录，保留原文英文连读。BESO 口播使用“贝索”。航海语境“系泊”应读 jì bó，重录时仅在 ttsText 用“寄泊”作为同音控制，字幕与发布文案仍用“系泊”；ASR 预期比较的是标准显示稿，不把同音控制字符当正式术语。数字与单位使用完整口语表达：“二十兆瓦”“单位功率用钢量”“百分之八点一”。本稿没有口播“图强号”，不声称核验了未出现的词。

Z-wind 的最终整句使用相同 Ethan 音色，先以 English 语言合成名称“Zee Wind”，再以 Chinese 语言合成中文主体，之间加入 40 ms 静音；两段没有变速或变调。分句 ASR 写作“Z wind”，整片混音 ASR 写作“SeeWind”，两份识别原文都保存。贝索的正式中文字幕使用中文译读，模型标签仍使用 BESO；分句 ASR 写作“贝佐”，不把这一个字的差异偷偷改成“贝索”。这些拼写差异不能等同于人工听审已经通过。

所有正式句同时保留本地 Whisper-small 原始转写和独立 Qwen3-ASR 无文本提示转写。没有对近音异字做人工标准化来凑匹配率。云端只接收本片合成句源，不上传个人声音参考。API 密钥只在运行时读取环境变量；产物仅记录凭据变量名称、模型、使用量、请求标识与音频哈希。

新配乐《开放回路 / Open Circuit》是本地原创 112 BPM、4/4 编曲，采用 CC0 VSCO 2 CE 钢琴、竖琴和弦乐采样，以及本地生成的轻电子脉冲。全部旋律、和声、事件重新创作，不复用旧 launch-105 配乐。大段场景只改变织体密度，保留同一个节拍与连续相位；不加转场撞击或机械 whoosh。

旁白、原始 score、闪避音乐、premaster 与 master 独立保存。人声前预留约 130 ms 闪避，句后平滑恢复；按实际人声活动区间测量人声/音乐 RMS 差。母带以约 −16 LUFS、−2.4 dBTP 为起点，再实际编码 320 kb/s AAC 并复测，要求最终真峰值严格低于 −1.8 dBTP。

机器识别、首尾保护、响度与峰值是自动核验。当前没有可调用的主观音频听审工具，因此 subjectiveListeningChecked 和 pronunciationListeningVerified 保持 false。不能据此声称“人工逐句听审”“广播级认证”或“听感一定悦耳”。

重建入口：

```powershell
& 'D:/python_project/tts/.venv/Scripts/python.exe' scripts/qc.py --story research/launch-v4-voice-plan.json
& 'D:/python_project/tts/.venv/Scripts/python.exe' scripts/asr_qwen_launch_v4.py
& 'D:/python_project/tts/.venv/Scripts/python.exe' scripts/score_launch_v4.py
& 'D:/python_project/tts/.venv/Scripts/python.exe' scripts/build_launch_v4_audio.py
& 'D:/python_project/tts/.venv/Scripts/python.exe' scripts/asr_qwen_launch_v4.py --master
& 'D:/python_project/tts/.venv/Scripts/python.exe' scripts/finalize_launch_v4_audio_records.py
```

Qwen ASR 为有外部调用费用的独立检查；已有成功记录并且 SHA 未变时会缓存复用。配乐与混音可在本地独立重建。

正式冻结结果：105.000 秒、48 kHz 双声道，42 条字幕，最短 860 ms。独立无文本提示 Qwen ASR 的 16 句最低匹配率 0.9565、平均 0.9947，完整母带匹配率 0.98947；其内容门槛为 0.95。Whisper-small 的低分与原始词时刻仍保留，其时间戳用于句级字幕对齐，不能把低分藏在独立 ASR 的结果中。BESO 与 Z-wind 的字幕区间已单独检查，无瞬闪、重叠或越界。

320 kb/s AAC 试编码为 −16.22 LUFS、−2.33 dBTP，实际活动区人声高于音乐约 14.0 dB。视频最终使用另一编码码率时，必须重新测量最终 MP4 的 AAC，不能直接沿用 WAV 或试编码数据。正式母带 SHA-256：`f0bbe00d25be63cff4ad09b4111246d9255f98c9e49ffee74f8b7e697312dc78`；详细冻结索引为 `research/qa/launch-v4-audio-frozen.json`。

正式句源将在文件清单中冻结，重建混音不需要再次合成。云端重录入口为 `scripts/voice_cloud_launch_v4.py --only <句子编号> --voice Ethan`。相同模型、文字、设置和 guard 的已有正式源缓存复用；改变源合成需要重新运行两套 ASR、字幕和母带，不沿用旧句时长。本地候选保留作回溯，没有删除或改写用户其他 TTS 进程。
