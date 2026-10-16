# v3 透明度、深度与离屏稳定性只读源码审查

日期：2026-10-09。输入冻结：`research/visual-v3/render-inputs.json`。本审查只读 `src/World.ts`、Three r180 的渲染实现与已冻结模型/求解数据；没有修改 `src`、`public` 或渲染输入。

## 结论

- **没有发现幕墙移到屏外后又因镜头旋转回到画面的代码路径。** 每一帧 `World.update` 都从当前 `camera.matrixWorld` 取屏幕右轴：幕墙分区在 `reveal` 中沿该轴以 `34 * (1-skin)` 的量移出，螺旋肋沿相同屏幕轴移出。外壳完整移出后，保守 AABB 加额外 1 个场景单位的视锥探针得到 `821280` 次检查、`0` 次进入视锥。求解变形最大边界（48×）为 `0.34735` 场景单位，小于探针余量。这证明逻辑上没有固定世界轴导致的“绕回”；仍需最终视频确认透明边缘与阴影。
- **`depthWrite` 是真正的单帧状态开关，存在可见排序跳变的可能。** 代码保持 `m.transparent = op < .999`，同时使用 `m.depthWrite = op > .94`。透明物仍进入 Three 的 transparent render list；深度写入只由阈值切换，不是 alpha 的连续变化。因此阈值前后一帧应重点看片段中的相交楼板、幕墙和内墙，而不能把它当作纯粹的渐隐。
- **`castShadow` 同样是阈值开关，但只影响太阳阴影图，不改变主体颜色。** 非 `ENVELOPE|FACADE|GLASS` 的 mesh 使用 `opacity > .5` 才投射阴影；因此半透明结构本身会连续变淡，但其阴影可能在一帧加入/移除。三.js 阴影通道以独立 `MeshDepthMaterial` 绘制，shadow material 使用 clipping planes；不存在“透明材质自动产生半透明阴影”的连续过渡。

## 实际 CPU 探针结果（不是像素 QA）

运行：`node research/visual-v3/transparency-readonly-probe.mjs`。结果保存于 `transparency-readonly-probe.json`。探针使用冻结 `World.update` / `CameraPath` 和 manifest AABB，不建立 WebGL context，因此不宣称替代视频查看。

| 事件 | 帧 / semantic u | 估计影响范围 | 解释 |
|---|---:|---:|---|
| 玻璃 depthWrite 关 | F113 / u1.441 | 60 个外玻璃分区，60 个在视锥 | 片头揭幕；opacity 0.94026→0.93908，透明度几乎不跳，排序标志会跳 |
| 玻璃 depthWrite 开 | F528 / u3.245 | 60 / 60 | 片头合回；opacity 0.93875→0.94008 |
| 多构件 depthWrite 关 | F2093 / u10.249 | 725 总数，229 AABB 在视锥 | 核心筒剖切开始附近；同时包含 FLOOR_BEAMS、MEGACOL 等 |
| 多构件 castShadow 关 | F2137 / u10.463 | 725 总数，218 在视锥 | 同一核心剖切窗口，opacity 0.50386→0.49116 |
| 多构件 castShadow 开 | F2557 / u12.251 | 725 总数，196 在视锥 | 核心剖切结束，opacity 0.49032→0.50329 |
| 多构件 depthWrite 开 | F2600 / u12.447 | 725 总数，311 在视锥 | 透明过渡返场，排序标志会跳 |
| 玻璃 depthWrite 开 | F5886 / u27.243 | 60 / 60 | 花园/外壳回归结束，opacity 0.93899→0.94044 |
| 风场玻璃 depthWrite 关 | F6866 / u31.734 | 60 / 60 | 风场透明展示；opacity 0.94227→0.93935 |
| 风场结构 depthWrite 关 | F6875 / u31.775 | 116 / 116 | 风场透明窗口，含外框/楼面；opacity 0.94406→0.93835 |
| 风后结构 depthWrite 开 | F7480 / u34.148 | 116 总数，66 在视锥 | 返回阻尼器前的透明恢复 |
| 风后玻璃 depthWrite 开 | F7488 / u34.182 | 60 总数，36 在视锥 | 幕墙恢复，opacity 0.93783→0.94125 |
| 顶部核心 castShadow 关/开 | F7604 / u34.674；F8515 / u38.332 | 8 / 8 | 顶部阻尼器窗口；CORE_Z09、FLOORS_Z09 透明影子可能单帧变化 |

以上事件按每帧状态变化提取；探针共找到 47 个阈值事件（28 depthWrite、19 castShadow），其中 46 个有保守视锥交集。它们是**待看窗口**，不是已经确认的视觉故障。`opacity` 本身在事件两侧只变化约 0.001–0.02，若画面看到明显闪变，优先归因于深度/阴影状态或透明排序，而非解算位移。

## Three.js 渲染依据

- Three r180 `WebGLRenderLists.js` 将 `material.transparent === true` 的对象放入 transparent list，并按 `reversePainterSortStable`（深度反向）排序；`depthWrite` 不会把对象移出 transparent list。因此阈值开关会改变相交透明物的深度缓冲，但不是绘制分类的连续 alpha 插值。
- Three r180 `WebGLShadowMap.js` 为投影物复制 depth/distance material；只要 `object.castShadow` 为真且通过阴影相机视锥，就会进入阴影 pass。透明度没有自动乘入阴影 alpha（此模型没有 alphaTest/map），所以 `.5` 阈值确实是硬切。
- 主玻璃明确排除投影：`mesh.castShadow = !/ENVELOPE|FACADE|GLASS/.test(id) && opacity>.5`；幕墙本身不会在这些事件中产生太阳阴影跳变，但其背后的 FLOOR/CORE 支承可能会。

## 最终抽查帧建议

每个事件至少查看 `F-2,F-1,F,F+1,F+2`，尤其：

- F111–115、F526–530：片头玻璃揭幕/合回，观察外幕墙与内框是否突然盖住核心。
- F2089–2097、F2133–2141、F2553–2561、F2596–2604：核心九格剖切，观察楼板/巨柱的透明排序与太阳阴影是否跳一下。
- F5882–5890、F6862–6879、F7476–7492：外壳、风场与流线相接窗口。
- F7600–7608、F8511–8519：阻尼器顶部核心及透明支承影子。

如果这些 ±2 帧都没有单帧跳变，则阈值风险可以接受；若出现跳变，最小修复应是同一视觉窗口内锁定 `depthWrite=false` 或把 `castShadow` 固定为窗口起点状态，但这需要新的渲染输入审批，当前冻结阶段不改。

## 探针边界

探针未执行 WebGL 阴影光栅化、透明排序、裁剪封口或顶点颜色变形，也没有断言 AABB 相交等于像素可见。它只能验证离屏方向和阈值发生位置；最终判断仍以导出影片连续帧为准。
