# AI Engineer 紧凑版 120 秒剪辑草案

- 目标：`116.67` 秒（7000 帧 @ 60 fps），保留 8 个连续场景；不改原 `beso-story.json`。
- 音频：复用已通过 ASR 的 `public/voice/*.wav` 片段；正式输出需按本文件 clips 重新拼接 `master.wav`，不能把旧 5:33 音轨直接塞进新时长。
- 事实边界：BESO 与 Zwind 分别为保存回放；Zwind 片段继续屏显“伺服控制尚未启用”，不把概念转场当计算证据。
- 术语口播：`Zwind` 读“Z，风”；`BESO` 读“贝索”；`图强号`沿用已审查 take。

|场景|时间|保留信息|动态重点|
|---|---:|---|---|
|hook|0.00–16.33s|AI Engineer：风浪基础的设计闭环|从上一场景镜头平移衔接；不做硬消失|
|brief|16.33–28.83s|需求进入真实工程网页|从上一场景镜头平移衔接；不做硬消失|
|mesh|28.83–42.17s|设计域与受力边界|从上一场景镜头平移衔接；不做硬消失|
|beso|42.17–56.33s|BESO：材料留下的理由|从上一场景镜头平移衔接；不做硬消失|
|rebuild|56.33–70.67s|从拓扑到可制造构件|从上一场景镜头平移衔接；不做硬消失|
|zwind|70.67–83.50s|Z，风：把候选放进风浪|从上一场景镜头平移衔接；不做硬消失|
|compare|83.50–100.50s|论文指标与工程权衡|从上一场景镜头平移衔接；不做硬消失|
|close|100.50–116.67s|价值：可回看的工程证据|从上一场景镜头平移衔接；不做硬消失|

## 启用 compact story 时的组件重定时

- `ResearchHUD.tsx`：旧版 Zwind 曲线入口在 14.6 s、频率卡片在 23.2 s；compact 的 Zwind 只有 12.83 s，建议改为约 2.5 s 和 8.5 s。
- `ComparisonTiming.ts`：旧版从 `beso-captions.json` 读取 `compare-2` cue；compact 没有该句，应改为 compact captions 或按 0 / 7.5 s 两段切换。
- `World.ts`：Zwind 从 `rebuild` 进入时要把 native 平台从 x=-260 平移至 0（约 2.7 s），不能沿用只处理 `prev==='hook'` 的旧分支。

## 交互与水面段落建议

在 `brief`→`mesh` 的网页镜头中插入 3–4 秒真实网页操作：输入 20 MW、切换设计域/载荷、点一次运行并显示保存的 JSON/日志。画面只展示仓库中实际可访问的界面；交互录屏与计算证据分开标注。

`rebuild` 前 5.4 秒继续承载现有 WAN/Qwen 二维蓝图→三维桥接；屏显“AI 生成概念转场”，让它成为视觉连接，不把生成片段当作 BESO 或 Zwind 的计算证据。桥接后立刻切回原生管段与参数栏，避免“生成图=结果”的误读。

`zwind` 场景把浮体近景交给 WaterPro/OVOW 的水面：优先使用本地 `D:/python_project/waterpro` 的官方 API 说明和演示记录，遵循 `WaterSystem.create(renderer, scene, camera, quality)`、`loadPreset('storm'|'dusk')`、每帧 `await water.update(dt)` 的顺序；当前工作台未导入商业 `threejs-water-pro` build，若未导入则不得标为“官方 WaterPro 实时计算”，只能写“WaterPro 风格水面演示”。OVOW 已有可审计的 `D:/python_project/OVOW/research/presentation_rendering/waterpro-adapter.js`（3.1.1 WebGL adaptation）和 `presentations/inverse-loads/v5/scenes.js` 的浮体接法，可在本地授权范围内复用，注明其不含原生 FFT/SSR/WebGPU，且水面显示与 ROM 解算分离。

## 浙大矢量校徽

用户给出的 feature-tour `index.html` 是播放页，不内嵌校徽。项目已有可审计的矢量横版校徽：`D:/python_project/beso_ai/video-feature-tour/public/revision-sept23/horizontal-mark-traced.svg`，建议复制到本片 `public/brand/zju-horizontal-mark.svg`，在 `BesoFilm` 的 `Brand` 组件固定右上角（`right:64px;top:36px`），颜色使用浙大蓝，避免与 AI Engineer 标识混淆。


## 本轮实现记录

- 已启用 `src/index-beso-short.tsx` / `BesoShortFilm.tsx`，成片 `7000` 帧（116.67 秒）。
- 网页段使用仓库内 Playwright 实拍的 `public/screens/prompt.png`，叠加受控鼠标/提交状态动画；画面标注为“真实网页界面回放”。
- 右上角固定透明矢量横标 `public/brand/zju-horizontal-mark.svg`。用户给出的 `index.html` 本身不内嵌 SVG 校徽，因此复用同一 feature-tour 工程的 traced SVG。
- 海面由 `src/beso/WaterProCompat.ts` 的 Gerstner 组件驱动，并在 `NativePlatform.ts` 中独立于保存的刚体响应更新；浮台姿态、系泊张力仍来自保存的 native probe。
- 字幕已按 compact clip 的实际起始帧重新映射，导出 `delivery/AI-Engineer-Research-compact-120.zh.srt`。
- 当前水面是 OVOW WaterProCompat 风格的受控展示，不宣称已加载商业 WaterPro 原生 FFT/SSR/WebGPU，也不将视觉水面当作新的载荷真值。
