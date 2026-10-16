# 本集指定配乐：The Sixth Axis

**已由用户后续指定的 聲無哀樂SWAL《飞升》替代，本文及本目录仅保留历史。当前入口为 `scripts/arrange_feisheng.py`，不可重新将本曲覆盖到交付音轨。**

用户明确指定本地 `D:/CloudMusic/John Stanford - The Sixth Axis.mp3`，替代之前的抖音链接。原曲标签为 John Stanford / The Sixth Axis / Automatica，源文件 SHA256 与授权记录见 `analysis.json`。这是一份用户提供的商业录音，不能归入 VSCO 采样、原创配乐、CC0 或已核实的开放许可。

## 编排方式

- 保留原曲自身的段落推进、安静段和最后收束，音高不变。
- 原曲约 306 秒有末尾强收束，随后留下数秒自然余韵；310.2 秒之后已接近静音的残响不进入成片，原始 MP3 不修改。
- 以实测约 137.999 BPM 的脉冲为基础，选同曲和声上下文相近的 8 / 16 小节重现。小节以四拍分组，属于剪辑分组，未声称核实了原谱下拍。
- 同曲回接使用约一拍的互补余弦交叠。全部乐段只有一个小幅全局 Rubber Band 时长适配，`pitch=1`；没有任意逐段变调或忽快忽慢。
- 章节调整只使用平缓的电平及高频细节曲线。叙述中段减少干扰，拼装段恢复节奏细节；每句前提前压低音乐，整句维持，避免逐字抽吸。
- 活跃人声比配乐高 17.8 dB；母带约 −15 LUFS，试编码 AAC 真峰值不超过 −1.5 dBTP。最终 MP4 的 AAC 仍需另测。

## 入口与依赖

Python：`D:/python_project/tts/.venv/Scripts/python.exe`。FFmpeg 需提供 Rubber Band 滤镜；分析依赖 librosa、NumPy、SciPy、SoundFile。所有新混音先写入独立 `mixes/<时间>-<timeline哈希>/`，通过检查后才替换生产声音。

1. `analyze_music.py`：源音乐音高/色度和节拍分析，生成 `analysis.json` 与 `analysis-features.npz`。
2. `../../scripts/arrange_sixth_axis.py --apply`：读取实际 `public/timeline.json` 与 `public/narration.wav`，按当前实声长度编排、混音和验证。
3. `verify_arranged_pulse.py`：在最终编排波形上重新检测拍点，检查计算节拍网格的实际误差。
4. `../register_sixth_axis.py`：登记本系列 `music-history.json`，保留源文件、混音和时间线哈希，不改变其他集记录。
5. `../../scripts/validate_audio.py` 与 `../write_v7_audio_notes.py`：检查完整音频合同并更新交付说明。

不能在这之后执行旧的 `scripts/mix.py mix`，它会换回本集之前的原创曲。解说更新时只执行 `scripts/mix.py prepare`，再完成字幕、词时和时间线状态，随后重新运行本编排器。

## 检查记录

`current-arrangement.json` 指向当前选用混音和完整报告。`research/sixth-axis-beat-grid.json` 提供拍点秒数及帧号，`research/sixth-axis-motion-beat-cues.json` 给出解说动作邻近拍点；它们随最终时间线重新生成。

2026-10-09 的临时时间线为 450.966667 秒 / 13,529 帧，配乐统一速度系数 0.996374316，节拍为 137.498531 BPM。独立实测 930 个有效拍点，95% 绝对误差 15.9 ms；连续配乐检查无中段一秒静音窗。此时间线仍保留待验收 CFD 的旧旁白，不能作为本轮最终成片。

声音检查使用源文本、ASR、完整波形、响度、真峰值和节拍分析；`subjectiveListeningChecked=false`。不要把这些指标称为人工复听或“播音级”认证。
