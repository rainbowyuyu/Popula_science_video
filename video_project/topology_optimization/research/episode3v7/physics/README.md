# 榫卯亭子：可追溯的数值计算

这些结果来自 `frame-contract.json` 中同一个亭子的真实节点、构件中心线、截面和屋面边界。它是保留原攒尖亭外观的参数化示教模型，不是某座历史亭子的实测复原，也不是可直接施工的结构设计。

## 实际调用的软件

- **Zwind / ZDyn 3.7.2 原生结构内核**：实际调用已安装的 `zdynpywin.zdyn` 二进制；不是把风机示例的反力缩放给亭子。记录二进制路径、版本、SHA256、脚本 SHA256、模型输入 SHA256。
- **独立 D2Q9 BGK LBM**：Python/NumPy 计算两个不同的二维截面绕流，输出计算得到的速度场和压力系数。它不属于 Zwind 的建筑 CFD 功能。当前 Zwind 安装中的 AeroDyn 是转子/翼型气动力接口，未发现可用的任意建筑 CFD 接口。
- **图扩散正则化反算**：使用图热方程与原生有限元响应矩阵，反算四个屋面的已知合成风压。这里的 diffusion 是空间平滑数值先验，不是训练过的生成式扩散模型。

## 结构计算

坐标是 Blender Z-up，长度 m，力 N，力矩 N·m，应力 Pa。显示 MPa 时除以 1,000,000；Three.js 对应 `[x, z, -y]`。

模型用 3D `elasticBeamColumn`；几何偏心通过实际 `rigidLink beam` 表示。四个柱脚按六自由度固定，基本工况按刚接框架处理。木材 E=9 GPa、G=0.56 GPa、密度 460 kg/m³ 是建模假定，不是实测材料参数。另在物理梁件端点计算 20、200、2000 kN·m/rad 的转动弹簧敏感性；连续梁内部的网格细分节点不加人为转动弹簧。这些参数不是已经标定的真实榫卯本构关系。

风压工况采用 12 m/s、空气密度 1.225 kg/m³，屋面 Cp=+0.6 / −0.4 / −0.5，杆件孤立阻力系数 1.2。它们是明确写出的工程演示输入，不是 LBM 推导的设计风压、特定地区规范荷载或极端风认证。每片屋面分配节点力时同时保持合力和对全局原点的力矩。屋面面积质量 35 kg/m²。单元自重与屋面质量均列在边界条件文件。

计算自重、单独风载、组合及 45°/90° 风向。瞬态使用 Newmark 法、0.01 s 步长、12 s 时长、1200 步；两个平滑阵风脉冲，2/10 Hz 参考频率附近假定 3% Rayleigh 阻尼。位移放大仅可在可视化时进行，并应标识，不能改动结果文件中的真实位移。

每个构件保留 native 端力、节点位移、支座反力以及沿单元的截面应力包络。截面颜色表示轴力加双向弯矩产生的正应力包络，**不是**木材的 von Mises 应力，也不是榫头、木销或接触面的局部三维应力。所有静力工况检查全局合力与合力矩平衡。

`part-analysis-coverage.json` 对全部可见零件逐件说明：

- `beam_solve`：对应实际 native 单元编号，可显示截面应力及反算回代结果。
- `pressure_panel`：屋面压力面和附属瓦面，可显示压力，未解局部壳应力。
- `base_reaction`：石础映射柱脚反力，不显示石材应力。
- `connection_hardware_analytic_nominal_demand`：8根木销根据真实梁端力计算名义双剪和承压需求；这不属于接触有限元。
- `nonprimary_component_not_solved`：围栏、台基等未进入主框架结构求解的显示件保持中性色。

`peg-connection-demands.json` 使用同一几何清单里的 28 mm 销径、80/100 mm 榫厚、实际柱颊厚度，逐一追溯对应的 native 梁端。输出名义双剪 `τ=V/(2A)`、榫侧承压 `V/(d·t)`、每侧柱颊承压 `(V/2)/(d·t_cheek)`。分别保留梁轴合力分配给销与全部垂直销轴合力分配给销两种假设，实际分担比例未求解，也不把它们称为严格上界。节点力矩和沿销轴力单独列出，没有把未解析的弯矩藏入一个虚构剪力。原生局部力转换到全局后逐项与 native 原始端力校验。静力、瞬态、已知/反算荷载都有8销结果；这不能替代接触、木材劈裂或承载力验算。

## 反算的闭环验证

用四片屋面的单位 Cp 荷载分别调用原生 ZDyn，构造位移影响矩阵 H。图热扩散 `dCp/dτ = −L Cp` 生成空间平滑的已知合成风压，正算得到位移，再添加固定种子的 0.2% RMS 噪声。三分之二位移分量参与反算，其余留出验证。

目标为 `min ||H_train Cp − y_train||² + λ ||L Cp||²`，归一化 λ=1e−5。记录矩阵秩、条件数、风压恢复误差与留出位移误差。反算完把估计风压**重新施加到 native ZDyn**，输出真实已知荷载与估计荷载下的每件端力、应力及逐件误差。没有把扩散后的颜色当作结构应力。

这一验证只说明在给定模型、指定的四维压力基底、合成观测与噪声水平下的恢复效果。它不证明现场任意分布荷载可以唯一反演，也不包含裂纹、开缝、滑移和损伤识别。

## 独立二维绕流

`flow.json` 是前排柱截面（Blender y=−1.5 m）；`central/flow.json` 是中截面（y=0 m）。每个截面独立计算，不能把一张切片复制到多层来声称三维 CFD。前排切片屋顶交线低于尖顶，是实际平面与斜屋面相交的结果；中央截面包含屋尖，但不含平面外的四根柱。

固体边界直接从模型构件截面和屋面多边形切取。D2Q9 碰撞/迁移、流固边界 link bounce-back；入口平滑启动、Zou/He 速度边界，出口零梯度，顶部自由滑移。流线用 RK2 在最终求得的速度场中积分。格子 U=0.035、ν=0.06；这是低 Reynolds 数、二维层流演示，不能当成真实大气高 Re 三维湍流。

初版固定密度出口出现强声波反射，被 QA 拒绝。最终检查除有限值和 Mach 数外，要求最后五个检查点每个入口/出口通量差 <1%、200 步速度场相对变化 <0.2%；同时核对控制体质量储存与离散净流入，残差 <1e−8。通过后才标为数值准稳态。所有时间序列、诊断图和原始数组保留，可检查此前的收敛过程。

## 文件与复现

主要输出：`result-summary.json`、`static-cases.json`、`dynamic-response.json`、`inverse-diffusion.json`、`boundary-conditions.json`、`part-analysis-coverage.json`、`qa.json`。反算中的 `true_native_result` 与 `recovered_native_result` 使用相同响应 schema。两个流场各有 `lbm-raw.npz`、`lbm-flow.json`、`lbm-qa.json`、`flow.json`。

在 `D:/python_project/manim_extend_rainbow/video_project/topology_optimization` 运行 PowerShell：

```powershell
& 'D:/Zwind_example/Zwind_example/1/Zwind_example/.venv/Scripts/python.exe' scripts/physics_v7_probe.py
& 'D:/Zwind_example/Zwind_example/1/Zwind_example/.venv/Scripts/python.exe' scripts/physics_v7_native.py
& 'D:/Zwind_example/Zwind_example/1/Zwind_example/.venv/Scripts/python.exe' scripts/physics_v7_pin_demands.py
& 'D:/Zwind_example/Zwind_example/1/Zwind_example/.venv/Scripts/python.exe' scripts/physics_v7_lbm.py --steps 18000
& 'D:/Zwind_example/Zwind_example/1/Zwind_example/.venv/Scripts/python.exe' scripts/physics_v7_lbm.py --plane-y 0 --out research/episode3v7/physics/central
& 'D:/Zwind_example/Zwind_example/1/Zwind_example/.venv/Scripts/python.exe' scripts/physics_v7_plot.py
& 'D:/Zwind_example/Zwind_example/1/Zwind_example/.venv/Scripts/python.exe' scripts/physics_v7_validate.py
```

`native-probe.json` 记录原生悬臂梁与 Euler–Bernoulli 解析解对照；最终验收还必须检查所有输出的 `input_sha256` 等于最终合同，不允许用 provisional 结果交付。

## 渲染中的有符号截面应力

`src/episode3v7/StressField.ts` 不依赖 Three.js，接收数组或 `{x,y,z}` 向量。使用未拆解、未放大变形的原始装配顶点：

```ts
const coordinate = prepareCoordinate(member, [nodeA.xyz, nodeB.xyz], vertexThree);
const signedPa = sampleSigned(frameResponse, coordinate);
const envelopePa = sampleEnvelope(frameResponse, coordinate);
```

`sampleSigned` 返回实际梁截面纤维正应力，正为拉、负为压，单位 Pa。遵守 ZDyn/OpenSees 局部轴 `y=vecxz×x`、`z=x×y`，局部内力 `−(1−s)fi+s·fj`，公式 `σx=N/A+My·z/Iy−Mz·y/Iz`。`roll_vec` 是 vecxz，不是局部 y 方向。截面外顶点、缺失端力或错误单元返回 `undefined`，不能当成零应力；纵向超出单元端点会取最近端截面，并设置 `axialCoordinateClamped`。

`sampleEnvelope` 只插值已保存 `sectionSamples` 的绝对值包络；它不是某个表面纤维的有符号应力。跨越弯矩变号位置时，离散包络插值可能高于精确截面包络。两种场须分别标识。模块缓存不可变响应对象的单元索引，避免每个顶点重复扫描整栋亭子。

新原生基准包括轴向拉伸、两个方向的悬臂弯曲、任意方向且带 roll 的悬臂、中央受荷简支梁。`physics_v7_stress_validate.mjs` 直接执行实际 TypeScript 模块，对全部5个原生静力工况的12430个截面、49720个角点以及11300个包络中点核验，结果在 `stress-field-validation.json`。悬臂根部与简支梁中部的上下拉压符号相反；亭子实际梁还叠加轴力和端约束，不能统一画成“上压下拉”。示例中 `PURLIN_Y_LEFT` 的177号单元中段确实上压下拉，可用于相应解说。

```powershell
& 'D:/Zwind_example/Zwind_example/1/Zwind_example/.venv/Scripts/python.exe' scripts/physics_v7_stress_probe.py
node scripts/physics_v7_stress_validate.mjs
```

这里仍是均匀矩形梁截面近似。榫槽、倒角和木销孔的网格外形不会自动使它成为接触有限元，不能据此给出槽边应力集中或局部破坏结论。
