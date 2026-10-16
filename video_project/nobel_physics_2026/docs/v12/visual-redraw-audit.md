# V12 可视化重绘审阅与接入说明

核验日期：2026-10-07（Asia/Shanghai）  
审阅对象：V11 论文重绘版、独立 V12 组件  
审阅范围：Canvas 几何、论文事实与动效连续性；不包含完整播放、声音、发音和逐句音画同步验收。

## 论文依据

V12 的动效只使用论文已经给出的机制关系，数字继续从 `research/nobelphysics2026/facts-v08.md` 和本地原始 PDF 读取：

- KVA *Scientific Background 2026*，pp. 5、8–10：中微子相互作用产生带电轻子/粒子簇射，超过冰中光速后产生 Cherenkov 光；光学模块记录到达时间和光子数。
- IceCube Collaboration, *Evidence for High-Energy Extraterrestrial Neutrinos at the IceCube Detector*, **Science 342 (2013) 1242856**：28 个事件、预定义背景下 4.1σ。
- IceCube Collaboration, *Observation of High-Energy Astrophysical Neutrinos in Three Years of IceCube Data*, **PRL 113 (2014) 101101**：37 个候选事件、5.7σ；event 32 是一对偶然重叠的背景 μ 子，在需要单一方向时排除。
- IceCube et al., *Multi-messenger observations of a flaring blazar coincident with high-energy neutrino IceCube-170922A*, **Science 361 (2018) eaat1378**：约 290 TeV；0.06° 是两个中心方向的间隔，不是误差圈半径。
- IceCube Collaboration, *Evidence for neutrino emission from the nearby active galaxy NGC 1068*, **Science 378 (2022)**：`79^{+22}_{-20}` 是拟合的天体物理中微子过量，不是逐个确认的 79 个中微子。

## V11 中仍显得粗糙的具体位置

1. `DetectorRedrawV11.ts` 的 `cascade()` 早期版本使用从原点发散的规则射线和大尺度环，容易被看成“烟花”或整个探测器都在爆炸。级联物理上应是相互作用点附近的紧凑、各向异性簇射；光学波前需要保持更大尺度并单独标识。
2. `arrivalRibbon()` 只抽样若干 DOM 并把它们放到一条屏幕横线。若横线的光点运动没有和三维 DOM 的同一到达时间绑定，观众会看到“图表自己跑、探测器另一套节奏”的割裂。
3. `CosmicOpusV11.ts` 的三条信使路径已具备方向差异，但路径、标签和粒子光点仍可在一个共享源点/地球锚点上做更平滑的阶段化出现，减少“先画线、后补标签”的卡片感。
4. `EvidenceFigureV11.tsx` 的论文窗口已保留坐标轴、图例和边框，但切图时可增加“先锁定图中数据区域，再完整展开”的焦点动线；不要把整页论文缩到无法读的大小，也不要用假数据覆盖原图。

## 新增 V12 原语

`src/physics2026/VisualPolishV12.ts` 是独立 Canvas2D 文件，V11 无依赖、无运行时随机数和无 CSS 动画：

- `drawCascadeV12`：以固定伪随机种子生成局部各向异性簇射，主轴、横向宽度和深度都由同一相互作用锚点投影；三层等值线只作体积提示，局部光学波前半径受限，不冒充真实 3DGS 或原始事件坐标。
- `drawMuonTrackV12`：用
  `t_i = s_i/(βc) + |r_DOM − r_emit|/(c/n)`
  计算每个教学 DOM 的到达时间；空间 DOM、底部时间带和光点高亮读取同一 `t_i`，消除轨迹与进度条脱节。
- `drawMessengerPlateV12`：质子、伽马射线、中微子共用源区和地球锚点，质子路径弯曲、伽马路径衰减、中微子保持直线；三条路径分阶段进入并由相同摄影机方向退出。
- `drawVisualPolishV12`：按 `003/008/009` 提供可选接入口。集成时应在原 V11 精确数据层下方或同层替换对应组件，避免两套同名径迹叠加。

## 接入顺序

1. `WorldV12` 中先保留 V11 的背景和文字安全区。
2. 在 `drawScene` 的 `messengers`、`track`、`cascade` 分支中调用 `drawVisualPolishV12`，并把原对应粗粒子层关闭；不要把 V12 再覆盖一次 V11 同名画面。
3. 保持 `c.save()`/`c.restore()` 和 `rect(104,314,925,586)` 的教学区域裁切；V12 原语不绘制到字幕和论文卡片区域。
4. 对 `track` 和 `cascade` 使用相同的相互作用锚点与摄影机参数，进入时先展示完整事件，随后才展开局部测量细节，退出时沿相同锚点回收。
5. 纸面图切换仍由 `EvidenceFigureV12` 管理；程序化线条只能作为焦点标记，不能覆盖论文原始数字、坐标轴或图例。

## 通过的检查

- `npm run check`：TypeScript/Remotion 类型检查通过。
- 所有 V12 原语均为帧/时间驱动，未使用无种子随机、实时 CSS 动画或重复挂载。
- V11 基线文件、V11 成片及其 QA 报告未被覆盖。

## 尚需人工复核

本文件只记录静态几何和代码层审阅。真正交付前仍需对 V12 代表片段做完整播放复看，重点检查 003→004、008→009、011→012 接缝、字幕遮挡、论文焦点清晰度，以及人声与音乐的听感。
