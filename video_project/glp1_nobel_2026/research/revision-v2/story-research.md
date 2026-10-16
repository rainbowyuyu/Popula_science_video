# V2叙事检索与实际阅读记录

任务是把48镜头口播改成“真实新闻引子—晚饭—身体消息—发现与改造—临床效果—长期管理”的连续故事。采用rainbow-science-short及其story-research指引，先实际搜索和阅读，再独立改写。以下记录区分全文阅读、定向阅读、仅检索到标题以及失败。

## 实际阅读并采用

1. **AFP / The Business Standard，2026-10-05**：
   https://www.tbsnews.net/world/research-weight-loss-drugs-tipped-nobel-award-week-opens-1562861
   标题“Research into weight-loss drugs tipped for Nobel as award week opens”。HTTP200全文已读，保存在raw/tbs2026.html、raw/tbs2026.txt。文中David Pendlebury因临床影响把GLP-1放在预测名单首位，支持“媒体看好/热门”，不支持官方提名断言。开头仅引用这一公开预测，不编造评审内幕。

2. **Cleveland Clinic**，GLP-1 Agonists: What They Are, How They Work & Side Effects：
   https://my.clevelandclinic.org/health/treatments/13901-glp-1-agonists
   页面标注2023-07-03更新、医学审阅；HTTP200全文已读，保存在raw/clinic.html、raw/clinic.txt。借鉴解释顺序：先身体天然信号，再药物模仿信号，再胃/胰腺/大脑的结果，最后讲生活方式与治疗共同管理。未抄写其原句，也不采用该旧页作为2026药物批准清单。

3. **Lasker Foundation，2024官方获奖故事**：
   https://laskerfoundation.org/winners/glp-1-based-therapy-for-obesity/
   本轮重新阅读既有全文research/verified_raw/lasker2024.html，包括Hooking a new hormone、Getting to the crux、Fatty acids等段。叙事启发是“遇到问题—做实验—结果改变下一步”：比较肽段、检验胰腺反应、克服短半衰期。V2独立写成中文动作，不连报人名和论文标题，不使用其简化的双受体药物表述。

4. **Müller et al., 2019，GLP-1综述**：
   https://doi.org/10.1016/j.molmet.2019.09.010
   Europe PMC全文XML已下载；定向阅读L细胞刺激-分泌、GLP-1R/cAMP/PKA/Epac、β细胞颗粒胞吐与Figure6图题。支持小泡胞吐、葡萄糖依赖性及信号通路示意。文件raw/muller2019.xml及raw/muller2019-excerpts.json。不声称通读所有疾病应用章节。

5. **Osinski et al., 2022，Enteroendocrine System and Gut Barrier in Metabolic Disorders**：
   https://doi.org/10.3390/ijms23073732
   Europe PMC全文XML已下载；定向阅读EEC形态、顶端微绒毛、基底极分泌小泡、L细胞肽分泌段。结合Müller2019向循环释放的描述，支撑g008朝间质/血管方向。文件raw/eec2022.xml及raw/eec2022-excerpts.json。不声称通读全部肠屏障机制。

## 搜索范围与未采用项

Google News RSS实际搜索GLP-1 Nobel及2024/2025开奖前时间窗，结果和时间戳保存在raw/google-news.html、raw/nobel2024rss.html、raw/nobel2025rss.html。2024结果含CNN“5 Nobel-worthy discoveries that haven’t won the prize”和Nature拉斯克报道；2025结果含AFP/Medical Xpress、CNN、The Scientist；这些旧年新闻只完成标题级检索，没有伪称读到全文，也没有作为新口播事实证据。

2026找到AFP的Phys.org和TBS转载，以及The Scientist预测文章。通过Google News公开跳转解析拿到原始发布者URL（resolve-log.json）。TBS全文HTTP200，因此用它作为新闻主证据。Phys.org直接访问403；The Scientist2026原文403；RFI尝试403。它们没有被当作已阅读全文来源。

普通Google页面仅返回JS跳转壳；Bing相关查询得到明显无关结果；Yahoo500；DuckDuckGo超时。失败保留在search-log.json、search-alt-log.json、search-more-log.json、retrieval-1.json、retrieval-2.json、retrieval-3.json，不将不可读搜索结果用于改写。

Europe PMC按L细胞basolateral secretion、GLP-1 insulin granule exocytosis及经典时间窗检索。检索返回的一批新文章没有阅读和引用；最终采用已阅读全文相关段落的Müller2019与Osinski2022，元数据及原文均保存。

## 独立改写的取舍

- 新闻只出现开头一次；“未获奖”仅g002一句，不讨论保密五十年或推测评委原因。
- 从餐桌疑问进入身体，使用“消息、接收、剪刀、暂时搭上白蛋白”这些可画出来的动作。
- 受体锁钥明确属于比喻；科学边界放在focus和evidence中，避免给画面不存在的手部动作配音。
- g014–015以1987原始实验动作讲发现，不连续堆叠名字。
- 药物统计保留人群、对照和随访时间；完整剂量/BMI/终点留在文档，绝对差用每百人来理解。
- 停药随访保留“生活方式支持也结束”条件；结尾回到日常管理、几十年实验接力，再回餐桌。
- 48句保留，正文1602字符/1436汉字。为总长300–320秒优先保持可听懂的短句，未机械地把每句补到40–65字。
