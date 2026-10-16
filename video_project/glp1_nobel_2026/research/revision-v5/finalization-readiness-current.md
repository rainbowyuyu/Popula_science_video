# 当前V5收尾准备记录

记录日期：2026-10-09。此文件是准备说明，不是最终成片验收。没有运行 `finalize_v5.py`、`package_delivery_v5.py` 或任何清理执行模式。

当前锁定时间线为25621帧、30 fps，即854.033333333秒；展示时长应为 **14分14.033秒**。口播仍为89句，参考资料尾段为12秒。

`scripts/finalize_v5.py` 原先仅替换“待正式成片检查后回填”这一初始句，重复收尾时会留下来源文档开头的旧时长。现在 `update_source_duration()` 对唯一的“口播为…句；本集实际时长…”或“口播为…句；最终片长…”摘要行统一更新；缺失或重复摘要行会报错，避免静默生成混合版本的文档。

已完成 `python -m py_compile scripts/finalize_v5.py`，并只导入模块检查纯函数：初始待回填句、上一版14分14.267秒、重复运行、缺失摘要行、重复摘要行。没有调用 `main()`，没有写入delivery目录，也没有制造QA结论。

## 已发现的旧记录

- `delivery/制作与来源-v5.md`：开头摘要与末尾检查章节仍为14分14.267秒、25628帧，视频SHA为`cc95ffcaa786c33c9a791bbc6b80f6271be7a92219eeafd06c1f6e403c546a24`。
- `delivery/交付复现-v5.md`：时长、帧数与输入哈希属于同一旧成片。
- `delivery/发布文案-v5.md`和`delivery/解说稿-v5.md`：显示时长仍为14分14.267秒。
- `research/revision-v5/finalization.json`及`publishing-package.json`：仍绑定上述旧视频和25628帧。
- `research/qa/final-v5/visual-review.json`：仍绑定旧视频SHA；不能拿它通过当前或下一次最终视频的收尾门槛。
- 本次检查时的基础成片SHA为`e9521723e1eacac9326799ceae55f076fddb22c840b3115f4debd531357fa6e4`。它的编码抽样记录是`research/qa/final-v5/base-unaffected-review.json`，不是修改后最终成片的视觉验收。

## 最终QA之后由脚本重新生成的内容

| 入口 | 输出 | 更新方式 |
| --- | --- | --- |
| `finalize_v5.py` | `delivery/制作与来源-v5.md` | 更新开头时长摘要，重写最终检查章节、视频/时间线/母带/论文页哈希与章节 |
| `finalize_v5.py` | `delivery/解说稿-v5.md` | 按冻结原文与实测时间线完整生成，不改写口播 |
| `finalize_v5.py` | `delivery/GLP1_V5.srt` | 从当前caption帧区间重新生成字幕时间码 |
| `finalize_v5.py` | `delivery/发布文案-v5.md` | 更新受管理的时长和章节区块，保留各平台正文 |
| `finalize_v5.py` | `delivery/章节-v5.txt`、`delivery/GLP1_V5-chapters.ffmetadata` | 从chapter字段和最终片尾起点生成 |
| `finalize_v5.py` | `delivery/交付复现-v5.md` | 更新实际时长、帧数、输入哈希与真实审看范围 |
| `finalize_v5.py` | `research/revision-v5/finalization.json` | 记录上述七个交付文件的SHA及输入锁 |
| `package_delivery_v5.py` | `delivery/科学减重与三高-封面文案.zip`、`research/revision-v5/publishing-package.json` | 打包四张现有封面、发布文案、解说稿、制作与来源、标准SRT共八项，并核对CRC/SHA |

`README-v5.md`不含硬编码时长，由它指向来源文档读取当前测量即可。`delivery/GLP1-v5.srt`、`GLP1-v5-subtitles.srt`、`GLP1-v5-解说稿.md`属于既有音频安装/工作文件，收尾脚本不覆盖或清理它们。封面源文件、模型、配音、研究证据与所有论文素材保持保留。

## 收尾顺序

1. 修改结束后记录源码状态，保留一份基础成片回退；`render.mjs`会覆盖指定输出，本身没有自动MP4备份。
2. 完整渲染新视频，核对`tmp/final-render.json`中的视频、时间线和母带SHA。成片仍须使用锁定的25621帧时间线。
3. 重新运行最终编码QA、相邻帧筛查、指定转场抽样和实际视觉复查；新`visual-review.json`须绑定实际新视频。历史审看范围不能复制成新视频已经看过。
4. 在自动QA与真实抽样审查均满足脚本门槛后，运行`python scripts/finalize_v5.py`，再运行`python scripts/package_delivery_v5.py`。
5. 再查七个文档输出和ZIP中的旧时长、旧帧数与旧哈希是否已清除，核对ZIP仅有预期八项。
6. 所有生产/QA任务停止后才考虑执行独立缓存清理计划。不能直接沿用旧清理记录中的字节数或旧音频退役白名单。

未记录全长主观观看或全长听审的情况下，收尾文档必须继续准确保留这一范围限制。
