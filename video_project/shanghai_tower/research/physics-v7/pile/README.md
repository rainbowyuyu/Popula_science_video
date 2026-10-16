# 单桩动力回放：范围、证据与接入

此处已经调用本机 Zwind/OpenSees 3.8 求解，数据可用于影片中的**独立单桩算例**。`acceptance-provenance.json` 的 `acceptedForFilm=true`，`acceptedForEngineeringDesign=false`。算例没有承接塔楼或 CFD 输出，不能把数值称为上海中心实际沉降、947 根群桩响应或地基安全结论。

## 资料和假设

资料为 Yi Zhu、Dennis Poon、Emmanuel E. Velivasakis、Steve Zuo、Paul Fu 的 *Structural Design Challenges of Shanghai Tower*。论文 PDF 留存在 `research/structural/zhu2012-http.pdf`，SHA256 为 `816ded5b30123c3701b339e8a8278b21b2cc1d076a0ed2dbd4adb6b146dd05b9`。发表年份未核实，不能从文件名推断为 2012。

PDF 第 8 页给出 947 根、直径 1 m、有效长 52–56 m 的桩、6 m 厚筏板以及土层分界；第 10 页给出筏板顶标高 −25.4 m。因此本算例取长 52 m，桩头深度以 25.4+6=31.4 m 推导，桩端深 83.4 m。它是依据文章推导的几何定位，不是竣工测量值。旧场景 −33 m 桩头位置不应沿用。

弹性模量 32 GPa、密度 2500 kg/m³、分层侧向及轴向弹簧刚度、桩端刚度 220 MN/m、阻尼比例参数 0.01 s 均为明确假设。桩头附加竖向荷载 8 MN，自重约 1.001 MN；桩头自由转动，未建群桩相互作用和筏板刚度。动力荷载是 40 秒合成试验：横向峰值包络 0.3 MN，竖向 ±0.4 MN，4 秒逐渐加载和卸载，24 秒后自由衰减。

土体采用线性弹簧和阻尼器。输出的土色带只能叫“桩土界面牵引”或“土弹簧反力”，没有求解连续土体应力、塑性、脱开、地下水或固结。

## 实际数值与校核

| 指标 | 结果 |
|---|---:|
| 静态桩头沉降，仅本假设算例 | 11.1204 mm |
| 桩头横移峰值 | 14.4315 mm |
| 弯矩绝对值峰值 | 549.628 kN·m |
| 剪力绝对值峰值 | 303.992 kN |
| 静态总竖向荷载 | 9.001276 MN |
| 桩侧 / 桩端竖向支承 | 8.388671 / 0.612605 MN |
| 第一自振频率 / 模态阻尼比 | 0.816437 Hz / 1.8811% |
| 方程相对残差 | 2.9664×10⁻⁹ |
| 能量相对残差 | 5.7293×10⁻¹⁰ |
| 0.25→0.125 m 网格加密剪力差 | 2.3751%，阈值 3% |
| 所选网格 0.01→0.005 s 时间步加密头位移 L2 差 | 5.3207×10⁻⁵ |

求解使用最大单元长度 0.125 m，Newmark γ=0.5、β=0.25、时间步 0.01 s。独立 NumPy 刚度、质量和阻尼矩阵复核运动方程与外功/能量闭合。所有步骤收敛；阻尼耗散随时间不减，卸载后的总机械能不增。详情见 `validation.json`、`fine-clock-qa.json`。

## 渲染接口

`playback.json` 约 7.1 MB，是实际结果的紧凑回放；`dynamic.json` 与 NPZ 保留完整结果。`pile-analysis.png` / `.svg` 是检查图。

- 坐标单位米，X 水平、Y 向上、Z 垂直计算平面。局部桩头是 `(0,0,0)`。地面世界 Y=0 时，桩头锚点 Y=−31.4 m；X/Z 由选择展示哪根桩决定。
- `nodeXYZ_m[56][3]` 和 `nodeDepthBelowHead_m[56]` 是参考位置与桩头以下深度，末节点深度 52 m。
- `dynamic.time_s[801]` 为 0–40 s，间隔 0.05 s。`static.loadFactor[41]` 为 0–1 静态加载阶段。两部分末静态/初动态坐标完全连续。
- `nodeU_m[t][node][2]` 是真实 `(ux,uy)`，单位 m。`nodeRotation_rad[t][node]` 是绕全局 +Z 的转角，单位 rad；以向下深度 s 为自变量时，梁横移导数 `dux/ds=rotation`，可用于 Hermite 插值。
- `soilForceOnPile_N[t][node][Fx,Fy]` 是土作用于桩的力：X 右正，Y 上正。它汇总细网格反力至最近显示节点。`soilEquivalentCouple_Nm[t][node]` 保存合并引起的等效力偶，保证总力矩一致。不要再把反力方向翻转。
- `axialTensionPositive_N`、`shearGlobalX_N`、`moment_Nm` 为 `[t][55段][headEnd,toeEnd]`，单位分别 N、N、N·m；轴力负值代表受压。显示段端取实际细网格端截面值，段内应力包络保留细网格最大值。
- `segmentNormalStressEnvelope_MPa[t][55]` 为细网格 `max(|N|/A+|M|D/(2I))`；这是非负桩身弹性正应力包络。推荐固定 0–16 MPa 色域。
- `shaftBinAverageTraction_Pa[t][node]` 是界面竖向反力除圆周分担面积，推荐 0–90 kPa 色域。它不是三维土体等效应力。
- 固定色域可采用轴压 0–8.5 MN、弯矩 −550–550 kN·m、横向土反力 −100–100 kN，避免每一帧归一化造成强弱错觉。
- 变形放大时明确标注倍率；箭头、色带、梁截面须一起跟随变形后的节点。土层边界保持资料给出的真实深度，不能为对齐旧模型而挪动。

## Diffusion 的边界

已检查本地 `OVOW/research/inverse_loads/neural_surrogate`、`temporal_diffusion` 及现有 NREL5MW / OC4 权重。其固定结构、响应通道和训练分布不适用本单桩土弹簧模型，因此这里没有调用不兼容权重，没有声称运行 Diffusion 桩土反演。

## 复现

从 `video_project/shanghai_tower` 运行：

```powershell
py -3.14 research/physics-v7/pile/solve_pile.py
py -3.14 research/physics-v7/pile/verify_fine_clock.py
py -3.14 research/physics-v7/pile/export_playback.py
py -3.14 research/physics-v7/pile/verify_playback.py
py -3.14 research/physics-v7/pile/plot_results.py
```

复现应在现有完整数值证据不需要保留或已备份时进行。验收文件记录后端二进制、源文件及生成物哈希，`verify_playback.py` 检查紧凑接口的形状、有限性、时间连续性、荷载撤除、四舍五入后的静态平衡和文件哈希。
