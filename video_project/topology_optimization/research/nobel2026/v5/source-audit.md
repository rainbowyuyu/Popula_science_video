# V5 来源与事实审计

更新时间：2026-10-06（Asia/Shanghai）。本审计是 V5 重构的只读研究记录，不能替代最终逐帧和逐句复核。V4 资产保留为回退；V5 不覆盖 V4。

## 官方来源与本地证据

| 来源 | 访问/文件 | 可支撑的事实 | V5 用法 |
|---|---|---|---|
| NobelPrize.org Summary | https://www.nobelprize.org/prizes/medicine/2026/summary/ | 三位获奖者、授奖理由 | 片头英文姓名和理由；只出现一次 |
| NobelPrize.org Press release | https://www.nobelprize.org/prizes/medicine/2026/press-release/ | 光控离子通道和 optogenetics 的奖项背景 | 旁白事实核对 |
| NobelPrize.org Popular information | https://www.nobelprize.org/prizes/medicine/2026/popular-information/ | 衣藻趋光、ChR1/ChR2、培养神经元、活体小鼠、应用与临床边界 | 主要叙事来源；不把示意图称作显微实拍 |
| 本地科普 PDF | `public/nobel2026/popular-medicineprize2026.pdf` | 已下载版本，8 页；页码见下表 | 论文页和证据审核，片尾保留署名 |
| Nobel Advanced information | https://www.nobelprize.org/prizes/medicine/2026/advanced-information/ | 技术背景和术语边界 | 仅用于校对，不将高级信息整段读入 5 分钟旁白 |
| 研究论文元数据 | Nagel 2002/2003、Boyden 2005、Aravanis 2007、Liu 2012、Sahel 2021 | 论文标题、作者、年份、DOI | 来源两行显示；完整 DOI 放交付说明 |

科普 PDF 的署名为 `© The Nobel Committee for Physiology or Medicine. Ill. Mattias Karlén`。四张本地 PNG/JPG 均是 NobelPrize.org Popular Information 的教学插图，不能当作实验原始照片或论文图。

## PDF 页级事实核对

| PDF 页 | 原文要点 | 旁白可说 | 不能说 |
|---:|---|---|---|
| 1 | 脑约 1.3 kg，旧方法能定位脑区但不能证明特定细胞导致行为；Crick 提出用光控制神经元的设想。 | “看到一片脑区亮起，还不能证明是哪一类细胞造成行为。” | 不要把 Crick 的设想写成已完成实验。 |
| 2 | Chlamydomonas 眼点含 retinal；侧向光使衣藻游向光源；约 0.5 ms 产生电脉冲；人眼类似过程至少约 10 ms。 | “眼点把光变成方向，约半毫秒就出现电信号。” | 不要把眼点画成相机镜头或把 0.5 ms 说成普遍神经反应速度。 |
| 3 | Chlamydomonas 两段基因分别注入蛙卵，形成 ChR1/ChR2；通道在膜上，光照后阳离子流过；ChR2 开放约 0.2 ms；2003 年发表，并在肾细胞/仓鼠细胞中测试。 | “蓝光打开光控阳离子通道，正离子流过，细胞电压改变。” | 不要写成单一 Na+ 通道、主动离子泵或一个光子对应一次开门。 |
| 4 | Deisseroth 将 ChR2 基因导入培养鼠神经元；蓝光立即引发可传播神经信号；2005 年发表。 | “培养神经元在蓝光脉冲下产生沿轴突传播的动作电位。” | 不要把 2005 说成活体小鼠实验。 |
| 5 | 2006 年方法命名 optogenetics；2007 年在活体小鼠运动皮层插入光纤，使胡须运动；同年可受控唤醒小鼠。 | “2006 年有了名字，2007 年光纤进入活体脑。” | 不要说 2006 年有独立活体实验，或把所有行为归给同一篇论文。 |
| 6 | 2012 年 engram 恐惧记忆研究；可拆分疼痛、社交、口渴、进食、奖赏、注意力等回路。 | “后续研究用光遗传学逐个检验记忆和行为回路。” | 不要说 2012 年是三位获奖者完成的诺奖发现。 |
| 7 | 视网膜色素变性方向处于临床探索，个案有部分视觉功能恢复；需基因递送和专用光源。 | “早期试验出现部分视觉恢复，仍是探索中的治疗。” | 不要说治愈、普通蓝光能控制人脑或已普遍临床应用。 |
| 8 | 获奖者简介和授奖理由。 | 片尾只保留论文名、作者、年份和官方署名。 | 不要用简介页代替主论文证据。 |

## 官方插图尺寸与安全裁切

这些尺寸通过本地 PIL 读取，`EvidenceFigureV4.tsx` 中的裁切坐标可直接作为 V5 初始值。V5 组件应复制坐标并在渲染帧中复核，不能盲信静态坐标。

| 文件 | 尺寸 | 左焦点 | 中/右焦点 | 说明 |
|---|---:|---|---|---|
| `POP_Fig_2.jpg` | 2500×964 | `(0,55,1140,800)`：衣藻与橙色眼点 | `(750,70,1250,780)`：趋光培养皿；`(1460,70,1040,780)`：侧向光源 | 先全图，再眼点→培养皿→光源；不要跨越图中文字。 |
| `POP_Fig_3_ENG_01.jpg` | 2500×1100 | `(0,90,1180,850)`：基因进入蛙卵 | `(600,150,1040,760)`：闭合通道；`(1300,120,1200,850)`：蓝光、开放通道和阳离子 | 中央闭合门和右侧阳离子必须保持同一膜面方向。 |
| `POP_Fig_4_ENG_01.jpg` | 2500×996 | `(0,70,1460,850)`：基因/培养神经元 | `(1160,80,1340,850)`：蓝光与信号；`(1370,180,1130,730)`：动作电位迹线 | 迹线放大后仍须保留坐标轴；不称为电生理原始图。 |
| `POP_Fig_5_ENG_01.jpg` | 2500×1027 | `(0,140,1550,800)`：小鼠与基因 | `(1050,0,1450,810)`：光纤进入脑；`(1430,60,1070,780)`：神经信号/胡须 | 光纤尖端在图右半部；旧稿曾误聚焦在 x≈980，V5 不得复发。 |

文件均应保留真实长宽比；来源标记短暂显示在图外安全区，绝不压住字幕和主体。`public/nobel2026/molecular/6EID*` 是 ChR2 静态晶体结构（2.39 Å，2017），不是光开关动态影片。V5 默认不使用它；若临时使用，必须写“静态晶体结构”，并把门开/离子流标为机制示意。

## V4 旁白与 ASR 风险（需 V5 重录或人工复听）

`research/nobel2026/v4/asr-ranked.json` 与 `asr-short-takes.json` 显示，V4 多数句尾完整，但以下问题不能带入 V5：

- 英文姓名识别偏差：`Karl Deisseroth` → “Carl DeSaross”（相似度约 0.538），`Georg Nagel` → “Drog Nego”（约 0.444），`Peter Hegemann` → “Peter Hageman”（约 0.880）。三句必须单独录制、慢半拍停顿，并人工听完。
- 多音/近音和词形：`小绿藻` 被听成“小绿枣”；`朝着光源游动` 被听成“油洞”；`鞭毛` 被听成“边毛”；`二型通道` 被听成“二形通道”；`光脉冲` 被听成“光脈充”；`神经元` 被听成“神经源”；`链条接上了` 被听成“链条街上了”。
- 结构助词：`光电流快得惊人` 被识别为“快的惊人”；口播应重读“得”，字幕保持“得”。
- 数字：`二零零三/二零零五/二零零六/二零一二` 的 ASR 常自动转阿拉伯数字，字幕可用阿拉伯数字，但声音必须逐字复听，不能以 ASR 代替人工检查。
- `asr-short-takes` 的 `018-00` 尾部检测到 2.5 s，而主时长约 2.1 s，需按声学波形截去多余静音并留出至少 20 帧安全尾，不可把静音当成可视化停留。
- V4 `assembly.json` 的 `subjectiveListeningChecked` 为 `false`；V5 完成后必须改为人工听审通过，记录句级问题和修订哈希。

V5 发音表：`Karl Deisseroth`、`Peter Hegemann`、`Georg Nagel` 用英文合成；`ChR2` 读 “C-H-R two” 或统一中文“二型通道”，全片保持一种；`optogenetics` 首次出现可读英文，随后用“光遗传学”；`NeRF` 等其他缩写不属于本片。`rainbow鱼` 为作者署名，自然连读，不拆成字母。

## 论文索引（片尾两行来源格式）

1. *Channelrhodopsin-1: a light-gated proton channel in green algae* — Nagel G et al. · Science 296:2395–2398 · 2002 · DOI 10.1126/science.1072068。
2. *Channelrhodopsin-2, a directly light-gated cation-selective membrane channel* — Nagel G et al. · PNAS 100:13940–13945 · 2003 · DOI 10.1073/pnas.1936192100。
3. *Millisecond-timescale, genetically targeted optical control of neural activity* — Boyden ES et al. · Nature Neuroscience 8:1263–1268 · 2005 · DOI 10.1038/nn1525。
4. *An optical neural interface: in vivo control of rodent motor cortex with integrated fiberoptic and optogenetic technology* — Aravanis AM et al. · Journal of Neural Engineering 4:S143–S156 · 2007 · DOI 10.1088/1741-2560/4/3/S02。
5. *Optogenetic stimulation of a hippocampal engram activates fear memory recall* — Liu X et al. · Nature 484:381–385 · 2012。
6. *Partial recovery of visual function in a blind patient after optogenetic therapy* — Sahel JA et al. · Nature Medicine 27:1223–1229 · 2021；只能写成早期、部分恢复。

视频画面每张来源只放：第一行真实论文名（必要时截短标题），第二行作者与年份；完整 DOI、URL、访问日期放交付说明和仓库台账。

## V5 验收闸门

1. **事实**：片头姓名、授奖理由、2003/2005/2006/2007 年节点与 PDF 页码一致；ChR2 写成非选择性光控阳离子通道；临床用“早期/部分恢复”。
2. **图形**：每张官方图全图→焦点→退出的坐标稳定；没有错指箭头、来源压字幕、重复图层或突然白闪。
3. **3D 清理**：V4 的脑/小鼠/细胞通用 3D 只作回退；V5 成片中不得出现形象不像、比例漂移或点阵代替实体的模型。允许的深度来自 2.5D 分层和局部膜孔。
4. **Opus 组件**：逐句状态变化；轨迹、脉冲、离子和镜头端点同一帧契约；禁止无种子随机、实时 CSS 和冻结末帧。
5. **Qwen 桥接**：每个生成段有前后端点帧、任务 ID、哈希、模型和采用范围；不出现文字/Logo/数据/虚假显微事实。
6. **声音字幕**：以最终 TTS 波形强制对齐；句尾至少 20 帧；英文姓名人工复听；`subjectiveListeningChecked=true`；最终 AAC 约 −14 LUFS，真峰值 ≤ −1 dBTP。
7. **观看**：抽查 0/15/30/60/90/120/150/180/210/240/270/295 秒及所有 Qwen 接缝前后 0.5 秒；完整解码，无黑帧、旧音轨、长静音、字幕遮挡。

