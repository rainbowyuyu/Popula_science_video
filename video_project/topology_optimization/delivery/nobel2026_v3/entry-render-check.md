# NobelMedicine2026V3 入口与渲染检查

检查时间：2026-10-06（本地工作树）

## 入口

- `src/index-nobel2026-v3.tsx` 导出 `NobelMedicine2026V3`。
- 组成：1920×1080、30 fps、7169 帧（238.967 秒）。
- 组件：`src/nobel2026/FilmV3.tsx`，时间线：`src/nobel2026/timeline-v3.json`。
- 旁白/配乐母带：`public/nobel2026/master-v4.wav`，当前测得 238.967 秒。

## 已执行检查

```text
npx tsc --noEmit --pretty false                         PASS
node scripts/render_nobel2026_v3.mjs stills             PASS (8 scenes; current timeline)
node scripts/render_nobel2026_v3.mjs checks             PASS (24 boundary samples; current timeline)
node scripts/render_nobel2026_v3.mjs --concurrency=1    PASS (7169 frames; full MP4)
```

最终 MP4 `一束蓝光能叫醒一颗神经元_v3_1080p.mp4` 为 1920×1080、30 fps、7169 帧，完整解码成功；母带和最终 AAC 均以 `silencedetect=noise=-42dB:d=0.75` 检查，无事件。

## 时间线事实

22 个语音 clip 无重叠。每个视觉窗口等于对应 WAV 的真实时长加约 0.207–0.233 秒呼吸余量；`asrSpeechEnd` 与源时长一致，`subtitleParts` 已写入测得的相对时间，组件在 `speechEnd + 0.16s` 后隐藏。片尾 `references` 12 秒是有意的论文与机制收束段。当前时间线为 7169 帧/238.967 秒；旧的 7263/242.100 秒和 7756/258.533 秒记录均不适用于本版本。

## 完整渲染

完整输出命令：

```powershell
node scripts/render_nobel2026_v3.mjs --concurrency=1
```

输出为 `delivery/nobel2026_v3/一束蓝光能叫醒一颗神经元_v3_1080p.mp4`。若旁白或 BGM 母带更新，需重新执行该命令并重新跑最终 QA；此文件只记录当前入口与短片段验证，不替代最终成片 QA。



