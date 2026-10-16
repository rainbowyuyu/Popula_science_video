# 2026 诺贝尔物理学奖来源审计

核验日期：2026-10-06（Asia/Shanghai）  
审计范围：官方结果、授奖理由、研究时间线、探测结构、统计数字、可用插图和背景 PDF。  
原则：只有能在官方页面或下载到的官方 PDF 中定位的事实才可作为旁白的确定语句；视频中的重绘属于教学可视化，不应冒充原始实验照片或论文图。

## A. 一手官方来源

| ID | 来源 | 访问地址 | 核验内容 | 本地副本 |
|---|---|---|---|---|
| P1 | NobelPrize.org 2026 Physics summary | https://www.nobelprize.org/prizes/physics/2026/summary/ | 得主 Francis Halzen、学校、授奖理由、奖项导航 | 访问时页面正文可读；必要时重新下载 |
| P2 | NobelPrize.org press release | https://www.nobelprize.org/prizes/physics/2026/press-release/ | 2026-10-06、授奖理由、IceCube 介绍、1988/2011 时间线、官方素材入口 | `press.pdf` |
| P3 | Laureate facts | https://www.nobelprize.org/prizes/physics/2026/halzen/facts/ | Francis Halzen，1944-03-23 出生，University of Wisconsin–Madison，Prize share 1/1 | 页面来源；未复制 HTML |
| P4 | KVA 新闻稿 | https://www.kva.se/en/news/the-nobel-prize-in-physics-2026/ | 瑞典皇家科学院官方新闻、标题、得主、理由、发布时间 | 网页来源 |
| P5 | KVA English press PDF | https://www.kva.se/app/uploads/2026/10/nobel-physics-2026-press-release_muht560pm1.pdf | 官方新闻稿 PDF 镜像 | 与 P2 交叉核对后可用 |
| P6 | KVA scientific background | https://www.kva.se/app/uploads/2026/10/nobel-physics-2026-scientific-background_34f71vieby.pdf | 18 页科学背景、公式、图 1–6、IceCube 数据和参考文献 | `advanced.pdf` |
| P7 | Nobel popular background | https://www.nobelprize.org/uploads/2026/10/popular-physicsprize2026.pdf | 7 页大众科学背景、故事线和观测站示意 | `popular.pdf` |
| P8 | Nobel press PDF | https://www.nobelprize.org/uploads/2026/10/press-physicsprize2026.pdf | 英文新闻稿 PDF | `press.pdf` |
| P9 | Official illustration: prize | https://www.nobelprize.org/uploads/2026/10/fig_fy_26_3x2.jpg | 官方主插图 | `fig-main.jpg` |
| P10 | Official illustration: observatory | https://www.nobelprize.org/uploads/2026/10/fig2_fy_pop_en_26_copy.jpg | IceCube 南极冰观测站示意 | `fig-ice.jpg` |
| P11 | Official illustration: messengers | https://www.nobelprize.org/uploads/2026/10/fig3_fy_pop_en_26_copy.jpg | 来自空间的信使示意 | `fig-messenger.jpg` |

官方网页新闻稿注明三张插图可用于非商业用途并需署名 © Johan Jarnestad/The Royal Swedish Academy of Sciences。视频画面仍应在来源区保留该署名，不能去除或伪装成自制原图。

## B. 本地文件完整性

下载目录：`research/nobelphysics2026/`

| 文件 | 字节数 | SHA-256 |
|---|---:|---|
| `press.pdf` | 223277 | `f74efd99a0bedb05e4f5371dde3b9313a12705309d5879997ac5b2a5f1c6961c` |
| `popular.pdf` | 568224 | `d441eb71884cd915a2a38f9a77355e85d0e72b47e4c5a59bb6ca54606ee6d6e1` |
| `advanced.pdf` | 1484057 | `6a67bc2868971e60d35a4adf11319b359a4efadc9c55e59ac1eb09cb9270922e` |
| `fig-main.jpg` | 129523 | `55c602a0246d8de5d475145be8d388dfb75f782f05b6ec5d2129e6c1d7a453f6` |
| `fig-ice.jpg` | 537435 | `715637241aea57578df0a426ee01bb6b2ad51e7a7bf1d4c4d9db94b37ad157ed` |
| `fig-messenger.jpg` | 312981 | `ac0727f4d53eb3ba5c8ed5ade781e833f4860814d399584594550eb684048d62` |

`*.pdf.txt` 是用本机 `pdftotext -layout` 生成的可检索副本，不是新的官方来源；如文本与 PDF 版式出现差异，以 PDF 原页为准。

## C. 关键主张定位

| 主张 | 来源定位 | 状态 / 使用边界 |
|---|---|---|
| 2026-10-06 授奖给 Francis Halzen | P2 新闻稿正文；P8 PDF 第 1 页 | 已确认 |
| 授奖理由英文原文 | P2/P6/P8 | 已确认，字幕应保留原文 |
| Halzen 是唯一得主、奖项份额 1/1 | P1/P3 | 已确认，不添加共同得主 |
| IceCube 为约 1 km³、86 条串、每串 60 个模块、深度 1450–2450 m | P6 pp.8–9；P7 pp.3–4 | 已确认；不要把示意图比例当成真实空间比例 |
| 合作规模约 450 人、58 机构、14 国家 | P6 p.1 | 已确认；是合作团队规模，不是获奖者人数 |
| 1988 Halzen/Learned 提出深极冰方案 | P6 pp.6–7；参考文献 [12] | 已确认 |
| 2013 两个 PeV 事件与 2014 5.7σ | P6 p.11；参考文献 [23]、[25]、[26] | 已确认；不把“首个证据”说成单个点源定位 |
| 轨迹/簇射、Cherenkov 光、时间与光子数编码 | P6 pp.5、8–10 | 已确认；适合重绘动画 |
| TXS 0506+056 约 290 TeV、0.06° | P6 p.16 | 已确认；属于方向关联案例 |
| NGC 1068 79 个 1–10 TeV 中微子、4.2σ | P6 p.16 | 已确认；官方称候选点源，不能过度表述 |
| 2026 年更新银河系中微子 5.7σ | P6 pp.12–14，参考文献 [32] | 已确认出现在官方科学背景；脚本需标注“官方背景材料引用的更新结果”，并核对原论文版本 |

## D. 原始论文/合作组资料（只作为深入核对入口）

官方科学背景参考文献给出以下可追溯条目；本轮未把每篇全文下载进仓库，因此它们不应被描述成“本地全文已核验”：

- IceCube Collaboration, *Evidence for High-Energy Extraterrestrial Neutrinos at the IceCube Detector*, **Science 342 (2013) 1242856**, P6 ref. [25]。
- IceCube Collaboration, *Observation of High-Energy Astrophysical Neutrinos in Three Years of IceCube Data*, **Physical Review Letters 113 (2014) 101101**, P6 ref. [26]。
- IceCube Collaboration, *Observation of a high-energy neutrino event from the direction of the blazar TXS 0506+056*, **Science 361 (2018) eaat1378**, P6 ref. [35]。
- IceCube Collaboration, *Evidence for a diffuse flux of astrophysical muon neutrinos with the IceCube 59-string sample*, **Physical Review D 113 (2026) 062002**，P6 ref. [28]。
- IceCube Collaboration, **Physical Review Letters 136 (2026) 121002**，官方科学背景 Figure 5/6 的数据来源。

这些条目可用于论文页和来源清单，但发布前应再核对 DOI、正式标题和许可；不要仅凭新闻稿中的引用编号补写不存在的实验细节。

## E. 当前未核验/不可直接下结论的内容

1. 新闻稿和科学背景确认了项目与数据，但没有把某一颗中微子与某个具体宇宙加速器做成普遍、唯一的因果证明；脚本需使用“线索、候选源、方向关联”等措辞。
2. 官方科学背景中的 2026 论文引用和 5.7σ 更新结果应在成片前再核对原论文公开版本、发布日期和统计定义；不能把它与 2013 年发现混成同一数据集。
3. IceCube 官方示意图展示的是教学结构与事件编码，不等于每个传感器的真实地理坐标或单个事件的原始截图。重绘时必须标“示意”。
4. 任何由 Qwen/Opus 生成的南极、冰层或粒子镜头只能承担氛围与转场；数值、事件时间、能谱和公式应来自本审计表中的官方材料，并由 Remotion/Manim 程序化绘制。

