# 上海中心原始有限元模型检索：身份与取得状态

核查日期：2026-10-09。范围：公开作者页面、代码仓库、论文元数据、数据仓库及公开附件页面的只读检索。没有注册账户、购买附件、联系作者或绕过登录。

## 当前结论

**尚未取得并验证上海中心原始有限元输入。** 已取得的 606.1 m 基准模型和此前教学衍生模型，均不能替代用户要求的上海中心原始模型。文件网页的名称也不足以证明模型身份。

## 用户给定目录：身份已排除

`C:/Users/zju/Downloads/Model1/Model1` 的 10 个文件全部与作者公开包 `OpenSees_Model/Model1/` 逐字节一致，节点坐标顶高为 606.1 m，27,220 节点、50,350 单元。属于 Mega-Tall Building Benchmark Model，并非 632 m 上海中心原始模型。

检查没有复制该目录，没有执行 Tcl、DLL 或可执行程序。完整证据：

- `local-model-audit/audit.json`：每文件 SHA-256、与作者包一致性、网格统计。
- `local-model-audit/README.md`：身份判定与执行边界。
- 审计程序：`scripts/physics/v9/audit_user_model.py`。

128 个刚性楼板组与 128 个记录节点属于该模型定义，不能未经核查当作建筑实际楼层数。

## 目前最具体的真实文件候选

| 来源 | 页面明确给出的信息 | 取得条件与核查状态 |
|---|---|---|
| 土木在线，2013-02-01 帖子 | 标题“上海中心 ETABS 模型”；`7de1922b76fe33023854.rar`；4.9 MB；附件 ID 4598360 | 页面下载状态接口返回 `code: 4011`、`msg: 请先登录`、`data: null`。尚未取得文件；没有公开无登录下载链接。无法确认具体 ETABS 版本、模型尺寸、设计来源及是否含 E2K。 |
| 建虎网 | 标题“上海中心 ETABS 模型”；4.92 MB；RAR | 下载页明确写“免费注册后点击上方下载按钮”，并有登录检查。尚未取得；网页没有给出可核实的设计作者或原始模型身份。 |

链接：

- 土木在线：<https://bbs.co188.com/thread-8573318-1-1.html>
- 建虎网：<http://www.jianhuw.com/Jiegou/tuzhi/511851.html>
- 建虎下载信息页：<http://www.jianhuw.com/plus/download.php?open=0&aid=511851&cid=3>

两者大小近似，可能是同一附件的再分发。**不能将它们算作两个独立身份验证来源。** 也不能把站点通用的 VIP、下载券菜单当作该附件的实际售价；未登录时没有取得此文件专属的价格/额度信息。

如果用户自行合法取得这份候选，下一步先做静态审计：归档清单、格式/版本、单位、楼层/高度、坐标范围、墙/柱/伸臂体系、材料与截面、荷载与工况、作者/工程名称。若仅有 EDB 二进制，需可用且受支持的 ETABS 导出 E2K/表格，再评估语义转换；不能将 ETABS 附件称为已经取得的原始 OpenSees 输入，也不能静默替换材料。

## 作者及公开仓库检索边界

- 作者 `OpenSees_Examples/Mega-tall-Building` 指向明确命名的 benchmark 说明 PDF 与 `OpenSees_Model`，不是发现了一份新的上海中心模型。
- 作者 `wechat-archive` 根目录有 827 项。已读取根树项名称，上海关键词仅有青浦地震文章；超高层直接模型条目为 500 m 简化模型和 606 m OpenSees 基准。没有发现命名为上海中心的原始 FE 输入条目。这不能证明整个仓库深层内容不存在相关材料。
- 作者上海中心倒塌/壳单元论文页面证实研究对象，但已读取的页面未提供可验证的上海中心原输入包。
- 已读取 Crossref、DataCite、Zenodo、Harvard Dataverse、GitHub/Gitee 相关检索。Zenodo 的 Shanghai Tower IRF/HVSR 是监测信号，非 FE 模型；公开展示网格、SketchUp 模型也不是结构求解输入。
- 部分搜索引擎返回无关结果或验证页面，不能视作“模型不存在”的证据。Sogou 最后两项查询返回反爬页后没有继续绕过或重试。
- W78、GPU 原文附件、Griffith 以及 Y. Pan 2020 由另一个协作代理负责，本记录不重复宣称其结果。

作者仓库链接：

- <https://github.com/luxinzheng/OpenSees_Examples/tree/master/Mega-tall-Building>
- <https://github.com/luxinzheng/wechat-archive>

## 本轮证据文件

所有公开页面原文与检索元数据位于 `discovery/`：

- `jianhuw-shanghai-etabs.raw` / `jianhuw-shanghai-etabs-gbk.txt`
- `jianhuw-etabs-download-page.raw` / `jianhuw-etabs-download-page-gbk.txt`
- `co188-shanghai-etabs.raw` / `.txt` / `.links.json`
- `co188-etabs-retrieval.json`
- `co188-post-list-public-js.raw`：公开下载方法的权限处理，仅做静态阅读。
- `co188-etabs-download-status.raw` / `co188-etabs-download-status-gbk.json`
- `co188-etabs-status-retrieval.json`
- `etabs-retrieval.json`、`etabs-public-alternatives-retrieval.json`、`fe-public-alternatives-retrieval.json`
- `github-author-megatall.raw`、`github-author-wechat.raw`、`author-wechat-candidate-names.json`

旧版数字模型、已算出的教学结构截面工况、PSUMAT 兼容性探查均与此原始模型检索隔离。没有把未验证候选接入视频、风载、TMD 或节点受力计算，没有更改 `src/`、`public/` 或 `audio/`。
