# 高血压视频 V4 当前制作状态

用户目标：持续运镜与器官细节特写，主动脉/小动脉清楚区分，压强产生可视化，LDL 来源动画更完整，删除 AI 式反复对比口播。

当前已完成渲染、编码检查与交付更新。最终时间线为 53 句、9671 帧、322.366667 秒、1080p/30 fps；片尾 12 秒。最终源哈希见 `final-source-hashes-v4.json`。

已实现并核查：

- `CameraPath.ts`：同一人体坐标系内的 60 个真实口播时间锚点、五次平滑插值、对数推进、贯穿全片的细微轨道运动。
- `World.ts`：测压开场保留；心脏排血时收缩；主动脉弹性层与径向受力箭头；肝脏从原 human-atlas 追加；进入细节前让大体结构半透明，避免不透明穿镜。
- `VascularDetail.ts`：独立小动脉分支、平滑肌、分层剖切；颗粒流动相位按截面积预积分，保持示意流量；中心最大缩径 30%。
- LDL：VLDL 释放、卸载甘油三酯、IDL/LDL、部分 IDL 回肝、肝受体结合/内吞；之后内膜滞留、泡沫细胞/斑块、破裂与血栓。
- 原个人音色及本集《脉流之间》保留，18+4 条口播修订，53 条 ASR 全部通过，未做完整人工听审。
- 全项目 TypeScript、全帧镜头数值审核、实际小动脉动效短片顺序抽帧通过；最终 9671 帧版关键流动窗口 132978 次非循环位移无倒流；同流量静态三工况最大离散误差 0.54%。

完整渲染命令记录：

```powershell
node scripts/render_hypertension.mjs --concurrency=4 > research/hypertension/final-render-v4.log 2>&1
```

输出 `output/hypertension/hypertension_1080p.mp4` 已通过检查并复制至 `delivery/hypertension/hypertension_1080p.mp4`。两份 MP4 的 SHA-256 均为 `1cd06abc1b56bb4a2ed589e867a8be84c44656970d42bdaff71e92d03d3eeed8`。

交付验收：

1. 完整渲染成功，覆盖 0–9670 帧。
2. 当前成片完整解码通过，无持续至少 0.5 秒的黑帧区间；AAC 响度 -15.52 LUFS，真峰值 -1.44 dBTP。
3. 已检查当前编码的 124 张抽帧，包括概览、章界和细节推进接触表；独立审核确认小动脉进出、LDL 底座退场及测量/片尾交接未发现新阻塞。
4. 抽帧视觉验收标为通过。未进行完整人工实时观看或完整人工听审，对应标记保持 false。
5. `python scripts/hypertension/finalize_delivery_v4.py` 已成功核对 8 个冻结源文件哈希，更新成片、字幕、报告、接触表及 `DELIVERY.json`。

不要重新渲染已通过的设计以追求轻微构图变化；不要在完整渲染过程中修改 src/public。上次旧缓存批量删除被自动审批拒绝，当前不重试该删除。
