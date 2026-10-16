# V4 心血管与代谢细节模块

`src/CardioDetail.ts` 封装真实米制局部模型；`src/CardioVascularDetail.ts` 改编旧血压片的分层小动脉。没有移动或修改原 Human Atlas 网格，没有把教学动态称为个体仿真。

## API

```ts
const cardio = new CardioDetail();
world.add(cardio.root);
cardio.arteryRoot.position.copy(aorticAnchor);
cardio.arteryRoot.rotation.z = -Math.PI / 2; // 仅当降主动脉长轴沿 Y
cardio.arterioleRoot.position.copy(arterioleAnchor);
cardio.lipidRoot.position.copy(plasmaAnchor);
cardio.nephronRoot.position.copy(corticalAnchor);
cardio.lipidWallRoot.position.copy(endotheliumAnchor);
cardio.update(time, mode, progress);
cardio.setVisibility({artery:0,arteriole:0,lipid:0,nephron:0,lipidWall:0});
```

各公开 root 的自身 scale 为 1；各局部坐标是米。机位应靠近模型，不应放大模型。模式有 `pressure / resistance / salt / renal / nephron / lipid / clearance / lipid_wall / plaque / thrombus`。`updateState({view,time,progress,cameraDistance})` 是等价入口，cameraDistance 留给调用方控制。

`setVisibility()` 默认全零，传入连续的透明度权重。`update()` 不根据模式硬切各根节点。`setArteryShellVisibility()` 可以单独淡出大血管壁、流向标记和压力箭头，保留壁内的泡沫细胞/斑块。镜头切入细胞之前，建议用 3–5 秒逐渐降低前层权重。

`getAnchors()` 提供世界坐标：artery、arteryWall、arteriole、arterioleWall、lipid、lipidParticle、lipidSource、lipidClearance、lipidWall、lipidWallMembrane、lipidWallRetained、nephron、glomerulus、tubule、plaque、foamCell、thrombus。根节点绑定到人体后重新读取，不能缓存绑定前的坐标。

`getLabels(mode)` 返回 `{text, point, side}`，不自行绘制字体；统一交给影片的 Rainbow Sans 标签系统。`getPhysicalState()` 返回教学模型动脉压力和当前脂蛋白直径。

## 代表尺度与镜头

| 模型 | 尺度 | 建议镜头 |
|---|---|---|
| 动脉剖面 | 内径 10 mm，长 40 mm，局部长轴 X | 镜距 60–90 mm，逐步露出剖窗 |
| 小动脉 | 管腔直径 200 μm，红细胞直径 7.5 μm | 镜距 3–5 mm 建立，再靠近肌层 |
| 脂蛋白 | VLDL 50 nm，IDL 过渡到 LDL 22 nm | 膜片建立 600–900 nm，再推到颗粒 130–180 nm |
| 内皮局部 | 1.2 μm 宽，约 250 nm 厚的局部组织片 | 镜距 2–4 μm；LDL 保持 22 nm |
| 泡沫细胞 | 约 20 μm（代表性机制细胞） | 镜距 65–85 μm，宏观管壁透明度接近零 |
| 肾单位局部 | 约 2.14 × 1.64 mm，肾小球约 200 μm | 镜距 5–7 mm 建立，再靠近肾小管 |

主动脉壁内斑块位于局部 `(0.002,-0.0046,-0.0018)`，隆起方向为局部 +Y。斑块/血栓镜头应沿局部 +Y 偏 +Z 观察，例如 target + `(0.001,0.007,0.0035)` 米，避免从侧面隔着完整管壁观看。近景把宏观壁透明度降到 0.08–0.15，并保持它在拉远时恢复。

`lipid_wall` 模式显示内皮跨越和早期泡沫细胞，抑制毫米级脂质池/纤维帽，以免它们盖住细胞镜头。建议从 `lipidWall` 锚点拉到 `foamCell` 锚点，再逐步恢复毫米级斑块。真实 LDL 在毫米视野中不可见；模块不会人为把它做成大油滴。

## 动画含义

- 小动脉保留旧模型的内皮、肌层、外膜、分支、连续剖口和跟随肌层的收缩。红细胞按 7.5 μm 校准。
- 50 nm 脂蛋白保留单层磷脂头部、apoB 带状示意、胆固醇/中性脂质核心。逐渐卸载后同一颗粒成为 22 nm LDL，随后与肝细胞膜 LDL 受体结合、内吞。画面是分子机制连续示意，不把外周脂解和肝脏回收当成同一个真实纳米位置。
- 内皮片显示局部跨细胞运输示意及内膜滞留；它不穷尽所有 LDL 入壁通路。毫米级脂质池代表长期累积，泡沫细胞和真实粒径 LDL 是另一级观察。
- 肾小球毛细血管、肾小管滤液和周围毛细血管分开；红细胞始终在血液内，不进入滤液。水钠回收由管腔方向流向周围血液。水钠光点是方向标记，不按分子尺寸画实物。
- 动脉压力样本复用本地已检验的两元 Windkessel 数值解：`public/cardio/physics.json`。方程 `C dP/dt = Qin - (P-Pv)/R`，同一输入流量对比不同顺应性。它只给出时间压力，不能称局部 CFD 场。原求解脚本留存为 `solve_pressure_source.py`，复用时需调整其原工程输出路径。

## 解剖资产

`scripts/prepare_cardio_assets_v4.py` 从旧片 `kidneys.glb` 提取 leftKidney、rightKidney、adrenals。三个文件均保留原始米制顶点、轴向与位置，只选择 GLB 场景根；不会再次居中。`public/models/manifest.json` 只新增这三条，完整来源、哈希和中心见 `cardio-assets.json`。

来源：BodyParts3D 4.0，human-atlas commit `1c38bf35c254a891200d3cedecfd57abebe83d8d`；解剖数据 CC BY 4.0，应用 MIT。原署名文件继续适用。

## 内容依据与边界

- Feingold, *Introduction to Lipids and Lipoproteins*, Endotext，2024-01-12。旧片已读原 PDF 第 4、7、14–15 页，留存在 `topology_optimization/research/hypertension/medical-v4-evidence.md`。
- NHLBI Atherosclerosis / Blood Cholesterol：LDL 滞留、炎症、斑块与破裂后血栓。高血压与动脉粥样硬化须分清，不能把多数高血压解释成油脂堵塞。
- NIDDK, *Your Kidneys & How They Work*：肾小球过滤、肾小管回收及红细胞/大分子留在血液。
- Maaliki 等 2022，盐敏感高血压机制，DOI `10.3389/fphys.2022.1001434`。高盐并不必然直接开启循环 RAAS；神经与激素线路应另行准确放置。

## 检查

`node scripts/qa_cardio_v4.mjs` 在当前几何上运行 9 模式 × 5 进度，核查坐标/实例矩阵有限、公开根统一尺度、50→22 nm 粒径比例。`node scripts/review_cardio_v4.mjs` 渲染模块实图。它们不替代影片整合后的转场、遮挡、字幕和整片观看检查。
