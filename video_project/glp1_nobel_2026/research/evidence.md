# GLP-1 科普视频证据核验

核验日期：2026-10-08。当前口播 48 镜头，1389 汉字。

实际HTTP请求：NobelPrize.org、Lasker Foundation、RCSB PDB、Europe PMC原始论文元数据、官方药品说明书和开放全文；各请求记录URL、时间、响应和SHA-256。学术搜索MCP未挂载，使用公开HTTP端点。

## 关键边界

- “诺奖落选”只表达2026年未获本届医学奖；没有公开提名或决选名单证据。
- GLP-1的生理信号、GLP-1受体激动剂、GIP/GLP-1双受体激动剂分开表述。
- 不画药物直接融脂；不把所有肠源GLP-1画成自由穿过血脑屏障。
- 5VAI为混合来源实验复合物，其中GLP-1R为兔源；配体为人源。
- STEP 1、SELECT和停药延伸研究均保留对应人群、时间、剂量和干预条件。

## 来源

### mojsov1987
**Insulinotropin: glucagon-like peptide I (7-37) co-encoded in the glucagon gene is a potent stimulator of insulin release in the perfused rat pancreas.**
Mojsov S, Weir GC, Habener JF. · 1987
来源：https://doi.org/10.1172/jci112855
检索：2026-10-08T03:22:14.209092+00:00
核对片段：GLP-I(7-37) is a potent stimulator of insulin secretion
适用范围：离体灌流大鼠胰腺；37位长肽与活性31位片段的功能差别。

### holst1987
**Truncated glucagon-like peptide I, an insulin-releasing hormone from the distal gut.**
Holst JJ, Orskov C, Nielsen OV, Schwartz TW. · 1987
来源：https://doi.org/10.1016/0014-5793(87)81430-8
检索：2026-10-08T03:22:14.251822+00:00
核对片段：Natural and synthetic proglucagon 78-107 dose dependently and potently increased insulin secretion
适用范围：猪肠黏膜分离活性片段；离体灌流猪胰腺，不能表述为1987年人体减肥试验。

### drucker1987
**Glucagon-like peptide I stimulates insulin gene expression and increases cyclic AMP levels in a rat islet cell line.**
Drucker DJ, Philippe J, Mojsov S, Chick WL, Habener JF. · 1987
来源：https://doi.org/10.1073/pnas.84.10.3434
检索：2026-10-08T03:22:14.659807+00:00
核对片段：potently increases cAMP levels, insulin mRNA transcripts, and insulin release
适用范围：培养大鼠胰岛瘤细胞中的机制结果，不能把细胞水平证据直接当作人体疗效。

### semaglutide2015
**Discovery of the Once-Weekly Glucagon-Like Peptide-1 (GLP-1) Analogue Semaglutide.**
Lau J, Bloch P, Schäffer L, Pettersson I, Spetzler J, Kofoed J, Madsen K, Knudsen LB, McGuire J, Steensgaard DB, Strauss HM, Gram DX, Knudsen SM, Nielsen FS, Thygesen P, Reedtz-Runge S, Kruse T. · 2015
来源：https://doi.org/10.1021/acs.jmedchem.5b00726
检索：2026-10-08T03:22:14.693988+00:00
核对片段：two amino acid substitutions compared to human GLP-1 (Aib(8), Arg(34))
适用范围：Aib8帮助抵抗DPP-4，Lys26连接脂肪二酸链增加白蛋白亲和；文中迷你猪半衰期不是人体一周半衰期的依据。

### step1
**Once-Weekly Semaglutide in Adults with Overweight or Obesity.**
Wilding JPH, Batterham RL, Calanna S, Davies M, Van Gaal LF, Lingvay I, McGowan BM, Rosenstock J, Tran MTD, Wadden TA, Wharton S, Yokote K, Zeuthen N, Kushner RF, STEP 1 Study Group. · 2021
来源：https://doi.org/10.1056/nejmoa2032183
检索：2026-10-08T03:22:14.707013+00:00
核对片段：−14.9% versus −2.4% at week 68
适用范围：1961名无糖尿病的成年人；BMI≥30或≥27且有至少一种体重相关合并症；2.4 mg/周皮下注射或安慰剂；两组均生活方式干预。数字来自主要治疗政策估计量，不能与停药延伸子集17.3%混用。

### select
**Semaglutide and Cardiovascular Outcomes in Obesity without Diabetes.**
Lincoff AM, Brown-Frandsen K, Colhoun HM, Deanfield J, Emerson SS, Esbjerg S, Hardt-Lindberg S, Hovingh GK, Kahn SE, Kushner RF, Lingvay I, Oral TK, Michelsen MM, Plutzky J, Tornøe CW, Ryan DH, SELECT Trial Investigators. · 2023
来源：https://doi.org/10.1056/nejmoa2307563
检索：2026-10-08T03:22:14.792806+00:00
核对片段：6.5% versus 8.0%; hazard ratio, 0.80
适用范围：17604人，≥45岁，有既往心血管病，BMI≥27，无糖尿病；2.4 mg/周；平均随访39.8个月；复合终点为心血管死亡、非致死心梗或非致死卒中；1.5个百分点是原始事件比例差；20%对应HR，不是所有人绝对获益20%。

### withdrawal
**Weight regain and cardiometabolic effects after withdrawal of semaglutide: The STEP 1 trial extension.**
Wilding JPH, Batterham RL, Davies M, Van Gaal LF, Kandler K, Konakli K, Lingvay I, McGowan BM, Oral TK, Rosenstock J, Wadden TA, Wharton S, Yokote K, Kushner RF, STEP 1 Study Group. · 2022
来源：https://doi.org/10.1111/dom.14725
检索：2026-10-08T03:22:15.713955+00:00
核对片段：participants regained two-thirds of their prior weight loss
适用范围：延伸分析327人；第68周停药且结束研究生活方式干预，随后随访52周；探索性延伸研究；原药物组平均回升11.6个百分点，仍比原基线低5.6%；不能说所有人必然完全反弹。

### receptor2017
**Cryo-EM structure of the activated GLP-1 receptor in complex with a G protein.**
Zhang Y, Sun B, Feng D, Hu H, Chu M, Qu Q, Tarrasch JT, Li S, Sun Kobilka T, Kobilka BK, Skiniotis G. · 2017
来源：https://doi.org/10.1038/nature22394
检索：2026-10-08T03:22:15.765833+00:00
核对片段：Conformational changes in the transmembrane domain
适用范围：2017冷冻电镜实验结构，受体与配体结合把信号耦联到Gs蛋白；5VAI的GLP-1R来自兔，GLP-1配体来自人；图像仅用作机制结构参考。

### mechanisms2018
**Mechanisms of Action and Therapeutic Application of Glucagon-like Peptide-1.**
Drucker DJ. · 2018
来源：https://doi.org/10.1016/j.cmet.2018.03.001
检索：2026-10-08T03:22:16.368057+00:00
核对片段：augmentation of insulin and inhibition of glucagon secretion
适用范围：综述同时讨论内源GLP-1和药理GLP-1的不同作用路径；禁止把所有外周GLP-1画成自由穿过血脑屏障的单一路径。

### native_half_life
**The physiology of glucagon-like peptide 1.**
Holst JJ. · 2007
来源：https://doi.org/10.1152/physrev.00034.2006
检索：2026-10-08T03:22:16.410279+00:00
核对片段：released in response to meal intake
适用范围：选择Holst 2007 Physiological Reviews，而非检索结果中标题相似的预印本；支持肠道L细胞、DPP-4代谢、胰岛和食欲效应。

### appetite_semaglutide
**The effect of semaglutide 2.4 mg once weekly on energy intake, appetite, control of eating, and gastric emptying in adults with obesity.**
Friedrichsen M, Breitschaft A, Tadayon S, Wizert A, Skovgaard D. · 2021
来源：https://doi.org/10.1111/dom.14280
检索：2026-10-08T03:22:16.412395+00:00
核对片段：suppressed appetite, improved control of eating, and reduced food cravings
适用范围：72人、20周的随机试验；自由进食能量摄入降低；该研究在20周用间接方法未发现胃排空延迟证据，故不把长期减重归结为持续胃潴留。

### half_life_review
**The Discovery and Development of Liraglutide and Semaglutide.**
Knudsen LB, Lau J. · 2019
来源：https://doi.org/10.3389/fendo.2019.00155
检索：2026-10-08T03:25:36.690865+00:00
核对片段：short half-life (1.5 min following intravenous dosing
适用范围：全文The Discovery of Liraglutide段明确1.5分钟静脉给药、1.5小时皮下给药；口播限定进入循环后的活性肽，避免与司美格鲁肽约一周半衰期混淆。

### tirzepatide2022
**Tirzepatide Once Weekly for the Treatment of Obesity.**
Jastreboff AM, Aronne LJ, Ahmad NN, Wharton S, Connery L, Alves B, Kiyosue A, Zhang S, Liu B, Bunck MC, Stefanski A, SURMOUNT-1 Investigators. · 2022
来源：https://doi.org/10.1056/nejmoa2206038
检索：2026-10-08T03:25:36.697235+00:00
核对片段：glucose-dependent insulinotropic polypeptide and glucagon-like peptide-1 receptor agonist
适用范围：精确取Jastreboff等原始NEJM试验PMID35658024，排除同名读者来信；只用于双受体分类，不把它的体重结果归给司美格鲁肽。

### nobel2026
**Press release: Nobel Prize in Physiology or Medicine 2026**
Nobel Assembly / NobelPrize.org · 2026
来源：https://www.nobelprize.org/prizes/medicine/2026/press-release/
检索：2026-10-08T03:22:13.095078+00:00
核对片段：for their discoveries concerning light-gated ion channels and optogenetics
适用范围：2026-10-05公布，Karl Deisseroth、Peter Hegemann、Georg Nagel；只可证明本届医学奖结果，不能证明GLP-1已被提名或进入决选。

### nobel_nomination
**Nomination and selection of Nobel Prize laureates in physiology or medicine**
NobelPrize.org · 当前官方资料
来源：https://www.nobelprize.org/nomination/medicine/
检索：2026-10-08T03:22:13.095585+00:00
核对片段：cannot be revealed until 50 years later
适用范围：提名及评审信息保密50年；不可捏造候选名单、评委分歧或落选原因。

### lasker2024
**GLP-1-based therapy for obesity — 2024 Lasker~DeBakey Clinical Medical Research Award**
Lasker Foundation · 2024
来源：https://laskerfoundation.org/winners/glp-1-based-therapy-for-obesity/
检索：2026-10-08T03:22:13.095841+00:00
核对片段：For the discovery and development of GLP-1-based drugs
适用范围：2024临床医学奖三人：Joel Habener、Svetlana Mojsov、Lotte Bjerre Knudsen；不得把其他贡献者说成当年该奖得主。

### pdb5vai
**5VAI: Cryo-EM structure of the activated GLP-1 receptor in complex with G protein**
RCSB PDB · 2017
来源：https://www.rcsb.org/structure/5VAI
检索：2026-10-08T03:22:13.096166+00:00
核对片段：Resolution: 4.10 Å
适用范围：实验结构；GLP-1R兔源、GLP-1人源；真实坐标可用于结构重绘，但后续运动为教学动画。

### wegovy_pi
**WEGOVY (semaglutide) US Prescribing Information**
Novo Nordisk official prescribing information · 当前官方资料
来源：https://www.novo-pi.com/wegovy.pdf
检索：2026-10-08T03:22:13.096877+00:00
核对片段：Semaglutide decreases calorie intake. The effects are likely mediated by affecting appetite.
适用范围：第11节分子结构与白蛋白结合；12.2节葡萄糖依赖性胰岛素/胰高血糖素和胃排空；12.3节约一周消除半衰期；胃肠道反应/禁忌等遵循完整说明书，不提供用药方案。

## 逐镜头证据

| 镜头 | 口播 | 来源 | 核验边界 |
|---|---|---|---|
| g001 | 吃完一顿热腾腾的晚饭，你明明已经很饱，却还是伸手拿了块点心。 | 生活情境 | 虚构的普遍生活情境，不声称来自某位患者或真实试验。 |
| g002 | 有时候相反，饭只吃到一半，你就自然放下了筷子。 | 生活情境 | 虚构的普遍生活情境；个体饱腹与食欲受多因素影响。 |
| g003 | 饱和想吃，为什么并不总是一回事，答案要从餐桌一路追进身体。 | mechanisms2018 | 用于提问和过渡；GLP-1是食欲调节的一部分，不能解释一切。 |
| g004 | 一条叫胰高血糖素样肽一的信号，正在改变我们对食欲和肥胖的理解。 | mechanisms2018, lasker2024 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g005 | 它今年没有获得诺贝尔医学奖，奖项颁给了光遗传学的奠基工作。 | nobel2026 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g006 | 但诺奖提名和评审资料保密五十年，我们并不知道谁进入了最后名单。 | nobel_nomination | 具体适用范围参见对应来源的scopeAndLimit。 |
| g007 | 先跟着这口饭走，食物经过胃，进入肠道，营养物质开始被感知和吸收。 | native_half_life | 具体适用范围参见对应来源的scopeAndLimit。 |
| g008 | 肠壁里散布着一些特殊的内分泌细胞，它们会在进食后释放这种小肽。 | native_half_life | 具体适用范围参见对应来源的scopeAndLimit。 |
| g009 | 它把营养已经到来的消息，传给其他器官，让身体提前做好准备。 | native_half_life, mechanisms2018 | 化学信号的通俗比喻，实际由分泌细胞、受体和神经/体液通路完成。 |
| g010 | 同样是葡萄糖，喝进肚子和直接送进血液，身体的胰岛素反应并不相同。 | lasker2024 | 经典肠促胰素效应应在两种途径产生相近血糖曲线的条件下比较胰岛素。 |
| g011 | 肠道会提前给胰腺打招呼，这就是肠促胰素效应的重要一部分。 | lasker2024, mechanisms2018 | 打招呼为比喻；不是独立意识或有意预判，且GIP也参与肠促胰素效应。 |
| g012 | 把镜头推进胰腺，胰岛中的贝塔细胞表面，就有接收这条信号的受体。 | native_half_life, receptor2017 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g013 | 小肽结合受体，改变受体形状，把细胞外的消息传进细胞内部。 | receptor2017, pdb5vai | 教学动画应标注据实验结构；不能把形变示意称为实时分子录像。 |
| g014 | 一九八七年，莫伊索夫和霍尔斯特等人的研究，分别证明活性片段能够促进胰岛素释放。 | mojsov1987, holst1987 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g015 | 德鲁克等人的细胞研究，则把这条线索追到了细胞内信号和胰岛素基因表达。 | drucker1987 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g016 | 关键是，这种促胰岛素作用依赖葡萄糖，血糖较高时，帮助细胞加强应答。 | native_half_life, wegovy_pi | 葡萄糖依赖不等于绝对不会低血糖，与胰岛素或促泌剂合用的风险不同。 |
| g017 | 同时，它还能抑制胰高血糖素，让肝脏少往血液里释放一些葡萄糖。 | mechanisms2018, wegovy_pi | 具体适用范围参见对应来源的scopeAndLimit。 |
| g018 | 于是，一顿饭引起的血糖上升，获得了来自肠道和胰腺的联合调节。 | mechanisms2018 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g019 | 但体重的故事还要往上走，因为想不想继续吃，离不开大脑的判断。 | mechanisms2018 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g020 | 肠道、神经和大脑之间有多条通信路线，这种信号参与调节饥饿和饱腹感。 | native_half_life, mechanisms2018 | 肠脑轴是多通路；大脑也有内源GLP-1神经元，外周激素与长效药不可画成完全相同的分布。 |
| g021 | 相关药物激活受体后，能够减轻食欲，让人更容易停止进食、减少能量摄入。 | appetite_semaglutide, wegovy_pi | 具体适用范围参见对应来源的scopeAndLimit。 |
| g022 | 它们还会影响胃排空；随着治疗持续，食欲调节也在帮助人们减少进食。 | mechanisms2018, appetite_semaglutide | 并非持续胃潴留的单一减重解释；支持慢性食欲调节，视觉应避免把胃完全阻断。 |
| g023 | 能量摄入随之减少，体重的改变，发生在随后数周、数月里。 | wegovy_pi, appetite_semaglutide | 体重随能量平衡改变发生；分子不可直接击碎、燃烧或溶解脂肪。 |
| g024 | 这也提醒我们，肥胖涉及复杂的生物调节，不能只用意志力三个字解释。 | lasker2024 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g025 | 可天然信号有个难题，进入循环后寿命很短，活性肽的半衰期大约只有一两分钟。 | half_life_review | 天然活性GLP-1的循环半衰期，与给药途径和长效类似物区分。 |
| g026 | 一种叫二肽基肽酶四的酶，会切掉它的一小段，使它很快失去原来的活性。 | native_half_life, lasker2024 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g027 | 想把它变成药，科学家就得解决一个问题，怎样让这个信号停留得更久。 | lasker2024, semaglutide2015 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g028 | 以司美格鲁肽为例，研究者改动了氨基酸，让它更能抵抗这把分子剪刀。 | semaglutide2015 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g029 | 再接上一条脂肪酸侧链，增加它与血液中白蛋白的结合，延缓清除。 | semaglutide2015, wegovy_pi | 具体适用范围参见对应来源的scopeAndLimit。 |
| g030 | 这些改造让司美格鲁肽的半衰期约为一周，支持每周一次的皮下注射。 | wegovy_pi | 约一周是司美格鲁肽人体消除半衰期；每周一次明确是这里讨论的皮下注射制剂。 |
| g031 | 这里说的是一类受体激动剂，替尔泊肽还激活另一种肠促胰素受体，不能混为一谈。 | tirzepatide2022 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g032 | 效果究竟有多大？把两组人放进同一项随机对照试验，才有了可以比较的尺度。 | step1 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g033 | 一项研究纳入约两千名没有糖尿病、符合超重或肥胖条件的成年人。 | step1 | 画面写全入组条件，不把超重体重正常人等同。 |
| g034 | 两组都接受生活方式干预，一组每周注射司美格鲁肽，另一组使用安慰剂。 | step1 | 画面应出现目标剂量2.4 mg/周、两组均生活方式干预，不是操作性注射指导。 |
| g035 | 六十八周后，药物组平均减重百分之十四点九，安慰剂组为百分之二点四。 | step1 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g036 | 这是特定试验条件下的平均结果，个体差异很大，也不能套到所有药物身上。 | step1 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g037 | 另一项研究关注已有心血管病、超重或肥胖，但没有糖尿病的人群。 | select | 具体适用范围参见对应来源的scopeAndLimit。 |
| g038 | 平均随访约四十个月，主要心血管事件发生率，从百分之八降到百分之六点五。 | select | 必须在画面注明复合终点三项、SELECT入组人群与平均随访39.8个月。 |
| g039 | 相应的风险比是零点八，绝对发生率相差一点五个百分点，两种数字要一起看。 | select | HR是时间到事件分析的危险率比；8.0%-6.5%=1.5个百分点是粗事件比例差。 |
| g040 | 获益也有代价，恶心、呕吐、腹泻等胃肠反应，可能让一些人停药。 | step1, select, wegovy_pi | 具体适用范围参见对应来源的scopeAndLimit。 |
| g041 | 而一项延伸随访发现，停药并结束试验的生活方式干预一年后，体重会明显回升。 | withdrawal | 务必保留停药与研究生活方式干预一同结束的条件。 |
| g042 | 原药物组平均长回了此前减掉体重的约三分之二，提示长期管理仍然重要。 | withdrawal | 结果是子集均值，不能做个体必然性预测。 |
| g043 | 从发现肠道小肽，到受体机制，再到长效分子，背后是一场跨越几十年的接力。 | mojsov1987, holst1987, drucker1987, receptor2017, semaglutide2015 | 科学史逻辑可以先受体再药物，但时间轴必须按1987→2015→2017等真实年代排序。 |
| g044 | 二零二四年，拉斯克临床医学研究奖，已经表彰了这一领域的发现与药物开发。 | lasker2024 | 具体适用范围参见对应来源的scopeAndLimit。 |
| g045 | 至于诺奖为什么在某一年选择另一项发现，公开资料不足以替评委回答。 | nobel_nomination, nobel2026 | 不推断特定提名、评委偏好或诺奖所谓漏评原因。 |
| g046 | 一次颁奖的结果，也不会改变试验里已经测到的获益、局限和风险。 | step1, select, withdrawal | 编辑性结论；奖项选择不会使既有数据消失，也不把获奖等同安全有效。 |
| g047 | 回到那顿晚饭，你放下筷子的瞬间，其实有肠道、胰腺和大脑一起参与。 | native_half_life, mechanisms2018 | 饮食行为是多因素调节，列举三器官非穷尽。 |
| g048 | 从一顿饭追到一个分子，这条信号让我们更懂身体，也让治疗有了新的方向。 | mechanisms2018, lasker2024, withdrawal | 叙事回扣，不构成具体疗效承诺。 |

## 真实论文页

论文文件和首页图见 `public/papers/manifest.json`。Mojsov1987为JCI原刊PDF；Drucker1987为PMC提供的五张原版扫描页，PDF仅把这五张原页合并，不重排内容；停药研究为UCL公开仓储原刊PDF。

## 已记录的失败及排除

- FDA新闻网页返回404/abuse-detection，未作为证据。
- Europe PMC PDF、Wiley/PNAS PDF部分入口403；未伪称成功下载，采用公开仓储原页。
- 初次tirzepatide同名检索命中读者来信，已改为原始研究PMID35658024。
- native_half_life初次结果包含预印本，证据只取Holst 2007 PMID17928588。