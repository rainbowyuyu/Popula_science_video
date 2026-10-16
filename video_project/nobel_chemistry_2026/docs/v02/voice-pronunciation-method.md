# V02 个人声音与专名发音

旁白继续使用 `D:/python_project/tts/work/clone-reference.wav` 的 rainbow鱼 个人音色，模型为本地 Qwen3-TTS 0.6B。中文正文按自然语速合成，不做加速；原始句源与清理后的句源分开保存。

## 显示文本和实际发音

- `Henri B. Kagan` 是正式画面／字幕拼写。姓名发音使用同参考音色的 French-language `Henri Kagan` 短载体，口播省略中间名缩写 B.；姓氏采用短元音，避免原先明显的英语 kay-gan。研究中的法语 `/ka.ɡan/` 是语言学候选，没有把它写成已听到的本人官方读音。
- `Kenso Soai` 的权威日语姓名依据为日本学士院的「そあい けんそう」。合成使用 Japanese-language `ケンソー・ソアイ`，独立日语转录得到 `ケンソーソアイ`；Soai 保留 `so-a-i` 三个元音拍，不合成英文 soy 或 sow-eye。拉丁字幕始终保留 `Kenso Soai`。
- `Louis Pasteur` 使用同音色 French-language 短载体。
- `Charles Frank` 使用同音色 English-language 完整短句的开头人名。

所有载体均来自同一份个人声音参考，并非借用研究者的真实声音。完整句中需要替换的区间通过 Whisper cross-attention DTW 定位，按局部有效响度匹配，使用 12 ms 交叉淡化；不改变载体的速度或音高。编辑后重新做完整句转录和字幕对齐，不沿用编辑前的时间戳。

## 留存与可复现

- `audio/v02/pronunciation/`：候选音频、请求参数、哈希、独立转录和预期文本对齐。
- `audio/v02/before-pronunciation/`：姓名替换前完整句源和定位时间。
- `audio/v02/pronunciation-edits/`：各句实际采用的源片段、起止时刻、音量匹配和原／新音频 SHA。
- `audio/v02/whole-sentence-review/`：编辑后完整句的 Qwen3.8 Omni 独立机器筛查。
- `audio/v02/asr/`：最终句源的独立 ASR，以及另列的预期文本强制对齐。

## 失败候选与校验边界

`kagan-french-native.wav` 生成到 61.36 秒，明显超出载体长度，未采用。混合中文／假名的 Soai 候选也未采用。最初“两个名字”的诱导提示可能让模型补出不存在的名字，相关结果只保留为失败排查记录。

短外语人名缺少语境时，音频理解模型会猜错语言。例如它曾把日语短载体转录为中文；独立日语识别和逐音节对齐提供了不同证据。ASR 正确拼写、强制对齐成功和机器说“发音正确”都不等同于人工听审。交付元数据明确保留 `humanListeningChecked: false`，不声称母语者或本人发音已人工认证。

字幕上的姓名是正式名字，口播省略中间缩写属于常规姓名朗读差异。原音频经过温和高通、低通、降噪、去齿音和动态控制；保留句尾 PCM 缓冲。最终音轨只由 V02 当前人声和 Dawn 配乐组成，不混入 V01 母带或背景生成视频的声音。
