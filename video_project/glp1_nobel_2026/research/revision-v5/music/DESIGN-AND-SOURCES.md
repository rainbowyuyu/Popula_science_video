# 餐后晴光 · V5原创配乐

这次重新写了旋律、和声顺序与节奏：F大调/D小调、4/4拍，主题以“A–C–D / C–A–G”的上行问句与“F–A–G–E–F”的回答展开。与原《微光信使》的D大调三拍旋律不同，不导入旧音轨或旧音符事件。事件定义与渲染脚本为 `scripts/score_v5.py`；新旧主旋律相邻精确音符最长仅重合2个，此比较仅说明它不是旧事件表改名，不能作为版权相似性鉴定。

保留两种96秒编配预览：94 BPM的flow有轻拨弦律动；88 BPM的air更稀疏。结构优选flow，依据是健康科普的温暖和向前感：生活和行动段保留问答旋律，机制与证据段让出整小节，反思段减少打击，结尾回到明亮F(add6/9)。钢琴与竖琴轮换旋律，弦乐间歇进入，避免长时间持续低音与逐镜头换曲。没有完成主观听审，不声称已听出“更好听”。

初次预览技术结果：flow −23.40 LUFS，air −24.49 LUFS；两者真峰值均−6.02 dBTP、48kHz立体声、96秒，零削波。独立音乐预览尚未按最终旁白混音；数值不代表交付母带。32秒和64秒分块拼接的样本差未超过邻域正常变化，报告在 `selection.json`。最终将依据实际口播安排musicCue，再完成句级ducking与AAC测量。

音源只使用工程已有的VSCO2 Community Edition独立乐器采样，未新增购买或付费服务：

- 官方仓库：https://github.com/sgossner/VSCO-2-CE
- 固定版本：`440300901dfe9275fd84e0b7763af1f8443ae62e`
- 许可：CC0 1.0；原文副本 `VSCO2-CC0-LICENSE.txt`
- 原始来源、逐文件SHA：`sample-sources.json`；实际共享样本仍在 `research/music/samples/`
- 录音：Sam Gossner / Versilian Studios；Simon Dalzell / Ivy Audio。采样编辑：Elan Hickler / Soundemote。

每次音乐渲染会核验清单内40项来源文件，并在事件报告绑定采样器脚本、乐曲脚本、manifest和样本SHA。参考音色没有复制到本片或交付包。音乐历史已检索；当前只保存候选预览，正式选定并完成全片混音后再登记最终曲目哈希。
