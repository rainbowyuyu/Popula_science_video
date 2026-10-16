# 从概率密度演化到大模型幻觉的首次越界

根据用户分享的 18 轮对话制作的中文讲解视频。Manim 绘制逐步出现的公式与图形，Remotion 编排 18 个章节并导出透明章节叠层，FFmpeg 合成旁白、字幕和进度条并完成响度处理及封装。成片采用 NVENC 硬件编码，同时保留可完整渲染的 Remotion 时间线。

## 交付

- `output/大模型幻觉_概率密度演化与首次越界.mp4`：1920×1080，30 fps，约 15 分 42 秒，H.264 / AAC。
- `output/讲解字幕.srt`：可单独导入剪辑软件的字幕。
- `content/讲解稿.md`：带章节时间点的完整中文旁白。
- `content/内容整理与公式校订.md`：内容整理、完整公式、研究假设及对原对话的数学修正。
- `content/source_conversation.md`：分享内容去重后的原始正文。
- `public/simulation.json`：可复现教学仿真的参数、轨迹与解析对照。

本视频中的合成轨迹不是真实 LLM 实验数据。没有下载 / 运行 Qwen3-8B，没有宣称验证普适幻觉规律。中文旁白使用 Edge TTS 的 `zh-CN-YunxiNeural` 合成声音；字幕根据逐语段合成的真实时长分配，短句内部时间为估计，非逐字强制对齐。

## 源码与运行

环境：Python 3.10、Manim 0.19.1、NumPy、SciPy、edge-tts；Node.js 24、Remotion 4.0.526；FFmpeg；可用的 LaTeX / dvisvgm；Microsoft YaHei 中文字体。

在仓库根目录生成脚本与声音：

```powershell
# 如果网络需要代理，可设置 $env:VIDEO_TTS_PROXY='http://127.0.0.1:7897'
.\.venv\Scripts\python.exe video_project/llm_hallucination/scripts/prepare.py
.\.venv\Scripts\python.exe video_project/llm_hallucination/scripts/render_manim.py
```

准备脚本会缓存已有语音；修改讲稿后应移走相应 `public/audio/章节_语段.mp3` 再运行。Manim 批处理按时长跳过已有完整片段；修改场景源码后应移走该章 `public/clips/ChapterXX.mp4`，强制重渲染。

在本目录运行：

```powershell
npm ci
npm run lint
npx remotion studio --no-open
node scripts/render_overlays.mjs
..\..\.venv\Scripts\python.exe scripts/compose_fast.py
..\..\.venv\Scripts\python.exe scripts/finalize.py
```

上述快速合成需要支持 `h264_nvenc` 的 NVIDIA GPU。本次设备为 RTX 5060 Laptop GPU。没有 NVIDIA GPU 时，可将 `scripts/compose_fast.py` 中编码器及相应参数替换为 `libx264`；也可以直接用完整 Remotion 时间线替代叠层快速合成：

```powershell
npx remotion render src/index.ts HallucinationDynamics output/master.mp4 --concurrency=6 --codec=h264 --crf=20
..\..\.venv\Scripts\python.exe scripts/finalize.py
```

两条合成路线共享素材和时间线。快速路线字幕使用 libass，在段内时间上有至多约 0.01 秒的取整；标题淡入淡出和底部进度条保留，右下角显示章节号。Remotion 完整预览还包含逐秒计时。

预览服务器以终端实际打印的地址为准。制作期间使用 `http://localhost:3001/HallucinationDynamics`。

章节素材位于 `manim/scenes.py`；每章按旁白语段开始时间安排动画。Remotion 逐章组件位于 `src/scenes/`；标题、音轨布局与字幕分别在 `src/Chapter.tsx` 和 `src/Explainer.tsx`。`src/timeline.json` 由准备脚本生成。

## 内容与验证边界

完整数学补充在公式校订文档。特别区分：证据缺失与事实反驳；一步全概率关系与马尔可夫闭合；经典输运型 GPDEE 与有效扩散方程；瞬时错误与首次错误；完整回答的停止事件与潜在持续生成时间的右删失；一般首达方程与弱噪声势垒渐近式。

`scripts/prepare.py` 用固定随机种子独立模拟 10,000 条轨迹，核对存活曲线误差小于 0.03。本次实测最大绝对偏差 0.0123946，解析平均首达长度 11.1111。`scripts/finalize.py` 校验完整片段时长、字幕范围和音视频输出，并导出技术验证报告。
