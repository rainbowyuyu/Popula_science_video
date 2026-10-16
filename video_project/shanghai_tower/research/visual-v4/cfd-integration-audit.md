# CFD 接入只读审计（2026-10-09）

本审计只检查当前根任务的接入代码和保存的研究输出。没有把任何未收敛结果标记为 accepted，也没有修改 `public/physics` 的占位文件。真实三维未收敛预览在同目录的 `unaccepted-cfd-preview-30.jpg`、`unaccepted-cfd-preview-60.jpg` 和 `unaccepted-cfd-preview-90.jpg`；图面明确标注 `RESEARCH PREVIEW · UNACCEPTED RANS SNAPSHOT`、`not film / not design load`。

## 已确认安全的门禁

- `World` 只有在 JSON 的 `quality.acceptedForFilm === true` 时才创建 `ComputedWindVisualization` 或 `ComputedPressureVisualization`；失败会保留教学流线或结构视图。
- `scripts/promote_cfd_for_film.py` 拒绝 `acceptedForFilm` 不是 `true` 的源文件，拒绝缺失压力几何和非 `body-outward` 法线。
- 当前 `public/physics/computed-wind-paths.json` 和 `computed-pressure.json` 仍是占位文件，`acceptedForFilm: false`。当前生产片不会读入研究快照。
- `ComputedPressureVisualization` 的 shader 只添加独立 `computedPressureRgba` 属性，`restore()` 不覆盖结构应力 `color` buffer。
- 坐标转换代码把 CFD `[x,y,z]`（x/y 水平，z 向上）转成 Three.js `[x,z,-y]`；这是行列式为 +1 的旋转，压力点和外法线使用同一个变换，三角形索引无需翻面。

## 需要在下一次真实接入前修复的确定问题

### 1. 刚体压力窗曾经是布尔硬切

`World.update()` 原先把 `pressureWeight > .001` 传给 `PhysicsPlayback.deform`。压力场进入或退出时，几何会从位移放大值直接跳到 rest 位置。现已改为传入连续的 `pressureWeight`，并由 `deform()` 以 `gain × (1 − rigidWeight)` 连续回到 rest，再连续恢复结构位移。

Cp shader 窗仍为 `pulse(29, 29.3, 31.18, 31.5, u)`；当三维流线获准时，`World` 额外使用 `cfdRigidWeight = pulse(28.85, 29.5, 31.35, 32.15, u)` 覆盖完整流线进出段。这样即使 Cp 颜色先退场，流线仍在画面内时结构也不会突然恢复位移。`PhysicsPlayback.displacementAt()`、相机跟随和网格形变共同使用该连续权重。

### 2. 真实路径使用了错误时钟

`ComputedWindVisualization` 原先以 `s.time` 驱动 0–40 s 的 CFD `travelTime_s`。当前影片时间轴在 u29 风段约为 209–232 s，导致路径入场时已在末尾、随后循环回中段。现已改为 `u=28.85…32.15` 的局部归一化时钟映射到每条路径的 `travelTime_s`，入场从种子端开始，退出到路径末端。

### 3. 当前 surface-loads 法线数量与压力点不匹配

`research/visual-v4/flow-physics/fullscale/tower-crown-resolved/surface-loads.json` 的实际统计：

| 数组 | 数量 |
|---|---:|
| `points_m` | 4,334 |
| `cp` | 4,334 |
| `triangles` | 8,596 |
| `outward_normals` | 8,596 |

`postprocess_surface.py` 的 `n_s` 是每个三角形的法线，却写入 `surfaceGeometry.outward_normals`；`ComputedPressureVisualization` 要求每个点一个单位外法线，`promote_cfd_for_film.py` 目前会原样复制该数组，所以真实绑定会被长度校验拒绝。修复方式：在 postprocess 或 promotion 阶段先按三角形面积对节点法线做累计、归一化，并输出 4,334 个 `outward_normals`；同时只保留 tower 三角形或提供明确的 `triangleGroups`，不要把地面面片混入外幕墙注册。

当前 surface snapshot 还包含 4,538 个地面三角形和 4,058 个塔身三角形。它的 `quality.acceptedForCoupling` 为 false，不能通过门禁；该问题必须在接受前解决。

### 4. Cp 范围须与图例核对

未收敛快照的 Cp 范围为 `[-2.9329, 1.5506]`。组件默认范围是 `[-2.5, 1]`，会造成颜色饱和。接受时应从最终导出报告固定图例范围，记录是否有饱和点，并在片内明确显示 Cp 而不是 MPa 应力。

### 5. 研究快照不能称为已验证上海风场

研究路径和压力快照来自孤立的重建外形、预设幂律入口，且保存的是单一快照；其 metadata 明确为 `provisional-not-converged`。预览只能用于检查 Three.js 坐标、法线方向、配准可视性和运镜，不可用于结构荷载、设计风速或真实城市风环境的结论。

## 状态文字检查

- `Film/Stage` 现在分别维护 `flowAccepted` 与 `pressureAccepted`；只有 accepted pressure 才显示“实算 Cp · 刚体外形”。未接受时保持“风场机制示意 · 形变 ×48”，不会把占位或研究路径称为真实 CFD。
- 片尾标题仍为“结构搭建与计算工作流”，工作流文字保持 `Zwind + Diffusion + Iwind → AI engineer`。
- 结构工程读数的 `整楼横向风荷载` 来自已存的结构求解序列；它不应被文案解释为表面 Cp，二者需在讲解中区分。

## 验证记录

- `npm run check`：通过。
- `node research/visual-v4/check-pressure-component.mjs`：通过；解析表面 441 点，Cp 插值最大误差 `4.44e−16`，正压向内/吸力向外、无数据 inert、超距映射拒绝、结构颜色恢复均通过。
- `node research/visual-v4/render-unaccepted-cfd-preview.mjs`：通过，生成研究帧 30、60、90；三维 Cp 色场、外法线箭头和已保存 CFD 流线均来自研究快照，并在画面上标明未收敛状态。
