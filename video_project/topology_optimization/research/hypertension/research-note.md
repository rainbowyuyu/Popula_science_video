# 高血压形成：旁白、医学核对与片尾证据

核对日期：2026-10-06（Asia/Shanghai）。本片解释成人体循环动脉高血压的常见形成机制，不涉及肺动脉高压、颅内压或个人诊断、药物剂量。

## 锁定旁白

`story.json` 含 50 个口播片段、1313 个汉字（不含标点）。最大单段 36 字符。片段序列为：

| 场景 | 片段 | 视觉与论证 |
|---|---|---|
| intro | h001–h005 | 平静体检却发现偏高，引出身体内部的调节 |
| anatomy | h006–h010 | 真正的人体解剖、心脏、动脉树；压力作用于管壁 |
| pump | h011–h016 | 收缩/舒张、大动脉弹性回弹；心排量与阻力 |
| resistance | h017–h023 | 小动脉平滑肌收缩；等流量、不同阻力的简化对照 |
| kidney | h024–h030 | 肾小管滤液、钠水重吸收、排泄；盐敏感差异 |
| control | h031–h037 | 肾素启动的激素链、交感神经、多器官反馈 |
| remodel | h038–h044 | 大动脉僵硬、压力缓冲下降；多因素与心脑肾风险 |
| measure | h045–h050 | 可干预因素、规范测量、反复偏高就医 |
| references | 无口播 | 真实论文/指南页，模型来源，研究与方法说明 |

镜头时长必须按真实 TTS 输出与字幕对齐确定；不能先编造总时长再硬拉语音。片尾建议 8–12 秒。总片长目标约 5 分钟。

正文已冻结。h016 的“每分钟”、h031 的“由肾素启动”、h049 的“反复偏高，应及时就医”是最终措辞。若 TTS 在冻结前读过旧稿，需要单独检查这三条的文本/音频一致性。

## 已实际阅读的官方来源

1. **WHO — Hypertension（高血压事实页）**
   - URL：https://www.who.int/news-room/fact-sheets/detail/hypertension
   - 本轮 HTTP 200，实际读取正文的 Overview、Risk factors、Symptoms、Treatment、Prevention、Complications 段。
   - 支持：很多人无症状；需要规范测量确认；遗传、年龄、体重、饮食和活动等风险因素；心脑肾损害；生活方式与治疗可降低风险。
   - 本片没有引用该页患病人数，避免把不同年份的全球估算混用。

2. **NHLBI — High Blood Pressure: Causes and Risk Factors**
   - URL：https://www.nhlbi.nih.gov/health/high-blood-pressure/causes
   - 本轮 HTTP 200，实际读取 Age、Family history and genetics、Lifestyle habits、Medicines、Other medical conditions。
   - 页面标注更新：2024-04-30。
   - 支持：年龄增长时血管变厚、变硬；盐敏感差异；肥胖、睡眠呼吸暂停、肾病、某些药物的影响。

3. **NHLBI — High Blood Pressure: What Is High Blood Pressure?**
   - URL：https://www.nhlbi.nih.gov/health/high-blood-pressure
   - 本轮 HTTP 200，实际读取血压定义、收缩压/舒张压、日内变化、无症状、治疗和风险段。
   - 页面标注更新：2024-04-25。

4. **NHLBI — High Blood Pressure: Diagnosis**
   - URL：https://www.nhlbi.nih.gov/health/high-blood-pressure/diagnosis
   - 本轮 HTTP 200，实际读取测量准备、白大衣/隐匿高血压、袖带大小和重复测量段。
   - 页面标注更新：2025-06-26。
   - 支持 h047–h049：静坐至少 5 分钟、背部支撑、双脚平放、裸露上臂、手臂支撑且袖带位于心脏高度、测量时不讲话、反复测量记录。

5. **WHO — Sodium reduction（限钠事实页）**
   - URL：https://www.who.int/news-room/fact-sheets/detail/salt-reduction
   - 本轮 HTTP 200，实际读取 About sodium、Recommendations、How can you reduce your sodium intake。
   - 支持：钠参与体液平衡，过量钠与血压升高有关。
   - 区分钠与盐：2 克钠约等于 5 克食盐。正文未口播定量建议，避免出现“每日 2 克盐”的混淆。

## 已下载并读取的真实 PDF

### 机制综述（片尾主论文）

**Maaliki D, Itani MM, Itani HA. Pathophysiology and genetics of salt-sensitive hypertension. Frontiers in Physiology. 2022;13:1001434.**

- DOI：https://doi.org/10.3389/fphys.2022.1001434
- 公开原始 PDF：https://www.frontiersin.org/articles/10.3389/fphys.2022.1001434/pdf
- 本轮验证 HTTP 200、`application/pdf`、文件头 `%PDF`；30 页。
- 本地：`Maaliki_2022_salt_sensitive_hypertension.pdf`。
- 已实际阅读：摘要与第 1–4 页的盐敏感差异、RAAS、醛固酮/钠重吸收、交感神经，以及第 6 页图 2 说明。
- 证据边界：这篇综述聚焦盐敏感高血压，不能推论所有高血压都有相同机制，也不能把动物研究等同于个体临床结论。该文讨论容量负荷和血管功能失调等竞争性解释；视频用“可能”“共同作用”，不声称留水是唯一原因。
- 许可：原文首页明确 CC BY。片尾必须保留作者、年份与期刊/DOI归属。
- 渲染首页：`../../public/hypertension/references/salt-mechanism-paper-page.png`，1191×1684。
- 渲染机制图页：`../../public/hypertension/references/salt-mechanism-figure-page.png`，对应原 PDF **第 6 页**，1191×1684。这里是原文页面，不是重新排版伪造论文。

### 规范测量资料（片尾第二页）

**National Heart, Lung, and Blood Institute. Self-Measured Blood Pressure. NIH Publication No. 23-HL-8201. May 2023.**

- 官方落地页：https://www.nhlbi.nih.gov/resources/self-measured-blood-pressure-fact-sheet
- 原始 PDF：https://www.nhlbi.nih.gov/sites/default/files/publications/self_measured_blood_pressure_0.pdf
- 本轮验证 HTTP 200、`application/pdf`、文件头 `%PDF`；2 页，实际读取两页全文。
- 本地：`NHLBI_self_measured_blood_pressure.pdf`。
- 渲染完整首页：`../../public/hypertension/references/measurement-page.png`，1224×1584。
- 用于规范测量演示与片尾来源，页脚机构归属保留。它是公共健康事实指南，不能误标为期刊论文。
- 其美国阈值不直接用作本片中国观众的统一诊断界线。正文不报跨指南混用的具体诊断阈值。

### 历史辅助资料（默认不进入主片尾）

**NHLBI. Your Guide to Lowering Your Blood Pressure With DASH. NIH Publication No. 06-4082. Revised April 2006.**

- 原始 PDF：https://www.nhlbi.nih.gov/files/docs/public/heart/new_dash.pdf
- 本地：`NHLBI_DASH_guide.pdf`。HTTP 200，64 页，已读取封面、版本和目录。
- 这是 2006 年的公开指南，不能作为 2026 年诊断阈值/用药方案依据；保留作背景阅读，默认不放片尾，避免年代混淆。

## 已核对存在但没有宣称全文阅读的指南/综述

1. **WHO. Guideline for the pharmacological treatment of hypertension in adults. 2021. ISBN 978-92-4-003398-6.**
   - 官方页面：https://www.who.int/publications/i/item/9789240033986
   - 页面本轮 HTTP 200，已读取文档说明并定位官方 PDF 下载链接。
   - 官方 PDF：https://iris.who.int/server/api/core/bitstreams/f062769d-f075-4a00-87af-0a2106e0bd04/content
   - 官方 PDF 本轮返回 403；不能标记为已下载或已核读全文，也不制造假论文页。本片不做个人药物选择或剂量建议。

2. **McEvoy JW et al. 2024 ESC Guidelines for the management of elevated blood pressure and hypertension. European Heart Journal. 2024;45:3912–4018.**
   - DOI：https://doi.org/10.1093/eurheartj/ehae178
   - 官方指南页：https://www.escardio.org/Guidelines/Clinical-Practice-Guidelines/Elevated-Blood-Pressure-and-Hypertension
   - 本轮官方页面 HTTP 200；Europe PMC 核实题名、作者、年份、DOI，PMID 39210715。
   - 未获得可完整读取 PDF，故不把未核实的细则写入口播。

3. **Oparil S et al. Hypertension. Nature Reviews Disease Primers. 2018;4:18014.**
   - DOI：https://doi.org/10.1038/nrdp.2018.14
   - PMCID：PMC6477925；PMID：29565029。
   - 本轮 Europe PMC 元数据与摘要已核实：遗传、环境和多系统病理生理相互作用，规范测量和生活方式干预等。
   - PMC/Europe PMC 正文或 PDF 获取受限；没有把反爬 HTML 当 PDF。片尾使用已下载、已读且 CC BY 的 Maaliki 2022 论文页代替。

## 医学表达与视觉验收重点

- 高血压不是“油脂堵住血管”的同义词。不能用单根血管被脂块完全堵塞来代表常见原发性高血压。
- 钠以溶解离子参与水盐调节；不能把盐画成结晶颗粒堆在血管或肾脏里。
- 肾脏重吸收示意应从肾小管腔流向周围血液；尿液方向应流向集合系统。示意离子粒子与水分子不要画成红细胞大小的实体结石。
- 小动脉收缩展示的是管壁平滑肌收缩、管腔缩小；大动脉僵硬展示的是顺应性下降，两者应在镜头里区分。
- h019 对照保持相同流量，较窄管道需要更大的压差。不能在改变流量和半径后仍宣称“只改变了半径”。
- h039–h040 的动脉缓冲对照应保持同一输入脉搏，较低顺应性产生更大的压力波动。压力热图和流速颜色是不同物理量，不得混用单位与图例。
- 常用关系：`MAP − CVP ≈ CO × SVR`。CO 是每分钟心排量，不是血液总量。
- 若做简化零维模型，可用 `C dP/dt = Qin − (P − Pv)/R`，写明假设、参数和输出记录。这属于机制演示，不是患者的个体血流计算或诊断结果。
- 泊肃叶关系只适用于理想圆管、稳态层流等假设；不能把 `r^-4` 当作全身动脉的精确临床规律。
- 盐敏感、交感神经、激素和血管重塑相互影响。不能暗示所有患者激素必然升高，或某一次紧张就导致慢性高血压。
- 人体模型负责解剖定位；程序化微观截面负责机制放大。片尾区分“解剖资产”和“机制示意/简化模型”，不冒充医学影像数据。
- 躯干/胸廓透明或剖切应给出空间来由；旧对象运出视野后才隐藏。心脏→主动脉→小动脉→肾动脉/肾脏保持镜头运动方向连续。
- 纸页保留原始页面比例并占满卡片，标题、作者、年份另放卡片下方。两页可有轻微叠放、视差和柔和阴影，但不要用密集小字制造“专业感”。

## 片尾建议文字

- “机制综述”下：`Maaliki · Itani · Itani / 2022`，小一级但可读的 `Frontiers in Physiology`。
- “规范测量”下：`NHLBI / 2023`，中文副题 `家庭血压测量指南`。
- 正文旁白不口播软件名，片尾另列实际使用的建模与计算工具；只有真实执行的工具才写入。
- 可用简短说明：`人体解剖资产：human-atlas（按实际许可署名）`、`血流与调节：原理示意 / 简化模型`。

## 已完成的文件检查

- `story.json` 已由 Python 解析成功，50 个 id 唯一、场景有序，单条小于 60 字。
- 3 份 PDF 都核实文件头，不是 HTML 错误页。
- 两份主片尾首页已逐张查看：标题、作者/机构、期刊/出版号清晰，页脚保留，无裁掉底部或拉伸。
- 最終字幕、音频、仿真数值和画面状态仍需主流水线按真实成片检查；本文没有虚构这些检查已通过。
