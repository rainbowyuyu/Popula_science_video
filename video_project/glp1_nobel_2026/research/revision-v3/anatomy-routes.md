# V3 解剖路线资产与接入记录

本次产物使用 BodyParts3D 4.0 成人男性参考图谱的共享坐标，补充 3 个真实来源的 GLB、11 段血管内路线、2 条依据解剖标志绘制的迷走神经参考路线。图谱中未找到迷走神经实体网格，因此没有把手绘神经标成真实解剖重建。

## 来源与坐标

- 原始项目：<https://github.com/ashemag/human-atlas>，提交 `1c38bf35c254a891200d3cedecfd57abebe83d8d`。
- 原始数据：BodyParts3D 4.0，CC BY 4.0；作者署名保留在 `public/models/manifest.json`。
- 本地来源：`D:/python_project/manim_extend_rainbow/human-atlas-audit/ashemag-human-atlas-1c38bf3/public/models`。
- 单位为米，+Y 向上、+X 为受试者左侧、+Z 为前方。新增 GLB 原样复制来源位置字节和三角索引；不对单个器官居中或缩放。
- 可复现脚本：`research/revision-v3/anatomy-build.py`；导出器复用 `scripts/prepare_assets.py`。

| 新增资产 | 来源部件 | 用途 |
| --- | --- | --- |
| `brainstem.glb` | FMA79876 的 11 个图谱部件，详见 manifest | 脑干解剖参照 |
| `pancreatic_arteries.glb` | FJ3421、FJ3640、FJ3433、FJ3430、FJ3444 | 腹腔干、脾动脉及真实胰动脉分支 |
| `portal_tributaries.glb` | FJ3438 | 回肠静脉参照 |

`brainstem.glb` 是现有 `brain.glb` 中部件的子集。整合时不能让两份共面的脑干部件同时以完整不透明度显示；应隐藏重复部件，或只选择一份资产显示。

## 血液路线

路线从源血管网格的闭合横截面提取，并以线性折线插值。渲染器复制源血管表面几何，添加移动发光区域；不生成新的血管管道。默认不显示腔内小点，开启时半径不超过 0.25 mm，并按较细血管的实测几何余量缩小。发光区和小点是功能性提示，不表示 GLP-1 分子的真实尺寸、浓度或实际流速。

| 路线 ID | 源部件 | 已验证长度 / mm | 小点整体至管壁的连续保守余量 / mm |
| --- | --- | ---: | ---: |
| `ileal_tributary` | FJ3438 | 27.961 | 0.679 |
| `superior_mesenteric_vein` | FJ3647 | 141.996 | 0.858 |
| `hepatic_portal_vein` | FJ1853 | 45.709 | 2.387 |
| `middle_hepatic_vein` | FJ2414 | 22.134 | 2.399 |
| `inferior_vena_cava` | FJ3441 | 22.367 | 3.297 |
| `ascending_aorta` | FJ3413 | 53.200 | 2.372 |
| `aortic_arch` | FJ3411 | 107.750 | 3.908 |
| `descending_aorta` | FJ3427 | 214.009 | 5.643 |
| `celiac_trunk` | FJ3421 | 17.190 | 2.417 |
| `splenic_artery` | FJ3640 | 37.878 | 0.844 |
| `great_pancreatic_artery` | FJ3433 | 8.759 | 0.153 |

这些是经过验证的子段，不能称为完整、连通的循环系统重建。例如肝中静脉只保留能够可靠确认在腔内的流出段，未把分叉截面质心强行串成穿出管壁的路径。

动画顺序为回肠静脉 → 肠系膜上静脉 → 门静脉 → **肝窦未建模区间** → 肝静脉 → 下腔静脉 → **右心、肺循环、左心未建模区间** → 升主动脉 → 主动脉弓 → 降主动脉 → 腹腔干 → 脾动脉 → 胰大动脉 → **胰岛微循环未建模区间**。所有分段间都不插值或画桥接管线；未建模区间隐藏移动信号。不得出现从肠直接通向胰腺的假血管。

内源性活性 GLP-1 在肠与肝被大量降解，只有部分进入体循环；动画中的信号数量不能解释为质量守恒、浓度或全部分子都抵达胰腺。

## 迷走神经参考路线

`vagus_left_reference` 与 `vagus_right_reference` 从延髓表面参照点向颈部、胸部、食管旁及近端胃/腹腔区域展开。路线依据颈动脉鞘相关位置、主支气管后方和食管邻近位置作几何约束；左侧经食管侧方转为前干参照。路线没有从小肠直连脑部的捷径，也未伪造未建模的末梢神经网络。

两条参考线的显示直径为 2 mm。这是示意选择，不是对该图谱个体的测量，也不是迷走神经直径的普遍生理常数。颈部迷走神经的实际位置和尺寸存在个体变异。画面应保留 `迷走神经路径示意 · 非个体重建` 标识；线上移动亮点表示传入神经功能信号，不能配成激素分子在神经中运输。

## 几何与模块校验

- 血液路线累计 9,324 个稠密采样点，采样间隔不超过 0.08 mm；所有中心点都位于其源血管封闭网格内。检查使用射线奇偶法和真实三角面最近距离。
- 以采样最大间距的一半扣减最近面距离，再扣除显示小点半径，得到沿实际线性插值路线的整体余量下界。最小值为胰大动脉的 0.152868 mm；没有仅检查控制点而忽略插值段。
- 两条神经各 650 个中心样本均位于对应高度的皮肤闭合截面内。皮肤来源是薄双层外壳，不能把其射线奇偶结果误当成实心躯干；本检查使用实际水平封闭轮廓。
- 神经对已检查的食管、支气管、颈动脉和颈静脉源网格保持分离；扣除 1 mm 线半径及采样间距后，最小整体余量为 1.108546 mm。躯体包容检查针对中心样本，不声称已经验证整根管线在全部体表内。
- 正面和侧面投影已查看，路线未出现明显向体外大幅绕行的弧线。投影图仅是源坐标几何参考，不能代替最终视频的遮挡、光照、透明度和镜头检查。
- `npm run check` 已通过。无渲染器的模块检查解析实际 GLB，挂接 11 个血管表面高亮；再次挂接为 0，验证幂等；运行 201 次更新，端点有限且正确，血液 `TubeGeometry` 数量为 0，资源释放完成。
- 未执行主视频渲染或浏览器打包。最终编码视频 QA 由主任务继续执行。

详细结果分别见 `anatomy-validation.json`、`anatomy-neural-clearance.json`、`anatomy-module-check.json` 和 `anatomy-route-projections.png`。几何约束只验证路线与选定图谱实体的关系，不等于对真实个体迷走神经、微循环或全身全部解剖实体的验证。

## 接入

```ts
import {AnatomicalRoutes} from './AnatomicalRoutes';

// 由现有 manifest loader 加载所有 GLB 后调用；此类不重复加载 GLB。
const routes = await AnatomicalRoutes.load(base + 'models/anatomical-routes.json');
worldRoot.add(routes.root); // 与器官共享父级，保持 identity transform
routes.attachSurfaceHighlights(worldRoot);

routes.update(timeSeconds, {
  blood: bloodAlpha * (1 - microWeight),
  nerve: nerveAlpha * (1 - microWeight),
  bloodProgress: normalizedSectionPhase, // 可选；0..1 覆盖完整循环顺序
  showLumenMarkers: false,
});

// 卸载时释放复制的表面几何、shader 和示意神经资源。
routes.dispose();
```

`bloodProgress` 缺省时按每阶段 1.35 秒循环；传入时允许主任务控制完整血液章节中的顺序。`bloodRouteIDs` 可选地筛选显示段，但不重写生理顺序；空列表隐藏所有血液路线。`routes.routes`、`routes.getRoute(id)` 和导出的 `sampleAnatomicalRoute` 可供镜头定位使用。

`blood` 和 `nerve` 是宏观场景的透明度控制，调用方应在微观镜头进入时减至零。血管高亮同时检查源网格及所有父级的 `.visible`，但不会自动读取源材质透明度；器官渐隐阶段仍应由调用方降低血液权重。神经标识可直接读取 `routes.requiredNerveCaption`。

## 已核验文献

1. Hammer et al. *Cervical vagus nerve morphometry and vascularity in the context of nerve stimulation — A cadaveric study*. DOI: [10.1038/s41598-018-26135-8](https://doi.org/10.1038/s41598-018-26135-8)，PMCID: PMC5964190。支持颈部鞘内位置及个体变异；本图的 2 mm 显示直径不冒充该研究测量值。
2. *Anatomy of mediastinal veins and nerves*. DOI: [10.21037/med-20-65](https://doi.org/10.21037/med-20-65)，PMCID: PMC10226887。支持迷走神经相对颈动脉、主支气管、食管及神经丛的走行关系。
3. Müller et al. *Glucagon-like peptide 1 (GLP-1)*. DOI: [10.1016/j.molmet.2019.09.010](https://doi.org/10.1016/j.molmet.2019.09.010)，PMCID: PMC6812410。支持内分泌与神经作用路径区分，以及活性 GLP-1 的肠肝降解。

以上全文已通过 Europe PMC 获取，相关段落和抓取哈希保存在 `anatomy-sources.json`。本次检索使用 nature-academic-search 工作流。

## 交付一致性

`anatomical-routes.json` 的 SHA-256 为 `e72ea3011bfa392cf79f20f244ccdf5cd8ccb2625fbb6bcf7c0f194d2e643147`，与 manifest 一致；3 个新增 GLB 的实际 SHA-256 也全部匹配 manifest。生成资产、路线模块和本报告均限于本子任务获准范围；未改动主任务负责的镜头、世界场景或影片组件。
