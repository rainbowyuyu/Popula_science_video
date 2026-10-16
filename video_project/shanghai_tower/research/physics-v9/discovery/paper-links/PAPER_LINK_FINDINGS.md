# 上海中心原作者 OpenSees 输入 · 定向论文附件核验

核验日期：2026-10-09。结论：**这批新论文线索没有取得上海中心专属、可运行的原作者输入文件。** 论文确实记录了 53,006 节点、48,774 纤维梁和 39,315 多层壳，但公开模型链接指向另一座 TBI Building 2N。不能用全文可访问、作者讲义出现上海中心或通用 OpenSees 软件开源，推断上海中心输入已公开。

## 本次新增的明确证据

| 线索 | 实际检查结果 | 对原模型可用性的意义 |
| --- | --- | --- |
| [2014 ASCE 会议论文](https://itc.scix.net/pdfs/w78-2014-paper-148.pdf) | 成功下载完整 8 页 PDF；第 6 页明确上海中心 632 m、53,006 节点、48,774 纤维梁、39,315 多层壳；文中称 124 层。无 PDF 嵌入附件、无下载链接注释。 | 证明该研究模型存在；未给出专属输入包。 |
| [2015 GPU-OpenSees 作者全文页](http://www.luxinzheng.net/publication6/GPU-OpenSees_ASCE_Workshop_2015.htm) | 全文可访问；“model is freely assessable (Lu, 2014c)” 位于 TBI2N 段。文末 Lu 2014c 指向 OpenSeesTallBuildings.zip。随后上海中心单独一段给出目标节点/单元数。正文局部出现 H=623 m，与摘要 632 m 冲突。 | 不应把前一模型的免费下载声明套在后一上海中心模型上；623 m 不作为可信建筑高度采用。 |
| [Griffith 2015 论文全文](https://research-repository.griffith.edu.au/bitstreams/8a035e17-ed40-5149-8967-65ac69a386af/download) | 完整 41 页 PDF。PDF 第 26 页（正文页码 25）Fig.10 标题为 Building 2N，8,469 节点、9,744 纤维梁、4,704 多层壳；同段写 “The OpenSees model is freely assessable [42]”。参考文献 [42] 为 OpenSeesTHU.zip。PDF 第 32 页（正文31）上海中心才给出 53,006/48,774/39,315，以及 81 个 H 纤维截面、148 个壳截面。 | 明确锁定免费附件为 Building 2N，与上海中心不是同一输入模型。已渲染并目视核对这两页。 |
| Griffith 仓储实际附件目录 | DSpace items/bundles API 返回 ORIGINAL、TEXT、THUMBNAIL 三个 bundle。ORIGINAL 的 bitstreams API 明确 totalElements=1，仅 GuanPUB1437.pdf，UUID 为 8a035e17-ed40-5149-8967-65ac69a386af。 | 此仓储记录内没有另附 Tcl、ZIP 或模型数据文件。 |
| [2013 作者 workshop 讲义](http://www.luxinzheng.net/download/OpenSees_Workshop/LuXinzheng.pdf) | 完整 12 页、每页四张横转幻灯片。PDF 第 10 页显示 Shanghai Tower 632 m、121 层及目标节点/单元规模。该 PDF 无嵌入附件；可见的模型下载地址仍为 OpenSeesTHU.zip。 | 121 层来自讲义版本，2014/2015 正文写124层。节点/单元数相同；不把层数差异静默合并为独立精确版本。 |

已获得的论文是 Lu et al. (2015), *A shear wall element for nonlinear seismic analysis of super-tall buildings using OpenSees*, DOI [10.1016/j.finel.2015.01.006](https://doi.org/10.1016/j.finel.2015.01.006)。PDF 的 geometry 示意、动力结果和元素计数不能还原全部节点、连接、分层材料、截面与载荷输入。

## 重复附件的处理

本次发现直链时，两份下载请求已经发出；随后收到主线程已有 v8 审计的信息。未重新解析或执行它们，先以 SHA256 与既存文件逐字节身份核对，再移除本目录内完全相同的两份副本，释放 10,091,182 字节。原文件和原审计均保留：

- OpenSeesTallBuildings.zip：SHA256 `4a6262d89c016c20acde277c55f2280d63b9ff21a7da2c21ac5270d80b99ee24`，保留 `research/physics-v8/recompute/discovery/lu-tallbuilding-examples.zip`。原审计为 TBI2A/TBI2N。
- OpenSeesTHU.zip：SHA256 `e784907ace6c71a9291c2347439c230f7f29474d3f4addb4cb761eabec2fb3ea`，保留 `research/physics-v8/recompute/discovery/lu-openseesthu.zip`。原审计为 8,469 节点、135.7 m 输入模型。

身份计数引用原审计 `research/physics-v8/recompute/discovery/SOURCE_FINDINGS.md` 及其 Tcl 统计，未作新的大规模重复解析。此工作没有下载、采用或冒充 606 m benchmark。

## Pan et al. 2020 线索

Crossref 已核准：Yuxin Pan, Carlos E. Ventura, Haibei Xiong, Feng-Liang Zhang, *Model updating and seismic response of a super tall building in Shanghai*, DOI [10.1016/j.compstruc.2020.106285](https://doi.org/10.1016/j.compstruc.2020.106285)，PII S0045794920300882。

出版社页面本次返回 HTTP 403，保存的是错误页，**不称为已读全文或已检查补充文件**。OpenAlex 记录为 closed，best_oa_location=null，唯一另一个定位为 HKUST 仓储记录，无 pdf_url。HKUST 实际访问重定向到 captcha；未绕过验证码，也未因此断言该站不存在全文或附件。没有获得足够证据确认这篇的具体建筑身份、模型版本或可下载输入，故不把它当成目标原模型的已验证来源。

GPU 页另引 DOI 10.4231/D3DZ03252，文献题名为 *Seismic design of a super-tall reinforced concrete frame-core tube building in China and USA*，不是上海中心标题。本次 DOI 解析到旧 nees.org/resources/11461 后 TLS 失败；不将连接失败计作无数据的证据，不开展无依据的附件路径猜测。

## 可复核记录与停止点

- `retrieval-initial.json`、`followup-targets-retrieval.json`、`final-targets-retrieval.json`、`repository-targets-retrieval.json`：URL、返回状态、时间、SHA256、链接及原文上下文。
- `griffith-lu2015-bundles.raw` 与 `griffith-lu2015-original-bitstreams.raw`：仓储附件枚举原始响应。
- `relevant-pages.json`、`*-page-*.png`：相关全文页与目视检查截图。
- `deduplicated-downloads.json`：副本删除与保留路径的明确记录。

这次定向追踪已到达可访问论文的真实附件目录。当前缺少的是目标楼可核验的节点/单元/截面/材料/连接/约束/加载输入，而非缺少论文证明。应明确报告**原作者精细输入尚未取得**；不能通过改名其他楼模型或缩放等效模型补足身份。未联系作者，未绕过访问限制，未修改 src、生产物理数据或当前视频。
