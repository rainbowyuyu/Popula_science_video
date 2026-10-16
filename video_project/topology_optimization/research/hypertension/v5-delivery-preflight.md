# V5 交付流水线预检

检查日期：2026-10-07。独立只读核对；完整 V5 渲染正在进行。没有重新解码旧成片，也没有将 V4 指标视为 V5 验收。

## 结论

当前冻结源与预渲染证据一致，未发现会阻塞最终交付的文件缺失或哈希错误。最终编码、抽帧与响度检查完成之前，不能运行交付步骤或宣布 V5 完成。此时 `delivery/hypertension/DELIVERY.json` 仍为 `vascular-continuous-v4-20261007`，属于预期状态。

## 已核对

- 发布命令必须显式传入两个参数：`python scripts/hypertension/finalize_delivery_v4.py --version v5 --revision vascular-spatial-v5`。脚本名保留 v4，但参数支持 v5；不传 `--revision` 会继续使用 V4 默认值。
- `final-source-hashes-v5.json` 的 17 项逐一计算 SHA256，全部与当前文件一致。`src` 与 `public` 的 timeline 哈希相同，为 `5487802be3ce7d7c4e672ef7d38d698a36416c54bbc1f9f1134cc4e9df191640`。
- 时间线为 53 句、9671 帧、30 fps，即 322.366667 秒；音频 QA 为 passed，待复核 ASR ID 列表为空。V5 未改变音轨或时间线。
- `spatial-v5-qa.json`、`camera-flow-audit.json`、`arteriole-flow-direction-qa.json`、`arteriole-constant-flow-qa.json` 全部 passed，各报告内 6/5/4/4 项 sourceHashes 均匹配当前文件。相机审核覆盖 9671 帧、70 个节点。
- `arteriole-v5-geometry-qa.json` 为 passed；其自身不含 sourceHashes，不将该文件单独视为冻结源码证明。
- finalizer 的全部固定复制源文件存在，包括 V5 空间、几何、镜头设计、独立审查、肾单位来源、分支桥接报告及目标接触表。当前编码接触表和响度文件仍是 V4 产物，存在不代表已更新。
- `v5-motion-qa.json` 中两个实际 MP4 均存在且哈希吻合：2850–3030 帧共 181 帧，6940–7140 帧共 201 帧。记录为完整解码通过、28 张顺序抽帧检查通过；仅据该记录核对交付链，没有重复进行本次动态视觉审看。

## 最终复制前仍需完成

1. 等完整 V5 render 成功，让 `final-render.json` 与 `final-render-v5.log` 成为本次运行结果。预检时 `final-render.json` 的 success 来自前次 V4，不能据此判定当前运行结束。
2. 执行 `inspect_export.py --revision vascular-spatial-v5`，从新版 MP4 重建编码检查、响度和接触表。预检时 encoded QA 的 revision 仍为 `vascular-continuous-v4`；finalizer 的精确 revision 断言会正确拒绝过早发布。
3. 根据新版实际编码图像填写以 `passed` 起始的 visualInspection 后再发布。最终哈希、文件大小、实际音频长度、LUFS、真峰值与抽样数量由此轮结果写入，不能沿用旧数值。
4. 发布后核对交付 MP4 与 output MP4 的哈希相同。脚本已包含这一项断言。

## 非阻断的交付完善建议

- finalizer 的 V5 copies 当前未包含 `v5-motion-qa.json`。建议最终另行复制该报告到 delivery，使 `camera-v5-review.md` 所引用的短片证据文件在交付目录内可取得；必要时连同本预检一起保留。
- `v5-independent-findings.md` 是迭代历史，末尾仍记录第二轮问题；较新的 `camera-v5-review.md` 已逐项记录最终修复和当前预渲染通过。保留两份文件有审计价值，交付说明应以较新复核为当前状态，避免只读历史文件误以为修复未完成。
- finalizer 会将 `subjectiveListeningChecked`、`humanPronunciationReview`、`fullSpeedHumanPlayback` 写为 false，与本次证据范围相符。最终用户说明宜使用“编码检查与抽帧检查”，不能写成完整人工逐帧播放或逐句听审。

## README 核对

现有 V5 文案对肾单位包围盒校验、微观示意尺度、真实肾动脉来源与简化桥段、70 节点镜头、0D 求解边界、53 句时长及尚待最终成片验收的表述准确。没有把包围盒包含写成真实肾脏曲面完全包含，也没有宣称患者级 CFD。仅在文件表补充了 `v5-motion-qa.json` 的路径与证据范围；未修改源码、资产、渲染脚本或既有报告源。

根代理后续处理：finalizer 的 V5 copies 已补入 v5-motion-qa.json 与本预检报告；复制范围建议已落实。
