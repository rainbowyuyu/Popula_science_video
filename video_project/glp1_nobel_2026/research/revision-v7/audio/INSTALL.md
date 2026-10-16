# V7 Lemon Tree 候选与安装交接

当前只有一个完成的可审核候选：`candidate-01/`。`public/`、`delivery/`、故事和时间线均未修改。

## 已完成的内容

- 原曲仍为用户指定的 `D:/CloudMusic/幽蓝键 - Lemon Tree (柠檬树) - 钢琴曲.mp3`（实际文件含 NBSP，准确路径见报告）。源 SHA256：`42d9f922ce491372e1bc3585043f9add401f9ed4d94fb986b90a5ba2da5372a1`。
- 原速、原调，不添加鼓点。保留原录音中的力度与时值。
- 81/129 秒长段落延展保持不变；交接只重叠相容的约 1.68 秒乐句。主要接口 chroma 相似度约 0.981/0.989；尾声约 0.824。这些是数值辅助，不是专业听审结论。
- 配乐按照较长讲解段平缓调整，短句间停顿不反复起落；很轻的人声最多额外让出 2.4 dB。片尾在最后一句结束之后约 5 秒内渐抬，接回原曲自然尾音。
- 89 句原旁白不重录、不重排、不变速。直接读取当前 `public/narration.wav`，其 SHA 为 `0ca986da267aa53ad48edc8bba571856fc35d7a8138eb8ae5e2a052db1effdc0`。

## 文件身份

| 用途 | 文件 | SHA256 |
|---|---|---|
| 待安装母带 | `candidate-01/master.wav` | `8de84673e1f74a0b485ac5f65f682dbb13f87ee6859ee7340ccfcf6336a08569` |
| 待安装配乐 stem | `candidate-01/music.wav` | `f652646eaa9f1358a2dd975bb4972b96dd3b68065e87c88f6996b0b8776059f6` |
| AAC 检查版 | `candidate-01/master-aac-check.m4a` | `084386baef1b7cc511da7e444a729688a9f1a645eae8b49cdbd508f50c444695` |
| 生成记录 | `candidate-01/audio-candidate-report.json` | `3c61f4499d7dd0565f71dfd4d8f31333d24542ad3c0fb6b92c00f01e1d762a78` |
| 独立时序验证 | `candidate-01/verification.json` | `ee15e498376741a9b7c256d1f0e4754dccdfe238ffc99b731c0fe2b48b022bbc` |

音频均为 48 kHz，母带/配乐均精确 40,993,600 samples，即 854.033333 秒。AAC 检测为 −15.04 LUFS、−1.90 dBTP。语音活跃时整体人声高于配乐约 20.20 dB。

## 核验范围

`verification.json` 对完整母带与“原旁白 + 新配乐”作了比较。171 个分布于全程的 5 秒窗口分别在 ±100 ms 范围搜索，最佳延迟全部为 0。完整解码样本有限、长度正确，生产输入 SHA 未改变。

最终 loudnorm 包含动态峰值控制，不能把母带说成原旁白只乘一个常数。全段零延迟相关度 0.99742；按最佳常数增益计算的归一化残差约 0.0718。窗口最低相关度约 0.9718，属于需结合试听评估的动态处理差异，不代表已完成主观好听度验收。

旁白期间，配乐控制包络变化速度超过 1 dB/s 的时间从旧版 16.3 秒降到新版 0 秒。该指标只量自动控制，不量原钢琴自身力度，也不能据此声称用户一定更喜欢。

`compare-opening-v6/v7.m4a`、`compare-first-join-v6/v7.m4a`、`compare-glp1-v6/v7.m4a`、`compare-lipids-v6/v7.m4a`、`compare-pressure-v6/v7.m4a`、`compare-clot-v6/v7.m4a`、`compare-ending-v6/v7.m4a` 是相同时段的 A/B。`gain-control-comparison.png` 显示控制起伏。主观完整听审标志保留 `false`。

## Root 接受候选后的安装步骤

1. 核验上表 SHA 与当前 `src/timeline.json` 的 `e976021ce9b1a665ca54206e73898587efb33c6f91865eb22bb8b7ad0c71dfb0`，确认当前旁白源 SHA 未变。
2. 保留已有 V6 不可变源快照/母带证据；只把候选 `master.wav`、`music.wav` 安装到 `public/`。不覆盖 `narration.wav`、单句 voice、字幕或 timeline。
3. 创建新的 V7 源锁与音频安装记录，不能沿用 V6 master SHA；音频源、A/B 与审核范围纳入 V7 来源说明。
4. 成片完成后以这条完整母带从零一次 AAC 编码，视频可流拷贝。重新验证最终 MP4 音轨起点、总长、零延迟和响度，不能把候选 AAC 测值直接当成最终 MP4 的测值。

复现脚本为 `build_music_candidate.py`，验证脚本为 `verify_candidate.py`。正常复现应使用全新输出目录/工作副本；`--resume-metadata` 仅用于本次 Windows 路径键分隔符修复后的元数据恢复，不能当作未经核验地复用任意音频的通用入口。

目录 `audio/` 根部在第一轮数值检查失败时生成的临时 WAV/F32 不属于候选，未纳入身份表，不能安装。仅 `candidate-01/` 内报告列出的文件可交接；清理应在父任务接受当前候选之后进行。
