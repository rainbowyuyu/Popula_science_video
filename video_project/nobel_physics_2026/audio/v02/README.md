# V02 音频

V02 使用 17 个与 V01 相同的场景 ID，但重新录制了更短的主播口播。每段语音在生成后用 `ffprobe` 测量，再以 0.55 秒呼吸间隔拼接；渲染必须读取 `src/physics2026/timeline-v02.json` 的帧边界，不要按文案长度推算。

- 声音：`zh-CN-YunxiNeural`，`rate=-3%`
- 实测时长：301.790 秒（30 fps，9054 帧）
- PCM：48 kHz、stereo、s24le
- 目标响度：约 -15 LUFS，真峰值约 -1.5 dBTP
- 主文件：`master.wav`；旁白单轨：`narration.wav`

重建：

```powershell
python scripts/build_audio_v02.py
```

脚本会保留已成功生成的 MP3，并仅重试缺失或零字节的 Edge TTS 片段。最终渲染使用 `public/audio-v02/master.wav`。
