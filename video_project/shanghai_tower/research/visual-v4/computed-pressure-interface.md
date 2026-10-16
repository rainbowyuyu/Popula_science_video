# 实算风压显示组件：接入契约

组件：`src/ComputedPressureVisualization.ts`。本轮仅新增组件及隔离 QA，没有修改 `World.ts`、`Film.tsx` 或现有工程播放。

## 数据输入

```ts
type ComputedPressureData = {
  coordinates: 'metres, Three.js XYZ, Y up';
  normalConvention: 'body-outward';
  points_m: number[][];           // CFD 外壁节点，m
  triangles: number[][];          // 0-based 三角形节点索引
  cp: number[];                  // 每节点一个无量纲 Cp
  outward_normals?: number[][];  // 每节点一个单位外法线，实体 → 流体
  pressure_Pa?: number[];        // 可选，已转换成 Pa；当前只校验，不用来伪造 Cp
  provenance: Record<string, unknown> & {
    triangleWinding?: 'outward';
  };
};
```

- 必须先由真实求解导出器完成轴变换，再传给本组件。这里不二次转换 SU2 轴，不重新缩放压力或速度。
- `normalConvention` 必须为 `body-outward`。CFD 流域外法线可能指向实体，不能原样作为建筑外法线。
- 优先使用 `outward_normals`。缺失时只接受 `provenance.triangleWinding === 'outward'`，通过几何叉积得到三角形外法线。不依靠简单径向猜屋顶/塔冠法线。
- 正压作用于建筑的方向为 `−Cp × n_body`，因此 Cp > 0 向内推，Cp < 0 向外拉。
- 组件只校验数据形状、坐标、法线声明及有限值。**收敛、网格无关性、入口、残差、气动力积分等 CFD 可信度必须由求解流程独立验收。** `provenance` 不应把测试或未收敛输出描述为可靠结果。
- `null` / `undefined` 数据时组件完全不显示，不生成备用 Cp。

## 接入次序

```ts
const pressure = new ComputedPressureVisualization(scene, verifiedCpData, {
  geometryUnitsPerMetre: .01,      // 当前影片的 1:100 显示空间
  maxProjectionDistanceM: 1,      // 可审查的几何注册容差，不是 CFD 误差
  minimumCoverage: .995,
  cpRange: [-2.5, 1],            // 全局固定图例；须按最终解检查范围
});

// GLB 的 matrixWorld 与 .01 缩放已烘焙，尚未进行结构形变时：
pressure.bind(partId, restGeometry); // 仅 ENVELOPE...GLASS 外幕墙

// 每帧，原有 PhysicsPlayback.deform 和材质更新以后：
pressure.restore();              // 任意时序都不会破坏结构应力色
for (const glass of exteriorGlass) {
  pressure.updateMaterial(glass.geometry, glass.material, state);
}
pressure.update(state, camera);

// 清理
pressure.dispose();
```

`restore()` 不改 `geometry.color`、`material.color`、vertexColors、透明度、裁切平面、形变。它仅归零自己的 shader uniform 并隐藏自己的箭头。传 `restore(material)` 可只关闭一份材质。主循环始终调用 `updateMaterial` 时，区间外会自动权重归零；显式 restore 可作为新帧起点。

**风压段（u29–31.5）须由接入方关闭放大的结构形变。** 箭头锚点与表面 Cp 都属于未变形 CFD 外形。该组件不移动几何，也不会调用 PhysicsPlayback 的放大位移去“修饰”结果。若未来展示真实 FSI 变形，需提供与变形表面配套的压力映射。

默认时间包络 `pulse(29,29.3,31.18,31.5,u)`；第三阶段表示 u31.18 开始收回，u31.5 归零。`updateMaterial(..., weight)` 与 `update(..., weight)` 的最后一个参数可覆盖包络。箭头沿法线长出/收回，不瞬移；绕行到背面时保持 depthTest，并以掠射角平滑缩短可见箭头。

一份被 patch 的材质应专用于已绑定的外玻璃几何。不要把同一份材质同时复用给未绑定的梁柱；这和当前项目每个 GLB 子网格独立材质的结构一致。

## 映射与可审查误差

采用边界三角形 AABB BVH，寻找每个玻璃静止顶点的最近三角形，计算最近表面点的重心坐标，对节点 Cp 做线性插值。法线使用同一组重心权重。不是最近节点贴色，也不按迎风面虚构压力分布。

`bind()` 返回 `PressureMappingReport`，`pressure.mappingReports` 返回全部报告：

- `vertices` / `accepted` / `coverage`。
- `maxDistanceM`、`rmsDistanceM`、`p95DistanceM`。
- `maxAcceptedDistanceM`、`maxProjectionDistanceM`。
- `passed`、`meshId`、`method`。

投影距离超出容差的顶点保持原材质，不外插 Cp。接受率低于 `minimumCoverage` 时绑定直接失败，不悄悄画在不对应的模型上。实际数据到位后需要汇总这些报告并审查峰值距离；不可仅扩大容差让错误坐标通过。

这些距离只衡量显示表面与 CFD 边界的几何配准，不是压力误差，更不能替代网格收敛检查。

`sampleSurface(new THREE.Vector3(x_m,y_m,z_m))` 返回 `point_m`、`normal`、`cp`、`distanceM`、`triangle`、`barycentric`，可用于导出器独立抽查。

## 图例与显示比例

- 正 Cp：暖橙 `#d7653e`；负 Cp：青蓝 `#07869f`；Cp = 0：`#e5e8e2`。
- 两侧都以各自固定范围做线性颜色插值；超出范围仅颜色饱和，原始 Cp 数值不被改写。`pressure.cpExtrema` 提供原始 `{min,max}`。
- 图例必须匹配传入 `cpRange`，这是表面压力系数，不是结构应力 MPa。
- 箭头真实方向与 Cp 正负、外法线一致；显示长度比例默认为 20 m / Cp、半径 .55 m，随后乘影片 .01 空间尺度。这是易读的示意尺度，不是受力造成的位移。长度随 `abs(Cp)` 线性变化。
- 箭头上的沿程亮点仅指示作用方向，不代表稳态 RANS 有周期性压力波动。
- 默认 7 个高度层 × 8 个方位格，从有效投影点选择接近格心的样本。相同角度的背面箭头通过真实深度遮挡，不覆盖建筑表面。

## 已执行验证

1. `npm run check`：通过。
2. `node research/visual-v4/check-pressure-component.mjs`：通过。
   - 441 个解析平面点：Cp 插值最大误差 `4.440892098500626e−16`；距离误差 0。
   - 正压向内 / 吸力向外均通过。
   - restore 后保留 PhysicsPlayback 后续写入的 color buffer，通过。
   - 无数据不显示、错误坐标/法线约定拒绝、超距离映射拒绝，通过。
3. `node research/visual-v4/render-pressure-qa.mjs`：实际 WebGL shader 编译及出帧通过。
   - 已目视检查 `pressure-shader-qa.jpg`，暖橙向内、青蓝向外，色场与几何连续，原玻璃高光保留。
   - 图中明确写有 Synthetic fixture / not CFD / not in film。

`check-pressure-component.mjs` 与 `PressureShaderPreview.tsx` 只含解析测试夹具，不是 CFD 数据，不被生产视频入口导入。实算上海中心压力图的几何误差与最终画面仍需在真实求解通过后检查。
