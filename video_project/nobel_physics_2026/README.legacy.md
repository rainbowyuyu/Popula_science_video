# 2026 诺贝尔物理学奖视频（独立工程）

这是 `rainbow鱼` 系列的 2026 年诺贝尔物理学奖独立视频工程。项目与
`video_project/topology_optimization` 中的生理学奖片子隔离，版本、音频、素材、时间线和交付物均独立维护；不会覆盖既有 `nobel2026_v5_1`。

当前版本为 **V11 论文依据下的完整视觉重绘**。全部17段由探测器、统计研究和宇宙信使三个动态模块覆盖，结合11张真实论文/官方图示裁图和4段Qwen/Wan环境桥接；宇宙信使代码由Opus生成后经本工程科学和构图适配。时间线为1920×1080、30 fps、7,403帧，约4分7秒。最终1080p已完成技术渲染与自动QA；静帧联系表和局部代理审阅已完成，连续播放、逐句复听与审美确认仍待用户预览，不能把技术通过写成完整人工观看通过。

## 当前 V11 入口

- 版本说明与待验收状态：[docs/v11/README.md](docs/v11/README.md)
- 原论文对应和物理语义：[docs/v11/paper-visual-audit.md](docs/v11/paper-visual-audit.md)
- 17段、65句镜头契约：[docs/v11/sentence-visual-contract-v11.md](docs/v11/sentence-visual-contract-v11.md)
- Remotion入口：`src/index-physics2026-v11.tsx`
- 时间线：`src/physics2026/timeline-v11.json`
- 合成与路由：`src/physics2026/FilmV11.tsx`、`WorldV11.ts`
- 三个模块：`DetectorRedrawV11.ts`、`ResearchRedrawV11.ts`、`CosmicOpusV11.ts`（均在`src/physics2026/`）
- 原图裁切/哈希：`docs/v11/figure-assets.json`；素材`public/papers-v11/`
- 唯一原音轨：`public/audio-v07/master.wav`
- 当前正式1080p：`delivery/physics2026_v11/2026诺贝尔物理学奖_一束蓝光穿过南极冰_v11_论文重绘_1080p.mp4`
- 正式视频 SHA-256：`25f804d5e44459e24bc7d2105d116933a8a8148d5e2c3b111278174def5d2148`；技术QA报告：`delivery/physics2026_v11/qa-final-redraw/qa-report.json`

```powershell
npm run check
node scripts/render_physics2026_v11.mjs stills
node scripts/render_physics2026_v11.mjs --output=delivery/physics2026_v11/v11_final_1080p.mp4
```

V11渲染的bundle和public暂存目录均按PID独立，避免运行之间相互覆盖。技术QA已确认1920×1080、30 fps、7403帧、单AAC 48 kHz、−14.8 LUFS、−1.7 dBTP。保留V10回退；用户预览确认后再合成4K。

## 目录

```text
nobel_physics_2026/
├─ docs/        制作任务单、分镜、逐句音画契约、来源与验收记录
├─ src/         独立 Remotion 入口和物理机制组件
├─ scripts/     本工程的准备、渲染、字幕、音频和 QA 脚本
├─ public/      选定图片、PDF 截图、公式 SVG、字体和最终音频引用
├─ research/    研究笔记、原始论文哈希、来源台账、实验数据
├─ audio/       旁白、配乐、混音和发音复听记录
├─ delivery/    1080p 预览、字幕、旁白文本、QA 报告与来源清单
├─ output/      经过验收的成片（仅保留版本入口）
└─ tmp/         可再生缓存和外部模型请求记录，版本完成后按清理策略回收
```

## V02 历史入口与 V03/V04 音频迭代

以下内容记录V02–V04阶段，不是当前渲染入口。V02曾完成官方资料核验、约5分钟旁白测时、WebGL-inspired Canvas可视化、五段Qwen/Wan环境桥接和1080p预览。奖项与研究来源笔记位于 `research/nobelphysics2026/` 与 `docs/`；当时稿件区分Francis Halzen与IceCube国际实验团队，不将团队写成共同获奖者。

- Remotion 入口：`src/index-physics2026-v02.tsx`
- 主构图：`PhysicsFilmV02`
- 时间线：`src/physics2026/timeline-v02.json`（9054 帧，301.79 秒）
- 动态世界：`src/physics2026/WorldV02.ts`
- 桥接窗口：`docs/bridge-windows-v02.json`
- Qwen/Wan 素材：`public/bridges-v01/`，提示词、任务和 SHA 在 `research/generation/qwen-bridge-ledger-v01.json`
- 1080p 输出：`delivery/physics2026_v02/`
- V03 音频优化：`audio/v03/`（本地 Qwen3-TTS 声线 + Sappheiros《Embrace》）
- V03 音频版输出：`delivery/physics2026_v03/`
- V04 视觉更新预览：`delivery/physics2026_v04/`（V02 动态世界修正 + V03 用户 TTS／配乐混音）

常用命令：

```powershell
npm run check
npm run stills:v02
npm run render:v02       # 分段渲染并自动拼接，避免长片 Chrome 内存累积
npm run qa:v02
```

V04 使用已核验的 V03 音轨重新合成，保留 V03 音频版作为回退。若需要重渲染视觉并沿用该音轨：

```powershell
node scripts/render_physics2026_v02_chunked.mjs `
  --chunk-size=1500 `
  --audio=audio/v03/master.wav `
  --output=delivery/physics2026_v04/2026诺贝尔物理学奖_一束蓝光穿过南极冰_v04_TTS配乐1080p.mp4
```

`audio/v03/master.wav` 是以 `D:/python_project/tts/work/clone-reference.wav` 为声音参考、用本地 Qwen3-TTS-0.6B 逐句生成并清理的旁白；配乐为 Sappheiros《Embrace》，经过循环交接、人声频段避让和旁白闪避。V04 的实际 SHA、解码结果与响度检查见 `delivery/physics2026_v04/qa-v04-report.json`。

`render:v02:single` 保留为短片或调试用的一次性渲染入口；完整 V02 使用分段渲染入口。最终预览、依赖 SHA 和 QA 报告位于 `delivery/physics2026_v02/`。

## V01 回退入口

- Remotion 入口：`src/index-physics2026-v01.tsx`
- 主构图：`PhysicsFilmV01`
- 时间线：`src/physics2026/timeline-v01.json`
- 研究索引：`research/source-ledger-v01.json`
- 逐句契约：`docs/shot-contract-v01.json`
- 1080p 输出：`delivery/physics2026_v01/`

V01 常用命令：

```powershell
npm run check
npm run stills
npm run render
npm run qa
```

V01历史预览入口位于 `delivery/physics2026_v01/`；当前4K交付以V11预览确认后的版本为准。

## 复用规则

复用 `topology_optimization` 的设计语言、字体加载、帧驱动原则、字幕安全区、音频混合规范和 QA 思路；通过复制最小组件或抽取无业务状态的工具实现，不能直接 import 医学奖的时间线、获奖者文本、音轨或研究素材。完整边界见 [`docs/physics-v01-plan.md`](docs/physics-v01-plan.md)。

正式交付仍遵循“先 1080p 预览，确认后再 4K”。没有最终 QA、依赖清单和可用回退版之前，不执行版本清理。

## V09 抖音节奏与 Opus 视觉升级

V09 以 V08 为只读基线，吸收两个公开短视频的叙事节拍：先给出 1450 m、5160 个光学模块和 1 km³ 冰体，再沿“中微子进入 → 碰撞 → Cherenkov 蓝光 → DOM 按时间点亮 → 反推出方向”的连续动作回到 2013/2014 证据链。没有复制参考视频的台词、素材或音频。

- 入口：`src/index-physics2026-v05.tsx`
- 动态世界：`src/physics2026/WorldV05.ts`
- 时间线：`src/physics2026/timeline-v09.json`
- 论文窗口：`src/physics2026/EvidenceFigureV03.tsx`
- 渲染：`node scripts/render_physics2026_v09.mjs --sample-frames=...` 或 `node scripts/render_physics2026_v09.mjs`
- 预览：`delivery/physics2026_v09/2026诺贝尔物理学奖_一束蓝光穿过南极冰_v09_个人TTS与电影配乐1080p.mp4`
- 视觉设计记录：`docs/v09/opus-visual-brief.md`、`docs/v09/douyin-reference-v01.md`、`docs/visual-upgrade-v09.md`

Opus 5.5 仅提供镜头节奏和几何设计指导；最终动画由本工程的 Remotion/Canvas 帧驱动实现并经过 `npm run check`、关键帧联系表、接缝抽查、ffprobe、完整解码和响度检查。V09 保留 V08/V07 作为回退；用户确认 1080p 后再导出 4K。

## V10 真实场景化动态升级

V10 从 V09 复制出独立版本，重点把抽象发光线条还原为更接近 IceCube 原始场景的空间关系：分层南极冰体、冰面入口、深度透视、缆线和压力球光学模块；中微子保持不可见，碰撞只在局部发生，带电次级再生成 Cherenkov 光锥；Track 与 Cascade 使用不同的长径迹／局部能量沉积结构。V09 不被覆盖。

- 入口：`src/index-physics2026-v06.tsx`
- 动态世界：`src/physics2026/WorldV06.ts`
- 时间线：`src/physics2026/timeline-v10.json`
- 渲染：`node scripts/render_physics2026_v10.mjs`
- 1080p 预览：`delivery/physics2026_v10/2026诺贝尔物理学奖_一束蓝光穿过南极冰_v10_个人TTS与电影配乐1080p.mp4`
- 目标帧联系表：`delivery/physics2026_v10/contact-v10.jpg`
- Opus 设计记录：`docs/v10/opus-realism-brief.md`

所有新几何仍是确定性教学重构，不能当作真实实验事件显示；论文和数值继续来自研究台账与官方资料。
