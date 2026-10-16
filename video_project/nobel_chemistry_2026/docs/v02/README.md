# V02：自然人名读音与连续机制演示

V02 完整 1080p 预览已经输出。V01 保留为独立回退；本页记录新版的真实文件、音频和检查范围，不替代正常速度观看与人工听审。

## 入口

- 显示稿与朗读输入：`docs/v02/narration-v02.json`
- 词级时间线：`src/chemistry2026v02/timeline-v02.json`
- 视觉与合成：`src/chemistry2026v02/`
- 正式母带：`public/audio-v02/master.wav`
- 句源、候选、发音分析及字幕：`audio/v02/`
- 新版字体：`public/fonts-v02/`
- 发音与内容来源：`research/nobelchemistry2026/pronunciation-v02.md`、`content-review-v02.md`
- 完整输出：`delivery/chemistry2026_v02/`
- 最终视频 SHA256：`69c8bc113a91ac1afbb27dfe6f7f7b97f7adc0a3ee6dbea0797d89f1fe3ef934`
- 技术检查：`delivery/chemistry2026_v02/qa-final/qa-report.json`
- 音频检查：`audio/v02/final-audio-qa-v02.json`

## 本机复现

```powershell
npm run check
npm run audio:v02
npm run stills:v02
npm run render:v02
npm run qa:v02
```

仅重渲染既有画面无需重新生成声音。使用现有 `D:/python_project/tts` 个人声音环境；不复制个人参考音频到交付包。渲染脚本只合入本版唯一 master，旧版音轨不参与混音。新版字体与音频均独立于 V01。

公式继续引用已经通过真实 LaTeX 编译的路径 SVG，证据页引用保留的真实官方科学背景。源文件的原论文入口、已取得全文和官方整理分别记录。

所有渲染都按帧驱动。画面锚点跟随实际旁白词时序；字幕由显示稿生成，不把 TTS 发音提示直接放上画面。验证分为科学来源、声学读音分析、词级对齐、视觉抽样、完整解码与最终 AAC 响度，不相互替代。自动整句筛查没有发现明显漏词或句尾截断，但 `humanListeningChecked` 仍为 `false`；Soai 的日语读法有日本学士院表记支持，Kagan 的完整母语读音仍记录为候选而非本人录音结论。
