# 013 文献段：真实 PDF 证据素材

来源为诺奖委员会 **2026 年化学奖 Scientific Background** 的实际 PDF。这里没有取得 JACS 1986、Nature 1995 或 Angewandte 2003 的完整原论文；不得把这些页面标注为原论文页面。

文件源：`research/nobelchemistry2026/originals/advanced-chemistryprize2026.pdf`

官方链接：https://www.nobelprize.org/uploads/2026/10/advanced-chemistryprize2026.pdf

源标题：*Non-linear effects and autocatalysis in asymmetric organic synthesis*

来源署名：The Nobel Committee for Chemistry / The Royal Swedish Academy of Sciences, 2026。

所有 JPEG 由 PyMuPDF 3×、RGB、97 质量、无色度抽样渲染。`page` 为完整未修改页面，`focus/detail` 为纯裁切，无改字、描图或增强。PDF 页号、印刷页码、裁切矩形（PDF point）和哈希见 `research/nobelchemistry2026/pdf-evidence-manifest-v01.json`。

| 内容 | 原页 | 主聚焦 | 额外细节 | 建议屏幕标题 |
|---|---|---|---|---|
| Kagan 1986 | `pdf-kagan1986-page.jpg` | `pdf-kagan1986-focus.jpg` | `pdf-kagan1986-detail.jpg` | Kagan 团队 · 非线性效应，1986 |
| Soai 1995 | `pdf-soai1995-page.jpg` | `pdf-soai1995-focus.jpg` | `pdf-soai1995-detail.jpg` | Soai 团队 · 自催化与手性放大，1995 |
| Sato / Soai 2003 | `pdf-soai2003-page.jpg` | `pdf-soai2003-focus.jpg` | `pdf-soai2003-detail.jpg` | Sato 与 Soai 团队 · 三轮放大，2003 |

以上图均在 `public/papers-v01/`。

- Kagan：实际 PDF 第 7 页、印刷页 6，Figure 2。左为线性/负/正 NLE 曲线，右侧为 geraniol Sharpless 环氧化；曲线图注明引自 reference 20（Puchot et al., JACS 1986）。右侧旧曲线在源 PDF 中就是低分辨率嵌入图；不要将 `detail` 铺满 1080p，建议最高显示约 500 px 宽。
- Soai 1995：实际 PDF 第 13 页、印刷页 12，Figure 7 反应式和表格前五行。此处表格讲的是 5%→55→87→88→90→90% ee 那组反应。正式稿中 2%→87% 引用的是官方科普背景和 Nature 1995 公开摘要，不要在此裁图上添加 2% 标签。
- Soai 2003：与上项同页，Figure 7 表格第 6–8 行。第 6 行 0.00005%→57%，第 7 行 57%→99%，第 8 行 99%→>99.5%。`detail` 保留完整表头与八行，为保证文献语境不伪造拆表；可用舞台聚焦框依次强调第 6、7、8 行。

成片来源建议两行：

> Non-linear effects and autocatalysis in asymmetric organic synthesis
>
> Nobel Committee for Chemistry · 2026 · pp.6, 12

在屏幕标题或出处旁补“诺奖科学背景整理”即可；不需用长段审查说明影响口播。论文原始题名可放在配套资料和片尾目录。

## corrected 旁白科学审核

审核 `docs/v01/narration-v01.json`，版本 `nobel-chemistry-2026-v01-corrected`：主要事实通过。需最后协调两点：

1. `011`：“百分之九十九点五的过量，对应优势一边超过百分之九十九点七五”应补前一个“超过”。严格关系为 major fraction = (1 + ee)/2；99.5% ee 对应恰好 99.75%，>99.5% ee 对应 >99.75%。已通知主代理及音频工作流。
2. `006`：“四份配体三份右、一份左”应理解为大配体池的 75/25 比例；56/38/6 来自独立随机配对，不是仅 4 个分子的无放回分组。建议稿件为“配体池里，四分之三是右手，四分之一是左手”，动画使用大量配体与比例，不把 3R+1S 直接画出 SS。

其余四面体手性、1848 年 Pasteur、L/D 与旋光方向区别、Frank 模型、1986 NLE、1995 自催化、37 次独立反应中 18R/19S、2003 三轮极小偏差、研究意义与生命起源边界均与本轮官方资料核验相符。
