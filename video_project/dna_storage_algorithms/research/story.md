# DNA 存储与生信算法：故事、来源与可视化台账

## 片名

**DNA 能把文件装进一滴液体吗？**

系列条：**5分钟科普 · 生信算法与 DNA 存储**

## 叙事结构

1. 从“把家庭视频缩进一滴液体”引入；先展示读回失败，再进入算法。
2. 文件分片与地址索引；二进制映射到 A/T/C/G。
3. 约束编码：GC 比例、同聚物上限、候选序列退回。
4. DNA Fountain：随机异或成 droplets，保留冗余以抵抗丢片。
5. 合成、保存、测序；展示替换、插入、缺失和丢失 read。
6. 地址聚类、局部比对、质量加权共识与外层纠错。
7. 大模型工作流：候选码本→约束检查→检索/工具→读回观察→修复→验收。
8. 回到同一个文件，说明 DNA 存储的优点与成本边界。

## 口径

- 动画中的错误样本是固定生成的教学数据，不声称是真实测序实验。
- DNA Fountain 的“液滴”是编码结构，不是 DNA 天然会复制文件。
- 大模型只辅助候选序列筛选、质量预测与文献检索，不能替代纠错码、合成仪或测序仪。
- 论文卡片显示标题、作者与年份；未抓取全文的页面不做全文内容断言。

## 可核对来源

- Goldman et al. (2013), *Towards practical, high-capacity, low-maintenance information storage in synthesized DNA*, Nature, DOI: 10.1038/nature11875.
- Erlich & Zielinski (2017), *DNA Fountain enables a robust and efficient storage architecture*, Science, DOI: 10.1126/science.aaj2038.
- Organick et al. (2018), *Random access in large-scale DNA data storage*, Nature Biotechnology, DOI: 10.1038/nbt.4079.
- Ceze, Nivala & Strauss (2019), *Molecular digital data storage using DNA*, Nature Reviews Genetics, DOI: 10.1038/s41576-019-0125-3.
- Dalla-Torre et al. (2024), *Nucleotide Transformer: building and evaluating robust foundation models for human genomics*, Nature Methods, DOI: 10.1038/s41592-024-02523-z.
- Zhou et al. (2023), *DNABERT-2: efficient foundation model and benchmark for multi-species genome*, arXiv:2306.15006.
- Smith & Waterman (1981), *Identification of common molecular subsequences*, J. Mol. Biol., DOI: 10.1016/0022-2836(81)90087-5.

## 访问记录

Nature 的 Goldman 2013 与 Organick 2018 页面可访问并用于书目信息核对；部分 Science/PNAS/Oxford 页面受 Cloudflare 限制，因此片中只使用 DOI、标题、作者和摘要级结论。
