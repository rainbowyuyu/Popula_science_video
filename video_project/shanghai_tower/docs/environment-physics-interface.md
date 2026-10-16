# 环境与阻尼器：实际求解数据和显示接口

本页已对齐 v7 final3 的生产输入；最终 MP4 仍待完成本轮编码与独立验收。状态以 `docs/UPGRADE_V7_STATE.md` 及 `research/visual/v7-final-production-lock3.json` 为准。当前 TMD / 主楼、单桩与 CFD 是三个分别定义的工况，不构成流固或整楼桩土耦合。

数据：`public/physics/environment-response.json`，schema `rainbow.shanghai-environment/1`。接口概览：`environment-interface.json`；数值验收：`environment-qa.json`；运行摘要：`environment-summary.json`。原有 `response.json` 和 `structural-graph.json` 未重写，哈希在 provenance 中保存。

部件级可视化索引：`public/physics/component-response.json`（schema `rainbow.shanghai-component-response/1`），由 `scripts/physics/export_component_response.py` 从冻结的 `response.json`、环境响应和模型 manifest 生成，并由 `qa_component_response.py` 校验。它把 705 个可拆分结构部件关联到 1,984 个实际求解等效杆件，提供每个部件 1 秒采样的轴向应力、端点位移和峰值时刻。核心墙的同一等效杆可能对应多个可见墙片，因此映射引用允许重复，但求解杆件的并集必须精确覆盖；画面不能把重复墙片当成额外杆件。另有 282 个幕墙、连接、楼板和设备部件明确标记为 `teaching-geometry-no-equivalent-solver-member`，只可展示几何和拆解，不能涂成求解应力。

## 执行链和核查

`scripts/physics/run_environment.py` 实际加载 `D:/python_project/os2zwind/bin/opensees.pyd`，经本地 `zwind` 封装调用 OpenSees 3.8.0。运行Python为本机3.14，并拒绝不同后端回退。

环境基线重新执行了耦合TMD动力分析，导出之前没有保存的节点速度、加速度、装置力，以及核心筒风弯矩。每秒结果与冻结原模型对照：最大节点位移差 `2.73e-8 m`、轴应力差 `7.12e-6 MPa`、TMD相对位移差 `3.13e-7 m`，在数值容差内一致。下文历史静力桩例题与当前独立动力桩也实际通过该二进制求解，分别保留验收证据。

环境基线的独立 `qa_environment.py` 共19项检查通过：数据有限性、时间轴、原结果哈希、位移恒等关系、动力平衡、耗散单调、原主楼位移对应、真实施加风力对应、桩段长度、自重单位、反力平衡、线弹性比例关系、核心应力公式等。JSON舍入后的TMD动力平衡绝对残差小于0.0051 N；历史静力桩例题反力平衡小于0.001 N。求解器未舍入的质量方程最大残差约 `2.98e-8 N`。这些结果不替代当前动力桩或 CFD 的独立验收。

## 同步播放TMD与主楼

`tmd.time` 为0–60秒，步长0.05秒，含首尾1201采样。所有TMD一维信号均与它对应，不用正弦动画替代。

- `supportX_m`：核心顶端等效支点的X位移。
- `massX_m`：质量块绝对X位移。
- `relativeX_m`：质量块减支点的相对位移；把它加在模型质量块静止位置上。固定铜板与框架随支点，质量块与磁阵随相对位移，吊索连接两者真实端点。
- `supportVelocityX_m_s`、`massVelocityX_m_s`、`relativeVelocityX_m_s`：节点求解器直接输出速度。
- `supportAccelerationX_m_s2`、`massAccelerationX_m_s2`：求解器直接输出加速度，非差分拟合。
- `springForceOnSupport_N`、`damperForceOnSupport_N`、`forceOnSupport_N`：作用在塔体支点上的物理力，+X为正；质量块受其反力。
- `massRayleighForce_N`：继承原模型Rayleigh质量阻尼对质量块的附加力，已计入动力平衡。
- `dissipatedEnergy_J`：对 `c·v_relative²` 梯形积分的粘滞耗散，单调非减。
- `nodeIds`、`nodeXYZ_m`、`nodeU`：133个核心层节点的相同时间轴位移。`nodeU`为相对重力平衡态的风致位移，单位米、Three Y-up。

由于重算证实为同一耦合工况，主楼各杆件可以继续读取冻结 `response.dynamic` 的位移/轴应力，只需共用 `physicalTime`。风段至TMD段使用连续的0–60秒映射，超过端点不得循环跳回。若时间压缩，主楼、质量块、风力因子与应力必须一起压缩。

本例：质量1000公吨，弹簧约475729 N/m，粘滞系数约110357 N·s/m，等效调谐摆长20.614 m。**20.614 m是由本教学模型频率推导的等效长度；现场报道中的12根、25 m钢索是几何资料，两者不可混称。** 支点峰值约0.7243 m，质量块相对峰值约1.8079 m，60秒粘滞耗散约1.499 MJ；它们是规定风输入下的教学结果，不是实楼测量。

## 实际风力与构件应力

`tmd.windLoads.nodeIds/nodeXYZ_m/baseForce_N` 是冻结图中实际施加到核心节点的净风力。每一采样的力为 `baseForce_N × tmd.windFactor`。箭头应指向**变形后的该节点**，不得贴到任意幕墙面上称局部风压。未乘时变因子的合计基底水平力约29.117 MN。

`memberStressStats`给出完整时域内固定量程。当前真实轴应力增量范围可用：巨柱±6 MPa、角柱±4 MPa、伸臂±110 MPa、环带±55 MPa。同一镜头应固定色标；切换量程必须换图例。全球统一48 MPa会使巨柱颜色近白，但不能通过逐帧自动归一化虚构强响应。

Z04 / C03 斜腹杆局部对照镜头采用单独的固定 ±15 MPa 量程，并配套 6 m/MN 的力箭头长度映射；这是明确标示的局部镜头量程，不改写以上全楼角色量程或物理力值。

核心轴向应力增量接近0，主要以弯矩抵抗侧推。新增 `tmd.coreWindSection` 直接读取本次实际求解局部端力并扣除重力态，包含：

- `time[61]`：0–60秒、1秒步长。
- `memberIds[132]`、`nodeIds[132][2]`、`sections`：等效核心梁及截面数据。
- `momentY_Nm`、`momentZ_Nm`：`[时间][构件][两端]`，以统一内部截面符号记录风致弯矩。
- `axialMPa`：风轴应力增量。
- `extremeMPa`：两端中较大的 `|N/A|+|My|·cz/Iy+|Mz|·cy/Iz`，单位MPa。

该极纤维法向应力包络为**无符号大小**，峰值5.6996 MPa，建议固定0–6 MPa单向色标，图例写“核心弯曲应力·等效截面”。它不是细分墙板或连接件的von Mises应力；十字/切角核心的几何边界不一定同时取到所有极值，因此该公式是截面外缘的保守包络，不冒称每一点实际墙应力。不能与带符号的巨柱轴应力增量共用“拉/压增量”色标。

## 历史环境基线：静力单桩—分层土例题

本节只说明 `environment-response.json` 中保留的历史静力字段，不是当前 `PileDynamicsVisualization` 使用的动力桩。该局部模型为52 m长、1 m直径的二维弹性梁，56个节点。桩头局部坐标 `(0,0,0)`，Y向上，深度向下；历史场景使用 `pile.headDepthBelowGrade_m=33`，对齐冻结主GLB的筏底及桩群顶部−33 m，桩底−85 m。Zhu设计稿的筏顶−25.4 m加6 m筏板对应−31.4 m；Gong所述33 m是基坑深度，不能据此声称筏底竣工标高。历史33 m算例曾实际重算土层弹簧，不能与下节31.4 m动力工况混用，或只平移模型而不重算层界关系。

`pile.stages` 含41个静力加载步；`loadFactor` 为0–1，表示加载进度，**不是固结时间**。加载包括8 MN向下头力、0.3 MN水平头力及1.001276 MN桩自重。界面力与桩端力之和需平衡约9.001276 MN竖向总力，而非8 MN。

- `nodes[k].xyz_m`：第k个桩节点局部静止位置。
- `stage.u_m[k][0/1]`：水平/竖直位移，单位米；`settlement_m[k]`为向下正值。
- `sideReactionOnPile_N[k][0/1]`：土对桩的水平/竖直反力；土承受其反向力。箭头终点取变形后桩表面。
- `toeReactionOnPile_N[0/1]`：桩端支承反力。
- `sideShearStress_Pa[k]`：竖向界面反力除以该节点分摊周长面积，是界面剪应力，不是连续土体应力。
- `axialForce_N[k]`、`moment_Nm[k]`：相邻节点间梁单元内力。
- `soilLayers`：公开设计稿土层名称/地面下界限；地面至桩头以上土层为环境背景，不是本例梁单元。

本例满载：桩头沉降10.7164 mm，桩端反力0.572962 MN，桩侧竖向反力8.428315 MN。土层弹簧刚度、端弹簧、材料E和加载大小全为明确列出的教学假设。未模拟土塑性、开裂、脱开、地下水有效应力、固结、桩群作用或整楼基础柔性，不用于真实桩承载力和沉降预测。

## 当前生产：独立单桩静力与动力例题

当前生产读取 `public/physics/pile-dynamics.json` 与 `public/physics/pile-dynamics-provenance.json`，由 `PileDynamicsVisualization` 展示。完整求解输入、静力结果、40秒动力结果、网格与时间步核查在 `research/physics-v7/pile/`。桩长52 m、直径1 m，桩头深31.4 m按Zhu设计稿筏顶−25.4 m与6 m厚度推导；它不是竣工实测值，也没有改写冻结主GLB的−33 m基础几何。两者之间的镜头衔接是独立例题的空间说明，不能解释成整楼基础重新求解。

工况先施加8 MN竖向头载与约1.001276 MN桩自重，再施加规定的40秒合成动力载荷：0.3 MN侧向包络及±0.4 MN竖向调制，随后卸载衰减。分层线性弹簧、阻尼、E=32 GPa等均为教学假设；动力载荷没有来自塔体反力或CFD。求解最大单元长0.125 m、时间步0.01秒，生产回放步长0.05秒；回放降采样不等于求解网格。静力桩头沉降11.1204 mm、桩端反力0.612605 MN、桩侧竖向反力8.388671 MN，仅适用于这一例题。

对应 provenance 中 `acceptedForFilm=true`、`acceptedForEngineeringDesign=false`。数值检查覆盖独立静力解、梁后端基准、力矩平衡、能量平衡、时间步和网格敏感性；完整验收以 `research/physics-v7/pile/validation.json`、`fine-clock-qa.json` 及 `public/physics/pile-dynamics-provenance.json` 为准。只将实际梁位移、内力及桩土界面反力/剪应力绘成结果；没有连续土体应力场、塑性脱开、地下水固结、桩群或整楼基础柔性计算。当前位移显示×300，不回写原始物理量。

## 当前生产流场、Iwind、Diffusion与工作流标识

当前三维流场实际运行的是 OpenFOAM v1912 `simpleFoam` / kOmegaSST。细网格1243872单元、粗网格589972单元；生产场来自原生SIMPLE迭代2050、VTK索引2205，两者都不是物理秒。入口为均匀30 m/s、地面为滑移边界，使用理想化独立塔体。生产展示文件为 `computed-pressure.json`、`computed-wind-paths.json`、`computed-flow-slices.json`；原生体场SHA256为 `270b9f6e8f0d8d8e2e9d1369574ef47374c4819c30b9a3fb359d038ee5163901`。

当前权威判定在 `research/physics-v7/final-educational-cfd-acceptance.json`：`acceptedForFilm=true`，但 `acceptedForEngineeringDesign=false`、`acceptedForCoupling=false`、`strictResidualTargetPassed=false`、`gridIndependent=false`。画面短标识为“理想化平均流场”。允许解释宏观绕行、侧方加速、下游低速区及相对平均压力符号；不能把局部压力峰值、尾流精确尺寸或动画粒子说成已解析的瞬态涡流。100/300/500 m同位置速度差RMS/Uref分别为4.39%、3.06%、2.58%，表面Cp差RMS为0.137；这是双分辨率敏感性，不是网格无关性或工程误差保证。独立科学复核及生产绑定检查见 `research/qa/v7-cfd-scientific-review.md` 和 `research/qa/v7-cfd-production-binding-review.md`。

冻结环境基线中的 `flow.computedFieldAvailable=false`、此前SU2候选的 `acceptedForFilm=false` 和二维Re=100截面记录属于历史数据，不是当前OpenFOAM生产场的许可状态。结构预设风载与CFD场独立，没有将CFD压力传给塔体或单桩；未声称运行实楼风洞。

本地Iwind目录为Remotion产品影片/预览适配器，未找到可运行的建筑CFD后端；Zwind3.0目录无可执行工程。已发现的OVOW/BESO Diffusion检查点限于NREL5MW-OC4等既定模型，不能跨域给上海中心或单桩生成风压、反演或结构结论。片尾标题为“结构搭建与计算工作流”，用户指定的“Zwind + Diffusion + Iwind → AI engineer”是组合标识；实际执行仍按上述本地Zwind/OpenSees与OpenFOAM分别记录，不能将标识当作全部工具均已参与求解的证明。

## 复现

下面命令重建TMD及历史环境静力桩基线，不会生成当前动力桩或OpenFOAM生产场：

```powershell
& 'C:/Users/zju/AppData/Local/Programs/Python/Python314/python.exe' scripts/physics/run_environment.py
python scripts/physics/qa_environment.py
```

`--reuse-tmd`只复用同一冻结图/响应哈希下已经实际算出的TMD缓存，同时重新执行历史静力桩例题；不生成替代时程。原始节点/装置力数组在 `public/physics/raw/environment/`。当前动力桩的复现说明与脚本见 `research/physics-v7/pile/README.md`、`solve_pile.py`、`export_playback.py`、`verify_playback.py`；CFD原始场、配置哈希及计算验收入口见 `research/physics-v7/final-educational-cfd-acceptance.json`。冻结生产输入期间不得重算覆盖这些文件。

显示倍率必须与当前源码和画面标注一致：主楼×48、当前独立单桩位移×300、TMD相对承挂点运动×1，均不写回物理米值。×80只属于历史静力桩显示。

显示几何补充：TMD承挂框架与铜板随主楼放大位移移动，质量块相对承挂点运动保持1×，因此画面中的质量块绝对位移不能当作原始物理米值。当前动力桩以1 m真实直径渲染：`ringRadius = diameter_m × worldUnitsPerMetre / 2`；旧环境静力桩的半径0.0075渲染单位（1.5 m显示直径）加粗只属于历史显示，不用于当前动力近景。
