# 地铁安全线 · 自然口播与疏朗配乐 v2

本版把旁白改成现场讲故事的语气：从“车灯还在隧道里，头发已经先动了”开始，镜头跟随车头、车身、车尾，再落到人的支撑面，最后回到候车动作。保留活塞效应、滑流、尾流、相对风速和阻力平方关系等准确内容，删除模板化的对照句和连续否定句。63句仍按同一12场结构生成，因此现有视觉段落可以沿用同一场景语义。

旁白使用本机 rainbow鱼参考音色与 Qwen3-TTS-0.6B 合成，句子保存在 `public/metro/v2/voice-raw`，低切、轻降噪、均衡、去齿音和软压缩后的句源在 `public/metro/v2/voice`。当前版本没有变速、变调或静音补时；新时间线为 290.2667 秒（含 8 秒片尾）。

配乐《下一站·留白（疏朗版）》是本集重新合成的原创床：每 8 秒一个温暖电钢琴和弦，间隔加入木质单音与极轻低频脉冲，去掉持续刷鼓、密集马林巴和高频切分。混音在人声活跃区间保留约 19.8 dB 的先验分离，并在口播期间进一步压低 30%，避免音乐抢字。WAV 母带测得 −16.00 LUFS、−1.50 dBTP；MP4 AAC 仍需在最终成片上单独复测。

## 复现

```powershell
# 先运行 scripts/voice_metro.py 生成当前 story.json 的句源
# 再把句源复制到 public/metro/v2/voice-raw，并准备 v2 时间线
D:/python_project/tts/.venv/Scripts/python.exe scripts/prepare_metro_audio_v2.py
D:/python_project/tts/.venv/Scripts/python.exe scripts/score_metro_v2.py
```

Remotion 的 Film.tsx 仍读取 `public/metro/master.wav` 和 `src/metro/timeline.json`。确认试听和 QA 通过后，显式执行 `scripts/activate_metro_v2.py` 才会切换到 v2；切换前的音频保存在 `public/metro/v1`，原交付包也保留了旧版。当前 v2 音频与时间线保持在独立目录，便于比较和回滚。
