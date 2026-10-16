# V6 故事与个人旁白工作流

在V5完整可交付文件之外制作；不覆写V5音频、源码或母版。标准讲解正文是 `src/story-v6.json`，逐句可读版 `delivery/V6完整旁白.md`。37句保持原机制编号，删掉算法学名堆叠，用家庭视频和小纸条把整段恢复过程连起来。

所有命令在DNA的v3目录执行，Python为 `D:/python_project/tts/.venv/Scripts/python.exe`。

1. `scripts/voice_v6.py --plan` 检查正文，`--ids n01,n04,n14` 先做生活开头、二进制、递推小样。
2. `scripts/prepare_voice_v6.py --ready-only` 温和清理已有句源；`scripts/preflight_asr_v6.py` 用CPU离线Whisper，不带提示、不开VAD，检查新句内容。
3. `scripts/voice_v6.py` 合成其余完整句源。已有匹配源按文本、种子、模型/参考SHA与实际参数缓存；修改任意口播会使相应缓存失效。原声都在 `work/audio-v6/raw/`。
4. `scripts/prepare_voice_v6.py` 前导80ms、尾护160ms，再用用户既有 `broadcast_voice.py`，测滤镜延迟并保持全长；根据真实音长布置时间轴，绝不为整数五分钟拉伸。
5. `scripts/asr_captions_v6.py` 词锚对齐短字幕，保护轻声首尾；`scripts/mix_v6.py` 把同片《DNA档案微光》的主题按新时长重编，使用原CC0乐器库，句前闪避、句后平滑恢复。
6. `scripts/qa_audio_v6.py` 验证逐采样拼接、字幕语音覆盖、音画帧时长、WAV/AAC电平和母带延迟；通过后 `scripts/activate_audio_v6.py` 接入 `public/audio/v6/` 与两个V6源码JSON。

听感不以ASR相似度冒充。near-homophone差异单独记录，未真人听审时 `subjectiveListeningChecked=false`。文字音节缺失需要重新整句合成，不能靠降噪和补静音修复。
