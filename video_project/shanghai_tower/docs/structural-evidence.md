# 上海中心结构重建：原始文献证据与仿真边界

核查日期：2026-10-08。以下页码均为本地 PDF 页码；公开作者稿的 PDF 页码通常不同于期刊页码。所有数值必须保留对应的对象、版本、工况和单位。

本项目获得的是设计与监测团队公开的论文、结构示意图、典型平面及有限尺寸，**并未获得完整竣工 BIM、施工图、逐根截面表、现场风压时程或材料试验数据库**。可据此制作有证据支撑、可拆分的科普重建；不能把重建模型或等效有限元结果称为上海中心原工程计算、工程验收结论或实测应力。

## 优先采用的结构依据

| 项目 | 原文可核实内容 | 证据 | 建模限制 |
|---|---|---|---|
| 高度 | 建筑高度 632 m；结构高度 580 m | Su 2013，p5；Zhao 2011，p2 | 580–632 m 的塔冠不能当作重复的标准层核心筒 |
| 分区 | 9 区；8 道加强层 | Su，p6 Fig.1 | 分区标高不能直接冒充伸臂桁架上下弦标高 |
| 分界标高 | 33.45、99.00、173.70、239.40、314.10、393.30、465.40、542.00 m；图中底部参考 −1.00 m | Su，p6 Fig.1(b)，已目视核对 | 原图为体系示意，地面零点与各层梁中线应分开 |
| 核心筒下部 | 30×30 m，九宫格；第1–4区保持此基本平面 | Su，p7–8 Fig.3；Zhu，p10 Fig.5 | 不要用一个实心方柱或一层空壳代替分隔墙 |
| 核心筒上部 | 第5–6区切角；第7–8区五格十字；顶部三格矩形 | Su，p7–8 Fig.3；Zhu，p10 | 切角坐标与顶部旋向未提供完整带尺寸图；±5 m 网格等是读图重建 |
| 核心筒墙 | 外墙 1.2→0.5 m；内/web墙 0.9→0.5 m；外墙厚度分5级变化 | Zhu，p10 | 各级精确楼层未取得，不能把线性插值当截面表 |
| 核心筒材料 | C60；墙内局部配置钢板、型钢边缘构件 | Su，p7；Zhu，p10–11 | C60 是强度等级，不是弹性模量；未获取实测 E、密度、裂后有效刚度 |
| 巨柱布置 | 8 根巨柱延伸至第8区；另有4根角部/斜向柱延伸至第5区；柱向内倾斜 | Su，p8–9 Fig.4–5；Zhu，p11 Fig.6 | 巨柱不是圆周上12根等间距同尺寸柱；准确轴线坐标仍属读图假设 |
| 巨柱截面 | 地下最大 5.3×4.3 m；上部最小 2.4×1.9 m | Su，p8 | 两端之间的逐段截面表未公开取得 |
| 第1区巨柱 | 5.1×3.7 m | Ou 2013，p2 | 与地下最大截面不同，不能择一抹掉楼层语境 |
| 巨柱含钢 | 内置型钢面积占截面面积约4–6% | Zhu，p11 | 不能据此恢复钢骨准确排布与局部惯性矩 |
| 伸臂 | 第2、4、5、6、7、8区共6组、两层高 | Su，p6；Zhu，p11 Fig.6 | 6组不等于8道分区环带；真实上下弦标高未完整取得 |
| 环带 | 8组两层双环桁架；内外圈以系杆连接形成空间箱形桁架 | Zhu，p11 | 不能画成单条装饰圆环 |
| 幕墙传力 | 机电层径向桁架支承外挑楼面及外幕墙；再把荷载传至环带、巨柱和核心筒 | Zhu，p13；Ding 2013，p2 Fig.4 | 扭转的是外表皮几何，不是整根核心筒及主柱同步扭转 |
| 标准办公楼板 | 组合楼板总深155 mm = 75 mm 压型钢板高度 + 板顶80 mm混凝土 | Zhu，p12 | 155 mm 不能全部按实心混凝土算；槽内砼、钢板、梁、装修等须单独假设 |
| 机电/设施层楼板 | 总深200–250 mm，板顶混凝土125–175 mm + 75 mm 压型钢板 | Zhu，p12 | 仍需区分有效混凝土体积与总构造深度 |
| 基础 | 6 m 筏板、947根直径1 m灌注桩，桩有效长52–56 m；桩端后注浆 | Zhu，p8 | 桩位没有完整坐标，展示应称体系与排布重建 |
| 地下结构 | 五层地下墙肢连接核心筒与巨柱，筏板顶−25.4 m | Zhu，p9–10 | 整楼仍为固定基底；另有独立单桩弹簧例题，不是整楼桩土耦合 |

### 尺寸冲突应公开保留

- Chen 2013 p2 与 Zhang 2016 p3：内部圆形楼层/平面从底部 **83.6 m** 缩至第8区 **42 m**。
- Zhu 设计团队稿 p6：floor plate diameter 从第1区 **82.2 m** 缩至第8区 **46.5 m**。
- 这可能来自设计版本或所量对象/标高不同。现有资料不足以唯一消歧。若模型采用 83.6→42 m，应在参数中注明 `chen2013` 与分区插值假设；不能把它作为唯一“竣工准确尺寸”。
- Su 巨柱地下最大5.3×4.3 m与Ou第1区5.1×3.7 m属于不同楼层，属于可共存的数值，不是互相否定。
- Zhu稿提到“1,100-ton TMD”，Wu 2021 运营监测明确为 **1000 metric tons**。可能涉及短吨或版本差异；当前成片建议采用运营文献的1000公吨，不混用单位。

## 施工顺序的具体依据

Li 2013（本地文件名 `dingtimed2013-construction.pdf`）p2：核心筒先行；巨柱施工落后核心筒约 **6–9层**；楼板再落后巨柱约 **4–7层**。标准层周期由下部约 **8天/层** 缩短至上部 **4天/层**。外幕墙在主体达到约总高三分之一后开始安装，始终落后楼板。

Ding 2013 p3–4 Table 2：伸臂锁定要同时控制施工稳定和柱筒差异收缩引起的附加内力。第7区施工时锁定第2、4、5区伸臂；第8区施工时锁定第6区；结构封顶时锁定第7、8区。**动画可演示先安装再择时锁定，不应暗示全部伸臂从第一天就完全参与工作。**

Li p2 对原工程施工计算的说明：MIDAS/GEN，核心筒墙单元，巨柱混凝土与钢骨分开以板/梁单元模拟并施加主从约束；施工分步、收缩徐变、温度影响均有考虑。该精度显著高于本片用于解释传力的等效梁/杆模型。

## 风荷载与振动：可验证量及不可混用量

### 一阶动力特征

- Zhu稿 p12 Table 2，设计阶段 ETABS 前6阶周期：**9.05、8.96、5.59、3.31、3.20、2.62 s**。p11说明前三阶分别为X向平动、Y向平动、扭转。
- Wu 2021 p10 的运营监测谱峰为约 **0.106、0.204、0.320、0.440 Hz**。作者同时提醒0.067/0.138 Hz谱峰可能与传感器或信号问题有关，不能任挑峰值当固有频率。
- Wu p11–12、17：2018两次台风中的一阶拟合为 `fx = −0.00216 Ax + 0.1072 Hz`，`fy = −0.00177 Ay + 0.1069 Hz`，A为响应加速度幅值，单位gal = cm/s²。约9.3–9.4 s只能作为小振幅工况背景。
- 两套结果有模型阶段、运营荷载和响应幅值差异。**对照应报告偏差与模型假设，不可私自调E/质量硬凑后宣称模型已验证。**
- Ou、Chen、Zhang的多组2011–2013年频率主要为施工阶段，不可作为完整632 m建筑的成楼频率。

### 阻尼与TMD

Wu 2021 p3确认第125层为 **1000公吨被动涡流TMD**。p16–17小振幅结构阻尼拟合截距约X 0.57%、Y 0.56%；含TMD的较大振幅有效阻尼约X 2.75%、Y在0.751gal时2.44%。文中建议较大振幅可按3%估计。**这不是一个与工况无关的固定阻尼常数。** 本片实际运行等效塔楼与单水平自由度TMD的耦合动力分析；1000公吨质量有文献依据，装置弹簧按当前等效塔楼调谐，内部8%阻尼为教学假设。全部位移、速度、作用力和输入风来源见`docs/environment-physics-interface.md`，不能宣称恢复了实装装置性能。

### 可复现的风工况

Zhao 2011 p3 Table 1：上海中心研究采用的 **100年重现期、10分钟平均、B类地形** 风速，10 m处 **31.7 m/s**、500 m处 **50.0 m/s**。本片若构造幂律风剖面，可用这两个点求指数，但那是重建剖面，绝非获得RWDI真实风压数据。该论文同时出现代码D类粗糙度算例，**不能把B类风速与D类系数混为同一工况**。

Zhao p4 Table 2：同一100年重现期、2%阻尼的形状比较中，矩形基底倾覆矩 `6.22e10 N·m`，120°扭转、0°初始角方案 `4.75e10 N·m`，约为76%。因此“减少24%”对应特定对比中的**基底倾覆矩**，不应宣称所有风压、所有风向或任意工况都减少24%。

Zhao p6 Table 4：风洞 `Vbase=1.03e8 N`、`Mbase=3.80e10 N·m`；规范算例 `1.22e8 N`、`5.02e10 N·m`。这些是带特定重现期、阻尼、动态放大的设计结果，不能用于直接验证本片合成平均风下的线性静力算例。

Zhao Table 3 将刚度设计阻尼列为1.5%，正文某组50年刚度算例用4%。须保留各自场景，不静默合并。原研究包含1:500高频测力/测压/气动弹性风洞和1:85高雷诺数试验，本片并未复现这些试验。

## 本片有限元输出的正确命名

1. **执行链**：本片实际调用本地Zwind的 `os2zwind` 封装及OpenSees 3.8.0，执行等效结构线弹性分析。这是结构求解调用，不等于求解了三维空气流场；本轮未执行Iwind建筑CFD或Diffusion建筑推断，片尾相关工具串为工作流标识。
2. **应力**：轴力 `N/A` 或梁截面 `N/A±My/I` 为简化名义应力；未经板壳/实体单元局部分析，不能称三维节点真实von Mises应力，更不能将其涂到幕墙上冒充幕墙应力。
3. **颜色**：明确着色量（轴力、名义应力、位移），单位与归一化方式。正负轴力要区分拉压；每帧各自自动归一化会掩盖大小变化，宜在同一比较段固定色标。
4. **变形**：位移可放大用于观看，但图注/报告应标注放大倍数，不能暗示真实建筑以动画幅度摇摆。
5. **扩散**：图拉普拉斯平滑/扩散只能称显示上的场插值或平滑；除非实际定义物理扩散方程、参数、边界并求解，否则不能称空气/热传导模拟。扩散颜色不能凭空创造新物理证据。
6. **未建模项**：整楼模型没有裂缝非线性、剪切墙开洞细节、钢骨局部屈服、基础柔性、整楼桩土耦合、气动涡激、实测脉动风时程、施工徐变收缩和多向时程。另行求解的单桩—分层土弹簧示例包含弹性侧阻、侧向及端阻，未包含连续土体塑性、固结或桩群相互作用。
7. **独立校核**：至少保留截面几何惯性矩、节点/杆件数量、边界条件、质量来源与总量、荷载积分、基底反力平衡、未耦合/已耦合比较、模态与文献偏差。若做模式校准，原始模型与校准后结果必须区分。

## 当前仍属于工程假设的参数

- 逐层层高（只对部分监测楼层有图中实值，其他需插值）。
- 柱中心准确坐标、柱局部轴方向、型钢位置、所有桁架截面及节点刚度。
- 伸臂上下弦实际标高；分区顶部两层是一种重建方案，须有假设标记。
- 普通楼板面质量、梁/设备/装修/人群附加质量及顶部非结构质量。
- 本模型核心混凝土E=34 GPa、钢E=200 GPa、混凝土密度2500 kg/m³均非本次获得的塔楼试验值，已作为教学假设保留在实际求解输入中；C60强度等级不能直接代替E。
- 等效核心筒弯扭刚度：多室墙的扭转常数不等于极惯性矩，需用正确薄壁闭口截面算法或明确等效假设。
- 风速剖面、形状系数、受风宽度、风向和静/动态输入构造方式。

## 原论文页展示素材

- `public/papers/structural-title.jpg`：Su作者接受稿PDF第1页，1191×1684，完整原页，无额外文字覆写。
- `public/papers/structural-system.jpg`：同稿PDF第6页，Fig.1及其正文，1191×1684，完整原页。
- 可在卡片**下方**单独写“Su 等 · 2013｜上海中心结构与监测”；不要把额外作者、年份、中文标题压入原论文卡片。
- 已逐张查看，标题与Fig.1完整，未覆盖原文。原论文图的受限分辨率不宜被生成式重绘冒充原图。

## 文献目录与下载来源

1. Su, J.-z.; Xia, Y.; Chen, L.; Zhao, X.; Zhang, Q.-l.; Xu, Y.-l.; Ding, J.-m.; Xiong, H.-b.; Ma, R.-j.; Lv, X.-l.; Chen, A.-r. (2013). **Long-term structural performance monitoring system for the Shanghai Tower**. *Journal of Civil Structural Health Monitoring* 3, 49–61. DOI: **10.1007/s13349-012-0034-z**. [作者稿](https://ira.lib.polyu.edu.hk/bitstream/10397/6740/1/SHM%20of%20Shanghai%20Tower%20-%20R1.pdf)，[机构记录](https://ira.lib.polyu.edu.hk/handle/10397/6740)。本地 `su2013-monitoring-accepted.pdf`。
2. Zhu, Y.; Poon, D.; Velivasakis, E. E.; Zuo, S.; Fu, P. **Structural Design Challenges of Shanghai Tower**. Thornton Tomasetti设计团队稿，会议存档版本；当前PDF本身没有完整出版年月，搜索元数据关联2012但不可据此替代版本核实。未核实DOI。[原会议主机PDF](http://eeme.ntua.gr/proceedings/8th/Invited_Speakers/PAP_Velivasakis.pdf)。本地 `zhu2012-http.pdf`（文件名年份为检索标签，非已确认本稿出版年）。
3. Zhao, X.; Ding, J. M.; Sun, H. H. (2011). **Structural Design of Shanghai Tower for Wind Loads**. *Procedia Engineering* 14, 1759–1767. DOI: **10.1016/j.proeng.2011.07.221**. [全文存档](https://scholar.archive.org/work/uijqo5swnnb6vm452fgvww5sza/access/wayback/https://core.ac.uk/download/pdf/82001482.pdf)。本地 `zhao2011-archive.pdf`。已读完整9页，PDF明示CC BY-NC-ND；复用应保持原貌并署名。
4. Wu, J.; Hu, N.; Dong, Y.; Zhang, Q. (2021). **Monitoring dynamic characteristics of 600 m+ Shanghai Tower during two consecutive typhoons**. *Structural Control and Health Monitoring*. DOI: **10.1002/stc.2666**. [PolyU作者稿](https://ira.lib.polyu.edu.hk/bitstream/10397/102471/1/Dong_Monitoring_Dynamic_Characteristics.pdf)。本地 `wu2021-typhoons.pdf`。
5. Chen, X.; Xiong, H.; Shi, W.; Shan, J. (2013). **Modal identification of Shanghai Tower under construction from ambient vibration response**. SHMII-6, Hong Kong. [会议PDF](https://ishmii.org/wp-content/uploads/2015/04/MS05-09.pdf)。本地 `chen2013-modal.pdf`。未核实DOI。
6. Ou, X.; Chen, C.; Xiong, H. (2013). **Finite element analysis on dynamic characteristics for Shanghai Tower under construction**. SHMII-6. [会议PDF](https://ishmii.org/wp-content/uploads/2015/04/MS05-06.pdf)。本地 `ou2013-fe.pdf`。未核实DOI。
7. Ding, J.; Zhang, Q.; Zhao, X.; Yan, C.; Huang, L. (2013). **Structural analysis and health monitoring of Shanghai Tower in construction stage**. SHMII-6. [会议PDF](https://ishmii.org/wp-content/uploads/2015/04/MS05-01.pdf)。本地 `ding2013-construction.pdf`。未核实DOI。
8. Li, H.; Chen, L.; Lv, J.; Hu, J.; Zhang, Q.-l.; Zhao, X. (2013). **Analysis and monitoring of construction phase internal forces of Shanghai Tower considering time-dependent effect**. SHMII-6. [会议PDF](https://ishmii.org/wp-content/uploads/2015/04/MS05-03.pdf)。本地 `dingtimed2013-construction.pdf`（旧检索文件名，作者应写Li）。未核实DOI。
9. Zhang, F. L.; Xiong, H. B.; Shi, W. X.; Ou, X. (2016). **Structural health monitoring of Shanghai Tower during different stages using a Bayesian approach**. *Structural Control and Health Monitoring* 23, 1366–1384. DOI: **10.1002/stc.1840**. [第三方镜像](https://partsazeco.com/images/pdf/SHMA3.pdf)。本地 `zhang2016-bayesian.pdf`。属于原研究PDF，托管域不是期刊或作者机构。

机器可读来源及文件哈希见 `research/structural/source-manifest.json`；可直接使用的已核实参数见 `research/structural/verified-parameters.json`。
