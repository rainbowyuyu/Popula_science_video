# V3 实际检索与故事取材记录

时间：2026-10-08T11:42:02.298483+00:00

采用 nature-academic-search 多来源检索流程。当前学术MCP工具未挂载，按其HTTP后备策略使用Europe PMC/PubMed记录、原出版者网页、PMC开放全文与RCSB。预检PubMed、Crossref、arXiv均可达；本轮实际查询主体为EuropePMC。没有把未调用的Crossref或Google结果记为已检索。

## 实际检索与读取

1. 在线重新请求AFP/The Business Standard，HTTP200；读到2026-10-05开奖前专家预测，仅作新闻引子。
2. JCI原出版者Mojsov1987网页HTTP200，阅读原摘要；Drucker1987与Lau2015读取原始摘要。没有宣称后两者阅读全文。
3. Mentlein1993、Deacon1995定向检索和原摘要，提取“抑制酶后片段不生成”因果比较。最初AUTH_LAST/年份约束查询未找到合适条目，放宽为作者+关键词后成功。
4. Knudsen/Lau2019开放全文，定向读Ala扫描、Aib、链长和连接臂筛选段，给药物设计增加取舍与实验过程。
5. Turton1996最初关键词返回综述，改精确DOI10.1038/379069a0后读到原摘要；只讲大鼠脑室与受体阻断实验。
6. Friedrichsen2021本轮重取原始摘要，确认72成人、20周、食欲与自由进食量下降及20周间接方法未见胃排空延迟。
7. Elrick1964、McIntyre1964仅核验书目，未取摘要/全文；明确区分McIntyre原文与同名Balsano来信。另实际读取Nauck1986等血糖IV对照摘要，作为g010精确匹配血糖的原始依据。
8. Huang2018全文读IEQ150μm与尺寸分布。Pisania2010全文读后发现其β体积估计借用鼠资料，因此未把其950–1000μm³作为人细胞精确尺寸。Rorsman2018全文读到13–18μm，追参考文献221为小鼠，故15μm明确标代表模型值。
9. Cabrera2006原始全文读人鼠胰岛细胞排列差异；OpenStax Biology2e原文读5–10nm膜厚。Glushkova膜厚研究获得全文并查看有关厚度段，但未提取β细胞专属厚度，因此不作为该模型5nm的直接依据。
10. 本轮重新下载5VAI，和已存源哈希一致；对所有ATOM逐链按已用保距旋转计算nm包围盒，结果在scale-measurements.json。
11. Lasker2024本轮在线403；复用此前本项目成功归档HTML，并重新阅读1964、1987与药物设计相关段落。未以403页面当成功全文。

## 通俗叙事的调整

保留吃饱仍想甜点的日常疑问，但让研究问题推动故事：口服与静脉的差别→短片段为什么有效→受体为什么关联食欲→怎样阻止失活并延长作用→临床究竟获得多少。没有虚构研究者对白或给定性实验添加数值。g043–46只作短方法回扣，删除重复四步骤总结。g031删除替尔泊肽支线，集中司美格鲁肽。

## 最终锁定

`docs/story-v3-draft.json`是唯一待接入候选；48ID与区间保持。`story-lock.json`保留哈希、1534汉字/1722总字符与约348秒比例预估。真实时长必须靠新配音测量；不得靠拉长静帧填满目标。

## 失败与替代

[
  {
    "id": "lasker2024",
    "status": 403,
    "error": null
  },
  {
    "id": "cabrera2006",
    "status": 500,
    "error": null
  },
  {
    "id": "pisania2010",
    "status": 500,
    "error": null
  },
  {
    "id": "rorsman2018",
    "status": 500,
    "error": null
  }
]

Pisania、Cabrera、Rorsman的EuropePMC XML返回500后，改从PMC HTML成功取得全文；失败响应仍保存以便审计。Lasker在线403采用已归档成功全文。首次读取技能workflow时使用错误短文件名，随后按manifest映射读取wf1-multi-source-search.md；此为本地路径修正，不是文献检索缺口。

全部查询/下载URL、时间、HTTP状态与文件SHA见search-log.json和retrieval-log.json。仅保存/处理公开网页和研究资料，没有发送消息给外部作者。
