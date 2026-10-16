# 叙事与资料检索记录

检索日期：2026-10-08（Asia/Shanghai）；HTTP请求的UTC时间、URL、响应状态与文件校验值见本目录各 `*-log.json`。本次实际调用公开HTTP端点，未使用未挂载的学术搜索MCP。所有被标为verified的来源均有实际响应内容保存在 `verified_raw/`；原有 `raw/` 仅作为检索线索，未把现有文件自动视作重新核验成功。

## 开场与因果线

开场采用两个普通生活动作：吃饱后仍伸手拿点心、另一顿饭自然放下筷子。它们是解释问题的情境，不包装成真实患者或实验观察。由“饱”和“想吃”的差别进入身体，在约25秒附近点出当届诺奖背景，然后立即回到食物进入肠道后的生理问题。

全片沿一条连续空间路线推进：餐桌 → 胃肠道 → L细胞分泌 → 胰岛细胞受体 → 餐后血糖调节 → 肠脑轴和进食驱动 → 天然信号易降解 → 分子改造和长效制剂 → 随机对照证据 → 回到餐桌。论文页作为某个发现的实物证据短暂进入镜头，不承担整页讲课。

标题中的“诺奖落选”是大众议题钩子，片内必须解释其严格含义为“未获本届医学奖”；没有证据表明任何具体GLP-1研究者进入本届提名或决选。诺奖不承担本片的疗效背书，也不把另一获奖领域贬低成竞争失败者。

## 实际检索过程

| 检索目标 | 实际端点或查询 | 结果与取舍 |
|---|---|---|
| 2026诺奖背景 | NobelPrize.org `/prizes/medicine/2026/press-release/` | 200；2026-10-05公告为Deisseroth、Hegemann、Nagel的光门控离子通道与光遗传学发现。 |
| 能否说已提名落选 | NobelPrize.org `/nomination/medicine/` | 200；提名及评审信息50年保密，没有公开最后名单。 |
| GLP-1科学史和获奖 | Lasker Foundation `/winners/glp-1-based-therapy-for-obesity/` | 200；2024临床奖授予Habener、Mojsov、Knudsen，核实活性肽发现、长效药开发和食欲调节历史。 |
| 1987活性片段原始证据 | Europe PMC `EXT_ID:3543057`、`EXT_ID:3542566` | 两篇原始研究分别为Mojsov等的大鼠离体胰腺和Holst等的猪离体胰腺。 |
| 1987细胞信号原始证据 | Europe PMC `EXT_ID:3033647` | Drucker等，PNAS；cAMP、胰岛素mRNA和分泌；随后取得PMC原版扫描页。 |
| 分子结构 | RCSB PDB `5VAI`，Europe PMC `EXT_ID:28538729` | 2017冷冻电镜结构；4.10 Å；受体为兔源，配体为人源，不能误标纯人源结构。 |
| 司美格鲁肽分子设计 | Europe PMC `EXT_ID:26308095` | Lau等2015，J Med Chem；Aib8、Arg34、Lys26衍生化和白蛋白亲和。 |
| 天然信号/长效药区分 | Europe PMC `DOI:10.3389/fendo.2019.00155` 及 `PMC6474072/fullTextXML` | Knudsen与Lau2019全文明确天然GLP-1静脉给药后约1.5分钟半衰期；出版社公开PDF已下载。 |
| 生理与作用机制 | Europe PMC标题检索 `Mechanisms of Action and Therapeutic Application of Glucagon-like Peptide-1`、`The physiology of glucagon-like peptide 1` | 选择Drucker2018和Holst2007；排除同名关键词命中的2025预印本。 |
| 食欲与胃排空 | Europe PMC标题检索 `The effect of semaglutide 2.4 mg once weekly on energy intake` | Friedrichsen等2021，72人20周随机试验；食欲和能量摄入改变，在该时间点未见间接胃排空延迟证据。 |
| STEP 1 | Europe PMC `EXT_ID:33567185` | 1961人、68周、2.4 mg/周、两组生活方式干预；均值−14.9%和−2.4%。 |
| SELECT | Europe PMC `EXT_ID:37952131` | 17604名特定高风险成年人；平均39.8个月；事件6.5%/8.0%；HR0.80。 |
| 停药随访 | Europe PMC `EXT_ID:35441470` 及 `PMC9542252/fullTextXML` | 327人延伸子集；第68周停药且结束研究生活方式干预；一年后平均恢复此前减重约2/3。 |
| 双激动剂分类 | 初次标题检索后改为 Europe PMC `EXT_ID:35658024` | 初次同名命中读者来信；最终只用Jastreboff等2022原始试验支持GIP/GLP-1双受体分类。 |
| 说明书 | Novo Nordisk `https://www.novo-pi.com/wegovy.pdf` | 200且PDF格式有效；核查第11、12.2、12.3节，人体半衰期约1周、食欲/能量摄入和葡萄糖依赖性。 |
| FDA新闻稿 | FDA新闻原链接 | 返回404/abuse-detection；明确排除，未使用失败响应支撑任何事实。 |

## 下载真实论文页的方法与结果

1. **Mojsov等1987**：通过JCI官方 `articles/view/112855/files/pdf`，重定向至其CloudFront原刊PDF；4页；首页第616页。首页直接渲染为 `public/papers/mojsov1987_page1.jpg`。
2. **Drucker等1987**：PNAS与Europe PMC的PDF入口返回403，PMC的PDF下载入口返回非PDF内容，因此未把这些响应伪称PDF。PMC正文页公开提供第3434–3438页原版扫描图，五张图片均成功请求并保存；第一页格式转换为 `drucker1987_page1.jpg`。`drucker1987_from_PMC_scans.pdf` 仅按顺序合并这五张真实原页，未重排文字、替换作者或生成虚假页面。
3. **停药随访2022**：通过OpenAlex DOI位置索引找到UCL Discovery公开仓储，读取仓储页的下载链接，成功取得已发表版本PDF（12页、约2 MB）。首页直接渲染为 `withdrawal2022_page1.jpg`；该PDF为early-view页码1–12，正式书目信息为24:1553–1564。
4. **药物发现综述2019**：Frontiers官方开放获取PDF成功下载并渲染，可供药物设计段备用；不冒充原始临床试验。

三张推荐片尾图已逐一视觉检查：论文题名、作者、期刊、年份/DOI与元数据对应，均为真实页。完整来源与格式说明见 `public/papers/manifest.json`。

## 叙事中保留的事实边界

- 肠道GLP-1、脑内GLP-1与长效药的作用路径不完全相同，动画画出多通路连接，不画成肠道分子全部直接穿过血脑屏障。
- 葡萄糖依赖的促胰岛素分泌不等于绝不发生低血糖；没有提供用药、剂量调整或自行注射指导。
- 药物对食欲、能量摄入、胃肠与代谢调节的影响随时间改变；不表现脂肪被分子瞬间击碎或溶解。
- 司美格鲁肽与替尔泊肽分开；STEP 1和SELECT的数据不能套给所有GLP-1相关药。
- SELECT的20%对应危险率比0.80，绝对原始事件比例差1.5个百分点；具体入组人群不可省略。
- 停药研究同时结束试验生活方式干预，且为327人的延伸分析，不支持所有人必然完全反弹。
- 1987实验是历史基础机制研究，不能把离体胰腺或细胞系画成人体疗效试验。
- 科学史为多人接力；口播提及某些研究者不是完整贡献者名单，也不替诺奖做优先权裁判。

最终逐句来源与限定条件见 `research/evidence.md` 和 `research/evidence.json`。口播已按导演后续自然语言修改同步核验，不覆盖正在配音的 `docs/story.json`。
