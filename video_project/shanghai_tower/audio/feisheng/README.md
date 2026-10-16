# 本集最新指定配乐：飞升

用户最新指定 `D:/CloudMusic/聲無哀樂SWAL - 飞升.mp3`，替代先前《The Sixth Axis》及抖音链接。内嵌标签为 聲無哀樂SWAL / 飞升 / 聲無·哀樂。原文件 290.25 秒、4,928,152 字节，文件身份和 SHA256 见 `analysis.json`。这是用户提供的录音，不标为 CC0、原创配乐或已核实开放许可。

## 音乐设计

原录音实测脉冲约 119.9989 BPM；481 个用于拟合的拍点，拟合误差 RMS 10.4 ms。调性色度在段落间变化，故不套用上一首的调性，也不对原曲任意移调。

保留原曲从疏朗到密集的推进和约280秒处的末尾收束，仅将285秒之后接近静音的余响缩短。回接候选同时比较和声色度、鼓点模式和接缝电平，采用同曲8或16小节重复。报告中的四拍分组属于剪辑安排，未声称核对了乐谱的下拍。

编排中的节奏变化来自原曲段落密度、乐句延展及平缓的高频细节曲线：受力解释减少干扰，施工拼装恢复节奏存在感；用半拍/整拍及半速摄影节奏安排运镜和拆合提示，不为对音乐而改写物理求解数据。全曲仅做一次小幅 Rubber Band 时长适配，音高保持不变。

语音活动区间比音乐高18.5 dB，按整句压低音乐，避免逐字抽吸。内段一秒静音检查、源文件和时间线哈希检查、母带及AAC试编码验收均须通过后才替换生产音轨。

## 复现

使用 `D:/python_project/tts/.venv/Scripts/python.exe`：

1. `audio/feisheng/analyze_music.py` 分析源录音，保留拍点和色度特征。
2. `scripts/arrange_feisheng.py --apply` 读取真实的 `public/timeline.json` 与 `public/narration.wav`，编排、混音、检查并替换。
3. `audio/feisheng/verify_arranged_pulse.py` 在实际编排波形上复测拍点。
4. `audio/register_feisheng.py` 更新系列曲目登记，旧曲保留为 superseded。
5. `scripts/validate_audio.py` 和 `audio/write_v7_audio_notes.py` 更新声音验收与交付说明。

最终解说更新后，先运行 `scripts/mix.py prepare`、字幕/词时更新和时间线状态标记，然后重新运行以上第2—5步。不要运行旧 `scripts/mix.py mix` 或 `scripts/arrange_sixth_axis.py`。

`current-arrangement.json` 指向当前应用的完整报告。`research/feisheng-beat-grid.json` 和 `research/feisheng-motion-beat-cues.json` 提供拍点、帧号和动作建议，随最终时长重新生成。原始求解器的时间和响应幅度不受配乐拍点修改。

目前声音验收是波形、文本、ASR、响度、真峰值和节拍的技术检查，`subjectiveListeningChecked=false`。最终MP4的AAC需在实际编码后重新测量。
