# V4 音频与画面接口

本片读取 `src/story.json` 的 `cues`，每句只朗读 `spokenText`，字幕使用 `text`。`visualAction` 不朗读。完整句子由用户本地 Qwen3-TTS-0.6B 和既有个人参考音色重新合成，V2 的旁白不进入 V4。

输入每句包含 `id`、`scene`、`text`、`spokenText`、`pauseAfterSec`。实际时间由生成的声源决定，不通过加速或截断去适配估计镜头长度。

音频流水线仅向本片 `work/audio`、`public/audio` 和音频文档写入。主编辑负责把冻结时间文件接入 `src`，避免竞争修改入口。

| 文件 | 含义 |
|---|---|
| `work/audio/narration.json` | 每句实际起止帧、起止采样点、原声长、保护后长；分场景时序 |
| `work/audio/captions.json` | 规范源稿的短字幕，ASR词锚点辅助定时，最长22字符 |
| `work/audio/subtitles.srt` | 可导入平台的独立字幕 |
| `work/audio/beats.json` | 配乐检测拍点，单位秒；不保证每个点都是小节重拍 |
| `work/audio/word-events.json` | 对“黄、红、蓝、交换、证书、拒收”等教学动作有用的实际词锚点 |
| `public/audio/master.wav` | 最终立体声母带，供Remotion直接使用 |
| `public/audio/narration.wav` | 独立旁白，用于重混音与核对 |
| `work/audio/voice-generation.json` | 每句文本、种子、参数、模型与参考哈希、真实生成时长 |
| `work/audio/source-qa.json` | 逐样本完整拼入、字幕覆盖、首尾电平与滤镜延迟检查 |
| `work/audio/audio-qa.json` | 音轨采样数、响度、真峰值、音乐循环位置 |

## 运行环境

Python 使用 `D:/python_project/tts/.venv/Scripts/python.exe`；不修改全局TTS安装。Windows WDDM 初次加载时，Transformers 的大块缓存预热分配失败；本片在当前进程跳过这项仅用于分配加速的预热，不改模型权重，不改变生成参数。

## 制作边界

只对 raw 加80ms前护和160ms后护，进行温和低切、轻降噪、轻动态处理；每句测量并补偿滤镜延迟。保留全部源长和原始WAV，不硬门限切句。错误或漏字重合成整句，不能由后期降噪补救。

ASR无提示词、无VAD切除，使用本地Whisper-small CPU int8。ASR写出相同文字、同音字、近音字都不构成声调或悦耳度验收。报告的主观听审默认保持未完成，只有真实听审后才可更改。

配乐使用用户指定MP3，从原文件重新解码和检测。保留原曲前段，通过相同节拍相位的乐句循环延长；旁白前提前闪避、句后慢恢复，音乐和声音分别留档。最终MP4生成后仍需再次核查编码响度与音画同步。
