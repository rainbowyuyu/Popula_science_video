# DNA存储与生信算法｜交付说明

## 内容定位

片名：**DNA 能把文件装进一滴液体吗？**
系列：**5分钟科普 · 生信算法与 DNA 存储**

从“家庭视频能否装进一滴液体”的可验证问题出发，视频沿一条连续链路讲清：切片与地址 → A/T/C/G 映射 → GC 与同聚物约束 → DNA Fountain 冗余 → 合成/保存/测序噪声 → 地址聚类/局部比对/共识 → 大模型辅助筛选与检索 → 文件复原。

## 片中边界

- Fountain 的“液滴”是编码结构的可视化称呼，不是 DNA 天然液滴。
- 红色替换/插入/缺失字符是固定生成的教学样本，不代表真实实验数据。
- 大模型只辅助候选序列筛选、质量预测、检索和工具调用，不能替代纠错码、合成仪或测序仪。
- 场景中的比例和颜色用于解释算法关系；真实实验仍需由合成、测序和质量控制数据验证。

## 来源

- Goldman et al. (2013), *Towards practical, high-capacity, low-maintenance information storage in synthesized DNA*, Nature. DOI: 10.1038/nature11875
- Erlich & Zielinski (2017), *DNA Fountain enables a robust and efficient storage architecture*, Science. DOI: 10.1126/science.aaj2038
- Organick et al. (2018), *Random access in large-scale DNA data storage*, Nature Biotechnology. DOI: 10.1038/nbt.4079
- Ceze, Nivala & Strauss (2019), *Molecular digital data storage using DNA*, Nature Reviews Genetics. DOI: 10.1038/s41576-019-0125-3
- Dalla-Torre et al. (2024), *Nucleotide Transformer: building and evaluating robust foundation models for human genomics*, Nature Methods. DOI: 10.1038/s41592-024-02523-z
- Zhou et al. (2023), *DNABERT-2: efficient foundation model and benchmark for multi-species genome*, arXiv:2306.15006
- Smith & Waterman (1981), *Identification of common molecular subsequences*, J. Mol. Biol. DOI: 10.1016/0022-2835(81)90087-5

## 音频与复现

- 旁白：本地 Qwen3-TTS 个人参考音色，逐句生成并记录在 `research/voice-generation.json`。
- 混音：`scripts/mix_dna.py`，48 kHz 立体声，旁白轻度带通/边缘淡化，音乐自动 ducking；最终指标写入 `research/audio-mix-manifest.json`。
- 配乐：`public/music/dna_ambient.wav`，本集重新选配，不能视为科学证据。
- 视频：Remotion + Three.js，固定时间线 `src/timeline.json`，渲染命令见 `scripts/render_dna.mjs`。

## 交付文件

- `delivery/DNA存储与生信算法_1080p.mp4`
- `delivery/cover_16x9.jpg`、`cover_3x4.jpg`、`cover_4x3.jpg`、`cover_9x16.jpg`
- `delivery/copy.md`
- `research/audio-mix-manifest.json`
- `research/voice-generation.json`

## 验收记录

- `npm run check`：通过。
- 成片：300.000 秒，1920×1080，30 fps；含 48 kHz 双声道 AAC 音轨。
- 母带：300 秒、48 kHz、立体声、24-bit PCM；34/34 句成功，缺失 0，约 −19.2 LUFS，峰值约 −1 dBFS。
- 旁白与字幕按 `src/timeline.json` 槽位对齐；转场使用上一场景出屏与下一场景入屏的镜头接力。
- 未发现黑场；API 密钥未写入源码、日志或交付文件。
