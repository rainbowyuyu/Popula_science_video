# 高血压 V7 配乐：循光·室内乐版

本次只替换音乐与最终混音。全片仍为 **9671 帧 / 30 fps / 322.3666667 秒，53 句旁白**。旁白原始 WAV、已处理句源、`narration.wav`、story、两份 timeline 和 SRT 的前后 SHA256 一致；没有重新 TTS、语速变化、字幕重排或时间轴变化。

## 编排

新曲《循光·室内乐版》是本集重新写的 104 小节室内乐编排，共 988 个独立音符事件。标称 78 BPM，乐句收尾有约 2.6% 放缓，器乐音符有固定种子的 5—12 ms 轻微错落。调性以降 E 大调 / C 小调为主，使用相邻声部进行、附加九音的开阔和弦及三套八小节旋律。每个乐句有停顿和回答，没有复制整段音频循环，也没有旧版本振荡器主音色。

- 弱奏立式钢琴：570 个音符，承担旋律和稀疏伴奏；使用不同 round-robin 真实录音。
- 竖琴：143 个音符，在钢琴间隙回答，避免持续高频琶音。
- 中提琴 / 大提琴：156 个音符，以缓起、交叠收尾形成连续空间。
- 大提琴拨弦：106 个音符，提供柔和的步进感。
- 轻 conga tap：仅 13 次，藏在泵动和阻力段的器乐节奏中。

| 画面时间 | 音乐安排 |
|---|---|
| 0:00—0:30 测压引入 | 留白钢琴，短句式旋律，弦乐在后段渐入 |
| 0:30—1:34 人体、泵动 | 钢琴展开，竖琴回答，拨弦增加轻微推进感 |
| 1:34—2:56 阻力、肾脏 | 保持主旋律辨识度，减少声部密度，弦乐长音接住镜头 |
| 2:56—4:33 调节、硬化与斑块 | 换入相对小调和更舒展的旋律，保持克制，无惊吓音效 |
| 4:33—5:10 测量与管理 | 回到温暖大调，旋律重新完整出现 |
| 5:10—5:22 证据片尾 | 收拢声部，明确降 E 大调终止，尾部 3.6 秒自然衰减 |

所有声部共用一个低电平、约 1.8 秒的室内声场。钢琴和竖琴保留真实击弦/拨弦瞬态；弦乐保留弓弦起音，不使用持续合成器铺底。音源分别低通约 2.1—4.8 kHz，并在音乐混音中给 2.5 kHz 人声区域留出空间。

## 音源和许可

实际访问并保存了官方仓库的 `LICENSE`、`Readme.txt`、README 和每个下载样本的 URL / SHA256：

- [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE)
- 固定版本：`440300901dfe9275fd84e0b7763af1f8443ae62e`
- 官方许可：**CC0-1.0**。
- 40 个文件约 63.5 MB，包括 36 个本次所需音符样本和 4 份许可/说明文件；没有下载整个音源库或任何现成音乐录音。
- 录音：Sam Gossner / Versilian Studios、Simon Dalzell / Ivy Audio；样本剪辑：Elan Hickler / Soundemote。
- 完整来源清单：`research/hypertension/music-v7-samples/manifest.json`。

建议随交付说明保留致谢：**配乐《循光·室内乐版》由 rainbow鱼 为本片原创编排；音符采样来自 VSCO 2 Community Edition（CC0），感谢 Versilian Studios / Sam Gossner、Ivy Audio / Simon Dalzell 与 Soundemote / Elan Hickler。**

## 混音与实际评估

人声活跃区间平均高于音乐 **17.00 dB**。Duck 提前 0.12 秒、攻击约 0.18 秒、恢复约 1.25 秒，短句间不会反复大幅起伏。只对最终合成母带做响度归一，旁白 stem 字节保持不变。最终混音实测：

| 检查 | 结果 |
|---|---|
| PCM 母带综合响度 | **−15.82 LUFS** |
| 实际 320 kbps AAC 真峰值 | **−1.67 dBTP** |
| 音频长度 | 15,473,600 样本 / 48 kHz = 322.3666667 秒 |
| 全部句源、字幕、时间轴 SHA256 | 前后完全一致 |
| 已有全片语音/字幕 QA | 53/53 通过，ASR reviewIds 为空 |
| 新音乐 NaN/Inf | 0 |
| 未 Duck 音乐峰值 / RMS | −3.61 / −22.65 dBFS |
| 未 Duck 音乐立体声相关系数 | 0.432 |

实际检查了生成波形、分段能量、频谱、立体声、完整 PCM/AAC 解码和与旁白的电平关系，并导出了同 RMS 的 V6/V7 对比样本。52—70 秒的同电平音乐对比中，V7 峰均比约 16.52 dB，V6 约 14.49 dB；新音乐保留了更多真实弱奏钢琴瞬态。它有更丰富的真实乐器泛音，但 3—8 kHz 频带占比仍低，未用高频合成音制造存在感。

**未进行人工耳听或声学主观认证，`subjectiveListeningChecked` 保持 false。** 上述证据可验证连续性、音频完整性和混音安全范围，不能自动证明审美更好。交付试听保留真实音色，便于用户直接判断。

## 试听

- `music-v7-listening-preview.wav`：纯音乐四段试听，依次是 0—14、58—72、146—160、278—292 秒；段间有 0.35 秒间隔。
- `mix-v7-listening-preview.wav`：相同片段，包含旁白。
- `music-v6-v7-AB.wav`：相同 52—70 秒片段，旧音乐在前、新音乐在后，中间 0.8 秒间隔，RMS 匹配。
- `mix-v6-v7-AB.wav`：相同顺序的含旁白 A/B，RMS 匹配。
- `public/hypertension/mix-preview.wav`：新混音开头 24 秒。

## 文件与复现

新增脚本：

1. `scripts/hypertension/fetch_music_v7_samples.py`：固定版本按需获取音源，记录许可与哈希。
2. `scripts/hypertension/score_v7.py`：原创新曲和真实采样演奏，保存完整音符事件。
3. `scripts/hypertension/mix_music_v7.py`：检查冻结输入、混音、AAC 验证、试听、完整 QA 和曲目登记。

在工程根目录依次运行：

```powershell
D:/python_project/tts/.venv/Scripts/python.exe -X utf8 scripts/hypertension/fetch_music_v7_samples.py
D:/python_project/tts/.venv/Scripts/python.exe -X utf8 scripts/hypertension/score_v7.py
D:/python_project/tts/.venv/Scripts/python.exe -X utf8 scripts/hypertension/mix_music_v7.py
```

最终视频渲染应读取更新后的 `public/hypertension/master.wav`。**不要运行旧 `prepare_audio.py mix`，该旧入口仍指向《脉流之间》，会覆盖新配乐。** 本次没有更改旧音频入口，没有运行视频渲染，也没有清理共享临时文件。

已更新 `public/hypertension/music.wav`、`master.wav`、`mix-preview.wav`、`research/hypertension/audio-mix.json`、`audio-final-qa.json`；新增 `music-v7-events.json`、`music-v7-qa.json`、上述试听与未 Duck 源 stem；曲目已写入 Skill 的 `references/music-history.json`。

| 文件 | SHA256 |
|---|---|
| 最终 music.wav | `dcd64bc1d9ca820036b545adbdf442e0b6232a56d84fd39fb89b7b2bd4b609d3` |
| 最终 master.wav | `fc90b294e9010eff2c09cc2f93cf18208d0e008f4a9c647708a4038e3a7f4e91` |
| 未 Duck 原创 stem | `ef16d272842914f5fead8c3d25bd2af7bd550963a29b6f7b545f1199ce9023aa` |
| 固定时间轴（未改） | `5487802be3ce7d7c4e672ef7d38d698a36416c54bbc1f9f1134cc4e9df191640` |
| 音源 manifest | `0d0f0bc399381c9d1a8d4a7912377c16e570da199045e2b920514acfc5a28836` |

完整冻结输入哈希和音频检查见 `music-v7-qa.json`。这份记录是 V7 音频母带的验证，成片完成后仍应检查视频内实际编码音轨。
