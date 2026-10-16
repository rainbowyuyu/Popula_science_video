# 血压片 V8 血管细节设计

## 改动边界

本轮只改 `src/hypertension/VascularDetail.ts`。没有改 `World.ts`、`CameraPath.ts`、`Annotations.ts`、时间轴、人体模型或音频。原版留档为 `research/hypertension/VascularDetail-v7.txt`。

当前源 SHA-256：`c2bdb06a4447c274a3f59728cb624693236dadb7d11c103f6defd71568569575`。

根节点缩放、世界位置、已有 anchor、对象名称和已有顶点布局保持不变。新增网格只承担局部视觉提示，不能改变标注使用的 `smooth-muscle-wall`、`embedded-circumferential-muscle-bundle`、`ldl-receptor` 和 `particle` 拓扑。

## 小动脉镜头逻辑

1. **流向**：新增 24 个 `phase-locked-lumen-flow-tracers`。它们使用与红细胞相同的累计截面积映射和生产端 `flowPhase`，从小动脉近端向远端连续推进；跨过周期边界只发生一次正常回绕。六条原有流线加入极小的相位螺旋偏移，避免被看成静止的环线。
2. **收缩原因**：14 个已有平滑肌环仍在原来的轴向位置。收缩时按照 `contract × exp(-(x/.81)^6)` 形成中心更明显、两端更弱的局部波，并同步压缩环的径向厚度、提高很克制的暖色高光。镜头能同时看到“平滑肌收缩 → 管腔变窄”，没有脱离血管的装饰箭头。
3. **压强和流量**：壁层、压力箭头、脉搏环和粒子仍使用确定输入。新增标记不表示临床单位，也不冒充 CFD；画面只表达同一教学模型中的截面积变化和方向。

## VLDL → IDL → LDL 镜头逻辑

1. **卸载**：18 个甘油三酯货物不再直接从颗粒跳到组织。每个货物先从 VLDL/IDL 表面移动到对应的脂肪酶位置，再沿组织界面落下；卸载窗口内脂肪酶轻微亮起并做固定种子的微小位移，展示“酶促卸载”的因果顺序。
2. **颗粒连续性**：仍是同一颗粒逐步缩小，apoB-100 带状蛋白和胆固醇核心保留。`idl`、`ldl` 进度只改变颗粒尺度、核心显现和货物转移，不生成与前一镜头无关的新 LDL。
3. **受体结合与回收**：受体两臂随 `clearance` 对称收拢；新增 `receptor-capture-halo` 固定在受体局部坐标，只有接近阶段才出现。颗粒进入受体下方后，`endocytosis-cargo-in-vesicle` 的 12 个小点随囊泡收拢；后段受体向膜面轻微回弹，表达“结合 → 内吞 → 受体回收”，不声称分子级结构。
4. **肝脏回收旁路**：原 IDL remnant 路径保留，透明度和进度不改含义，只与主颗粒持续共享同一局部坐标系。

## 可复现检查

- `npm run check -- --pretty false`：通过。
- `node scripts/hypertension/audit_flow_v5.mjs`：通过；方向抽查 998 帧、132,978 个非回绕样本，负向非回绕步数为 0。恒定流量三种收缩状态最大 `A·v` 误差 0.5625%，小于 1% 判据。
- 直接执行当前 `ArterioleDetail.update()` 与 `LipoproteinDetail.update()`，每 17 帧抽查至 9670 帧共 570 个状态；所有对象变换和实例矩阵均为有限数值。
- `audit_spatial_v5.mjs`：通过（人体/肾单位/主动脉位置检查）。
- `audit_annotations_v7.mjs` 在其他源文件仍被主代理修改时出现 `sourceStable:false`；布局、遮挡、可读性和确定性检查无异常。待主代理冻结 `World.ts` 与 `CameraPath.ts` 后重新运行该审计。

这些检查验证的是生产几何、确定性动画和教学模型中的流向，不是患者个体生理、分子级模拟、GPU 像素等价或编码后完整观看结论。

