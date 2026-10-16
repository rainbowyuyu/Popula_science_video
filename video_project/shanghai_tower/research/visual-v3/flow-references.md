# v3 风与力的可视化参考及实现边界

日期：2026-10-09（Asia/Shanghai）。本次只修改 `src/WindVisualization.ts`、`src/EnvironmentPlayback.ts`；旧后者快照为 `EnvironmentPlayback.before.ts`，SHA256 `64139be4536cb97d741c4259fbbc494b97eadc8768559b1f399ad7cb47f27061`。

## 实际读取的公开资料

| 来源 | 实际读取范围 | 本片借鉴点 |
|---|---|---|
| [Three.js r180 官方宽线例子](https://github.com/mrdoob/three.js/blob/r180/examples/webgl_lines_fat.html)／[在线示例](https://threejs.org/examples/webgl_lines_fat.html) | 下载官方源文件，HTTP 200；重点阅读 `Line2`、`LineGeometry`、`LineMaterial`、`linewidth`、虚实线配置 | 用屏幕像素宽度解决远景中普通 WebGL 单像素线太淡的问题。静态流路使用 1.1/2.0 px 宽线，未变形/位移参照分别用 2.8 px 虚线和 3.7 px 实线。 |
| [Three.js r180 LineMaterial](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/lines/LineMaterial.js) | 下载官方实现，HTTP 200，检查宽度、分辨率、虚线与深度关系 | 保留透视遮挡；使用 `worldUnits: false` 和实际 viewport 更新。采用现有 Three.js 依赖中的官方组件，没有复制来源代码。 |
| [Mapbox WebGL Wind](https://github.com/mapbox/webgl-wind) | README 与 `src/shaders/draw.frag.glsl` 均实际下载，HTTP 200 | 借鉴持续运动的粒子尾迹比静态密集线更容易表达方向的方式，以及有限色阶层次。没有导入其气象数据，也没有声称运行该项目的流场求解。 |

本地保留本次实际读取的文本：`three-lines-example.txt`、`three-line-material.txt`、`webgl-wind-readme.txt`、`webgl-wind-shader.txt`。上述借鉴是源代码与呈现机制的研究，不声称已用浏览器观看来源的完整动态演示。

## 视觉设计

- 风路从 84 条细线减为 **20 条**：5 个高度 × 4 条前后侧路径，清楚露出塔前与塔后的绕行关系。
- 每条路径一段方向连续的三角带尾迹，RGBA 透明度与宽度沿尾部渐收；宽度为 4.1/6.4 px，随相机远近换算为世界宽度。尾端收细，前端小粒子指明方向。只在一个中部近身路径用琥珀色作为阅读重点，其余为青蓝色。
- 不在每句解说重置相位。尾迹由 `physics.physicalTime(state)` 和既有 `appliedForceFactors` 的积分确定；随机跳到任意帧也能得到相同几何。路径随同高度的 `displacementAt` 移动。
- s029 起在现有流路的下游加入低幅蛇形尾涡示意，10 条近塔线偏转明显、10 条外围线仅轻微跟随；起点在塔外保守包络之后，不增加线或粒子数量。振荡使用同一 `physics.physicalTime`，s031 内平滑拉开不同高度的相位，配合“错开涡脱落节奏”的解说。未增加任何 CFD 或涡脱落频率的定量主张。动态宽线路径复用 GPU 缓冲区，避免逐帧分配。
- 靠近核心筒与巨柱时降低流带权重，优先读应力与力。接近减振器时整层风路从画面右侧移出；旧风路不留在减振器机制特写中。
- 暖橙色粗杆锥头表示模型的节点净风荷载。7 个代表箭头来自实际存储的节点和 `baseForce_N × windFactor`，同一显示长度尺度，头部始终落在已变形的真实施力节点。小型节点环是锚点标记。首批实帧中发现锥头被核心筒挡住后，已将这组明确标为“节点净风荷载”的注释箭头设为透视显示，以保留从杆身到锚点的完整方向；构件几何仍保留正常遮挡。
- 巨柱的双端箭头来自真实 `N = σ × A_m2` 风致轴力增量；拉向向外、压向指向所选构件端部。蓝/橙符号与原应力增量图例一致。箭头和杆件色带分别表达力与应力，不能将二者解释成同一物理量。
- 桩头、桩侧及桩端箭头加粗，端头清楚，反力方向来自既有数值。小亮点只是方向提示，不是新增的力计算。

## 真实性范围

解析圆柱绕流路径仅用于解释“迎风—绕行—背风”的空间关系；塔体高度变化用保守外包络控制路径间距；下游低幅蛇形尾流是显式添加的机理示意动画，不是势流本身求出的尾涡。它不是上海中心三维 CFD，不表示实际速度矢量、湍流涡量或外墙局部吸力。青蓝/琥珀颜色不是风压色标，尾迹速度不是按米每秒标定的物理读数。不得给这层画面加上 CFD、实测流场或局部压力的说明。

实际执行的结构响应来自已有 Zwind/OpenSees 数据，求解数据没有改变。暖橙箭头属于核心节点上的等效净风荷载，不搬移成未经计算的外墙面风压力。构件应力增量保持固定原图例及放大倍数；没有通过改数值加强色彩。

## 验证

`check-flow.ts` 直接实例化这两个类和既有求解播放器，对基础、巨柱、风、TMD 共 10 个代表帧检查几何有限值、透明度范围、节点箭头锚点及随机帧确定性。结果保存在 `flow-geometry-qa.json`：所有检查通过，最大风荷载箭头头部位置误差约 `5.2e-16` 个 Three.js 世界单位。该 CPU 检查不代替实际渲染后的画面复核。

运行方式：

```powershell
node --input-type=module -e "import {build} from 'esbuild'; await build({entryPoints:['research/visual-v3/check-flow.ts'],outfile:'research/visual-v3/check-flow.bundle.mjs',bundle:true,platform:'node',format:'esm',packages:'external'}); await import('./research/visual-v3/check-flow.bundle.mjs');"
```

并行模块写入后，`npm run check` 已通过。已实际查看第一批 `tmp/stills/frame-6400.jpg`、`frame-7100.jpg`、`frame-7380.jpg`、`frame-7820.jpg`：风尾迹明显可见，减振器段已移除风。发现荷载头部遮挡后已修改注释箭头的透视关系、缩小节点环，待集成后重渲确认；整片编码检验仍由集成阶段执行。
