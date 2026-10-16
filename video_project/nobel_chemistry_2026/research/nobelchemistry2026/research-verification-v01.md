# 最终科学核验记录

核验日期：2026-10-07（Asia/Shanghai）。核验范围为官网在线页面、官方 API、实际下载的官方 PDF 与原论文元数据／公开摘要。未修改 World 或 Film 源码。

## 公告真实性与年份

已直接访问并保存以下线上资源，均返回 HTTP 200，内容明确写为 **The Nobel Prize in Chemistry 2026**，不是旧年份页面替换标题：

- [官方摘要](https://www.nobelprize.org/prizes/chemistry/2026/summary/)：Henri B. Kagan 与 Kenso Soai，各 1/2。
- [官方新闻稿](https://www.nobelprize.org/prizes/chemistry/2026/press-release/)：日期为 **7 October 2026**；引文为 “for the discovery of non-linear effects and autocatalysis in asymmetric organic synthesis”。
- [官方 API](https://api.nobelprize.org/2.1/nobelPrizes?nobelPrizeYear=2026&nobelPrizeCategory=che)：`awardYear=2026`、`dateAwarded=2026-10-07`、奖金额 12,000,000 SEK，获奖者 ID 1065 / 1066。
- [Popular Information](https://www.nobelprize.org/prizes/chemistry/2026/popular-information/) 与 [Advanced Information](https://www.nobelprize.org/prizes/chemistry/2026/advanced-information/)：同样对应 2026 两位得主和同一机制主题。

抓取证据保存在 `official/official-*-2026.*`；HTTP 状态、字节数和 SHA-256 见 `official/verification-fetch-v01.json`。实际下载 PDF 已用 `pdftotext` 提取并检查：Press 2 页、Popular 7 页、Advanced 21 页正文页码（文件包含封面）。

## 稿件关键数值

| 数字 | 实际来源与范围 | 成片规则 |
|---|---|---|
| 2% → 87% | Official Popular Information p.5 描述 1995 年实验；Nature 原论文公开摘要明确起始 2% ee，公开摘要未写 87% | 可口播，来源应指向官方科普背景，不称已核验 Nature 全文表格 |
| 5% →55%→87%→约90% | Official Scientific Background pp.11–12，Fig.7 Entries 1–5 对 1995 年连续反应的说明 | 属于另一套明示实验叙述，不和 2% 起点拼成一组 |
| 0.00005% →57%→99%→>99.5% | Official Popular Figure 6 / p.6，三轮反应，轮间补充底物与试剂；Scientific Background p.12 Fig.7 Entries 6–8，引用 Sato et al. 2003 | 本片重点数值可用这一组，明确是 ee，不能写成一般化“纯度” |
| 630,000 | Official Scientific Background p.12 原文称 “amplification of the stereoisomeric ratio by a factor of 630,000” | 不能称为 ee 的倍数；因 99.5/0.00005 不等于 630,000，成片优先删去倍数，只保留起止 ee 与三轮 |
| 无外加手性物的实验 | Scientific Background p.13：37 次实验，18 次偏 R、19 次偏 S，ee 为 15–91%，Soai et al. Tetrahedron: Asymmetry 2003,14,185–188 | 这一组与极低手性引发物的 0.00005% 实验有区别，不要把两组数据拼成同一实验 |
| 99.99% | Popular p.6 的概括性描述 | 不应在 2003 无外加手性物的固定数值段中写成统一确定的输出。建议 result 口播改用已追到 Fig.6 的 >99.5% ee |

## 原论文与图号核验状态

- **Puchot et al. JACS 1986, 108, 2353–2357**, DOI `10.1021/ja00269a036`：Crossref 核验题名、作者、卷页和年份；ACS 页面本次返回 403，未取得全文。Kagan 非线性曲线引用官方 Scientific Background Fig.2b（p.6）和 Popular Fig.5（p.5），均明确说明取自此论文；不能声称已逐图核验 JACS 全文。
- **Soai et al. Nature 1995, 378, 767–768**, DOI `10.1038/378767a0`：Nature 原始页面可访问，公开摘要与作者／发表信息已读取并保存 `official/soai1995-nature-page.*`；原页注明 subscription preview，因此未取得全文 PDF 或原论文内部图号。摘要确认 5-pyrimidyl alkanol、2% initial ee、diisopropylzinc 和 pyrimidine-5-carboxaldehyde。实际动画结构与连续反应数值参照官方 Scientific Background Fig.7 和 Popular Fig.6。
- **Sato et al. Angew. Chem. Int. Ed. 2003, 42, 315–317**, DOI `10.1002/anie.200390105`：Crossref 核验准确题名 “Amplification of Chirality from Extremely Low to Greater than 99.5% ee by Asymmetric Autocatalysis”、作者和卷页；Wiley 页面本次返回 403，未取得全文或原图。0.00005%→>99.5% 的直接内容依据是官方 Scientific Background p.12 / Fig.7 与 Popular Fig.6。
- 目前交付素材中的 Figure 2/3/4/6 是 **Nobel 官方科普图号**，不是原论文图号。画面标签应写 “Nobel 官方图示”，避免使用“原论文 Figure 4/6”。

## 科学边界

- 正 NLE 的图应在同一坐标定义下位于线性基准之上；`ee_ligand` 为横轴，`ee_product` 为纵轴。正 NLE 不等于所有不对称反应都放大，官方同时给出负 NLE。
- ee 是对映体过量，不等于主要对映体的摩尔百分比；如 99.5% ee 对应 99.75:0.25 的主要／次要对映体比例（若仅有这一对对映体）。
- R/S 构型不能只用颜色区分，动画需保留四面体空间手性或官方结构式；R 与 S 不应被一条平面五边形镜像假装为真实分子。
- “生命只选一边”是科普概括：蛋白质中的标准氨基酸通常为 L 型（甘氨酸无手性），DNA/RNA 糖属于 D 系列；L/D 与左旋/右旋不等价。不要说“所有氨基酸都向左转偏振光”。
- Soai 反应是人工体系、重要概念验证；不能称已证明生命起源的唯一途径。各条件下的 SMS 四聚体或锌半缩醛路径仍有不同机理模型。

## 官方图使用范围

新闻稿实际文字：**“The illustrations are free to use for non-commercial purposes. Attribute copyright ©Johan Jarnestad/The Royal Swedish Academy of Sciences.”**

- 本项目应保留该署名，不能把官方图授权扩展为任意商业使用。
- 现有整图副本可用于内部研究、预览和非商业教育用途；若发布平台变现或商业化，应核实授权或以自行重绘机制为主体，短暂引用原图仍需依适用版权规则判断。
- 诺奖头像插画另署名 Niklas Elmehed / Nobel Prize Outreach，不等同于这 5 张 Johan Jarnestad 图的使用条件。

## 建议口播调整

result 段建议：

> 后来的实验把起点压得更低：对映体过量只有百分之零点零零零零五。补充原料，连续做三轮，这个偏差最终超过百分之九十九点五。一个小得几乎看不见的优势，真的能被化学反应层层放大。

chance 段可补：

> 如果连这点人为的手性偏向也不加入，重复实验有时偏向右手，有时偏向左手。细小的随机波动，被同一套机制放大成不同结局。

这两段保持“极低引发偏差”和“无外加手性”实验的边界，同时自然衔接。
