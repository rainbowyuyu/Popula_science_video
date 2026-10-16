# v8 完整解说音频与可复现流程

2026-10-05 完成。采用 rainbow鱼 本地个人参考音色和完整分句 WAV，未替换通用音色，未剪字尾、未变速、未变调。只操作 episode3v8 音频、字幕、时间线和审查记录；没有修改视频画面源码或 annotations.json。

## 当前结果

- 47 句：2 句与 v7 的口播文本、参考音频、源 WAV 哈希完全一致，整句复用；45 句按 v8 冻结稿重新生成。v8_017 使用单字“拱”的 spoken，v8_042 使用位移／应力的新定义。
- 原声合计 **286.9604167 秒**；每句增加前 0.02 秒、后 0.18 秒保护，共 9.4 秒。后期每句保留原始内容的全部采样范围。
- 完整时间线 **9764 帧 / 30 fps = 325.4666667 秒（5:25.47）**，47 个语音窗口、98 段短字幕、12 秒片尾。字幕最长 18 个显示字符。
- 5:25.47 比目标 300 秒长 25.47 秒。主任务已接受其属于约 5 分钟范围，保留全部 47 句和自然语速；不为了刚好 5:00 拉伸声音、删保护或裁尾。时长来自实际后期 WAV 样本，取帧向上对齐，不用估算字数代替。
- 母带 48 kHz、立体声、24 bit，15622400 音频采样帧，与 9764 视频帧精确对应。
- 母带响度 **−15.52 LUFS**，母带真峰值 **−1.49 dBTP**；独立 320 kbps AAC 编码验证真峰值 **−1.45 dBTP**。最终 MP4 导出后仍应针对其实际 AAC 流再检查，不能把本次临时 AAC 当作最终视频。
- `audio-final-qa.json` 技术检查通过。**尚未完成完整人工听审或主观声音审美检查**；`subjectiveListeningChecked`、`humanPronunciationReview` 均保持 false。

## 冻结版本与文件

| 文件 | SHA-256 |
|---|---|
| `research/episode3v8/story.json` | `000b8a9c6b14589b370080337f591717b7ef9cafae768f18e8f3b677c6d74909` |
| `public/episode3v8/timeline.json` | `52bb66266f26d549d34be865b7a2d184564a914cbe95210d1f2640daf5bbe8e8` |
| `public/episode3v8/narration.wav` | `586e758f0d350af51e3a11cd03e7fd60309fa8488cff2a088a3d0b8134911509` |
| `public/episode3v8/music.wav` | `ef9d426c103c9f52af835f009e300c9885b5ba4a9a49a478bf1b2cedc5ae5326` |
| `public/episode3v8/master.wav` | `1af5f65092a3794df8c34a277f5cd2c256a669d98e8cdcab27805f619dd31a4b` |

实际工程根目录：`D:/python_project/manim_extend_rainbow/video_project/topology_optimization`。

原声：`public/episode3v8/voice-raw/v8_000.wav` … `v8_046.wav`。处理后整句：`public/episode3v8/voice/`。画面使用的时间线：`src/episode3v8/timeline.json`，与 public 时间线内容一致。`subtitles.srt` 保留标准显示字，不使用发音替字。

短试听文件为 `public/episode3v8/voice-AB-preview.wav`（相近响度原声／处理后对照）和 `mix-preview.wav`（24 秒含 BGM 预览）。它们供试听，不代表已经被人工听过。

个人声音参考和模型保留在 `D:/python_project/tts` 中，没有复制到交付包。

## ASR 能证明什么

CPU faster-whisper small 对全部 47 句原声和全部 47 句处理后音频分别识别。语言 zh、beam size 5、word timestamps、无 initial prompt、`condition_on_previous_text=false`；缓存记录真实设备和配置哈希。

- 原声平均字符覆盖 **92.1587%**；处理后 **92.7098%**。
- **0 句**发生“原声末尾强识别，而处理后末尾识别丢失”的检测情况。
- **0 句**原声长度比处理后长超过 100 ms；全部后期长度为原声重采样后的完整长度加 0.20 秒保护。
- ASR 是漏词、顺序和尾部完整性的辅助证据，不能证明声调、声线好听程度、真实朗读节奏，也不能替代人工听审。

`audio-raw-check.json` 中保留 4 个低阈值复核项：v8_000、v8_011、v8_014、v8_033。具体有“托／拖”“梁柱／粮住”“木料／幕僚”“石楚／使出”等识别差异，不能据此直接认定原声坏了，也不能自动宣称读音完全正确。

另有必须诚实保留的术语听审关注点：v8_017 的“斗”识别为“豆”；v8_029 的“凛”识别为“领”；v8_032/033 的“石楚”识别近似“使出”；v8_042 的“应力”识别为“硬力”。这些差异可能来自识别或实际发音，当前没有人工听审结论。不能把相近音字全部当成已修复读音。v8 本稿没有“干湿／干燥”口播，不存在用旧湿度段落冒充已修复本稿的问题。

## ASR 数据与画面标注对齐

- `research/episode3v8/audio-generation.json`：按 clip ID 索引，含实际 spoken 文本、参考哈希、请求参数、seed、完整原声时长和原声 SHA。
- `research/episode3v8/audio-asr-cache.json`：顶层键是 WAV SHA-256；每条含 `recognized`、`segments[]`，其中 `segments[].words[]` 含 `word/start/end/probability`。时间单位是相对该 WAV 起点的秒。
- `research/episode3v8/audio-mastering.json`：含每句 `rawSha256`、`outputSha256`、保护采样数和延迟补偿结果。
- `research/episode3v8/audio-raw-check.json`：按句的原声 ASR、缺句和尾部检查。
- `research/episode3v8/audio-v7-audit.json`：沿用通用脚本的报告文件名，**内容与路径均为 v8**，含每句 raw/aligned ASR 和汇总；不要误认成 v7 的旧报告。

原声词时间换算：`videoSeconds = clip.start / 30 + 0.02 + rawWordSeconds`。

处理后词时间换算：`videoSeconds = clip.start / 30 + processedWordSeconds`，不再重复加前保护。

现有字幕已通过原声 ASR 字符锚点加 0.02 秒前保护对齐。旁注 cue 应按标准显示字匹配 spoken/ASR 对应词；不要因为“椽→传”“檩→凛”等发音替字而把屏幕标签也替换。

## 配乐与混音

使用本集的原创五声调式编排《木作回响·亭下新编》，100 BPM，合成拨弦、竹笛感音色和轻木质节拍；无外部歌曲采样，不冒充真实古筝／笛子录音。v8 是同一榫卯作品的修订，按新时间线重新合成混音，不把它称为下一集的新曲。

旁白活跃区间 RMS 比 BGM 高 18 dB；音乐提前 0.12 秒压低、约 0.16 秒进入压低区、1.1 秒平滑恢复。音乐的 2.8 kHz 区域轻减，给人声清晰度留空间。人声和音乐分别保留 stem。

## 可复现命令

以下 PowerShell 命令均使用明确的绝对 v8 路径。不要把 `--public-root` 换成相对路径：当前通用生成器写账本时会调用 `path.relative_to(ROOT)`，相对根会在 WAV 写出后触发异常。

```powershell
Set-Location -LiteralPath 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization'

& 'D:\python_project\tts\.venv\Scripts\python.exe' -X utf8 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\scripts\reuse_episode3v8_voice.py'

& 'D:\python_project\tts\.venv\Scripts\python.exe' -X utf8 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\scripts\voice_episode3v7.py' generate `
  --story 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\research\episode3v8\story.json' `
  --public-root 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\public\episode3v8' `
  --report-dir 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\research\episode3v8'

& 'D:\python_project\tts\.venv\Scripts\python.exe' -X utf8 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\scripts\voice_episode3v7.py' audit-raw `
  --story 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\research\episode3v8\story.json' `
  --public-root 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\public\episode3v8' `
  --report-dir 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\research\episode3v8' `
  --device cpu --threads 4

& 'D:\python_project\tts\.venv\Scripts\python.exe' -X utf8 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\scripts\prepare_episode3v7.py' `
  --story 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\research\episode3v8\story.json' `
  --public-root 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\public\episode3v8' `
  --report-dir 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\research\episode3v8' `
  --src-timeline 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\src\episode3v8\timeline.json' `
  --coda-seconds 12

& 'D:\python_project\tts\.venv\Scripts\python.exe' -X utf8 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\scripts\voice_episode3v7.py' audit --asr `
  --timeline 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\public\episode3v8\timeline.json' `
  --public-root 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\public\episode3v8' `
  --report-dir 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\research\episode3v8' `
  --device cpu --threads 4

& 'D:\python_project\tts\.venv\Scripts\python.exe' -X utf8 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\scripts\prepare_episode3v7.py' --mix-only `
  --story 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\research\episode3v8\story.json' `
  --public-root 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\public\episode3v8' `
  --report-dir 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\research\episode3v8' `
  --src-timeline 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\src\episode3v8\timeline.json' `
  --coda-seconds 12

& 'D:\python_project\tts\.venv\Scripts\python.exe' -X utf8 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\scripts\prepare_episode3v7.py' --qa-only `
  --story 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\research\episode3v8\story.json' `
  --public-root 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\public\episode3v8' `
  --report-dir 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\research\episode3v8' `
  --src-timeline 'D:\python_project\manim_extend_rainbow\video_project\topology_optimization\src\episode3v8\timeline.json' `
  --coda-seconds 12
```

必须只运行一个未结束的 TTS 作业。检查原作业是否完成后才恢复，不能因暂时没有日志而重新启动。生成器校验文本、参考和请求哈希并跳过匹配缓存；需要修复具体句时，先协调 spoken 改稿，再在 generate 中明确 `--only v8_XXX --replace-changed`，保持其余路径不变。被替换原声保存在 `voice-raw-history`，不是裁剪后覆盖。

## 本轮一次路径异常的恢复

最初 session 48542 在完整写出 `v8_002.wav` 后，因相对 public-root 导致账本 `relative_to` 异常而退出。确认进程 exit 1、GPU 释放后，核验已写 WAV 为 5.280 秒、24 kHz、完整可读；依据该次生成器未变的文本、参数、参考和 seed 补录精确请求哈希，耗时字段保留 null，并记录恢复说明。没有把这句假装成复用旧配音，也没有重复生成。

随后唯一 session 52087 使用绝对路径继续，只生成剩余 44 句，正常 exit 0。因 writer 的 017/042 修订发生在新进程加载前，这两句直接生成最终冻结稿，无旧稿混入。异常证据见 `audio-job-recovery.json`，对应原声 SHA 为 `a975e6ca29e86f574efffff2e6985032912c6fed4406718b48fead1b947c370b`。

原声、处理后、独立 stem 和完整母带已保留。技术 QA 已通过；最终视频完整解码、实际 AAC 校验、音画逐帧验收和人工听审仍属于后续成片验收。
