# AI Engineer 视频工程

## 最新发布片 v6：105 秒

这一版围绕 AI Engineer 的任务拆解、工具调度、结果读取、失败反馈和工程师复查，输出 1920×1080、60 fps。

- 成片：`output/ai_engineer_launch_v6_1080p60.mp4`
- 入口：`src/index-launch-v5.tsx`，Composition ID：`AIEngineerLaunchFilmV5`；v6 沿用此入口。
- 中文字幕：`delivery/AI-Engineer-Launch-v6.zh.srt`
- 本版制作说明：`delivery/AI-Engineer-Launch-v6-production.md`
- 最终文件检查：`research/qa/launch-v6-delivery.json`
- 最终编码抽帧：`research/qa/launch-v6-final-frames/`
- 根视觉抽样复核：`research/qa/launch-v6-root-visual-review.json`

本版使用 rainbow鱼个人 Qwen3-TTS 正式母带。新版真实网页录制聚焦需求输入和三维查看器，另有两条 5 秒 WAN 2.7 概念桥接。数值来自保存的 BESO、Z-wind 及论文案例数据；生成转场和程序波面是视觉表达。来源、选择与拒绝记录、检查范围见本版制作说明。

```powershell
npm run typecheck
node scripts/render_launch_v6.mjs --concurrency=1
```

最终 v6 已完整解码 6300 帧，通过 105 秒、1080p60、48 kHz AAC、音画同步、黑帧、长静音及字幕时间检查。视觉复核采用最终编码的 130 个样帧和重点大图，未声称完整正常速度人工观看。v5 成片作为回退保留。

下方和旧的中文交付说明记录的是早期科研介绍片；其时长、声音和配乐不适用于 v6。

## 早期科研介绍片

正式影片约 5 分 33 秒，1920×1080、60 fps。主要入口：`src/index-beso.tsx`。

- 正式 MP4：`output/beso_ai_research_1080p60.mp4`
- 字幕与来源、发布文案、四比例封面：`delivery/`
- 逐句文案：`research/story.json`
- 真实网格和保存响应：`public/beso-research/`
- 科学事实审计：`research/qa/sentence-evidence-audit.json`
- 镜头与数据绑定：`research/geometry-response-binding.md`
- Qwen/WAN 概念转场记录：`research/generation/bridge-task.json`

## 渲染

在新的解压目录中，先安装 Node.js 22 或 24、FFmpeg，并将含 `ffmpeg.exe` 和 `ffprobe.exe` 的目录加入 `PATH`。本片使用 Windows 的 Microsoft YaHei 字体；其他系统或字体替换可能改变文字排版。然后安装锁文件中的依赖及 Remotion 浏览器：

```powershell
npm ci
npx remotion browser ensure
ffmpeg -version
ffprobe -version
```

上述 `npm ci` 用于新的解压副本。制作机的既有依赖目录包含共享包链接，不要对该目录重新安装或递归清理。

浏览器选择依次为 `BESO_CHROME_EXECUTABLE` 环境变量、制作机上已验证且仍存在的浏览器、Remotion 在当前项目中的默认浏览器。需要指定已安装浏览器时，可在当前 PowerShell 设置 `$env:BESO_CHROME_EXECUTABLE='C:/path/to/chrome.exe'`。

```powershell
npm run typecheck
npm run qa
npm run render
```

`render_beso_film.mjs` 将临时文件放在本项目 D 盘目录，按源码哈希分段输出，支持中断续渲。默认只渲染本片，不依赖旧工程 compositions。编码完成后自动合入 `public/audio/master.wav`。项目依赖版本固定在锁文件；本机依赖目录使用既有已安装包的链接，不能递归删除或打包其链接目标。

源码包已包含重新渲染所需的几何、响应、截图、转场及完成音轨。重建研究资产还需要原始研究文件；`scripts/README.md` 列出相应导出脚本与 Python 依赖。源研究仓库、TTS 模型、个人参考录音和 API 凭据不在归档内。

## 声音

旁白与字幕按 44 句实测时长生成，不做时间拉伸。若需要重新合成，使用 `D:/python_project/tts/.venv/Scripts/python.exe` 运行 `scripts/voice.py --story research/voice-story.json --batch-size 2`，随后 `scripts/qc.py --story research/voice-story.json` 和 `scripts/finalize_audio.py`。个人声音参考留在用户本机，不随工程归档分发。

## 数据边界

静力 BESO 算例、Zwind 原生保存回放、论文 Fig.2 比较分别标识。原生回放伺服关闭，不能当作完整认证。生成视频仅为概念转场。完整说明见 `delivery/影片说明与来源.md`。
