# V4 声音与混音记录

本版主题：科学减重，读懂三高。资料以 `research/revision-v4/audio-lock.json`、`voice-review.json`、`voice-selection.json`、`research/audio-report.json` 与 `research/audio-validation.json` 为准。当前记录包括冻结配音、母带、AAC试编码，以及已完成的交付MP4自动QA。试编码和最终AAC分别测量，不能互相替代。

旧V3记录已存在于 `research/revision-v3/VOICE-AND-MIX.md`，与更新前顶层文件逐字节一致，SHA-256为 `c7bd4c9588ecb4256129269c3d7d282da13a9a334cc39eebeb2365257d625b79`；本次保留该副本，没有覆盖它。

## 当前冻结版本

72句均使用本地 Qwen3-TTS-0.6B 与rainbow鱼个人参考音色。保留原始take，按实际波形时长安排镜头和字幕；未整体拉伸、变速或截短字尾。正式文稿 `docs/story.json` 的SHA-256为 `ebd20b38cd1d2b594f79e49b90d521a2105c059c2b4fdfeac3022f8fd421bf42`。

| 项目 | V4实际记录 |
| --- | ---: |
| 时间线 | 20288帧 / 30 fps / 676.2666667秒 |
| 成片计划总时长 | 11分16.3秒，含9秒片尾 |
| 旁白 / 字幕 | 72句 / 337条 |
| 72句原片音长合计 | 653.6004167秒；不含句间缓冲与片尾 |
| 混音采样率 | 48000 Hz |
| 旁白 / 配乐 / 母带总样本数 | 各32460800个采样帧，与全片长度一致 |
| 母带实测响度 / 真峰值 | −15.02 LUFS / −1.49 dBTP |
| AAC试编码响度 / 真峰值 | −15.02 LUFS / −1.43 dBTP |
| 活跃旁白相对音乐 | 17.9749 dB |
| 旁白片尾静音 | 9秒；不代表配乐也静音 |
| 语速因子 | 1 |
| 原片端点告警 / 最终ASR自动告警 | 0 / 0 |
| 完整主观听审 | 未完成，`subjectiveListeningChecked=false` |
| 最终交付MP4的AAC | −15.02 LUFS / −1.43 dBTP；实际交付文件测量 |
| 最终MP4视频/容器时长 | 676.266016秒；20288帧 |

上表响度读取 `audio-report.json` 的 `input_i`、`input_tp`，表示对已有文件的测量；不把FFmpeg测量输出中的假设归一化结果当作实际交付值。AAC试编码文件为 `audio/master-aac-check.m4a`。

## 首轮问题与最终候选

首轮记录 `research/revision-v4/voice-review-firstpass.json` 保留当时72句的原稿、ASR和疑点，不是当前音轨的通过证明。首轮曾发现g027的TTS展开把“低密度脂蛋白”重复说了一遍，以及g024句尾余量过小的风险。两句已重新生成并选择完整候选；没有用压低音尾或裁切掩盖问题。

最终 `clarity-v4` 候选替换了g005、g013、g019、g024、g027、g068；选择详情与各take哈希见 `voice-selection.json`。g005/g013/g019/g068同时调整更易朗读的措辞或表达；旧版本保留在 `audio/selected-prior/v4-firstpass/`，候选保留在 `audio/candidates/clarity-v4/`。本轮不再包含旧V3的临床获益统计句。

`research/revision-v4/voice-review.json` 已对最终72句逐项比较无提示词ASR与实际 `ttsText`，`requiredRegeneration=[]`，`allAutomaticFlagsCleared=true`。第二次医学词表复查覆盖38句，作为辅助记录。胰腺/一线等同音ASR替换不能单独证明发音错误；自动匹配也不能证明普通话声调、自然度或悦耳程度已通过人工听辨。所有记录保留 `subjectiveListeningChecked=false`。

## 字幕与样本检查

`research/caption-report.json` 对应当前锁定时间线：337条字幕，0处重叠，单条最多22个中文等效单位。时间来自实测句起点与CPU Whisper逐词时间映射。字幕保留读者可识别的标准术语，`ttsText`可为发音展开术语；不能把二者字符串不同一概认定为漏读。

`research/audio-validation.json` 的 `passed=true`：旁白、配乐和母带总样本数一致，三份WAV的削波样本数均为0；检查了40个CC0单音源文件哈希，旁白末尾9秒静音；没有整体语速拉伸。该报告验证音频工程，不替代最终MP4容器、画面帧数或最终AAC的检查。

## 配乐与来源

《微光信使》为本片原创旋律和编配，V4按新的实测时长重新安排同一作品；没有挪用其他集的背景音乐。编配记录为76 BPM、固定种子202610088。音乐单音来自VSCO 2 Community Edition，CC0；具体贡献者、文件与哈希见 `research/music/samples/manifest.json`。原曲哈希为 `a8bacb299e7b6d785de1117eca45e2cf6df47602da7cccf077c571bc65c1c46a`。

| 当前文件 | SHA-256 |
| --- | --- |
| src/timeline.json | `1208c8901ec34c05623e9520a680673104103bc87bfdc4f7daa6ede254af8ba2` |
| narration.wav | `8934db408bc566cac6cb204b1432a6a13753592052d930e5e65b0b27b411b7fe` |
| music.wav | `c3b9d60a5f93ee6e58f1256054ef95edbff3df6105a8096506393ef3328cf430` |
| master.wav | `cd304ff3393c3f19264807973dbb1b47ad9dd53e957abcccc9fa10bd1b5e208f` |

## 复现边界

已有最终声音和实测时间线，正式渲染只需读取它们。不要为复现视频无目的重跑 `story_v4.py`、生成音频或重建混音；这些会重新产出素材或覆盖实测时间线。需要审查时先读取上述报告、锁定哈希和各take元数据。

最终交付MP4已完成自动QA：`research/qa/final-v4/automatic-report.json` 的 `automaticChecksPass=true`，完整解码20288帧；视频与容器时长676.266016秒，最终AAC为−15.02 LUFS、−1.43 dBTP（响度范围2.4 LU）。这组测量对应视频SHA-256 `375a546df710e84b44dfd5d0667805a49320deb1d269114d922655429cb42772`。它是实际交付文件的测量，不是此前AAC试编码的替代抄值。若成片再修补，需对新的文件哈希重新QA并更新本记录。未声称全长人工听审或主观音色验收。
