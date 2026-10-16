# DNA 存储 V6：先让观众在乎，再解释办法

日期：2026-10-11。正文 `src/story-v6.json`。37个原cue编号保留，但全部改写。约1256个非标点口播汉字；实际时长以本地 TTS 为准。

## 本轮实际检索和阅读

1. Microsoft Research DNA Storage： https://www.microsoft.com/en-us/research/project/dna-storage/ 。HTTP 200，读取公开正文，缓存 `story-v6-sources/microsoft-dna-storage.txt`。从数据增长转向档案保存；它对密度和寿命的概括没有连条件，旁白不采用这些数字。采用的是“长期档案”这一问题定位。
2. Columbia 官方站内搜索 API： https://www.cs.columbia.edu/wp-json/wp/v2/posts?search=storing%20information%20DNA&per_page=5 。HTTP 200，实际搜索到2017年官方报道集合及正文。缓存 `story-v6-sources/columbia-search.txt`。从具体已保存文件和报道链接核查历史可行性，避免只靠模型印象。早一次泛搜DNA结果过宽、终端字符输出失败，不计作有效事实证据。
3. Stefanie Fogel，Engadget，2017-03-03，Hard drives of the future could be made of DNA： https://www.engadget.com/2017-03-03-dna-hard-drive-storage.html 。HTTP 200，实际读取article全文，缓存 `story-v6-sources/engadget.txt`。具体文件→小包→部分丢包仍可恢复，提供通俗因果顺序；不复制原句。正文把理论密度、测序损耗和流媒体机制说得过满，均不采用。本轮“换了手机仍想留住家庭影像”的开场是独立的假设情景，没有虚构个人经历。
4. 原作者 DNA Fountain README： https://raw.githubusercontent.com/TeamErlich/dna-fountain/master/README.md 。HTTP 200，实读编码、预处理、解码、checksum示例，缓存 `story-v6-sources/fountain-readme.txt`。读回核验是完整旅程的最后一关，而非“视频能亮起来”就算恢复。
5. 实际复读已保存作者预印本提取文本 `story-v5-sources/fountain-preprint.txt`，重点读了同聚物/GC约束、oligo丢失、seed重建块集合、XOR合并、筛选和电影文件。原PDF：`public/papers/dna-fountain-2017-preprint.pdf`。出版论文身份和元数据沿用已核实事实台账，不声称本轮重新拿到Science出版正文。

## 叙事路线与变化

贯穿的欲望是保住一段舍不得删的视频；不是挑战观众记算法名。每次解决一个问题才引出下一个问题：

- 想几十年后还能看 → 为什么换成分子字母。
- 文件太长 → 写成短纸条；随意字串难读 → 筛掉难序列。
- 纸条混在一起 → 位置线索；纸条彻底丢了 → 预留恢复关系。
- 留下配方 → 异或抵消；一个已知块解出下一个。
- 从分子读回有错漏 → 多副本；副本没对齐 → 留空和评分。
- 对齐后合并证据 → 补整段缺口 → 校验并回到家庭影像。
- 读回暴露难点 → 模型学习常见出错模式，为下一次设计候选。

“纸条”只解释短序列和多副本；XOR用精确相同/不同规则，不能把它画成普通加法。种子是重建原始块选择的配方，不是页码。算法学名留给必要画面标签，不让旁白串成目录。模型使用打印机卡纸的类比帮助理解设备条件；没有把基因组基础模型包装成已经验证的DNA存储优化器。

## 科学边界与画面对齐

- n02一句自然说明这是电脑演示，化学流程是示意，真实电影写入DNA研究独立有来源。
- n04的两位映射是教学入口；真实DNA Fountain先组包、映射、筛选的迭代过程不能被画成所有编码的绝对固定顺序。
- n07画面必须同时高亮G/C，口播用“这两种字母”避免英文字母不稳定。
- n14必须有已知甲，不能从只有三条线性相关的两两关系凭空恢复。
- n15保留线索充分这一恢复条件。全文不使用无限纠错或免费储存承诺。
- n19画面顺序替换→插入→缺失→整条丢失；n23表现的是漏字造成的位置错位，不是其后内容全变异。
- n25局部比对回溯从最大值到零；n26不再念算法人名。n27质量加权不能凭空造出没有证据的字母。
- n28校验值不负责修错；直接字节一致证据沿用 `memory-recovery-v5.json` 和独立QA。
- n29—34模型段约200字，目的只有“把读回经验用于下一次选序列”。合成仪、测序仪的硬件职责只自然保留一处。

没有完成真人逐句复听的报告保持 `subjectiveListeningChecked: false`。ASR用来定位漏读/数字分组，不等同于听感验收。
