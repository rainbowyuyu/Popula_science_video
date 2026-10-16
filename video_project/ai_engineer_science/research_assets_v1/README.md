# AI Engineer 科研视频证据资产 v1

本目录从 `D:\python_project\beso_ai` 只读复制，原始文件未改动。渲染优先使用 `evidence_manifest.json` 的 `render_recipe`。

## 可直接讲的真实事实

- seed 17 / 20 MW BESO-CalculiX run：44 个迭代，最终迭代 43；保留质量比 0.2499896（目标 0.25）；16,795 个节点、86,207 个单元，最终活跃单元 21,281。独立 solid-only CalculiX 校核通过。
- 该 BESO 工况施加顶面中心向下合力 21,373,917.98 N，并用平衡节点力偶施加 Mx=102,808,568.62 N·m；力/矩误差远低于记录容差。它是研究等效静力工况，不是认证载荷结论。
- Zwind/OpenSees v7 native record：20 MW、seed 17、dt=0.01 s、120 s、12,000 步；Aero/Hydro/Mooring 有效，Servo=false，review_required。旁白要说“真实 native probe”，不要说“完整耦合通过”。
- 论文 Fig.2 数据、Reviewer统计、论文图均已按文件哈希收录。

## 片尾建议

`BESO + CalculiX → 参数升尺度 → Zwind（Z 风）/ OpenSees → Reviewer`；角标使用浙江大学校徽。

## 术语读音

Zwind：旁白读“Z 风”（Z-wind）；图强号：读“图-强-号”（tú qiáng hào）；BESO：双向渐进结构优化。

## 证据边界

- 论文中 Zwind 版本表述有 2.5 与 3.0 两处；未固定版本时片中只说 Zwind。
- native v7 的 ServoDyn 被禁用，inverse bridge 被 blocked。
- `flagship_20MW_run/README.md` 仍为 placeholder；论文 AIP/S=91是论文叙述，不是本目录新跑出的AIP。
- Qwen 画面可用于转场与视觉质感，不能代替求解器数据。
