# 上海中心 · 声音制作

个人旁白：本地 rainbow鱼 参考声音，Qwen3-TTS-0.6B。参考录音留在私有 TTS 工程，不进入本片交付包。

每句保留原声、选用版本、文本签名、参数、实际时长。标准书写和口播读音分开保存；核心筒、桩、伸臂桁架、阻尼等词逐项检查。以实际声音长度排时间线，不压缩、不变调，不为凑整五分钟强行拉伸。

当前升级时间线 379.5667 秒（11387 帧，30 fps），包含9秒参考页停留。采用用户“非常完整的拆解搭建介绍”的范围，不为系列名称强制压缩至300秒。48句完整旁白，188条短字幕；本轮重合成13句，开场直接进入上海中心，去掉制作过程口吻，保留九格核心筒、六处伸臂、桩筏和风—阻尼的工程故事。标准文字里的“桁架”采用同音“横架”合成以稳定读音，显示字幕仍用“桁架”。音画交接以当前 `src/timeline.json` 为准。

后期只对原始声音进行一次温和处理：低切、轻去噪、共振整理、轻去齿音、软压缩。处理前保留尾部保护静音，补偿滤镜延迟。字幕使用实声起点与 CPU Whisper 词时辅助对齐，显示原文；识别结果不能替代听审。

目前工作预览暂保留《向云生长》：本片编写的 F 大调 / D 小调 4/4 原创器乐，88 BPM。钢琴、短拨弦、竖琴及克制的弦乐支持向上搭建的节奏；章节间保持同一音乐空间。旋律、节奏、和声编排不复用前片，种子 2026100817。旁白段音乐平滑压低，目标活跃人声比音乐高约18 dB。**这不是用户指定抖音链接的同款音乐。**

用户指定配乐来自 `https://v.douyin.com/hUudVGBOFKE/`，已解析到公开视频 ID `7693053715154013455`，但公开分享页没有返回曲名、作者、音乐 ID 或可读音频，公开详情接口返回 403。尚未获取、识别或替换该曲；没有绕过登录、验证或 DRM。证据位于 `audio/requested-bgm/availability.json`，当前 `research/audio-report.json` 保持 `musicReplacementPending: true`，等待用户提供可读的本地音乐或视频文件。

独立替换入口为 `scripts/replace_requested_music.py`，支持先验证后应用，不需要重渲三维画面。当前仅检查了帮助入口、语法和内存中的算法保护；没有把任何占位音源写入正式文件，也没有宣称完成指定曲的混音。

```powershell
# 帮助入口：无需音源，不写文件。
& 'D:/python_project/tts/.venv/Scripts/python.exe' scripts/replace_requested_music.py --help

# 用户文件到位后，先生成新的暂存结果。此路径仅为使用示例。
& 'D:/python_project/tts/.venv/Scripts/python.exe' scripts/replace_requested_music.py --source 'C:/Music/requested-track.mp3'

# 文件核实后可显式应用，并给已经渲好的成片换音频；视频流直接复制。
& 'D:/python_project/tts/.venv/Scripts/python.exe' scripts/replace_requested_music.py --source 'C:/Music/requested-track.mp3' --apply --mux-video 'delivery/ShanghaiTower_1080p_v2.mp4' --mux-output 'delivery/ShanghaiTower_v2_requested_music.mp4'
```

替换脚本规则：

- 默认输出到新的 `audio/requested-bgm/replacements/<时间>-<源SHA前缀>`，不改正式 master、配乐、旁白或时间线。只有显式 `--apply` 并通过验证后，才备份并替换 `public/music.wav`、`public/master.wav` 和音频报告。
- 按时间线章节进行连续取段、乐句入口和余弦交叉衔接；保留源文件 SHA、源时长、各章节源入口、循环状态、速度、增益及处理参数。未知曲名、作者保留空值，不根据文件名猜测身份，也不把本地可读等同于独立核实了抖音原曲。
- 节拍分析采用起音自相关、三个时间窗的一致性和节拍网格强度共同判定。信心不足时速度固定为1，使用平滑衔接；信心足够时章节速度因子为0.982–1.020，始终限制在±3%内，用 `atempo` 保持音高。自动4拍入口是编排启发式，不能当作已识别真正的强拍或拍号。可用已核实的 `--bpm` / `--beat-offset` 覆盖，或 `--no-tempo-variation` 禁用速度变化。
- 配乐先为人声做轻微频段避让，再做整句 ducking，避免逐字抽吸。最终目标为−15 LUFS（±0.3 LU）、实际试编码 AAC 真峰值不高于−1.5 dBTP；内部母带留额外编码余量。失败则不应用。
- `--mux-video` 必须对应同一时长的当前时间线，输出必须是新文件。直接复制原视频码流、仅重新编码音频；再检查帧数及最终 AAC 响度和真峰值。仍须进行主观试听，脚本不会把数值检查称为听审。

采样来源 [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE)，固定提交 `440300901dfe9275fd84e0b7763af1f8443ae62e`，许可 CC0-1.0。记录者 Sam Gossner / Versilian Studios、Simon Dalzell / Ivy Audio；剪辑 Elan Hickler / Soundemote。使用的是独立乐器音符，不是既成曲目。音符清单、采样哈希和许可保存在 `audio/music_source/samples/manifest.json` 与 LICENSE。

本轮音频复核：48句显示文本与故事稿、选用配音记录一致；ASR的预期文本对应口播读音稿，三处“桁架→横架”仅用于发音，不改显示文字。48个实际声音文件的SHA与时间线、配音记录、ASR来源一致。188条SRT的文字与起止时间逐条对应时间线，没有重叠；13处改稿与重合成清单一致。旁白、音乐、母带均为18,219,200采样点（48 kHz），母带实测−15.01 LUFS / −1.49 dBTP；这是WAV测量，成片AAC以 `research/qa/final-check-v2/` 的最终编码报告为准。

交付技术检查包括：48 kHz；最终AAC真峰值不高于−1 dBTP；整体−16至−14 LUFS；字幕无交叠；旁白长度、哈希和时间线一致；片尾参考页音乐自然收束。未进行真实听审时，报告 `subjectiveListeningChecked` 保持 `false`。
