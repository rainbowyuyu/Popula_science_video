# 2026 诺贝尔化学奖 Rap 版预览

文件：`2026诺贝尔化学奖_让化学选择同一只手_v04_rap_1080p.mp4`

V04 在 V03 的科学事实、分子动画、论文来源和信息标注基础上，改成真正按拍进入的中文 boom-bap 科技 Rap：每段从 104 BPM 小节强拍开始，短句在重拍前后落点，句尾采用成组近韵；镜像、配体组合、锌醇盐、自催化和三轮实验结果仍按原研究顺序讲清楚。人声继续使用 rainbow鱼 的个人参考音色；Henri B. Kagan 统一读作「亨利·卡根」，Kenso Soai 统一读作「硤合宪三」，两组姓名均按整句重新生成；配乐为本地固定种子生成的原创 104 BPM boom-bap 节拍，没有外部采样。

## Rap Flow v3

押韵和节奏记录见 [`docs/v04/rap-lyrics-v03.md`](../../docs/v04/rap-lyrics-v03.md)。新的鼓组加入切分帽、反拍军鼓、短 808 低音和四小节变奏；旁白在人声活跃处自动闪避，保持术语清晰。

听感结构参考 B 站视频 BV1tJ411P7Cr 的快嘴、反拍和喜剧化 punchline；仅提炼结构，没有下载、采样或复制原视频的音乐、歌词和旋律。参考记录见 [`research/rap/bilibili-reference-BV1tJ411P7Cr.md`](../../research/rap/bilibili-reference-BV1tJ411P7Cr.md)。

## 机器核验

- 1920×1080、30 fps、6647 帧、221.567 秒
- 单一 H.264 视频流、单一 AAC 48 kHz 音轨，完整解码
- 最终响度 −14.6 LUFS，真峰值 −1.7 dBTP
- 93 个内容／接缝抽样帧已输出到 `qa-final-rap-20261008-030638/`
- 成片 SHA-256：`9e0fd930d7644cd3101aaf3cb1f1db54675c3ad7346e0cfcef6560469dc452d`
- Rap 母带 SHA-256：`c9b0e7fa1d5600ecfdff1e88f97b56430934e5252642d457559a8719798907e1`
- TypeScript、966 个视觉回归用例和 424,578 次绘制调用均通过

完整报告见 [`qa-final-rap-20261008-030638/qa-report.json`](qa-final-rap-20261008-030638/qa-report.json)。30 秒试听见 [`audio/v04/rap-preview-v3.mp3`](../../audio/v04/rap-preview-v3.mp3)。自动 ASR 对部分节拍化数字和人名产生了低匹配提示，这些提示已保留在 `audio/v04/final-audio-qa-v04.json`，不能当作人工发音结论；发布前按正常速度复听姓名、化学式和数字段落。
