# 上海中心 V10 · 计算与成片验收索引

本索引对应 `v10-final` 冻结版。2026-10-09，正式 V10 MP4 已完成渲染、拼接、完整解码、实际 AAC 信号检查和抽样视觉复核。计算证据与成片验收分别记录，不以冻结记录代替画面检查。

## 三类计算的边界

| 对象 | 实际计算与可用结论 | 不支持的结论 |
|---|---|---|
| 全楼主结构 | 公开资料约束的弹性墙壳、梁柱、桁架；独立规定风荷载；完整自由度 Newmark 动力与 X 向 TMD | 竣工模型、非线性配筋承载力、桩筏土共同作用、现场实测风响应 |
| 单桩 | 单根弹性梁与假定分层土弹簧/阻尼；独立合成荷载；桩位移、内力、界面反力 | 全楼沉降、947 根群桩响应、三维土应力、主楼与地基耦合 |
| CFD | 理想化孤立刚体的有限迭代平均流场；定性推吸、绕流与低速区 | 已收敛的局部设计压力、瞬时涡或阵风、结构压力输入、双向流固耦合 |

Diffusion 反演未执行。片尾“结构搭建与计算工作流”的软件组合是用户指定的名称，不能代替逐项运行证据。

## 证据入口

下列路径均相对项目根目录 `video_project/shanghai_tower/`；点击链接可直接查看。

| 检查事项 | 主要证据 | 已确认的范围 |
|---|---|---|
| 模型参数与来源 | [parameters.json](../research/physics-v10/inputs/parameters.json)、[计算说明](V10_CALCULATION_NOTES.md) | 公开资料、几何与材料假设、固定地面边界 |
| 实际节点与单元 | [coarse/graph.json](../research/physics-v10/coarse/graph.json)、[独立粗网格审计](../research/qa/v10-flow/structural-coarse-audit.json)、[精网格审计](../research/qa/v10-flow/structural-refined-audit.json) | 6,037 节点、5,412 墙壳、1,852 梁杆，96 个墙—伸臂共用节点；单位、连接、质量及荷载复核 |
| 单元与静力校核 | [膜试验](../research/physics-v10/verification/shell-patch-tests.json)、[壳弯曲/梁试验](../research/physics-v10/verification/shell-bending-and-beam-tests.json)、[结构校核](../research/physics-v10/verification/structural-qa.json) | 基准解、132 个水平切面、反向和半载、两种水平网格的整体敏感性；不代表局部应力收敛 |
| 模态与时间步 | [模态检查](../research/physics-v10/verification/modal-qa.json)、[时间步检查](../research/physics-v10/verification/dynamic-timestep-check.json) | 模态质量正交；时间步比较只覆盖 0—12 s，未宣称全时长时间收敛 |
| 主动力原始数据 | [dynamic/summary.json](../research/physics-v10/coarse/dynamic/summary.json)、[trace.npz](../research/physics-v10/coarse/dynamic/trace.npz) | 60 s、0.05 s、1,200 个收敛步；同目录保存真实 `u.npy`、`r.npy`、`axialMPa.npy`、`verticalMPa.npy` 及整秒原生四积分点结果 |
| 原始量到导出量 | [shell-export-facts.json](../research/qa/v10-flow/shell-export-facts.json)、[export/run-summary.json](../research/physics-v10/export/run-summary.json) | 四类二进制逐值等于原始数组；原生 N22/t 到 MPa；TMD 支点、元素力、运动方程和两项耗能一致 |
| 显示几何绑定 | [playback/audit.json](../research/qa/v10-playback/audit.json)、[wall-registration.json](../research/qa/v10-playback/wall-registration.json)、[独立源码审查](../research/qa/v10-flow/shell-playback-review.md) | 原 GLB 壳映射、仿射插值、归位及随机跳帧、TMD 与主模型一致；不是视觉成片验收 |
| 单桩验收 | [单桩说明](../research/physics-v7/pile/README.md)、[acceptance-provenance.json](../research/physics-v7/pile/acceptance-provenance.json)、[playback-qa.json](../research/physics-v7/pile/playback-qa.json) | 仅独立教学单桩；`acceptedForFilm=true`、`acceptedForEngineeringDesign=false` |
| CFD 验收 | [final-educational-cfd-acceptance.json](../research/physics-v7/final-educational-cfd-acceptance.json)、[V10 衔接说明](../research/qa/v10-flow/provenance-and-coupling-review.md) | 保持定性平均流场范围；严格残差目标未通过、网格独立性未通过、`acceptedForCoupling=false` |
| CFD 空间呈现 | [spatial-flow-check.json](../research/qa/v10-flow/spatial-flow-check.json)、[pressure-wind-check.json](../research/qa/v10-flow/pressure-wind-check.json) | 截面/速度插值、压力箭头符号与位置、世界坐标、跳帧确定性、资源释放；CPU 检查不冒充 GPU 画面验收 |
| 表述与冻结版 | [表述审查](../research/qa/v10-playback/scientific-wording-review.json)、[计算说明复核](../research/qa/v10-flow/calculation-notes-review.json)、[最终冻结清单](../research/visual/v10-final-lock.json) | 表述报告保留当时文件哈希；随后补充的计算说明以本轮复核哈希为准。冻结清单含源码、数据、音轨及 bundle 指纹 |

`research/qa/v10-flow/native-pressure-tractions-candidate.npz` 只是隔离诊断候选，不是生产结构荷载。`coarse/dynamic-incomplete-v0/`、`previous-production/` 以及早期 `public/physics/raw/` 不得用作 V10 全楼动力或无 TMD 对照的证据。

## 冻结与最终成片验收

最终冻结清单时间为 2026-10-09 11:24:00 UTC，冻结指纹为 `f6da6ed78a85ca57e2bb3790d0fa9bd1dac6da7c05d778b5bff6a3364c4c9424`。独立文档复核确认主响应、位移/应力二进制及元数据、环境响应和工程读数共 7 个生产文件同时匹配研究导出与冻结清单。

冻结预期为 15,712 帧、30 fps，即约 523.73 s（8 分 43.73 秒）。这是当前冻结版本的实际长度，不应称作已经满足“约 5 分钟”。若重新剪短，需要重新核对时间轴、音画同步和冻结清单。

正式文件为 [ShanghaiTower_1080p_v10.mp4](../delivery/ShanghaiTower_1080p_v10.mp4)，SHA256 为 `ce44a4d51522cf4b945e28b858f6938363a7e8f70979004efc971fe561a429f6`。

- [技术检查](../research/qa/v10-final/automatic-report.json)：1920×1080、30 fps、15,712 帧完整解码、无检测黑场、BT.709 标记一致，音画时长 523.733333 秒。
- [抽样视觉检查](../research/qa/v10-final/visual-review.md)：全部 491 个计划帧已查看，加上加密转场与帧差窗口共 672 个唯一编码帧；8 处分段接缝全部复核。未声称人工逐帧或全时长实时观看。
- [实际 AAC 检查](../research/qa/v10-final/audio/audio-wave-match.json)：与锁定母带及所选音乐匹配，实测 −15.03 LUFS、−1.65 dBTP；四处语音窗口及片尾音乐通过波形对照。未认证整片主观听感及所有读音。
- [独立转场复核](../research/qa/v10-final/independent-boundary-review.md)：记录构件交接、核心筒上下文恢复和上部结构退出镜头的加密检查。

完整参数与适用范围仍以上面的计算证据为准。交付文件、源数据及验收文件的最终哈希清单见 [交付校验_V10.json](../delivery/交付校验_V10.json)。
