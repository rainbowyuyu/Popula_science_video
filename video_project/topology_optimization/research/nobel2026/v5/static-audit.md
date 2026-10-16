# V5 入口与时间线静态检查（只读）

检查时间：2026-10-06（Asia/Shanghai）

## 已通过

- `npx tsc --noEmit --pretty false`：通过。
- `timeline-v5.json` 的 7 个有声场景内部连续，无 clip gap/overlap；场景边界连续。
- 22 个 clip 的字幕片段均有 start/end，未发现反向时间码；单条字幕均不超过 24 个汉字。
- `FilmV5.tsx`、`WorldV5.ts`、`EvidenceFigureV5.tsx`、`render_nobel2026_v5.mjs` 未发现 `Math.random`、`requestAnimationFrame`、CSS `animation`/`transition` 或 `Date()`。
- WorldV5 是确定性的 Canvas 2D 绘制；没有 V4 的 Three.js 脑/小鼠实体模型。
- `EvidenceFigureV5` 的图片尺寸与初始裁切坐标和官方本地资产一致：Fig.2 2500×964，Fig.3 2500×1100，Fig.4 2500×996，Fig.5 2500×1027。

## 必须在渲染前修复或明确

1. **片长**：`timeline-v5.json` 为 8192 帧、273.067 秒（4:33），与 V5 视觉契约的 295–310 秒不符。若继续使用 4:33，应更新目标说明；若目标是约 5 分钟，应增加真实口播/观察镜头，不能用静音填长。
2. **V5 声音未接入**：`FilmV5.tsx` 及 `timeline-v5.json.voicePolicy` 仍指向 `public/nobel2026/audio-v4/master.wav` 和 `audio-v4/raw`。这会保留 V4 的英文姓名和多音字问题，也无法证明 V5 已重新降噪/听审。应在新的 TTS 组装后更换路径与 SHA，并将 `subjectiveListeningChecked` 置为真实结果。
3. **Qwen/Opus 未接入成片**：当前没有 `tmp/claude-runs/nobel-v5-*` 或 `public/nobel2026/*v5*` 生成桥接素材，`FilmV5` 只有 Canvas 和官方图片，未引用视频素材。需要加入有前后端点帧、任务 ID、哈希和采用范围的 Qwen 桥接，或明确本版暂时使用程序化桥接。
4. **引用字符串显示检查**：PowerShell 终端会把 Unicode en dash（U+2013）、middle dot（U+00B7）和 é（U+00E9）显示成替代字形，但 JSON 实际码点已核对正确（`PNAS 100:13940–13945 · 2003`、`Official illustrations · Mattias Karlén`）。仍应在浏览器渲染和最终字幕中复核字体覆盖。
5. **版本标识**：`version` 当前为 `ch06-nobel-v5`，与项目路径 `nobel2026`/V5 短片不一致。建议改为 `nobel2026-v5-short` 或项目约定的明确值，防止发布/清理脚本误删。
6. **尾部安全余量**：每段 clip 相对 `sourceDurationSeconds` 仅多约 0.22–0.25 秒（7–8 帧），低于视觉契约要求的 20–30 帧。重新对齐 TTS 后应以声学尾部留足 20 帧，不能延长静音来遮掩截断。
7. **过期注释**：`EvidenceFigureV5.tsx` 仍有 “The scene's 3D mechanism takes over” 注释。V5 已改为 2D/2.5D，应清除误导性注释。

## 科学内容抽查

- `ChR2` 被描述为光控阳离子通道，未写成主动泵或单一 Na+ 通道；需保持此表述。
- 2005（培养神经元）和 2007（活体小鼠光纤）节点分开，正确。
- 2006 年“命名 optogenetics”作为命名节点，不应写成独立活体实验。
- 2012 年 engram 作为后续经典应用，不应归给三位获奖者的获奖发现。
- 临床段需保留“早期试验/部分视觉恢复”；禁止“治愈”或普通蓝光控制人脑。
- `Fig.5` 光纤焦点使用右半区 x≈1050–2500 的裁切；禁止回到旧稿 x≈980 的错焦点。

## 可复现命令

```powershell
npx tsc --noEmit --pretty false
python tmp/check_v5_static.py
```

以上检查只验证源码和 JSON 结构，不能替代渲染后的逐帧观看、最终 AAC 响度测试、英文姓名复听和 Qwen 接缝检查。

