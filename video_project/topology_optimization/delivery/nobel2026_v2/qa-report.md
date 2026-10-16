# NobelMedicine2026 V2 QA

检查时间：2026-10-06

## 交付

- 文件：`delivery/nobel2026_v2/一束蓝光能叫醒一颗神经元_v2_1080p.mp4`
- SHA-256：`fbf6e7b260c7ece6645319e36a6b50e5726111da35d31024b9e991c7c70a2ed3`
- 画面：1920×1080，H.264，30 fps，300.000 s
- 音频：AAC，48 kHz，双声道，编码后 300.053 s（约 53 ms AAC padding）

## 音频

- 源母带：`public/nobel2026/master-v3.wav`
- 源人声由 `voice-v2/*.wav` 按真实生成时长装配；未使用低于 0.95 的强制慢放。
- 背景音乐：`public/nobel2026/nobel-v2-bgm.wav`，本片原创五声音阶氛围床；通过侧链压低，避免盖住解说。
- 最终 AAC ebur128：I = -18.0 LUFS，LRA = 11.7 LU，True peak = -1.5 dBFS。
- `silencedetect=noise=-42dB:d=0.75`：未发现异常长静音事件。

## 画面与字幕

- `npm run check`：通过。
- `blackdetect=d=0.4:pic_th=0.98`：未发现黑帧事件。
- 22 条 clip 的 voice-v2 WAV 时长与 timeline window 差异均小于 0.08 s。
- `subtitle` 与 `spoken` 逐条一致；句级 `subtitleParts` 写入 `src/nobel2026/timeline-v2.json`，字幕显示跟随 ASR 语音尾端。
- 已抽查片头、衣藻、蛙卵通道、培养神经元、活体光纤和片尾：来源卡与说明卡不遮挡，片尾无底部字幕覆盖论文作者与官方署名。

## 证据边界

- 官方资料：`research/nobel2026/press.txt`、`popular-clean.txt`、`advanced.txt`。
- 官方插图保留来源说明；Three.js 画面标注为教学重构/机制示意。
- ChR2 的阳离子内流、0.2 ms 门控、2003/2005/2007/2012 时间线按官方资料核验。
- 2012 记忆部分使用“足以唤回”，没有把充分性写成必要性。视网膜方向标为临床探索，没有写成普遍治愈。
- ASR 仅作漏字筛查；Whisper 对繁简字、中文数字和“电化学梯度”等术语有误识别，最终字幕真值来自冻结的中文脚本和逐 clip 生成记录。

## 清理记录

新版完整通过 QA 后，删除旧版可重建 bundle、旧 master.wav 与旧版输出目录；保留官方图片、论文 PDF、V2 源码、V2 音频母带、最终视频和 QA 静帧。
