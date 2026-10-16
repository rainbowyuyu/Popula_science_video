# 微光信使 / Messengers of Light

2026-10-08，为本片创作的 D 大调 / B 小调、3/4 拍、76 BPM 室内乐配乐。
V3沿用本片《微光信使》的原创主题，由 `scripts/score.py` 按本轮实测片长重新安排音符时间、密度和叙事配器；没有导入其他影片的音乐录音、旋律或配乐 stem。V2原音乐与编配记录保存在 `audio/selected-prior/v2-before-v3/`。单音采样及播放技术沿用同一授权来源。

配器：轻触立式钢琴、竖琴、中提琴、大提琴、拨弦和极轻的手鼓触音。
以温暖的三拍律动进入，机制讲解段逐渐加入拨弦与低弦，证据与片尾段收束到明亮、克制的钢琴和弦。

单音采样来源：VSCO 2 Community Edition。
官方仓库：https://github.com/sgossner/VSCO-2-CE
固定版本：440300901dfe9275fd84e0b7763af1f8443ae62e。
许可：CC0 1.0 Universal；官方完整许可原文保存在 `samples/LICENSE`，逐文件官方 URL、长度和 SHA256 保存在 `samples/manifest.json`。
录音：Sam Gossner / Versilian Studios；Simon Dalzell / Ivy Audio；采样编辑：Elan Hickler / Soundemote。
CC0 无强制署名要求，发布时可自愿致谢 VSCO 2 CE acoustic samples。

复现：先完成本轮选定配音与 `mix.py prepare`、`qc.py --captions-only`，再运行 `D:/python_project/tts/.venv/Scripts/python.exe scripts/mix.py mix`，按新实测片长重新编配。只有片长不变的混音复查才使用 `--reuse-score`。
单音采样不包含外部成品曲目；无外部曲目署名义务。作品权益不作超出工具能力的法律认定。

历史曲目核对副本：`prior-music-history.json`。本曲标题、调性、旋律、拍号、种子与上期《循光·室内乐版》不同，最终 stem 哈希另存 `research/audio-report.json`。
