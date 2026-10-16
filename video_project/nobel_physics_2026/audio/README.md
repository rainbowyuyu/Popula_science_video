# 音频

按版本保存旁白、配乐、混音、响度测量和发音复听记录。正式音频不能引用医学奖 V5.1 母带。

## V05（当前试听母带）

`v05` 使用本地 Qwen3-TTS-0.6B 的 `clone-reference.wav` 克隆声线，按自然语速生成并保留每段实际时长；没有用 `atempo` 拉伸去迎合旧画面。背景音乐改为 Scott Buckley《Growing Up》（CC-BY）稀疏钢琴，采用 8 秒循环交叉、70 Hz 高通、2.5 kHz 人声频段避让和旁白侧链闪避。母带目标约 −14 LUFS、真峰值不高于 −1.5 dBTP。

重建：`D:/python_project/tts/.venv/Scripts/python.exe scripts/build_audio_v05_personal.py`
