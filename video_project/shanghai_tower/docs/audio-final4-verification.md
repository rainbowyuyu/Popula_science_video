# V8 final4 · 实际成片音频验收附录

`delivery/ShanghaiTower_1080p_v7.mp4` 中的实际 AAC 已由 `scripts/qa_final_audio.py` 解码并通过客观信号核验。文件名沿用稳定交付名，实际渲染修订为 `v8-final4`，共 15,712 帧、523.733333 秒。

本次证据为 `research/qa/v8-final/audio/audio-wave-match.json`，对应视频 SHA256：

`b3a12389f44aaf96bbc39e7f11faba66e2f833d5d2e0310d4866e4ae82c84e2e`

| 检查 | 实测结果 |
| --- | --- |
| 编码及声道 | AAC，48 kHz，双声道 |
| 解码长度 | 25,139,200 样本，与锁定母带完全相同 |
| 编码采样偏移 | 0 样本 |
| 综合响度 | −15.03 LUFS |
| 真峰值 | −1.65 dBTP |
| 四个 12 秒语音窗口 | 相关性 0.999984–0.999991；最大相对均方根误差 0.005663 |
| 片尾纯音乐窗口 | 514.933333–522.233333 秒；相关性 0.999972；相对均方根误差 0.007546 |

选定配乐仍为聲無哀樂SWAL《飞升》。AAC 只由完整母带编码一次；无裁切、延时、补白、淡变或重新归一化。检查前核对成功渲染标记、实际交付哈希、`v8-production-lock4.json`、母带和时间线哈希，检查后再次核对音频及时间线未变。

证据绑定：

- 母带：`097863c2db47b381768f9e6c93b2e0379895d548d353627b9de1d32c6530e48e`
- 音乐：`4460b5f1fdef504dc4d46a80b4cdb894624c5a5f131d743c4ec4b82d65247787`
- 时间线：`b641306d6ca1a5c9cfb520dee66a54a1d76d6cbd510b7381cfd64902c6bfcd5e`

`research/v8-final-audio-lock.json` 保留声音源锁定时的历史快照，其中 `finalVideoAACChecked=false` 是当时状态。本附录与实际 AAC 报告给出后续成片验收结果，不重写该源快照。

本次证明音轨身份、长度、时序及客观声学指标。`subjectiveListeningChecked=false`、`pronunciationListeningVerified=false` 保持不变；ASR 和波形比对不等于人工听审或声调认证。视频画面与最终打包验收由各自报告负责。

复现命令：

```powershell
& 'D:/python_project/tts/.venv/Scripts/python.exe' -X utf8 scripts/qa_final_audio.py --video delivery/ShanghaiTower_1080p_v7.mp4 --out research/qa/v8-final/audio
```
