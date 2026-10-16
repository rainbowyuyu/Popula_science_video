# 2026 诺贝尔物理学奖 V11：论文依据下的完整视觉重绘

V11 以 V10 的个人 TTS、字幕时钟和 1080p 版式为基线，重新制作全部 17 段教学画面。本文对应三模块重绘后的正式方案；此前候选 SHA 只保留在历史视觉抽查中，不代表当前正式文件。V10 保留在 `delivery/physics2026_v10/`。

## 本轮实际实现

- **探测器与物理过程，12 段**：`DetectorRedrawV11.ts` 覆盖 000、001、004–010、013、015、016。重绘透视冰体、固定探测串、压力球和朝下 PMT、带电次级粒子、光传播、Track/Cascade、地球屏蔽及钻孔到数据筛选的工程链。
- **统计与天体来源，2 段**：`ResearchRedrawV11.ts` 覆盖 011–012。初始事件编号为 14、20，累积到 28，再到 37；event 32 单独标为背景 μ 子叠加。NGC 1068 的 `79 +22/−20` 用数轴上的拟合值与区间表示，注明全局显著性。
- **宇宙信使，3 段**：`CosmicOpusV11.ts` 覆盖 002、003、014。三类信使共用源点，带电粒子偏转、伽马射线吸收、中微子沿直线传播；路径和粒子共用求值函数。多信使段的引力波环使用完整闭合周向采样。
- **原始证据窗口**：`EvidenceFigureV11.tsx` 使用 11 张真实论文或官方图示裁图。DOM 特写来自官方插图，其余来自本地原 PDF；保留原图轴、置信区和数据。图像区平滑揭示，底部旧说明先淡出、新说明后淡入，避免两句话拼接。
- **合成**：环境画布、4 段静音生成环境桥接、透明教学画布分别合成。教学镜头交接 0.72 秒；21 帧片间停顿保留前段。007 精确光锥演示取消生成光锥桥接。

最终源码已完成 V11 论文重绘，并输出 `delivery/physics2026_v11/2026诺贝尔物理学奖_一束蓝光穿过南极冰_v11_论文重绘_1080p.mp4`。本轮补强包括：007 以解析积分统一粒子位置与速度，发射点固定在实验室坐标中，冰介质、历史波前、光子共用跟拍相机；恒速段直锥与历史球面相切。`β=.995,n=1.3193` 时光子角约 `40.378°`，画面取约 `40°`。008 新增与固定 DOM 首光模型同步的到达时间带；009 将局部级联核心、各向异性分支与大尺度光波分开。Cosmic 段的粒子尾迹复用同一路径函数，带电粒子弯曲、伽马射线衰减、中微子保持直线。015 的方向约束沿实际轨迹反向投影，不再固定指向屏幕上方。006 标题改为“碰撞之后，蓝光才出现”。

阵列采用 86 条固定教学探测串，每串 60 个 DOM。数量和深度有资料依据，但程序网格**不等于实测布设坐标或完整 DeepCore 几何**。摄影机、光子和模块响应在运动，仪器坐标保持固定。

## Opus 与生成视频的实际采用范围

本轮通过 `tools/claude/run.mjs` 的 native 入口调用。服务报告请求及返回模型均为 `claude-opus-5-5`，`effort=max`，状态 success。生成代码用于 002、003、014；本工程随后修正地球及安全区、共同源点、路径一致性、吸积盘细分、完整引力波环和标签位置。其余模块和科学校对由本工程完成，不能称为 Opus 独立制作或验收了整片。

- 提示词：[opus-cosmic-redraw-prompt.md](opus-cosmic-redraw-prompt.md)
- 调用报告：[opus-cosmic-report.json](opus-cosmic-report.json)
- 原始回复：工作区 `tmp/claude-runs/physics-v11-cosmic-redraw/response.md`

最终方案沿用 4 段各 5 秒的 Qwen/Wan 环境片：`bridge-01-cosmic-arrival`、`bridge-02-ice-descent`、`bridge-04-source-return`、`bridge-05-night-coda`。本轮未重新付费生成。这些片段只承担环境和过渡，不表达实验数据。

## 工程入口

| 用途 | 文件 |
| --- | --- |
| Remotion 入口 | `src/index-physics2026-v11.tsx` |
| 路由与连续时钟 | `src/physics2026/WorldV11.ts` |
| 字体、字幕、公式及合成 | `src/physics2026/FilmV11.tsx` |
| 动态重绘 | `src/physics2026/DetectorRedrawV11.ts`、`ResearchRedrawV11.ts`、`CosmicOpusV11.ts` |
| 论文窗口 | `src/physics2026/EvidenceFigureV11.tsx` |
| 旁白及字幕时钟 | `src/physics2026/timeline-v11.json` |
| 渲染 | `scripts/render_physics2026_v11.mjs` |

```powershell
npm run check
node scripts/render_physics2026_v11.mjs stills
node scripts/render_physics2026_v11.mjs --output=delivery/physics2026_v11/v11_final_1080p.mp4
```

脚本为每个进程分别创建 `tmp/physics2026-v11-bundle-{PID}` 和 `tmp/physics2026-v11-public-{PID}`，打包与公共素材暂存均隔离。唯一原音轨为 `public/audio-v07/master.wav`；QA 已在最终 MP4 的 AAC 解码音轨上测得−14.8 LUFS、−1.7 dBTP。

## 论文与镜头台账

- [paper-visual-audit.md](paper-visual-audit.md)：当前实现的科学语义、修正项、原图使用范围。
- [independent-science-audit.md](independent-science-audit.md)：独立审计历史，包含修改前问题，不是最终成片报告。
- [figure-assets.json](figure-assets.json)：11 张图的来源、页码、裁切和哈希。
- [visual-redraw-v11.md](visual-redraw-v11.md)：实际布局与动作规则。
- [sentence-visual-contract-v11.json](sentence-visual-contract-v11.json) / [可读版本](sentence-visual-contract-v11.md)：逐句字幕、绝对帧区间、动态变化和原图对应。

## 最终输出验收状态

时间线设计值为 **1920×1080、30 fps、7,403 帧、246.7667 秒（约 4 分 7 秒）**。这是工程参数，不是新成片的检测结果。

| 检查 | 状态 |
| --- | --- |
| 重绘类型检查 | 已通过；最终修改后仍由主流程检查 |
| 原论文和裁图 | 已核对来源和图题；裁图哈希在资产台账 |
| 完整最终渲染 | 已完成：正式论文重绘版 1080p |
| 最终 MP4 全片解码、帧数、唯一 AAC 轨道 | 已通过：1920×1080、30 fps、7403 帧、单一 AAC |
| 51 个内容样帧与接缝 | 已抽取到 `delivery/physics2026_v11/qa-final-redraw`；静帧/局部审阅有记录，连续播放和动态审美仍需用户观看确认 |
| AAC 响度及真峰值 | 已通过：−14.8 LUFS、−1.7 dBTP |
| 最终视频 / 音轨 SHA-256 | `25f804d5e44459e24bc7d2105d116933a8a8148d5e2c3b111278174def5d2148` |

正式交付为 `delivery/physics2026_v11/2026诺贝尔物理学奖_一束蓝光穿过南极冰_v11_论文重绘_1080p.mp4`。技术报告为 `delivery/physics2026_v11/qa-final-redraw/qa-report.json`；自动解码、帧数、音轨和响度已通过，已查看长径迹／级联及论文交接代表帧。完整动态播放、逐句音画同步、发音和声音复听仍以用户观看为准。本轮仅交付 1080p，用户确认后再做 4K。

