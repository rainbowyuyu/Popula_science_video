# V5 叙事研究与事实审校

核对日期：2026-10-11。交付正文是 `src/story-v5.json`：37 句，口播 1289 个汉字、1289 个非标点字符，冻结版本 v5-compact-3-frozen。可读版本见 `story-v5-narration-draft.md`。没有把目标窗口当作已测音频时长；完整句音频决定正式时间轴。

## 叙事结论

开头直接给观众一个可以等着看结果的挑战：把同一段视频编码，故意删片、改字，再恢复。第二句交代这是电脑中的编码与恢复演示，同时用真实的 2017 年研究给出背景。观众随后一直追踪同一个对象，避免从“存储密度很大”跳到互不相干的术语展板。

核心理解体验有两个：一是删掉一个字后，后面的字整体错位；二是几张各有错漏的副本，对齐以后可以合并证据。先让观众看见现象，再给“插入/缺失”“局部比对”“共识”等名称。中文句子“今天我们去看海”只用于解释，随后必须切回碱基字母，避免让观众误以为算法靠中文语义猜答案。

幽默仅放在动作本身：“可不会按第一段、第二段站好”。不增加装饰性拟人段子。配乐和画面应给关键错误留可感知的停顿，禁止用任意长静音填足五分钟。模型段只有 189 汉字；如果实测超长，优先缩这一段，保住错位、对齐、恢复的完整因果。

## 实际访问和阅读记录

| 来源 | 访问结果、实际读到的范围 | 采用的信息与限制 |
| --- | --- | --- |
| Erlich & Zielinski, *DNA Fountain enables a robust and efficient storage architecture*, Science 355, 950–954 (2017), [DOI](https://doi.org/10.1126/science.aaj2038) | Crossref API HTTP 200，核实标题、作者、2017-03-03、卷页。Science 网站正文 HTTP 403，未冒称读到出版版全文。Europe PMC DOI 查询 HTTP 200，PMID 28254941。 | 2017 发表年份及文献身份有正式元数据支持。 |
| 同名作者预印本与补充材料，[bioRxiv DOI 10.1101/074237](https://doi.org/10.1101/074237) | 实际读取项目已保存的 `public/papers/dna-fountain-2017-preprint.pdf`，正文与补充材料可提取。该文件页脚为 2016-12-04 预印本，不能称为出版版。提取文本保存于 `story-v5-sources/fountain-preprint.txt`。 | 正文描述分块、LT droplets、种子、异或、GC/重复筛选和读回。图 2 出现原始文件名 `the_arrival_of_a_train.3pg`，图 S8(B) 明确标作 **The Arrival of a Train**。这直接支持《火车进站》引子。没有在旁白使用实验条数、分子数或巨大密度数字。 |
| Columbia CS, [Study describing efficient method for storing information in DNA garners wide press coverage](https://www.cs.columbia.edu/2017/paper-describing-method-for-storing-information-in-dna-garners-wide-press-coverage/) | 官方公开 WordPress 搜索 API 找到记录，随后实际读其 [文章 API](https://www.cs.columbia.edu/wp-json/wp/v2/posts/7384)，HTTP 200，发布日期 2017-03-03。全文与 JSON 保存于 `story-v5-sources/columbia-7384.*`。 | 证实 Columbia 官方将该工作和 Erlich/Zielinski 的 Science 论文关联，并提供当时报道链接。此官方短文自身没有写出片名；片名依据来自论文图 S8，不能把标题细节伪归给这篇短文。 |
| Columbia CS, [Study coauthored by Yaniv Erlich describes maximizing data-storage capacity of DNA molecules](https://www.cs.columbia.edu/2017/study-coauthored-by-yaniv-erlich-describes-strategy-for-maximizing-data-storage-capacity-of-dna-molecules/) | 官方 [文章 API](https://www.cs.columbia.edu/wp-json/wp/v2/posts/7373) HTTP 200，读到 2017-03-02 的短摘要，缓存于 `story-v5-sources/columbia-7373.*`。 | 仅作为研究发布背景交叉核对。摘要中的效率百分比没有进入旁白。 |
| Stefanie Fogel, Engadget, [Hard drives of the future could be made of DNA](https://www.engadget.com/2017-03-03-dna-hard-drive-storage.html) | 从 Columbia 官方报道集合中的真实链接进入，HTTP 200，实际读到完整可访问正文，2017-03-03。缓存 `story-v5-sources/engadget.txt`。 | 正文提到研究将操作系统、1895 年法国影片等写入 DNA 并无错读回。借鉴其“具体文件→拆包→丢包恢复”的解释顺序，没有复制其句子。它把“理论上限”“所有流媒体都这样工作”等说得过满，也把测序消耗样本写得像信息必然永久消失；这些表述不采用。 |
| Microsoft Research, [DNA Storage](https://www.microsoft.com/en-us/research/project/dna-storage/) | HTTP 200，本轮实际读取项目概述，缓存 `story-v5-sources/microsoft.txt`。 | 页面明确把方向定位为 **archival storage**，同时承认合成和测序仍有限制。用于片尾“长期档案”定位。没有把页面上的密度、半衰期数值去掉条件后搬进口播。 |
| 原作者 [DNA Fountain 代码仓库 README](https://github.com/TeamErlich/dna-fountain) | 实际读取 raw GitHub README，HTTP 200。读到编码、测序预处理、解码及 MD5 验证命令。 | 支持“恢复后核对文件”的闭环。README 明示原代码未更新兼容性。本片不能把简化 XOR 教学码冒称为运行了该完整研究实现。 |
| Smith & Waterman, *Identification of common molecular subsequences*, J. Mol. Biol. 147, 195–197 (1981), [DOI](https://doi.org/10.1016/0022-2836(81)90087-5) | Crossref HTTP 200，本次只核实元数据；缓存 `story-v5-sources/crossref-smith-waterman.json`。 | 正确定位为局部比对。具体分数与回溯另由本地可重复数值例子核算，不宣称读了当前不可见的全文。 |

失败和未读来源同样保留边界：Columbia Engineering 的尝试地址被 Cloudflare 拦截；Science、The Atlantic、The Scientist 正文 403；Phys.org 的实际报道链接返回 400。若某个猜测地址返回 404，未将其当作来源。Google/Brave/DuckDuckGo 搜索分别受脚本页/限流/验证码影响，Bing RSS 返回无关结果；随后改用 Columbia 官方公开站内 API 找到真实文章。没有完成验证码，也没有把搜索摘要当作已读全文。新闻失败缓存仅作检索日志，不计入有效阅读。

## 可以说到什么程度

1. **历史案例**：可以说“二零一七年，研究者把《火车进站》等文件写进合成 DNA，再读了回来”。文章年份由出版记录支持；片名由论文图 S8 支持。当前未取得或验证原电影素材，画面只用现有 family-memory 图；不得把该图或教学动画标成 2017 年实验影像。
2. **演示身份**：n02 明说电脑编码与恢复演示。数据错误与丢失在 n19 再标“在演示里”。真实合成、纯化、测序动画表达流程，不声称本项目做了湿实验。
3. **编码顺序**：两位对应四个碱基的展示是一种理解入口。实际 DNA Fountain 在形成带种子的 droplet 后映射、筛选；镜头不能画成所有工程都先做裸映射再统一补救。索引、seed、校验占空间。
4. **索引与种子**：段位置线索帮助聚类或恢复顺序；droplet 的 seed 用于重建参与异或的原始块集合。不能把 seed 画成仅是连续的原段页码，也不要口播成“种子编号本身装着全部数据”。
5. **已知块不可省**：只给 `A⊕B`、`B⊕C`、`A⊕C` 不能唯一恢复 A/B/C，因为这三式只有两条独立关系。n14 必须明确显示一份已知 A 或单元素包，再递推。丢失能否恢复取决于保留下来的独立信息；不要出现“随便删多少都能恢复”。
6. **XOR 教学码身份**：若本片制作确定性的 XOR 链恢复例子，应标为“固定教学线性码”，不是完整 DNA Fountain。可以确实编码并恢复一个本地短 MP4，以原始与恢复文件的 SHA-256 一致支持本片中的“一帧不差”；这不等价于化学 DNA 的合成和测序已经完成。
7. **序列约束**：长同聚物和极端 GC 比例会给部分合成/测序工艺带来困难。允许范围需标为示例参数，不能给出一组数就宣布适用所有仪器。
8. **缺失为何危险**：漏一个字导致后续索引错位，并不意味着后续碱基真的全部变异。镜头需显示横向位置移动，再插 gap 归位。这是本轮最应做清楚的一步。
9. **Smith–Waterman 的职责**：它找高分局部对应，不独自完成所有存储错误恢复。回溯从最高分格开始，到零终止；n25 已修正旧稿“沿高分路径往回走”的含糊说法。三副本投票是另一步，不应把两者合成一个黑箱。
10. **多副本的限制**：多数支持通常增加证据，但相关性偏差、所有副本在同一点出错、全部漏掉同一字等情况仍可能失败。不能让投票动画凭空补出从未观测到的字母。质量加权是一种教学选择，不声称原论文按此特定算法运行。
11. **校验范围**：哈希一致可给出文件完整性的极强证据，哈希本身不负责修补错误。真实本地教学程序另直接比较 bytes，避免只看“视频能打开”。
12. **模型段**：序列模型和大语言模型的工具辅助分开。会切词不代表会预测储存错误；需对应设备数据训练/检验，模型建议还需约束检查与实际读回评估。不得把已有基因组模型论文包装成已验证此存储方案。

## 机制槽与画面约束

| 原编号 | V5 内容 | 相比 V4 的集成要求 |
| --- | --- | --- |
| n01–n02 | 恢复挑战、历史背景、电脑演示边界 | 同一段 family-memory 视频贯穿首尾；n02 不切入无授权火车影片素材。 |
| n03–n05 | 文件分段、两位映射、合成顺序 | n04 四组数字保留，TTS 用停顿区分；n05 仍是碱基解释槽。 |
| n06–n09 | 同聚物、GC、筛选、位置线索 | 保留原约束事件槽。n07 显示 G/C、口播“这两种字母”，画面必须同时指示两者。 |
| n10–n15 | 丢块、droplet、seed、XOR、递推、条件 | n14 显示已知甲；n15 有“线索不足就停住”的失败边界。 |
| n16–n20 | 合成、保存、读回、三类错误、多副本 | n19 保留替换→插入→缺失顺序，随后是整条丢失；事件不能提前到口播之前。 |
| n21–n28 | 中文句子、多副本、错位、评分、SW、共识、校验 | n21 新增中文直觉例子；n23 必须让漏字之后整行位移。n25 最高分到零；n28 才汇合共识与冗余恢复。 |
| n29–n34 | 记录错例、序列模型输入、分词、设备数据、验证、工具辅助 | 机制类别未改，但文本显著收短，可将时间让给前半段恢复体验。 |
| n35–n37 | 同一片段恢复、现实限制、档案前景 | n35 的恢复陈述由本地可复现示例支持；不把演示说成湿实验。片尾不给新术语。 |

## 发布前仍需完成

- 使用新 TTS 的每句实测完整时长排轴；目标 300 秒不构成加速、裁尾或静音补时的理由。
- n04 四种二进制组合、n07 的 G/C、n14 的甲乙丙、n26 的人名需试听；ASR同音字不等于发音错误。
- 实际文件恢复已完成：见 `memory-recovery-v5.json` 与 `memory-recovery-v5-independent-qa.json`。3 秒 720p MP4 共 205,572 字节，201 块中删除 87 块并恢复；一个实际块的 48 碱基片段由五份不同错漏读段恢复。恢复前后直接字节比较、SHA-256 均一致。固定 XOR 链有接近一倍的冗余，不能称为完整 DNA Fountain。90 帧图集从恢复文件解码生成。
- 本文是事实与叙事审校，未把计划中的 V5 视频、音频或湿实验宣称为已完成。
