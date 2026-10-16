# 三维 CFD → 固定结构图：保守单向传力接口

本目录只准备映射和验证。**没有运行新的结构求解，也没有把测试载荷接入视频。** 当前随附的 `synthetic-*.json` / `synthetic-smoke/` 全部是合成数值自测，不能作为真实 CFD 结果。真实全尺度 CFD 的收敛与表面力积分由风场任务独立验收。

所有新增文件均在本目录内；`scripts/physics/`、`public/` 未修改。结构仍为 **1,541 节点、1,984 杆件、132 原有加载节点**，三维模型仍为 987 渲染部件。

## 可直接运行的工具

在 `video_project/shanghai_tower` 目录运行；依赖 Python 与 NumPy，不导入 OpenSees，也不启动求解器。

```powershell
# 14 项数值/接口自测
python -X utf8 research/visual-v4/one-way-coupling/test_mapping.py

# 重建明确标为 SYNTHETIC 的试件
python -X utf8 research/visual-v4/one-way-coupling/test_mapping.py --write-fixture

# 合成试件只允许隔离试运行
python -X utf8 research/visual-v4/one-way-coupling/map_cfd_layers.py --input research/visual-v4/one-way-coupling/synthetic-crown-and-torque.fixture.json --out research/visual-v4/one-way-coupling/synthetic-smoke --allow-unvalidated

# 真实 CFD 通过自身验收后使用；不带 --allow-unvalidated
python -X utf8 research/visual-v4/one-way-coupling/map_cfd_layers.py --input <accepted-cfd-layer-loads.json> --out research/visual-v4/one-way-coupling/accepted-cfd-candidate

# 重新读取落盘文件，复核节点、拓扑指纹、全局力和全局力矩
python -X utf8 research/visual-v4/one-way-coupling/validate_mapping.py --mapped-graph research/visual-v4/one-way-coupling/synthetic-smoke/structural-graph.cfd-candidate.json --qa research/visual-v4/one-way-coupling/synthetic-smoke/mapping-qa.json

# 用真实本地 Zwind/OpenSees 的六分量链路做隔离合成 smoke（不代表 CFD）
C:/Users/zju/AppData/Local/Programs/Python/Python314/python.exe -X utf8 research/visual-v4/one-way-coupling/run_cfd_coupled_candidate.py `
  --graph research/visual-v4/one-way-coupling/synthetic-smoke/structural-graph.cfd-candidate.json `
  --qa research/visual-v4/one-way-coupling/synthetic-smoke/mapping-qa.json `
  --out research/visual-v4/one-way-coupling/candidate-smoke `
  --duration 0.1 --synthetic-smoke

# 只读检查 candidate response（包含静力力矩、动态/TMD和六分量 NPZ）
python -X utf8 research/visual-v4/one-way-coupling/validate_candidate_response.py `
  --response research/visual-v4/one-way-coupling/candidate-smoke/candidate-response.json
```

映射输出：`structural-graph.cfd-candidate.json`、`mapping-qa.json`、`independent-validation.json`。输出路径被强制限制在本目录内。验证器是落盘一致性检查，不能代替 CFD 收敛、网格独立性或结构正确性的验收。

`run_cfd_coupled_candidate.py` 只读取 candidate graph，复用等效结构的建模/状态函数，并把所有风载作为六分量 `ops.load(tag,Fx,Fy,Fz,Mx,My,Mz)` 加入静力和动态模式；显式节点力矩不会被丢弃。它不会调用旧的 `run_zwind.py:main()`，因此不会重新生成旧的合成 Cp 图，也不会写 `public/physics`。每个运行目录包含候选响应 JSON、静力/动态 NumPy 数组和 OpenSees 日志。

正式运行（不带 `--synthetic-smoke`）必须同时满足：candidate `windLoadProvenance.acceptedForCoupling=true`；mapping QA `passed=true`、`sourceAcceptedForCoupling=true` 且拓扑指纹一致；132 个节点均有六分量载荷。未验收的 CFD 会被拒绝，不能靠参数绕过。`--synthetic-smoke` 只接受映射器明确标记为 `UNVALIDATED` 的合成候选，并在输出中写入 `productionAccepted=false`。

结构链路的静力检查同时比较合力和关于世界原点的总力矩；零风矩时使用与 `F×H` 成比例的浮点舍入容差。动态检查会验证失败步数、有限值、TMD 相对位移恒等式和质量方程残差。TMD 仍是单一 X 自由度教学设备，公共阵风因子会同时乘六个分量，语义为“CFD 平均载荷 + 指定阵风 → 单向结构响应”，不是瞬态 CFD。

## CFD 输入契约

完整示例见 `synthetic-crown-and-torque.fixture.json`；该例中的数值与合成声明不能用于真实结果。

```json
{
  "schema": "rainbow.cfd-layer-loads/1",
  "units": {"length": "m", "force": "N", "moment": "N m"},
  "coordinates": "CFD_Z_UP",
  "forceConvention": "fluid-on-solid",
  "bodySurface": "tower",
  "temporalKind": "steady-mean",
  "momentOrigin_m": [0, 0, 0],
  "heightRange_m": [0, 632],
  "quality": {"acceptedForCoupling": false},
  "provenance": {"solver": "actual solver name", "case": "actual case path"},
  "bins": [{
    "heightMin_m": 0,
    "heightMax_m": 632,
    "force_N": [0, 0, 0],
    "moment_Nm": [0, 0, 0]
  }],
  "integratedTotal": {"force_N": [0, 0, 0], "moment_Nm": [0, 0, 0]}
}
```

- `CFD_Z_UP` 表示 CFD 的 x/y 水平、z 向上。结构采用 Three Y-up：`[X,Y,Z] = [x,z,-y]`。此变换行列式为 +1，力与轴向力矩用同一个旋转矩阵。已转换载荷可声明 `THREE_Y_UP`，禁止再次旋转。
- `momentOrigin_m` 是输入坐标中的参考原点。可选 `translationToStructuralOrigin_m` 是在 **Three 坐标** 表示的输入坐标原点到结构世界原点坐标系的平移：`r_struct = R r_input + translation`。正常项目两者均为零。
- 每一高度带须包含三分量**力和力矩**，力矩都关于上述同一参考原点。仅有力无法恢复扭矩或偏心作用，不接受。
- 高度带须连续、不重叠、覆盖 0–632 m；推荐 8–10 m 或已有楼层标高分带。顶部封口等表面也须计入 tower。积分须是流体作用于建筑的力，不包含地面与远场。
- `integratedTotal` 须来自独立全塔表面积分，不应通过复制高度带求和伪装为独立验证。源程序要另与求解器报告的整体系数/合力核对。
- 可在高度带和 `integratedTotal` 内增加 `pressure`、`viscous`，各包含 `force_N` 与 `moment_Nm`；提供时程序核验二者之和。求解器输出若是系数，必须在导出端按正确参考动压、面积和长度转换，不能在此重复转换。
- `quality.acceptedForCoupling=true` 必须由 CFD 验收流程赋值。映射代码会执行守恒校验，但不会判断数值收敛是否真实。`--allow-unvalidated` 只用于隔离调试，生成的图与报告均保留未验收标签。

## 如何保守地分配六分量载荷

对高度带合力 F、相对于输入参考点的力矩 M，先转换到结构世界原点：

`F_s = R F`，`M_s = R M + (R origin + translation) × F_s`。

按高度带中点在相邻原有加载节点间取线性权重 w，`Σw=1`。超出结构最高 580 m 的高度带夹取到原有顶节点。令 `r_bar=Σ(w_i r_i)`，然后：

`F_i = w_i F_s`，`M_i = w_i (M_s - r_bar × F_s)`。

因此 `ΣF_i=F_s`、`Σ(r_i×F_i+M_i)=M_s`。先求加权作用中心，再分配剩余力偶，可避免对一个居中合力凭空添加一对抵消的节点力偶。高度带中点只是局部分配规则，真实积分力矩仍完整保留；本方法不恢复每个幕墙连接件的局部作用力。

数值自测：在 632 m 施加 CFD +X 方向 10 N，另有绕 CFD z 轴 75 N·m。Three 坐标全塔合力 `[10,0,0]` N，全塔力矩 `[0,75,-6320]` N·m。映射到 580 m 的节点必须额外施加 `[0,75,-520]` N·m，不能把 52 m 高差丢掉。试运行的力与力矩残差均为零。

## 最小后续接入修改（本次未实施）

| 位置 | 需要修改的内容 |
| --- | --- |
| `run_zwind.py` 入口与目录 | 另建隔离入口读取 candidate graph，指定研究目录的 OUT/RAW。**不能直接调用现有 main()**，它会重新调用 `graph()` 生成旧的 Cp 载荷并覆盖图文件。保留同一拓扑指纹和参数，不改截面/几何。 |
| `run_zwind.py::static_case / dynamic_case` | 原有 `ops.load(tag,*force,0,0,0)` 丢弃力矩。用 `ops_load_adapter.apply_wind_loads()` 或等价六分量调用。静力 gravity 与 wind 的累计数组须保留六分量。 |
| `run_zwind.py::reactions` | 外力矩须累计 `r×F + M`，不能只有 `r×F`。`sum_external_wrenches()` 支持三分量重力和六分量风载。静力检验六分量基底平衡。 |
| `run_zwind.py` 导出 | `baseAppliedForces_N` / `windAppliedForces` 同时导出 `baseAppliedMoments_Nm` / `moment`，附加载荷来源、输入哈希和时间语义。 |
| `run_environment.py::coupled_tmd` | 使用同一个映射图、同一风时程与六分量载荷。初次返回和 main 后的第二次 `windLoads` 赋值都加入 `baseMoment_Nm`；可复用 `load_metadata()`。 |
| `run_environment.py` 缓存/对照 | 用新载荷图与 source CFD 哈希区分缓存，不复用旧 `coupled-tmd-export.json`。同工况比较必须使用新 candidate 的主结构结果，不能把旧 Cp 工况叫作同工况基准。 |
| `export_cinematic_response.py` | 支持隔离的输入/输出路径，沿用正确的重力基线扣除；`netWindLoad_MN` 当前只是 X 分量总和，须明确标为 X 风力，或另算合力并改标签。必要时增加扭矩元数据。 |
| `qa_environment.py` | 风载一致性同时比较 F、M 与图/工况哈希。把旧的 `computedFieldAvailable is False` 检查改为与实际 CFD 验收状态和字段一致的检查，不能仅翻布尔值。 |

既有动态载荷函数是 10 s 平滑抬升后叠加 0.11/0.19/0.043 Hz 的指定谐波。若保留它，应把**整个六分量平均载荷**乘同一因子，并准确称为“CFD 平均风载 + 指定阵风时程 → 单向结构响应”。稳态 RANS 的伪时间迭代不能当作真实风随时间变化，也不能称为瞬态 CFD 或双向流固耦合。

若未来使用真实非定常 CFD，各节点/自由度通常需要分别的物理时程或经验证的低秩分解；单个公共时间因子仅适用于经验证可分离的场。结构变形不回写风场，因此仍是单向耦合。

TMD 目前只允许结构 X 方向相对运动；保持这一设置可以，但不能宣称抑制了全部侧向和扭转。既有核心筒 `J` 是近似等效扭转刚度，保留扭矩并不等于校准了真实塔楼扭转响应。独立单桩的 8 MN / 0.3 MN 示例不由整塔 CFD 自动推导，不能一起改称为真实整塔桩土耦合。

## 真正运行结构重算前的验收顺序

1. 风场验收实际求解器日志、网格、压力/黏性积分、符号、参考量和整塔合力/力矩；说明入口、周边城市与网格误差的局限。非收敛 smoke 结果保持未验收。
2. 导出连续全高度带及独立整体积分，运行 mapper 和落盘复核，保存 source/graph 哈希。
3. 在研究目录运行新的静力和动态结构工况，检查六分量平衡、时间步收敛、位移/应力场、TMD 平衡与能量、重力扣除和统一工况。
4. 完成数值检查后再整合视觉：压力/流线来自对应风场；变形/杆件应力来自对应结构时间步；箭头、场与模型共用坐标变换。放大展示必须标注倍率。

## 冻结资产与已有检查

| 文件 | SHA-256 |
| --- | --- |
| `public/models/shanghai-tower.glb` | `d0981ed1c7d6616341c9992249c3f1e010d4a7498a9aef0daf6e3349afa070b6` |
| `public/models/shanghai-tower-manifest.json` | `29d575f78dd4606259c5eb4ec232ad575ab69871be32a125f92c7d607fdcbd83` |
| `public/physics/structural-graph.json` | `633d41c10a6f27c49aac14f7e2803046b36fa44f445683f54b95745316802e79` |

mapper 还固定核验结构字段指纹 `6cbc87924dcbde647b980879eb7488d602d047fb94b2b57b89067c05c1d30a40`：节点、杆件、约束、支座、标高、参数和渲染映射保持不变。相同节点数量但几何/参数改变仍会拒绝。

已通过 14 项 CPU 自测：真实高差附加力矩、纯扭矩、居中载荷零伪力偶、参考原点与坐标变换、不重复变换、压力/黏性合成、缺失力矩拒绝、独立积分不一致拒绝、分带不完整拒绝、未验收源阻断、符号/单位/时间语义、拓扑和落盘篡改检测、同数量几何变化拒绝，以及假 ops 接收 132 组完整六自由度载荷。没有把这些检查表述为 CFD 或结构求解验证。
