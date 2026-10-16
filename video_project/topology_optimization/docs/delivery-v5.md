# Nobel 2026 V5 交付记录

## 成片

- 1080p 预览：`delivery/nobel2026_v5/一束蓝光能叫醒一颗神经元_v5_完整预览1080p.mp4`
- 规格：1920×1080、30 fps、约 273.13 秒、H.264 + AAC 48 kHz
- SHA-256：`A424DA5A329664B01FD82A35293209DE3727C954C7127B66EECF82DBCD10CFAC`

## 视觉重构

V5 以第四章的连续讲解节奏为参考，删除失真的 3D 大脑、藻类、青蛙和小鼠模型，改用帧驱动的 Canvas 2D/2.5D：光束与因果链、衣藻趋光轨迹、光控膜通道与离子流、神经元动作电位、抽象脑区与光纤，以及官方 Nobel 图示证据卡。公式、实验结果和证据图片分别由程序绘制或使用已核验的官方素材。

- 视觉入口：`src/index-nobel2026-v5.tsx`
- 时间线：`src/nobel2026/timeline-v5.json`
- 动画世界：`src/nobel2026/WorldV5.ts`
- Remotion 组合：`src/nobel2026/FilmV5.tsx`
- 论文证据卡：`src/nobel2026/EvidenceFigureV5.tsx`
- Qwen 桥接规范：`docs/visual-v5-notes.md`

没有合格的 Qwen 生成桥接片段进入当前预览；`public/nobel2026/qwen-v5/bridges/` 保留为相邻端点素材的接入位置，当前接缝使用确定性的 Canvas 运动。这样不会把生成画面冒充科学证据。Opus 的视觉设计要求记录在 `tmp/nobel-v5-opus-brief.md`，最终动态由本地工程适配并逐帧渲染。

## 声音

V5 将已测量的 V4 旁白母带复制到独立路径 `public/nobel2026/audio-v5/master.wav`，不重新合成或改变音高；V5 只修正了字幕/视觉安全区。母带 SHA-256：`8E4D5BB5DBE03D2183E5C597FB00544870824F275BE1BD8CAB91324FF3EE8F6E`。最终 AAC 的整体响度为约 −15.9 LUFS，LRA 3.4 LU；视频音频时长 273.13 秒，没有旧版本音轨叠加。

## 复现与检查

```powershell
npm ci
npm run check
npm run stills:nobel:v5
npm run render:nobel:v5 -- --concurrency=4
ffprobe -v error -show_streams delivery/nobel2026_v5/一束蓝光能叫醒一颗神经元_v5_完整预览1080p.mp4
```

渲染脚本还支持 `checks`，会在每个场景的首帧和过渡位置输出抽查帧。V3/V4 文件保留为回退基线；V5 通过确认后再进行 4K 合成。

## 研究团队标注

画面把关键实验对应到具体合作团队，并将完整作者名单留在研究台账：

- Nagel · Hegemann · Bamberg：ChR1/ChR2 与蛙卵通道实验（2002–2003）
- Boyden · Zhang · Deisseroth：培养神经元的毫秒级光控（2005）
- Aravanis · Wang · Deisseroth：光纤进入活体小鼠运动皮层（2007）
- Liu · Tonegawa：光遗传学重激活记忆痕迹（2012）

这些标签使用安全区纸底，不压标题、证据图或字幕；旁白仍沿用已测量音轨，避免新增未经重录的语句造成音画不同步。
