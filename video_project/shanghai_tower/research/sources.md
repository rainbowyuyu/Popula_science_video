# 上海中心：资料与图纸来源

获取与核查日期：2026-10-08。本目录与 `sources.json` 同步，区分来源文献、教学假设和实际执行的数值求解；未取得完整施工图或竣工BIM。

结构原论文的九篇详细目录、页码及冲突说明见 `../docs/structural-evidence.md`；原文文件及哈希见 `structural/source-manifest.json`。TMD现场报道与供图见 `tmd-v3/sources.json`。

## gong2017 — Shanghai Tower

作者：Jian Gong。年份：2017。

施工方作者主源论文，全文和原版PDF已读取

来源：https://journal.hep.com.cn/fem/EN/10.15302/J-FEM-2017001

DOI：10.15302/J-FEM-2017001

原文PDF：https://journal.hep.com.cn/fem/EN/PDF/10.15302/J-FEM-2017001

本地原文：papers/gong2017.pdf

许可：CC BY 4.0

## gensler — Shanghai Tower

作者：Gensler。年份：未核实出版年。

建筑设计方项目页面，全文已读取

来源：https://www.gensler.com/projects/shanghai-tower

本地原文：raw/gensler.txt

## ctbuh — Shanghai Tower — The Skyscraper Center

作者：Council on Vertical Urbanism (formerly CTBUH)。年份：未核实出版年。

建筑数据库，当前页面已读取

来源：https://www.skyscrapercenter.com/building/shanghai-tower/56

本地原文：raw/ctbuh.txt

## archdaily — Shanghai Tower / Gensler

作者：Gensler (architect-provided description and drawings)；ArchDaily (publisher)。年份：2016。

建筑师供稿和公开设计图，非施工图；图纸另见drawings/sources.json

来源：https://www.archdaily.com/783216/shanghai-tower-gensler

本地原文：raw/archdaily.txt

## rwdi — Shanghai Tower — A unique shape and an unusual mechanism to control wind-induced motion

作者：RWDI。年份：未核实出版年。

风工程顾问项目页面；文本已读取，页面Download case study链接实际错误，未当作TMD图使用

来源：https://rwdi.com/en_ca/projects/shanghai-tower/

本地原文：raw/rwdi.txt

## wind_mechanism — Form follows Physics

作者：Jon Galsworthy；John Kilpatrick；Derek Kelley。年份：2016。

RWDI工程师发表于STRUCTURE的技术文章；正文已读取

来源：https://www.structuremag.org/article/form-follows-physics/

本地原文：raw/form-follows-physics.txt

使用边界：页面Figure4说明写180°，与Gong2017和设计主源120°冲突，本片120°以施工方/设计主源为准，不引用该图注。文中24%为比较方案风洞结果，本片不复刻、不承诺自算。

## tmd_mechanism — Feeling at Home in the Clouds

作者：Trevor Haskett。年份：2017。

阻尼工程师技术说明，正文已读取

来源：https://www.structuremag.org/article/feeling-at-home-in-the-clouds/

本地原文：raw/feeling-at-home-in-the-clouds.txt

使用边界：原文1100-ton未核实单位制；当前质量采用Wu2021明确的1000 metric tons。网页2014 opened与CTBUH2015完成口径不一，不用该页支持开放年份。悬挂和磁体/铜板细节仍按公开构造图教学重建。

## zhao2011 — Structural Design of Shanghai Tower for Wind Loads

作者：X. Zhao；J. M. Ding；H. H. Sun。年份：2011。

完整9页原论文已下载、提取并阅读。旧metadata-only状态已失效。

来源：https://doi.org/10.1016/j.proeng.2011.07.221

DOI：10.1016/j.proeng.2011.07.221

原文PDF：https://scholar.archive.org/work/uijqo5swnnb6vm452fgvww5sza/access/wayback/https://core.ac.uk/download/pdf/82001482.pdf

本地原文：structural/zhao2011-archive.pdf

使用边界：100年10分钟均值B类地形U10=31.7m/s、U500=50m/s。当前仿真U500=30m/s为缩放教学输入；特定形状比较24%是基底倾覆矩差异，不能普遍化为所有风力。

## foundation_mechanism — 桩基础侧阻/端阻及整体传力的基础工程学解释

作者：本片机理说明。年份：未核实出版年。

结合Gong/Zhu桩筏体系的通俗解释；新增本地Zwind/OpenSees独立单桩梁+分层弹簧例题。

来源：https://journal.hep.com.cn/fem/EN/10.15302/J-FEM-2017001

使用边界：单桩8MN轴向+0.3MN侧向+自重为教学输入，土弹簧刚度/端弹簧均是假设，不是该楼桩承载力或真实沉降预测；层位标签参考Zhu设计稿Table1。

## structure_mechanism — 核心筒—伸臂—外柱的基本静力机理

作者：本片机理说明。年份：未核实出版年。

结构体系参考Su/Zhu，实际执行Zwind/OpenSees等效线弹性梁杆求解，稳定ID驱动位移和轴应力增量显示。

来源：https://journal.hep.com.cn/fem/EN/10.15302/J-FEM-2017001

使用边界：真实执行不等于原工程模型：材料/截面/连接/风荷载等假设保留，未执行建筑CFD，未获得实测局部应力。

## education_model — 本片教学重建与动画说明

作者：rainbow鱼。年份：2026。

本项目教育性分层模型，不是施工级BIM；外幕墙拆组数量、组件节点/配筋/管线/设备尺寸均可能为视觉简化

## wu2021 — Monitoring dynamic characteristics of 600 m+ Shanghai Tower during two consecutive typhoons

作者：Jie Wu；Ningtao Hu；You Dong；Qilin Zhang。年份：2021。

机构库作者稿，全文读取，原研究实测台风响应

来源：https://ira.lib.polyu.edu.hk/handle/10397/102471

DOI：10.1002/stc.2666

原文PDF：https://ira.lib.polyu.edu.hk/bitstream/10397/102471/1/Dong_Monitoring_Dynamic_Characteristics.pdf

本地原文：structural/wu2021-typhoons.pdf

使用边界：该文没有提供本片质量块外形尺寸、吊点坐标、安装弹簧/阻尼完整表。求解使用1000t质量，弹簧按当前等效模型调谐、内部8%阻尼为显式教学假设；不能把0.57%结构阻尼与8%装置阻尼混写。

## ding2013 — Structural analysis and health monitoring of Shanghai Tower in construction stage

作者：Jiemin Ding；Qilin Zhang；Xin Zhao；Congzhi Yan；Lang Huang。年份：2013。

设计/研究团队会议原文，完整PDF已读取

来源：https://ishmii.org/wp-content/uploads/2015/04/MS05-01.pdf

本地原文：structural/ding2013-construction.pdf

使用边界：完整施工历史包括时变收缩徐变及伸臂择时锁定；本片逐高度重新求解静力例题，不复现原工程历史内力。

## li2013 — Analysis and monitoring of construction phase internal forces of Shanghai Tower considering time-dependent effect

作者：Han Li；Lu Chen；Jia Lv；Jia Hu；Qi-lin Zhang；Xin Zhao。年份：2013。

SHMII-6作者原论文，完整PDF已读取

来源：https://ishmii.org/wp-content/uploads/2015/04/MS05-03.pdf

本地原文：structural/dingtimed2013-construction.pdf

使用边界：本地旧文件名dingtimed仅检索标记，实际第一作者Li；没有以文件名推断作者。

## 本轮计算与画面边界

实际求解为本地Zwind/OpenSees等效结构、塔楼—TMD耦合动力及独立单桩土弹簧例题。绕流线为机理示意；Iwind建筑CFD与Diffusion建筑推断未运行。环境结果与19项数值检查见 `../public/physics/environment-response.json` 和 `../public/physics/environment-qa.json`。

桩头33 m是与当前重建几何对齐的教学假设，已按原始绝对土层界限重算；Zhu设计稿的筏顶25.4 m加厚6 m对应31.4 m，二者不混为竣工标高。TMD采用1000公吨质量，25 m缆索为几何资料，20.614 m为当前教学模型调谐等效摆长。
