# V03 音频

V03 使用本地 Qwen3-TTS-0.6B 和 `D:/python_project/tts/work/clone-reference.wav` 的 rainbow鱼 声音参考，逐句生成 17 段旁白。原始生成、广播级清理和保音高节奏校准均保留在本目录，V02 的音频和成片不覆盖。

旁白处理使用共享的 `broadcast_voice.py`：65 Hz 高通、10.6 kHz 低通、温和频谱降噪、轻压缩，并补偿滤波延迟。Qwen 生成的句子比旧 Edge 版本更紧凑，因此每段只按 V02 的已锁定句长做保音高 `atempo` 校准，避免改变画面、字幕和桥接窗口。

配乐使用用户此前选择的 **“Embrace” — Sappheiros**。原速原调，8 秒循环交接，65 Hz 高通、2.7 kHz 人声避让；旁白活跃时用平滑 sidechain ducking 压低音乐。授权与署名证据见：

`../../ai_evolution_ch04_space_time/research/music/v09/sources.json`

发布署名：`Music: Embrace — Sappheiros. Creative Commons Attribution / creator permission. https://soundcloud.com/sappheirosmusic/embrace`

重建：

```powershell
D:/python_project/tts/.venv/Scripts/python.exe scripts/build_audio_v03_user_tts.py --generate
D:/python_project/tts/.venv/Scripts/python.exe scripts/build_audio_v03_user_tts.py
```

最终音轨为 `master.wav`；`audio-manifest-v03.json` 记录参考声音哈希、每段实测时长、音乐源哈希和混音参数。
