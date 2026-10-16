# Roadster V06 / 原片 → Qwen → 讲解

本版新增 439 帧片头（30 fps），不改动 V05 原有内容。官方镜头 289 帧，生成桥接 150 帧。最终 9939 帧 / 331.3 秒。

## 恢复依赖

保留当前目录结构，同时保留：

- `output/v05/Roadster_倒挂与飞行翻滚_1080p.mp4`，SHA256 `a8bca11b82bef640df7d4662f08a6172361ccc75513cff48ef3ec2ea53d76127`
- `output/v05/Roadster_v05_可恢复源码.zip`（V05 原有源码、旁白、品牌字体与证明资料）
- V06 增量包中的 `source/v06`、`assets/v06`、`work/v06/qwen` 与核验记录。

增量包不重复打包上一版视频和恢复包。原始 BGM 仍位于用户指定的本地音乐目录；当前 V06 master.wav 已冻结，恢复成片无需再次调用 TTS、Qwen 或读取音乐目录。

## 无外部生成调用的重新合成

从项目根目录执行（Python 需要 Pillow；FFmpeg/FFprobe 在 PATH）：

```powershell
python source/v06/scripts/assemble.py body
python source/v06/scripts/assemble.py intro --bridge work/v06/qwen/attempts/official-to-teaching-001/provider.mp4
python source/v06/scripts/assemble.py final
python source/v06/scripts/deliver.py
python source/v06/scripts/qa.py
```

`assemble.py` 对视频色域与视频时间戳显式归一化，保留全部 B 帧的 PTS/DTS，防止合并时丢失首帧或缩短尾部。音频使用既有 V06 母带。`mix_intro.py --intro-seconds 14.633333333333333` 可从本地原音乐及 V05 旁白重做混音；采用用户 TTS 目录虚拟环境内的 numpy/scipy/soundfile。

## 核验范围

完整解码、9939 帧连续 PTS、画音长度、最终 AAC 音量/真峰、无全黑段和无异常长静音；字幕逐项后移核对；两端接点及前 20 秒抽帧、浏览器播放抽查。保留 V05 画面原检查记录作为继承证据，不能表述为本轮全片人工重看或主观完整听审。

Qwen 生成只做 5 秒艺术化衔接，轮毂与车端存在由实拍到模型的形态简化；生成段明确显示 AI 转场标记。原片由 Tesla 官方发布，属于引用素材，不是 CC 资产。
