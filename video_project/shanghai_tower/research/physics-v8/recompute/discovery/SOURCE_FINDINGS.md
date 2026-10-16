# 上海中心 OpenSees 原始模型检索与身份核对

检索日期：2026-10-09。结论是**本次未取得上海中心专属、可复算的原始输入模型**，不能据此断言全网不存在公开文件。已取得作者公开讲义、论文全文网页和三份实际下载包，并核对包内模型规模，而非只看标题。

## 直接证据

1. 陆新征作者讲义 [Nonlinear time-history analysis of super-tall building based on OpenSees](http://www.luxinzheng.net/download/OpenSEES/OpenSees_Super_Tall_Building.pdf) 的 PDF 第 9 页明确展示 **Shanghai Tower**：632 m、121 层、53,006 节点、48,774 纤维梁、39,315 多层壳；OpenSees 前三周期为 9.5238、9.4518、4.6847 s。对应截图已归档 `lu-shanghai-tower-page-9.png`。这是模型曾被研究者建立的证据，不是取得输入文件的证据。
2. 该页给出的 [OpenSeesTHU.zip](http://www.luxinzheng.net/download/OpenSeesTHU.zip) 实际含 12 个条目，有 Tcl 节点、材料、纤维截面、梁、分层壳、重力和地震加载，另含程序与两份 PDF。静态解析 `nodes.tcl` 得到 **8,469 节点**、Z 高度 0–135.700 m；两组梁为 6,216 + 3,528，壳 4,704。它不具备讲义所述上海中心的节点规模和高度。附 PDF 同时演示 TBI Building 2 与 Shanghai Tower，不能把 PDF 中展示的上海中心等同于 ZIP 实际附带的输入。
3. 作者的 [OpenSeesTallBuildings.zip](http://www.luxinzheng.net/download/OpenSeesTallBuildings.zip) 实際文件夹为 `model/TBI2A` 与 `model/TBI2N`，说明文档写明两种 RC 框架—核心筒结构及 El Centro 地震算例；没有上海中心专属输入。
4. [606 m mega-tall benchmark](http://www.luxinzheng.net/download/OpenSEES/Mega-tall_Building_Benchmark_OpenSees.htm) 及对应 [下载包](http://www.thu-civil.net/download/OpenSees-Mega-tall-Building.zip) 是 Yuan Tian、Linlin Xie、Xinzheng Lu 提供的 606 m 通用基准模型，来源为同济团队 ETABS 基准。它提供 27,220 和 81,572 节点两个网格，采用 ShellMITC4。作者介绍没有把它认定为上海中心；不能因同为超高层而替代上海中心。
5. 原作者全文网页：[Lu et al. (2015), A shear wall element for nonlinear seismic analysis of super-tall buildings using OpenSees](http://www.luxinzheng.net/publication6/Shell_wall_element_OpenSees_FEAD_2015.htm)，DOI [10.1016/j.finel.2015.01.006](https://doi.org/10.1016/j.finel.2015.01.006)。论文确实研究上海中心，但模型相关下载仍指向上述示例与 606 m 基准。原文中对实际上海中心研究的描述，不构成下载模型身份的充分证据。

## 官方库与检索范围

- OpenSees 官方现行文档的 User Examples、完整 searchindex.js 和旧 Wiki Examples Manual 已取回。当前页面与索引未找到上海中心模型。Wiki 搜索 Shanghai 返回会议页与 ConcreteD 参考项，没有该楼输入模型。
- GitHub repository search 的两种查询没有返回仓库；未登录 code search 要求登录，官方代码树 API 遭遇速率限制。因此不能以 GitHub 的此次结果证明所有公开仓库都没有该模型。
- Crossref 用于核对论文元数据；它不是输入文件库。一般网页搜索出现无关结果/挑战页，这些不被当作有效的否定证据。

## 许可与可用性

OpenSees 软件版权许可已经另存，**软件许可不自动覆盖第三方模型数据**。这三份作者下载包未发现单独 LICENSE/许可声明；现阶段只作本地身份核验和文献证据，未执行其中的未知二进制程序，未把其他楼的模型改名使用，也未对外重新发布下载包。

## 本次计算决定

继续真实执行本项目已有、可复现的**教学等效模型**，输入和脚本快照在 `../frozen-project/`。输出明确保留教学参数、固定底部、线弹性梁/桁架、预设风荷载与独立单桩的边界。它不等于作者上海中心壳—纤维模型或竣工结构模型，不应用来声称实际楼的承载力或安全结论。计算结果与现有生产数据独立存放；不覆盖 `public/physics`。

全部下载记录、原始字节、SHA256、压缩包条目、Tcl 静态计数和 PDF 文本保存在本目录的 JSON/raw/zip/pdf 文件中。大体积新计算结果位于 C 盘 `C:/Users/zju/.codex/visualizations/2026/10/08/01a11ae1-4ffb-79e2-b2fc-3add8874f339/shanghai-physics-v8/`，后续清单记录确切文件。
