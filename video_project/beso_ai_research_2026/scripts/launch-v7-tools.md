# AI Engineer v7 渲染与客观检查

这是新增入口，不改写 v5/v6 成片、缓存或原始生成资产。默认规格：105 秒、6300 帧、1920×1080、60fps；入口 `src/index-launch-v7.tsx`，组合 `AIEngineerLaunchFilmV7`。

## 素材未齐时

```powershell
node scripts/render_launch_v7.mjs --help
node scripts/render_launch_v7.mjs --check-inputs
```

`--check-inputs` 仅报告源码、时间线、字幕及音轨的实际存在状态；尚未建立 v7 文件时返回待完成清单，不启动渲染，不把文件存在等同于内容验收。

## 抽帧与片段

```powershell
node scripts/render_launch_v7.mjs --stills --frames=0,900,2940,6299
node scripts/render_launch_v7.mjs --stills --frames=900,2940 --overlay=false --image-format=png --output=public/generated/v7/native-anchors
node scripts/render_launch_v7.mjs --stills --frames=660,3900,5760 --overlay=false --blueprint=true --image-format=png --output=public/generated/v7/blueprint-anchors
node scripts/render_launch_v7.mjs --clip=900-1199 --concurrency=2 --output=output/launch-v7-preview.mp4
```

抽帧可以在 `public/audio/launch-v7-master.wav` 尚未生成时进行；不会使用旧版音色或音轨作为替代。`--frames` 和 `--clip` 都使用绝对帧号，片段结束帧包含在内。`--output` 在抽帧模式中是目录，在片段/整片模式中是 MP4 文件。

`--blueprint=true` 仅允许与 `--stills --overlay=false` 一起使用：按同一相机渲染实际 Native 网格的象牙白线稿，不增添尺寸或计算结果。它只用于二维到三维的生成素材首帧，不自动成为成片里的全屏特效。RGB 转换及端点联系表由 `python scripts/prepare_launch_v7_anchor_sheet.py` 生成，记录原帧与转换帧 SHA-256。

## 整片与统一音轨

```powershell
node scripts/render_launch_v7.mjs --chunk=900 --concurrency=2
```

每段由 Remotion 渲染为无声 H.264 视频。段落齐全后，用冻结的 v7 master 一次性编码 48kHz AAC 并封装到 `output/ai_engineer_launch_v7_1080p60.mp4`。该步骤不会重做旁白/BGM 混音：master 应先完成声音处理。默认并发 2，允许 1–4；显存不足时改为 1。

```powershell
node scripts/render_launch_v7.mjs --segments=0,1 --concurrency=2
node scripts/render_launch_v7.mjs --no-mux --concurrency=2
node scripts/render_launch_v7.mjs --concurrency=2
```

最后一个命令按 SHA-256 验证并复用同修订的已完成分段，再统一加入音轨。修改源码、播放参数、选用媒体或音轨会产生新修订，防止误用旧段。片段和整片要求 v7 master 存在；`--no-mux` 只是暂缓最终封装，不改变冻结输入。

## 来源与缓存

按实际运行依赖精确冻结：BESO 几何清单和迭代网格、原生模型和保存响应、真实网页操作视频、浙江大学矢量 Logo、天空 HDR、v7 音轨，以及桥接清单中 `selection: selected` 的视频。生成首尾锚点、被拒绝的候选和外部生成记录保留在项目原目录，不在每次渲染时重复复制。已有 Blender 机舱外观 `public/assets/v4/nacelle-skin.glb` 明确作为复用来源单独复制，不冒充新 CAD 或新求解几何。其他必要外观资产可显式使用 `--media-dir=assets/v4` 等目录，并记录来源；该选项会额外复制目录中的运行文件，应避免传入整个生成素材目录。

实际复制文件的原路径、冻结绝对路径、SHA-256 和字节数写入 `copiedMedia`。源码、媒体以及 `research/generation/launch-v7-bridges.json` 等配置进入 source hash。复制后复核哈希，复制期间发生变化的素材会阻止渲染。

缓存分别位于 `tmp/launch-v7-public-<revision>`、`tmp/launch-v7-bundle-<revision>` 和 `output/launch-v7-render-<revision>`。工具不自动清理任何版本。

## 客观验收

```powershell
python scripts/verify_launch_v7.py
node scripts/qa_launch_v7_camera.mjs
```

报告写到 `research/qa/launch-v7-delivery.json`：记录最终成片 SHA、完整解码与帧数、规格、音画时长、AAC 48kHz、综合响度、真峰值、黑帧阈值检测、长静音以及字幕/SRT 时间与文字一致性。

`technicalPassed` 仅代表这些客观检查。报告不自动认可审美、运镜连续性、模型构型、文字可读性或读音；`aestheticAccepted` 保持未评估，仍须实际视觉检查及听审。

`qa_launch_v7_camera.mjs` 单独采样 6300 帧，检查相机/目标/焦距的有限性、单帧跳变和 C1 连续性；按保存响应变换浮体中心线，用保守包络检查碰撞，并投影实际 Native 网格检查片尾整机与叶片安全区。输出 `research/qa/launch-v7-camera.json` 与逐帧样本。这些数值检查不等同于审美和遮挡检查，不运行新的物理求解。

## 当前验收状态

世界和相机已冻结。最新相机 QA 覆盖全部 6300 帧并通过：最小相机到目标距离 76.787 m，最小保守结构包络净距 30.040 m，最大相机单帧移动 1.501 m，最大目标单帧移动 1.950 m，最大视线方向变化 0.506°；全部采样有限、阶段连接满足 C1 检查。98.33–104.98 秒的实际原生整机网格与叶片投影位于画面安全区。源文件 SHA 记录在相机报告中。

最新人工抽帧观察单独写入 `research/qa/launch-v7-world-visual-review.json`。这是局部静帧检查，不代表全片实时观看，也不包含对未完成 Qwen 桥接片段的认可。49.5 秒上浮后的标题/Logo 色彩已由主流程改为绑定相机浸入程度，须用最终版本重新抽帧；59 秒白色叶片与右侧文案的临近关系也须在最终覆盖层中核对。

最终 MP4 已通过 verifier 的客观技术验收，报告为 `research/qa/launch-v7-delivery.json`：105.000 秒、1920×1080、60fps、6300 帧全部解码，无解码警告；AAC 48kHz 双声道，综合响度 −16.11 LUFS、真峰值 −2.44 dBTP、LRA 4.6。未检测到阈值黑帧和长静音；44 条字幕与 SRT 的时间、文字一致，末条结束于 103.760 秒。此结果不替代完整实时听审与审美验收。
