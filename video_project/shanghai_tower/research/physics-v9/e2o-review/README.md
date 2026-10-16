# E2O-SEAOC2020 输入与转换范围核查

核查日期：2026-10-09。方式：只读源码、全文调用位置检索及附带 EDB 头部读取。没有导入/执行仓库 Python、启动 ETABS 或执行示例模型。

**结论：可以借鉴 E2O 的 ETABS API 提取与模态对照思路，但它不能在没有 ETABS 的情况下直接读本地 `mod2.EDB`，当前实现也不是上海中心所需的通用转换器。** 它明确只支持附带 FEMA 钢框架示例；缺少墙壳、RC 材料与通用约束/释放等关键转换。直接接入会漏掉核心筒并改变结构假设，不能据此声称完成了真实上海中心计算。

## 源码与版本证据

- 仓库：<https://github.com/OpenSeesPro/E2O-SEAOC2020>。
- 本次下载来源及归档记录：`research/tools/E2O-SEAOC2020/retrieval.json`。
- ZIP SHA-256：`294fd06558ac250b6358e24781ae209b1e9cc1d0dca70b126c140e737382382b`。下载的是 HEAD ZIP，主线程从 ZIP 注释锁定提交 `daa3bce61305642fd809d0a94ba08c348128360b`；本报告另记录本地源文件哈希，不假定未来 HEAD 不变。
- [仓库 README 第 4 行](D:/python_project/manim_extend_rainbow/video_project/shanghai_tower/research/tools/E2O-SEAOC2020/source/README.md:4)声明转换的是附带模型，第 6 行明确“currently limit the scope ... to the enclosed model”。第 11 行要求先运行该模型并保持 ETABS 打开。
- 附带 `FEMA_p2006_chapter8_v4.2.EDB` 头部为 `ETABS / 18.05 / 18.1.1`，459,580 字节。用户上海中心文件为 `9.20 / 9.2.0`，89,149,278 字节。这不能证明 API 或旧文件兼容；源码没有 9.2 迁移/校验路径。

下文行号均针对 `research/tools/E2O-SEAOC2020/source/src/` 下原始文件，未改源码。建单元/材料调用位置和源文件哈希见 `static-evidence.json`、`source-hashes.json`。

## 输入如何进入程序

1. `general_utilities.py:40` 导入 `comtypes.client`；`:49` 调用 `GetActiveObject('CSI.ETABS.API.ETABSObject')`，`:53` 返回运行中实例的 `SapModel`；`:52` 在连接失败时 `sys.exit(-1)`。
2. `general_utilities.py:55`、`:58`、`:61`、`:64` 的函数默认参数直接调用 `get_model_from_etabs()`。Python 定义函数时就求值，所以**仅导入模块便会尝试连接 ETABS**，不必等到 `main` 执行。
3. `main.py:60` 调用 `get_etabs_data(units=3)`；`etabs_utilities.py:239` 取得活动模型，`:240` 改显示单位。
4. `general_utilities.py:92` 通过 `model.DatabaseTables.GetTableForDisplayArray` 获取表；`etabs_utilities.py:138` 调用 `FrameObj.GetAllFrames`，`:61` 用 `PointObj.GetRestraint`。数据来自 ETABS 已打开的模型，不来自 Python 自己解码 EDB。
5. 仓库没有 EDB 字节解析器、E2K/`$ET` 文本导入器、EDB 路径参数或 `File.OpenFile` 调用，也没有校验活动模型文件名/SHA 的步骤。`main.py` 并未自动打开那个 FEMA 文件；README 要求人工预先打开它。

因此，仅安装 `comtypes` 或 OpenSeesPy 不能消除 ETABS 依赖。用户目前没有 ETABS，E2O 不提供绕开这一阻塞的路径。`DatabaseTables` 名称、字段、返回数组布局及注册 COM 接口还需在实际受支持的 ETABS 版本逐项核验，不能把附带 18.1.1 示例的结果视作 9.2 API 兼容证明。

## 实际转换支持范围

| 内容 | 源码实际行为与精确位置 | 对上海中心的意义 |
|---|---|---|
| 节点与固定约束 | `etabs_utilities.py:59` 读 Point Object Connectivity，`:61` 取六自由度约束；`opensees_utilities.py:77` 建节点、`:79` `op.fix`。 | 可借鉴基本节点/支承导出；需核实自动网格节点与对象节点映射。 |
| 非数字节点命名 | `etabs_utilities.py:76` 把所有非数字 UniqueName 视为铰节点；`:81` 去掉首字符后转整数，`:93` 将其坐标改为配对节点。 | 假定示例的 `N123` 命名。其他命名会报错或被错误重定位，必须重新设计稳定 ID 映射。 |
| 梁柱几何与截面 | `etabs_utilities.py:138` 取帧对象；`:205` 取截面汇总；`:208` 只应用 `I3Mod` 到 I33。 | 不是完整提取所有对象/截面刚度修正；混凝土、组合柱和不同材料的参数仍需提取。 |
| 梁柱单元 | `opensees_utilities.py:120` 和 `:129` 只对 `Angle == 0.0`、`Angle == 90.0` 建 `ElasticTimoshenkoBeam`。 | 其他局部轴角度的构件不会进入这两个分支，且无失败提示。不能用于含任意方向构件的塔楼而不补全局部轴映射。 |
| 材料 | `opensees_utilities.py:51` 固定 E=29000，`:52` 固定 G=11153.846；`:122` 对所有帧使用这两个常数。虽然截面表含 Material 字段，建单元时不使用它。 | 对示例的 kip/in 钢材假设；不会保持 RC 核心筒/巨柱/混合材料性质。不能把 RC 构件按该钢材常数求解。 |
| 壳、楼板、RC 墙 | 提取入口 `etabs_utilities.py:243` 只调节点/点荷载/帧/质量/截面/模态；建模入口 `opensees_utilities.py:443` 只调节点、帧、梁铰。所有源码没有 `AreaObj/AreaElm/PropArea`、壳单元、`nDMaterial` 或纤维截面转换。 | **未实现**上海中心核心筒墙壳、墙配筋/分层、墙网格连通/局部轴/质量等。核心抗侧体系会缺失。 |
| 伸臂和带状桁架 | 没有专门 truss/brace/伸臂转换，所有帧落入上述弹性梁分支；`:107` 以 Label 是否含 `C` 判断梁柱，`:116`/`:117` 使用固定参考向量。 | 如对象恰好是 Frame 且角度满足条件，可以生成弹性杆件外形，但轴力铰接/端部释放、局部轴、非线性屈曲、偏心等并未保真。不能称完整支持。 |
| 偏心、端部释放与刚域 | `etabs_utilities.py:45` 列有 Offset 和 CardinalPt，但 `opensees_utilities.py:120`/`:129` 未使用这些字段；源码无 GetReleases 或相应一般释放/刚偏心转换。 | 对巨柱、伸臂与墙的偏心连接，直接转换可能改变刚度和受力路径。 |
| 质量 | `etabs_utilities.py:168` 读 Assembled Joint Masses；`opensees_utilities.py:99` 写入六项节点质量。帧线质量 `M=0` 在 `:50` 固定。 | 支持从 ETABS 已组装结果传递节点质量；没有重建质量源。必须确认每个 PointElm 在转换节点表中存在、单位一致且无重复/漏项。 |
| 楼板与约束 | `opensees_utilities.py:54` 固定 `rigid_dia=True`；`:89` 按相同 Z 聚合节点，`:96` 每层强加一个 rigidDiaphragm；`:81` 对所有 IsAuto=Yes 节点额外固定 UZ/RX/RY。 | 没有读取真实楼板分组、半刚性/柔性楼板、多个独立区域和一般 MPC 约束；可能过度约束塔楼。不同区域不能只因 Z 相同便刚性连接。 |
| 梁端非线性 | `opensees_utilities.py:274` 从固定 Excel 工作表 `WUF hinge` 读属性；`:207` 建 `Bilin`，`:214` 建 zeroLength，`:217` equalDOF 约束其余自由度。 | 是附带钢梁铰工作流，不是从上海中心任意 ETABS Link/Hinge 属性自动恢复非线性，更不是 RC 墙材料。 |
| 荷载 | `etabs_utilities.py:116` 仅取 PointObj.GetLoadForce，`:124` 只留名称精确为 `Dead` 的点荷载；虽在 `opensees_utilities.py:139` 定义 add_nodal_loads，建模入口 `:441` 没有调用。 | 原仓库主路径没有把已提取点重力荷载施加进去；更无分布荷载、墙面风压、墙/梁自重、风工况、施工/组合荷载完整映射。 |
| 几何非线性 | `opensees_utilities.py:57` 默认 `Linear`，`:116`/`:117` 使用该变换。 | 注释提到 PDelta/Corotational 可选，并不代表当前已打开、已按塔楼校核。 |
| 动力输入与阻尼 | `opensees_utilities.py:322` 固定 `BM68elc.acc`、dt=0.01、放大 3g；`:323` X 向 UniformExcitation；`:356` 用 w1/0.384 得 w2；`main.py:81` 固定 5% 阻尼。 | 是固定地震示例，不会自动转换上海中心风时程、空间相关风压、TMD 或楼层阻尼。 |

## 其他必须处理的兼容/核验问题

- **单位不能沿用视频工程的 SI 值直接输入。** `general_utilities.py:74` 每次读表都强制 SetPresentUnits(3)，与固定 E/G 和 g=386.4 对应示例的 kip/in 单位体系。接口需固定规范单位、逐字段转换并保存元数据。
- **独立调用部分工具会 TypeError。** `get_model_from_etabs()` 在 `general_utilities.py:46` 不接受参数，`:71`、`etabs_utilities.py:106`/`:131`/`:165`/`:176` 却用 `get_model_from_etabs(True)`。主路径通常传入 model 绕开该分支，不能据此说这些便捷入口可直接使用。
- **pandas 版本需适配。** `etabs_utilities.py:119`/`:192` 使用旧的 DataFrame.append，pandas 2.x 已移除；README 第 12 行也说明其当年的环境约束。安装当前包不等于具备可运行环境。
- **读取接口有状态副作用。** `general_utilities.py:74` 改显示单位，`:88`/`:89` 改输出选项；若未来连接 API，先确认打开的是受控工作副本，不能自动对任意当前活动模型运行。
- **记录器与后处理仍为示例编号。** `opensees_utilities.py:224` 覆盖传入节点集合为固定列表，`:233` 固定铰编号；`opensees_postprocessor.py:48` 固定读取单元 20279。不能把这些输出当成上海中心目标构件结果。
- **基底剪力求和包含时间列。** `opensees_postprocessor.py:63` 把 t 加入 DataFrame，`:74`/`:75` 对整行求和，将时间数值加进剪力。复用前须只对反力列求和并校验全局平衡。
- **现有模态比较不是自动验收。** `etabs_utilities.py:232` 取前四个周期并四舍五入；`opensees_utilities.py:430` 只打印比值，无误差阈值、振型配对、质量参与率/正交性验收。

## 可采用的接入方案

保留已确认项目关联的上海中心 EDB 原件和哈希。先在受支持的兼容 ETABS 中打开工作副本并核查旧版导入/模型检查日志。**成功打开后，可以像 E2O 一样直接通过 API 读取结构表和对象，不要求先手工导出 E2K。** 若不便保持 API 连接，也可由拥有合法 ETABS 的环境提供 E2K/`$ET`、完整数据库表及检查日志作为离线交换格式。两条路径都需要 ETABS 完成对原 EDB 的可靠解释；E2O 本身没有替代它的 EDB 读取器。

可借鉴它的“ETABS 结构表 → 明确数据结构 → OpenSees 建模 → 与 ETABS 模态结果对照”，但接入应另建上海中心适配层：显式读取文件身份、单位、节点/网格、所有帧/墙壳、材料和截面、局部轴/偏心/释放、楼板与一般约束、质量源/组装质量、荷载/组合和分析设置；任何未支持类型应阻止通过，不能静默丢弃。

求解前逐项检查模型对象数和连通性、自重与支座反力、刚体模态、周期和振型、楼层质量参与、基底剪力/倾覆矩与静力位移。之后再将真实风荷载和构件结果交给可视化。**附带 FEMA 模型仅用于理解和独立验证转换器，不能替换上海中心，不应进入本片的建筑计算结果。**

审查过程中未修改源库、原 EDB、视频或计算结果；没有把静态阅读或候选层级数据称为 E2O 实际成功转换。
