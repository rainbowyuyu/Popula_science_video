# 2026 诺贝尔化学奖｜让化学选择同一只手

这是 rainbow鱼 的独立诺贝尔化学奖视频工程。沿用物理学奖 V11 的深蓝电影感、清晰中文旁白、实际研究图与连续机制演示，围绕“镜像分子为何会偏向一边”展开：手性与对映体 → Kagan 的非线性效应 → Soai 的自催化与放大。

本工程与 `nobel_physics_2026`、`topology_optimization` 隔离维护。**V01 完整 1080p 预览已输出**：4 分 57.17 秒、30 fps、8915 帧。最终文件的完整解码、单一音轨、帧数及响度检查通过；画面与声音的抽查范围分别留档，不等同于全片人工复听。确认当前预览后再合成 4K。

- [播放完整预览](delivery/chemistry2026_v01/2026诺贝尔化学奖_让化学选择同一只手_v01_1080p.mp4)
- [交付说明](delivery/chemistry2026_v01/README.md) · [中文字幕](delivery/chemistry2026_v01/2026诺贝尔化学奖_v01_中文字幕.srt)
- [最终视频技术检查](delivery/chemistry2026_v01/qa-final/qa-report.json)

- [V01 制作与复现说明](docs/v01/README.md)
- [旁白](docs/v01/story-v01.md) · [逐句数据](docs/v01/narration-v01.json)
- [事实与机制台账](research/nobelchemistry2026/facts-v01.md) · [来源与许可](research/nobelchemistry2026/source-ledger-v01.json)
- [镜头契约](docs/v01/shot-contract-v01.json) · [源码与资产哈希](docs/v01/source-lock-v01.json)
- [LaTeX 编译结果](docs/v01/latex-validation-v01.json) · [清理计划](docs/v01/cleanup-v01.json)

## V02 预览

V02 已完成独立的 1080p 预览（324.4 秒、30 fps、9732 帧）。这一版补入催化剂与配体的桥接段，按随机配体池展示 `p² / 2pq / q²`、9:1 活性组合与 `ee` 公式；Soai 段区分锌醇盐催化分支与水处理后的醇，并保留补料、自催化和三轮放大。字幕按最终音频词级对齐，V01 保持不变。

- [播放 V02 完整预览](delivery/chemistry2026_v02/2026诺贝尔化学奖_让化学选择同一只手_v02_1080p.mp4)
- [V02 交付说明](delivery/chemistry2026_v02/README.md) · [V02 字幕](delivery/chemistry2026_v02/narration-v02.srt)
- [V02 技术 QA](delivery/chemistry2026_v02/qa-final/qa-report.json) · [V02 音频 QA](audio/v02/final-audio-qa-v02.json)
- [V02 旁白与逐词时间线](docs/v02/narration-v02.json) · [镜头契约](docs/v02/shot-contract-v02.json)
- [V02 科学复核](research/nobelchemistry2026/content-review-v02.md) · [发音方法与限制](docs/v02/voice-pronunciation-method.md)
- [V02 动态视觉升级](docs/v02/visual-upgrade-v02.md) · [视觉回归](docs/v02/visual-regression-v02.json)

V02 最终文件 SHA256：`69c8bc113a91ac1afbb27dfe6f7f7b97f7adc0a3ee6dbea0797d89f1fe3ef934`。机器检查确认单一视频流、单一 AAC 音轨、1920×1080、30 fps、完整解码、−14.5 LUFS 和 −1.7 dBTP；接缝与正常速度审看仍以交付记录中的实际范围为准，未把自动检查写成全片人工复听。

## 目录

```text
nobel_chemistry_2026/
├─ src/chemistry2026/         时间线、合成、机制动画与证据图
├─ scripts/                  音频、公式、渲染与 QA
├─ docs/v01/                 讲稿、逐句契约、来源快照与验收状态
├─ public/
│  ├─ brand/                 rainbow鱼 品牌素材
│  ├─ fonts/                 稳定加载的衬线/无衬线字体
│  ├─ formulas/              真实 LaTeX 编译的路径 SVG
│  ├─ papers-v01/            带来源与署名的研究图/官方图示
│  └─ audio-v01/             本版唯一正式母带及选定音轨
├─ research/
│  ├─ nobelchemistry2026/    官方材料、原始来源、事实与下载哈希
│  └─ latex-build-v01/       .tex、DVI 与编译日志
├─ audio/v01/                原始/处理后旁白、配乐、混音及生成记录
├─ delivery/chemistry2026_v01/  1080p 成片、渲染依赖与检查样本
├─ output/                   已确认交付的入口
└─ tmp/                      可重建的逐进程打包缓存
```

## 本机复现

工程使用 Node.js、Remotion 4.0.526、React 19.2.3、TypeScript 5.9.3，以及 `ffmpeg`/`ffprobe`。`node_modules` 当前为目录联接，实际指向 `D:/python_project/manim_extend_rainbow/video_project/topology_optimization/node_modules`。不要删除共享目标；该目标中的 Chrome Headless Shell 也是渲染依赖。新机器需要安装依赖并准备浏览器，不能依赖本机联接路径。

```powershell
Set-Location D:/python_project/manim_extend_rainbow/video_project/nobel_chemistry_2026
python scripts/prepare_fonts_v01.py
python scripts/compile_formulas_v01.py
npm run check
node scripts/render_chemistry2026_v01.mjs stills
node scripts/render_chemistry2026_v01.mjs --frames=0-299
node scripts/render_chemistry2026_v01.mjs
python scripts/qa_chemistry2026_v01.py
```

`--frames` 输出无声局部检查片。完整渲染关闭 Remotion 的音轨输出，随后由 FFmpeg 只合入 `public/audio-v01/master.wav`，避免旧旁白或多条配乐叠加。默认代表帧按每段 20%、50%、80% 的位置生成，可用 `--sample-frames=120,300,600` 指定样本。

渲染前会自动按本章源码/文稿的实际字符，从本机 NotoSansSC/NotoSerifSC 重建字体子集，并检查全部中文与基本拉丁字符覆盖。`public/fonts/fonts-v01.json` 记录当前子集哈希；旧版 `fonts-v51.json` 只是复制来源历史，不代表化学章当前字体。换机器重建需相同字体源；使用已生成子集重渲染时可按本机字体可用性调整准备步骤。

重新录制旁白使用现有个人音色环境：

```powershell
D:/python_project/tts/.venv/Scripts/python.exe scripts/build_audio_v01.py
```

需要本机 `D:/python_project/tts/` 内的 Qwen3-TTS 模型、声音参考和 `broadcast_voice.py`；这些个人资产不进入公开交付包。仅重新渲染既有画面时不需要重录旁白。时间线必须由最终选定语音重新测时，字幕还需逐句复听，字数比例估算不能替代音频对齐。

## 来源与复用范围

官方资料和原创论文的入口均记录在来源台账。下载到 `originals/` 的官方新闻稿/科学背景不等同于已经取得所有原始研究论文全文；各来源的 `local` 字段如实区分已保存正文与仅有 DOI 的入口。

官方插图署名为 **© Johan Jarnestad / The Royal Swedish Academy of Sciences**。台账保留其使用限制，公开下载不代表已取得商业用途授权。配乐为 Sappheiros《Dawn》，保留作者许可页面和署名。分子结构、反应数据与曲线依照研究材料程序绘制；本版没有新增图像或视频生成任务。

## 检查与清理

`python scripts/qa_chemistry2026_v01.py --prepare-only` 仅刷新源码/科学资产哈希、镜头意图与清理候选清单，不会检查成片，也不会删除文件。完整 QA 才会对实际 MP4 检查分辨率、帧率、帧数、唯一 AAC 音轨、完整解码、响度和真峰值，并抽取每段代表帧及所有接缝的前后 0.5 秒样本。

静帧和机器检查不能代替正常速度观看、姓名读音复听、字幕同步与审美审核。`cleanup-v01.json` 保留为原候选计划；本次交付清理单独记录在 `docs/v01/cleanup-cache-manifest-v01.json`，仅处理可重建的逐进程暂存缓存，保留源码、正式素材、论文、字体、声音和共享依赖。
