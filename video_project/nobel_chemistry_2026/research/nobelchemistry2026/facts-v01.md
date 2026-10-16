# 2026 诺贝尔化学奖事实台账

核验日期：2026-10-07（Asia/Shanghai）

## 官方资料

- Nobel Prize press release: https://www.nobelprize.org/prizes/chemistry/2026/press-release/
- Nobel Prize summary: https://www.nobelprize.org/prizes/chemistry/2026/summary/
- Nobel Prize API record: https://api.nobelprize.org/2.1/nobelPrizes?nobelPrizeYear=2026&nobelPrizeCategory=che
- Popular information: https://www.nobelprize.org/prizes/chemistry/2026/popular-information/
- Scientific background PDF: https://www.nobelprize.org/uploads/2026/10/advanced-chemistryprize2026.pdf
- Popular information PDF: https://www.nobelprize.org/uploads/2026/10/popular-chemistryprize2026.pdf

官方材料页码：Popular Information 第 2 页介绍 Pasteur 与手性；第 3 页解释 Frank 模型与不对称催化；第 4 页给出 Kagan 图 4、图 5；第 5 页说明 Soai 的 1995 年结果；第 6 页给出三轮自催化与应用。Scientific Background 第 2–3 页为问题与 Frank 模型，第 4–9 页为 Kagan 非线性效应，第 10–13 页为 Soai 反应，第 14–16 页为机制研究与边界。

## 已核实事实

- 2026 年 10 月 7 日公布，得主为 Henri B. Kagan（Université Paris-Sud, France）和 Kenso Soai（Tokyo University of Science, Japan）。
- 授奖理由：for the discovery of non-linear effects and autocatalysis in asymmetric organic synthesis。
- 参照官方 API，奖金为 12,000,000 SEK，由两位得主各分 1/2；Kagan 生于 1930 年法国 Boulogne-Billancourt，Soai 生于 1950 年日本 Hiroshima。
- Kagan 1986：发现不对称反应中的非线性效应；催化剂中 RR、RL、LL 组合的反应速率差异可使产物偏差大于催化剂偏差。官方图 4 的教学例子为催化剂 75% R、25% L，随机形成 RR 56%、RL 38%、LL 6%；若 RL 近乎不工作，产物可达约 90% R、10% L。
- Kagan 的三类早期反应包括硫醚不对称氧化、Sharpless geraniol 环氧化（正 NLE）和 L-proline 催化 Hajos–Parrish 反应（负 NLE）。这些例子来自 Scientific Background pp.5–6，视频可选其一作为机制示意。
- Soai 1995：5-pyrimidyl alkanol 自催化放大。Scientific Background 的表格给出约 5% 起始催化剂 ee，经连续反应可到 55%、87%，再趋于约 90%；Popular Information 使用约 2%→87% 的简化叙事，两者不可混成同一组实验数据。
- Soai 2003：使用极低初始偏差的 2-alkynyl-5-pyrimidyl alkanol 体系，Scientific Background 报告 0.00005% ee 起始、三轮后 >99.5%。原文另称 stereoisomeric ratio 放大约 630,000 倍；该数字不能写成 ee 的相除倍数（99.5/0.00005 不是 630,000），成片优先使用起止 ee 与三轮结果。从无外加手性物的实验还可出现 R/S 随机分叉。不要把 99.99% 当作所有条件下的固定实测值。
- Frank 1953 模型提出三条件：不对称反应；一边增强、另一边抑制；反应形成自身催化剂（自催化）。
- Pasteur 的酒石酸实验用于解释手性、对映体和偏振光旋转，不把其表述为 2026 年获奖成果。

## 机制与公式（可直接用于动画）

- 对映体过量：`ee = |R − S| / (R + S) × 100%`。`R` 与 `S` 是一对互为镜像、不能重合的构型；`ee=0` 表示外消旋，`ee=100%` 表示单一对映体。
- 线性假设：`ee_prod = ee_max × ee_ligand`。Kagan 发现高阶复合物会打破这条直线。
- 二配体模型：金属 `M` 可形成 `M L_R L_R`、`M L_R L_S`、`M L_S L_S`。若异手性复合物更不活跃，RR/SS 被优先消耗，得到正 NLE；若异手性复合物更活跃，可得到负 NLE。
- Kagan 的简化校正：`ee_prod = ee_max × ee_ligand × f`，`f = (1 + β)/(1 + gβ)`；`β` 为 meso/同手性催化剂比，`g` 为异手性与同手性复合物相对活性。公式用于解释曲线形状和机理诊断，不要把某一组 β、g 当成诺奖实验的统一常数。
- Soai 反应的教学简式：`pyrimidine-5-carbaldehyde + i-Pr₂Zn → 5-pyrimidyl alkanol`；产物锌醇盐继续催化同一加成。动画可画成“产物成为下一轮催化剂”的闭环，分子结构使用官方图 6 或论文结构，避免生成模型臆造键角。

## 机制边界

- Soai 反应是人工有机体系，也是 Frank 模型的概念验证；官方 Scientific Background 明确指出它不是生物同手性起源的完整答案，尤其不等同于水相生命化学。
- Soai 机理存在依底物和条件而异的模型：Denmark 等 2020 年提出同手性 SMS 四聚体的 floor-to-floor 配位；Trapp 等 2020 年提出瞬态锌半缩醛路径。两者都应标成“机制研究模型”，不能在旁白中说成唯一已定论结构。

## 叙事边界

- “非线性效应”与“自催化”是两个相互衔接但不同的机制；动画中分别展示。
- Soai 反应是人工体系，不能直接宣称已经复现生命起源。
- 动画中的分子、球棍、反应速率和正反馈曲线是教学重构；官方插图和科学背景 PDF 作为证据窗口保留原始图形与署名。

## 论文来源

- Puchot C.; Samuel O.; Dunach E.; Zhao S.-H.; Agami C.; Kagan H. B. “Nonlinear effects in asymmetric synthesis. Examples in asymmetric oxidations and aldolization reactions.” *J. Am. Chem. Soc.* **1986**, 108, 2353–2357. DOI: [10.1021/ja00269a036](https://doi.org/10.1021/ja00269a036).
- Soai K.; Shibata T.; Morioka H.; Choji K. “Asymmetric autocatalysis and amplification of enantiomeric excess of a chiral molecule.” *Nature* **1995**, 378, 767–768. DOI: [10.1038/378767a0](https://doi.org/10.1038/378767a0).
- Sato I.; Urabe H.; Ishiguro S.; Shibata T.; Soai K. “Amplification of Chirality from Extremely Low to Greater than 99.5% ee by Asymmetric Autocatalysis.” *Angew. Chem. Int. Ed.* **2003**, 42, 315–317. DOI: [10.1002/anie.200390105](https://doi.org/10.1002/anie.200390105).
- Girard C.; Kagan H. B. “Nonlinear Effects in Asymmetric Synthesis and Stereoselective Reactions: Ten Years of Investigation.” *Angew. Chem. Int. Ed.* **1998**, 37, 2922–2959. DOI: [10.1002/(SICI)1521-3773(19981116)37:21<2922::AID-ANIE2922>3.0.CO;2-1](https://doi.org/10.1002/(SICI)1521-3773(19981116)37:21%3C2922::AID-ANIE2922%3E3.0.CO;2-1).
- Soai K.; Shibata T.; Sato I. “Enantioselective Automultiplication of Chiral Molecules by Asymmetric Autocatalysis.” *Acc. Chem. Res.* **2000**, 33, 382–390. DOI: [10.1021/ar9900820](https://doi.org/10.1021/ar9900820).
