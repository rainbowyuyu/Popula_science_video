# V01 资料与音画 QA 备忘

核验日期：2026-10-06（Asia/Shanghai）  
范围：`docs/story-v01.md`、`docs/narration-v01.json`、`src/physics2026/timeline-v01.json` 与 `research/nobelphysics2026/` 官方资料。

## 已通过的事实边界

- 得主只有 **Francis Halzen**，奖项份额 1/1；IceCube Collaboration 是约 450 人、58 个机构、14 国的合作项目，不是共同得主。
- 1987 年秋 Halzen 在 University of Kansas 演讲，E. Zeller 提到南极无线电方案；Halzen 与 T. Stanev、E. Zas 判断 PeV 阈值过高；1988 年 Halzen 与 John G. Learned 首次报告深极冰 Cherenkov 概念。
- IceCube 规模和深度：86 条串、每串 60 个光学传感器（总计 5,160）、约 1 km³、约 1450–2450 m。
- 2013 年 1.04 与 1.14 PeV 事件、2014 年三年数据 5.7σ；TXS 0506+056 约 290 TeV/0.06°方向关联；NGC 1068 为 1–10 TeV、4.2σ 候选方向。旁白必须使用“证据/关联/候选”边界。
- IceCube 记录的是中微子相互作用产生的 Cherenkov 光的到达时间和光子数，不是直接拍摄中微子。

## 需要在渲染前修正或确认

1. `narration-v01.json` 的 011 句目前写成“两个能量超过一拍电子伏特的事件”。建议改为“2013 年，1.04 和 1.14 拍电子伏特的两次事件……”；“一拍电子伏特”不自然且丢失官方数值。
2. `timeline-v01.json` 的 17 个 `subtitleParts` 都是一整段长字幕。应拆成 2–4 个完整意群，并按实际音频或词速分配 `start/end`；不得用整段缩小字号来解决遮挡。
3. 旁白 012 若使用 NGC 1068，建议补 `4.2σ`，或在画面来源条标注“官方科学背景材料”；不要将方向关联说成已证明唯一来源。
4. 公式段只可使用 `v > c/n`，不要把 `c/n` 说成真空光速；冰的折射率约 1.31，官方材料用水 `n=1.33` 解释阈值概念时须在字幕注明“示意”。
5. 来源条要短暂显示并渐隐，至少保留官方插图署名 `© Johan Jarnestad / The Royal Swedish Academy of Sciences`；教学重绘与官方原图要明确区分。

## 最小自动检查清单

- [ ] `ffprobe`：1920×1080、30 fps、音频 48 kHz、成片音视频时长差 ≤ 2 帧。
- [ ] 所有 `subtitleParts`：`end > start`、不跨 clip、无重叠；最长单条建议 ≤ 5.5 s。
- [ ] 所有数值：与 `research/nobelphysics2026/source-audit.md` 的主张定位一致；搜索“共同得主”“直接拍摄中微子”等禁用表述。
- [ ] 官方图：每处 `fig-main/fig-ice/fig-messenger` 都有可读署名，且不遮挡主体、字幕或公式。
- [ ] 片尾与开场不重复旧医学奖音频；`master.wav` 只包含本项目 17 段旁白和本版本音乐。
- [ ] 代表帧至少检查 opening、IceCube、Cherenkov、track/cascade、背景谱、TXS/NGC、片尾；每个接缝前后各 0.5 s 检查曝光和运动连续性。
