# V3 GLP-1研究证据与尺度依据

更新：2026-10-08T11:42:02.298483+00:00。脚本SHA256：`b9998dd5631ef97ef1c63d4ae12c11f0102d8da80b07bf8fef85295e5d69d7ee`。

48句与section区间保持一致。候选为1534汉字，配音时长粗估348秒；必须用新音频实测。

## 必须保留的实验因果

1987年Mojsov等：在6.6mM葡萄糖背景下，向离体灌流大鼠胰腺给予合成GLP-1(1–37)或GLP-1(7–37)。短肽在很低浓度有效，长肽在测试范围内无效。这是活性形式的比较，不能伪造成同剂量/等时逐点数据，也不等同于后来的DPP4失活。

1987年Drucker等：培养大鼠胰岛瘤细胞中的短肽提高cAMP、胰岛素mRNA与释放。可把cAMP译成“内部传信分子”、mRNA译成“制造胰岛素的分子指令”，画面保留科学名词。2017受体结构只能作为后来的机制解释。

1993年Mentlein等：纯化DPP4和人血清都生成N端切去His-Ala的片段；加入特异抑制剂后生成被阻止。这比单纯展示剪刀更能讲清研究者如何识别降解原因。

2015司美格鲁肽原摘要与2019开发综述：Aib8保护切点，Arg34与Lys26修饰不能遗漏；脂肪二酸链及连接臂反复筛选，既要较强白蛋白结合又要保留GLP1R活性。C18脂肪二酸与γGlu-2×OEG是选出的组合。2015迷你猪46.1小时不充当人体一周依据，人体一周取官方说明书。

1996年Turton等：大鼠脑室GLP1抑制进食，受体拮抗剂阻断效应。药物在人中的食欲和摄入效应由2021年72人、20周随机试验支持，不能混成同一层级。

## 尺度约定

| 层级 | 镜头使用值 | 依据与限制 |
|---|---:|---|
| 胰岛 | 150 μm | IEQ标准球体/选取示意实例，不是全部人胰岛平均值 |
| β细胞 | 15 μm | 综述13–18 μm量级；上游直径引用含小鼠，不称人专属精确均值 |
| 质膜厚度 | 5 nm | 教材5–10 nm内的示意值，不是β细胞专属实测 |
| 受体R链 | 高约10.63 nm，横向约4.76×4.81 nm | 5VAI全ATOM坐标按已用旋转方向包围盒测量 |
| GLP1配体P链 | 约1.80×3.74×3.03 nm | 结合态沉积坐标，不是溶液中固定外形 |

150 μm→15 μm约10倍；15 μm→10.63 nm约1411倍。细胞全景中不能把受体做成细胞直径三分之一；放大镜头切换/比例尺必须解释尺度变化。人胰岛应参照人类混杂细胞结构，不能照搬典型鼠中心β、外围α布局。

## 临床数据边界

- **step1**：1961名无糖尿病的成年人；BMI≥30或≥27且有至少一种体重相关合并症；2.4 mg/周皮下注射或安慰剂；两组均生活方式干预。数字来自主要治疗政策估计量，不能与停药延伸子集17.3%混用。
- **select**：17604人，≥45岁，有既往心血管病，BMI≥27，无糖尿病；2.4 mg/周；平均随访39.8个月；复合终点为心血管死亡、非致死心梗或非致死卒中；1.5个百分点是原始事件比例差；20%对应HR，不是所有人绝对获益20%。
- **withdrawal**：延伸分析327人；第68周停药且结束研究生活方式干预，随后随访52周；探索性延伸研究；原药物组平均回升11.6个百分点，仍比原基线低5.6%；不能说所有人必然完全反弹。
- **appetite_semaglutide**：72名肥胖成人、20周、2.4mg每周与安慰剂；主观食欲和自由进食能量下降；20周用对乙酰氨基酚间接方法未见胃排空延迟。

## 本轮来源与实际阅读范围

### afp2026

[Research into weight-loss drugs tipped for Nobel as award week opens](https://www.tbsnews.net/world/research-weight-loss-drugs-tipped-nobel-award-week-opens-1562861)

V3重新HTTP200读取新闻全文中的预测与Pendlebury引述。

媒体专家预测，不是官方提名或评委理由。

### appetite_semaglutide

[The effect of semaglutide 2.4 mg once weekly on energy intake, appetite, control of eating, and gastric emptying in adults with obesity.](https://doi.org/10.1111/dom.14280)

V3本轮重新读取原始摘要。

72名肥胖成人、20周、2.4mg每周与安慰剂；主观食欲和自由进食能量下降；20周用对乙酰氨基酚间接方法未见胃排空延迟。

### cabrera2006

[The unique cytoarchitecture of human pancreatic islets has implications for islet cell function.](https://pmc.ncbi.nlm.nih.gov/articles/PMC1413730/)

EuropePMC XML500后，PMC HTML200；实际读取原始全文摘要、结果、人鼠形态对比图说明。

模型需标教学示意；不能据一篇研究声称所有人胰岛都完全随机分布。

### deacon1995

[Degradation of glucagon-like peptide-1 by human plasma in vitro yields an N-terminally truncated peptide that is a major endogenous metabolite in vivo.](https://doi.org/10.1210/jcem.80.3.7883856)

本轮实际在线检索并读取原始摘要。

摘要体外人血浆20.4分钟不可当作体内天然活性肽1–2分钟半衰期。

### drucker1987

[Glucagon-like peptide I stimulates insulin gene expression and increases cyclic AMP levels in a rat islet cell line.](https://doi.org/10.1073/pnas.84.10.3434)

V3本轮读取EuropePMC原始摘要；培养大鼠胰岛瘤细胞cAMP、胰岛素mRNA与释放。

培养大鼠胰岛瘤细胞中的机制结果，不能把细胞水平证据直接当作人体疗效。

### eec2022

[Enteroendocrine System and Gut Barrier in Metabolic Disorders](https://doi.org/10.3390/ijms23073732)

复用本项目此前已核验的来源与原始记录；本轮不声称重新完整阅读。

实际阅读肠内分泌细胞形态和L细胞肽分泌段；基底极小泡的形态依据与Müller2019循环分泌依据共同支持朝间质/血管方向，不能把L细胞分泌画向肠腔。

### huang2018

[The Flaws and Future of Islet Volume Measurements.](https://doi.org/10.1177/0963689718779898)

本轮取得开放全文并阅读胰岛直径、IEQ定义与Table1附近段落。

150μm是用于镜头的选定示意实例，不称所有人体胰岛真实大小。原文某调查人数/男女数有内部不一致，此处不引用该人数。

### knudsen2019

[The Discovery and Development of Liraglutide and Semaglutide.](https://doi.org/10.3389/fendo.2019.00155)

本轮取得开放全文XML，定向阅读天然半衰期、Ala扫描、Aib8、白蛋白结合与司美格鲁肽侧链筛选章节和图3说明。

药物研发者撰写的综述；系统筛选细节与Lau2015原始摘要交叉核对。不是本轮已读取2015全文的声明。

### lasker2024

[GLP-1-based therapy for obesity — 2024 Lasker~DeBakey Clinical Medical Research Award](https://laskerfoundation.org/winners/glp-1-based-therapy-for-obesity/)

V3在线403；明确复用并重新阅读V1已成功归档全文中的1964、Mojsov/Weir/Drucker及开发段落。

通俗历史叙事来源，实验数值以原论文为准；不新增伪造对白。

### membrane_openstax

[Biology 2e, 5.1 Components and Structure](https://openstax.org/books/biology-2e/pages/5-1-components-and-structure)

本轮HTTP200并实际读取质膜厚度段。

5nm为用于镜头的教学参考厚度，不是当前β细胞标本的专属测量；膜蛋白/glycocalyx外部延伸不属于双层核心厚度。

### mentlein1993

[Dipeptidyl-peptidase IV hydrolyses gastric inhibitory polypeptide, glucagon-like peptide-1(7-36)amide, peptide histidine methionine and is responsible for their degradation in human serum.](https://doi.org/10.1111/j.1432-1033.1993.tb17986.x)

本轮实际在线检索、读取原始论文摘要；未取全文。

体外人血清与纯化酶实验，不能说1993人体治疗成功。

### mojsov1987

[Insulinotropin: glucagon-like peptide I (7-37) co-encoded in the glucagon gene is a potent stimulator of insulin release in the perfused rat pancreas.](https://doi.org/10.1172/jci112855)

V3本轮JCI原刊网页HTTP200，实际阅读原始摘要。

口播短肽有效/长肽无效只限该实验；不是普遍认定长肽在所有体系绝对无效，不宣称两肽测试剂量相同。

### muller2019

[Glucagon-like peptide 1 (GLP-1)](https://doi.org/10.1016/j.molmet.2019.09.010)

复用本项目此前已核验的来源与原始记录；本轮不声称重新完整阅读。

综述全文下载；实际阅读L细胞刺激-分泌与β细胞cAMP/PKA/Epac、颗粒胞吐段及Figure 6图题。支持机制示意，不表示此动画直接记录真实分子运动。

### nauck1986

[Incretin effects of increasing glucose loads in man calculated from venous insulin and C-peptide responses.](https://doi.org/10.1210/jcem-63-2-492)

本轮实际在线检索并读取原始摘要。

相近血糖而非简单同剂量；外周胰岛素受肝清除影响，论文也分析C肽和计算分泌率。g010只讲定性结果。

### nobel2026

[Press release: Nobel Prize in Physiology or Medicine 2026](https://www.nobelprize.org/prizes/medicine/2026/press-release/)

复用本项目此前已核验的来源与原始记录；本轮不声称重新完整阅读。

2026-10-05公布，Karl Deisseroth、Peter Hegemann、Georg Nagel；只可证明本届医学奖结果，不能证明GLP-1已被提名或进入决选。

### pdb5vai_scale

[RCSB PDB 5VAI deposited atom coordinates](https://files.rcsb.org/download/5VAI.pdb)

本轮重新下载PDB并对所有ATOM坐标按链测量，使用已保距的显示旋转矩阵。

PDB使用Å，除10为nm；这是方向依赖的沉积原子坐标范围，不是流体动力半径或完整缺失残基。R受体兔来源、P配体人来源；配体/受体结合态为2017结构，非1987实测动画。

### receptor2017

[Cryo-EM structure of the activated GLP-1 receptor in complex with a G protein.](https://doi.org/10.1038/nature22394)

V3重新获取全文XML并阅读摘要、7TM/NTD结构和兔受体方法。

2017冷冻电镜实验结构，受体与配体结合把信号耦联到Gs蛋白；5VAI的GLP-1R来自兔，GLP-1配体来自人；图像仅用作机制结构参考。

### rorsman2018

[Pancreatic β-Cell Electrical Activity and Insulin Secretion: Of Mice and Men.](https://pmc.ncbi.nlm.nih.gov/articles/PMC5866358/)

EuropePMC全文XML500后，PMC HTML200；实际读取形态学、细胞直径、颗粒胞吐与膜电容相关段落。

13–18μm概括段落的原始引用221是小鼠完整胰岛电生理论文；所以15μm是合理教学代表值，不标成人β细胞专属实测均值。人细胞有大小/形态差异。

### select

[Semaglutide and Cardiovascular Outcomes in Obesity without Diabetes.](https://doi.org/10.1056/nejmoa2307563)

复用本项目此前已核验的来源与原始记录；本轮不声称重新完整阅读。

17604人，≥45岁，有既往心血管病，BMI≥27，无糖尿病；2.4 mg/周；平均随访39.8个月；复合终点为心血管死亡、非致死心梗或非致死卒中；1.5个百分点是原始事件比例差；20%对应HR，不是所有人绝对获益20%。

### semaglutide2015

[Discovery of the Once-Weekly Glucagon-Like Peptide-1 (GLP-1) Analogue Semaglutide.](https://doi.org/10.1021/acs.jmedchem.5b00726)

V3本轮实际读取原论文摘要；系统侧链筛选细节另由开发者2019开放全文补充。

Aib8、Arg34、Lys26侧链修饰；原摘要46.1小时是迷你猪IV，不是人体1周依据。

### step1

[Once-Weekly Semaglutide in Adults with Overweight or Obesity.](https://doi.org/10.1056/nejmoa2032183)

复用本项目此前已核验的来源与原始记录；本轮不声称重新完整阅读。

1961名无糖尿病的成年人；BMI≥30或≥27且有至少一种体重相关合并症；2.4 mg/周皮下注射或安慰剂；两组均生活方式干预。数字来自主要治疗政策估计量，不能与停药延伸子集17.3%混用。

### turton1996

[A role for glucagon-like peptide-1 in the central regulation of feeding.](https://doi.org/10.1038/379069a0)

本轮在线DOI精确检索并读取原始摘要。

大鼠脑室给药实验，不能画成人体药物注射进脑，也不能证明所有肠源GLP1自由进入大脑。

### wegovy_pi

[WEGOVY (semaglutide) US Prescribing Information](https://www.novo-pi.com/wegovy.pdf)

复用本项目此前已核验的来源与原始记录；本轮不声称重新完整阅读。

第11节分子结构与白蛋白结合；12.2节葡萄糖依赖性胰岛素/胰高血糖素和胃排空；12.3节约一周消除半衰期；胃肠道反应/禁忌等遵循完整说明书，不提供用药方案。

### withdrawal

[Weight regain and cardiometabolic effects after withdrawal of semaglutide: The STEP 1 trial extension.](https://doi.org/10.1111/dom.14725)

复用本项目此前已核验的来源与原始记录；本轮不声称重新完整阅读。

延伸分析327人；第68周停药且结束研究生活方式干预，随后随访52周；探索性延伸研究；原药物组平均回升11.6个百分点，仍比原基线低5.6%；不能说所有人必然完全反弹。

## 完整逐句映射

见 `evidence.json.shotEvidence` 与 `story-v3-readable.md`。原始下载、查询、失败状态和文件哈希分别保留在 `retrieval-log.json`、`search-log.json` 与 `raw/`。

## 未完成/不适用

- 未把当前静态结构当成MD轨迹；未做新的动物或人体实验。
- 迷走神经、食管、血管的三维位置由解剖实现流程负责；此处不声明已经几何验收。
- 本轮锁定稿之外未改 `docs/story.json`、src或音频。
