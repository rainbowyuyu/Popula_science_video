# V4 交付检查用法

`scripts/qa_delivery_v4.py` 只读取明确选择的文件，不会渲染、生成音频、覆盖 V3 入口或自动回退到旧视频。需要 Python、numpy、soundfile 与 ffprobe。默认输出 `research/delivery-qa-v4.json`，任何缺文件或检查失败均返回退出码 1。

从当前 `v3` 目录执行，最终视频文件名应替换为实际 V4 交付文件：

```powershell
python scripts/qa_delivery_v4.py `
  --narration work/audio-v4/narration.json `
  --captions work/audio-v4/captions.json `
  --master work/audio-v4/master.wav `
  --narration-wav work/audio-v4/narration.wav `
  --asset-root . `
  --cue-file-key workingAudioFile `
  --raw-dir work/audio-v4/raw `
  --processing-dir work/audio-v4/processing `
  --video 'delivery/实际的V4文件名.mp4'
```

如需验证接入 public 后的正式路径，使用 `--asset-root public --cue-file-key audioFile`，其余参数仍必须指向本次 V4 的真实文件。`--narration` 指时间轴 JSON，`--narration-wav` 指无配乐的完整旁白轨；不提供后者时只查找所选 master 同目录的 `narration.wav`，该解析结果会写入报告。

检查项包括：48 kHz 双声道 WAV 和时间轴样本数、每句完整片段与旁白轨逐样本比对、原始片段长度加前后保护时长、原始/清理文件与处理记录哈希一致、每句及总计有声字幕覆盖至少 95%、全部字幕字符数不超过 24、字幕顺序不重叠及原文字句完整、素材 SHA-256、实际 MP4 的 1920×1080/30 fps/帧数、音视频起点和终点误差不超过一帧。字幕有声覆盖采用独立的 10 ms RMS 活动检测，不豁免片尾呼吸区。

可增加 `--source-manifest 路径 --manifest-root .`，核对清单中的 `{files:[{path,sha256}]}`。否则仍记录所有实际检查文件的哈希，但不会宣称与某个未提供的清单匹配。`--raw-dir` 与 `--processing-dir` 虽是 CLI 可选参数，缺少时原始长度证据检查会失败；不会把未证明的无截断状态报为通过。

V3 回归运行必须明确使用 `--expected-version 3 --label v3-script-regression`。即使 V3 所有检查通过，报告中的 `v4DeliveryVerified` 仍为 `false`。该字段为 `true` 只代表选定的版本 4 输入全部通过这些自动检查，不代表人工试听、画面审美或成片中字幕遮挡检查已经完成。ffprobe 本身也不证明编码音轨就是所选 WAV；如需确认混音内容一致，还需单独听检或解码波形对照。

## 来源与激活核对

本地音频及正式 public 副本就绪后，执行：

```powershell
python scripts/build_v4_manifest.py
node scripts/qa_timeline_v4.mjs
```

来源生成器默认核对 `work/audio-v4/`、`public/audio/v4/`、`src/narration-v4.json`、`src/captions-v4.json`，输出 `research/v4-source-manifest.json`。它记录本地模型权重与配置文件的 SHA-256、参考音色 SHA-256、每句请求与输出哈希、工作/激活 JSON 等值、原始/清理音频及逐样本拼接、工作/激活母带哈希、新配乐与编曲清单、实际混音记录输入输出以及 V4 入口/场景/相机/时间映射源码。`work/audio-v4/audio-mix-v4.json` 中的 narration、timeline、music、transitions 必须与选择的实际文件匹配；新配乐仅仅存在不会通过混音来源检查。云端 V4 候选被放在 `excludedCloudCandidates` 中，确认与采用音频的哈希不相交。最终 MP4 可通过 `--video 实际路径` 纳入哈希清单；来源清单始终保留 `finalDeliveryVerified: false`，成片验收由独立交付检查承担。

时间映射脚本输出 `research/timeline-map-qa-v4.json`，执行真实 `TimelineV4.ts`，检查章节接点、60 Hz 时间采样、随机顺序 seek、每句映射边界，利用独立五次多项式及其导数临界点验证严格单调，在内部章节接点检查 C1/C2 连续性。开始与结束之外的 clamp 不强行要求端点速度连续。`--expected-version 3 --label v3-placeholder-regression` 只用于验证旧占位 JSON；自定义 `--narration`/`--source` 测试样例也不会被标记成正式激活的 V4 检查通过。
