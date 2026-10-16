# V05 个人 TTS 与配乐

V05 是独立的音频包，保留 `audio/v04` 原始目录和成片不变。旁白沿用个人
`Qwen3-TTS-0.6B` 克隆声音参考 `D:/python_project/tts/work/clone-reference.wav`，
使用 V04 的自然语速实测片段拼接，未使用 `atempo` 拉伸；每个片段的来源哈希和
文案记录在 `audio-manifest-v05.json`。

配乐改用 Scott Buckley 的 **Growing Up**（CC-BY）。它是稀疏钢琴织体，保留
电影感，同时给中文辅音、英文姓名和公式留出空间。曲目经过 8 秒交叉循环、高通
滤波、2.5 kHz 人声避让、旁白侧链闪避和响度归一化。发布时请在简介保留：

`Music: Growing Up — Scott Buckley. Creative Commons Attribution / creator permission. https://soundcloud.com/scottbuckley/growing-up-cc-by`

## 生成与复核

在工程目录执行：

```powershell
D:/python_project/tts/.venv/Scripts/python.exe scripts/build_audio_v05_personal.py
```

输出包括 `narration.wav`、`music.wav`、`premaster.wav`、`master.wav`、逐段清理后的
旁白，以及 `audio-manifest-v05.json` 和 `audio-qa-v05.json`。最终母带目标约 −14 LUFS，
真峰值不高于 −1.5 dBTP；QA 中同时记录个人声音参考哈希、音乐授权证据、源文件哈希和
母带测量结果。`public/audio-v05/` 提供 Remotion 可直接引用的三条音轨。

这是音频替换包，不会改动 `src/` 中的镜头或 `audio/v04`。在视频渲染器切换音频前，
请先完成一次正常音量试听，确认音乐存在感和旁白清晰度。
