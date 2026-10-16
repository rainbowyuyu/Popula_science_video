# V2 QA 验收记录

## 自动检查

| 检查 | 命令 | 当前结果 | 说明 |
| --- | --- | --- | --- |
| TypeScript | `npx tsc --noEmit -p v2\tsconfig.json` | **PASS** | V2 类型检查通过 |
| 时间线 | `node v2\scripts\qa_timeline_v2.mjs --strict-delivery` | **PASS** | 9 镜头、36 条旁白、9000 帧；audio manifest 与 master 均为 300 秒 |
| 运镜/接力 | `node v2\scripts\qa_motion_v2.mjs` | **PASS** | 9 个镜头姿态、18 个相机样本、6 个 evidence marker |
| Blender 资产 | `D:\blender\blender.exe --background --python v2\scripts\build_v2_assets.py` | **PASS（已记录）** | Blender 5.1.2；GLB 独立导入验证已完成 |
| 音频 | `ffprobe ... master.wav` + `audio-qa-v2.json` | **PASS** | 300.000 s、48 kHz、双声道 PCM24；35 条有声片段 + n36 片尾静音；timeStretch=false；EBU -19.7 LUFS、LRA 12.3、真峰值 -1.5 dBFS；AAC192k 真峰值 -1.6 dBFS |
| 视频编码 | `ffprobe ... DNA存储与生信算法_V2_1080p.mp4` | **PASS** | 300.000 s、9000 帧、1920×1080/30fps、AAC 48kHz stereo；视频/音频 ffmpeg 解码无错误 |

## 时间线契约

- 目标：`1920×1080 / 30 fps / 300 s / 9000 frames`。
- 镜头：`s01-hook`、`s02-encode`、`s03-constraint`、`s04-fountain`、`s05-wet-lab`、`s06-decode`、`s07-model-assist`、`s08-return`、`s09-evidence`。
- 镜头覆盖从第 0 帧到第 8999 帧，无空档、无重叠。
- 所有镜头拥有 `cameraIn`、`cameraOut`、锚点与 handoff；不使用硬切、淡入淡出、瞬移作为转场。
- 旁白契约共 36 条，其中 n36 保留 cue id 但为视觉片尾静音；其余 35 条有声窗口无重叠；字幕从实际 manifest 时长生成。
- 片尾为最后 150 帧（5 秒），论文卡片与公式分层出现，论文信息写在卡片外。

## 音频门槛

`v2/public/audio/raw/000.wav` 至 `034.wav` 是逐句源文件；`raw/obsolete/035.previous.wav` 仅作历史回退，n36 使用视觉片尾静音。每句生成后应检查：

1. 源片段允许为模型原生 24 kHz（当前 Qwen 输出），单句无截断、无长静音和明显爆音；混音脚本会统一重采样到 48 kHz；
2. Qwen 音色哈希和参数记录在 `v2/research/voice-generation-v2.json`；
3. `mix_v2.py` 输出 `narration.wav`、`master.wav` 与 `audio-mix-manifest.json`；
4. `master.wav` 总时长为 300 秒（误差不超过 1 帧），真峰值低于 -1 dBFS，旁白在说话时对音乐 duck；混音清单明确 `timeStretch=false`，超长句直接报错而不变速；
5. 运行 `ffprobe -hide_banner v2/public/audio/master.wav`，确认 48 kHz、双声道、时长和编码。

当前 raw 片段 000–034 已生成并成功混音，n36 为明确的 5 秒论文阅读留白；master/narration 均为 300.000 秒、48 kHz、双声道。音频 QA 与带新版混音的完整 MP4 均已通过，最终 MP4 SHA256 为 a6cc0cf389b99d49305a6634c733ad2af8d5330bbed69a604b9890b3ce070210。

## 画面与运动抽查

完成音频后，针对每个镜头抽取 `start+90`、中心、`end-90` 三帧，检查：

- 数据粒子、液滴、读段或碱基链能从上一镜头接力到下一镜头；
- 相机位置、target、FOV 连续，主体不瞬移、不突然消失、不黑场；
- 透明层只在需要解释的尺度切换时改变，分子比例尺第一次跨尺度时出现且不重复堆叠；
- 标签跟随路径或物体，关键字约 68–100 px，字幕约 44–52 px，safe area 内无越界；
- 论文卡片、公式和技术路线与背景桌面融合，片尾停留完整 5 秒；
- 红色替换/插入/缺失明确为固定教学样本，不被误读为真实实验数据；
- Qwen/Wan 片段（若未来接入）不得承载文字、数字、公式或论文信息。

## 发布前验收门

以下项目全部满足后，才可将状态改为 `release-ready`：

- [x] 35 条有声旁白 raw 文件存在且已混音，n36 片尾静音已登记；
- [x] `narration.wav` 与 `master.wav` 通过时长、采样率、峰值和响度检查；
- [x] 代表帧和镜头边界抽查通过；
- [x] 音频重混后的完整 MP4 重新通过 ffprobe，视频 1920×1080/30fps、9000 帧，视频 300.000s，音频 300.011s（AAC 编码尾帧容差约 11ms）；
- [x] 无全黑帧区间（blackdetect 0.1）、无 ≥1s 静音（-45dB）、主体运动与字幕抽查通过；
- [x] `assets-manifest.json`、`source-record.json`、论文/工具来源和哈希与最终文件一致；
- [x] 已清理 `v2` 内未引用临时文件、损坏并发产物和可重建 `tmp-bundle`；保留可回退版本和重渲染脚本。

## 发布状态

release-ready：新版视觉、音频、论文素材、字幕、运镜与编码检查均已通过；V2 内保留 DNA存储与生信算法_V2_rollback_previous.mp4 作为回退版本。
